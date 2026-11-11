package user

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrUserNotFound      = errors.New("usuari no trobat")
	ErrDuplicateEmail    = errors.New("ja existeix un usuari amb aquest email")
	ErrInvalidOperation  = errors.New("operació invàlida")
	ErrInvalidCredential = errors.New("credencials invàlides o compte inactiu")
)

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

func (r *Repository) GetByEmail(ctx context.Context, email string) (*User, error) {
	var u User
	err := r.pool.QueryRow(ctx, `
		SELECT id, name, email, password_hash, role, is_active, created_at, updated_at
		FROM users
		WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL
	`, strings.TrimSpace(email)).Scan(
		&u.ID, &u.Name, &u.Email, &u.PasswordHash, &u.Role, &u.IsActive, &u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, err
	}

	serverIDs, err := r.GetUserServerIDs(ctx, u.ID, u.Role)
	if err != nil {
		return nil, err
	}
	u.ServerIDs = serverIDs
	return &u, nil
}

func (r *Repository) GetByID(ctx context.Context, id uuid.UUID) (*User, error) {
	var u User
	err := r.pool.QueryRow(ctx, `
		SELECT id, name, email, password_hash, role, is_active, created_at, updated_at
		FROM users
		WHERE id = $1 AND deleted_at IS NULL
	`, id).Scan(
		&u.ID, &u.Name, &u.Email, &u.PasswordHash, &u.Role, &u.IsActive, &u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, err
	}

	serverIDs, err := r.GetUserServerIDs(ctx, u.ID, u.Role)
	if err != nil {
		return nil, err
	}
	u.ServerIDs = serverIDs
	return &u, nil
}

func (r *Repository) List(ctx context.Context) ([]User, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, name, email, password_hash, role, is_active, created_at, updated_at
		FROM users
		WHERE deleted_at IS NULL
		ORDER BY created_at ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	users := make([]User, 0)
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.ID, &u.Name, &u.Email, &u.PasswordHash, &u.Role, &u.IsActive, &u.CreatedAt, &u.UpdatedAt); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	for i := range users {
		ids, err := r.GetUserServerIDs(ctx, users[i].ID, users[i].Role)
		if err != nil {
			return nil, err
		}
		users[i].ServerIDs = ids
	}

	return users, nil
}

func (r *Repository) GetUserServerIDs(ctx context.Context, userID uuid.UUID, role UserRole) ([]uuid.UUID, error) {
	var rows pgx.Rows
	var err error
	if role == RoleAdmin {
		rows, err = r.pool.Query(ctx, `
			SELECT id FROM servers WHERE deleted_at IS NULL ORDER BY created_at ASC
		`)
	} else {
		rows, err = r.pool.Query(ctx, `
			SELECT us.server_id
			FROM user_servers us
			JOIN servers s ON s.id = us.server_id
			WHERE us.user_id = $1 AND s.deleted_at IS NULL
			ORDER BY s.created_at ASC
		`, userID)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	ids := make([]uuid.UUID, 0)
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func (r *Repository) Create(ctx context.Context, u *User, serverIDs []uuid.UUID) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var exists bool
	if err := tx.QueryRow(ctx, `
		SELECT EXISTS(SELECT 1 FROM users WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL)
	`, u.Email).Scan(&exists); err != nil {
		return err
	}
	if exists {
		return ErrDuplicateEmail
	}

	err = tx.QueryRow(ctx, `
		INSERT INTO users (id, name, email, password_hash, role, is_active, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
		RETURNING created_at, updated_at
	`, u.ID, u.Name, u.Email, u.PasswordHash, u.Role, u.IsActive).Scan(&u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		return err
	}

	for _, srvID := range serverIDs {
		_, err := tx.Exec(ctx, `
			INSERT INTO user_servers (user_id, server_id)
			SELECT $1, $2 WHERE EXISTS(SELECT 1 FROM servers WHERE id = $2 AND deleted_at IS NULL)
			ON CONFLICT DO NOTHING
		`, u.ID, srvID)
		if err != nil {
			return err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return err
	}

	assigned, err := r.GetUserServerIDs(ctx, u.ID, u.Role)
	if err != nil {
		return err
	}
	u.ServerIDs = assigned
	return nil
}

func (r *Repository) Update(ctx context.Context, u *User, newPasswordHash *string, serverIDs []uuid.UUID) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var exists bool
	if err := tx.QueryRow(ctx, `
		SELECT EXISTS(SELECT 1 FROM users WHERE LOWER(email) = LOWER($1) AND id <> $2 AND deleted_at IS NULL)
	`, u.Email, u.ID).Scan(&exists); err != nil {
		return err
	}
	if exists {
		return ErrDuplicateEmail
	}

	if newPasswordHash != nil {
		err = tx.QueryRow(ctx, `
			UPDATE users
			SET name = $1, email = $2, password_hash = $3, role = $4, is_active = $5, updated_at = NOW()
			WHERE id = $6 AND deleted_at IS NULL
			RETURNING created_at, updated_at
		`, u.Name, u.Email, *newPasswordHash, u.Role, u.IsActive, u.ID).Scan(&u.CreatedAt, &u.UpdatedAt)
	} else {
		err = tx.QueryRow(ctx, `
			UPDATE users
			SET name = $1, email = $2, role = $3, is_active = $4, updated_at = NOW()
			WHERE id = $5 AND deleted_at IS NULL
			RETURNING created_at, updated_at
		`, u.Name, u.Email, u.Role, u.IsActive, u.ID).Scan(&u.CreatedAt, &u.UpdatedAt)
	}
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrUserNotFound
		}
		return err
	}

	if _, err := tx.Exec(ctx, `DELETE FROM user_servers WHERE user_id = $1`, u.ID); err != nil {
		return err
	}
	for _, srvID := range serverIDs {
		_, err := tx.Exec(ctx, `
			INSERT INTO user_servers (user_id, server_id)
			SELECT $1, $2 WHERE EXISTS(SELECT 1 FROM servers WHERE id = $2 AND deleted_at IS NULL)
			ON CONFLICT DO NOTHING
		`, u.ID, srvID)
		if err != nil {
			return err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return err
	}

	assigned, err := r.GetUserServerIDs(ctx, u.ID, u.Role)
	if err != nil {
		return err
	}
	u.ServerIDs = assigned
	return nil
}

func (r *Repository) UpdatePassword(ctx context.Context, userID uuid.UUID, newHash string) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE users SET password_hash = $1, updated_at = NOW()
		WHERE id = $2 AND deleted_at IS NULL
	`, newHash, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrUserNotFound
	}
	return nil
}

func (r *Repository) SoftDelete(ctx context.Context, userID uuid.UUID) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE users
		SET is_active = FALSE, deleted_at = NOW(), updated_at = NOW()
		WHERE id = $1 AND deleted_at IS NULL
	`, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrUserNotFound
	}
	return nil
}
