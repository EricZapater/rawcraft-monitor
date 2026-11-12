# Onboarding Tècnic: `rawcraft-agent`

Aquest document ofereix una visió tècnica aprofundida del funcionament, arquitectura interna i decisions de disseny de l'agent de monitoratge **`rawcraft-agent`**.

Mentre que el Punt Central (Hub) és una aplicació web clàssica (API REST en Go + base de dades PostgreSQL + Frontend en React/MUI), l'agent està dissenyat amb una filosofia radicalment oposada: **consum de recursos imperceptible, zero dependències de runtime i màxima autonomia si el món exterior o el Hub cauen**.

---

## 1. Filosofia i Principis de Disseny

```
┌────────────────────────────────────────────────────────────────────────┐
│                        rawcraft-agent (Host VPS)                       │
│                                                                        │
│   GOMEMLIMIT=20MiB │ MemoryMax=30M │ CPUQuota=5% │ CGO_ENABLED=0      │
│                                                                        │
│   ┌───────────────┐   ┌─────────────────┐   ┌──────────────────────┐   │
│   │ 5 Collectors  │──▶│    Evaluator    │──▶│  SMTP Autònom (Local)│   │
│   │ (Sense forks) │   │ (Finestra+Hist) │   └──────────────────────┘   │
│   └───────────────┘   └────────┬────────┘                              │
│                                │                                       │
│                                ▼                                       │
│                       Runner (Doble Bucle)                             │
│                       ├── Ràpid (15s): Watchdog + Logs + Alertes       │
│                       └── Lent (300s): Snapshot Telemetria             │
└────────────────────────────────┼───────────────────────────────────────┘
                                 │ HTTP POST (X-Agent-Key)
                                 ▼
                     Punt Central (Hub API)
```

1. **Binari únic i 100% autònom**:
   - Compilat amb `CGO_ENABLED=0` i flags d'enllaçat `-ldflags="-w -s"`.
   - No requereix `libc`, biblioteques compartides, Python, Node, ni cap eina externa instal·lada al host.
   - Grandària del binari executable: ~12 MB.
2. **Zero subprocessos o forks de shell**:
   - L'agent **mai** fa crides del tipus `exec.Command("sh", "-c", ...)` ni depèn d'eines del sistema com `top`, `free`, `ps` o `df`.
   - Tota la informació del sistema s'obté llegint directament descriptors de fitxers virtuals del kernel Linux (`/proc/*`, `/sys/*`) o fent crides de sistema pures (`syscall.Statfs`).
3. **Autonomia davant caigudes del Punt Central**:
   - Si el servidor central cau o hi ha un tall de xarxa general, l'agent continua operatiu avaluant regles localment.
   - Si té configurat un servidor SMTP (com Mailgun, SendGrid o postfix local), **emet alertes crítiques per correu electrònic de manera autònoma** sense dependre del Hub.
   - Detecta si el Hub no respon durant $N$ cicles consecutius i s'autodispara una alerta d'aïllament.
4. **Blindatge extrem de memòria i CPU**:
   - `debug.SetMemoryLimit(20 * 1024 * 1024)` (`GOMEMLIMIT=20MiB`) actiu a l'arrencada per forçar la recol·lecció d'escombraries (GC) abans de saturar la memòria.
   - Invocació periòdica de `runtime.GC()` al final de cada iteració per alliberar memòria de buffers immediatament.
   - Control a nivell de cgroup del kernel mitjançant `systemd`: `MemoryMax=30M` i `CPUQuota=5%`.

---

## 2. Estructura de Fitxers i Responsabilitats

El codi font de l'agent resideix a [`backend/cmd/agent/`](../backend/cmd/agent/) i [`backend/internal/agent/`](../backend/internal/agent/):

```
backend/
├── cmd/
│   └── agent/
│       └── main.go                  # Punt d'entrada, memòria i senyals UNIX
└── internal/
    └── agent/
        ├── config.go                # Càrrega i validació de YAML (/etc/rawcraft-agent/config.yaml)
        ├── runner.go                # Orquestrador del doble bucle (Watchdog i Snapshot)
        ├── evaluator.go             # Motor d'alertes en memòria (sosteniment i histèresi)
        ├── evaluator_test.go        # Tests unitaris del motor d'alertes
        ├── collector_host.go        # Mètriques de CPU, RAM, Swap, Discos i Uptime
        ├── collector_docker.go      # Mètriques de contenidors via socket Docker
        ├── collector_logs.go        # Mini-Loki: recol·lector incremental de logs Docker
        ├── collector_logs_test.go   # Tests del descodificador binari i dedup de logs
        ├── collector_http.go        # Monitoratge d'endpoints HTTP
        └── collector_postgres.go    # Mètriques d'instàncies PostgreSQL
```

---

## 3. El Doble Bucle d'Execució (`Runner`)

El coordinador principal és la struct `Runner` a [`runner.go`](../backend/internal/agent/runner.go). Desacobla la vigilància en temps real de la persistència històrica mitjançant dos temporitzadors concurrents:

### A) Bucle Ràpid (Watchdog) — Cada 15 segons (configurable)
- **Objectiu**: Reaccionar en qüestió de segons davant incidents i transmetre logs en viu sense bufar memòria.
- **Passos**:
  1. Executa els 5 collectors de mètriques.
  2. Passa les fotografies a l'`Evaluator` per comprovar transicions d'estat (`OK` ➔ `FIRING` o `FIRING` ➔ `RESOLVED`).
  3. Si es produeix alguna transició:
     - Envia immediatament el correu SMTP d'alerta (autònom).
     - Fa un push immediat a l'API del Hub: `POST /api/v1/agent/alerts`.
  4. **Recol·lecció de Logs (Mini-Loki)**:
     - Comprova nous registres generats pels contenidors Docker actius.
     - Si hi ha nous logs, fa `POST /api/v1/agent/logs`. Si cap contenidor ha generat activitat, no realitza cap crida HTTP.
  5. Crida `runtime.GC()` per retornar pàgines de memòria al sistema operatiu.

### B) Bucle Lent (Snapshot) — Cada 300 segons (5 minuts)
- **Objectiu**: Guardar la telemetria agregada a llarg termini per nodrir les gràfiques d'històric (CPU, RAM, discos, latències).
- **Passos**:
  1. Empaqueta l'objecte `TelemetryIngestRequest`.
  2. Fa `POST /api/v1/agent/telemetry` autenticat amb la capçalera `X-Agent-Key`.
  3. En cas de fallada continuada durant $N$ cicles (`central_unreachable_failures`), activa l'alerta local de Hub inabastable.

---

## 4. Detall dels 5 Recol·lectors ("Pilars")

### 1. Host (`collector_host.go`)
- **CPU Load**: Llegeix i parseja el fitxer `/proc/loadavg` per extreure les mitjanes d'1, 5 i 15 minuts.
- **Memòria RAM i Swap**: Obre `/proc/meminfo` i calcula la memòria realment utilitzada restant la memòria recuperable (`MemAvailable`, buffers i memòria cau).
- **Espai en Disc**: Executa `syscall.Statfs(mountPoint)` per a cada punt de muntatge configurat (per defecte `/`), calculant blocs totals i lliures.
- **Reinici Pendent**: Fa `os.Stat("/var/run/reboot-required")`. Retorna cert si el fitxer generat per `needrestart` o paquets de seguretat d'Ubuntu/Debian existeix.
- **Processos i Usuaris**: Compta les entrades numèriques de `/proc` i extreu les sessions d'usuaris connectats.

### 2. Docker Daemon & Stats (`collector_docker.go`)
- **Connexió per Socket Unix**: Utilitza un transport HTTP personalitzat que marca `DialContext` sobre `"unix", "/var/run/docker.sock"`.
- **Health del Dimoni**: Fa `GET /_ping`. Si falla, marca `docker_daemon_up: false` i no processa cap contenidor.
- **Estat i Imatges**: Llegeix `/containers/json?all=true` i `/images/json` (per calcular mides virtuals en disc d'imatges).
- **Worker Pool Limitada**: Per obtenir CPU i memòria de cada contenidor fa `GET /containers/{id}/stats?stream=false`. Per tal de no saturar la CPU en servidors amb desenes de contenidors, empra un **semàfor màxim de 3 goroutines concurrents**.

### 3. Docker Logs / Mini-Loki (`collector_logs.go`)
- **Recol·lecció Incremental**:
  - Consulta `/containers/{id}/logs?stdout=true&stderr=true&timestamps=true&since={lastSeen}&tail=300`.
- **Descodificació de Capçaleres Docker (Stream Demuxing)**:
  - En contenidors sense TTY interactiva, Docker envia un flux multiplexat amb capçaleres de 8 bytes:
    - Byte 0: Tipus de stream (`1` = `stdout`, `2` = `stderr`).
    - Bytes 1..3: Sempre `0`.
    - Bytes 4..7: Longitud del frame en format big-endian (`binary.BigEndian.Uint32`).
  - L'agent llegeix els frames al vol, extreu el prefix de timestamp en format `time.RFC3339Nano` i separa el missatge de text net.
- **Control de Sobrecàrrega**:
  - `DockerLogTracker` manté l'últim timestamp registrat per contenidor per evitar reenviar línies duplicades.
  - Sostre de 64 KB per frame i màxim 300 línies per contenidor i cicle, garantint que el consum de RAM romangui sota el llindar estricte de 20 MiB.

### 4. Endpoints HTTP (`collector_http.go`)
- Executa peticions concurrents (amb `sync.WaitGroup`) als endpoints HTTP o HTTPS definits a la configuració.
- Registra el timestamp precís de la petició, el codi de resposta HTTP (p. ex. 200, 202) i la latència de xarxa en mil·lisegons.

### 5. PostgreSQL (`collector_postgres.go`)
- Obre un pool mínim de connexió via `pgxpool` cap a les instàncies de bases de dades locals.
- Executa consultes lleugeres sobre el catàleg del sistema:
  - Mida de cada base de dades amb `pg_database_size()`.
  - Connexions actives, inactives i totals a `pg_stat_activity`.
  - Transaccions confirmades, rollbacks i deadlocks a `pg_stat_database`.

---

## 5. El Motor d'Alertes Intel·ligent (`evaluator.go`)

L'agent inclou una màquina d'estats en memòria dissenyada per evitar falsos positius i oscil·lacions d'alertes ("flapping"):

1. **Finestra de Sosteniment (`sustained_checks`)**:
   - Per a mètriques volàtils (com CPU, RAM o processos), el llindar ha d'estar vulnerat durant $N$ cicles consecutius (per defecte 4 comprovacions = ~60 segons) abans de considerar que l'alerta està en estat `FIRING`.
   - Tasques puntuals com un `cron` pesat o una arrencada transitòria no dispararan alertes.
2. **Marges d'Histèresi (`HysteresisPercent = 5.0`)**:
   - Quan una alerta entra en estat `FIRING` (per exemple, RAM > 85%), no es tanca (`RESOLVED`) en el moment exacte en què la RAM baixa al 84.9%.
   - S'aplica un marge del 5%: l'alerta només es resol quan el valor baixa per sota de `85% - 5% = 80%`.
3. **Alertes Crítiques Immediates**:
   - Defectes d'alta disponibilitat com el dimoni de Docker aturat o un contenidor crític caigut tenen `sustained_checks = 1` i es notifiquen de forma instantània.

---

## 6. Desplegament i Manteniment a Producció

### Fitxer de Configuració (`/etc/rawcraft-agent/config.yaml`)
L'agent llegeix la seva configuració d'un fitxer YAML protegit amb permisos `0600`:

```yaml
server_id: "00000000-0000-0000-0000-000000000000"
server_name: "vps-production-01"
central_url: "https://api.monitor.ericzapater.cat"
api_key: "rc_agent_..."
check_interval_seconds: 15
report_interval_seconds: 300
central_unreachable_failures: 3

host:
  enabled: true
  collect_os_info: true
  collect_load: true
  collect_memory: true
  collect_swap: true
  collect_reboot_required: true
  mount_points:
    - "/"
  thresholds:
    sustained_checks: 4
    max_load_1m: 8.0
    max_memory_percent: 85.0
    max_swap_percent: 50.0
    max_disk_percent: 90.0

docker:
  enabled: true
  socket_path: "/var/run/docker.sock"
  alert_on_container_down: true
  # required_containers: ["nginx-proxy", "api-backend"] # Opcional: llista blanca estricta

smtp:
  enabled: false
  host: "smtp.mailgun.org"
  port: 587
  username: "postmaster@monitor.ericzapater.cat"
  password: "..."
  from: "alertes@monitor.ericzapater.cat"
  to: ["admin@ericzapater.cat"]
```

### Unitat Systemd (`/etc/systemd/system/rawcraft-agent.service`)
```ini
[Unit]
Description=RawCraft Monitoring Host Agent
After=network.target docker.service
Wants=docker.service

[Service]
Type=simple
ExecStart=/usr/local/bin/rawcraft-agent -config /etc/rawcraft-agent/config.yaml
Restart=always
RestartSec=5s
User=root

# Blindatge estricte de recursos via cgroups
MemoryMax=30M
CPUQuota=5%
Environment=GOMEMLIMIT=20MiB

[Install]
WantedBy=multi-user.target
```

### Actualització de l'Agent en Calent
Com que el Punt Central compila automàticament el binari de l'agent i el serveix a l'endpoint `/api/v1/agent/binary`, actualitzar qualsevol servidor monitoritzat es resumeix en 3 comandes:

```bash
sudo curl -fsSL https://api.monitor.ericzapater.cat/api/v1/agent/binary -o /usr/local/bin/rawcraft-agent
sudo chmod 0755 /usr/local/bin/rawcraft-agent
sudo systemctl restart rawcraft-agent
```
