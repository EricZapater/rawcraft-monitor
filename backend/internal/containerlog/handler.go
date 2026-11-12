package containerlog

import (
	"errors"
	"net/http"

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
		agentGroup.POST("/logs", h.IngestLogs)
	}

	// Endpoints autenticats per a la Web
	authGroup := v1.Group("")
	authGroup.Use(shared.JWTAuthMiddleware())
	{
		authGroup.GET("/servers/:id/logs/containers", h.ListLogContainers)
		authGroup.GET("/servers/:id/containers/:name/logs", h.GetContainerLogs)
	}
}

// IngestLogs rep un bloc de logs de contenidors enviats per l'agent.
func (h *Handler) IngestLogs(c *gin.Context) {
	srvIDVal, exists := c.Get(shared.ContextAgentServerKey)
	if !exists {
		shared.RespondError(c, http.StatusUnauthorized, "INVALID_AGENT_KEY", "Agent no autenticat")
		return
	}
	authenticatedServerID := srvIDVal.(uuid.UUID)

	var req IngestContainerLogsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		shared.RespondError(c, http.StatusBadRequest, "BAD_REQUEST", "Format de logs invàlid: "+err.Error())
		return
	}

	if err := h.service.Ingest(c.Request.Context(), authenticatedServerID, req); err != nil {
		shared.RespondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "Error registrant logs: "+err.Error())
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status":  "ok",
		"ingested": len(req.Entries),
	})
}

// ListLogContainers retorna tots els noms de contenidors que tenen logs emmagatzemats per a aquest servidor.
func (h *Handler) ListLogContainers(c *gin.Context) {
	serverID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		shared.RespondError(c, http.StatusNotFound, "NOT_FOUND", "Servidor no trobat")
		return
	}

	userID, _ := shared.GetAuthUserID(c)
	role := shared.GetAuthUserRole(c)

	containers, allowed, err := h.service.ListContainers(c.Request.Context(), userID, role, serverID)
	if err != nil {
		if errors.Is(err, server.ErrServerNotFound) {
			shared.RespondError(c, http.StatusNotFound, "NOT_FOUND", "Servidor no trobat")
			return
		}
		shared.RespondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "Error consultant contenidors: "+err.Error())
		return
	}
	if !allowed {
		shared.RespondError(c, http.StatusForbidden, "FORBIDDEN", "Sense permís per a aquest servidor")
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"server_id":  serverID,
		"containers": containers,
	})
}

// GetContainerLogs consulta i retorna logs filtrats per a un contenidor específic.
func (h *Handler) GetContainerLogs(c *gin.Context) {
	serverID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		shared.RespondError(c, http.StatusNotFound, "NOT_FOUND", "Servidor no trobat")
		return
	}
	containerName := c.Param("name")
	if containerName == "" {
		shared.RespondError(c, http.StatusBadRequest, "BAD_REQUEST", "Nom de contenidor requerit")
		return
	}

	var req QueryContainerLogsRequest
	if err := c.ShouldBindQuery(&req); err != nil {
		shared.RespondError(c, http.StatusBadRequest, "BAD_REQUEST", "Filtres invàlids: "+err.Error())
		return
	}

	userID, _ := shared.GetAuthUserID(c)
	role := shared.GetAuthUserRole(c)

	resp, allowed, err := h.service.QueryLogs(c.Request.Context(), userID, role, serverID, containerName, req)
	if err != nil {
		if errors.Is(err, server.ErrServerNotFound) {
			shared.RespondError(c, http.StatusNotFound, "NOT_FOUND", "Servidor no trobat")
			return
		}
		shared.RespondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "Error consultant logs: "+err.Error())
		return
	}
	if !allowed {
		shared.RespondError(c, http.StatusForbidden, "FORBIDDEN", "Sense permís per a aquest servidor")
		return
	}

	c.JSON(http.StatusOK, resp)
}
