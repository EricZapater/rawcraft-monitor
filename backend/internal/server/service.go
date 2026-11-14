package server

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/goccy/go-yaml"
	"github.com/google/uuid"

	"rawcraft-monitor/backend/internal/shared"
	"rawcraft-monitor/backend/internal/user"
)

type Service struct {
	repo        *Repository
	userService *user.Service
}

func NewService(repo *Repository, userService *user.Service) *Service {
	return &Service{
		repo:        repo,
		userService: userService,
	}
}

func generateAPIKey() (plain, hash, preview string, err error) {
	b := make([]byte, 20)
	if _, err := rand.Read(b); err != nil {
		return "", "", "", err
	}
	rawHex := hex.EncodeToString(b)
	plain = "rcm_live_" + rawHex
	sum := sha256.Sum256([]byte(plain))
	hash = hex.EncodeToString(sum[:])
	preview = "rcm_live_" + rawHex[:6] + "..."
	return plain, hash, preview, nil
}

func hashAPIKey(plain string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(plain)))
	return hex.EncodeToString(sum[:])
}

func (s *Service) ValidateAgentKey(ctx context.Context, apiKey string) (uuid.UUID, error) {
	h := hashAPIKey(apiKey)
	srv, err := s.repo.GetByAPIKeyHash(ctx, h)
	if err != nil {
		return uuid.Nil, ErrInvalidAgentAuth
	}
	return srv.ID, nil
}

func (s *Service) ListAuthorized(ctx context.Context, userID uuid.UUID, role string) ([]Server, error) {
	if user.UserRole(role) == user.RoleAdmin {
		return s.repo.ListAll(ctx)
	}
	ids, err := s.userService.GetAuthorizedServerIDs(ctx, userID, role)
	if err != nil {
		return nil, err
	}
	return s.repo.ListByIDs(ctx, ids)
}

func (s *Service) ListAllActive(ctx context.Context) ([]Server, error) {
	return s.repo.ListAll(ctx)
}

func (s *Service) GetAuthorizedByID(ctx context.Context, userID uuid.UUID, role string, serverID uuid.UUID) (*Server, bool, error) {
	srv, err := s.repo.GetByID(ctx, serverID)
	if err != nil {
		return nil, false, err
	}
	allowed, err := s.userService.CanAccessServer(ctx, userID, role, serverID)
	if err != nil {
		return nil, false, err
	}
	if !allowed {
		return nil, false, nil
	}
	return srv, true, nil
}

func (s *Service) GetByIDInternal(ctx context.Context, serverID uuid.UUID) (*Server, error) {
	return s.repo.GetByID(ctx, serverID)
}

func (s *Service) Create(ctx context.Context, req CreateServerRequest) (*CreateServerResponse, error) {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return nil, ErrInvalidServerOp
	}

	plainKey, keyHash, keyPreview, err := generateAPIKey()
	if err != nil {
		return nil, err
	}

	srv := Server{
		ID:            uuid.New(),
		Name:          name,
		Description:   strings.TrimSpace(req.Description),
		APIKeyHash:    keyHash,
		APIKeyPlain:   plainKey,
		APIKeyPreview: keyPreview,
		Status:        StatusUnknown,
		Config:        DefaultMonitoringConfig(req.CheckIntervalSeconds, req.ReportIntervalSeconds),
	}

	if err := s.repo.Create(ctx, &srv); err != nil {
		return nil, err
	}

	return &CreateServerResponse{
		Server: srv,
		APIKey: plainKey,
	}, nil
}

func (s *Service) Update(ctx context.Context, serverID uuid.UUID, req UpdateServerRequest) (*Server, error) {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return nil, ErrInvalidServerOp
	}
	if req.Config.CheckIntervalSeconds <= 0 {
		req.Config.CheckIntervalSeconds = 15
	}
	if req.Config.ReportIntervalSeconds <= 0 {
		req.Config.ReportIntervalSeconds = 300
	}
	if req.Config.CentralUnreachableFailures <= 0 {
		req.Config.CentralUnreachableFailures = 3
	}

	for i := range req.Config.HttpEndpoints {
		req.Config.HttpEndpoints[i].URL = CleanEndpointURL(req.Config.HttpEndpoints[i].URL)
	}

	srv := &Server{
		ID:          serverID,
		Name:        name,
		Description: strings.TrimSpace(req.Description),
		Config:      req.Config,
	}

	if err := s.repo.Update(ctx, srv); err != nil {
		return nil, err
	}
	return srv, nil
}

func (s *Service) Delete(ctx context.Context, serverID uuid.UUID, confirmed bool) error {
	if !confirmed {
		return ErrInvalidServerOp
	}
	return s.repo.SoftDelete(ctx, serverID)
}

func (s *Service) RotateAPIKey(ctx context.Context, serverID uuid.UUID) (*RotateApiKeyResponse, error) {
	plainKey, keyHash, keyPreview, err := generateAPIKey()
	if err != nil {
		return nil, err
	}
	if err := s.repo.UpdateAPIKey(ctx, serverID, keyHash, plainKey, keyPreview); err != nil {
		return nil, err
	}
	return &RotateApiKeyResponse{
		ServerID: serverID,
		APIKey:   plainKey,
	}, nil
}

func (s *Service) RevealAPIKey(ctx context.Context, userID uuid.UUID, role string, serverID uuid.UUID, password string) (string, error) {
	if strings.TrimSpace(password) == "" {
		return "", errors.New("cal introduir la contrasenya")
	}
	if err := s.userService.VerifyUserPassword(ctx, userID, password); err != nil {
		return "", err
	}
	srv, allowed, err := s.GetAuthorizedByID(ctx, userID, role, serverID)
	if err != nil {
		return "", err
	}
	if !allowed || srv == nil {
		return "", ErrUnauthorizedServer
	}
	if srv.APIKeyPlain == "" {
		return "", errors.New("clau API no disponible")
	}
	return srv.APIKeyPlain, nil
}

func (s *Service) UpdateTelemetryMetadata(
	ctx context.Context,
	serverID uuid.UUID,
	status ServerStatus,
	osName, kernelVersion, ipv4 *string,
	rebootRequired bool,
	seenAt time.Time,
) error {
	return s.repo.UpdateTelemetryMetadata(ctx, serverID, status, osName, kernelVersion, ipv4, rebootRequired, seenAt)
}

func (s *Service) UpdateStatus(ctx context.Context, serverID uuid.UUID, status ServerStatus) error {
	return s.repo.UpdateStatus(ctx, serverID, status)
}

var nonAlnumRegex = regexp.MustCompile(`[^a-z0-9\-]+`)

func slugify(name string) string {
	s := strings.ToLower(strings.TrimSpace(name))
	s = strings.ReplaceAll(s, " ", "-")
	s = nonAlnumRegex.ReplaceAllString(s, "")
	s = strings.Trim(s, "-")
	if s == "" {
		return "server"
	}
	return s
}

// GenerateYamlBundle construeix el contingut de `config.yaml`, `rawcraft-agent.service` i les comandes d'instal·lació (`HU-SRV-03`, `HU-INF-04`).
func (s *Service) GenerateYamlBundle(ctx context.Context, serverID uuid.UUID, fallbackBaseURL string) (*ServerYamlBundleResponse, error) {
	srv, err := s.repo.GetByID(ctx, serverID)
	if err != nil {
		return nil, err
	}

	centralURL := os.Getenv("CENTRAL_PUBLIC_URL")
	if centralURL == "" {
		if fallbackBaseURL != "" {
			centralURL = fallbackBaseURL
		} else {
			centralURL = "https://api.monitor.ericzapater.cat"
		}
	}
	centralURL = strings.TrimRight(centralURL, "/")

	resolvedSMTP := shared.ResolveGlobalSMTP(srv.Config.SMTP)

	yamlStruct := AgentYamlFile{
		ServerID:                   srv.ID.String(),
		ServerName:                 srv.Name,
		CentralURL:                 centralURL,
		APIKey:                     srv.APIKeyPlain,
		CheckIntervalSeconds:       srv.Config.CheckIntervalSeconds,
		ReportIntervalSeconds:      srv.Config.ReportIntervalSeconds,
		CentralUnreachableFailures: srv.Config.CentralUnreachableFailures,
		Host:                       srv.Config.Host,
		Docker:                     srv.Config.Docker,
		HttpEndpoints:              srv.Config.HttpEndpoints,
		Postgres:                   srv.Config.Postgres,
		SMTP:                       resolvedSMTP,
	}

	yamlBytes, err := yaml.Marshal(yamlStruct)
	if err != nil {
		return nil, err
	}

	headerComment := fmt.Sprintf(
		"# Rawcraft Monitor Agent Configuration\n# Servidor: %s (%s)\n# Ubicació: /etc/rawcraft-agent/config.yaml (permisos 0600)\n\n",
		srv.Name, srv.ID.String(),
	)
	configYaml := headerComment + string(yamlBytes)

	systemdUnit := DefaultSystemdUnit()

	slug := slugify(srv.Name)
	filename := fmt.Sprintf("%s-config.yaml", slug)

	installCommands := fmt.Sprintf(`# 1. Descarregar el binari estàtic de l'agent directament del Punt Central
sudo curl -fsSL %s/api/v1/agent/binary -o /usr/local/bin/rawcraft-agent
sudo chmod 0755 /usr/local/bin/rawcraft-agent

# 2. Descarregar el config.yaml d'aquest servidor autenticat amb la seva API Key
sudo mkdir -p /etc/rawcraft-agent
sudo curl -fsSL -H "X-Agent-Key: %s" %s/api/v1/agent/config.yaml -o /etc/rawcraft-agent/config.yaml
sudo chmod 0600 /etc/rawcraft-agent/config.yaml

# 3. Descarregar la unitat systemd (amb límit GOMEMLIMIT=20MiB i MemoryMax=30M) i arrencar
sudo curl -fsSL %s/api/v1/agent/systemd.service -o /etc/systemd/system/rawcraft-agent.service
sudo systemctl daemon-reload
sudo systemctl enable --now rawcraft-agent
sudo systemctl status rawcraft-agent`, centralURL, srv.APIKeyPlain, centralURL, centralURL)

	return &ServerYamlBundleResponse{
		ServerID:        srv.ID,
		ServerName:      srv.Name,
		Filename:        filename,
		ConfigYaml:      configYaml,
		SystemdService:  systemdUnit,
		InstallCommands: installCommands,
	}, nil
}

// DefaultSystemdUnit retorna el contingut estàndard de `/etc/systemd/system/rawcraft-agent.service`.
func DefaultSystemdUnit() string {
	return `[Unit]
Description=Rawcraft Monitor Lightweight Agent
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
User=root
Environment="GOMEMLIMIT=20MiB"
ExecStart=/usr/local/bin/rawcraft-agent -config /etc/rawcraft-agent/config.yaml
Restart=always
RestartSec=5s
MemoryMax=30M
CPUQuota=5%
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
`
}

func (s *Service) RecordDeployment(ctx context.Context, serverID uuid.UUID, req CreateDeploymentRequest) (*Deployment, error) {
	if strings.TrimSpace(req.ProductName) == "" {
		return nil, errors.New("el camp 'product_name' és obligatori")
	}
	if strings.TrimSpace(req.Version) == "" {
		return nil, errors.New("el camp 'version' és obligatori")
	}

	srv, err := s.repo.GetByID(ctx, serverID)
	if err != nil {
		return nil, err
	}

	depAt := time.Now()
	if req.DeployedAt != nil && !req.DeployedAt.IsZero() {
		depAt = *req.DeployedAt
	}

	dep := &Deployment{
		ID:              uuid.New(),
		ServerID:        serverID,
		ServerName:      srv.Name,
		ProductName:     strings.TrimSpace(req.ProductName),
		Environment:     strings.TrimSpace(req.Environment),
		Version:         strings.TrimSpace(req.Version),
		CommitSHA:       req.CommitSHA,
		CommitMessage:   req.CommitMessage,
		Branch:          req.Branch,
		DeployedBy:      req.DeployedBy,
		Status:          req.Status,
		DurationSeconds: req.DurationSeconds,
		Details:         req.Details,
		DeployedAt:      depAt,
		CreatedAt:       time.Now(),
	}

	if err := s.repo.CreateDeployment(ctx, dep); err != nil {
		return nil, err
	}
	return dep, nil
}

func (s *Service) ListDeployments(ctx context.Context, serverID uuid.UUID, limit, offset int) ([]Deployment, int, error) {
	if _, err := s.repo.GetByID(ctx, serverID); err != nil {
		return nil, 0, err
	}
	return s.repo.ListDeploymentsByServer(ctx, serverID, limit, offset)
}
