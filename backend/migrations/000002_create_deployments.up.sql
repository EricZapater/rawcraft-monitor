-- 000002_create_deployments.up.sql
-- Registre i seguiment de desplegaments (Change & Deploy Tracking)

CREATE TABLE IF NOT EXISTS deployments (
    id UUID PRIMARY KEY,
    server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    product_name VARCHAR(150) NOT NULL,
    environment VARCHAR(50) NOT NULL DEFAULT 'production',
    version VARCHAR(100) NOT NULL,
    commit_sha VARCHAR(64) NULL,
    commit_message TEXT NULL,
    branch VARCHAR(150) NULL,
    deployed_by VARCHAR(150) NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'SUCCESS' CHECK (status IN ('SUCCESS', 'FAILED', 'IN_PROGRESS')),
    duration_seconds INT NULL,
    details TEXT NULL,
    deployed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deployments_server_deployed ON deployments (server_id, deployed_at DESC);
CREATE INDEX IF NOT EXISTS idx_deployments_product ON deployments (product_name, deployed_at DESC);
