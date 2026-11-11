package alert

import (
	"time"

	"github.com/google/uuid"
)

type AlertStatus string

const (
	StatusFiring   AlertStatus = "FIRING"
	StatusResolved AlertStatus = "RESOLVED"
)

type AlertCategory string

const (
	CategoryHost         AlertCategory = "HOST"
	CategoryDocker       AlertCategory = "DOCKER"
	CategoryHttpEndpoint AlertCategory = "HTTP_ENDPOINT"
	CategoryPostgres     AlertCategory = "POSTGRES"
	CategoryHeartbeat    AlertCategory = "HEARTBEAT"
)

type AlertSeverity string

const (
	SeverityWarning  AlertSeverity = "WARNING"
	SeverityCritical AlertSeverity = "CRITICAL"
)

type AgentAlertEventRequest struct {
	ServerID        uuid.UUID     `json:"server_id"`
	Fingerprint     string        `json:"fingerprint"`
	Status          AlertStatus   `json:"status"`
	Category        AlertCategory `json:"category"`
	Severity        AlertSeverity `json:"severity"`
	TargetName      string        `json:"target_name"`
	Title           string        `json:"title"`
	Message         string        `json:"message"`
	CurrentValue    *string       `json:"current_value"`
	ThresholdValue  *string       `json:"threshold_value"`
	SMTPSentByAgent bool          `json:"smtp_sent_by_agent"`
	OccurredAt      time.Time     `json:"occurred_at"`
}

type Alert struct {
	ID             uuid.UUID     `json:"id"`
	ServerID       uuid.UUID     `json:"server_id"`
	ServerName     string        `json:"server_name"`
	Fingerprint    string        `json:"fingerprint"`
	Status         AlertStatus   `json:"status"`
	Category       AlertCategory `json:"category"`
	Severity       AlertSeverity `json:"severity"`
	TargetName     string        `json:"target_name"`
	Title          string        `json:"title"`
	Message        string        `json:"message"`
	CurrentValue   *string       `json:"current_value"`
	ThresholdValue *string       `json:"threshold_value"`
	Acknowledged   bool          `json:"acknowledged"`
	AcknowledgedBy *string       `json:"acknowledged_by"`
	AcknowledgedAt *time.Time    `json:"acknowledged_at"`
	FiredAt        time.Time     `json:"fired_at"`
	ResolvedAt     *time.Time    `json:"resolved_at"`
}

type AlertsListResponse struct {
	ActiveFiringCount int     `json:"active_firing_count"`
	Items             []Alert `json:"items"`
}

type AlertFilter struct {
	ServerIDs []uuid.UUID
	ServerID  *uuid.UUID
	Status    string
	Category  string
	Severity  string
	Limit     int
}
