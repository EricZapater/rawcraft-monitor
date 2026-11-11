package agent

import (
	"fmt"
	"os"
	"strings"

	"github.com/goccy/go-yaml"

	"rawcraft-monitor/backend/internal/server"
	"rawcraft-monitor/backend/internal/shared"
)

// Config representa l'estructura del fitxer `/etc/rawcraft-agent/config.yaml`.
type Config struct {
	ServerID                   string                           `yaml:"server_id"`
	ServerName                 string                           `yaml:"server_name"`
	CentralURL                 string                           `yaml:"central_url"`
	APIKey                     string                           `yaml:"api_key"`
	CheckIntervalSeconds       int                              `yaml:"check_interval_seconds"`
	ReportIntervalSeconds      int                              `yaml:"report_interval_seconds"`
	CentralUnreachableFailures int                              `yaml:"central_unreachable_failures"`
	Host                       server.HostPillarConfig          `yaml:"host"`
	Docker                     server.DockerPillarConfig        `yaml:"docker"`
	HttpEndpoints              []server.HttpEndpointCheckConfig `yaml:"http_endpoints"`
	Postgres                   server.PostgresPillarConfig      `yaml:"postgres"`
	SMTP                       shared.SMTPConfig                `yaml:"smtp"`
}

// LoadConfig llegeix i valida el fitxer YAML de configuració de l'agent.
func LoadConfig(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("error llegint %s: %w", path, err)
	}
	return ParseConfigBytes(data)
}

// ParseConfigBytes parseja els bytes YAML de configuració i aplica valors per defecte segurs.
func ParseConfigBytes(data []byte) (*Config, error) {
	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("error parsejant YAML: %w", err)
	}

	cfg.CentralURL = strings.TrimRight(strings.TrimSpace(cfg.CentralURL), "/")
	if cfg.CheckIntervalSeconds <= 0 {
		cfg.CheckIntervalSeconds = 15
	}
	if cfg.ReportIntervalSeconds <= 0 {
		cfg.ReportIntervalSeconds = 300
	}
	if cfg.CentralUnreachableFailures <= 0 {
		cfg.CentralUnreachableFailures = 3
	}
	if cfg.Host.Thresholds.SustainedChecks <= 0 {
		cfg.Host.Thresholds.SustainedChecks = 4
	}
	if len(cfg.Host.MountPoints) == 0 {
		cfg.Host.MountPoints = []string{"/"}
	}
	if cfg.Docker.SocketPath == "" {
		cfg.Docker.SocketPath = "/var/run/docker.sock"
	}

	return &cfg, nil
}
