package server

import (
	"strings"
	"testing"

	"github.com/goccy/go-yaml"
)

func TestGenerateAndHashAPIKey(t *testing.T) {
	plain, hash, preview, err := generateAPIKey()
	if err != nil {
		t.Fatalf("error generant API Key: %v", err)
	}
	if !strings.HasPrefix(plain, "rcm_live_") {
		t.Errorf("prefix inesperat a l'API Key: %s", plain)
	}
	if !strings.HasSuffix(preview, "...") {
		t.Errorf("preview inesperat: %s", preview)
	}
	if hashAPIKey(plain) != hash {
		t.Errorf("el hash SHA-256 de la clau no coincideix")
	}
}

func TestDefaultMonitoringConfigYamlSerialization(t *testing.T) {
	cfg := DefaultMonitoringConfig(15, 300)
	yamlBundle := AgentYamlFile{
		ServerID:                   "550e8400-e29b-41d4-a716-446655440000",
		ServerName:                 "Prod VPS 01",
		CentralURL:                 "https://monitor.rawcraft.cat",
		APIKey:                     "rcm_live_123456",
		CheckIntervalSeconds:       cfg.CheckIntervalSeconds,
		ReportIntervalSeconds:      cfg.ReportIntervalSeconds,
		CentralUnreachableFailures: cfg.CentralUnreachableFailures,
		Host:                       cfg.Host,
		Docker:                     cfg.Docker,
		HttpEndpoints:              cfg.HttpEndpoints,
		Postgres:                   cfg.Postgres,
		SMTP:                       cfg.SMTP,
	}

	out, err := yaml.Marshal(yamlBundle)
	if err != nil {
		t.Fatalf("error serialitzant AgentYamlFile a YAML: %v", err)
	}

	str := string(out)
	if !strings.Contains(str, "server_id: 550e8400-e29b-41d4-a716-446655440000") {
		t.Errorf("el YAML generat no conté server_id: %s", str)
	}
	if !strings.Contains(str, "/var/run/docker.sock") {
		t.Errorf("el YAML generat no conté socket_path: %s", str)
	}

	if slug := slugify("Prod VPS 01!"); slug != "prod-vps-01" {
		t.Errorf("slugify inesperat: %s", slug)
	}
}
