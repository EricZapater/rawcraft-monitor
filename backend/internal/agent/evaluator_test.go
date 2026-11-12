package agent

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"

	"rawcraft-monitor/backend/internal/alert"
	"rawcraft-monitor/backend/internal/server"
	"rawcraft-monitor/backend/internal/telemetry"
)

func TestEvaluator_SustainedChecksAndHysteresis(t *testing.T) {
	eval := NewEvaluator()
	maxMem := 85.0
	cfg := &Config{
		ServerID:   uuid.New().String(),
		ServerName: "prod-node-01",
		Host: server.HostPillarConfig{
			Enabled: true,
			Thresholds: server.HostThresholdsConfig{
				SustainedChecks:  3,
				MaxMemoryPercent: &maxMem,
			},
		},
	}

	// Comprovacions 1 i 2 per sobre del llindar (88%) -> encara no ha de disparar FIRING
	for i := 1; i <= 2; i++ {
		events := eval.Evaluate(cfg, &telemetry.HostMetricsSnapshot{MemoryPercent: 88.0}, nil, nil, nil)
		if len(events) != 0 {
			t.Fatalf("comprovació %d: no s'esperava cap alerta, rebut: %+v", i, events)
		}
	}

	// Comprovació 3 sostinguda (89%) -> ha de disparar FIRING
	events := eval.Evaluate(cfg, &telemetry.HostMetricsSnapshot{MemoryPercent: 89.0}, nil, nil, nil)
	if len(events) != 1 {
		t.Fatalf("comprovació 3: s'esperava 1 alerta FIRING, rebut: %d", len(events))
	}
	if events[0].Status != alert.StatusFiring || events[0].Fingerprint != "host:memory_percent" {
		t.Fatalf("alerta inesperada: %+v", events[0])
	}

	// Comprovació 4 encara alta (91%) -> NO ha de repetir l'alerta (cooldown anti-tempesta)
	events = eval.Evaluate(cfg, &telemetry.HostMetricsSnapshot{MemoryPercent: 91.0}, nil, nil, nil)
	if len(events) != 0 {
		t.Fatalf("comprovació 4: no s'havia de repetir FIRING, rebut: %+v", events)
	}

	// Comprovació 5 baixa a 82% -> Dins la banda d'histèresi del 5% (85 - 5 = 80%), NO ha de resoldre encara
	events = eval.Evaluate(cfg, &telemetry.HostMetricsSnapshot{MemoryPercent: 82.0}, nil, nil, nil)
	if len(events) != 0 {
		t.Fatalf("comprovació 5 (histèresi 82%%): no s'havia de resoldre encara, rebut: %+v", events)
	}

	// Comprovació 6 baixa a 79.5% (<= 80%) -> Ha de passar a RESOLVED
	events = eval.Evaluate(cfg, &telemetry.HostMetricsSnapshot{MemoryPercent: 79.5}, nil, nil, nil)
	if len(events) != 1 {
		t.Fatalf("comprovació 6: s'esperava 1 alerta RESOLVED, rebut: %d", len(events))
	}
	if events[0].Status != alert.StatusResolved {
		t.Fatalf("s'esperava estat RESOLVED, rebut: %s", events[0].Status)
	}
}

func TestEvaluator_DockerAndHttpTransitions(t *testing.T) {
	eval := NewEvaluator()
	cfg := &Config{
		ServerID:   uuid.New().String(),
		ServerName: "prod-node-01",
		Docker: server.DockerPillarConfig{
			Enabled:              true,
			AlertOnContainerDown: true,
		},
	}

	// Contenidor caigut dispara immediatament (sustained = 1)
	dockerSnap := &telemetry.DockerMetricsSnapshot{
		DockerDaemonUp: true,
		Containers: []telemetry.DockerContainerSnapshot{
			{Name: "nasc-backend", State: "exited", Health: "none"},
		},
	}
	events := eval.Evaluate(cfg, nil, dockerSnap, nil, nil)
	if len(events) != 1 || events[0].Status != alert.StatusFiring || events[0].TargetName != "nasc-backend" {
		t.Fatalf("s'esperava alerta FIRING per a nasc-backend, rebut: %+v", events)
	}

	// Recuperació sostinguda del contenidor (requereix 4 comprovacions consecutives per evitar flapping)
	dockerSnap.Containers[0].State = "running"
	dockerSnap.Containers[0].Health = "healthy"
	for i := 1; i <= 3; i++ {
		events = eval.Evaluate(cfg, nil, dockerSnap, nil, nil)
		if len(events) != 0 {
			t.Fatalf("comprovació de recuperació %d: no s'havia de resoldre prematurament, rebut: %+v", i, events)
		}
	}
	// A la 4a comprovació sostinguda passa a RESOLVED
	events = eval.Evaluate(cfg, nil, dockerSnap, nil, nil)
	if len(events) != 1 || events[0].Status != alert.StatusResolved {
		t.Fatalf("a la 4a comprovació s'esperava alerta RESOLVED per a nasc-backend, rebut: %+v", events)
	}

	// Si es defineix RequiredContainers, un contenidor aliè caigut NO ha de disparar alerta
	cfg.Docker.RequiredContainers = []string{"traefik"}
	dockerSnap.Containers = []telemetry.DockerContainerSnapshot{
		{Name: "traefik", State: "running", Health: "healthy"},
		{Name: "random-backup-job", State: "exited", Health: "none"},
	}
	events = eval.Evaluate(cfg, nil, dockerSnap, nil, nil)
	if len(events) != 0 {
		t.Fatalf("un contenidor aturat fora de required_containers no ha de disparar alerta, rebut: %+v", events)
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func TestCollectHttpEndpoints_Expected200And202(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/ok202", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusAccepted)
	})
	mux.HandleFunc("/fail500", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	})

	client := &http.Client{
		Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
			rec := httptest.NewRecorder()
			mux.ServeHTTP(rec, req)
			return rec.Result(), nil
		}),
	}

	snap202 := checkSingleEndpointWithClient(t.Context(), client, server.HttpEndpointCheckConfig{
		Name:                "Async Queue API",
		URL:                 "http://localhost/ok202",
		Method:              "GET",
		ExpectedStatusCodes: []int{200, 202},
		TimeoutSeconds:      2,
	})
	snap500 := checkSingleEndpointWithClient(t.Context(), client, server.HttpEndpointCheckConfig{
		Name:                "Broken Service",
		URL:                 "http://localhost/fail500",
		Method:              "GET",
		ExpectedStatusCodes: []int{200, 202},
		TimeoutSeconds:      2,
	})

	if !snap202.Up || snap202.StatusCode != 202 {
		t.Errorf("l'endpoint 202 havia d'estar UP, rebut: %+v", snap202)
	}
	if snap500.Up || snap500.StatusCode != 500 {
		t.Errorf("l'endpoint 500 havia d'estar DOWN, rebut: %+v", snap500)
	}
}

func TestParseConfigBytes_Defaults(t *testing.T) {
	raw := []byte(`
server_id: "11111111-2222-3333-4444-555555555555"
server_name: "node-test"
central_url: "https://monitor.rawcraft.local/"
api_key: "rcm_live_test"
`)
	cfg, err := ParseConfigBytes(raw)
	if err != nil {
		t.Fatalf("error inesperat parsejant YAML: %v", err)
	}
	if cfg.CentralURL != "https://monitor.rawcraft.local" {
		t.Errorf("central_url mal normalitzat: %s", cfg.CentralURL)
	}
	if cfg.CheckIntervalSeconds != 15 || cfg.ReportIntervalSeconds != 300 {
		t.Errorf("intervals per defecte inesperats: check=%d, report=%d", cfg.CheckIntervalSeconds, cfg.ReportIntervalSeconds)
	}
	if cfg.Docker.SocketPath != "/var/run/docker.sock" {
		t.Errorf("socket_path per defecte inesperat: %s", cfg.Docker.SocketPath)
	}
}

func TestEvaluator_ContainerFlappingAndCrashLoop(t *testing.T) {
	eval := NewEvaluator()
	cfg := &Config{
		ServerID:   uuid.New().String(),
		ServerName: "prod-node-01",
		Docker: server.DockerPillarConfig{
			Enabled:              true,
			AlertOnContainerDown: true,
		},
	}

	downSnap := &telemetry.DockerMetricsSnapshot{
		DockerDaemonUp: true,
		Containers: []telemetry.DockerContainerSnapshot{
			{Name: "app-service", State: "exited", Health: "none"},
		},
	}
	upSnap := &telemetry.DockerMetricsSnapshot{
		DockerDaemonUp: true,
		Containers: []telemetry.DockerContainerSnapshot{
			{Name: "app-service", State: "running", Health: "healthy"},
		},
	}

	// 1. Primera caiguda -> Dispara FIRING normal
	events := eval.Evaluate(cfg, nil, downSnap, nil, nil)
	if len(events) != 1 || events[0].Status != alert.StatusFiring {
		t.Fatalf("esperava FIRING inicial, obtingut: %+v", events)
	}

	// 2. S'arrenca 1 cop (comprovant la BD) -> NO s'ha d'emetre RESOLVED (sosteniment pendent)
	events = eval.Evaluate(cfg, nil, upSnap, nil, nil)
	if len(events) != 0 {
		t.Fatalf("no s'havia d'emetre RESOLVED prematurament, obtingut: %+v", events)
	}

	// 3. Torna a caure (2a caiguda) -> No ha de repetir FIRING ni spamejar
	events = eval.Evaluate(cfg, nil, downSnap, nil, nil)
	if len(events) != 0 {
		t.Fatalf("no s'havia de repetir FIRING durant el crashloop, obtingut: %+v", events)
	}

	// 4. S'arrenca de nou
	events = eval.Evaluate(cfg, nil, upSnap, nil, nil)
	if len(events) != 0 {
		t.Fatalf("no s'havia d'emetre RESOLVED, obtingut: %+v", events)
	}

	// 5. Torna a caure (3a caiguda en <10m) -> Ha de detectar CrashLoop/Flapping!
	events = eval.Evaluate(cfg, nil, downSnap, nil, nil)
	if len(events) != 1 || events[0].Status != alert.StatusFiring {
		t.Fatalf("esperava alerta de CrashLoop, obtingut: %+v", events)
	}
	if events[0].Title != "⚠️ [CrashLoop / Flapping] Contenidor Docker app-service caigut o unhealthy" {
		t.Errorf("títol de CrashLoop inesperat: %s", events[0].Title)
	}

	// 6. Continua caient i reiniciant-se -> Zero spam!
	for i := 0; i < 5; i++ {
		events = eval.Evaluate(cfg, nil, upSnap, nil, nil)
		if len(events) != 0 {
			t.Fatalf("mentre fa flapping no ha d'emetre resolucions flappejants")
		}
		events = eval.Evaluate(cfg, nil, downSnap, nil, nil)
		if len(events) != 0 {
			t.Fatalf("mentre fa flapping no ha d'emetre nous alertes duplicades")
		}
	}

	// 7. Finalment s'arregla la BD: calen 8 comprovacions estables (neededRecovery = 4 * 2)
	for i := 1; i <= 7; i++ {
		events = eval.Evaluate(cfg, nil, upSnap, nil, nil)
		if len(events) != 0 {
			t.Fatalf("a la comprovació %d encara no s'havia de resoldre el flapping", i)
		}
	}

	// Comprovació 8 -> Passa a RESOLVED
	events = eval.Evaluate(cfg, nil, upSnap, nil, nil)
	if len(events) != 1 || events[0].Status != alert.StatusResolved {
		t.Fatalf("a la 8a comprovació s'havia de resoldre definitivament, obtingut: %+v", events)
	}
}

