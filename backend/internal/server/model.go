package server

import (
	"time"

	"github.com/google/uuid"

	"rawcraft-monitor/backend/internal/shared"
)

type ServerStatus string

const (
	StatusOnline   ServerStatus = "ONLINE"
	StatusWarning  ServerStatus = "WARNING"
	StatusCritical ServerStatus = "CRITICAL"
	StatusOffline  ServerStatus = "OFFLINE"
	StatusUnknown  ServerStatus = "UNKNOWN"
)

type HostThresholdsConfig struct {
	SustainedChecks  int      `json:"sustained_checks" yaml:"sustained_checks"`
	MaxLoad1m        *float64 `json:"max_load_1m" yaml:"max_load_1m,omitempty"`
	MaxDiskPercent   *float64 `json:"max_disk_percent" yaml:"max_disk_percent,omitempty"`
	MaxMemoryPercent *float64 `json:"max_memory_percent" yaml:"max_memory_percent,omitempty"`
	MaxSwapPercent   *float64 `json:"max_swap_percent" yaml:"max_swap_percent,omitempty"`
	MaxProcesses     *int     `json:"max_processes" yaml:"max_processes,omitempty"`
	MaxUsersLoggedIn *int     `json:"max_users_logged_in" yaml:"max_users_logged_in,omitempty"`
}

type HostPillarConfig struct {
	Enabled               bool                 `json:"enabled" yaml:"enabled"`
	CollectOSInfo         bool                 `json:"collect_os_info" yaml:"collect_os_info"`
	CollectRebootRequired bool                 `json:"collect_reboot_required" yaml:"collect_reboot_required"`
	CollectLoad           bool                 `json:"collect_load" yaml:"collect_load"`
	CollectDisk           bool                 `json:"collect_disk" yaml:"collect_disk"`
	CollectMemory         bool                 `json:"collect_memory" yaml:"collect_memory"`
	CollectSwap           bool                 `json:"collect_swap" yaml:"collect_swap"`
	CollectProcesses      bool                 `json:"collect_processes" yaml:"collect_processes"`
	CollectUsers          bool                 `json:"collect_users" yaml:"collect_users"`
	CollectNetworkIP      bool                 `json:"collect_network_ip" yaml:"collect_network_ip"`
	NetworkInterface      string               `json:"network_interface,omitempty" yaml:"network_interface,omitempty"`
	MountPoints           []string             `json:"mount_points" yaml:"mount_points"`
	Thresholds            HostThresholdsConfig `json:"thresholds" yaml:"thresholds"`
}

type DockerPillarConfig struct {
	Enabled                   bool     `json:"enabled" yaml:"enabled"`
	SocketPath                string   `json:"socket_path" yaml:"socket_path"`
	CollectContainerStats     bool     `json:"collect_container_stats" yaml:"collect_container_stats"`
	AlertOnContainerDown      bool     `json:"alert_on_container_down" yaml:"alert_on_container_down"`
	RequiredContainers        []string `json:"required_containers" yaml:"required_containers"`
	IgnoreContainers          []string `json:"ignore_containers" yaml:"ignore_containers"`
	MaxContainerCPUPercent    *float64 `json:"max_container_cpu_percent" yaml:"max_container_cpu_percent,omitempty"`
	MaxContainerMemoryPercent *float64 `json:"max_container_memory_percent" yaml:"max_container_memory_percent,omitempty"`
}

type HttpEndpointCheckConfig struct {
	Name                string `json:"name" yaml:"name"`
	URL                 string `json:"url" yaml:"url"`
	Method              string `json:"method" yaml:"method"`
	ExpectedStatusCodes []int  `json:"expected_status_codes" yaml:"expected_status_codes"`
	TimeoutSeconds      int    `json:"timeout_seconds" yaml:"timeout_seconds"`
}

type PostgresInstanceConfig struct {
	Name                  string  `json:"name" yaml:"name"`
	Host                  string  `json:"host" yaml:"host"`
	Port                  int     `json:"port" yaml:"port"`
	User                  string  `json:"user" yaml:"user"`
	Password              string  `json:"password,omitempty" yaml:"password,omitempty"`
	DBName                string  `json:"dbname" yaml:"dbname"`
	SSLMode               string  `json:"sslmode" yaml:"sslmode"`
	MaxConnectionsPercent float64 `json:"max_connections_percent" yaml:"max_connections_percent"`
	LongQuerySeconds      int     `json:"long_query_seconds" yaml:"long_query_seconds"`
	MaxLongRunningQueries int     `json:"max_long_running_queries" yaml:"max_long_running_queries"`
}

type PostgresPillarConfig struct {
	Enabled   bool                     `json:"enabled" yaml:"enabled"`
	Instances []PostgresInstanceConfig `json:"instances" yaml:"instances"`
}

type ServerMonitoringConfig struct {
	CheckIntervalSeconds       int                       `json:"check_interval_seconds" yaml:"check_interval_seconds"`
	ReportIntervalSeconds      int                       `json:"report_interval_seconds" yaml:"report_interval_seconds"`
	CentralUnreachableFailures int                       `json:"central_unreachable_failures" yaml:"central_unreachable_failures"`
	Host                       HostPillarConfig          `json:"host" yaml:"host"`
	Docker                     DockerPillarConfig        `json:"docker" yaml:"docker"`
	HttpEndpoints              []HttpEndpointCheckConfig `json:"http_endpoints" yaml:"http_endpoints"`
	Postgres                   PostgresPillarConfig      `json:"postgres" yaml:"postgres"`
	SMTP                       shared.SMTPConfig         `json:"smtp" yaml:"smtp"`
}

// DefaultMonitoringConfig retorna una configuració inicial per defecte amb les 4 potetes estructurades.
func DefaultMonitoringConfig(checkInterval, reportInterval int) ServerMonitoringConfig {
	if checkInterval <= 0 {
		checkInterval = 15
	}
	if reportInterval <= 0 {
		reportInterval = 300
	}
	maxLoad := 4.0
	maxDisk := 85.0
	maxMem := 85.0
	maxSwap := 80.0
	maxCPU := 90.0
	maxContMem := 90.0

	return ServerMonitoringConfig{
		CheckIntervalSeconds:       checkInterval,
		ReportIntervalSeconds:      reportInterval,
		CentralUnreachableFailures: 3,
		Host: HostPillarConfig{
			Enabled:               true,
			CollectOSInfo:         true,
			CollectRebootRequired: true,
			CollectLoad:           true,
			CollectDisk:           true,
			CollectMemory:         true,
			CollectSwap:           true,
			CollectProcesses:      true,
			CollectUsers:          true,
			CollectNetworkIP:      true,
			MountPoints:           []string{"/"},
			Thresholds: HostThresholdsConfig{
				SustainedChecks:  4,
				MaxLoad1m:        &maxLoad,
				MaxDiskPercent:   &maxDisk,
				MaxMemoryPercent: &maxMem,
				MaxSwapPercent:   &maxSwap,
			},
		},
		Docker: DockerPillarConfig{
			Enabled:                   true,
			SocketPath:                "/var/run/docker.sock",
			CollectContainerStats:     true,
			AlertOnContainerDown:      true,
			RequiredContainers:        []string{},
			IgnoreContainers:          []string{},
			MaxContainerCPUPercent:    &maxCPU,
			MaxContainerMemoryPercent: &maxContMem,
		},
		HttpEndpoints: []HttpEndpointCheckConfig{},
		Postgres: PostgresPillarConfig{
			Enabled:   false,
			Instances: []PostgresInstanceConfig{},
		},
		SMTP: shared.SMTPConfig{
			Enabled:       true,
			UseGlobalSMTP: true,
			Port:          587,
			ToEmails:      []string{},
		},
	}
}

type Server struct {
	ID             uuid.UUID              `json:"id"`
	Name           string                 `json:"name"`
	Description    string                 `json:"description"`
	APIKeyHash     string                 `json:"-"`
	APIKeyPlain    string                 `json:"-"`
	APIKeyPreview  string                 `json:"api_key_preview,omitempty"`
	Status         ServerStatus           `json:"status"`
	LastSeenAt     *time.Time             `json:"last_seen_at"`
	OSName         *string                `json:"os_name"`
	KernelVersion  *string                `json:"kernel_version"`
	IPv4Address    *string                `json:"ipv4_address"`
	RebootRequired bool                   `json:"reboot_required"`
	Config         ServerMonitoringConfig `json:"config"`
	CreatedAt      time.Time              `json:"created_at"`
	UpdatedAt      time.Time              `json:"updated_at"`
	DeletedAt      *time.Time             `json:"-"`
}

type CreateServerRequest struct {
	Name                  string `json:"name"`
	Description           string `json:"description"`
	CheckIntervalSeconds  int    `json:"check_interval_seconds"`
	ReportIntervalSeconds int    `json:"report_interval_seconds"`
}

type CreateServerResponse struct {
	Server Server `json:"server"`
	APIKey string `json:"api_key"`
}

type UpdateServerRequest struct {
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	Config      ServerMonitoringConfig `json:"config"`
}

type RotateApiKeyResponse struct {
	ServerID uuid.UUID `json:"server_id"`
	APIKey   string    `json:"api_key"`
}

type ServerYamlBundleResponse struct {
	ServerID        uuid.UUID `json:"server_id"`
	ServerName      string    `json:"server_name"`
	Filename        string    `json:"filename"`
	ConfigYaml      string    `json:"config_yaml"`
	SystemdService  string    `json:"systemd_service"`
	InstallCommands string    `json:"install_commands"`
}

// AgentYamlFile és l'estructura serialitzada al fitxer `/etc/rawcraft-agent/config.yaml`.
type AgentYamlFile struct {
	ServerID                   string                    `yaml:"server_id"`
	ServerName                 string                    `yaml:"server_name"`
	CentralURL                 string                    `yaml:"central_url"`
	APIKey                     string                    `yaml:"api_key"`
	CheckIntervalSeconds       int                       `yaml:"check_interval_seconds"`
	ReportIntervalSeconds      int                       `yaml:"report_interval_seconds"`
	CentralUnreachableFailures int                       `yaml:"central_unreachable_failures"`
	Host                       HostPillarConfig          `yaml:"host"`
	Docker                     DockerPillarConfig        `yaml:"docker"`
	HttpEndpoints              []HttpEndpointCheckConfig `yaml:"http_endpoints"`
	Postgres                   PostgresPillarConfig      `yaml:"postgres"`
	SMTP                       shared.SMTPConfig         `yaml:"smtp"`
}
