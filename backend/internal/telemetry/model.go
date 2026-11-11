package telemetry

import (
	"time"

	"github.com/google/uuid"
)

type DiskMountUsage struct {
	MountPoint  string  `json:"mount_point"`
	TotalGB     float64 `json:"total_gb"`
	UsedGB      float64 `json:"used_gb"`
	UsedPercent float64 `json:"used_percent"`
}

type HostMetricsSnapshot struct {
	OSName           string           `json:"os_name"`
	KernelVersion    string           `json:"kernel_version"`
	Arch             string           `json:"arch"`
	Hostname         string           `json:"hostname"`
	UptimeSeconds    int64            `json:"uptime_seconds"`
	RebootRequired   bool             `json:"reboot_required"`
	Load1m           float64          `json:"load_1m"`
	Load5m           float64          `json:"load_5m"`
	Load15m          float64          `json:"load_15m"`
	MemoryTotalMB    float64          `json:"memory_total_mb"`
	MemoryUsedMB     float64          `json:"memory_used_mb"`
	MemoryPercent    float64          `json:"memory_percent"`
	SwapTotalMB      float64          `json:"swap_total_mb"`
	SwapUsedMB       float64          `json:"swap_used_mb"`
	SwapPercent      float64          `json:"swap_percent"`
	ProcessesCount   int              `json:"processes_count"`
	UsersLoggedIn    int              `json:"users_logged_in"`
	NetworkInterface string           `json:"network_interface"`
	IPv4Address      string           `json:"ipv4_address"`
	AgentMemoryMB    float64          `json:"agent_memory_mb,omitempty"`
	Disks            []DiskMountUsage `json:"disks"`
}

type DockerContainerSnapshot struct {
	ContainerID   string  `json:"container_id"`
	Name          string  `json:"name"`
	Image         string  `json:"image"`
	ImageSizeMB   float64 `json:"image_size_mb,omitempty"`
	State         string  `json:"state"`
	Status        string  `json:"status"`
	Health        string  `json:"health"`
	ExitCode      int     `json:"exit_code"`
	CPUPercent    float64 `json:"cpu_percent"`
	MemoryUsedMB  float64 `json:"memory_used_mb"`
	MemoryLimitMB float64 `json:"memory_limit_mb"`
	MemoryPercent float64 `json:"memory_percent"`
}

type DockerMetricsSnapshot struct {
	DockerDaemonUp        bool                      `json:"docker_daemon_up"`
	TotalHostContainers   int                       `json:"total_host_containers"`
	RunningHostContainers int                       `json:"running_host_containers"`
	StoppedHostContainers int                       `json:"stopped_host_containers"`
	TotalImagesSizeMB     float64                   `json:"total_images_size_mb,omitempty"`
	Containers            []DockerContainerSnapshot `json:"containers"`
}

type HttpEndpointSnapshot struct {
	Name                string     `json:"name"`
	URL                 string     `json:"url"`
	Method              string     `json:"method"`
	ExpectedStatusCodes []int      `json:"expected_status_codes"`
	Up                  bool       `json:"up"`
	StatusCode          int        `json:"status_code"`
	ResponseTimeMs      int        `json:"response_time_ms"`
	ErrorMessage        *string    `json:"error_message,omitempty"`
	LastCheckedAt       *time.Time `json:"last_checked_at,omitempty"`
}

type PostgresDatabaseInfo struct {
	Name      string  `json:"name"`
	SizeMB    float64 `json:"size_mb"`
	SizeBytes int64   `json:"size_bytes,omitempty"`
}

type PostgresInstanceSnapshot struct {
	Name               string                 `json:"name"`
	Up                 bool                   `json:"up"`
	LatencyMs          int                    `json:"latency_ms"`
	ActiveConnections  int                    `json:"active_connections"`
	MaxConnections     int                    `json:"max_connections"`
	ConnectionsPercent float64                `json:"connections_percent"`
	DatabaseSizeMB     float64                `json:"database_size_mb"`
	DatabasesCount     int                    `json:"databases_count"`
	Databases          []PostgresDatabaseInfo `json:"databases,omitempty"`
	LongRunningQueries int                    `json:"long_running_queries"`
	LocksWaiting       int                    `json:"locks_waiting"`
	ErrorMessage       *string                `json:"error_message,omitempty"`
}

type TelemetryIngestRequest struct {
	ServerID          uuid.UUID                  `json:"server_id"`
	RecordedAt        time.Time                  `json:"recorded_at"`
	Host              *HostMetricsSnapshot       `json:"host,omitempty"`
	Docker            *DockerMetricsSnapshot     `json:"docker,omitempty"`
	HttpEndpoints     []HttpEndpointSnapshot     `json:"http_endpoints,omitempty"`
	PostgresInstances []PostgresInstanceSnapshot `json:"postgres_instances,omitempty"`
}

type TelemetrySnapshotRecord struct {
	ID                uuid.UUID
	ServerID          uuid.UUID
	RecordedAt        time.Time
	Host              *HostMetricsSnapshot
	Docker            *DockerMetricsSnapshot
	HttpEndpoints     []HttpEndpointSnapshot
	PostgresInstances []PostgresInstanceSnapshot
	CreatedAt         time.Time
}

type ServerDashboardSummary struct {
	ServerID               uuid.UUID            `json:"server_id"`
	ServerName             string               `json:"server_name"`
	Description            string               `json:"description,omitempty"`
	Status                 string               `json:"status"`
	LastSeenAt             *time.Time           `json:"last_seen_at"`
	ReportIntervalSeconds  int                  `json:"report_interval_seconds"`
	ActiveAlertsCount      int                  `json:"active_alerts_count"`
	RebootRequired         bool                 `json:"reboot_required"`
	Host                      *HostMetricsSnapshot `json:"host,omitempty"`
	DockerRunningCount        int                  `json:"docker_running_count"`
	DockerStoppedCount        int                  `json:"docker_stopped_count"`
	DockerMonitoredCount      int                  `json:"docker_monitored_count"`
	DockerTotalHostContainers int                  `json:"docker_total_host_containers"`
	DockerHostRunningCount    int                  `json:"docker_host_running_count"`
	DockerHostStoppedCount    int                  `json:"docker_host_stopped_count"`
	HttpOkCount               int                  `json:"http_ok_count"`
	HttpTotalCount         int                  `json:"http_total_count"`
	HttpAvgLatencyMs       int                  `json:"http_avg_latency_ms"`
	PostgresUpCount        int                  `json:"postgres_up_count"`
	PostgresTotalCount     int                  `json:"postgres_total_count"`
	PostgresMaxConnPercent float64              `json:"postgres_max_conn_percent"`
	PostgresTotalSizeMB    float64              `json:"postgres_total_size_mb"`
}

type DashboardOverviewResponse struct {
	TotalServers           int                      `json:"total_servers"`
	OnlineServers          int                      `json:"online_servers"`
	TotalRunningContainers int                      `json:"total_running_containers"`
	TotalDownContainers    int                      `json:"total_down_containers"`
	HttpEndpointsOk        int                      `json:"http_endpoints_ok"`
	HttpEndpointsTotal     int                      `json:"http_endpoints_total"`
	PostgresInstancesUp    int                      `json:"postgres_instances_up"`
	PostgresInstancesTotal int                      `json:"postgres_instances_total"`
	Servers                []ServerDashboardSummary `json:"servers"`
}

type ServerLiveDetailResponse struct {
	ServerID          uuid.UUID                  `json:"server_id"`
	ServerName        string                     `json:"server_name"`
	Status            string                     `json:"status"`
	RecordedAt        *time.Time                 `json:"recorded_at"`
	Host              *HostMetricsSnapshot       `json:"host,omitempty"`
	Docker            *DockerMetricsSnapshot     `json:"docker,omitempty"`
	HttpEndpoints     []HttpEndpointSnapshot     `json:"http_endpoints"`
	PostgresInstances []PostgresInstanceSnapshot `json:"postgres_instances"`
}

type TelemetryHistoryPoint struct {
	Timestamp                  time.Time          `json:"timestamp"`
	Load1m                     float64            `json:"load_1m"`
	Load5m                     float64            `json:"load_5m"`
	Load15m                    float64            `json:"load_15m"`
	MemoryPercent              float64            `json:"memory_percent"`
	SwapPercent                float64            `json:"swap_percent"`
	DiskRootPercent            float64            `json:"disk_root_percent"`
	ProcessesCount             int                `json:"processes_count"`
	ContainersCPU              map[string]float64 `json:"containers_cpu,omitempty"`
	ContainersMemoryMB         map[string]float64 `json:"containers_memory_mb,omitempty"`
	HttpLatencyMs              map[string]int     `json:"http_latency_ms,omitempty"`
	HttpUp                     map[string]bool    `json:"http_up,omitempty"`
	HttpStatus                 map[string]int     `json:"http_status,omitempty"`
	PostgresConnectionsPercent map[string]float64 `json:"postgres_connections_percent,omitempty"`
	PostgresSizeMB             map[string]float64 `json:"postgres_size_mb,omitempty"`
}

type ServerHistoryResponse struct {
	ServerID uuid.UUID               `json:"server_id"`
	Range    string                  `json:"range"`
	Points   []TelemetryHistoryPoint `json:"points"`
}

type RetentionSettings struct {
	RetentionDays int       `json:"retention_days"`
	UpdatedAt     time.Time `json:"updated_at"`
}

type UpdateRetentionRequest struct {
	RetentionDays int `json:"retention_days"`
}
