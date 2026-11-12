package containerlog

import (
	"time"

	"github.com/google/uuid"
)

// ContainerLogEntry representa una línia de log emmagatzemada a PostgreSQL.
type ContainerLogEntry struct {
	ID            int64     `json:"id"`
	ServerID      uuid.UUID `json:"server_id"`
	ContainerName string    `json:"container_name"`
	Stream        string    `json:"stream"` // "stdout" | "stderr"
	Timestamp     time.Time `json:"timestamp"`
	Message       string    `json:"message"`
	CreatedAt     time.Time `json:"created_at"`
}

// IngestLogItem és cada entrada enviada per l'agent en un batch.
type IngestLogItem struct {
	ContainerName string    `json:"container_name" binding:"required"`
	Stream        string    `json:"stream"` // "stdout" o "stderr"
	Timestamp     time.Time `json:"timestamp" binding:"required"`
	Message       string    `json:"message" binding:"required"`
}

// IngestContainerLogsRequest és el payload que l'agent envia al Punt Central.
type IngestContainerLogsRequest struct {
	ServerID uuid.UUID       `json:"server_id"`
	Entries  []IngestLogItem `json:"entries" binding:"required"`
}

// QueryContainerLogsRequest són els filtres de cerca i paginació del visualitzador.
type QueryContainerLogsRequest struct {
	Limit  int        `form:"limit"`
	Stream string     `form:"stream"` // "all", "stdout", "stderr"
	Search string     `form:"search"`
	Since  *time.Time `form:"since" time_format:"2006-01-02T15:04:05Z07:00"`
	Until  *time.Time `form:"until" time_format:"2006-01-02T15:04:05Z07:00"`
	Order  string     `form:"order"` // "desc" (defecte) o "asc"
}

// ContainerLogsResponse és la resposta paginada retornada a la interfície web.
type ContainerLogsResponse struct {
	ServerID      uuid.UUID           `json:"server_id"`
	ContainerName string              `json:"container_name"`
	Total         int                 `json:"total"`
	Entries       []ContainerLogEntry `json:"entries"`
}
