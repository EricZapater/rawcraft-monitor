package user

import (
	"time"

	"github.com/google/uuid"
)

type UserRole string

const (
	RoleAdmin UserRole = "ADMIN"
	RoleUser  UserRole = "USER"
)

// User representa l'esquema OpenAPI `User`.
type User struct {
	ID           uuid.UUID   `json:"id"`
	Name         string      `json:"name"`
	Email        string      `json:"email"`
	PasswordHash string      `json:"-"`
	Role         UserRole    `json:"role"`
	IsActive     bool        `json:"is_active"`
	ServerIDs    []uuid.UUID `json:"server_ids"`
	CreatedAt    time.Time   `json:"created_at"`
	UpdatedAt    time.Time   `json:"updated_at"`
	DeletedAt    *time.Time  `json:"-"`
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type LoginResponse struct {
	Token string `json:"token"`
	User  User   `json:"user"`
}

type ChangePasswordRequest struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

type CreateUserRequest struct {
	Name      string      `json:"name"`
	Email     string      `json:"email"`
	Password  string      `json:"password"`
	Role      UserRole    `json:"role"`
	IsActive  *bool       `json:"is_active,omitempty"`
	ServerIDs []uuid.UUID `json:"server_ids"`
}

type UpdateUserRequest struct {
	Name      string      `json:"name"`
	Email     string      `json:"email"`
	Password  string      `json:"password,omitempty"`
	Role      UserRole    `json:"role"`
	IsActive  bool        `json:"is_active"`
	ServerIDs []uuid.UUID `json:"server_ids"`
}
