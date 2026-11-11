package server

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrServerNotFound   = errors.New("servidor no trobat")
	ErrInvalidServerOp  = errors.New("operació de servidor invàlida")
	ErrInvalidAgentAuth = errors.New("clau d'agent invàlida")
)

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

func scanServer(row pgx.Row) (*Server, error) {
	var s Server
	var cfgBytes []byte
	err := row.Scan(
		&s.ID, &s.Name, &s.Description, &s.APIKeyHash, &s.APIKeyPlain, &s.APIKeyPreview,
		&s.Status, &s.LastSeenAt, &s.OSName, &s.KernelVersion, &s.IPv4Address, &s.RebootRequired,
		&cfgBytes, &s.CreatedAt, &s.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrServerNotFound
		}
		return nil, err
	}
	s.Config = DefaultMonitoringConfig(15, 300)
	if len(cfgBytes) > 0 {
		_ = json.Unmarshal(cfgBytes, &s.Config)
	}
	normalizeConfigSlices(&s.Config)
	return &s, nil
}

func normalizeConfigSlices(cfg *ServerMonitoringConfig) {
	if len(cfg.Host.MountPoints) == 0 {
		cfg.Host.MountPoints = []string{"/"}
	}
	if cfg.Host.Thresholds.SustainedChecks <= 0 {
		cfg.Host.Thresholds.SustainedChecks = 4
	}
	if cfg.Docker.SocketPath == "" {
		cfg.Docker.SocketPath = "/var/run/docker.sock"
	}
	if cfg.Docker.RequiredContainers == nil {
		cfg.Docker.RequiredContainers = []string{}
	}
	if cfg.Docker.IgnoreContainers == nil {
		cfg.Docker.IgnoreContainers = []string{}
	}
	if cfg.HttpEndpoints == nil {
		cfg.HttpEndpoints = []HttpEndpointCheckConfig{}
	}
	if cfg.Postgres.Instances == nil {
		cfg.Postgres.Instances = []PostgresInstanceConfig{}
	}
	if cfg.SMTP.ToEmails == nil {
		cfg.SMTP.ToEmails = []string{}
	}
}

func (r *Repository) ListAll(ctx context.Context) ([]Server, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, name, description, api_key_hash, api_key_plain, api_key_preview,
		       status, last_seen_at, os_name, kernel_version, ipv4_address, reboot_required,
		       config_json, created_at, updated_at
		FROM servers
		WHERE deleted_at IS NULL
		ORDER BY created_at ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	servers := make([]Server, 0)
	for rows.Next() {
		var s Server
		var cfgBytes []byte
		if err := rows.Scan(
			&s.ID, &s.Name, &s.Description, &s.APIKeyHash, &s.APIKeyPlain, &s.APIKeyPreview,
			&s.Status, &s.LastSeenAt, &s.OSName, &s.KernelVersion, &s.IPv4Address, &s.RebootRequired,
			&cfgBytes, &s.CreatedAt, &s.UpdatedAt,
		); err != nil {
			return nil, err
		}
		s.Config = DefaultMonitoringConfig(15, 300)
		if len(cfgBytes) > 0 {
			_ = json.Unmarshal(cfgBytes, &s.Config)
		}
		normalizeConfigSlices(&s.Config)
		servers = append(servers, s)
	}
	return servers, rows.Err()
}

func (r *Repository) ListByIDs(ctx context.Context, ids []uuid.UUID) ([]Server, error) {
	if len(ids) == 0 {
		return []Server{}, nil
	}
	rows, err := r.pool.Query(ctx, `
		SELECT id, name, description, api_key_hash, api_key_plain, api_key_preview,
		       status, last_seen_at, os_name, kernel_version, ipv4_address, reboot_required,
		       config_json, created_at, updated_at
		FROM servers
		WHERE deleted_at IS NULL AND id = ANY($1)
		ORDER BY created_at ASC
	`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	servers := make([]Server, 0)
	for rows.Next() {
		var s Server
		var cfgBytes []byte
		if err := rows.Scan(
			&s.ID, &s.Name, &s.Description, &s.APIKeyHash, &s.APIKeyPlain, &s.APIKeyPreview,
			&s.Status, &s.LastSeenAt, &s.OSName, &s.KernelVersion, &s.IPv4Address, &s.RebootRequired,
			&cfgBytes, &s.CreatedAt, &s.UpdatedAt,
		); err != nil {
			return nil, err
		}
		s.Config = DefaultMonitoringConfig(15, 300)
		if len(cfgBytes) > 0 {
			_ = json.Unmarshal(cfgBytes, &s.Config)
		}
		normalizeConfigSlices(&s.Config)
		servers = append(servers, s)
	}
	return servers, rows.Err()
}

func (r *Repository) GetByID(ctx context.Context, id uuid.UUID) (*Server, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT id, name, description, api_key_hash, api_key_plain, api_key_preview,
		       status, last_seen_at, os_name, kernel_version, ipv4_address, reboot_required,
		       config_json, created_at, updated_at
		FROM servers
		WHERE id = $1 AND deleted_at IS NULL
	`, id)
	return scanServer(row)
}

func (r *Repository) GetByAPIKeyHash(ctx context.Context, keyHash string) (*Server, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT id, name, description, api_key_hash, api_key_plain, api_key_preview,
		       status, last_seen_at, os_name, kernel_version, ipv4_address, reboot_required,
		       config_json, created_at, updated_at
		FROM servers
		WHERE api_key_hash = $1 AND deleted_at IS NULL
	`, keyHash)
	return scanServer(row)
}

func (r *Repository) Create(ctx context.Context, s *Server) error {
	normalizeConfigSlices(&s.Config)
	cfgBytes, err := json.Marshal(s.Config)
	if err != nil {
		return err
	}

	return r.pool.QueryRow(ctx, `
		INSERT INTO servers (
			id, name, description, api_key_hash, api_key_plain, api_key_preview,
			status, reboot_required, config_json, created_at, updated_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE, $8, NOW(), NOW())
		RETURNING created_at, updated_at
	`, s.ID, s.Name, s.Description, s.APIKeyHash, s.APIKeyPlain, s.APIKeyPreview, s.Status, cfgBytes).Scan(&s.CreatedAt, &s.UpdatedAt)
}

func (r *Repository) Update(ctx context.Context, s *Server) error {
	normalizeConfigSlices(&s.Config)
	cfgBytes, err := json.Marshal(s.Config)
	if err != nil {
		return err
	}

	err = r.pool.QueryRow(ctx, `
		UPDATE servers
		SET name = $1, description = $2, config_json = $3, updated_at = NOW()
		WHERE id = $4 AND deleted_at IS NULL
		RETURNING status, last_seen_at, os_name, kernel_version, ipv4_address, reboot_required, api_key_preview, created_at, updated_at
	`, s.Name, s.Description, cfgBytes, s.ID).Scan(
		&s.Status, &s.LastSeenAt, &s.OSName, &s.KernelVersion, &s.IPv4Address, &s.RebootRequired,
		&s.APIKeyPreview, &s.CreatedAt, &s.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrServerNotFound
		}
		return err
	}
	return nil
}

func (r *Repository) UpdateAPIKey(ctx context.Context, id uuid.UUID, hash, plain, preview string) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE servers
		SET api_key_hash = $1, api_key_plain = $2, api_key_preview = $3, updated_at = NOW()
		WHERE id = $4 AND deleted_at IS NULL
	`, hash, plain, preview, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrServerNotFound
	}
	return nil
}

func (r *Repository) UpdateTelemetryMetadata(
	ctx context.Context,
	id uuid.UUID,
	status ServerStatus,
	osName, kernelVersion, ipv4 *string,
	rebootRequired bool,
	seenAt time.Time,
) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE servers
		SET status = $1,
		    last_seen_at = $2,
		    os_name = COALESCE($3, os_name),
		    kernel_version = COALESCE($4, kernel_version),
		    ipv4_address = COALESCE($5, ipv4_address),
		    reboot_required = $6,
		    updated_at = NOW()
		WHERE id = $7 AND deleted_at IS NULL
	`, status, seenAt, osName, kernelVersion, ipv4, rebootRequired, id)
	return err
}

func (r *Repository) UpdateStatus(ctx context.Context, id uuid.UUID, status ServerStatus) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE servers SET status = $1, updated_at = NOW()
		WHERE id = $2 AND deleted_at IS NULL
	`, status, id)
	return err
}

func (r *Repository) SoftDelete(ctx context.Context, id uuid.UUID) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE servers SET deleted_at = NOW(), updated_at = NOW()
		WHERE id = $1 AND deleted_at IS NULL
	`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrServerNotFound
	}
	return nil
}

func (r *Repository) CreateDeployment(ctx context.Context, d *Deployment) error {
	if d.ID == uuid.Nil {
		d.ID = uuid.New()
	}
	if d.Environment == "" {
		d.Environment = "production"
	}
	if d.Status == "" {
		d.Status = DeploymentStatusSuccess
	}
	now := time.Now()
	if d.DeployedAt.IsZero() {
		d.DeployedAt = now
	}
	if d.CreatedAt.IsZero() {
		d.CreatedAt = now
	}

	_, err := r.pool.Exec(ctx, `
		INSERT INTO deployments (
			id, server_id, product_name, environment, version,
			commit_sha, commit_message, branch, deployed_by,
			status, duration_seconds, details, deployed_at, created_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
	`, d.ID, d.ServerID, d.ProductName, d.Environment, d.Version,
		d.CommitSHA, d.CommitMessage, d.Branch, d.DeployedBy,
		d.Status, d.DurationSeconds, d.Details, d.DeployedAt, d.CreatedAt)
	return err
}

func (r *Repository) ListDeploymentsByServer(ctx context.Context, serverID uuid.UUID, limit, offset int) ([]Deployment, int, error) {
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}
	if offset < 0 {
		offset = 0
	}

	var total int
	err := r.pool.QueryRow(ctx, `SELECT COUNT(*) FROM deployments WHERE server_id = $1`, serverID).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	rows, err := r.pool.Query(ctx, `
		SELECT 
			d.id, d.server_id, s.name as server_name, d.product_name, d.environment,
			d.version, d.commit_sha, d.commit_message, d.branch, d.deployed_by,
			d.status, d.duration_seconds, d.details, d.deployed_at, d.created_at
		FROM deployments d
		JOIN servers s ON s.id = d.server_id
		WHERE d.server_id = $1
		ORDER BY d.deployed_at DESC
		LIMIT $2 OFFSET $3
	`, serverID, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	items := make([]Deployment, 0)
	for rows.Next() {
		var d Deployment
		if err := rows.Scan(
			&d.ID, &d.ServerID, &d.ServerName, &d.ProductName, &d.Environment,
			&d.Version, &d.CommitSHA, &d.CommitMessage, &d.Branch, &d.DeployedBy,
			&d.Status, &d.DurationSeconds, &d.Details, &d.DeployedAt, &d.CreatedAt,
		); err != nil {
			return nil, 0, err
		}
		items = append(items, d)
	}
	return items, total, nil
}
