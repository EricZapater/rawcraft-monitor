# Security — Mòdul alert

**Veredicte**: SEGUR
**Data**: 2026-11-11

## Entorn de proves
- Backend engegat: SÍ (validat mitjançant `go test -count=1 -v ./...` incloent `TestEvaluator_SustainedChecksAndHysteresis` i `TestEvaluator_DockerAndHttpTransitions`, `go vet ./...` i auditoria de `internal/alert`, `internal/agent/evaluator.go` i `internal/shared/smtp.go`)
- Frontend web engegat: SÍ (validat amb `pnpm run build` — `tsc -b && vite build` i revisió d'`AlertsView.tsx`, `api.ts` i `store.ts`)
- App mòbil engegada: NO APLICA (fora d'abast segons secció 8 de `constitution.md`)
- Dades de prova generades que caldria netejar: Cap (proves efímeres en memòria sense persistència)

## Proves d'atac executades
- **Intent d'enviament d'una alerta falsa (`POST /api/v1/agent/alerts`) sense `X-Agent-Key` o amb clau invàlida** → Bloquejat per `shared.AgentAuthMiddleware(h.agentValidator)` amb `401 Unauthorized` (`INVALID_AGENT_KEY`).
- **Intent de suplantació de servidor a `POST /api/v1/agent/alerts` enviant un `server_id` d'un altre servidor al body JSON** → Neutralitzat a `alert.Service.ReportAgentAlertEvent` (línia 35: `req.ServerID = authenticatedServerID`), forçant sempre el `server_id` associat a la clau d'agent autenticada.
- **Intent d'IDOR a `GET /api/v1/alerts?server_id=<uuid_no_autoritzat>` amb un usuari de rol `USER`** → Neutralitzat perquè `alert.Service.ListAuthorized` obté sempre `filter.ServerIDs = authIDs` i `alert.Repository.List` aplica obligatòriament `WHERE a.server_id = ANY($1)` abans d'aplicar `AND a.server_id = $2`, retornant una llista buida (`items: []`, `active_firing_count: 0`) sense filtrar cap alerta del servidor aliè.
- **Intent d'IDOR a `POST /api/v1/alerts/{id}/acknowledge` amb un usuari de rol `USER` sobre una alerta d'un servidor no autoritzat** → Bloquejat a `alert.Service.Acknowledge` (`s.userService.CanAccessServer(ctx, userID, role, existing.ServerID)` retorna `false`), responent amb `403 Forbidden` (`{"error":"FORBIDDEN","message":"Sense permís per al servidor d'aquesta alerta"}`).
- **Injecció SQL als filtres opcionals de `GET /api/v1/alerts` (`status`, `category`, `severity`, `limit`)** → Neutralitzada a `alert.Repository.List`: la construcció dinàmica de la query només afegeix marcadors posicionals (`fmt.Sprintf(" AND a.status = $%d", argIdx)`) i passa tots els valors a l'slice parametritzat `args...`, acotant també `limit` entre `1` i `500` (per defecte `100`).

## Autenticació i sessió
- [OK] **Autenticació d'agent (`X-Agent-Key`) a `/api/v1/agent/alerts`** — Només agents amb una `api_key` activa registrada al Punt Central poden reportar transicions `FIRING` / `RESOLVED`.
- [OK] **Autenticació JWT als endpoints web d'alertes** — Tant `GET /api/v1/alerts` com `POST /api/v1/alerts/{id}/acknowledge` estan protegits amb `shared.JWTAuthMiddleware()`, enregistrant a `acknowledged_by` l'email extret dels claims verificats del JWT (`shared.GetAuthUserEmail(c)`).

## Autorització i control d'accés
- [OK] **Filtratge estricte per `user_servers` al llistat d'alertes** — Un usuari amb rol `USER` només pot visualitzar alertes i comptadors (`active_firing_count`) dels servidors que té explícitament assignats. Si no té cap servidor assignat (`len(filter.ServerIDs) == 0`), el repositori retorna immediatament `[]Alert{}, 0, nil` sense ni tan sols consultar la taula.
- [OK] **Verificació de pertinença abans d'`Acknowledge`** — `Acknowledge` comprova el `ServerID` de l'alerta contra `userService.CanAccessServer` abans de permetre marcar-la com a reconeguda.

## Validació d'entrada i injecció
- [OK] **Consultes SQL 100% parametritzades** — Totes les consultes a `backend/internal/alert/repository.go` (`GetByID`, `GetFiringByFingerprint`, `UpsertFiringAlert`, `ResolveAlert`, `List`, `Acknowledge`, `CountFiringByServer`, `PurgeResolvedBefore`) utilitzen exclusivament paràmetres posicionals (`$1, $2...`) amb `pgx/v5`.
- [OK] **Restriccions `CHECK` a PostgreSQL i validació de camps obligatoris** — L'esquema SQL (`000001_init_schema.up.sql`) força `status IN ('FIRING', 'RESOLVED')`, `category IN ('HOST', 'DOCKER', 'HTTP_ENDPOINT', 'POSTGRES', 'HEARTBEAT')` i `severity IN ('WARNING', 'CRITICAL')`, i `ReportAgentAlertEvent` valida que `fingerprint`, `target_name` i `title` no siguin buits.
- [OK] **Protecció contra tempestes de correus (*Alert Fatigue* / DoS SMTP)** — Tant l'`Evaluator` de l'agent (`backend/internal/agent/evaluator.go`) com `UpsertFiringAlert` / `ResolveAlert` al Punt Central garanteixen que el correu SMTP només s'envia quan hi ha una **transició real d'estat** (`stateTransition && !req.SMTPSentByAgent`), amb finestra de sosteniment (`sustained_checks`) i histèresi del `5%` abans de resoldre.

## Exposició de dades i secrets
- [OK] **Resolució segura de credencials SMTP globals** — `shared.ResolveGlobalSMTP` llegeix `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` i `SMTP_FROM` de variables d'entorn sense cap contrasenya SMTP hardcoded al codi font.
- [OK] **Compliment estricte de `contracts/alert.openapi.yaml`** — Totes les respostes (`Alert`, `AlertsListResponse`, `ErrorResponse`) s'ajusten als esquemes del contracte OpenAPI.

## Dependències i configuració
- [OK] **Ús de `net/smtp` estàndard i renderització segura al Frontend** — L'enviament de correu utilitza el paquet estàndard `net/smtp` de Go `1.26.2`, i la vista `AlertsView.tsx` al frontend renderitza totes les dades d'incidències i la previsualització del correu dins d'elements React escapats, sense risc d'XSS.

## Incidències (si n'hi ha)
1. **[Baix / Informatiu]** *(Backend — `internal/shared/smtp.go`)*: La funció `SendAlertEmail` construeix la capçalera `Subject` amb `fmt.Sprintf("Subject: %s", subject)`. Tot i que els títols d'alerta provenen de plantilles internes de l'`Evaluator` i dels noms de servidor configurats per l'`ADMIN`, es recomana com a mesura de defensa en profunditat netejar possibles salts de línia (`\r`, `\n`) a `subject` i `FromEmail`/`ToEmails` per prevenir qualsevol possibilitat d'injecció de capçaleres MIME si un títol d'alerta contingués salts de línia.
