package alert

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/google/uuid"

	"rawcraft-monitor/backend/internal/server"
	"rawcraft-monitor/backend/internal/shared"
	"rawcraft-monitor/backend/internal/user"
)

const heartbeatOfflineFingerprint = "heartbeat:server_offline"

type Service struct {
	repo          *Repository
	serverService *server.Service
	userService   *user.Service
}

func NewService(repo *Repository, serverService *server.Service, userService *user.Service) *Service {
	return &Service{
		repo:          repo,
		serverService: serverService,
		userService:   userService,
	}
}

func (s *Service) ReportAgentAlertEvent(ctx context.Context, authenticatedServerID uuid.UUID, req AgentAlertEventRequest) (*Alert, error) {
	req.ServerID = authenticatedServerID
	if strings.TrimSpace(req.Fingerprint) == "" || strings.TrimSpace(req.TargetName) == "" || strings.TrimSpace(req.Title) == "" {
		return nil, errors.New("falten camps obligatoris a l'alerta")
	}

	srv, err := s.serverService.GetByIDInternal(ctx, authenticatedServerID)
	if err != nil {
		return nil, err
	}

	var result *Alert
	var stateTransition bool

	if req.Status == StatusFiring {
		result, stateTransition, err = s.repo.UpsertFiringAlert(ctx, req, srv.Name)
		if err != nil {
			return nil, err
		}
		if req.Severity == SeverityCritical {
			_ = s.serverService.UpdateStatus(ctx, srv.ID, server.StatusCritical)
		} else if srv.Status == server.StatusOnline || srv.Status == server.StatusUnknown {
			_ = s.serverService.UpdateStatus(ctx, srv.ID, server.StatusWarning)
		}
	} else {
		result, stateTransition, err = s.repo.ResolveAlert(ctx, req, srv.Name)
		if err != nil {
			return nil, err
		}
	}

	if stateTransition && !req.SMTPSentByAgent {
		subject := fmt.Sprintf("[Rawcraft Monitor] [%s] %s — %s", req.Status, srv.Name, req.Title)
		body := fmt.Sprintf(
			"Servidor: %s (%s)\nEstat: %s\nCategoria: %s\nSeveritat: %s\nRecurs: %s\nMissatge: %s\nData: %s\n",
			srv.Name, srv.ID.String(), req.Status, req.Category, req.Severity,
			req.TargetName, req.Message, time.Now().Format(time.RFC3339),
		)
		smtpCfg := srv.Config.SMTP
		go func() {
			if err := shared.SendAlertEmail(smtpCfg, subject, body); err != nil {
				log.Printf("[alert] Error enviant correu SMTP per a %s: %v", srv.Name, err)
			}
		}()
	}

	return result, nil
}

func (s *Service) ListAuthorized(ctx context.Context, userID uuid.UUID, role string, filter AlertFilter) (*AlertsListResponse, error) {
	servers, err := s.serverService.ListAuthorized(ctx, userID, role)
	if err != nil {
		return nil, err
	}
	authIDs := make([]uuid.UUID, 0, len(servers))
	for _, srv := range servers {
		authIDs = append(authIDs, srv.ID)
	}
	filter.ServerIDs = authIDs

	items, activeCount, err := s.repo.List(ctx, filter)
	if err != nil {
		return nil, err
	}

	return &AlertsListResponse{
		ActiveFiringCount: activeCount,
		Items:             items,
	}, nil
}

func (s *Service) Acknowledge(ctx context.Context, userID uuid.UUID, role, userEmail string, alertID uuid.UUID) (*Alert, bool, error) {
	existing, err := s.repo.GetByID(ctx, alertID)
	if err != nil {
		return nil, false, err
	}

	allowed, err := s.userService.CanAccessServer(ctx, userID, role, existing.ServerID)
	if err != nil {
		return nil, false, err
	}
	if !allowed {
		return nil, false, nil
	}

	updated, err := s.repo.Acknowledge(ctx, alertID, userEmail)
	if err != nil {
		return nil, true, err
	}
	return updated, true, nil
}

func (s *Service) ManualResolve(ctx context.Context, userID uuid.UUID, role, userEmail string, alertID uuid.UUID) (*Alert, bool, error) {
	existing, err := s.repo.GetByID(ctx, alertID)
	if err != nil {
		return nil, false, err
	}

	allowed, err := s.userService.CanAccessServer(ctx, userID, role, existing.ServerID)
	if err != nil {
		return nil, false, err
	}
	if !allowed {
		return nil, false, nil
	}

	updated, err := s.repo.ManualResolve(ctx, alertID, userEmail)
	if err != nil {
		return nil, true, err
	}
	return updated, true, nil
}

// ResolveResourceAlertIfFiring tanca una alerta pel seu fingerprint si està en estat FIRING.
func (s *Service) ResolveResourceAlertIfFiring(
	ctx context.Context,
	serverID uuid.UUID,
	serverName string,
	fingerprint string,
	category AlertCategory,
	targetName string,
	title string,
	message string,
	currentVal string,
) {
	existing, err := s.repo.GetFiringByFingerprint(ctx, serverID, fingerprint)
	if err != nil || existing == nil {
		return
	}

	req := AgentAlertEventRequest{
		ServerID:     serverID,
		Fingerprint:  fingerprint,
		Status:       StatusResolved,
		Category:     category,
		Severity:     existing.Severity,
		TargetName:   targetName,
		Title:        title,
		Message:      message,
		CurrentValue: &currentVal,
		OccurredAt:   time.Now(),
	}

	_, _, _ = s.repo.ResolveAlert(ctx, req, serverName)
}

func (s *Service) CountFiringByServer(ctx context.Context, serverID uuid.UUID) (int, error) {
	return s.repo.CountFiringByServer(ctx, serverID)
}

func (s *Service) PurgeResolvedBefore(ctx context.Context, cutoff time.Time) (int64, error) {
	return s.repo.PurgeResolvedBefore(ctx, cutoff)
}

// ResolveServerOfflineIfFiring tanca l'alerta SERVER_OFFLINE quan un servidor torna a enviar telemetria.
func (s *Service) ResolveServerOfflineIfFiring(ctx context.Context, srv *server.Server) {
	existing, err := s.repo.GetFiringByFingerprint(ctx, srv.ID, heartbeatOfflineFingerprint)
	if err != nil || existing == nil {
		return
	}

	curVal := "ONLINE"
	req := AgentAlertEventRequest{
		ServerID:     srv.ID,
		Fingerprint:  heartbeatOfflineFingerprint,
		Status:       StatusResolved,
		Category:     CategoryHeartbeat,
		Severity:     SeverityCritical,
		TargetName:   srv.Name,
		Title:        "SERVER_ONLINE: El servidor torna a reportar telemetria",
		Message:      fmt.Sprintf("El servidor %s ha reprès l'enviament de telemetria al Punt Central.", srv.Name),
		CurrentValue: &curVal,
		OccurredAt:   time.Now(),
	}

	_, transitioned, err := s.repo.ResolveAlert(ctx, req, srv.Name)
	if err == nil && transitioned {
		subject := fmt.Sprintf("[Rawcraft Monitor] [RESOLVED] %s — El servidor torna a estar ONLINE", srv.Name)
		body := fmt.Sprintf("El servidor %s (%s) ha reprès l'enviament de telemetria a %s.", srv.Name, srv.ID, time.Now().Format(time.RFC3339))
		_ = shared.SendAlertEmail(srv.Config.SMTP, subject, body)
	}
}

// EvaluateServerHeartbeat comprova tots els servidors actius i dispara SERVER_OFFLINE si superen 2.5 * report_interval_seconds.
func (s *Service) EvaluateServerHeartbeat(ctx context.Context) {
	servers, err := s.serverService.ListAllActive(ctx)
	if err != nil {
		log.Printf("[heartbeat] Error llistant servidors actius: %v", err)
		return
	}

	now := time.Now()
	for i := range servers {
		srv := servers[i]
		if srv.LastSeenAt == nil {
			continue
		}

		reportSec := srv.Config.ReportIntervalSeconds
		if reportSec <= 0 {
			reportSec = 300
		}
		maxSilence := time.Duration(float64(reportSec)*2.5) * time.Second
		silence := now.Sub(*srv.LastSeenAt)

		if silence > maxSilence {
			if srv.Status != server.StatusOffline {
				_ = s.serverService.UpdateStatus(ctx, srv.ID, server.StatusOffline)
			}
			curVal := fmt.Sprintf("%.0fs sense resposta", silence.Seconds())
			threshVal := fmt.Sprintf("%.0fs", maxSilence.Seconds())
			req := AgentAlertEventRequest{
				ServerID:       srv.ID,
				Fingerprint:    heartbeatOfflineFingerprint,
				Status:         StatusFiring,
				Category:       CategoryHeartbeat,
				Severity:       SeverityCritical,
				TargetName:     srv.Name,
				Title:          "SERVER_OFFLINE: El servidor ha deixat de reportar al Punt Central",
				Message:        fmt.Sprintf("El servidor %s porta %s sense enviar cap snapshot de telemetria (llindar: %s).", srv.Name, curVal, threshVal),
				CurrentValue:   &curVal,
				ThresholdValue: &threshVal,
				OccurredAt:     now,
			}
			_, newlyCreated, err := s.repo.UpsertFiringAlert(ctx, req, srv.Name)
			if err == nil && newlyCreated {
				subject := fmt.Sprintf("[Rawcraft Monitor] [FIRING] %s — SERVER_OFFLINE", srv.Name)
				_ = shared.SendAlertEmail(srv.Config.SMTP, subject, req.Message)
			}
		}
	}
}

// StartHeartbeatWorker inicia el bucle de comprovació de Heartbeat cada minut (`HU-ALT-02`).
func (s *Service) StartHeartbeatWorker(ctx context.Context) {
	ticker := time.NewTicker(1 * time.Minute)
	go func() {
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				s.EvaluateServerHeartbeat(ctx)
			}
		}
	}()
}
