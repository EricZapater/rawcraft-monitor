package db

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

// Connect inicialitza el pool de connexions PostgreSQL amb pgxpool.
func Connect(ctx context.Context) (*pgxpool.Pool, error) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		host := getEnv("DB_HOST", "127.0.0.1")
		port := getEnv("DB_PORT", "5432")
		user := getEnv("DB_USER", "postgres")
		pass := getEnv("DB_PASSWORD", "postgres")
		name := getEnv("DB_NAME", "rawcraft_monitor")
		sslmode := getEnv("DB_SSLMODE", "disable")
		dsn = fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=%s", user, pass, host, port, name, sslmode)
	}

	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("error parsejant DATABASE_URL: %w", err)
	}
	cfg.MaxConns = 15
	cfg.MinConns = 2
	cfg.MaxConnLifetime = 30 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("error creant pgxpool: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("no s'ha pogut connectar a PostgreSQL: %w", err)
	}

	return pool, nil
}

// RunMigrations executa els fitxers *.up.sql de la carpeta de migracions de manera ordenada i idempotent.
func RunMigrations(ctx context.Context, pool *pgxpool.Pool, migrationsDir string) error {
	_, err := pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version VARCHAR(255) PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
	`)
	if err != nil {
		return fmt.Errorf("error creant taula schema_migrations: %w", err)
	}

	entries, err := os.ReadDir(migrationsDir)
	if err != nil {
		return fmt.Errorf("error llegint directori de migracions %s: %w", migrationsDir, err)
	}

	var upFiles []string
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".up.sql") {
			upFiles = append(upFiles, entry.Name())
		}
	}
	sort.Strings(upFiles)

	for _, fileName := range upFiles {
		var alreadyApplied bool
		err := pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version = $1)`, fileName).Scan(&alreadyApplied)
		if err != nil {
			return fmt.Errorf("error comprovant migració %s: %w", fileName, err)
		}
		if alreadyApplied {
			continue
		}

		fullPath := filepath.Join(migrationsDir, fileName)
		sqlBytes, err := os.ReadFile(fullPath)
		if err != nil {
			return fmt.Errorf("error llegint migració %s: %w", fullPath, err)
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			return fmt.Errorf("error iniciant transacció per a %s: %w", fileName, err)
		}

		if _, err := tx.Exec(ctx, string(sqlBytes)); err != nil {
			_ = tx.Rollback(ctx)
			return fmt.Errorf("error executant migració %s: %w", fileName, err)
		}

		if _, err := tx.Exec(ctx, `INSERT INTO schema_migrations (version) VALUES ($1)`, fileName); err != nil {
			_ = tx.Rollback(ctx)
			return fmt.Errorf("error registrant migració %s: %w", fileName, err)
		}

		if err := tx.Commit(ctx); err != nil {
			return fmt.Errorf("error confirmant migració %s: %w", fileName, err)
		}

		log.Printf("[db] Migració aplicada: %s", fileName)
	}

	return nil
}

// SeedInitialAdmin crea l'usuari ADMIN inicial si no hi ha cap usuari actiu a la base de dades (HU-USR-01).
func SeedInitialAdmin(ctx context.Context, pool *pgxpool.Pool) error {
	var count int
	err := pool.QueryRow(ctx, `SELECT COUNT(*) FROM users WHERE deleted_at IS NULL`).Scan(&count)
	if err != nil {
		return fmt.Errorf("error comptant usuaris: %w", err)
	}
	if count > 0 {
		return nil
	}

	email := strings.TrimSpace(strings.ToLower(getEnv("ADMIN_INITIAL_EMAIL", "admin@rawcraft.local")))
	password := getEnv("ADMIN_INITIAL_PASSWORD", "Admin1234!")
	name := getEnv("ADMIN_INITIAL_NAME", "Administrador Rawcraft")

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("error generant hash bcrypt per a l'admin inicial: %w", err)
	}

	adminID := uuid.New()
	_, err = pool.Exec(ctx, `
		INSERT INTO users (id, name, email, password_hash, role, is_active, created_at, updated_at)
		VALUES ($1, $2, $3, $4, 'ADMIN', TRUE, NOW(), NOW())
	`, adminID, name, email, string(hash))
	if err != nil {
		return fmt.Errorf("error inserint usuari ADMIN inicial: %w", err)
	}

	log.Printf("[db] Usuari ADMIN inicial creat: %s", email)
	return nil
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}
