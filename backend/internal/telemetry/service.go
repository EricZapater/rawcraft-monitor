package telemetry

import (
	"context"
	"errors"
	"log"
	"time"

	"github.com/google/uuid"

	"rawcraft-monitor/backend/internal/alert"
	"rawcraft-monitor/backend/internal/server"
	"rawcraft-monitor/backend/internal/user"
)

var (
	ErrInvalidRetention = errors.New("retention_days ha de ser com a mínim 7 dies")
)

type Service struct {
	repo          *Repository
	serverService *server.Service
	alertService  *alert.Service
	userService   *user.Service
}

func NewService(
	repo *Repository,
	serverService *server.Service,
	alertService *alert.Service,
	userService *user.Service,
) *Service {
	return &Service{
		repo:          repo,
		serverService: serverService,
		alertService:  alertService,
		userService:   userService,
	}
}

func (s *Service) IngestSnapshot(ctx context.Context, authenticatedServerID uuid.UUID, req TelemetryIngestRequest) error {
	req.ServerID = authenticatedServerID
	if req.RecordedAt.IsZero() {
		req.RecordedAt = time.Now()
	}

	srv, err := s.serverService.GetByIDInternal(ctx, authenticatedServerID)
	if err != nil {
		return err
	}

	if err := s.repo.InsertSnapshot(ctx, req); err != nil {
		return err
	}

	// Si el servidor estava marcat com a SERVER_OFFLINE, el resol automàticament (`HU-ALT-02`).
	s.alertService.ResolveServerOfflineIfFiring(ctx, srv)

	firingCount, _ := s.alertService.CountFiringByServer(ctx, authenticatedServerID)
	computedStatus := evaluateServerStatusFromSnapshot(req, firingCount)

	var osName, kernelVersion, ipv4 *string
	var rebootRequired bool
	if req.Host != nil {
		if req.Host.OSName != "" {
			osName = &req.Host.OSName
		}
		if req.Host.KernelVersion != "" {
			kernelVersion = &req.Host.KernelVersion
		}
		if req.Host.IPv4Address != "" {
			ipv4 = &req.Host.IPv4Address
		}
		rebootRequired = req.Host.RebootRequired
	}

	return s.serverService.UpdateTelemetryMetadata(
		ctx,
		authenticatedServerID,
		computedStatus,
		osName,
		kernelVersion,
		ipv4,
		rebootRequired,
		req.RecordedAt,
	)
}

func evaluateServerStatusFromSnapshot(req TelemetryIngestRequest, firingAlerts int) server.ServerStatus {
	if req.Docker != nil && !req.Docker.DockerDaemonUp {
		return server.StatusCritical
	}
	for _, ep := range req.HttpEndpoints {
		if !ep.Up {
			return server.StatusCritical
		}
	}
	for _, pg := range req.PostgresInstances {
		if !pg.Up {
			return server.StatusCritical
		}
	}
	if firingAlerts > 0 {
		return server.StatusWarning
	}
	if req.Host != nil && req.Host.RebootRequired {
		return server.StatusWarning
	}
	return server.StatusOnline
}

func (s *Service) GetDashboardOverview(ctx context.Context, userID uuid.UUID, role string) (*DashboardOverviewResponse, error) {
	servers, err := s.serverService.ListAuthorized(ctx, userID, role)
	if err != nil {
		return nil, err
	}

	overview := &DashboardOverviewResponse{
		TotalServers: len(servers),
		Servers:      make([]ServerDashboardSummary, 0, len(servers)),
	}

	for _, srv := range servers {
		if srv.Status == server.StatusOnline || srv.Status == server.StatusWarning {
			overview.OnlineServers++
		}

		activeAlerts, _ := s.alertService.CountFiringByServer(ctx, srv.ID)
		latest, _ := s.repo.GetLatestByServer(ctx, srv.ID)

		summary := ServerDashboardSummary{
			ServerID:              srv.ID,
			ServerName:            srv.Name,
			Description:           srv.Description,
			Status:                string(srv.Status),
			LastSeenAt:            srv.LastSeenAt,
			ReportIntervalSeconds: srv.Config.ReportIntervalSeconds,
			ActiveAlertsCount:     activeAlerts,
			RebootRequired:        srv.RebootRequired,
		}

		if latest != nil {
			summary.Host = latest.Host
			if latest.Host != nil {
				summary.RebootRequired = latest.Host.RebootRequired
			}
			if latest.Docker != nil {
				summary.DockerTotalHostContainers = latest.Docker.TotalHostContainers
				summary.DockerHostRunningCount = latest.Docker.RunningHostContainers
				summary.DockerHostStoppedCount = latest.Docker.StoppedHostContainers
				summary.DockerMonitoredCount = len(latest.Docker.Containers)

				for _, c := range latest.Docker.Containers {
					if c.State == "running" && c.Health != "unhealthy" {
						summary.DockerRunningCount++
						overview.TotalRunningContainers++
					} else {
						summary.DockerStoppedCount++
						overview.TotalDownContainers++
					}
				}
			}
			summary.HttpTotalCount = len(latest.HttpEndpoints)
			overview.HttpEndpointsTotal += len(latest.HttpEndpoints)
			totalLatency := 0
			for _, ep := range latest.HttpEndpoints {
				if ep.Up {
					summary.HttpOkCount++
					overview.HttpEndpointsOk++
				}
				totalLatency += ep.ResponseTimeMs
			}
			if len(latest.HttpEndpoints) > 0 {
				summary.HttpAvgLatencyMs = totalLatency / len(latest.HttpEndpoints)
			}

			summary.PostgresTotalCount = len(latest.PostgresInstances)
			overview.PostgresInstancesTotal += len(latest.PostgresInstances)
			for _, pg := range latest.PostgresInstances {
				if pg.Up {
					summary.PostgresUpCount++
					overview.PostgresInstancesUp++
				}
				if pg.ConnectionsPercent > summary.PostgresMaxConnPercent {
					summary.PostgresMaxConnPercent = pg.ConnectionsPercent
				}
				summary.PostgresTotalSizeMB += pg.DatabaseSizeMB
			}
		}

		overview.Servers = append(overview.Servers, summary)
	}

	return overview, nil
}

func (s *Service) GetServerLatest(ctx context.Context, userID uuid.UUID, role string, serverID uuid.UUID) (*ServerLiveDetailResponse, bool, error) {
	srv, allowed, err := s.serverService.GetAuthorizedByID(ctx, userID, role, serverID)
	if err != nil {
		return nil, false, err
	}
	if !allowed {
		return nil, false, nil
	}

	latest, err := s.repo.GetLatestByServer(ctx, serverID)
	if err != nil {
		return nil, true, err
	}

	resp := &ServerLiveDetailResponse{
		ServerID:          srv.ID,
		ServerName:        srv.Name,
		Status:            string(srv.Status),
		RecordedAt:        srv.LastSeenAt,
		HttpEndpoints:     []HttpEndpointSnapshot{},
		PostgresInstances: []PostgresInstanceSnapshot{},
	}

	if latest != nil {
		resp.RecordedAt = &latest.RecordedAt
		resp.Host = latest.Host
		resp.Docker = latest.Docker
		resp.HttpEndpoints = latest.HttpEndpoints
		resp.PostgresInstances = latest.PostgresInstances
	}

	return resp, true, nil
}

func (s *Service) GetServerHistory(
	ctx context.Context,
	userID uuid.UUID,
	role string,
	serverID uuid.UUID,
	rangeParam string,
	fromParam, toParam *time.Time,
) (*ServerHistoryResponse, bool, error) {
	_, allowed, err := s.serverService.GetAuthorizedByID(ctx, userID, role, serverID)
	if err != nil {
		return nil, false, err
	}
	if !allowed {
		return nil, false, nil
	}

	if rangeParam == "" {
		rangeParam = "24h"
	}

	now := time.Now()
	to := now
	if toParam != nil && !toParam.IsZero() {
		to = *toParam
	}

	var from time.Time
	if fromParam != nil && !fromParam.IsZero() {
		from = *fromParam
	} else {
		switch rangeParam {
		case "6h":
			from = to.Add(-6 * time.Hour)
		case "24h":
			from = to.Add(-24 * time.Hour)
		case "7d":
			from = to.Add(-7 * 24 * time.Hour)
		case "30d":
			from = to.Add(-30 * 24 * time.Hour)
		case "365d":
			from = to.Add(-365 * 24 * time.Hour)
		default:
			rangeParam = "24h"
			from = to.Add(-24 * time.Hour)
		}
	}

	records, err := s.repo.ListByServerAndWindow(ctx, serverID, from, to)
	if err != nil {
		return nil, true, err
	}

	// Downsampling si el nombre de mostres supera 240 punts (HU-TEL-04)
	const maxPoints = 240
	step := 1
	if len(records) > maxPoints {
		step = len(records) / maxPoints
		if step < 1 {
			step = 1
		}
	}

	points := make([]TelemetryHistoryPoint, 0, len(records)/step+1)
	for i := 0; i < len(records); i += step {
		rec := records[i]
		pt := TelemetryHistoryPoint{
			Timestamp:                  rec.RecordedAt,
			ContainersCPU:              map[string]float64{},
			ContainersMemoryMB:         map[string]float64{},
			HttpLatencyMs:              map[string]int{},
			PostgresConnectionsPercent: map[string]float64{},
			PostgresSizeMB:             map[string]float64{},
		}
		if rec.Host != nil {
			pt.Load1m = rec.Host.Load1m
			pt.Load5m = rec.Host.Load5m
			pt.Load15m = rec.Host.Load15m
			pt.MemoryPercent = rec.Host.MemoryPercent
			pt.SwapPercent = rec.Host.SwapPercent
			pt.ProcessesCount = rec.Host.ProcessesCount
			for _, d := range rec.Host.Disks {
				if d.MountPoint == "/" {
					pt.DiskRootPercent = d.UsedPercent
					break
				}
			}
			if pt.DiskRootPercent == 0 && len(rec.Host.Disks) > 0 {
				pt.DiskRootPercent = rec.Host.Disks[0].UsedPercent
			}
		}
		if rec.Docker != nil {
			for _, c := range rec.Docker.Containers {
				pt.ContainersCPU[c.Name] = c.CPUPercent
				pt.ContainersMemoryMB[c.Name] = c.MemoryUsedMB
			}
		}
		for _, ep := range rec.HttpEndpoints {
			pt.HttpLatencyMs[ep.Name] = ep.ResponseTimeMs
		}
		for _, pg := range rec.PostgresInstances {
			pt.PostgresConnectionsPercent[pg.Name] = pg.ConnectionsPercent
			pt.PostgresSizeMB[pg.Name] = pg.DatabaseSizeMB
		}
		points = append(points, pt)
	}

	return &ServerHistoryResponse{
		ServerID: serverID,
		Range:    rangeParam,
		Points:   points,
	}, true, nil
}

func (s *Service) GetRetentionSettings(ctx context.Context) (*RetentionSettings, error) {
	return s.repo.GetRetentionSettings(ctx)
}

func (s *Service) UpdateRetentionSettings(ctx context.Context, days int) (*RetentionSettings, error) {
	if days < 7 {
		return nil, ErrInvalidRetention
	}
	return s.repo.UpdateRetentionSettings(ctx, days)
}

func (s *Service) RunRetentionPurge(ctx context.Context) {
	settings, err := s.repo.GetRetentionSettings(ctx)
	if err != nil {
		log.Printf("[retention] Error llegint retention_days: %v", err)
		return
	}
	cutoff := time.Now().Add(-time.Duration(settings.RetentionDays) * 24 * time.Hour)
	snapsDeleted, err := s.repo.PurgeSnapshotsBefore(ctx, cutoff)
	if err != nil {
		log.Printf("[retention] Error purgant snapshots: %v", err)
	}
	alertsDeleted, err := s.alertService.PurgeResolvedBefore(ctx, cutoff)
	if err != nil {
		log.Printf("[retention] Error purgant alertes resoltes: %v", err)
	}
	if snapsDeleted > 0 || alertsDeleted > 0 {
		log.Printf("[retention] Purga completada (>%d dies): %d snapshots, %d alertes resoltes eliminades", settings.RetentionDays, snapsDeleted, alertsDeleted)
	}
}

// StartRetentionWorker executa el procés diari de purga d'històric segons `retention_days` (`HU-TEL-05`).
func (s *Service) StartRetentionWorker(ctx context.Context) {
	go func() {
		s.RunRetentionPurge(ctx)
		ticker := time.NewTicker(24 * time.Hour)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				s.RunRetentionPurge(ctx)
			}
		}
	}()
}
