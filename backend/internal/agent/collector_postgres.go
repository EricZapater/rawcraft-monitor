package agent

import (
	"context"
	"fmt"
	"net/url"
	"time"

	"github.com/jackc/pgx/v5"

	"rawcraft-monitor/backend/internal/server"
	"rawcraft-monitor/backend/internal/telemetry"
)

// CollectPostgresMetrics comprova totes les instàncies PostgreSQL configurades al servidor.
func CollectPostgresMetrics(ctx context.Context, cfg server.PostgresPillarConfig) []telemetry.PostgresInstanceSnapshot {
	if !cfg.Enabled || len(cfg.Instances) == 0 {
		return []telemetry.PostgresInstanceSnapshot{}
	}

	results := make([]telemetry.PostgresInstanceSnapshot, 0, len(cfg.Instances))
	for _, inst := range cfg.Instances {
		results = append(results, checkPostgresInstance(ctx, inst))
	}
	return results
}

func checkPostgresInstance(ctx context.Context, inst server.PostgresInstanceConfig) telemetry.PostgresInstanceSnapshot {
	snap := telemetry.PostgresInstanceSnapshot{
		Name: inst.Name,
	}

	host := inst.Host
	if host == "" {
		host = "127.0.0.1"
	}
	port := inst.Port
	if port <= 0 {
		port = 5432
	}
	dbname := inst.DBName
	if dbname == "" {
		dbname = "postgres"
	}
	sslmode := inst.SSLMode
	if sslmode == "" {
		sslmode = "disable"
	}

	u := &url.URL{
		Scheme:   "postgres",
		User:     url.UserPassword(inst.User, inst.Password),
		Host:     fmt.Sprintf("%s:%d", host, port),
		Path:     dbname,
		RawQuery: fmt.Sprintf("sslmode=%s&connect_timeout=5", url.QueryEscape(sslmode)),
	}

	connCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	start := time.Now()
	conn, err := pgx.Connect(connCtx, u.String())
	if err != nil {
		errMsg := err.Error()
		snap.ErrorMessage = &errMsg
		return snap
	}
	defer func() { _ = conn.Close(context.Background()) }()

	var one int
	if err := conn.QueryRow(connCtx, `SELECT 1`).Scan(&one); err != nil {
		errMsg := err.Error()
		snap.ErrorMessage = &errMsg
		return snap
	}
	snap.LatencyMs = int(time.Since(start).Milliseconds())
	snap.Up = true

	// Connexions actives vs max_connections
	_ = conn.QueryRow(connCtx, `SELECT current_setting('max_connections')::int`).Scan(&snap.MaxConnections)
	_ = conn.QueryRow(connCtx, `SELECT COUNT(*)::int FROM pg_stat_activity`).Scan(&snap.ActiveConnections)
	if snap.MaxConnections > 0 {
		snap.ConnectionsPercent = round2((float64(snap.ActiveConnections) / float64(snap.MaxConnections)) * 100.0)
	}

	// Mida de la base de dades en MB
	var dbBytes int64
	if err := conn.QueryRow(connCtx, `SELECT pg_database_size(current_database())`).Scan(&dbBytes); err == nil {
		snap.DatabaseSizeMB = round2(float64(dbBytes) / (1024.0 * 1024.0))
	}

	// Consultes lentes i locks en espera
	longSec := inst.LongQuerySeconds
	if longSec <= 0 {
		longSec = 60
	}
	_ = conn.QueryRow(connCtx, `
		SELECT COUNT(*)::int
		FROM pg_stat_activity
		WHERE state = 'active'
		  AND pid <> pg_backend_pid()
		  AND query_start IS NOT NULL
		  AND EXTRACT(EPOCH FROM (NOW() - query_start)) > $1
	`, longSec).Scan(&snap.LongRunningQueries)

	_ = conn.QueryRow(connCtx, `
		SELECT COUNT(*)::int
		FROM pg_stat_activity
		WHERE wait_event_type = 'Lock'
	`).Scan(&snap.LocksWaiting)

	return snap
}
