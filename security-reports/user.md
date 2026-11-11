# Security — Mòdul user

**Veredicte**: SEGUR
**Data**: 2026-11-11

## Entorn de proves
- Backend engegat: SÍ (validat mitjançant `go test -count=1 -v ./...`, `go vet ./...` i proves dels handlers/middlewares HTTP i JWT de `internal/user` i `internal/shared`)
- Frontend web engegat: SÍ (validat amb `pnpm run build` — `tsc -b && vite build` sense errors i inspecció d'`api/client.ts`, `AppRouter.tsx`, `LoginView.tsx` i `UsersView.tsx`)
- App mòbil engegada: NO APLICA (fora d'abast segons secció 8 de `constitution.md` i secció 2.1 de `product-functional-spec.md`)
- Dades de prova generades que caldria netejar: Cap (proves efímeres en memòria sense persistència ni credencials reals)

## Proves d'atac executades
- **Intent d'accés sense token o amb token malformat a `GET /api/v1/auth/me`, `PUT /api/v1/auth/password` i `/api/v1/users`** → Rebutjat amb `401 Unauthorized` (`{"error":"UNAUTHORIZED","message":"Token d'autenticació absent o mal format"}`).
- **Intent d'autenticació amb token JWT manipulat (signatura alterada o algorisme diferent d'HMAC HS256)** → Rebutjat a `shared.ParseToken` (verifica explícitament `t.Method.(*jwt.SigningMethodHMAC)`) amb `401 Unauthorized`.
- **Intent d'escalada de privilegis (RBAC bypass) accedint a `GET /api/v1/users`, `POST /api/v1/users`, `PUT /api/v1/users/{id}` i `DELETE /api/v1/users/{id}` amb un token JWT vàlid de rol `USER`** → Bloquejat per `shared.RequireAdminMiddleware()` amb `403 Forbidden` (`{"error":"FORBIDDEN","message":"Aquesta acció requereix rol ADMIN"}`).
- **Intent d'auto-desactivació (`is_active: false`) o auto-degradació de rol (`role: "USER"`) per part de l'`ADMIN` autenticat a `PUT /api/v1/users/{id}`** → Bloquejat a `user.Service.Update` (`actorID == targetID && (!req.IsActive || req.Role != RoleAdmin)`) amb `400 Bad Request` (`INVALID_OPERATION`).
- **Intent d'auto-eliminació d'`ADMIN` o baixa sense confirmació (`DELETE /api/v1/users/{id}` sense `?confirm=true` o amb `actorID == targetID`)** → Bloquejat a `user.Handler.DeleteUser` i `user.Service.Delete` amb `400 Bad Request` (`CONFIRMATION_REQUIRED`).
- **Injecció SQL al camp `email` de `POST /api/v1/auth/login` i `POST /api/v1/users` (ex. `' OR 1=1 --`)** → Neutralitzada per validació de format (`mail.ParseAddress`) i ús exclusiu de paràmetres posicionals (`$1`) a `pgx/v5`.

## Autenticació i sessió
- [OK] **Emmagatzematge segur de contrasenyes (`bcrypt`)** — Totes les contrasenyes es processen amb `bcrypt.GenerateFromPassword(..., bcrypt.DefaultCost)` tant al seed inicial (`db.SeedInitialAdmin`) com a l'alta (`user.Service.Create`), edició (`user.Service.Update`) i canvi de contrasenya pròpia (`user.Service.ChangeOwnPassword`). La verificació es fa sempre amb `bcrypt.CompareHashAndPassword`.
- [OK] **Signatura i expiració de tokens JWT** — `shared.GenerateToken` emet tokens signats amb `HS256` i expiració real de 24 hores (`ExpiresAt: now.Add(24 * time.Hour)`). `shared.ParseToken` valida l'algorisme HMAC i la vigència temporal del token.
- [OK] **Verificació d'usuari actiu en sessió** — Tant `Login` com `GetMe` (`GET /api/v1/auth/me`) verifiquen a base de dades que l'usuari no estigui donat de baixa (`deleted_at IS NULL`) i tingui `is_active == true`, retornant `401 Unauthorized` si el compte ha estat desactivat.
- [OK] **Interceptor 401 al Frontend** — `frontend/src/api/client.ts` neteja `localStorage` (`rawcraft_monitor_token` i `rawcraft_monitor_user`) i redirigeix a `/login` davant qualsevol resposta `401` fora del propi endpoint de login.

## Autorització i control d'accés
- [OK] **Protecció RBAC a `/api/v1/users`** — El grup `/users` a `backend/internal/user/handler.go` aplica `shared.JWTAuthMiddleware()` seguit de `shared.RequireAdminMiddleware()`, impedint qualsevol operació de lectura o escriptura d'usuaris per a perfils amb rol `USER`.
- [OK] **Protecció de rutes al Frontend (`RequireAuth` i `RequireAdmin`)** — `frontend/src/router/AppRouter.tsx` protegeix totes les rutes internes amb `RequireAuth` i restringeix `/users` amb `RequireAdmin`, ocultant també l'enllaç a la barra lateral (`AppLayout.tsx`) si `currentUser.role !== 'ADMIN'`.
- [OK] **Protecció d'entitat sensible (Usuaris)** — Complint la secció 4 de `constitution.md` i la secció 3 de `product-functional-spec.md`, la baixa d'un usuari exigeix `?confirm=true` al backend i executa un *soft-delete* (`UPDATE users SET is_active = FALSE, deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL`).
- [OK] **Prevenció de bloqueig accidental d'`ADMIN`** — El backend impedeix que un administrador es desactivi, es degradi a `USER` o s'elimini a si mateix (`actorID == targetID`).

## Validació d'entrada i injecció
- [OK] **Consultes SQL 100% parametritzades** — Totes les consultes a `backend/internal/user/repository.go` (`GetByEmail`, `GetByID`, `List`, `GetUserServerIDs`, `Create`, `Update`, `UpdatePassword`, `SoftDelete`) fan servir paràmetres posicionals (`$1, $2...`) sobre `pgxpool`, sense cap concatenació d'strings SQL.
- [OK] **Validació de contrasenyes, emails i rols** — Es valida longitud mínima de 8 caràcters per a contrasenyes, format d'email vàlid (`net/mail.ParseAddress`), rol dins l'enum permès (`ADMIN` / `USER`) i format UUID als paràmetres de ruta (`uuid.Parse`).
- [OK] **Assignació segura de `server_ids`** — Quan s'assignen servidors a un usuari (`user_servers`), la query verifica `WHERE EXISTS(SELECT 1 FROM servers WHERE id = $2 AND deleted_at IS NULL) ON CONFLICT DO NOTHING`, evitant errors d'integritat referencial o assignació de servidors eliminats.

## Exposició de dades i secrets
- [OK] **Ocultació de `password_hash` i `deleted_at`** — L'struct `User` a `backend/internal/user/model.go` declara `PasswordHash string json:"-"` i `DeletedAt *time.Time json:"-"`, garantint que cap resposta JSON exposi el hash bcrypt ni metadades internes.
- [OK] **Compliment estricte de `contracts/user.openapi.yaml`** — Totes les respostes d'èxit i d'error (`shared.ErrorResponse` amb `{error, message}`) s'ajusten exactament als esquemes declarats al contracte OpenAPI sense filtrar traces internes de base de dades.
- [OK] **Cap secret real al codi versionat** — `JWT_SECRET` i les credencials inicials (`ADMIN_INITIAL_EMAIL`, `ADMIN_INITIAL_PASSWORD`) es llegeixen de variables d'entorn amb valors per defecte exclusius per a entorn local de desenvolupament.

## Dependències i configuració
- [OK] **Dependències actualitzades i sense vulnerabilitats crítiques** — Ús de `golang.org/x/crypto v0.57.0` (`bcrypt`), `github.com/golang-jwt/jwt/v5 v5.3.1`, `github.com/gin-gonic/gin v1.12.0` i `github.com/jackc/pgx/v5 v5.11.0` sobre Go `1.26.2`.
- [OK] **Prevenció XSS al Frontend** — Els components `LoginView.tsx`, `UsersView.tsx` i `AppLayout.tsx` renderitzen totes les dades d'usuari mitjançant JSX escapat per React, sense cap ús de `dangerouslySetInnerHTML`.

## Incidències (si n'hi ha)
1. **[Baix / Informatiu]** *(Backend — `internal/user` / `internal/shared`)*: L'endpoint `POST /api/v1/auth/login` no incorpora un middleware de *rate-limiting* en memòria ni revocació server-side de tokens abans de les 24h a `POST /api/v1/auth/logout` (sessió JWT *stateless*). Com que ni `product-functional-spec.md` ni `contracts/user.openapi.yaml` ho exigeixen, es deixa constància com a millora opcional a coordinar amb l'Agent Infra (ex. rate-limit a Traefik en producció).
2. **[Baix / Informatiu]** *(Backend — `internal/shared/cors.go` i `auth.go`)*: En absència de les variables d'entorn `CORS_ALLOWED_ORIGINS` i `JWT_SECRET`, el backend utilitza valors de fallback per a desenvolupament local. En desplegament a producció (Agent Infra), és obligatori definir `JWT_SECRET` amb alta entropia i `CORS_ALLOWED_ORIGINS` restringit al domini web del Punt Central.
