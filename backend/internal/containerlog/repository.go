package containerlog

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

// InsertBatch insereix un bloc d'entrades de logs de contenidors usant pgx.Batch.
func (r *Repository) InsertBatch(ctx context.Context, serverID uuid.UUID, entries []IngestLogItem) error {
	if len(entries) == 0 {
		return nil
	}

	batch := &pgx.Batch{}
	for _, e := range entries {
		stream := strings.ToLower(strings.TrimSpace(e.Stream))
		if stream != "stderr" {
			stream = "stdout"
		}
		ts := e.Timestamp
		if ts.IsZero() {
			ts = time.Now().UTC()
		}

		batch.Queue(`
			INSERT INTO container_logs (server_id, container_name, stream, timestamp, message)
			VALUES ($1, $2, $3, $4, $5)
		`, serverID, e.ContainerName, stream, ts, e.Message)
	}

	br := r.pool.SendBatch(ctx, batch)
	defer br.Close()

	for i := 0; i < len(entries); i++ {
		if _, err := br.Exec(); err != nil {
			return fmt.Errorf("error executant batch d'inserció de logs: %w", err)
		}
	}

	return nil
}

// QueryLogs cerca i retorna les línies de log segons els filtres indicats.
func (r *Repository) QueryLogs(ctx context.Context, serverID uuid.UUID, containerName string, req QueryContainerLogsRequest) ([]ContainerLogEntry, error) {
	limit := req.Limit
	if limit <= 0 {
		limit = 100
	}
	if limit > 1000 {
		limit = 1000
	}

	query := `
		SELECT id, server_id, container_name, stream, timestamp, message, created_at
		FROM container_logs
		WHERE server_id = $1 AND container_name = $2
	`
	args := []any{serverID, containerName}
	argIdx := 3

	stream := strings.ToLower(strings.TrimSpace(req.Stream))
	if stream == "stdout" || stream == "stderr" {
		query += fmt.Sprintf(" AND stream = $%d", argIdx)
		args = append(args, stream)
		argIdx++
	}

	if req.Since != nil && !req.Since.IsZero() {
		query += fmt.Sprintf(" AND timestamp >= $%d", argIdx)
		args = append(args, *req.Since)
		argIdx++
	}

	if req.Until != nil && !req.Until.IsZero() {
		query += fmt.Sprintf(" AND timestamp <= $%d", argIdx)
		args = append(args, *req.Until)
		argIdx++
	}

	search := strings.TrimSpace(req.Search)
	if search != "" {
		query += fmt.Sprintf(" AND message ILIKE $%d", argIdx)
		args = append(args, "%"+search+"%")
		argIdx++
	}

	orderDir := "DESC"
	if strings.ToLower(strings.TrimSpace(req.Order)) == "asc" {
		orderDir = "ASC"
	}
	query += fmt.Sprintf(" ORDER BY timestamp %s LIMIT $%d", orderDir, argIdx)
	args = append(args, limit)

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("error consultant container_logs: %w", err)
	}
	defer rows.Close()

	results := make([]ContainerLogEntry, 0)
	for rows.Next() {
		var entry ContainerLogEntry
		if err := rows.Scan(
			&entry.ID,
			&entry.ServerID,
			&entry.ContainerName,
			&entry.Stream,
			&entry.Timestamp,
			&entry.Message,
			&entry.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("error escanejant fila de container_log: %w", err)
		}
		results = append(results, entry)
	}

	return results, nil
}

// ListContainers retorna la llista de noms de contenidors que tenen logs enregistrats en aquest servidor.
func (r *Repository) ListContainers(ctx context.Context, serverID uuid.UUID) ([]string, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT DISTINCT container_name
		FROM container_logs
		WHERE server_id = $1
		ORDER BY container_name ASC
	`, serverID)
	if err != nil {
		return nil, fmt.Errorf("error llistant contenidors amb logs: %w", err)
	}
	defer rows.Close()

	var names []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		names = append(names, name)
	}
	if names == nil {
		names = []string{}
	}
	return names, nil
}

// PurgeLogsBefore elimina logs més antics que la data de tall donada (política de 30 dies).
func (r *Repository) PurgeLogsBefore(ctx context.Context, cutoff time.Time) (int64, error) {
	tag, err := r.pool.Exec(ctx, `
		DELETE FROM container_logs
		WHERE timestamp < $1
	`, cutoff)
	if err != nil {
		return 0, fmt.Errorf("error purgant container_logs: %w", err)
	}
	return tag.RowsAffected(), nil
}
