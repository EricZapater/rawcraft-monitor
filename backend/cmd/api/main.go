package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"

	"rawcraft-monitor/backend/internal/alert"
	"rawcraft-monitor/backend/internal/db"
	"rawcraft-monitor/backend/internal/server"
	"rawcraft-monitor/backend/internal/shared"
	"rawcraft-monitor/backend/internal/telemetry"
	"rawcraft-monitor/backend/internal/user"
)

func main() {
	_ = godotenv.Load()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := db.Connect(ctx)
	if err != nil {
		log.Fatalf("[api] Error connectant a PostgreSQL: %v", err)
	}
	defer pool.Close()

	migrationsDir := os.Getenv("MIGRATIONS_DIR")
	if migrationsDir == "" {
		migrationsDir = "migrations"
	}

	if err := db.RunMigrations(ctx, pool, migrationsDir); err != nil {
		log.Fatalf("[api] Error executant migracions SQL: %v", err)
	}

	if err := db.SeedInitialAdmin(ctx, pool); err != nil {
		log.Fatalf("[api] Error creant l'usuari ADMIN inicial: %v", err)
	}

	// Inicialització de mòduls per domini
	userRepo := user.NewRepository(pool)
	userService := user.NewService(userRepo)
	userHandler := user.NewHandler(userService)

	serverRepo := server.NewRepository(pool)
	serverService := server.NewService(serverRepo, userService)
	serverHandler := server.NewHandler(serverService)

	alertRepo := alert.NewRepository(pool)
	alertService := alert.NewService(alertRepo, serverService, userService)
	alertHandler := alert.NewHandler(alertService, serverService.ValidateAgentKey)

	telemetryRepo := telemetry.NewRepository(pool)
	telemetryService := telemetry.NewService(telemetryRepo, serverService, alertService, userService)
	telemetryHandler := telemetry.NewHandler(telemetryService, serverService.ValidateAgentKey)

	// Workers en segon pla: Heartbeat cada minut i Purga diària de retenció (365 dies per defecte)
	alertService.StartHeartbeatWorker(ctx)
	telemetryService.StartRetentionWorker(ctx)

	router := gin.Default()
	router.Use(shared.CORSMiddleware())

	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":  "ok",
			"service": "rawcraft-monitor-api",
			"time":    time.Now().UTC().Format(time.RFC3339),
		})
	})

	v1 := router.Group("/api/v1")
	{
		userHandler.RegisterRoutes(v1)
		serverHandler.RegisterRoutes(v1)
		telemetryHandler.RegisterRoutes(v1)
		alertHandler.RegisterRoutes(v1)
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           router,
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		log.Printf("[api] Rawcraft Monitor Hub escoltant al port :%s", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[api] Error al servidor HTTP: %v", err)
		}
	}()

	<-ctx.Done()
	log.Println("[api] Aturant servidor...")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdownCtx)
}
