package main

import (
	"context"
	"flag"
	"log"
	"os"
	"os/signal"
	"runtime/debug"
	"syscall"

	"rawcraft-monitor/backend/internal/agent"
)

func main() {
	// Blindatge estricte de memòria RAM (20 MiB) per córrer sota systemd MemoryMax=30M (`HU-TEL-01`, `HU-INF-04`)
	debug.SetMemoryLimit(20 * 1024 * 1024)

	configPath := flag.String("config", "/etc/rawcraft-agent/config.yaml", "Ruta al fitxer config.yaml de l'agent")
	flag.Parse()

	cfg, err := agent.LoadConfig(*configPath)
	if err != nil {
		log.Fatalf("[rawcraft-agent] Error carregant configuració (%s): %v", *configPath, err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	runner := agent.NewRunner(cfg)
	runner.Run(ctx)
}
