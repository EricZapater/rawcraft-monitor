# Especificació Funcional de Producte — Rawcraft Monitor

Aquest document defineix el domini de negoci, l'arquitectura funcional, les entitats, els rols i les regles específiques de **Rawcraft Monitor**, d'acord amb el marc establert a `constitution.md`.

---

## 1. Visió general del producte

**Rawcraft Monitor** és una plataforma lleugera i escalable de monitorització d'infraestructura i serveis per a múltiples servidors Linux.

El sistema es compon de dues peces principals:
1. **Punt Central (Hub)**: Aplicació Backend (Go + Gin + PostgreSQL) i Frontend Web (React + Vite + TypeScript + MUI) que:
   - Gestiona usuaris i permisos d'accés per servidor.
   - Permet donar d'alta servidors, configurar quines mètriques i comprovacions es volen activar per a cadascun, i **generar/descarregar el fitxer `config.yaml`** llest per instal·lar a l'agent.
   - Rep, emmagatzema i historifica les mètriques i els estats d'alertes enviats pels agents.
   - Vigila que els agents segueixin vius (*Heartbeat*) i ofereix un panell visual d'estat actual, gràfiques històriques i registre d'incidències.
2. **Agent Recol·lector (`rawcraft-agent`)**: Binari natiu en Go (`CGO_ENABLED=0`, compilat dins el mateix mòdul Go a `backend/cmd/agent`) que s'executa **directament al sistema operatiu del servidor monitoritzat (fora de Docker, via `systemd`)** amb un consum de memòria RAM estrictament acotat.
   - Opera amb un **doble bucle (dual-loop)**:
     - **Bucle ràpid de vigilància (Watchdog)**: Comprova a intervals curts (ex. cada 10–15 segons) l'estat del maquinari, contenidors Docker, endpoints HTTP i PostgreSQL. Si es supera un llindar sostingut o cau un servei, dispara immediatament l'alerta per correu electrònic (SMTP) i la notifica al Punt Central.
     - **Bucle lent de telemetria (Snapshot)**: Envia periòdicament (ex. cada 1, 5 o 10 minuts, configurable al YAML) la fotografia completa de mètriques al Punt Central per al seu registre històric.

---

## 2. Decisions d'abast i arquitectura del projecte

1. **Plataformes client**: **Només Web (`frontend/`)**. No es desenvolupa aplicació mòbil (`mobile/` queda fora d'abast en aquest projecte).
2. **Desplegament de l'Agent fora de Docker i límit estricte de RAM**:
   - L'agent corre com a servei natiu `systemd` al host Linux per poder detectar fins i tot caigudes del propi dimoni de Docker (`dockerd`) i llegir directament `/proc` i `/var/run/docker.sock`.
   - El consum de RAM de l'agent és crític: s'executa amb `GOMEMLIMIT` (ex. `20MiB`), concurrència acotada (worker pool reduït per a lectures de Docker stats i checks HTTP) i unitat `systemd` amb `MemoryMax=30M` i `CPUQuota=5%`.
3. **Topologia i "Vigilància Creuada" (el Punt Central viu en un dels servidors monitoritzats)**:
   - Com que el Punt Central s'allotja dins d'un dels servidors monitoritzats, **l'enviament d'alertes per correu (SMTP) el pot executar directament l'Agent** a partir de la configuració del seu `config.yaml`, a més de reportar l'alerta al Punt Central.
   - Si el Punt Central deixa de respondre durant $N$ intents consecutius (configurable), l'agent de qualsevol altre servidor envia una alerta SMTP indicant que el Punt Central és inabastable.
   - Alhora, el Punt Central disposa d'un procés de *Heartbeat* que detecta si algun servidor registrat porta més de $X$ minuts sense enviar telemetria, registrant l'alerta i enviant avís per SMTP.

---

## 3. Rols d'usuari, autenticació i permisos

- **Autenticació Web**: Sessió basada en JWT (Bearer token) amb login per email i contrasenya.
- **Autenticació Agent → Punt Central**: Cada servidor té un `server_id` (UUID) únic i una `api_key` secreta generada pel Punt Central, enviada a la capçalera `X-Agent-Key` (o `Authorization: Bearer <api_key>`).
- **Sense registre públic**: Només un usuari amb rol `ADMIN` pot donar d'alta, editar o desactivar usuaris des del panell web.
- **Rols d'usuari**:
  1. **`ADMIN`**:
     - Accés total a tots els servidors, mètriques, alertes i configuracions.
     - Gestió d'usuaris (crear, editar, activar/desactivar, canviar rol) i assignació de permisos per servidor.
     - Alta, edició i baixa de servidors, configuració de llindars/checks i descàrrega del `config.yaml` de cada servidor.
     - Configuració global del sistema (incloent-hi el període de retenció de dades històriques i paràmetres SMTP per defecte).
  2. **`USER` (Operador / Visualitzador)**:
     - Només pot veure al Dashboard, al detall de servidor, a les gràfiques històriques i al llistat d'alertes aquells **servidors als quals l'`ADMIN` li ha concedit accés explícit**.
- **Dades sensibles (Secció 4 de la Constitution)**:
  - Els **Servidors** (que contenen tot l'històric associat) i els **Usuaris** es consideren entitats sensibles: qualsevol baixa és un *soft-delete* (`deleted_at` / estat inactiu) o requereix confirmació explícita abans d'eliminar dades històriques.
  - Les contrasenyes d'usuari s'emmagatzemen sempre amb hash `bcrypt`/`argon2id`. Les credencials SMTP i DSN de Postgres per a la generació del YAML es tracten com a secrets.

---

## 4. Les 4 àrees de monitorització de l'Agent (configurables per servidor)

Cada servidor pot habilitar o deshabilitar independentment qualsevol de les 4 potetes següents i definir-ne els llindars al seu `config.yaml`:

### 4.1. Mètriques de Maquinari / Sistema Operatiu (Host)
Inspirat en el resum d'estat de sistema Linux:
- **Informació del Sistema Operatiu**: Nom i versió de la distribució (`os_name`, ex. `"Ubuntu 24.04.1 LTS"` llegit d'`/etc/os-release`), versió del kernel (`kernel_version`, ex. `"6.8.0-45-generic"` via `/proc/sys/kernel/osrelease` o `uname`), arquitectura (`arch`, ex. `amd64`/`arm64`), *hostname* i indicador de reinici pendent (`reboot_required`: `boolean`, comprovant l'existència de `/var/run/reboot-required`).
- **System Load**: Load average (`load_1m`, `load_5m`, `load_15m`). Configurable llindar màxim (ex. sobre `load_1m` o `load_5m`).
- **Ús de Disc (`/` i punts de muntatge configurables)**: Percentatge d'ús (`used_percent`), espai total en GB (`total_gb`) i espai usat en GB (`used_gb`). Configurable llindar màxim de `%`.
- **Ús de Memòria RAM**: Percentatge d'ús (`used_percent`), total MB (`total_mb`) i usat MB (`used_mb`). Configurable llindar màxim de `%`.
- **Ús de Swap**: Percentatge d'ús (`used_percent`), total MB (`total_mb`) i usat MB (`used_mb`). Configurable llindar màxim de `%`.
- **Processos**: Nombre total de processos en execució (`processes_count`). Configurable llindar màxim opcional.
- **Usuaris connectats**: Nombre de sessions d'usuari actives al sistema (`users_logged_in`). Configurable llindar màxim opcional.
- **Xarxa / IPv4 principal**: Nom de la interfície configurada o autodetectada (ex. `ens3`) i la seva adreça IPv4 (ex. `91.134.91.36`), més *uptime* del servidor.

### 4.2. Contenidors Docker
Lectura a través del socket `/var/run/docker.sock` (sense necessitat d'executar l'agent dins de Docker):
- Estat del propi dimoni Docker (`docker_daemon_up`: `true`/`false`). Si el dimoni no respon i la poteta Docker està activa, es dispara alerta crítica.
- Per a cada contenidor:
  - Identificador curt (`container_id`), nom (`name`), imatge (`image`).
  - Estat (`state`: `running`, `exited`, `restarting`, `paused`, `dead`, `created`) i text d'estat/uptime (`status`, ex. `Up 4 days (healthy)`).
  - Estat de healthcheck natiu si en té (`healthy`, `unhealthy`, `starting`, `none`) i `exit_code`.
  - **Consum de recursos del contenidor**:
    - **CPU (`cpu_percent`)**: Percentatge d'ús de CPU.
    - **Memòria (`memory_used_mb`, `memory_limit_mb`, `memory_percent`)**: MB consumits i percentatge respecte al límit del contenidor (o del host si no té límit).
- **Regles d'alerta de Docker**:
  - Caiguda de qualsevol contenidor monitoritzat (transició a `exited`, `dead`, `unhealthy` o bucle de `restarting`), amb suport per a llista de contenidors ignorats (`ignore_containers`) o llista de contenidors obligatoris (`required_containers`).
  - Llindars opcionals de `% CPU` i `% RAM` per contenidor (globals o per contenidor específic).

### 4.3. Endpoints HTTP (Healthchecks d'aplicació dins dels Dockers)
Llista configurable d'endpoints HTTP/HTTPS que l'agent comprova periòdicament per validar que les aplicacions responen correctament:
- Camp identificatiu (`name`, ex. `"API Backend Prod"`), `url` (ex. `http://127.0.0.1:8080/health`), mètode (`GET` per defecte), `timeout_seconds` (ex. `5s`), i llista de **codis HTTP esperats** (per defecte `[200, 202]`).
- **Mètriques registrades per endpoint**:
  - `up` (`boolean`: `true` si el codi retornat és dins dels esperats i dins del timeout).
  - `status_code` (codi HTTP rebut, o `0` si hi ha error de connexió/timeout).
  - `response_time_ms` (latència en mil·lisegons).
  - `error_message` (si ha fallat).
- **Regla d'alerta**: Si un endpoint no retorna un dels codis esperats (`200`/`202`) o supera el timeout durant les comprovacions definides, es dispara alerta.

### 4.4. Poteta de PostgreSQL (dins de Docker)
Permet monitoritzar una o més instàncies de PostgreSQL que corren en contenidors Docker al servidor:
- Connexió amb usuari de només lectura (via TCP local/IP de xarxa Docker o socket) definida al YAML (`name`, `dsn` / `host`, `port`, `user`, `password`, `dbname`, `sslmode`).
- **Mètriques registrades per instància Postgres**:
  - `up` (`boolean`: resultat de `SELECT 1`) i `latency_ms` (temps de resposta en ms).
  - `active_connections`, `max_connections` i `connections_percent` (`%` de connexions ocupades sobre el màxim permès).
  - `database_size_mb`: Mida de la base de dades monitoritzada (o suma de bases de dades).
  - `long_running_queries`: Nombre de consultes actives que superen un llindar de segons (ex. > 60s) i `locks_waiting` (consultes bloquejades esperant lock).
- **Regles d'alerta**:
  - Instància PostgreSQL inabastable (`up == false`).
  - `%` de connexions superior al llindar configurat (ex. > 80%).
  - Consultes encallades / bloquejades superant el llindar.

---

## 5. Motor d'Alertes i Notificacions per Email

Per evitar tempestes de correus (*alert fatigue*):
1. **Doble freqüència a l'Agent**:
   - `check_interval_seconds` (ex. `15s`): Freqüència amb què el bucle ràpid comprova llindars i salut.
   - `report_interval_seconds` (ex. `300s` = 5 minuts): Freqüència amb què el bucle lent envia l'snapshot complet per historificar al Punt Central.
2. **Finestra de sosteniment (`sustained_checks` / `for_seconds`)**:
   - Les alertes de caiguda directa (Docker caigut, Endpoint HTTP caigut, Postgres caigut) poden disparar-se a la primera o segona comprovació fallida consecutiva (ex. 15–30s per evitar falsos positius durant un reinici normal).
   - Les alertes de llindar (Load, RAM, Swap, CPU de Docker) exigeixen superar el llindar durant $N$ comprovacions consecutives (ex. 4 comprovacions = 60s).
3. **Estats d'alerta i Cooldown (`FIRING` → `RESOLVED`)**:
   - Quan una condició es compleix, l'alerta passa a `FIRING`, s'envia **un únic correu d'obertura d'incidència** i es notifica al Punt Central (`POST /api/v1/agent/alerts`).
   - Mentre segueixi en estat `FIRING`, no es repeteix el correu (tret que es configuri un `repeat_interval_minutes` opcional).
   - Quan la mètrica torna a la normalitat (amb histèresi del 5% per a percentatges o retorn a `OK` per a serveis), l'alerta passa a `RESOLVED`, s'envia un **correu de recuperació** i s'actualitza l'estat al Punt Central.
4. **Destinataris de correu per servidor**:
   - Cada servidor té associada una llista d'adreces d'email destinatàries d'alertes (que al generador del Punt Central pot pre-omplir-se amb els emails dels usuaris que tenen accés al servidor, més adreces addicionals si cal).

---

## 6. Generador de `config.yaml` al Punt Central

Des de la interfície web del Punt Central, l'`ADMIN` pot configurar visualment tots els paràmetres d'un servidor:
- Nom del servidor, descripció/etiquetes, intervals (`check_interval_seconds`, `report_interval_seconds`).
- Quines mètriques de host estan actives i els seus llindars.
- Configuració de monitorització de Docker i llindars.
- Llista d'endpoints HTTP a verificar (`URL`, codis esperats `200`/`202`, timeout).
- Configuració de les instàncies PostgreSQL a verificar i els seus llindars.
- Configuració SMTP i llista d'emails destinataris de les alertes d'aquell servidor.

El Punt Central guarda aquesta configuració a la base de dades i ofereix un botó **"Descarregar `config.yaml`"** (amb el `server_id`, l'`api_key` i l'`central_url` ja injectats) llest per col·locar a `/etc/rawcraft-agent/config.yaml` al servidor corresponent.

---

## 7. Historificació i Política de Retenció

- Tots els snapshots enviats pels agents es guarden a PostgreSQL indexats per `(server_id, recorded_at DESC)`.
- **Política de retenció configurable**:
  - El sistema disposa d'un paràmetre global de retenció d'històric (`retention_days`), configurat inicialment a **365 dies** i modificable per l'`ADMIN` des de la Web.
  - Un procés periòdic (worker diari al backend del Punt Central) purga automàticament les mostres de telemetria i alertes resoltes més antigues que `retention_days`.

---

## 8. Mòduls de Domini Previstos

Seguint l'arquitectura modular per domini de `constitution.md`:

| Domini | Backend (`backend/internal/<singular>`) | Frontend (`frontend/src/modules/<plural>`) | Responsabilitat principal |
| :--- | :--- | :--- | :--- |
| **Autenticació i Usuaris** | `auth`, `user` | `auth`, `users` | Login JWT, gestió d'usuaris (Admin) i assignació de permisos per servidor. |
| **Servidors i Configuració YAML** | `server` | `servers` | CRUD de servidors, configuració de les 4 potetes/llindars, API keys i generació/descàrrega del `config.yaml`. |
| **Telemetria i Històric** | `telemetry` | `telemetry` | Ingesta de snapshots des dels agents, estat actual del servidor (host, dockers, HTTP endpoints, Postgres), consulta d'històrics/gràfiques i worker de retenció (365 dies). |
| **Alertes i Notificacions** | `alert` | `alerts` | Ingesta d'alertes d'agents, detector de *Heartbeat* de servidors caiguts, historial d'incidències (`FIRING`/`RESOLVED`) i enviament SMTP. |
| **Agent Recol·lector** | `backend/cmd/agent` + `backend/internal/agent` | *(N/A — binari CLI/systemd)* | Bucle ràpid (watchdog + SMTP) i bucle lent (snapshot cap al Punt Central) per a Host, Docker, HTTP i Postgres. |
| **Infraestructura i CI/CD** | `Dockerfile`, `docker-compose.yml`, `.github/workflows/` | `frontend/Dockerfile` | Pipelines CI/CD a GitHub Actions (GHCR + SSH deploy amb Traefik i xarxes `web`/`postgres-network`, seguint el patró de `nasc`) i compilació/distribució del binari estàtic `rawcraft-agent` + servei `systemd`. |

---

## 9. Infraestructura, CI/CD i Desplegament (Patró `nasc`)

Seguint la mateixa arquitectura de desplegament que el projecte `nasc`:

1. **Punt Central (Docker + Traefik + GHCR)**:
   - **Imatges Docker multi-stage**:
     - `ghcr.io/<owner>/rawcraft-monitor-backend`: Compila `cmd/api` en Go 1.26 i l'executa en imatge mínima amb les migracions SQL.
     - `ghcr.io/<owner>/rawcraft-monitor-frontend`: Compila l'aplicació React + Vite amb `pnpm` i la serveix amb Nginx al port `80`.
   - **`docker-compose.yml` de producció**:
     - Connectat a les xarxes externes `web` (Traefik) i `postgres-network` (PostgreSQL).
     - Variables d'entorn separades en `.env.backend` i `.env.frontend` (amb plantilles `.env.example`, `.env.backend.example` i `.env.frontend.example` al repositori).
     - Etiquetes **Traefik** (`traefik.enable=true`, `entrypoints=websecure`, `tls.certresolver=letsencrypt`) per exposar tant el backend API com el frontend web amb HTTPS automàtic.
2. **GitHub Actions (`.github/workflows/`)**:
   - **`ci.yml`**: S'executa en cada `push` (`main`, `feat/*`) i `pull_request` (`main`). Executa tests i compilació de `backend` (`./cmd/api` i `./cmd/agent` amb Go 1.26.x) i typecheck + build de `frontend` (Node 22 + `pnpm` 10).
   - **`deploy.yml`**: S'executa en `push` a `main`, tags `v*.*.*` i `workflow_dispatch`:
     - **Stage 1 (`build-and-push`)**: Construeix i publica les imatges Docker de Backend i Frontend a **GitHub Container Registry (`ghcr.io`)** amb tags semver, `sha-` i `latest`. A més, compila el binari estàtic `rawcraft-agent` (`CGO_ENABLED=0 GOOS=linux GOARCH=amd64` i `arm64`) i el publica com a artefacte / GitHub Release.
     - **Stage 2 (`deploy-to-vps`)**: Copia `docker-compose.yml` via `appleboy/scp-action` a `~/rawcraft-monitor` al VPS remot (`SSH_HOST`, `SSH_USER`, `SSH_KEY`, `SSH_PORT`) i executa via `appleboy/ssh-action` el `docker login ghcr.io`, `docker compose pull`, `docker compose up -d --remove-orphans` i `docker image prune -f`.
3. **Desplegament de l'Agent Recol·lector (`rawcraft-agent`) als servidors**:
   - L'agent NO va en Docker: s'instal·la com a binari únic a `/usr/local/bin/rawcraft-agent` amb configuració a `/etc/rawcraft-agent/config.yaml` (permisos `0600`) i unitat `/etc/systemd/system/rawcraft-agent.service` (amb `MemoryMax=30M` i `CPUQuota=5%`).
   - Des de la mateixa pantalla del Punt Central on es descarrega el `config.yaml`, es proporciona també la comanda/script d'instal·lació i actualització ràpida del binari i del servei `systemd`.

