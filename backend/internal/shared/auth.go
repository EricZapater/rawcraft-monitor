package shared

import (
	"context"
	"errors"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

const (
	ContextUserIDKey      = "user_id"
	ContextUserEmailKey   = "user_email"
	ContextUserNameKey    = "user_name"
	ContextUserRoleKey    = "user_role"
	ContextAgentServerKey = "agent_server_id"
)

// JWTClaims representa el payload del token JWT per als usuaris web.
type JWTClaims struct {
	UserID uuid.UUID `json:"user_id"`
	Email  string    `json:"email"`
	Name   string    `json:"name"`
	Role   string    `json:"role"`
	jwt.RegisteredClaims
}

// GetJWTSecret obté la clau de signatura JWT des de l'entorn.
func GetJWTSecret() string {
	if s := os.Getenv("JWT_SECRET"); s != "" {
		return s
	}
	return "rawcraft-monitor-dev-secret-change-in-prod"
}

// GenerateToken crea un nou token JWT signat amb HS256 (validesa 24h per defecte).
func GenerateToken(userID uuid.UUID, email, name, role string) (string, error) {
	now := time.Now()
	claims := JWTClaims{
		UserID: userID,
		Email:  email,
		Name:   name,
		Role:   role,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID.String(),
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(24 * time.Hour)),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(GetJWTSecret()))
}

// ParseToken valida i extreu els claims d'un token JWT.
func ParseToken(tokenStr string) (*JWTClaims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &JWTClaims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("mètode de signatura invàlid")
		}
		return []byte(GetJWTSecret()), nil
	})
	if err != nil {
		return nil, err
	}

	claims, ok := token.Claims.(*JWTClaims)
	if !ok || !token.Valid {
		return nil, errors.New("claims invàlids")
	}
	return claims, nil
}

// JWTAuthMiddleware verifica la capçalera Authorization: Bearer <token>.
func JWTAuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
			RespondError(c, http.StatusUnauthorized, "UNAUTHORIZED", "Token d'autenticació absent o mal format")
			return
		}

		tokenStr := strings.TrimSpace(strings.TrimPrefix(authHeader, "Bearer "))
		claims, err := ParseToken(tokenStr)
		if err != nil {
			RespondError(c, http.StatusUnauthorized, "UNAUTHORIZED", "Token invàlid o expirat")
			return
		}

		c.Set(ContextUserIDKey, claims.UserID)
		c.Set(ContextUserEmailKey, claims.Email)
		c.Set(ContextUserNameKey, claims.Name)
		c.Set(ContextUserRoleKey, claims.Role)
		c.Next()
	}
}

// RequireAdminMiddleware restringeix l'accés als usuaris amb rol ADMIN.
func RequireAdminMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		role, exists := c.Get(ContextUserRoleKey)
		if !exists || role != "ADMIN" {
			RespondError(c, http.StatusForbidden, "FORBIDDEN", "Aquesta acció requereix rol ADMIN")
			return
		}
		c.Next()
	}
}

// AgentKeyValidator és la funció que valida una X-Agent-Key i retorna el server_id associat.
type AgentKeyValidator func(ctx context.Context, apiKey string) (uuid.UUID, error)

// AgentAuthMiddleware autentica les peticions de `rawcraft-agent` via capçalera `X-Agent-Key`.
func AgentAuthMiddleware(validator AgentKeyValidator) gin.HandlerFunc {
	return func(c *gin.Context) {
		apiKey := strings.TrimSpace(c.GetHeader("X-Agent-Key"))
		if apiKey == "" {
			authHeader := c.GetHeader("Authorization")
			if strings.HasPrefix(authHeader, "Bearer ") {
				apiKey = strings.TrimSpace(strings.TrimPrefix(authHeader, "Bearer "))
			}
		}
		if apiKey == "" {
			RespondError(c, http.StatusUnauthorized, "INVALID_AGENT_KEY", "Falta la capçalera X-Agent-Key")
			return
		}

		serverID, err := validator(c.Request.Context(), apiKey)
		if err != nil {
			RespondError(c, http.StatusUnauthorized, "INVALID_AGENT_KEY", "API Key d'agent invàlida o revocada")
			return
		}

		c.Set(ContextAgentServerKey, serverID)
		c.Next()
	}
}

// GetAuthUserID retorna l'UUID de l'usuari autenticat al context de Gin.
func GetAuthUserID(c *gin.Context) (uuid.UUID, bool) {
	val, exists := c.Get(ContextUserIDKey)
	if !exists {
		return uuid.Nil, false
	}
	id, ok := val.(uuid.UUID)
	return id, ok
}

// GetAuthUserRole retorna el rol de l'usuari autenticat ("ADMIN" o "USER").
func GetAuthUserRole(c *gin.Context) string {
	val, exists := c.Get(ContextUserRoleKey)
	if !exists {
		return ""
	}
	role, _ := val.(string)
	return role
}

// GetAuthUserEmail retorna l'email de l'usuari autenticat.
func GetAuthUserEmail(c *gin.Context) string {
	val, exists := c.Get(ContextUserEmailKey)
	if !exists {
		return ""
	}
	email, _ := val.(string)
	return email
}
