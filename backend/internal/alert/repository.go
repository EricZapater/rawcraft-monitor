package alert

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrAlertNotFound = errors.New("alerta no trobada")
)

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

func scanAlert(row pgx.Row) (*Alert, error) {
	var a Alert
	err := row.Scan(
		&a.ID, &a.ServerID, &a.ServerName, &a.Fingerprint, &a.Status,
		&a.Category, &a.Severity, &a.TargetName, &a.Title, &a.Message,
		&a.CurrentValue, &a.ThresholdValue, &a.Acknowledged, &a.AcknowledgedBy,
		&a.AcknowledgedAt, &a.FiredAt, &a.ResolvedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrAlertNotFound
		}
		return nil, err
	}
	return &a, nil
}

func (r *Repository) GetByID(ctx context.Context, id uuid.UUID) (*Alert, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT a.id, a.server_id, COALESCE(s.name, '') AS server_name, a.fingerprint, a.status,
		       a.category, a.severity, a.target_name, a.title, a.message,
		       a.current_value, a.threshold_value, a.acknowledged, a.acknowledged_by,
		       a.acknowledged_at, a.fired_at, a.resolved_at
		FROM alerts a
		LEFT JOIN servers s ON s.id = a.server_id
		WHERE a.id = $1
	`, id)
	return scanAlert(row)
}

func (r *Repository) GetFiringByFingerprint(ctx context.Context, serverID uuid.UUID, fingerprint string) (*Alert, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT a.id, a.server_id, COALESCE(s.name, '') AS server_name, a.fingerprint, a.status,
		       a.category, a.severity, a.target_name, a.title, a.message,
		       a.current_value, a.threshold_value, a.acknowledged, a.acknowledged_by,
		       a.acknowledged_at, a.fired_at, a.resolved_at
		FROM alerts a
		LEFT JOIN servers s ON s.id = a.server_id
		WHERE a.server_id = $1 AND a.fingerprint = $2 AND a.status = 'FIRING'
		ORDER BY a.fired_at DESC
		LIMIT 1
	`, serverID, fingerprint)
	return scanAlert(row)
}

func (r *Repository) UpsertFiringAlert(ctx context.Context, req AgentAlertEventRequest, serverName string) (*Alert, bool, error) {
	existing, err := r.GetFiringByFingerprint(ctx, req.ServerID, req.Fingerprint)
	if err != nil && !errors.Is(err, ErrAlertNotFound) {
		return nil, false, err
	}

	occurred := req.OccurredAt
	if occurred.IsZero() {
		occurred = time.Now()
	}

	if existing != nil {
		_, err := r.pool.Exec(ctx, `
			UPDATE alerts
			SET severity = $1,
			    title = $2,
			    message = $3,
			    current_value = $4,
			    threshold_value = $5,
			    updated_at = NOW()
			WHERE id = $6
		`, req.Severity, req.Title, req.Message, req.CurrentValue, req.ThresholdValue, existing.ID)
		if err != nil {
			return nil, false, err
		}
		updated, err := r.GetByID(ctx, existing.ID)
		return updated, false, err
	}

	newID := uuid.New()
	_, err = r.pool.Exec(ctx, `
		INSERT INTO alerts (
			id, server_id, fingerprint, status, category, severity,
			target_name, title, message, current_value, threshold_value,
			acknowledged, fired_at, created_at, updated_at
		)
		VALUES ($1, $2, $3, 'FIRING', $4, $5, $6, $7, $8, $9, $10, FALSE, $11, NOW(), NOW())
	`, newID, req.ServerID, req.Fingerprint, req.Category, req.Severity,
		req.TargetName, req.Title, req.Message, req.CurrentValue, req.ThresholdValue, occurred)
	if err != nil {
		return nil, false, err
	}

	created, err := r.GetByID(ctx, newID)
	if err != nil {
		return nil, false, err
	}
	if created.ServerName == "" {
		created.ServerName = serverName
	}
	return created, true, nil
}

func (r *Repository) ResolveAlert(ctx context.Context, req AgentAlertEventRequest, serverName string) (*Alert, bool, error) {
	existing, err := r.GetFiringByFingerprint(ctx, req.ServerID, req.Fingerprint)
	if err != nil && !errors.Is(err, ErrAlertNotFound) {
		return nil, false, err
	}

	occurred := req.OccurredAt
	if occurred.IsZero() {
		occurred = time.Now()
	}

	if existing != nil {
		_, err := r.pool.Exec(ctx, `
			UPDATE alerts
			SET status = 'RESOLVED',
			    title = $1,
			    message = $2,
			    current_value = COALESCE($3, current_value),
			    resolved_at = $4,
			    updated_at = NOW()
			WHERE id = $5
		`, req.Title, req.Message, req.CurrentValue, occurred, existing.ID)
		if err != nil {
			return nil, false, err
		}
		resolved, err := r.GetByID(ctx, existing.ID)
		return resolved, true, err
	}

	newID := uuid.New()
	_, err = r.pool.Exec(ctx, `
		INSERT INTO alerts (
			id, server_id, fingerprint, status, category, severity,
			target_name, title, message, current_value, threshold_value,
			acknowledged, fired_at, resolved_at, created_at, updated_at
		)
		VALUES ($1, $2, $3, 'RESOLVED', $4, $5, $6, $7, $8, $9, $10, FALSE, $11, $11, NOW(), NOW())
	`, newID, req.ServerID, req.Fingerprint, req.Category, req.Severity,
		req.TargetName, req.Title, req.Message, req.CurrentValue, req.ThresholdValue, occurred)
	if err != nil {
		return nil, false, err
	}

	created, err := r.GetByID(ctx, newID)
	if err != nil {
		return nil, false, err
	}
	if created.ServerName == "" {
		created.ServerName = serverName
	}
	return created, false, nil
}

func (r *Repository) List(ctx context.Context, filter AlertFilter) ([]Alert, int, error) {
	if len(filter.ServerIDs) == 0 {
		return []Alert{}, 0, nil
	}

	var activeFiringCount int
	err := r.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM alerts
		WHERE server_id = ANY($1) AND status = 'FIRING'
	`, filter.ServerIDs).Scan(&activeFiringCount)
	if err != nil {
		return nil, 0, err
	}

	query := `
		SELECT a.id, a.server_id, COALESCE(s.name, '') AS server_name, a.fingerprint, a.status,
		       a.category, a.severity, a.target_name, a.title, a.message,
		       a.current_value, a.threshold_value, a.acknowledged, a.acknowledged_by,
		       a.acknowledged_at, a.fired_at, a.resolved_at
		FROM alerts a
		LEFT JOIN servers s ON s.id = a.server_id
		WHERE a.server_id = ANY($1)
	`
	args := []interface{}{filter.ServerIDs}
	argIdx := 2

	if filter.ServerID != nil {
		query += fmt.Sprintf(" AND a.server_id = $%d", argIdx)
		args = append(args, *filter.ServerID)
		argIdx++
	}
	if filter.Status != "" {
		query += fmt.Sprintf(" AND a.status = $%d", argIdx)
		args = append(args, filter.Status)
		argIdx++
	}
	if filter.Category != "" {
		query += fmt.Sprintf(" AND a.category = $%d", argIdx)
		args = append(args, filter.Category)
		argIdx++
	}
	if filter.Severity != "" {
		query += fmt.Sprintf(" AND a.severity = $%d", argIdx)
		args = append(args, filter.Severity)
		argIdx++
	}

	limit := filter.Limit
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	query += fmt.Sprintf(" ORDER BY CASE WHEN a.status = 'FIRING' THEN 0 ELSE 1 END, a.fired_at DESC LIMIT $%d", argIdx)
	args = append(args, limit)

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	items := make([]Alert, 0)
	for rows.Next() {
		var a Alert
		if err := rows.Scan(
			&a.ID, &a.ServerID, &a.ServerName, &a.Fingerprint, &a.Status,
			&a.Category, &a.Severity, &a.TargetName, &a.Title, &a.Message,
			&a.CurrentValue, &a.ThresholdValue, &a.Acknowledged, &a.AcknowledgedBy,
			&a.AcknowledgedAt, &a.FiredAt, &a.ResolvedAt,
		); err != nil {
			return nil, 0, err
		}
		items = append(items, a)
	}

	return items, activeFiringCount, rows.Err()
}

func (r *Repository) Acknowledge(ctx context.Context, id uuid.UUID, byEmail string) (*Alert, error) {
	tag, err := r.pool.Exec(ctx, `
		UPDATE alerts
		SET acknowledged = TRUE,
		    acknowledged_by = $1,
		    acknowledged_at = NOW(),
		    updated_at = NOW()
		WHERE id = $2
	`, byEmail, id)
	if err != nil {
		return nil, err
	}
	if tag.RowsAffected() == 0 {
		return nil, ErrAlertNotFound
	}
	return r.GetByID(ctx, id)
}

func (r *Repository) CountFiringByServer(ctx context.Context, serverID uuid.UUID) (int, error) {
	var count int
	err := r.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM alerts WHERE server_id = $1 AND status = 'FIRING'
	`, serverID).Scan(&count)
	return count, err
}

func (r *Repository) PurgeResolvedBefore(ctx context.Context, cutoff time.Time) (int64, error) {
	tag, err := r.pool.Exec(ctx, `
		DELETE FROM alerts WHERE status = 'RESOLVED' AND resolved_at < $1
	`, cutoff)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}
