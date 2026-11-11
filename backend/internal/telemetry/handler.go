package telemetry

import (
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"rawcraft-monitor/backend/internal/server"
	"rawcraft-monitor/backend/internal/shared"
)

type Handler struct {
	service        *Service
	agentValidator shared.AgentKeyValidator
}

func NewHandler(service *Service, agentValidator shared.AgentKeyValidator) *Handler {
	return &Handler{
		service:        service,
		agentValidator: agentValidator,
	}
}

func (h *Handler) RegisterRoutes(v1 *gin.RouterGroup) {
	// Ingesta des de l'agent amb X-Agent-Key
	agentGroup := v1.Group("/agent")
	agentGroup.Use(shared.AgentAuthMiddleware(h.agentValidator))
	{
		agentGroup.POST("/telemetry", h.IngestTelemetry)
	}

	// Endpoints autenticats per a la Web
	authGroup := v1.Group("")
	authGroup.Use(shared.JWTAuthMiddleware())
	{
		authGroup.GET("/telemetry/dashboard", h.GetDashboardOverview)
		authGroup.GET("/servers/:id/telemetry/latest", h.GetServerLatestTelemetry)
		authGroup.GET("/servers/:id/telemetry/history", h.GetServerTelemetryHistory)
		authGroup.GET("/settings/retention", h.GetRetentionSettings)

		adminSettings := authGroup.Group("/settings")
		adminSettings.Use(shared.RequireAdminMiddleware())
		{
			adminSettings.PUT("/retention", h.UpdateRetentionSettings)
		}
	}
}

func (h *Handler) IngestTelemetry(c *gin.Context) {
	srvIDVal, exists := c.Get(shared.ContextAgentServerKey)
	if !exists {
		shared.RespondError(c, http.StatusUnauthorized, "INVALID_AGENT_KEY", "Agent no autenticat")
		return
	}
	authenticatedServerID := srvIDVal.(uuid.UUID)

	var req TelemetryIngestRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		shared.RespondError(c, http.StatusBadRequest, "INVALID_PAYLOAD", "Payload de telemetria invàlid")
		return
	}

	if err := h.service.IngestSnapshot(c.Request.Context(), authenticatedServerID, req); err != nil {
		shared.RespondError(c, http.StatusBadRequest, "INGEST_ERROR", err.Error())
		return
	}

	c.Status(http.StatusAccepted)
}

func (h *Handler) GetDashboardOverview(c *gin.Context) {
	userID, _ := shared.GetAuthUserID(c)
	role := shared.GetAuthUserRole(c)

	resp, err := h.service.GetDashboardOverview(c.Request.Context(), userID, role)
	if err != nil {
		shared.RespondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "Error carregant el Dashboard")
		return
	}

	c.JSON(http.StatusOK, resp)
}

func (h *Handler) GetServerLatestTelemetry(c *gin.Context) {
	serverID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		shared.RespondError(c, http.StatusNotFound, "NOT_FOUND", "Servidor no trobat")
		return
	}

	userID, _ := shared.GetAuthUserID(c)
	role := shared.GetAuthUserRole(c)

	resp, allowed, err := h.service.GetServerLatest(c.Request.Context(), userID, role, serverID)
	if err != nil {
		if errors.Is(err, server.ErrServerNotFound) {
			shared.RespondError(c, http.StatusNotFound, "NOT_FOUND", "Servidor no trobat")
			return
		}
		shared.RespondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "Error consultant la telemetria del servidor")
		return
	}
	if !allowed {
		shared.RespondError(c, http.StatusForbidden, "FORBIDDEN", "Sense permís per a aquest servidor")
		return
	}

	c.JSON(http.StatusOK, resp)
}

func (h *Handler) GetServerTelemetryHistory(c *gin.Context) {
	serverID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		shared.RespondError(c, http.StatusNotFound, "NOT_FOUND", "Servidor no trobat")
		return
	}

	userID, _ := shared.GetAuthUserID(c)
	role := shared.GetAuthUserRole(c)
	rangeParam := c.DefaultQuery("range", "24h")

	var fromTime, toTime *time.Time
	if fromStr := c.Query("from"); fromStr != "" {
		if t, err := time.Parse(time.RFC3339, fromStr); err == nil {
			fromTime = &t
		}
	}
	if toStr := c.Query("to"); toStr != "" {
		if t, err := time.Parse(time.RFC3339, toStr); err == nil {
			toTime = &t
		}
	}

	resp, allowed, err := h.service.GetServerHistory(c.Request.Context(), userID, role, serverID, rangeParam, fromTime, toTime)
	if err != nil {
		if errors.Is(err, server.ErrServerNotFound) {
			shared.RespondError(c, http.StatusNotFound, "NOT_FOUND", "Servidor no trobat")
			return
		}
		shared.RespondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "Error consultant l'històric del servidor")
		return
	}
	if !allowed {
		shared.RespondError(c, http.StatusForbidden, "FORBIDDEN", "Sense permís per a aquest servidor")
		return
	}

	c.JSON(http.StatusOK, resp)
}

func (h *Handler) GetRetentionSettings(c *gin.Context) {
	settings, err := h.service.GetRetentionSettings(c.Request.Context())
	if err != nil {
		shared.RespondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "Error consultant la retenció")
		return
	}
	c.JSON(http.StatusOK, settings)
}

func (h *Handler) UpdateRetentionSettings(c *gin.Context) {
	var req UpdateRetentionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		shared.RespondError(c, http.StatusBadRequest, "INVALID_PAYLOAD", "Payload de retenció invàlid")
		return
	}

	settings, err := h.service.UpdateRetentionSettings(c.Request.Context(), req.RetentionDays)
	if err != nil {
		if errors.Is(err, ErrInvalidRetention) {
			shared.RespondError(c, http.StatusBadRequest, "INVALID_RETENTION", err.Error())
			return
		}
		shared.RespondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "Error actualitzant la retenció")
		return
	}

	c.JSON(http.StatusOK, settings)
}
