# QA — Mòdul `server`

**Veredicte**: APTE
**Data**: 2026-11-11

## Entorn de proves
- Backend engegat: SÍ (`gofmt -l .` net, `go vet ./...` net, `go test -count=1 -v ./...` 100% PASS incloent `TestGenerateAndHashAPIKey` i `TestDefaultMonitoringConfigYamlSerialization` a `backend/internal/server/service_test.go`, i compilació de `./cmd/api` i `./cmd/agent` sense CGO)
- Frontend web engegat: SÍ (`pnpm --filter frontend exec tsc --noEmit` i `pnpm --filter frontend run build` completats amb èxit sense errors ni warnings de tipus)
- App mòbil engegada: N/A (`mobile/` fora d'abast segons la Secció 8 de `constitution.md` i `product-functional-spec.md`)
- Base de dades local: Taules `servers` i `user_servers` amb suport de `config_json` (`JSONB`) i `deleted_at` verificades a `backend/migrations/000001_init_schema.up.sql`
- Dades de prova generades (usuaris, registres) que caldria netejar: Cap dada residual persistent deixada a l'entorn

## Proves funcionals executades
- Verificació d'alta de servidor i generació d'UUID + API Key (`POST /api/v1/servers`, `TestGenerateAndHashAPIKey`) → Crea el servidor amb UUID v4, genera `api_key` amb prefix `rcm_live_`, desa el hash SHA-256 (`api_key_hash`) i el preview emmascarat (`api_key_preview`), i retorna `201 Created` amb `CreateServerResponse` (`server` + `api_key`).
- Verificació de rotació d'`api_key` (`POST /api/v1/servers/{id}/rotate-key`) → Només `ADMIN`; regenera la clau i actualitza `api_key_hash` immediatament, invalidant qualsevol clau prèvia de l'agent.
- Verificació de baixa de servidor com a entitat sensible (`DELETE /api/v1/servers/{id}?confirm=true`) → Rebutja amb `400 Bad Request` (`CONFIRMATION_REQUIRED`) si no s'envia `confirm=true`; aplica *soft-delete* (`deleted_at = NOW()`) preservant l'històric associat. A la UI (`ServersListView.tsx`) presenta el diàleg modal de confirmació explícita.
- Verificació de la configuració de les 4 potetes i llindars (`GET /api/v1/servers/{id}`, `PUT /api/v1/servers/{id}`) → Permet configurar i persistir a `config_json`:
  1. **Host/SO**: toggles `enabled`, `collect_os_info`, `collect_reboot_required`, `collect_load`, `collect_disk`, `collect_memory`, `collect_swap`, `collect_processes`, `collect_users`, `collect_network_ip`, `network_interface`, `mount_points` (per defecte `["/"]`) i llindars (`sustained_checks`, `max_load_1m`, `max_disk_percent`, `max_memory_percent`, `max_swap_percent`, `max_processes`, `max_users_logged_in`).
  2. **Docker**: `enabled`, `socket_path` (`/var/run/docker.sock`), `collect_container_stats`, `alert_on_container_down`, `required_containers`, `ignore_containers`, `max_container_cpu_percent`, `max_container_memory_percent`.
  3. **Endpoints HTTP**: llista d'endpoints amb `name`, `url`, `method` (`GET`/`HEAD`), `expected_status_codes` (`[200, 202]` per defecte) i `timeout_seconds` (`5` per defecte).
  4. **PostgreSQL (dins de Docker)**: `enabled` i llista d'`instances` amb `name`, `host`, `port`, `user`, `password`, `dbname`, `sslmode`, `max_connections_percent` (`80%`), `long_query_seconds` (`60s`) i `max_long_running_queries` (`1`).
  5. **SMTP i destinataris**: `enabled`, `use_global_smtp`, `host`, `port`, `username`, `password`, `from_email`, `to_emails` i botó a la UI per omplir automàticament amb els emails dels usuaris autoritzats del servidor.
- Verificació de generació i descàrrega del bundle `config.yaml` i unitat `systemd` (`GET /api/v1/servers/{id}/config-yaml`, `TestDefaultMonitoringConfigYamlSerialization`) → Genera el YAML complet amb `server_id`, `server_name`, `central_url`, `api_key`, intervals i les 4 potetes; inclou la unitat `/etc/systemd/system/rawcraft-agent.service` amb `Environment="GOMEMLIMIT=20MiB"`, `MemoryMax=30M` i `CPUQuota=5%`, i les comandes d'instal·lació amb permisos `0600`. La vista `ServerConfigYamlView.tsx` permet copiar al porta-retalls i descarregar `<server-slug>-config.yaml`.

## Compliment funcional
- [OK] `HU-SRV-01`: Alta i baixa de servidors (només `ADMIN`) — Creació amb UUID i `api_key`, rotació de clau (`POST /servers/{id}/rotate-key`), filtratge de lectura per permisos d'usuari i baixa *soft-delete* protegida amb `confirm=true`.
- [OK] `HU-SRV-02`: Configuració de les 4 potetes i llindars per servidor (només `ADMIN`) — Formulari visual complet a `ServerConfigYamlView.tsx` i persistència íntegra de Host/SO (`reboot_required`), Docker (CPU/RAM + `required_containers`/`ignore_containers`), Endpoints HTTP (`[200, 202]`), PostgreSQL i destinataris SMTP.
- [OK] `HU-SRV-03`: Generació i descàrrega del fitxer `config.yaml` (només `ADMIN`) — Endpoint `GET /api/v1/servers/{id}/config-yaml` i pestanya de previsualització/descàrrega de `<server-slug>-config.yaml` + servei `systemd` (`GOMEMLIMIT=20MiB`, `MemoryMax=30M`).

## Qualitat de codi
- [OK] Formatació i anàlisi estàtica Go (`gofmt -l .` i `go vet ./...`) — Net sense cap incidència.
- [OK] Consultes SQL pures i parametritzades (`backend/internal/server/repository.go`) — Totes les consultes usen paràmetres posicionals (`$1, $2...`) i filtren `deleted_at IS NULL`.
- [OK] Qualitat TypeScript i client HTTP centralitzat — `tsc --noEmit` i `vite build` sense errors, zero `as any`, tipus generats des de `contracts/server.openapi.yaml` i crides HTTP exclusivament a través de `src/api/client.ts`.

## Homogeneïtat
- [OK] Estructura de capes Backend (`backend/internal/server/`) — Segueix l'estructura `handler.go` → `service.go` → `repository.go` + `model.go`. La comunicació amb el domini `user` es fa exclusivament a través de `user.Service` (`GetAuthorizedServerIDs`, `CanAccessServer`), mai important `user.Repository`.
- [OK] Estructura modular Frontend (`frontend/src/modules/servers/`) — Organitzat en `views/` (`ServersListView.tsx`, `ServerConfigYamlView.tsx`), `store.ts`, `api.ts` i `types.ts`, fidel als mockups aprovats (`mockups/server/servers-list.html` i `mockups/server/server-config-yaml.html`).

## Incidències (si n'hi ha)
Cap incidència detectada.
