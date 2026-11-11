package shared

import (
	"testing"

	"github.com/google/uuid"
)

func TestGenerateAndParseJWT(t *testing.T) {
	uid := uuid.New()
	token, err := GenerateToken(uid, "admin@rawcraft.local", "Admin", "ADMIN")
	if err != nil {
		t.Fatalf("error generant token JWT: %v", err)
	}

	claims, err := ParseToken(token)
	if err != nil {
		t.Fatalf("error validant token JWT: %v", err)
	}

	if claims.UserID != uid || claims.Role != "ADMIN" || claims.Email != "admin@rawcraft.local" {
		t.Errorf("claims inesperats: %+v", claims)
	}
}
