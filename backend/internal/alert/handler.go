package alert

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

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
	// Endpoint per a l'agent (autenticat amb X-Agent-Key)
	agentGroup := v1.Group("/agent")
	agentGroup.Use(shared.AgentAuthMiddleware(h.agentValidator))
	{
		agentGroup.POST("/alerts", h.ReportAgentAlertEvent)
	}

	// Endpoints web (autenticats amb JWT)
	alertsGroup := v1.Group("/alerts")
	alertsGroup.Use(shared.JWTAuthMiddleware())
	{
		alertsGroup.GET("", h.ListAlerts)
		alertsGroup.POST("/:id/acknowledge", h.AcknowledgeAlert)
	}
}

func (h *Handler) ReportAgentAlertEvent(c *gin.Context) {
	srvIDVal, exists := c.Get(shared.ContextAgentServerKey)
	if !exists {
		shared.RespondError(c, http.StatusUnauthorized, "INVALID_AGENT_KEY", "Agent no autenticat")
		return
	}
	authenticatedServerID := srvIDVal.(uuid.UUID)

	var req AgentAlertEventRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		shared.RespondError(c, http.StatusBadRequest, "INVALID_PAYLOAD", "Payload d'alerta invàlid")
		return
	}

	a, err := h.service.ReportAgentAlertEvent(c.Request.Context(), authenticatedServerID, req)
	if err != nil {
		shared.RespondError(c, http.StatusBadRequest, "ALERT_ERROR", err.Error())
		return
	}

	c.JSON(http.StatusOK, a)
}

func (h *Handler) ListAlerts(c *gin.Context) {
	userID, _ := shared.GetAuthUserID(c)
	role := shared.GetAuthUserRole(c)

	var filter AlertFilter
	if srvStr := c.Query("server_id"); srvStr != "" {
		if parsed, err := uuid.Parse(srvStr); err == nil {
			filter.ServerID = &parsed
		}
	}
	filter.Status = c.Query("status")
	filter.Category = c.Query("category")
	filter.Severity = c.Query("severity")
	if limStr := c.Query("limit"); limStr != "" {
		if l, err := strconv.Atoi(limStr); err == nil {
			filter.Limit = l
		}
	}

	resp, err := h.service.ListAuthorized(c.Request.Context(), userID, role, filter)
	if err != nil {
		shared.RespondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "Error consultant el llistat d'alertes")
		return
	}

	c.JSON(http.StatusOK, resp)
}

func (h *Handler) AcknowledgeAlert(c *gin.Context) {
	alertID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		shared.RespondError(c, http.StatusNotFound, "NOT_FOUND", "Alerta no trobada")
		return
	}

	userID, _ := shared.GetAuthUserID(c)
	role := shared.GetAuthUserRole(c)
	email := shared.GetAuthUserEmail(c)

	a, allowed, err := h.service.Acknowledge(c.Request.Context(), userID, role, email, alertID)
	if err != nil {
		if errors.Is(err, ErrAlertNotFound) {
			shared.RespondError(c, http.StatusNotFound, "NOT_FOUND", "Alerta no trobada")
			return
		}
		shared.RespondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "Error reconeixent l'alerta")
		return
	}
	if !allowed {
		shared.RespondError(c, http.StatusForbidden, "FORBIDDEN", "Sense permís per al servidor d'aquesta alerta")
		return
	}

	c.JSON(http.StatusOK, a)
}
