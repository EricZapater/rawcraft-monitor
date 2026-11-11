package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"runtime"
	"time"

	"github.com/google/uuid"

	"rawcraft-monitor/backend/internal/shared"
	"rawcraft-monitor/backend/internal/telemetry"
)

// Runner coordina el doble bucle de l'agent:
// 1. Bucle ràpid (Watchdog) cada `check_interval_seconds`
// 2. Bucle lent (Snapshot) cada `report_interval_seconds`
type Runner struct {
	cfg                    *Config
	evaluator              *Evaluator
	httpClient             *http.Client
	consecutiveHubFailures int
	hubUnreachableFiring   bool
}

func NewRunner(cfg *Config) *Runner {
	return &Runner{
		cfg:       cfg,
		evaluator: NewEvaluator(),
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
			Transport: &http.Transport{
				DisableKeepAlives: true,
			},
		},
	}
}

func (r *Runner) Run(ctx context.Context) {
	checkDur := time.Duration(r.cfg.CheckIntervalSeconds) * time.Second
	reportDur := time.Duration(r.cfg.ReportIntervalSeconds) * time.Second

	log.Printf("[agent] Iniciant rawcraft-agent per a '%s' (%s): check=%s, report=%s",
		r.cfg.ServerName, r.cfg.ServerID, checkDur, reportDur)

	// Primera execució immediata en arrencar
	r.runWatchdogAndMaybeReport(ctx, true)

	checkTicker := time.NewTicker(checkDur)
	reportTicker := time.NewTicker(reportDur)
	defer checkTicker.Stop()
	defer reportTicker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("[agent] Aturant bucle de monitorització...")
			return
		case <-checkTicker.C:
			r.runWatchdogAndMaybeReport(ctx, false)
		case <-reportTicker.C:
			r.runWatchdogAndMaybeReport(ctx, true)
		}
	}
}

func (r *Runner) runWatchdogAndMaybeReport(ctx context.Context, sendSnapshot bool) {
	hostSnap := CollectHostMetrics(r.cfg.Host)
	dockerSnap := CollectDockerMetrics(ctx, r.cfg.Docker)
	httpSnaps := CollectHttpEndpoints(ctx, r.cfg.HttpEndpoints)
	pgSnaps := CollectPostgresMetrics(ctx, r.cfg.Postgres)

	// 1. Bucle ràpid: Avaluar regles i disparar alertes SMTP + push immediat
	transitions := r.evaluator.Evaluate(r.cfg, hostSnap, dockerSnap, httpSnaps, pgSnaps)
	for _, ev := range transitions {
		subject := fmt.Sprintf("[Rawcraft Agent] [%s] %s — %s", ev.Status, r.cfg.ServerName, ev.Title)
		body := fmt.Sprintf(
			"Servidor: %s (%s)\nEstat: %s\nCategoria: %s\nSeveritat: %s\nRecurs: %s\nMissatge: %s\nData: %s\n",
			r.cfg.ServerName, r.cfg.ServerID, ev.Status, ev.Category, ev.Severity,
			ev.TargetName, ev.Message, ev.OccurredAt.Format(time.RFC3339),
		)
		if err := shared.SendAlertEmail(r.cfg.SMTP, subject, body); err == nil {
			ev.SMTPSentByAgent = true
		} else {
			log.Printf("[agent] Error enviant correu SMTP d'alerta: %v", err)
		}

		if err := r.postJSON(ctx, "/api/v1/agent/alerts", ev); err != nil {
			log.Printf("[agent] Error notificant alerta al Punt Central: %v", err)
		}
	}

	// 2. Bucle lent: Enviar fotografia completa de telemetria
	if sendSnapshot {
		srvUUID, _ := uuid.Parse(r.cfg.ServerID)
		payload := telemetry.TelemetryIngestRequest{
			ServerID:          srvUUID,
			RecordedAt:        time.Now().UTC(),
			Host:              hostSnap,
			Docker:            dockerSnap,
			HttpEndpoints:     httpSnaps,
			PostgresInstances: pgSnaps,
		}

		if err := r.postJSON(ctx, "/api/v1/agent/telemetry", payload); err != nil {
			r.handleHubFailure(err)
		} else {
			r.handleHubRecovery()
		}
	}

	// Alliberar referències temporals per mantenir la petjada de RAM sota GOMEMLIMIT=20MiB
	runtime.GC()
}

func (r *Runner) postJSON(ctx context.Context, path string, body interface{}) error {
	if r.cfg.CentralURL == "" {
		return fmt.Errorf("central_url buit")
	}

	b, err := json.Marshal(body)
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, r.cfg.CentralURL+path, bytes.NewReader(b))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Agent-Key", r.cfg.APIKey)

	resp, err := r.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer func() {
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
		_ = resp.Body.Close()
	}()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("codi HTTP inesperat del Punt Central: %d", resp.StatusCode)
	}
	return nil
}

func (r *Runner) handleHubFailure(err error) {
	r.consecutiveHubFailures++
	log.Printf("[agent] Error enviant telemetria al Punt Central (%d/%d): %v",
		r.consecutiveHubFailures, r.cfg.CentralUnreachableFailures, err)

	if !r.hubUnreachableFiring && r.consecutiveHubFailures >= r.cfg.CentralUnreachableFailures {
		r.hubUnreachableFiring = true
		subject := fmt.Sprintf("[Rawcraft Agent] [FIRING] CENTRAL_UNREACHABLE des de %s", r.cfg.ServerName)
		body := fmt.Sprintf(
			"L'agent del servidor %s (%s) ha acumulat %d intents fallits consecutius en intentar contactar amb el Punt Central (%s).\nÚltim error: %v\nData: %s\n",
			r.cfg.ServerName, r.cfg.ServerID, r.consecutiveHubFailures, r.cfg.CentralURL, err, time.Now().Format(time.RFC3339),
		)
		_ = shared.SendAlertEmail(r.cfg.SMTP, subject, body)
	}
}

func (r *Runner) handleHubRecovery() {
	if r.hubUnreachableFiring {
		r.hubUnreachableFiring = false
		subject := fmt.Sprintf("[Rawcraft Agent] [RESOLVED] CENTRAL_UNREACHABLE recuperat des de %s", r.cfg.ServerName)
		body := fmt.Sprintf(
			"L'agent del servidor %s (%s) ha restablert la connexió amb el Punt Central (%s) després de %d errors.\nData: %s\n",
			r.cfg.ServerName, r.cfg.ServerID, r.cfg.CentralURL, r.consecutiveHubFailures, time.Now().Format(time.RFC3339),
		)
		_ = shared.SendAlertEmail(r.cfg.SMTP, subject, body)
	}
	r.consecutiveHubFailures = 0
}
