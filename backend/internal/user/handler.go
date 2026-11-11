package user

import (
	"errors"
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
	// Ruta pública de login
	v1.POST("/auth/login", h.Login)

	// Rutes autenticades
	authGroup := v1.Group("")
	authGroup.Use(shared.JWTAuthMiddleware())
	{
		authGroup.POST("/auth/logout", h.Logout)
		authGroup.GET("/auth/me", h.GetMe)
		authGroup.PUT("/auth/password", h.ChangeOwnPassword)
	}

	// Rutes exclusives d'ADMIN per a gestió d'usuaris
	adminUsers := v1.Group("/users")
	adminUsers.Use(shared.JWTAuthMiddleware(), shared.RequireAdminMiddleware())
	{
		adminUsers.GET("", h.ListUsers)
		adminUsers.POST("", h.CreateUser)
		adminUsers.GET("/:id", h.GetUserByID)
		adminUsers.PUT("/:id", h.UpdateUser)
		adminUsers.DELETE("/:id", h.DeleteUser)
	}
}

func (h *Handler) Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		shared.RespondError(c, http.StatusBadRequest, "INVALID_PAYLOAD", "Dades d'entrada invàlides")
		return
	}
	if req.Email == "" || len(req.Password) < 8 {
		shared.RespondError(c, http.StatusBadRequest, "INVALID_PAYLOAD", "Email i contrasenya (mínim 8 caràcters) són obligatoris")
		return
	}

	resp, err := h.service.Login(c.Request.Context(), req)
	if err != nil {
		if errors.Is(err, ErrInvalidCredential) {
			shared.RespondError(c, http.StatusUnauthorized, "INVALID_CREDENTIALS", "Credencials invàlides o compte inactiu")
			return
		}
		shared.RespondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "Error intern en iniciar sessió")
		return
	}

	c.JSON(http.StatusOK, resp)
}

func (h *Handler) Logout(c *gin.Context) {
	c.Status(http.StatusNoContent)
}

func (h *Handler) GetMe(c *gin.Context) {
	userID, ok := shared.GetAuthUserID(c)
	if !ok {
		shared.RespondError(c, http.StatusUnauthorized, "UNAUTHORIZED", "Token invàlid o expirat")
		return
	}

	u, err := h.service.GetByID(c.Request.Context(), userID)
	if err != nil || !u.IsActive {
		shared.RespondError(c, http.StatusUnauthorized, "UNAUTHORIZED", "Usuari inactiu o no trobat")
		return
	}

	c.JSON(http.StatusOK, u)
}

func (h *Handler) ChangeOwnPassword(c *gin.Context) {
	userID, ok := shared.GetAuthUserID(c)
	if !ok {
		shared.RespondError(c, http.StatusUnauthorized, "UNAUTHORIZED", "No autenticat")
		return
	}

	var req ChangePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		shared.RespondError(c, http.StatusBadRequest, "INVALID_PAYLOAD", "Format de petició invàlid")
		return
	}

	if err := h.service.ChangeOwnPassword(c.Request.Context(), userID, req); err != nil {
		if errors.Is(err, ErrInvalidOperation) {
			shared.RespondError(c, http.StatusBadRequest, "INVALID_PASSWORD", "Contrasenya actual incorrecta o nova contrasenya inferior a 8 caràcters")
			return
		}
		shared.RespondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "Error actualitzant contrasenya")
		return
	}

	c.Status(http.StatusNoContent)
}

func (h *Handler) ListUsers(c *gin.Context) {
	users, err := h.service.List(c.Request.Context())
	if err != nil {
		shared.RespondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "Error obtenint el llistat d'usuaris")
		return
	}
	c.JSON(http.StatusOK, users)
}

func (h *Handler) CreateUser(c *gin.Context) {
	var req CreateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		shared.RespondError(c, http.StatusBadRequest, "INVALID_PAYLOAD", "Dades d'usuari invàlides")
		return
	}

	u, err := h.service.Create(c.Request.Context(), req)
	if err != nil {
		switch {
		case errors.Is(err, ErrDuplicateEmail):
			shared.RespondError(c, http.StatusConflict, "DUPLICATE_EMAIL", "Ja existeix un usuari amb aquest email")
		case errors.Is(err, ErrInvalidOperation):
			shared.RespondError(c, http.StatusBadRequest, "INVALID_PAYLOAD", "Revisa el nom, l'email, el rol i que la contrasenya tingui almenys 8 caràcters")
		default:
			shared.RespondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "Error creant l'usuari")
		}
		return
	}

	c.JSON(http.StatusCreated, u)
}

func (h *Handler) GetUserByID(c *gin.Context) {
	targetID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		shared.RespondError(c, http.StatusNotFound, "NOT_FOUND", "Usuari no trobat")
		return
	}

	u, err := h.service.GetByID(c.Request.Context(), targetID)
	if err != nil {
		if errors.Is(err, ErrUserNotFound) {
			shared.RespondError(c, http.StatusNotFound, "NOT_FOUND", "Usuari no trobat")
			return
		}
		shared.RespondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "Error consultant l'usuari")
		return
	}

	c.JSON(http.StatusOK, u)
}

func (h *Handler) UpdateUser(c *gin.Context) {
	actorID, _ := shared.GetAuthUserID(c)
	targetID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		shared.RespondError(c, http.StatusNotFound, "NOT_FOUND", "Usuari no trobat")
		return
	}

	var req UpdateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		shared.RespondError(c, http.StatusBadRequest, "INVALID_PAYLOAD", "Dades d'actualització invàlides")
		return
	}

	u, err := h.service.Update(c.Request.Context(), actorID, targetID, req)
	if err != nil {
		switch {
		case errors.Is(err, ErrUserNotFound):
			shared.RespondError(c, http.StatusNotFound, "NOT_FOUND", "Usuari no trobat")
		case errors.Is(err, ErrDuplicateEmail):
			shared.RespondError(c, http.StatusConflict, "DUPLICATE_EMAIL", "Ja existeix un altre usuari amb aquest email")
		case errors.Is(err, ErrInvalidOperation):
			shared.RespondError(c, http.StatusBadRequest, "INVALID_OPERATION", "Operació invàlida (no et pots desactivar a tu mateix ni posar dades buides)")
		default:
			shared.RespondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "Error actualitzant l'usuari")
		}
		return
	}

	c.JSON(http.StatusOK, u)
}

func (h *Handler) DeleteUser(c *gin.Context) {
	actorID, _ := shared.GetAuthUserID(c)
	targetID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		shared.RespondError(c, http.StatusNotFound, "NOT_FOUND", "Usuari no trobat")
		return
	}

	confirmed := c.Query("confirm") == "true"
	if err := h.service.Delete(c.Request.Context(), actorID, targetID, confirmed); err != nil {
		switch {
		case errors.Is(err, ErrUserNotFound):
			shared.RespondError(c, http.StatusNotFound, "NOT_FOUND", "Usuari no trobat")
		case errors.Is(err, ErrInvalidOperation):
			shared.RespondError(c, http.StatusBadRequest, "CONFIRMATION_REQUIRED", "Es requereix confirm=true i no es permet eliminar el propi compte")
		default:
			shared.RespondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "Error donant de baixa l'usuari")
		}
		return
	}

	c.Status(http.StatusNoContent)
}
