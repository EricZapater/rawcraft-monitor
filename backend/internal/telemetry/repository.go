package telemetry

import (
	"context"
	"encoding/json"
	"errors"
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

func (r *Repository) InsertSnapshot(ctx context.Context, req TelemetryIngestRequest) error {
	var hostBytes, dockerBytes, httpBytes, pgBytes []byte
	var err error

	if req.Host != nil {
		if req.Host.Disks == nil {
			req.Host.Disks = []DiskMountUsage{}
		}
		hostBytes, err = json.Marshal(req.Host)
		if err != nil {
			return err
		}
	}
	if req.Docker != nil {
		if req.Docker.Containers == nil {
			req.Docker.Containers = []DockerContainerSnapshot{}
		}
		dockerBytes, err = json.Marshal(req.Docker)
		if err != nil {
			return err
		}
	}
	if req.HttpEndpoints != nil {
		httpBytes, err = json.Marshal(req.HttpEndpoints)
		if err != nil {
			return err
		}
	} else {
		httpBytes = []byte("[]")
	}
	if req.PostgresInstances != nil {
		pgBytes, err = json.Marshal(req.PostgresInstances)
		if err != nil {
			return err
		}
	} else {
		pgBytes = []byte("[]")
	}

	recordedAt := req.RecordedAt
	if recordedAt.IsZero() {
		recordedAt = time.Now()
	}

	_, err = r.pool.Exec(ctx, `
		INSERT INTO telemetry_snapshots (
			id, server_id, recorded_at, host_json, docker_json,
			http_endpoints_json, postgres_instances_json, created_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
	`, uuid.New(), req.ServerID, recordedAt, hostBytes, dockerBytes, httpBytes, pgBytes)
	return err
}

func decodeSnapshotRow(row pgx.Row) (*TelemetrySnapshotRecord, error) {
	var rec TelemetrySnapshotRecord
	var hostBytes, dockerBytes, httpBytes, pgBytes []byte

	err := row.Scan(
		&rec.ID, &rec.ServerID, &rec.RecordedAt,
		&hostBytes, &dockerBytes, &httpBytes, &pgBytes, &rec.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	if len(hostBytes) > 0 {
		var h HostMetricsSnapshot
		if err := json.Unmarshal(hostBytes, &h); err == nil {
			if h.Disks == nil {
				h.Disks = []DiskMountUsage{}
			}
			rec.Host = &h
		}
	}
	if len(dockerBytes) > 0 {
		var d DockerMetricsSnapshot
		if err := json.Unmarshal(dockerBytes, &d); err == nil {
			if d.Containers == nil {
				d.Containers = []DockerContainerSnapshot{}
			}
			rec.Docker = &d
		}
	}
	rec.HttpEndpoints = []HttpEndpointSnapshot{}
	if len(httpBytes) > 0 {
		_ = json.Unmarshal(httpBytes, &rec.HttpEndpoints)
	}
	rec.PostgresInstances = []PostgresInstanceSnapshot{}
	if len(pgBytes) > 0 {
		_ = json.Unmarshal(pgBytes, &rec.PostgresInstances)
	}
	return &rec, nil
}

func (r *Repository) GetLatestByServer(ctx context.Context, serverID uuid.UUID) (*TelemetrySnapshotRecord, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT id, server_id, recorded_at, host_json, docker_json,
		       http_endpoints_json, postgres_instances_json, created_at
		FROM telemetry_snapshots
		WHERE server_id = $1
		ORDER BY recorded_at DESC
		LIMIT 1
	`, serverID)
	return decodeSnapshotRow(row)
}

func (r *Repository) ListByServerAndWindow(ctx context.Context, serverID uuid.UUID, from, to time.Time) ([]TelemetrySnapshotRecord, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, server_id, recorded_at, host_json, docker_json,
		       http_endpoints_json, postgres_instances_json, created_at
		FROM telemetry_snapshots
		WHERE server_id = $1 AND recorded_at >= $2 AND recorded_at <= $3
		ORDER BY recorded_at ASC
	`, serverID, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	records := make([]TelemetrySnapshotRecord, 0)
	for rows.Next() {
		var rec TelemetrySnapshotRecord
		var hostBytes, dockerBytes, httpBytes, pgBytes []byte
		if err := rows.Scan(
			&rec.ID, &rec.ServerID, &rec.RecordedAt,
			&hostBytes, &dockerBytes, &httpBytes, &pgBytes, &rec.CreatedAt,
		); err != nil {
			return nil, err
		}
		if len(hostBytes) > 0 {
			var h HostMetricsSnapshot
			if err := json.Unmarshal(hostBytes, &h); err == nil {
				rec.Host = &h
			}
		}
		if len(dockerBytes) > 0 {
			var d DockerMetricsSnapshot
			if err := json.Unmarshal(dockerBytes, &d); err == nil {
				rec.Docker = &d
			}
		}
		if len(httpBytes) > 0 {
			_ = json.Unmarshal(httpBytes, &rec.HttpEndpoints)
		}
		if len(pgBytes) > 0 {
			_ = json.Unmarshal(pgBytes, &rec.PostgresInstances)
		}
		records = append(records, rec)
	}
	return records, rows.Err()
}

func (r *Repository) GetRetentionSettings(ctx context.Context) (*RetentionSettings, error) {
	var valBytes []byte
	var updatedAt time.Time
	err := r.pool.QueryRow(ctx, `
		SELECT value_json, updated_at FROM system_settings WHERE key = 'retention_days'
	`).Scan(&valBytes, &updatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return &RetentionSettings{
				RetentionDays: 365,
				UpdatedAt:     time.Now(),
			}, nil
		}
		return nil, err
	}

	var parsed struct {
		RetentionDays int `json:"retention_days"`
	}
	parsed.RetentionDays = 365
	_ = json.Unmarshal(valBytes, &parsed)
	if parsed.RetentionDays < 7 {
		parsed.RetentionDays = 365
	}

	return &RetentionSettings{
		RetentionDays: parsed.RetentionDays,
		UpdatedAt:     updatedAt,
	}, nil
}

func (r *Repository) UpdateRetentionSettings(ctx context.Context, days int) (*RetentionSettings, error) {
	payload, err := json.Marshal(map[string]int{"retention_days": days})
	if err != nil {
		return nil, err
	}

	var updatedAt time.Time
	err = r.pool.QueryRow(ctx, `
		INSERT INTO system_settings (key, value_json, updated_at)
		VALUES ('retention_days', $1, NOW())
		ON CONFLICT (key) DO UPDATE
		SET value_json = EXCLUDED.value_json, updated_at = NOW()
		RETURNING updated_at
	`, payload).Scan(&updatedAt)
	if err != nil {
		return nil, err
	}

	return &RetentionSettings{
		RetentionDays: days,
		UpdatedAt:     updatedAt,
	}, nil
}

func (r *Repository) PurgeSnapshotsBefore(ctx context.Context, cutoff time.Time) (int64, error) {
	tag, err := r.pool.Exec(ctx, `
		DELETE FROM telemetry_snapshots WHERE recorded_at < $1
	`, cutoff)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}
