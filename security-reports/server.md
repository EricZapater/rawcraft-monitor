# Security — Mòdul server

**Veredicte**: SEGUR
**Data**: 2026-11-11

## Entorn de proves
- Backend engegat: SÍ (validat mitjançant `go test -count=1 -v ./...` incloent `TestGenerateAndHashAPIKey` i `TestDefaultMonitoringConfigYamlSerialization`, `go vet ./...` i auditoria de `internal/server`)
- Frontend web engegat: SÍ (validat amb `pnpm run build` — `tsc -b && vite build` i revisió de `ServersListView.tsx`, `ServerConfigYamlView.tsx`, `api.ts` i `store.ts`)
- App mòbil engegada: NO APLICA (fora d'abast segons secció 8 de `constitution.md`)
- Dades de prova generades que caldria netejar: Cap (proves efímeres en memòria sense persistència)

## Proves d'atac executades
- **Intent d'IDOR a `GET /api/v1/servers/{id}` amb un usuari de rol `USER` sobre un servidor no assignat a `user_servers`** → Bloquejat a `server.Service.GetAuthorizedByID` (`userService.CanAccessServer` retorna `false`) i `server.Handler.GetServerByID` respon amb `403 Forbidden` (`{"error":"FORBIDDEN","message":"Sense permís per a aquest servidor"}`).
- **Intent d'accés amb rol `USER` als endpoints d'administració (`POST /api/v1/servers`, `PUT /api/v1/servers/{id}`, `DELETE /api/v1/servers/{id}`, `POST /api/v1/servers/{id}/rotate-key`, `GET /api/v1/servers/{id}/config-yaml`)** → Bloquejat pel grup `adminOnly.Use(shared.RequireAdminMiddleware())` amb `403 Forbidden`.
- **Intent d'extracció del `config.yaml` (que conté l'`api_key` i credencials SMTP/Postgres) per part d'un usuari `USER` autoritzat a veure el servidor** → Bloquejat perquè `GET /api/v1/servers/{id}/config-yaml` està dins el subgrup protegit amb `RequireAdminMiddleware()`, retornant `403 Forbidden`.
- **Intent d'eliminar un servidor sense confirmació explícita (`DELETE /api/v1/servers/{id}` sense `?confirm=true` o amb `?confirm=false`)** → Rebutjat a `server.Handler.DeleteServer` i `server.Service.Delete` amb `400 Bad Request` (`CONFIRMATION_REQUIRED`).
- **Injecció de caràcters especials o *path traversal* al nom del servidor (`Prod VPS ../../etc/passwd`) en generar el nom de fitxer del bundle YAML** → Neutralitzat per la funció `slugify(srv.Name)` amb l'expressió regular `[^a-z0-9\-]+`, generant un nom de fitxer segur (`prod-vps-etcpasswd-config.yaml`).

## Autenticació i sessió
- [OK] **Generació criptogràfica i hash `SHA-256` d'`api_key`** — `generateAPIKey()` a `backend/internal/server/service.go` genera 20 bytes aleatoris amb `crypto/rand.Read` (40 caràcters hexadecimals amb prefix `rcm_live_`) i calcula el seu digest `SHA-256` (`hashAPIKey`) per a la validació ràpida i segura d'`X-Agent-Key` (`GetByAPIKeyHash`).
- [OK] **Rotació immediata d'`API Key`** — `POST /api/v1/servers/{id}/rotate-key` substitueix atòmicament `api_key_hash`, `api_key_plain` i `api_key_preview` a PostgreSQL, invalidant a l'instant qualsevol clau anterior utilitzada per un agent.
- [OK] **Autenticació JWT obligatòria** — Tot el grup `/api/v1/servers` exigeix un token JWT vàlid mitjançant `shared.JWTAuthMiddleware()`.

## Autorització i control d'accés
- [OK] **Separació estricta de permisos `ADMIN` vs `USER`** — Els usuaris `USER` només poden consultar `GET /api/v1/servers` (que retorna exclusivament els servidors assignats a `user_servers`) i `GET /api/v1/servers/{id}` (si hi tenen permís). Totes les operacions d'alta, modificació de les 4 potetes/llindars, baixa, rotació de clau i generació de `config.yaml` exigeixen `RequireAdminMiddleware()`.
- [OK] **Protecció d'entitat sensible (Servidors)** — D'acord amb la secció 4 de `constitution.md` i la secció 3 de `product-functional-spec.md`, `DELETE /api/v1/servers/{id}` exigeix obligatòriament `confirm=true` i aplica *soft-delete* (`UPDATE servers SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL`), preservant la traçabilitat i excloent el servidor del *Heartbeat*.

## Validació d'entrada i injecció
- [OK] **Consultes SQL 100% parametritzades** — Totes les queries a `backend/internal/server/repository.go` (`ListAll`, `ListByIDs`, `GetByID`, `GetByAPIKeyHash`, `Create`, `Update`, `UpdateAPIKey`, `UpdateTelemetryMetadata`, `UpdateStatus`, `SoftDelete`) utilitzen paràmetres posicionals (`$1, $2...`) amb `pgx/v5`.
- [OK] **Serialització YAML estructuralment segura** — `GenerateYamlBundle` construeix el fitxer `config.yaml` serialitzant l'struct tipat `AgentYamlFile` amb `github.com/goccy/go-yaml` (`yaml.Marshal`), evitant injeccions d'estructura YAML per concatenació manual de cadenes.
- [OK] **Normalització de configuració i intervals** — `Update` i `normalizeConfigSlices` garanteixen valors mínims segurs per a `check_interval_seconds` (15s), `report_interval_seconds` (300s), `central_unreachable_failures` (3), `sustained_checks` (4) i `socket_path` (`/var/run/docker.sock`).

## Exposició de dades i secrets
- [OK] **Ocultació de `APIKeyHash` i `APIKeyPlain` a les respostes de servidor** — L'struct `Server` (`backend/internal/server/model.go`) defineix `APIKeyHash string json:"-"` i `APIKeyPlain string json:"-"`, retornant únicament el prefix emmascarat `api_key_preview` (`rcm_live_xxxxxx...`) a `GET /api/v1/servers` i `GET /api/v1/servers/{id}`.
- [OK] **Permisos `0600` per al fitxer `config.yaml` i unitat `systemd` acotada** — El bundle generat per `GET /api/v1/servers/{id}/config-yaml` inclou explícitament `sudo chmod 0600 /etc/rawcraft-agent/config.yaml` a `install_commands` i les directives `Environment="GOMEMLIMIT=20MiB"`, `MemoryMax=30M` i `CPUQuota=5%` a `systemd_service`.
- [OK] **Compliment del contracte `contracts/server.openapi.yaml`** — Totes les estructures JSON i codis d'estat HTTP (`200`, `201`, `204`, `400`, `403`, `404`) coincideixen amb l'especificació OpenAPI.

## Dependències i configuració
- [OK] **Dependències netes i compilació verificada** — `github.com/goccy/go-yaml v1.19.2` i `crypto/rand` / `crypto/sha256` de la llibreria estàndard de Go `1.26.2`, sense vulnerabilitats conegudes.
- [OK] **Frontend sense vectors d'injecció DOM** — Les vistes `ServersListView.tsx` i `ServerConfigYamlView.tsx` descarreguen el `config.yaml` utilitzant `Blob` amb tipus `text/yaml;charset=utf-8` i renderitzen la previsualització dins d'elements React escapats.

## Incidències (si n'hi ha)
1. **[Baix / Informatiu]** *(Backend — `internal/server`)*: Per permetre que l'`ADMIN` pugui descarregar el fitxer `config.yaml` llest per instal·lar en qualsevol moment (`HU-SRV-03`), la taula `servers` guarda `api_key_plain` (amb `json:"-"` perquè no s'exposi a l'API general) i les credencials opcionals de les potetes Postgres/SMTP dins `config_json`. L'endpoint `GET /api/v1/servers/{id}` és accessible pels usuaris autoritzats del servidor i retorna l'objecte `config`; si s'utilitzen credencials SMTP o Postgres específiques per servidor (en lloc de `use_global_smtp: true`), aquestes viatgen dins `config`. Es recomana prioritzar `use_global_smtp: true` i usuaris de PostgreSQL estrictament de només lectura (`pg_monitor`) tal com indica `product-functional-spec.md`.
