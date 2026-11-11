# QA — Mòdul `user`

**Veredicte**: APTE
**Data**: 2026-11-11

## Entorn de proves
- Backend engegat: SÍ (`gofmt -l .` net, `go vet ./...` net, `go test -count=1 -v ./...` 100% PASS en `internal/shared`, `internal/server`, `internal/agent`, compilació de `cmd/api` i `cmd/agent` amb `CGO_ENABLED=0` exitosa)
- Frontend web engegat: SÍ (`pnpm --filter frontend exec tsc --noEmit` sense errors i `pnpm --filter frontend run build` generat amb Vite 6.4.4 en 5.26s)
- App mòbil engegada: N/A (`mobile/` fora d'abast segons la Secció 8 de `constitution.md` i `product-functional-spec.md`)
- Base de dades local: Esquema SQL (`000001_init_schema.up.sql`) i mecanisme de seed inicial (`SeedInitialAdmin` a `backend/internal/db/db.go`) verificats
- Dades de prova generades (usuaris, registres) que caldria netejar: Cap dada residual persistent deixada a l'entorn

## Proves funcionals executades
- Verificació del flux d'autenticació JWT (`POST /api/v1/auth/login`, `GET /api/v1/auth/me`, `POST /api/v1/auth/logout`) i generació/validació de tokens HS256 (`TestGenerateAndParseJWT` a `backend/internal/shared/auth_test.go`) → PASS (`200 OK` amb token + perfil `User`, `401 Unauthorized` per credencials invàlides o usuari inactiu, `204 No Content` en logout).
- Verificació de protecció de rutes al frontend (`RequireAuth` i `RequireAdmin` a `frontend/src/router/AppRouter.tsx` i interceptor `401` a `frontend/src/api/client.ts`) → Redirecció automàtica a `/login` quan no hi ha token o expira, i redirecció a `/` si un rol `USER` intenta accedir a `/users`.
- Verificació de creació d'usuari `ADMIN` inicial (`SeedInitialAdmin` a `backend/internal/db/db.go`) → Quan `COUNT(*) FROM users WHERE deleted_at IS NULL` és `0`, insereix automàticament l'`ADMIN` a partir de `ADMIN_INITIAL_EMAIL` i `ADMIN_INITIAL_PASSWORD` amb hash `bcrypt`.
- Verificació de llistat, alta i col·lisió d'email (`GET /api/v1/users`, `POST /api/v1/users`) → Restringit a `ADMIN` via `RequireAdminMiddleware()`; valida longitud mínima de contrasenya (8 caràcters), format d'email i retorna `409 Conflict` (`DUPLICATE_EMAIL`) quan l'email ja existeix, mostrant l'alerta d'error 409 a `UsersView.tsx`.
- Verificació d'edició d'usuari, assignació de `server_ids` i protecció d'auto-desactivació (`PUT /api/v1/users/{id}`) → Actualitza nom, email, rol, `is_active`, contrasenya opcional i taula `user_servers` dins de transacció SQL; bloqueja amb `400 Bad Request` (`INVALID_OPERATION`) qualsevol intent d'un `ADMIN` de desactivar-se o degradar el seu propi rol.
- Verificació de baixa sensible amb confirmació explícita (`DELETE /api/v1/users/{id}?confirm=true`) → Rebutja amb `400 Bad Request` (`CONFIRMATION_REQUIRED`) si falta `confirm=true` o si `actorID == targetID`; aplica *soft-delete* (`is_active = FALSE, deleted_at = NOW()`). A la UI (`UsersView.tsx`) mostra el diàleg modal de confirmació d'entitat sensible i amaga el botó de baixa sobre el propi usuari.
- Verificació de canvi de contrasenya pròpia (`PUT /api/v1/auth/password`) → Comprova la contrasenya actual amb `bcrypt.CompareHashAndPassword`, exigeix mínim 8 caràcters per a la nova i retorna `204 No Content` (o `400 Bad Request` si l'actual no coincideix). Modal disponible des de la barra superior (`AppLayout.tsx`).

## Compliment funcional
- [OK] `HU-USR-01`: Inici i tancament de sessió al panell web — Login JWT (`POST /api/v1/auth/login`), perfil (`GET /api/v1/auth/me`), logout (`POST /api/v1/auth/logout`), missatge d'error `401` genèric i seed automàtic de l'`ADMIN` inicial per variables d'entorn.
- [OK] `HU-USR-02`: Llistat i creació d'usuaris (només `ADMIN`) — Middleware `RequireAdminMiddleware` retorna `403 Forbidden` a rol `USER`, taula completa amb rol, servidors assignats, estat i data d'alta, i gestió d'error `409 Conflict` en emails duplicats.
- [OK] `HU-USR-03`: Edició d'usuari, assignació de servidors i desactivació / baixa (només `ADMIN`) — Filtració estricta per `server_ids` a tots els mòduls (`CanAccessServer` / `GetAuthorizedServerIDs`), prohibició d'auto-desactivació/auto-baixa (`400 Bad Request`) i *soft-delete* (`deleted_at`) amb `confirm=true` obligatori.
- [OK] `HU-USR-04`: Canvi de contrasenya pròpia — Endpoint `PUT /api/v1/auth/password` i diàleg modal accessible per a qualsevol usuari autenticat validant la contrasenya actual i longitud mínima de 8 caràcters.

## Qualitat de codi
- [OK] Formatació i anàlisi estàtica Go (`gofmt -l .` i `go vet ./...`) — Zero avisos ni fitxers pendents de formatar.
- [OK] Consultes SQL pures i parametritzades (`backend/internal/user/repository.go`) — Ús exclusiu de paràmetres posicionals (`$1, $2...`) i transaccions explícites sense cap concatenació d'entrada d'usuari.
- [OK] Seguretat de credencials — Contrasenyes emmagatzemades amb `bcrypt.DefaultCost` i camp `PasswordHash` exclòs de JSON (`json:"-"`).
- [OK] Qualitat TypeScript i compilació Frontend — `tsc --noEmit` i `vite build` nets, zero ús de `any` / `as any`, tipus generats des de `contracts/user.openapi.yaml` (`openapi-typescript`) i totes les crides HTTP centralitzades a `src/api/client.ts`.

## Homogeneïtat
- [OK] Estructura de capes Backend (`backend/internal/user/`) — Separació estricta `handler.go` → `service.go` → `repository.go` + `model.go`, sense importar cap `repository` d'altres mòduls.
- [OK] Estructura modular Frontend (`frontend/src/modules/users/`) — Organització neta en `views/` (`LoginView.tsx`, `UsersView.tsx`), `store.ts` (Zustand), `api.ts` i `types.ts`, alineada amb els mockups aprovats (`mockups/user/login.html` i `mockups/user/users.html`).

## Incidències (si n'hi ha)
Cap incidència detectada.
