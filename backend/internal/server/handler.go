package server

import (
	"errors"
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"rawcraft-monitor/backend/internal/shared"
)

type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

func (h *Handler) RegisterRoutes(v1 *gin.RouterGroup) {
	srvGroup := v1.Group("/servers")
	srvGroup.Use(shared.JWTAuthMiddleware())
	{
		srvGroup.GET("", h.ListServers)
		srvGroup.GET("/:id", h.GetServerByID)

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
