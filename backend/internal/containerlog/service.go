package containerlog

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"

	"rawcraft-monitor/backend/internal/server"
)

var (
	ErrUnauthorizedServer = errors.New("sense permís per a aquest servidor")
	ErrInvalidContainer   = errors.New("nom de contenidor no vàlid")
)

type Service struct {
	repo          *Repository
	serverService *server.Service
}

func NewService(repo *Repository, serverService *server.Service) *Service {
	return &Service{
		repo:          repo,
		serverService: serverService,
	}
}

// Ingest rep un lot de logs enviats per l'agent i els persisteix a PostgreSQL.
func (s *Service) Ingest(ctx context.Context, authenticatedServerID uuid.UUID, req IngestContainerLogsRequest) error {
	req.ServerID = authenticatedServerID
	if len(req.Entries) == 0 {
		return nil
	}
	return s.repo.InsertBatch(ctx, authenticatedServerID, req.Entries)
}

// QueryLogs consulta logs d'un contenidor d'un servidor, verificant prèviament l'autorització de l'usuari.
func (s *Service) QueryLogs(
	ctx context.Context,
	userID uuid.UUID,
	role string,
	serverID uuid.UUID,
	containerName string,
	req QueryContainerLogsRequest,
) (*ContainerLogsResponse, bool, error) {
	srv, allowed, err := s.serverService.GetAuthorizedByID(ctx, userID, role, serverID)
	if err != nil {
		return nil, false, err
	}
	if !allowed || srv == nil {
		return nil, false, nil
	}

	entries, err := s.repo.QueryLogs(ctx, serverID, containerName, req)
	if err != nil {
		return nil, true, err
	}

	return &ContainerLogsResponse{
		ServerID:      serverID,
		ContainerName: containerName,
		Total:         len(entries),
		Entries:       entries,
	}, true, nil
}

// ListContainers retorna els contenidors que tenen logs emmagatzemats per a aquest servidor.
func (s *Service) ListContainers(ctx context.Context, userID uuid.UUID, role string, serverID uuid.UUID) ([]string, bool, error) {
	srv, allowed, err := s.serverService.GetAuthorizedByID(ctx, userID, role, serverID)
	if err != nil {
		return nil, false, err
	}
	if !allowed || srv == nil {
		return nil, false, nil
	}

	containers, err := s.repo.ListContainers(ctx, serverID)
	if err != nil {
		return nil, true, err
	}

	return containers, true, nil
}

// Purge elimina logs de contenidors més antics que el nombre de dies indicat (per defecte 30 dies).
func (s *Service) Purge(ctx context.Context, days int) (int64, error) {
	if days <= 0 {
		days = 30
	}
	cutoff := time.Now().Add(-time.Duration(days) * 24 * time.Hour)
	return s.repo.PurgeLogsBefore(ctx, cutoff)
}
