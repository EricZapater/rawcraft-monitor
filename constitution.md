# Constitution — Felag

Aquest document és la font de veritat per a qualsevol agent que treballi en
aquest projecte. No es pot saltar ni reinterpretar sense actualitzar aquest
fitxer primer. **És un document plantilla, agnòstic de producte**: no conté
res específic d'un domini de negoci concret. 

## 0. Com s'usa aquesta plantilla

- Aquest fitxer i els nou fitxers d'agent de `.agent/` defineixen un
  sistema multiagent reutilitzable per a qualsevol projecte amb stack
  Go + React + React Native.
- **El que no canvia entre projectes**: l'stack tecnològic (secció 1), els
  rols i límits de cada agent, els checkpoints humans, el format dels
  informes.
- **El que sí canvia per projecte**: el domini de negoci, les entitats, els
  fluxos concrets, i qualsevol decisió llistada a la secció 8. Això viu a
  `product-functional-spec.md` (que cada projecte escriu abans de començar)
  i als `specs/<modul>.md` que genera l'Orquestrador per a cada èpica.

## 1. Stack tecnològic (no negociable, vàlid per a tots els projectes)

### Backend
- **Llenguatge**: Go (versió estable més recent, 1.26+)
- **Framework HTTP**: Gin
- **Base de dades**: PostgreSQL
- **Accés a dades**: SQL pur, sense ORM. Les queries viuen a la capa
  `repository` de cada mòdul, mai embegudes a handlers ni a la capa de
  servei.
- **Migracions**: `golang-migrate`, fitxers SQL explícits amb up/down, mai
  auto-generació d'esquema.
- **Arquitectura: modular per domini (screaming architecture)**, NO per
  capes planes. Cada domini de negoci és un paquet propi dins `internal/`,
  en **singular**, amb les seves pròpies capes a dins:
  ```
  backend/
    cmd/api
    internal/
      <domini>/
        handler.go       -> capa HTTP (Gin), sense lògica de negoci
        service.go        -> lògica de negoci
        repository.go     -> queries SQL d'aquest domini
        model.go            -> structs de domini
      shared/
        -> codi transversal real: middleware, response helpers, errors,
           validació genèrica. Només allò veritablement compartit per
           ≥2 mòduls.
      db/
        -> connexió, pool, migracions
  ```
- **Regla de dependència entre mòduls**: un mòdul pot dependre de `shared`,
  però mai importa directament el `repository` d'un altre mòdul. Si
  necessita dades d'un altre domini, ho fa via el `service` d'aquell
  domini.
- **Nomenclatura de nous mòduls**: singular, nom del domini de negoci, no
  de la taula (`enrollment`, no `enrollments_table`).

### Frontend web
- **Framework**: React (funcional, Hooks)
- **Build tool**: Vite
- **Llenguatge**: TypeScript per defecte
- **Gestor de paquets**: **pnpm únicament** (mai `npm install` ni `yarn`;
  si apareix un `package-lock.json` o un `yarn.lock`, és un error a
  corregir)
- **Gestió d'estat**: Zustand — un store per mòdul
- **Routing**: React Router
- **Component library**: MUI (Material UI)
- **HTTP client**: Axios, centralitzat a `src/api/client.ts` amb
  interceptors d'auth/errors
- **Arquitectura: modular per domini, en plural**:
  ```
  frontend/
    src/
      modules/
        <dominis>/
          views/          -> pàgines/rutes d'aquest mòdul
          components/     -> components NOMÉS usats dins d'aquest mòdul
          store.ts         -> store Zustand del mòdul
          api.ts            -> crides Axios específiques del mòdul
          types.ts           -> tipus TS (generats del contracte OpenAPI)
      components/
        -> components genuïnament compartits entre ≥2 mòduls
      hooks/
        -> lògica reutilitzable no visual (ex. useDebounce, usePagination)
      router/
      api/
        -> client.ts (Axios amb interceptors), config base
  ```

### Mobile
- **Framework**: React Native amb **Expo** (managed workflow per defecte;
  sortir-ne — "bare workflow" o mòduls natius custom — requereix
  confirmació humana explícita, no és una decisió que prengui l'agent
  mòbil sol)
- **Llenguatge**: TypeScript per defecte
- **Gestor de paquets**: pnpm (workspace compartit amb `frontend/`)
- **Navegació**: React Navigation
- **Gestió d'estat**: Zustand — un store per mòdul, mateix patró que el
  frontend web
- **Component library**: React Native Paper (Material Design, mateixa
  família visual que MUI al web, per facilitar coherència entre
  plataformes sense ser idèntiques)
- **HTTP client**: Axios, centralitzat a `src/api/client.ts` amb
  interceptors, mateix patró que el frontend web
- **Arquitectura: modular per domini, en plural**:
  ```
  mobile/
    src/
      modules/
        <dominis>/
          screens/        -> pantalles d'aquest mòdul
          components/     -> components NOMÉS usats dins d'aquest mòdul
          store.ts         -> store Zustand del mòdul
          api.ts            -> crides Axios específiques del mòdul
          types.ts           -> tipus TS (generats del contracte OpenAPI)
      components/
      hooks/
      navigation/
      api/
        -> client.ts
  ```

### Monorepo i eines transversals
- Un únic repositori a l'arrel amb `backend/`, `frontend/`, `mobile/`,
  `contracts/`, `specs/`, `mockups/`, `qa-reports/`, `ux-reports/`.
- `pnpm-workspace.yaml` a l'arrel, cobrint `frontend/` i `mobile/`
  (`backend/` no hi entra, és Go). Configuració compartida d'ESLint i
  Prettier a l'arrel del workspace JS.
- Els tipus TypeScript de `frontend/` i `mobile/` es generen del mateix
  contracte OpenAPI (`openapi-typescript` o equivalent), mai transcrits a
  mà per separat — evita que web i mòbil divergeixin del contracte real.

## 2. Regles d'arquitectura

- Separació estricta handler → service → repository **dins de cada mòdul**
  backend. Un handler mai fa una query SQL directament.
- Queries SQL explícites (no query builders dinàmics), amb paràmetres
  posicionals (`$1, $2...`).
- Un mòdul nou (backend, frontend o mobile) es crea només quan hi ha un
  domini de negoci clar. No crear mòduls per una sola pantalla o un sol
  endpoint si no representen un domini propi.
- Cap lògica de negoci crítica duplicada al frontend/mobile — el backend
  és sempre l'última paraula en validació. Frontend i mobile validen
  només per UX (feedback immediat), no per seguretat.
- El contracte OpenAPI (`contracts/<modul>.openapi.yaml`) és l'única font
  de veritat de la interfície entre backend i **tots dos** clients (web i
  mòbil). Cap dels dos client-side agents pot inventar-se camps,
  endpoints o codis d'error que no hi siguin.
- Autenticació: JWT o sessió — a decidir a l'spec de la primera feature
  d'auth de cada projecte, no assumit aquí.
- **Regla per decidir on viu un component** (frontend i mobile): si dubtes
  si és "compartit" o "del mòdul", la resposta per defecte és que viu al
  mòdul. Es promou a `/components` només quan un segon mòdul el necessita
  de veritat.

## 3. Convencions de codi

- Go: `gofmt` + `golangci-lint` obligatoris abans de donar per tancada una
  tasca.
- React/React Native + TS: ESLint + Prettier (config compartida a l'arrel
  del workspace); cap agent introdueix codi que trenqui el lint.
- Noms de taules i columnes a Postgres: `snake_case`. Noms de variables Go:
  convenció estàndard (`camelCase`/`PascalCase`). Noms de variables/funcions
  TS: `camelCase`; components React: `PascalCase`.
- Commits atòmics per tasca, missatges descriptius (mai "wip" ni "fix
  stuff").

## 4. Principis del projecte

- **Simplicitat abans que flexibilitat prematura**: no afegir capes
  d'abstracció (interfaces, factories) fins que hi hagi una necessitat
  real de substituir la implementació.
- **L'usuari final pot no ser tècnic**: qualsevol UI (web o mòbil) ha de
  ser clara sense necessitat d'explicació prèvia, tret que l'spec del
  projecte digui explícitament que el públic és tècnic.
- **Dades sensibles**: si `product-functional-spec.md` d'un projecte marca
  alguna entitat com a sensible (dades d'usuari, dades acadèmiques,
  financeres...), cap operació destructiva sobre aquesta entitat es fa
  sense confirmació explícita al backend (soft-delete per defecte, mai
  DELETE físic sense flag de confirmació). Si l'spec no diu res, no
  s'assumeix cap regla especial.

## 5. Quan un agent ha de generar spec/pla abans de codi

- Tasca simple (fix, ajust visual, canvi de text): pot anar directe a
  codi.
- Tasca que toca model de dades, afegeix un endpoint nou, o introdueix una
  entitat de domini nova: requereix spec + contracte OpenAPI abans
  d'implementar.
- Tasca ambigua o que afecta més d'un mòdul o més d'una plataforma
  (backend + web + mòbil alhora): requereix spec + contracte + revisió
  humana explícita abans d'implementar (veure Checkpoints, secció 7).

### Fitxers d'especificació per agent

```
<nom-projecte>/
  constitution.md            -> aquest document (regles globals, agnòstiques)
  product-functional-spec.md -> espec de producte d'AQUEST projecte concret
                                 (a escriure abans de començar; no la genera
                                 cap agent, la proporciona l'humà/producte)
  VERSION
  CHANGELOG.md
  .agent/
    orchestrator.md
    mockup-agent.md
    backend-agent.md
    frontend-agent.md
    mobile-agent.md
    qa-agent.md
    ux-agent.md
    infra-agent.md
    security-agent.md
  backend/
    Dockerfile                -> escrit per l'agent Infra
    ...
  frontend/
    Dockerfile                -> escrit per l'agent Infra
    ...
  mobile/
    eas.json / app.json       -> escrit per l'agent Infra
    ...
  pnpm-workspace.yaml
  docker-compose.yml          -> escrit per l'agent Infra
  .github/
    workflows/                 -> escrit per l'agent Infra
  contracts/
    <modul>.openapi.yaml       -> contracte validat del mòdul
  specs/
    <modul>.md                  -> èpica + històries d'usuari del mòdul
  mockups/
    <modul>/
      <pantalla>.html            -> mockup HTML+CSS autocontingut
      <pantalla>.jpg              -> captura estàtica (si cal compartir fora)
    approvals.md                 -> registre d'aprovació humana per pantalla
  qa-reports/
    <modul>.md                   -> informe QA (APTE/NO APTE)
  ux-reports/
    <modul>.md                   -> informe UX (APTE/A MILLORAR)
  security-reports/
    <modul>.md                   -> informe Security (SEGUR/NO SEGUR)
```

Cada fitxer d'agent respon, com a mínim: àmbit d'escriptura, font de
veritat, output esperat, i quan s'atura i pregunta en lloc de decidir sol.

## 6. Control de versions i changelog

- Semantic Versioning (`MAJOR.MINOR.PATCH`) al fitxer `VERSION` a l'arrel.
- **Únic responsable de pujar de versió i mantenir `CHANGELOG.md`:
  l'Orquestrador.** Cap altre agent (picacodis ni Infra) hi toca
  directament.
- `CHANGELOG.md` en format [Keep a Changelog](https://keepachangelog.com/).
- **Quan es puja de versió**: al Checkpoint 5 (merge a la branca principal
  d'un mòdul complet i validat), no abans.
- **Criteri de bump**:
  - `PATCH`: correccions sense canvi de contracte ni de comportament
    visible.
  - `MINOR`: mòdul o funcionalitat nova que no trenca cap contracte
    existent.
  - `MAJOR`: canvi que trenca un contracte OpenAPI ja validat i en ús.
    Requereix validació humana explícita abans de fer-se, com qualsevol
    canvi de contracte.
- Els tags de Git (`vMAJOR.MINOR.PATCH`) es creen alhora que es puja
  `VERSION`.

## 7. Flux de treball multiagent (nou rols)

El flux, de cap a cap, per a qualsevol èpica nova:

```
Humà envia èpica
   → Orquestrador (històries d'usuari, escala dubtes/buits, no inventa)
   → [Checkpoint 1: humà valida històries]
   → Agent Mockup (HTML+CSS, happy path + estats de notificació/error,
     sense codi d'aplicació, per a web i mòbil)
   → [Checkpoint 2: humà valida cada pantalla — si KO, torna a Mockup]
   → Orquestrador (contracte OpenAPI a partir d'històries + mockups aprovats)
   → [Checkpoint 3: humà valida el contracte — si KO, torna a l'Orquestrador]
   → Backend + Frontend + Mobile (en paral·lel, contra el mateix contracte
     i els mateixos mockups aprovats)
   → Agent QA + Agent Security (en paral·lel, cadascun executant l'app de
     veritat en local; tots dos són gates bloquejants)
   → [Checkpoint 4: veredicte QA (APTE/NO APTE) + veredicte Security
     (SEGUR/NO SEGUR) — qualsevol dels dos negatiu bloqueja i torna a
     l'agent d'implementació corresponent]
   → Agent UX (en paral·lel a QA/Security o just després, compara amb els
     mockups aprovats — el seu informe és consultiu, no bloqueja)
   → [Checkpoint 5: humà revisa i decideix el merge, amb informes QA +
     Security + UX com a input]
   → Agent Infra (pipeline, build, un cop mergejat)
   → [Checkpoint 6: humà valida abans de desplegament real a staging/
     producció o publicació a stores]
```

Nota important sobre l'ordre real: QA i Security **poden córrer en
paral·lel** entre ells (tots dos necessiten l'aplicació engegada en
local, i cap dels dos escriu codi, així que no hi ha conflicte d'àmbit).
L'UX pot començar tan aviat com hi hagi una versió funcional, sense
esperar el veredicte de cap dels altres dos. Però el Checkpoint 5 (merge)
**no es pot superar** fins que QA sigui APTE **i** Security sigui SEGUR —
l'informe UX hi és com a input, no com a bloqueig.

Si a qualsevol punt un agent es troba amb una ambigüitat que els fitxers
que té no resolen, **no improvisa**: escala a l'Orquestrador, que ho eleva
a l'humà si cal. Un "torna enrere" en aquest flux mai el decideix un agent
sol — sempre és una resposta humana explícita (KO) a un checkpoint.

### Rol 1 — Orquestrador
Tradueix èpiques en històries d'usuari (mai n'inventa cap per omplir buits
— escala), dissenya el contracte OpenAPI un cop els mockups estan
aprovats, dispara els agents d'implementació, recull informes de QA/UX,
i és l'únic que toca `VERSION`/`CHANGELOG.md`. Àmbit d'escriptura:
`specs/`, `contracts/`, `VERSION`, `CHANGELOG.md`. Mai codi.

### Rol 2 — Agent Mockup
Produeix mockups HTML+CSS autocontinguts de cada pantalla (web i mòbil),
mostrant el happy path i els estats de notificació/error rellevants. No
escriu codi d'aplicació ni interactivitat real. Bloqueja l'entrega a
qualsevol agent d'implementació fins a l'aprovació humana explícita per
pantalla. Àmbit d'escriptura: `mockups/`.

### Rol 3 — Agent Backend
Implementa el backend Go seguint el contracte OpenAPI validat. Àmbit:
`backend/`. Branca: `feat/<modul>-backend`.

### Rol 4 — Agent Frontend
Implementa el frontend React seguint el mateix contracte. Àmbit:
`frontend/`. Branca: `feat/<modul>-frontend`.

### Rol 5 — Agent Mobile
Implementa l'app React Native seguint el mateix contracte. Àmbit:
`mobile/`. Branca: `feat/<modul>-mobile`.

### Rol 6 — Agent QA
Valida compliment funcional, qualitat de codi i homogeneïtat dels tres
codebases, executant-los de veritat en local (backend, web, i mòbil via
simulador/emulador o Expo Go). Àmbit d'escriptura: `qa-reports/`.
Veredicte: APTE / NO APTE.

### Rol 7 — Agent UX
Valida experiència d'ús real en web i mòbil, comparant amb els mockups
aprovats i entre plataformes. Àmbit d'escriptura: `ux-reports/`.
Veredicte: APTE / A MILLORAR.

### Rol 8 — Agent Infra
Responsable de Docker/CI-CD per a backend i frontend, i de la
configuració de build/publicació per a mòbil (EAS o equivalent). Mai
lògica de negoci. Àmbit: `backend/Dockerfile`, `frontend/Dockerfile`,
`mobile/eas.json`/`app.json`, `docker-compose.yml`,
`.github/workflows/`. Mai desplegament real sense Checkpoint 6.

### Rol 9 — Agent Security
Valida seguretat dels tres codebases mitjançant revisió i **proves
d'atac reals contra l'app engegada en local** (autenticació, autorització/
IDOR, injecció, exposició de dades/secrets, dependències vulnerables).
Àmbit d'escriptura: `security-reports/`. Veredicte: SEGUR / NO SEGUR —
**bloqueja el merge igual que el QA**, en paral·lel a ell.

### Checkpoints humans (resum)
- **Checkpoint 1**: històries d'usuari.
- **Checkpoint 2**: cada pantalla de mockup (web i mòbil).
- **Checkpoint 3**: contracte OpenAPI.
- **Checkpoint 4**: veredictes QA + Security (bloqueig automàtic per
  procés si algun dels dos és negatiu; no cal que l'humà intervingui
  perquè el bloqueig ja és efectiu, però qualsevol reobertura de
  l'ambigüitat s'eleva a l'humà).
- **Checkpoint 5**: merge a la branca principal (requereix QA APTE +
  Security SEGUR; informe UX com a suport, no com a bloqueig).
- **Checkpoint 6**: primer desplegament real a staging/producció o
  primera publicació a stores.

## 8. Fora d'abast / decisions específiques del projecte

Per a **Rawcraft Monitor** (detallat a `product-functional-spec.md`):

- **Només Frontend Web (sense aplicació mòbil)**: Aquest projecte NO inclou aplicació React Native (`mobile/` queda fora d'abast; l'Agent Mobile no s'activa i els agents QA/UX/Security validen `backend/` i `frontend/`).
- **Binari de l'Agent Recol·lector (`rawcraft-agent`)**: A més de l'API del Punt Central (`backend/cmd/api`), el backend Go produeix un segon binari estàtic (`backend/cmd/agent`, amb lògica a `backend/internal/agent`) que corre fora de Docker (via `systemd`) als servidors monitoritzats, amb un límit estricte de memòria RAM (`GOMEMLIMIT=20MiB`, `MemoryMax=30M`).
- **Autenticació**:
  - Usuaris web: JWT (Bearer token), sense registre públic (altes gestionades per rol `ADMIN`).
  - Agents recol·lectors: `server_id` + `api_key` per servidor a través de capçalera HTTP (`X-Agent-Key`).
- **Multiusuari amb permisos per servidor**: Els usuaris amb rol `ADMIN` veuen i gestionen tots els servidors i usuaris; els usuaris amb rol `USER` només tenen accés als servidors que tenen assignats.
- **Configuració per servidor via `config.yaml`**: Es pot configurar i descarregar des del Punt Central per a cada servidor, definint les 4 potetes (Host, Docker + CPU/RAM per contenidor, Endpoints HTTP `200`/`202`, i PostgreSQL dins de Docker), els llindars i els destinataris SMTP.
- **Retenció d'històric**: Configurable globalment per l'`ADMIN`, amb valor inicial per defecte de **365 dies**.
- **Dades sensibles**: Usuaris i Servidors requereixen confirmació explícita o *soft-delete* abans de qualsevol operació destructiva al backend.
