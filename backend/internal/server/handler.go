package server

import (
	"errors"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"rawcraft-monitor/backend/internal/shared"
	"rawcraft-monitor/backend/internal/user"
)

type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

func (h *Handler) RegisterRoutes(v1 *gin.RouterGroup) {
	v1.GET("/agent/binary", h.DownloadAgentBinary)
	v1.GET("/agent/config.yaml", h.DownloadAgentConfigYamlByKey)
	v1.GET("/agent/systemd.service", h.DownloadAgentSystemdUnit)

	// Ingesta de Desplegaments (Deploy Tracking)
	v1.POST("/servers/:id/deploys", h.CreateServerDeployment)
	v1.POST("/deploys", h.CreateDirectDeployment)

	srvGroup := v1.Group("/servers")
	srvGroup.Use(shared.JWTAuthMiddleware())
	{
		srvGroup.GET("", h.ListServers)
		srvGroup.GET("/:id", h.GetServerByID)
		srvGroup.GET("/:id/deploys", h.ListServerDeployments)
		srvGroup.POST("/:id/reveal-key", h.RevealAPIKey)

		// Rutes d'administració (només ADMIN)
		adminOnly := srvGroup.Group("")
		adminOnly.Use(shared.RequireAdminMiddleware())
		{
			adminOnly.POST("", h.CreateServer)
			adminOnly.PUT("/:id", h.UpdateServer)
			adminOnly.DELETE("/:id", h.DeleteServer)
			adminOnly.POST("/:id/rotate-key", h.RotateAPIKey)
			adminOnly.GET("/:id/config-yaml", h.GetConfigYaml)
		}
	}
}

func (h *Handler) ListServers(c *gin.Context) {
	userID, _ := shared.GetAuthUserID(c)
	role := shared.GetAuthUserRole(c)

	servers, err := h.service.ListAuthorized(c.Request.Context(), userID, role)
	if err != nil {
		shared.RespondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "Error obtenint el llistat de servidors")
		return
	}
	c.JSON(http.StatusOK, servers)
}

func (h *Handler) CreateServer(c *gin.Context) {
	var req CreateServerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		shared.RespondError(c, http.StatusBadRequest, "INVALID_PAYLOAD", "Dades de creació de servidor invàlides")
		return
	}

	resp, err := h.service.Create(c.Request.Context(), req)
	if err != nil {
		if errors.Is(err, ErrInvalidServerOp) {
			shared.RespondError(c, http.StatusBadRequest, "INVALID_PAYLOAD", "El nom del servidor és obligatori")
			return
		}
		shared.RespondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "Error creant el servidor")
		return
	}
	c.JSON(http.StatusCreated, resp)
}

func (h *Handler) GetServerByID(c *gin.Context) {
	serverID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		shared.RespondError(c, http.StatusNotFound, "NOT_FOUND", "Servidor no trobat")
		return
	}

	userID, _ := shared.GetAuthUserID(c)
	role := shared.GetAuthUserRole(c)

	srv, allowed, err := h.service.GetAuthorizedByID(c.Request.Context(), userID, role, serverID)
	if err != nil {
		if errors.Is(err, ErrServerNotFound) {
			shared.RespondError(c, http.StatusNotFound, "NOT_FOUND", "Servidor no trobat")
			return
		}
		shared.RespondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "Error consultant el servidor")
		return
	}
	if !allowed {
		shared.RespondError(c, http.StatusForbidden, "FORBIDDEN", "Sense permís per a aquest servidor")
		return
	}

	c.JSON(http.StatusOK, srv)
}

func (h *Handler) UpdateServer(c *gin.Context) {
	serverID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		shared.RespondError(c, http.StatusNotFound, "NOT_FOUND", "Servidor no trobat")
		return
	}

	var req UpdateServerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		shared.RespondError(c, http.StatusBadRequest, "INVALID_PAYLOAD", "Configuració de servidor invàlida")
		return
	}

	srv, err := h.service.Update(c.Request.Context(), serverID, req)
	if err != nil {
		switch {
		case errors.Is(err, ErrServerNotFound):
			shared.RespondError(c, http.StatusNotFound, "NOT_FOUND", "Servidor no trobat")
		case errors.Is(err, ErrInvalidServerOp):
			shared.RespondError(c, http.StatusBadRequest, "INVALID_PAYLOAD", "El nom del servidor és obligatori")
		default:
			shared.RespondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "Error actualitzant el servidor")
		}
		return
	}

	c.JSON(http.StatusOK, srv)
}

func (h *Handler) DeleteServer(c *gin.Context) {
	serverID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		shared.RespondError(c, http.StatusNotFound, "NOT_FOUND", "Servidor no trobat")
		return
	}

	confirmed := c.Query("confirm") == "true"
	if err := h.service.Delete(c.Request.Context(), serverID, confirmed); err != nil {
		switch {
		case errors.Is(err, ErrServerNotFound):
			shared.RespondError(c, http.StatusNotFound, "NOT_FOUND", "Servidor no trobat")
		case errors.Is(err, ErrInvalidServerOp):
			shared.RespondError(c, http.StatusBadRequest, "CONFIRMATION_REQUIRED", "Falta el paràmetre confirm=true per donar de baixa el servidor")
		default:
			shared.RespondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "Error donant de baixa el servidor")
		}
		return
	}

	c.Status(http.StatusNoContent)
}

func (h *Handler) RotateAPIKey(c *gin.Context) {
	serverID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		shared.RespondError(c, http.StatusNotFound, "NOT_FOUND", "Servidor no trobat")
		return
	}

	resp, err := h.service.RotateAPIKey(c.Request.Context(), serverID)
	if err != nil {
		if errors.Is(err, ErrServerNotFound) {
			shared.RespondError(c, http.StatusNotFound, "NOT_FOUND", "Servidor no trobat")
			return
		}
		shared.RespondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "Error rotant l'API Key")
		return
	}

	c.JSON(http.StatusOK, resp)
}

func (h *Handler) GetConfigYaml(c *gin.Context) {
	serverID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		shared.RespondError(c, http.StatusNotFound, "NOT_FOUND", "Servidor no trobat")
		return
	}

	scheme := "http"
	if c.Request.TLS != nil || c.GetHeader("X-Forwarded-Proto") == "https" {
		scheme = "https"
	}
	baseURL := ""
	if c.Request.Host != "" {
		baseURL = fmt.Sprintf("%s://%s", scheme, c.Request.Host)
	}

	bundle, err := h.service.GenerateYamlBundle(c.Request.Context(), serverID, baseURL)
	if err != nil {
		if errors.Is(err, ErrServerNotFound) {
			shared.RespondError(c, http.StatusNotFound, "NOT_FOUND", "Servidor no trobat")
			return
		}
		shared.RespondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "Error generant el bundle config.yaml")
		return
	}

	c.JSON(http.StatusOK, bundle)
}

func (h *Handler) DownloadAgentBinary(c *gin.Context) {
	binPath := os.Getenv("AGENT_BINARY_PATH")
	if binPath == "" {
		binPath = "/app/rawcraft-agent"
		if _, err := os.Stat(binPath); err != nil {
			binPath = "./rawcraft-agent"
		}
	}

	if _, err := os.Stat(binPath); err != nil {
		shared.RespondError(c, http.StatusNotFound, "BINARY_NOT_FOUND", "El binari rawcraft-agent no està disponible en aquesta instància")
		return
	}

	c.Header("Content-Description", "File Transfer")
	c.Header("Content-Disposition", `attachment; filename="rawcraft-agent"`)
	c.Header("Content-Type", "application/octet-stream")
	c.File(binPath)
}

func (h *Handler) DownloadAgentConfigYamlByKey(c *gin.Context) {
	rawKey := c.GetHeader("X-Agent-Key")
	if rawKey == "" {
		rawKey = c.Query("key")
	}
	if rawKey == "" {
		shared.RespondError(c, http.StatusUnauthorized, "MISSING_AGENT_KEY", "Falta la capçalera X-Agent-Key o el paràmetre ?key=")
		return
	}

	serverID, err := h.service.ValidateAgentKey(c.Request.Context(), rawKey)
	if err != nil {
		shared.RespondError(c, http.StatusUnauthorized, "INVALID_AGENT_KEY", "API Key d'agent invàlida o revocada")
		return
	}

	scheme := "http"
	if c.Request.TLS != nil || c.GetHeader("X-Forwarded-Proto") == "https" {
		scheme = "https"
	}
	baseURL := ""
	if c.Request.Host != "" {
		baseURL = fmt.Sprintf("%s://%s", scheme, c.Request.Host)
	}

	bundle, err := h.service.GenerateYamlBundle(c.Request.Context(), serverID, baseURL)
	if err != nil {
		shared.RespondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "Error generant el fitxer config.yaml")
		return
	}

	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, bundle.Filename))
	c.Data(http.StatusOK, "text/yaml; charset=utf-8", []byte(bundle.ConfigYaml))
}

func (h *Handler) DownloadAgentSystemdUnit(c *gin.Context) {
	c.Header("Content-Disposition", `attachment; filename="rawcraft-agent.service"`)
	c.Data(http.StatusOK, "text/plain; charset=utf-8", []byte(DefaultSystemdUnit()))
}

func (h *Handler) CreateServerDeployment(c *gin.Context) {
	idStr := c.Param("id")
	serverID, err := uuid.Parse(idStr)
	if err != nil {
		shared.RespondError(c, http.StatusBadRequest, "INVALID_SERVER_ID", "ID de servidor invàlid")
		return
	}

	agentKey := strings.TrimSpace(c.GetHeader("X-Agent-Key"))
	if agentKey == "" {
		authHeader := c.GetHeader("Authorization")
		if strings.HasPrefix(authHeader, "Bearer ") {
			agentKey = strings.TrimSpace(strings.TrimPrefix(authHeader, "Bearer "))
		}
	}

	if agentKey != "" {
		keyServerID, err := h.service.ValidateAgentKey(c.Request.Context(), agentKey)
		if err != nil {
			token, jwtErr := shared.ParseToken(agentKey)
			if jwtErr == nil && token != nil {
				_, allowed, authErr := h.service.GetAuthorizedByID(c.Request.Context(), token.UserID, string(token.Role), serverID)
				if authErr != nil || !allowed {
					shared.RespondError(c, http.StatusForbidden, "FORBIDDEN", "No tens permisos sobre aquest servidor")
					return
				}
			} else {
				shared.RespondError(c, http.StatusUnauthorized, "INVALID_KEY", "API Key d'agent o Token invàlid")
				return
			}
		} else if keyServerID != serverID {
			shared.RespondError(c, http.StatusForbidden, "FORBIDDEN", "La clau d'agent no correspon a aquest servidor")
			return
		}
	} else {
		cookie, err := c.Cookie("rawcraft_token")
		if err != nil {
			shared.RespondError(c, http.StatusUnauthorized, "UNAUTHORIZED", "Cal autenticació (X-Agent-Key o JWT)")
			return
		}
		token, jwtErr := shared.ParseToken(cookie)
		if jwtErr != nil || token == nil {
			shared.RespondError(c, http.StatusUnauthorized, "UNAUTHORIZED", "Sessió invàlida")
			return
		}
		_, allowed, authErr := h.service.GetAuthorizedByID(c.Request.Context(), token.UserID, string(token.Role), serverID)
		if authErr != nil || !allowed {
			shared.RespondError(c, http.StatusForbidden, "FORBIDDEN", "No tens permisos sobre aquest servidor")
			return
		}
	}

	var req CreateDeploymentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		shared.RespondError(c, http.StatusBadRequest, "INVALID_PAYLOAD", "Format de petició invàlid")
		return
	}

	dep, err := h.service.RecordDeployment(c.Request.Context(), serverID, req)
	if err != nil {
		shared.RespondError(c, http.StatusBadRequest, "DEPLOY_ERROR", err.Error())
		return
	}

	c.JSON(http.StatusCreated, dep)
}

func (h *Handler) CreateDirectDeployment(c *gin.Context) {
	agentKey := strings.TrimSpace(c.GetHeader("X-Agent-Key"))
	if agentKey == "" {
		authHeader := c.GetHeader("Authorization")
		if strings.HasPrefix(authHeader, "Bearer ") {
			agentKey = strings.TrimSpace(strings.TrimPrefix(authHeader, "Bearer "))
		}
	}

	if agentKey == "" {
		shared.RespondError(c, http.StatusUnauthorized, "MISSING_KEY", "Falta la capçalera X-Agent-Key o Authorization: Bearer <API-KEY>")
		return
	}

	serverID, err := h.service.ValidateAgentKey(c.Request.Context(), agentKey)
	if err != nil {
		shared.RespondError(c, http.StatusUnauthorized, "INVALID_KEY", "API Key d'agent invàlida o revocada")
		return
	}

	var req CreateDeploymentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		shared.RespondError(c, http.StatusBadRequest, "INVALID_PAYLOAD", "Format de petició invàlid")
		return
	}

	dep, err := h.service.RecordDeployment(c.Request.Context(), serverID, req)
	if err != nil {
		shared.RespondError(c, http.StatusBadRequest, "DEPLOY_ERROR", err.Error())
		return
	}

	c.JSON(http.StatusCreated, dep)
}

func (h *Handler) ListServerDeployments(c *gin.Context) {
	idStr := c.Param("id")
	serverID, err := uuid.Parse(idStr)
	if err != nil {
		shared.RespondError(c, http.StatusBadRequest, "INVALID_SERVER_ID", "ID de servidor invàlid")
		return
	}

	userID, _ := shared.GetAuthUserID(c)
	role := shared.GetAuthUserRole(c)

	_, allowed, err := h.service.GetAuthorizedByID(c.Request.Context(), userID, role, serverID)
	if err != nil {
		if errors.Is(err, ErrServerNotFound) {
			shared.RespondError(c, http.StatusNotFound, "SERVER_NOT_FOUND", "Servidor no trobat")
			return
		}
		shared.RespondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "Error consultant permisos")
		return
	}
	if !allowed {
		shared.RespondError(c, http.StatusForbidden, "FORBIDDEN", "No tens permisos per veure aquest servidor")
		return
	}

	limit := 20
	if l := c.Query("limit"); l != "" {
		if val, err := strconv.Atoi(l); err == nil && val > 0 {
			limit = val
		}
	}
	offset := 0
	if o := c.Query("offset"); o != "" {
		if val, err := strconv.Atoi(o); err == nil && val >= 0 {
			offset = val
		}
	}

	items, total, err := h.service.ListDeployments(c.Request.Context(), serverID, limit, offset)
	if err != nil {
		shared.RespondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "Error recuperant els desplegaments")
		return
	}

	c.JSON(http.StatusOK, ListDeploymentsResponse{
		Items: items,
		Total: total,
	})
}

func (h *Handler) RevealAPIKey(c *gin.Context) {
	idStr := c.Param("id")
	serverID, err := uuid.Parse(idStr)
	if err != nil {
		shared.RespondError(c, http.StatusBadRequest, "INVALID_SERVER_ID", "ID de servidor invàlid")
		return
	}

	userID, ok := shared.GetAuthUserID(c)
	if !ok {
		shared.RespondError(c, http.StatusUnauthorized, "UNAUTHORIZED", "Sessió no vàlida")
		return
	}
	role := shared.GetAuthUserRole(c)

	var req RevealApiKeyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		shared.RespondError(c, http.StatusBadRequest, "INVALID_PAYLOAD", "Format de petició invàlid")
		return
	}

	apiKey, err := h.service.RevealAPIKey(c.Request.Context(), userID, role, serverID, req.Password)
	if err != nil {
		if errors.Is(err, user.ErrInvalidCredential) {
			shared.RespondError(c, http.StatusUnauthorized, "INVALID_PASSWORD", "Contrasenya incorrecta")
			return
		}
		if errors.Is(err, ErrUnauthorizedServer) {
			shared.RespondError(c, http.StatusForbidden, "FORBIDDEN", "No tens permisos per consultar aquest servidor")
			return
		}
		shared.RespondError(c, http.StatusBadRequest, "ERROR", err.Error())
		return
	}

	c.JSON(http.StatusOK, RevealApiKeyResponse{
		APIKey: apiKey,
	})
}
