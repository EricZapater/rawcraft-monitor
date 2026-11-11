# QA — Mòdul `telemetry`

**Veredicte**: APTE
**Data**: 2026-11-11

## Entorn de proves
- Backend engegat: SÍ (`gofmt -l .` net, `go vet ./...` net, `go test -count=1 -v ./...` 100% PASS incloent `TestCollectHttpEndpoints_Expected200And202` i `TestParseConfigBytes_Defaults` a `backend/internal/agent/evaluator_test.go`, compilació de `./cmd/api` i compilació estàtica `CGO_ENABLED=0` de `./cmd/agent`)
- Frontend web engegat: SÍ (`pnpm --filter frontend exec tsc --noEmit` i `pnpm --filter frontend run build` completats amb èxit)
- App mòbil engegada: N/A (`mobile/` fora d'abast segons la Secció 8 de `constitution.md` i `product-functional-spec.md`)
- Base de dades local: Taules `telemetry_snapshots` (amb índex `(server_id, recorded_at DESC)`) i `system_settings` (amb seed inicial `retention_days = 365`) verificades a `backend/migrations/000001_init_schema.up.sql`
- Dades de prova generades (usuaris, registres) que caldria netejar: Cap dada residual persistent deixada a l'entorn

## Proves funcionals executades
- Verificació del binari `rawcraft-agent` i límit estricte de RAM (`backend/cmd/agent/main.go`, `backend/internal/agent/`) → Compila amb `CGO_ENABLED=0`, fixa `debug.SetMemoryLimit(20 * 1024 * 1024)` (`20MiB`), desactiva HTTP keep-alives, limita la lectura de Docker stats a un worker pool màxim de 3 goroutines (`const maxWorkers = 3` a `collector_docker.go`) i executa `runtime.GC()` al final de cada cicle (`runner.go`).
- Verificació de recollida de les 4 potetes a l'agent i ingesta (`POST /api/v1/agent/telemetry` amb `X-Agent-Key`):
  - **Host/SO (`collector_host.go`)**: Llegeix `/etc/os-release` (`os_name`), `/proc/sys/kernel/osrelease` (`kernel_version`), `runtime.GOARCH`, `/proc/uptime`, comprova `/var/run/reboot-required` (`reboot_required`), `/proc/loadavg` (`load_1m`, `load_5m`, `load_15m`), `/proc/meminfo` (RAM i Swap), `syscall.Statfs` per a cada punt de muntatge, processos a `/proc`, sessions a `/dev/pts`, autodetecció d'IPv4 i memòria RSS del propi agent (`agent_memory_mb`).
  - **Docker (`collector_docker.go`)**: Consulta `/var/run/docker.sock` (`/_ping`, `/containers/json?all=true` i `/containers/{id}/stats?stream=false`), respectant `ignore_containers` i calculant `% CPU` i `RAM (MB / Límit / %)`.
  - **Endpoints HTTP (`collector_http.go`, `TestCollectHttpEndpoints_Expected200And202`)**: Valida codis esperats (`[200, 202]` per defecte), calcula `response_time_ms` i marca `up: true` tant per `200 OK` com per `202 Accepted` i `up: false` per `500`.
  - **PostgreSQL (`collector_postgres.go`)**: Executa `SELECT 1`, mesura `latency_ms`, `max_connections`, `active_connections`, `connections_percent`, `pg_database_size`, `long_running_queries` i `locks_waiting`.
- Verificació del Dashboard general de servidors (`GET /api/v1/telemetry/dashboard`, `DashboardView.tsx`) → Filtra pels servidors autoritzats de l'usuari; mostra la barra superior de KPIs globals i, per a cada servidor, l'estat (`ONLINE`, `WARNING`, `CRITICAL`, `OFFLINE`), la versió del SO (`os_name`, `kernel_version`), el badge `⚠ Reboot required` quan `reboot_required == true`, el bloc consola estil MOTD Linux (`System information as of...`, `System load`, `Usage of /`, `Memory usage`, `Swap usage`, `Processes`, `Users logged in`, `IPv4 for <iface>`, `Agent RAM`) i el semàfor de les altres 3 potetes (Dockers, Endpoints HTTP `200/202` i PostgreSQL).
- Verificació de la vista de detall en viu (`GET /api/v1/servers/{id}/telemetry/latest`, `ServerDetailView.tsx`) → Mostra el banner complet de maquinari/SO amb `reboot_required`, la taula de contenidors Docker ordenable per nom, `% CPU` o `% RAM` amb barres de progrés, la taula d'endpoints HTTP amb codis esperats/rebuts i latència en `ms`, i la fitxa detallada de cada instància PostgreSQL.
- Verificació d'històric, gràfiques temporals i retenció de 365 dies (`GET /api/v1/servers/{id}/telemetry/history`, `GET/PUT /api/v1/settings/retention`, `ServerHistoryView.tsx`) → Suporta els rangs `6h`, `24h`, `7d`, `30d`, `365d` i paràmetres `from`/`to`, aplica downsampling automàtic a un màxim de 240 punts per a rangs llargs, inicialitza `retention_days = 365`, valida `retention_days >= 7` (només `ADMIN` pot fer `PUT`) i executa el worker diari `StartRetentionWorker` que purga snapshots i alertes `RESOLVED` antigues.

## Compliment funcional
- [OK] `HU-TEL-01`: Recollida i enviament periòdic de telemetria per l'Agent (`rawcraft-agent`) — Binari sense CGO, `GOMEMLIMIT=20MiB`, unitat `systemd` amb `MemoryMax=30M` i `CPUQuota=5%`, recollida de les 4 potetes i ingesta autenticada a `POST /api/v1/agent/telemetry` (`202 Accepted`).
- [OK] `HU-TEL-02`: Dashboard general de servidors (Vista resum d'estat actual) — Filtració per permisos d'usuari, bloc MOTD Linux complet, `os_name`, `kernel_version`, badge `Reboot required` i semàfor de Dockers, HTTP i Postgres.
- [OK] `HU-TEL-03`: Vista de detall d'un servidor (Dockers, Endpoints HTTP i PostgreSQL en viu) — Taula de contenidors Docker ordenable per CPU/RAM, taula d'endpoints HTTP (`200`/`202`) i detall d'instàncies PostgreSQL.
- [OK] `HU-TEL-04`: Consulta d'històric i gràfiques d'evolució temporal — Selector de rangs (`6h`, `24h`, `7d`, `30d`, `365d`), downsampling al backend i 4 gràfiques temporals SVG (Load, RAM/Swap/Disc, RAM per contenidor Docker, i Postgres % connexions + latència HTTP).
- [OK] `HU-TEL-05`: Configuració i execució de la política de retenció d'històric (365 dies per defecte) — Seed inicial a 365 dies, endpoints `GET/PUT /api/v1/settings/retention` (mínim 7 dies, edició restringida a `ADMIN`) i worker diari de purga automàtica.

## Qualitat de codi
- [OK] Formatació i anàlisi estàtica Go (`gofmt -l .` i `go vet ./...`) — Net sense errors ni avisos.
- [OK] Consultes SQL pures i parametritzades (`backend/internal/telemetry/repository.go`, `collector_postgres.go`) — Ús exclusiu de paràmetres posicionals (`$1, $2, $3...`).
- [OK] Qualitat TypeScript i client HTTP centralitzat — `tsc --noEmit` i `vite build` nets, zero `as any`, tipus generats des de `contracts/telemetry.openapi.yaml` i crides HTTP via `src/api/client.ts`.

## Homogeneïtat
- [OK] Estructura de capes Backend (`backend/internal/telemetry/` i `backend/internal/agent/`) — Separació estricta `handler.go` → `service.go` → `repository.go` + `model.go`. `telemetry.Service` es comunica amb `server.Service`, `alert.Service` i `user.Service` sense importar cap `repository` aliè.
- [OK] Estructura modular Frontend (`frontend/src/modules/telemetry/`) — Organitzat en `views/` (`DashboardView.tsx`, `ServerDetailView.tsx`, `ServerHistoryView.tsx`), `store.ts`, `api.ts` i `types.ts`, fidel als 3 mockups aprovats a `mockups/telemetry/`.

## Incidències (si n'hi ha)
Cap incidència detectada.
