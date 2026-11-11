# Security — Mòdul telemetry

**Veredicte**: SEGUR
**Data**: 2026-11-11

## Entorn de proves
- Backend engegat: SÍ (validat mitjançant `go test -count=1 -v ./...` incloent `TestCollectHttpEndpoints_Expected200And202` i `TestParseConfigBytes_Defaults`, `go vet ./...` i auditoria de `internal/telemetry`, `internal/agent` i `cmd/agent`)
- Frontend web engegat: SÍ (validat amb `pnpm run build` — `tsc -b && vite build` i revisió de `DashboardView.tsx`, `ServerDetailView.tsx`, `ServerHistoryView.tsx`, `api.ts` i `store.ts`)
- App mòbil engegada: NO APLICA (fora d'abast segons secció 8 de `constitution.md`)
- Dades de prova generades que caldria netejar: Cap (proves efímeres en memòria sense persistència)

## Proves d'atac executades
- **Intent d'ingesta de telemetria (`POST /api/v1/agent/telemetry`) sense capçalera `X-Agent-Key` o amb una clau invàlida/revocada** → Bloquejat per `shared.AgentAuthMiddleware(h.agentValidator)` amb `401 Unauthorized` (`{"error":"INVALID_AGENT_KEY","message":"API Key d'agent invàlida o revocada"}`).
- **Intent de suplantació de servidor (*Server Spoofing*) enviant a `POST /api/v1/agent/telemetry` l'`X-Agent-Key` del Servidor A però indicant al JSON body el `server_id` del Servidor B** → Neutralitzat a `telemetry.Service.IngestSnapshot` (línia 42: `req.ServerID = authenticatedServerID`), que sobreescriu sempre el `server_id` del payload amb l'UUID vinculat a la clau d'agent autenticada.
- **Intent d'IDOR amb un usuari de rol `USER` a `GET /api/v1/servers/{id}/telemetry/latest` i `GET /api/v1/servers/{id}/telemetry/history` sobre un servidor no assignat** → Bloquejat per `s.serverService.GetAuthorizedByID(ctx, userID, role, serverID)`, retornant `403 Forbidden` (`{"error":"FORBIDDEN","message":"Sense permís per a aquest servidor"}`).
- **Intent de modificació de la política de retenció (`PUT /api/v1/settings/retention`) per part d'un usuari amb rol `USER`** → Bloquejat per `shared.RequireAdminMiddleware()` amb `403 Forbidden`.
- **Intent de configurar una retenció destructiva (`PUT /api/v1/settings/retention` amb `retention_days: 0` o negatiu per esborrar tot l'històric)** → Rebutjat a `telemetry.Service.UpdateRetentionSettings` (`if days < 7`) amb `400 Bad Request` (`INVALID_RETENTION`).
- **Injecció SQL als paràmetres `range`, `from` i `to` de `GET /api/v1/servers/{id}/telemetry/history`** → Neutralitzada perquè `range` es valida contra un `switch` tancat (`6h`, `24h`, `7d`, `30d`, `365d`), `from`/`to` es parsegen estrictament amb `time.Parse(time.RFC3339, ...)` i la consulta SQL utilitza paràmetres posicionals (`$1, $2, $3`).

## Autenticació i sessió
- [OK] **Autenticació dedicada per a `rawcraft-agent` (`X-Agent-Key`)** — L'endpoint `POST /api/v1/agent/telemetry` s'autentica amb `shared.AgentAuthMiddleware`, validant el hash `SHA-256` de la clau contra servidors actius (`deleted_at IS NULL`).
- [OK] **Autenticació JWT per a consultes de telemetria web** — Tots els endpoints de consulta (`/telemetry/dashboard`, `/servers/:id/telemetry/latest`, `/servers/:id/telemetry/history`, `/settings/retention`) exigeixen `shared.JWTAuthMiddleware()`.

## Autorització i control d'accés
- [OK] **Aïllament multiusuari al Dashboard i Detall de Servidor (anti-IDOR)** — `GetDashboardOverview` obté únicament els servidors autoritzats per a l'usuari (`s.serverService.ListAuthorized`), i tant `GetServerLatest` com `GetServerHistory` verifiquen l'accés a `user_servers` abans de retornar cap dada.
- [OK] **Vinculació estricta `X-Agent-Key` → `server_id`** — Un agent recol·lector només pot escriure snapshots per al seu propi `server_id` autenticat, impedint contaminar la telemetria d'altres servidors.
- [OK] **Protecció RBAC a la configuració de retenció** — Mentre que `GET /api/v1/settings/retention` permet consultar el valor actual (365 dies per defecte), `PUT /api/v1/settings/retention` exigeix rol `ADMIN` (`RequireAdminMiddleware()`).

## Validació d'entrada, injecció i blindatge de `rawcraft-agent`
- [OK] **Consultes SQL 100% parametritzades** — Totes les consultes a `backend/internal/telemetry/repository.go` (`InsertSnapshot`, `GetLatestByServer`, `ListByServerAndWindow`, `GetRetentionSettings`, `UpdateRetentionSettings`, `PurgeSnapshotsBefore`) i a `backend/internal/agent/collector_postgres.go` utilitzen paràmetres posicionals (`$1, $2...`) sense cap concatenació d'inputs.
- [OK] **Blindatge estricte de memòria RAM a `rawcraft-agent` (`GOMEMLIMIT=20MiB`)** — `backend/cmd/agent/main.go` aplica `debug.SetMemoryLimit(20 * 1024 * 1024)` (20 MiB) a l'inici del procés i `runner.go` invoca `runtime.GC()` al final de cada cicle per mantenir la petjada sota el límit `MemoryMax=30M` de `systemd`.
- [OK] **Worker pool acotat a 3 goroutines per a Docker stats** — `CollectDockerMetrics` (`backend/internal/agent/collector_docker.go`) limita la concurrència a `const maxWorkers = 3` goroutines i utilitza un client HTTP sobre socket Unix amb timeout de `5s` i `DisableKeepAlives: true`.
- [OK] **Timeouts i límits de lectura en checks HTTP i PostgreSQL** — `CollectHttpEndpoints` força mètodes de només lectura (`GET` o `HEAD`), aplica timeout per endpoint (`5s` per defecte) i drena com a màxim 4 KiB (`io.LimitReader(resp.Body, 4096)`) per evitar atacs d'esgotament de memòria si un endpoint retorna un cos gegant. `CollectPostgresMetrics` construeix la URL de connexió amb `net/url.URL` (`url.UserPassword` i `url.QueryEscape`), aplica timeout de `5s` i executa consultes de només lectura.
- [OK] **Downsampling automàtic d'històrics** — `GetServerHistory` limita la resposta a un màxim de `240` punts temporals (`const maxPoints = 240`), evitant respostes JSON excessives al navegador.

## Exposició de dades i secrets
- [OK] **Compliment estricte de `contracts/telemetry.openapi.yaml`** — Les respostes de Dashboard (`DashboardOverviewResponse`), detall en viu (`ServerLiveDetailResponse`), històric (`ServerHistoryResponse`) i retenció (`RetentionSettings`) contenen exclusivament els camps definits al contracte OpenAPI.
- [OK] **Cap exposició de credencials als snapshots** — Els snapshots de PostgreSQL (`PostgresInstanceSnapshot`) només registren el nom lògic de la instància (`name`) i les mètriques numèriques/estat, sense incloure mai l'usuari ni la contrasenya de connexió del `config.yaml`.

## Dependències i configuració
- [OK] **Lectura directa del sistema operatiu sense execució de sub-shells** — `collector_host.go` llegeix directament `/etc/os-release`, `/proc/sys/kernel/osrelease`, `/proc/uptime`, `/proc/loadavg`, `/proc/meminfo`, `/var/run/reboot-required` i `syscall.Statfs` sense executar mai `exec.Command` ni invocar shells (`sh`/`bash`), eliminant d'arrel qualsevol superfície d'injecció de comandes al servidor monitoritzat.
- [OK] **Renderització segura de gràfiques al Frontend** — `ServerHistoryView.tsx` genera les polilínies SVG a partir de valors numèrics validats (`Math.max` / `Math.min`) i totes les vistes del mòdul (`DashboardView.tsx`, `ServerDetailView.tsx`, `ServerHistoryView.tsx`) escapen el text mitjançant React.

## Incidències (si n'hi ha)
Cap incidència de seguretat detectada.
