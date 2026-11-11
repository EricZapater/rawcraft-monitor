package shared

import "github.com/gin-gonic/gin"

// ErrorResponse segueix l'esquema OpenAPI {error, message}.
type ErrorResponse struct {
	Error   string `json:"error"`
	Message string `json:"message"`
}

// RespondError envia una resposta JSON d'error estandarditzada i avorta la petició Gin.
func RespondError(c *gin.Context, status int, code, message string) {
	c.AbortWithStatusJSON(status, ErrorResponse{
		Error:   code,
		Message: message,
	})
}
