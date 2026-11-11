package user

import (
	"context"
	"net/mail"
	"strings"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"

	"rawcraft-monitor/backend/internal/shared"
)

type Service struct {
	repo *Repository
}

func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

func (s *Service) Login(ctx context.Context, req LoginRequest) (*LoginResponse, error) {
	email := strings.TrimSpace(strings.ToLower(req.Email))
	if email == "" || len(req.Password) < 8 {
		return nil, ErrInvalidCredential
	}

	u, err := s.repo.GetByEmail(ctx, email)
	if err != nil {
		return nil, ErrInvalidCredential
	}
	if !u.IsActive {
		return nil, ErrInvalidCredential
	}

	if err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(req.Password)); err != nil {
		return nil, ErrInvalidCredential
	}

	token, err := shared.GenerateToken(u.ID, u.Email, u.Name, string(u.Role))
	if err != nil {
		return nil, err
	}

	return &LoginResponse{
		Token: token,
		User:  *u,
	}, nil
}

func (s *Service) GetByID(ctx context.Context, id uuid.UUID) (*User, error) {
	return s.repo.GetByID(ctx, id)
}

func (s *Service) List(ctx context.Context) ([]User, error) {
	return s.repo.List(ctx)
}

func (s *Service) Create(ctx context.Context, req CreateUserRequest) (*User, error) {
	name := strings.TrimSpace(req.Name)
	email := strings.TrimSpace(strings.ToLower(req.Email))
	if name == "" || email == "" || len(req.Password) < 8 {
		return nil, ErrInvalidOperation
	}
	if _, err := mail.ParseAddress(email); err != nil {
		return nil, ErrInvalidOperation
	}
	if req.Role != RoleAdmin && req.Role != RoleUser {
		return nil, ErrInvalidOperation
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}

	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	u := &User{
		ID:           uuid.New(),
		Name:         name,
		Email:        email,
		PasswordHash: string(hash),
		Role:         req.Role,
		IsActive:     isActive,
		ServerIDs:    []uuid.UUID{},
	}

	if err := s.repo.Create(ctx, u, req.ServerIDs); err != nil {
		return nil, err
	}
	return u, nil
}

func (s *Service) Update(ctx context.Context, actorID, targetID uuid.UUID, req UpdateUserRequest) (*User, error) {
	name := strings.TrimSpace(req.Name)
	email := strings.TrimSpace(strings.ToLower(req.Email))
	if name == "" || email == "" {
		return nil, ErrInvalidOperation
	}
	if _, err := mail.ParseAddress(email); err != nil {
		return nil, ErrInvalidOperation
	}
	if req.Role != RoleAdmin && req.Role != RoleUser {
		return nil, ErrInvalidOperation
	}

	// Un ADMIN no es pot desactivar ni treure el rol ADMIN a si mateix (HU-USR-03)
	if actorID == targetID && (!req.IsActive || req.Role != RoleAdmin) {
		return nil, ErrInvalidOperation
	}

	var newHash *string
	if strings.TrimSpace(req.Password) != "" {
		if len(req.Password) < 8 {
			return nil, ErrInvalidOperation
		}
		hashBytes, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			return nil, err
		}
		h := string(hashBytes)
		newHash = &h
	}

	u := &User{
		ID:       targetID,
		Name:     name,
		Email:    email,
		Role:     req.Role,
		IsActive: req.IsActive,
	}

	if err := s.repo.Update(ctx, u, newHash, req.ServerIDs); err != nil {
		return nil, err
	}
	return u, nil
}

func (s *Service) ChangeOwnPassword(ctx context.Context, userID uuid.UUID, req ChangePasswordRequest) error {
	if req.CurrentPassword == "" || len(req.NewPassword) < 8 {
		return ErrInvalidOperation
	}

	u, err := s.repo.GetByID(ctx, userID)
	if err != nil {
		return err
	}

	if err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(req.CurrentPassword)); err != nil {
		return ErrInvalidOperation
	}

	hashBytes, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	return s.repo.UpdatePassword(ctx, userID, string(hashBytes))
}

func (s *Service) Delete(ctx context.Context, actorID, targetID uuid.UUID, confirmed bool) error {
	if !confirmed || actorID == targetID {
		return ErrInvalidOperation
	}
	return s.repo.SoftDelete(ctx, targetID)
}

// GetAuthorizedServerIDs retorna els UUIDs dels servidors als quals l'usuari té accés.
func (s *Service) GetAuthorizedServerIDs(ctx context.Context, userID uuid.UUID, role string) ([]uuid.UUID, error) {
	return s.repo.GetUserServerIDs(ctx, userID, UserRole(role))
}

// CanAccessServer comprova si un usuari pot consultar el servidor indicat.
func (s *Service) CanAccessServer(ctx context.Context, userID uuid.UUID, role string, serverID uuid.UUID) (bool, error) {
	if UserRole(role) == RoleAdmin {
		return true, nil
	}
	ids, err := s.repo.GetUserServerIDs(ctx, userID, UserRole(role))
	if err != nil {
		return false, err
	}
	for _, id := range ids {
		if id == serverID {
			return true, nil
		}
	}
	return false, nil
}
