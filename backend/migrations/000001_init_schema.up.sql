-- 000001_init_schema.up.sql
-- Esquema inicial de Rawcraft Monitor

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'USER' CHECK (role IN ('ADMIN', 'USER')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_active ON users (LOWER(email)) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS servers (
    id UUID PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    api_key_hash TEXT NOT NULL,
    api_key_plain TEXT NOT NULL DEFAULT '',
    api_key_preview VARCHAR(64) NOT NULL DEFAULT '',
    status VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN' CHECK (status IN ('ONLINE', 'WARNING', 'CRITICAL', 'OFFLINE', 'UNKNOWN')),
    last_seen_at TIMESTAMPTZ NULL,
    os_name VARCHAR(255) NULL,
    kernel_version VARCHAR(255) NULL,
    ipv4_address VARCHAR(64) NULL,
    reboot_required BOOLEAN NOT NULL DEFAULT FALSE,
    config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_servers_active ON servers (created_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS user_servers (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, server_id)
);

CREATE INDEX IF NOT EXISTS idx_user_servers_server_id ON user_servers (server_id);

CREATE TABLE IF NOT EXISTS telemetry_snapshots (
    id UUID PRIMARY KEY,
    server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    recorded_at TIMESTAMPTZ NOT NULL,
    host_json JSONB NULL,
    docker_json JSONB NULL,
    http_endpoints_json JSONB NULL,
    postgres_instances_json JSONB NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telemetry_snapshots_server_recorded ON telemetry_snapshots (server_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS alerts (
    id UUID PRIMARY KEY,
    server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    fingerprint VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('FIRING', 'RESOLVED')),
    category VARCHAR(30) NOT NULL CHECK (category IN ('HOST', 'DOCKER', 'HTTP_ENDPOINT', 'POSTGRES', 'HEARTBEAT')),
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('WARNING', 'CRITICAL')),
    target_name VARCHAR(255) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    current_value TEXT NULL,
    threshold_value TEXT NULL,
    acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
    acknowledged_by VARCHAR(255) NULL,
    acknowledged_at TIMESTAMPTZ NULL,
    fired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_server_status ON alerts (server_id, status, fired_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_fingerprint_firing ON alerts (server_id, fingerprint) WHERE status = 'FIRING';

CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value_json JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO system_settings (key, value_json, updated_at)
VALUES ('retention_days', '{"retention_days": 365}'::jsonb, NOW())
ON CONFLICT (key) DO NOTHING;
