# QA — Mòdul `alert`

**Veredicte**: APTE
**Data**: 2026-11-11

## Entorn de proves
- Backend engegat: SÍ (`gofmt -l .` net, `go vet ./...` net, `go test -count=1 -v ./...` 100% PASS incloent `TestEvaluator_SustainedChecksAndHysteresis` i `TestEvaluator_DockerAndHttpTransitions` a `backend/internal/agent/evaluator_test.go`, i compilació de `./cmd/api` i `./cmd/agent` sense CGO)
- Frontend web engegat: SÍ (`pnpm --filter frontend exec tsc --noEmit` i `pnpm --filter frontend run build` completats amb èxit)
- App mòbil engegada: N/A (`mobile/` fora d'abast segons la Secció 8 de `constitution.md` i `product-functional-spec.md`)
- Base de dades local: Taula `alerts` amb restriccions `CHECK` per a `status` (`FIRING`, `RESOLVED`), `category` (`HOST`, `DOCKER`, `HTTP_ENDPOINT`, `POSTGRES`, `HEARTBEAT`) i `severity` (`WARNING`, `CRITICAL`) i índexs parcials verificada a `backend/migrations/000001_init_schema.up.sql`
- Dades de prova generades (usuaris, registres) que caldria netejar: Cap dada residual persistent deixada a l'entorn

## Proves funcionals executades
- Verificació d'avaluació de llindars sostinguts i histèresi del 5% al bucle ràpid de l'agent (`TestEvaluator_SustainedChecksAndHysteresis` a `backend/internal/agent/evaluator_test.go`) → Amb llindar de RAM del `85%` i `sustained_checks = 3`: les comprovacions 1 i 2 al `90%` no disparen alerta; la 3a comprovació consecutiva al `90%` emet exactament 1 transició `FIRING`; una 4a comprovació al `92%` no repeteix l'alerta (evita tempesta de correus); una baixada al `82%` no resol l'alerta perquè no supera la histèresi del 5% (`<= 80%`); i quan baixa al `79%` emet exactament 1 transició `RESOLVED`.
- Verificació d'alertes de Docker, Endpoints HTTP i PostgreSQL (`TestEvaluator_DockerAndHttpTransitions` i `evaluator.go`) → Caiguda del dimoni Docker (`docker:daemon`), caiguda de contenidor monitoritzat o absència d'un `required_container` disparen `FIRING` immediat; contenidors dins d'`ignore_containers` s'ignoren; un endpoint HTTP que falla 2 comprovacions consecutives dispara `FIRING` i en tornar a `200`/`202` emet `RESOLVED`; caiguda o saturació de connexions/queries lentes a PostgreSQL dispara i resol les alertes corresponents.
- Verificació de notificació immediata al Punt Central i enviament SMTP (`POST /api/v1/agent/alerts`, `backend/internal/alert/service.go`, `backend/internal/agent/runner.go`) → L'agent envia correu SMTP d'obertura (`FIRING`) i de recuperació (`RESOLVED`) i notifica `POST /api/v1/agent/alerts` amb `smtp_sent_by_agent: true` perquè el Punt Central registri o resolgui l'alerta per `fingerprint` sense duplicar l'enviament de correu.
- Verificació de Vigilància Creuada (`HU-ALT-02`):
  - **Heartbeat al Punt Central (`StartHeartbeatWorker` / `EvaluateServerHeartbeat` a `backend/internal/alert/service.go`)**: Comprova cada minut tots els servidors actius i, si `now - last_seen_at > 2.5 * report_interval_seconds`, marca el servidor com a `OFFLINE`, crea l'alerta `heartbeat:server_offline` (`SERVER_OFFLINE`, categoria `HEARTBEAT`, severitat `CRITICAL`) i envia correu SMTP. Quan el servidor torna a enviar telemetria (`ResolveServerOfflineIfFiring`), resol automàticament l'alerta i envia el correu de recuperació.
  - **Vigilància des de l'Agent cap al Punt Central (`handleHubFailure` / `handleHubRecovery` a `backend/internal/agent/runner.go`)**: Quan l'agent acumula `central_unreachable_failures` (per defecte `3`) errors consecutius enviant telemetria al Punt Central, dispara un correu SMTP local `CENTRAL_UNREACHABLE` i envia el correu `RESOLVED` quan es restableix la connexió.
- Verificació del panell web d'alertes i reconeixement (`GET /api/v1/alerts`, `POST /api/v1/alerts/{id}/acknowledge`, `AlertsView.tsx` i `AppLayout.tsx`) → Mostra el comptador d'alertes actives (`active_firing_count`) tant al menú lateral com a la capçalera del panell d'alertes; permet filtrar per servidor autoritzat, estat (`FIRING`/`RESOLVED`), categoria (`HOST`, `DOCKER`, `HTTP_ENDPOINT`, `POSTGRES`, `HEARTBEAT`) i severitat (`WARNING`, `CRITICAL`); permet marcar una alerta activa com a `acknowledged` registrant `acknowledged_by` i `acknowledged_at`; i inclou la pestanya de previsualització del format de correu SMTP (`FIRING` i `RESOLVED`).

## Compliment funcional
- [OK] `HU-ALT-01`: Vigilància en bucle ràpid i enviament d'email SMTP des de l'Agent — Avaluació cada `check_interval_seconds` de les 4 potetes amb finestra `sustained_checks`, histèresi del 5%, transicions úniques `FIRING` → `RESOLVED` sense tempesta de correus i sincronització amb `POST /api/v1/agent/alerts`.
- [OK] `HU-ALT-02`: Vigilància creuada (Heartbeat del Punt Central i caiguda del Punt Central) — Worker cada minut al backend amb llindar $2.5 \times \text{report\_interval\_seconds}$ (`SERVER_OFFLINE` + auto-resolució en rebre telemetria) i alerta SMTP `CENTRAL_UNREACHABLE` des de l'agent després de $K$ errors consecutius.
- [OK] `HU-ALT-03`: Panell i històric d'alertes a la Web (filtrat per permisos d'usuari) — Indicador global d'alertes `FIRING`, filtres per servidor, estat, categoria i severitat, detall complet de valor vs. llindar i durada, i acció `Acknowledge` (`POST /api/v1/alerts/{id}/acknowledge`).

## Qualitat de codi
- [OK] Formatació i anàlisi estàtica Go (`gofmt -l .` i `go vet ./...`) — Net sense cap avís.
- [OK] Consultes SQL pures i parametritzades (`backend/internal/alert/repository.go`) — Totes les consultes i filtres dinàmics construeixen placeholders posicionals (`$1, $2...`) passant els valors a `args...`, sense cap concatenació de valors d'usuari.
- [OK] Qualitat TypeScript i client HTTP centralitzat — `tsc --noEmit` i `vite build` nets, zero `as any`, tipus generats des de `contracts/alert.openapi.yaml` i crides HTTP centralitzades a `src/api/client.ts`.

## Homogeneïtat
- [OK] Estructura de capes Backend (`backend/internal/alert/`) — Separació estricta `handler.go` → `service.go` → `repository.go` + `model.go`. Accedeix a dades de servidors i permisos via `server.Service` i `user.Service`, sense importar cap `repository` d'un altre mòdul.
- [OK] Estructura modular Frontend (`frontend/src/modules/alerts/`) — Organitzat en `views/` (`AlertsView.tsx`), `store.ts`, `api.ts` i `types.ts`, fidel al mockup aprovat (`mockups/alert/alerts.html`).

## Incidències (si n'hi ha)
Cap incidència detectada.
