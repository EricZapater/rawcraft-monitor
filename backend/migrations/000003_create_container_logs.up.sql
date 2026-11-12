-- 000003_create_container_logs.up.sql
-- Registre centralitzat de logs de contenidors Docker ("Mini-Loki")

CREATE TABLE IF NOT EXISTS container_logs (
    id BIGSERIAL PRIMARY KEY,
    server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    container_name VARCHAR(120) NOT NULL,
    stream VARCHAR(10) NOT NULL DEFAULT 'stdout' CHECK (stream IN ('stdout', 'stderr')),
    timestamp TIMESTAMPTZ NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_container_logs_lookup ON container_logs (server_id, container_name, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_container_logs_timestamp ON container_logs (timestamp);

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_container_logs_message_trgm ON container_logs USING gin (message gin_trgm_ops);
