# Changelog

Tots els canvis rellevants d'aquest projecte es documenten en aquest fitxer.

El format es basa en [Keep a Changelog](https://keepachangelog.com/ca/1.0.0/),
i aquest projecte segueix [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.4] - 2026-11-14

### Fixed
- **Neteja i normalització automàtica de URLs a endpoints HTTP (`CleanEndpointURL`)**:
  - S'ha afegit sanitització tant a l'agent (`collector_http.go`), al servei backend (`server/service.go`) com a la interfície web (`ServerConfigYamlView.tsx`) per detectar si s'ha enganxat una comanda de terminal completa (`curl -i https://...`, `curl -sSL ...`).
  - L'agent i el backend n'extreuen directament la URL neta (`https://...`), evitant l'error natiu de Go `parse "...": first path segment in URL cannot contain colon`.
  - S'ha afegit assignació automàtica d'esquema (`https://` o `http://` per a localhost/IPs) si l'usuari no l'escriu expressament.

## [0.3.3] - 2026-11-14

### Fixed
- **Truncament i visualitzador complet de missatges de commit a la taula de desplegaments (`ServerDetailView.tsx`)**:
  - S'ha corregit el desbordament i solapament de text que trepitjava les cel·les adjacents quan un missatge de commit era molt llarg o multilínia.
  - S'ha fixat l'estructura de la taula amb `tableLayout: 'fixed'`, amplades explícites per a columnes fixes i `minWidth: 0` amb `textOverflow: 'ellipsis'` per a la cel·la de comentaris.
  - S'ha afegit el botó **«Veure tot»** a les files amb missatges extensos o multilínia a la taula d'escriptori, i **«Veure comentari complet →»** a les targetes per a dispositius mòbils.
  - S'ha implementat un modal emergent (`Dialog`) dedicat amb les metadades del desplegament (producte, versió, autor, entorn, commit SHA, data) i el cos complet del comentari de Git formatat en un contenidor monospace amb botó de còpia directa al porta-retalls.

## [0.3.2] - 2026-11-12

### Fixed
- **Extracció de codi de sortida a Docker (`collector_docker.go`)**:
  - `parseDockerExitCode`: Extreu el codi d'error numèric de sortida de Docker (p. ex. `139` per a SIGSEGV, `137` per a OOM) a partir de la cadena de status del dimoni (`Restarting (139)...` o `Exited (139)...`), en lloc de deixar `ExitCode: 0`.
- **Detecció immediata d'estat `restarting` & Escalada a CrashLoop (`evaluator.go`)**:
  - Els contenidors en estat `restarting` es classifiquen immediatament com a incident actiu i, si persisteixen més de 2 cicles consecutius en reinici continu, l'agent activa de forma instantània la notificació de `⚠️ [CrashLoop / Flapping]`.
- **Estat del servidor a CRITICAL per contenidors en error (`telemetry/service.go`)**:
  - `evaluateServerStatusFromSnapshot` ara avalua l'estat de tots els contenidors reportats al snapshot. Si algun contenidor està en `restarting`, `dead`, `unhealthy` o `exited` amb codi d'error, el servidor passa immediatament a estat `CRITICAL` (llum vermella al Dashboard i a la fitxa de detall).
- **Notificació per correu electrònic en canvis d'escalada o CrashLoop (`alert/repository.go`)**:
  - `UpsertFiringAlert`: Si una alerta ja existia com a `FIRING` a la base de dades però ha escalat o ha canviat a `CrashLoop`, ara es marca com a transició d'estat per enviar el correu d'avís de reinicis continuats.
- **Ressaltat visual de contenidors en CrashLoop (`ServerDetailView.tsx`)**:
  - La fila del contenidor es ressalta amb fons d'alerta i mostra l'etiqueta `⚠️ CrashLoop` al costat del nom i `⚠️ restarting [codi 139]` a la columna d'estat.

## [0.3.1] - 2026-11-12

### Fixed
- **Pipeline de Desplegament CD ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml))**:
  - Configurat `concurrency: deploy-production` amb `cancel-in-progress: false` (com a la resta de pipelines del repositori com `encertia` i `nasc`) perquè les publicacions simultànies de la branca `main` i del tag de versió s'encuïn de forma seqüencial en lloc de col·lidir i cancel·lar-se mútuament.
  - Afegit mecanisme de reintent amb espera a `docker compose up -d --remove-orphans || (sleep 4 && docker compose up -d --remove-orphans)` per evitar col·lisions de cursa si un contenidor s'està aturant en paral·lel.
  - Afegit registre automàtic dels desplegaments de `rawcraft-backend` i `rawcraft-frontend` a RawCraft Monitor mitjançant `POST /api/v1/deploys`.

### Added
- **Detecció de CrashLoop / Flapping & Finestra de Recuperació Sostinguda a l'Agent ([`evaluator.go`](backend/internal/agent/evaluator.go))**:
  - **Finestra de Recuperació Sostinguda (`sustained_recovery`)**: Perquè un contenidor o servei es doni per recuperat (`RESOLVED`), ja no n'hi ha prou amb estar viu en 1 sol cicle. Ha de mantenir-se en estat `running` i `healthy` durant almenys 4 comprovacions consecutives (~60 segons d'estabilitat real). Si torna a caure abans, el comptador es reinicia i l'alerta es manté oberta en silenci sense duplicar correus.
  - **Detecció Automàtica de CrashLoop / Flapping**: Si un contenidor canvia d'estat $\ge 3$ vegades en una finestra de 10 minuts (`FlappingWindow`), l'agent el marca oficialment com a `⚠️ [CrashLoop / Flapping]`.
  - **Anti-Spam de Notificacions**: Quan es detecta CrashLoop, l'agent envia una única notificació informativa de bucle de reinicis i congela qualsevol notificació redundant de caiguda o recuperació prematura.
  - **Recuperació Reforçada**: En estat de Flapping, s'exigeix el doble de comprovacions estables sostingudes (8 cicles = 2 minuts completament sa) abans de donar l'incident per resolt i tancar l'alerta.

## [0.3.0] - 2026-11-12

### Added
- **Explorador Centralitzat de Logs de Contenidors ("Mini-Loki")**:
  - Nova taula PostgreSQL `container_logs` (`000003_create_container_logs.up.sql`) amb índex compost per `(server_id, container_name, timestamp DESC)`, índex sobre `timestamp` i índex trigram GIN `pg_trgm` sobre `message` per a cerques de text instantànies.
  - Política de retenció dedicada de 30 dies per als logs de contenidors amb un worker diari de purga automàtica en segon pla (`containerlog.Service.Purge`).
  - Mòdul de backend `backend/internal/containerlog/`:
    - `POST /api/v1/agent/logs`: Ingesta eficient per lots des de `rawcraft-agent` mitjançant autenticació `X-Agent-Key` i `pgx.Batch`.
    - `GET /api/v1/servers/:id/logs/containers`: Llistat de tots els contenidors que tenen logs enregistrats en un servidor.
    - `GET /api/v1/servers/:id/containers/:name/logs`: Consulta paginada amb filtres per canal (`stdout`/`stderr`), intervals de temps (`since`/`until`), cerca de text (`search`) i ordre (`asc`/`desc`).
  - Recol·lector incremental de logs a `rawcraft-agent` ([`collector_logs.go`](backend/internal/agent/collector_logs.go)):
    - Connexió al socket Unix de Docker (`/var/run/docker.sock`) consultant `/containers/{id}/logs`.
    - Descodificació en streaming del format binari multiplexat de Docker (capçalera de 8 bytes, canal `stdout`/`stderr` i timestamp RFC3339Nano) amb suport també per a contenidors amb TTY.
    - Rastrejador en memòria de l'últim timestamp (`DockerLogTracker`) per consultar incrementalment i evitar duplicats o càrrega innecessària.
    - Limitació estricta de memòria i buffer (`GOMEMLIMIT=20MiB`) limitat a 300 línies per contenidor i cicle, sense sobrecàrrega de RAM a l'agent.
  - Component interactiu de visualització de logs ([`ContainerLogsModal.tsx`](frontend/src/modules/telemetry/components/ContainerLogsModal.tsx)):
    - Aspecte de terminal fosc estilitzat (`#0d1117`, font monospace, insígnia Mini-Loki).
    - Desplegables de selecció de contenidor i canal (`Tots`, `stdout`, `stderr`).
    - Selectors d'interval ràpid (`15m`, `1h`, `6h`, `24h`, `7d`, `30d`, `Sense límit`).
    - Cerca de text i patrons en temps real.
    - Auto-refresc cada 5 segons, autoscroll dinàmic i selecció d'ordre (cronològic o invers).
    - Botons d'exportació directa: "Descarregar (.log)" i "Copiar al porta-retalls".
  - Integració a la pestanya 🐳 Dockers de [`ServerDetailView.tsx`](frontend/src/modules/telemetry/views/ServerDetailView.tsx):
    - Botó prominent "📜 Explorador de Logs" a la capçalera de la pestanya Docker.
    - Columna i botó individual "📜 Logs" a cada fila de contenidor per obrir el visor directament enfocat en aquell contenidor.

## [0.2.2] - 2026-11-11

### Changed
- **Neteja a la Vista d'Històric ([`ServerHistoryView.tsx`](frontend/src/modules/telemetry/views/ServerHistoryView.tsx))**:
  - Eliminada la llista/taula redundant de desplegaments que apareixia a sota de les gràfiques, ja que aquesta llista completa ja està disponible de forma interactiva a la pestanya de Desplegaments del Detall del Servidor.
  - Es conserva intacta la gràfica `DeploymentsTimelineChartCard` com a 6è panell a la graella superior sincronitzada amb la finestra temporal.
- **Indicador Visual d'Estat del Servidor ([`ServerDetailView.tsx`](frontend/src/modules/telemetry/views/ServerDetailView.tsx))**:
  - Millorat el punt lluminós del widget de control perquè reflecteixi els estats:
    - Verd (`#16a34a`): `ONLINE`
    - Taronja (`#d97706`): `WARNING` (alertes disparades o reinici pendent)
    - Vermell (`#dc2626`): `CRITICAL` (serveis caiguts) o `OFFLINE` (silenci > $2.5 \times \text{report\_interval}$)
  - Afegit tooltip interactiu explicatiu en passar el cursor per sobre.

## [0.2.1] - 2026-11-11

### Added
- **Hora de la Darrera Petició als Endpoints & Timeline de Crides (OK / KO)**:
  - Camp `last_checked_at` a `HttpEndpointSnapshot` ([`collector_http.go`](backend/internal/agent/collector_http.go), [`telemetry/model.go`](backend/internal/telemetry/model.go), OpenAPI i TypeScript) per registrar la marca de temps exacta de cada petició HTTP.
  - Sèries `http_up` i `http_status` afegides a `TelemetryHistoryPoint` per permetre la traçabilitat històrica d'estat (UP/DOWN, codi HTTP i latència) de cada endpoint en el temps.
  - Component `EndpointTimelineBar` a [`ServerDetailView.tsx`](frontend/src/modules/telemetry/views/ServerDetailView.tsx) que renderitza una barra interactiva amb les darreres comprovacions en segments de colors (verd per a OK, vermell per a KO), percentatge d'uptime i tooltips informatius amb data, hora, latència i estat HTTP.
  - Nova columna a la taula d'endpoints amb l'hora exacta i temps relatiu de l'última petició.
- **Gràfic de Desplegaments en el Rang Horari Seleccionat**:
  - Nou component `DeploymentsTimelineChartCard` a [`ServerHistoryView.tsx`](frontend/src/modules/telemetry/views/ServerHistoryView.tsx) que renderitza un gràfic complet (amb el mateix format, dimensions i eixos temporals que els gràfics de CPU/RAM/Docker/Postgres) dedicat exclusivament als desplegaments de codi:
    - Eix X amb escala temporal sincronitzada amb el rang triat (`6h`, `24h`, `7 dies`, `30 dies`, `365 dies`).
    - Eix Y amb carrils horitzontals per producte/aplicació.
    - Marcador interactiu rodó (verd per a èxit, vermell per a fallit) amb icona 🚀, etiqueta de versió, línia de guia vertical i tooltip detallat (producte, entorn, versió, commit, autor, hora i missatge).
    - Desglossament independent dels gràfics de PostgreSQL i Endpoints HTTP a la vista d'històric per a una distribució neta en graella 2x3.
- **Timestamp Visible a Totes les Comprovacions & Registre de Control de Servidor**:
  - Indicador prominent de registre de control a la capçalera del servidor ([`ServerDetailView.tsx`](frontend/src/modules/telemetry/views/ServerDetailView.tsx)) amb punt d'estat verd/vermell, data, hora exacta i temps relatiu (`⏱️ Registre de control: HH:mm:ss (fa Xs)`).
  - Marques de temps visibles a totes les pestanyes i components de monitoratge:
    - Host / SO: hora i temps relatiu de la comprovació a la fitxa de resum.
    - Contenidors Docker: marca de temps de la darrera comprovació de dimoni/contenidors.
    - Endpoints HTTP: hora i temps relatiu de la darrera petició a la capçalera i a cada fila.
    - PostgreSQL: marca de temps de la darrera inspecció d'instàncies i bases de dades `pg_database`.
    - Llistat de servidors ([`ServersListView.tsx`](frontend/src/modules/servers/views/ServersListView.tsx)) i Dashboard ([`DashboardView.tsx`](frontend/src/modules/telemetry/views/DashboardView.tsx)): visualització de l'hora de l'últim registre de control per a cada servidor.

## [0.2.0] - 2026-11-11

### Added
- **Còpia Segura d'API Key amb Verificació de Contrasenya**:
  - Nou endpoint `POST /api/v1/servers/:id/reveal-key` protegit amb JWT i validació de la contrasenya de l'usuari actual via bcrypt (`VerifyUserPassword`).
  - Actualitzats els contractes OpenAPI ([`server.openapi.yaml`](contracts/server.openapi.yaml)) i el client API TypeScript.
  - Component [`CopyApiKeyDialog.tsx`](frontend/src/modules/servers/components/CopyApiKeyDialog.tsx) que sol·licita la contrasenya d'usuari i copia la clau directament al porta-retalls mitjançant `navigator.clipboard.writeText`, sense mostrar mai la clau en text clar a la pantalla.
  - Botó d'acció "🔒 Copiar API Key" integrat tant a la barra d'eines de [`ServerDetailView.tsx`](frontend/src/modules/telemetry/views/ServerDetailView.tsx) com a la taula de servidors [`ServersListView.tsx`](frontend/src/modules/servers/views/ServersListView.tsx).
- **Mida a Disc de les Imatges Docker (Espai Ocupat)**:
  - L'agent ([`collector_docker.go`](backend/internal/agent/collector_docker.go)) inspecciona les imatges locals a través de l'API de Docker Engine (`/images/json`) per calcular:
    - `image_size_mb`: Mida virtual a disc de la imatge de cada contenidor en MB.
    - `total_images_size_mb`: Suma acumulada de l'espai en disc ocupat per totes les imatges Docker locals del host.
  - Contracte OpenAPI ([`telemetry.openapi.yaml`](contracts/telemetry.openapi.yaml)), models Go i tipus TypeScript actualitzats amb `image_size_mb` i `total_images_size_mb`.
  - A la pestanya **🐳 Dockers** de [`ServerDetailView.tsx`](frontend/src/modules/telemetry/views/ServerDetailView.tsx):
    - Subtítol amb el total d'espai d'imatges a disc (`📦 Espai imatges a disc: X GB/MB`).
    - Nova columna a la taula amb la mida de la imatge de cada contenidor, amb suport per ordenar la taula per mida d'imatge (`image_size_mb`).

## [0.1.9] - 2026-11-11

### Added
- **Eixos X/Y, Llegenda i Correlació de Desplegaments a les Gràfiques Temporals**:
  - A [`ServerHistoryView.tsx`](frontend/src/modules/telemetry/views/ServerHistoryView.tsx), s'ha redissenyat completament el motor de renderitzat SVG (`MetricChartCard`):
    - **Eix Y**: Escala vertical amb valors i unitats adaptatives (`%`, `Load`, `MB`, `ms`) i quadrícula de línies de guia.
    - **Eix X**: Escala temporal amb marques de temps formatades (`HH:mm` per a 6h/24h, `DD/MM` per a rangs de dies).
    - **Llegenda**: Resum visual de cada mètrica amb el seu codi de color, valors actuals i línies de llindar d'alerta.
    - **Marcadors de Desplegament**: Dibuix de línies verticals morades amb icona 🚀 a les pròpies gràfiques temporals en el moment exacte en què s'ha produït un deploy.
    - **Timeline de Desplegaments**: Panell cronològic sota les gràfiques que detalla els canvis de codi que han tingut lloc dins de la finestra temporal seleccionada.

## [0.1.8] - 2026-11-11

### Added
- **Seguiment de Desplegaments (Change & Deploy Tracking)**:
  - Nova taula i migració `deployments` ([`000002_create_deployments.up.sql`](backend/migrations/000002_create_deployments.up.sql)) per registrar desplegaments associats a cada servidor.
  - Nous endpoints a l'API:
    - `POST /api/v1/deploys`: Endpoint ràpid per a CI/CD (GitHub Actions) autenticat amb `X-Agent-Key` (o `Authorization: Bearer <API-KEY>`) sense necessitat d'especificar l'UUID del servidor a la URL.
    - `POST /api/v1/servers/:id/deploys`: Registre de desplegament amb validació de clau o sessió JWT.
    - `GET /api/v1/servers/:id/deploys`: Llistat paginat de desplegaments d'un servidor.
  - Contracte OpenAPI ([`server.openapi.yaml`](contracts/server.openapi.yaml)) i tipus TypeScript actualitzats.
  - Nova pestanya **🚀 Desplegaments** a [`ServerDetailView.tsx`](frontend/src/modules/telemetry/views/ServerDetailView.tsx):
    - Mostra el producte/aplicació desplegada, versió/tag, commit SHA i missatge, entorn, autor, estat (`SUCCESS`/`FAILED`) i data/hora exacta (amb indicació de temps relatiu "fa X minuts/hores").
    - Paginació interactiva amb 20 o 50 registres per pàgina.
    - Modal d'integració amb el bloc de codi Bash/curl preparat per copiar i enganxar directament a `.github/workflows/deploy.yml`.
- **Disseny Totalment Responsive per a Mòbils**:
  - A [`AppLayout.tsx`](frontend/src/components/AppLayout.tsx): afegit calaix de navegació mòbil (`Drawer`) amb botó d'hamburguesa per a pantalles petites (`< md`), ocultant la barra lateral estàtica i aprofitant el 100% de l'amplada de la pantalla.
  - A [`ServerDetailView.tsx`](frontend/src/modules/telemetry/views/ServerDetailView.tsx):
    - Pestanyes desplaçables horitzontalment amb suport tàctil (`Tabs variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile`).
    - Capçaleres i banners adaptatius (`flex-direction: column` a mòbil, `row` a escriptori).
    - Vista dual a la llista de desplegaments: targetes netes i llegibles a mòbil (`xs/sm`) i taula completa a escriptori (`md+`).

## [0.1.7] - 2026-11-11

### Added
- **Inspecció multi-base de dades PostgreSQL (`pg_database`)**:
  - L'agent ([`collector_postgres.go`](backend/internal/agent/collector_postgres.go)) consulta `pg_database` (excloent plantilles `datistemplate = false`) per obtenir la llista de totes les bases de dades de cada instància PostgreSQL, la seva mida individual (`pg_database_size`) en MB i Bytes, el recompte total (`databases_count`) i la suma acumulada de mida (`database_size_mb`).
  - Actualitzat el contracte OpenAPI ([`telemetry.openapi.yaml`](contracts/telemetry.openapi.yaml)) amb l'esquema `PostgresDatabaseInfo`, `databases_count` i `databases`, sincronitzat amb el model Go ([`telemetry/model.go`](backend/internal/telemetry/model.go)) i els tipus TypeScript del frontend ([`telemetry/types.ts`](frontend/src/modules/telemetry/types.ts)).
- **Vista de Detall del Servidor en Pestanyes i Taules Paginades (20 / 50 files)**:
  - Reestructurada la vista [`ServerDetailView.tsx`](frontend/src/modules/telemetry/views/ServerDetailView.tsx) amb pestanyes accessibles (WAI-ARIA) per a:
    1. **🐳 Contenidors Docker**: mètriques de CPU/RAM, estat/healthcheck, ordenació per nom, CPU i memòria, i comptadors de llista blanca vs totals.
    2. **🌐 Endpoints HTTP**: estat de resposta (200/202), latència i codi d'estat.
    3. **🐘 Bases de Dades (PostgreSQL)**: mètriques d'instància (connexions actives vs màximes, locks, consultes lentes, mida total) i una nova taula amb totes les bases de dades individuals, mida en MB/GB, gràfica de % d'ocupació a la instància i ordenació per nom o mida.
  - Totes les taules incorporen paginació client (`TablePagination`) amb opcions de 20 o 50 registres per pàgina.

## [0.1.6] - 2026-11-11

### Fixed
- **Reconciliació automàtica d'alertes recuperades i acció manual "Marcar com a resolta"**:
  - A [`telemetry/service.go`](backend/internal/telemetry/service.go), quan arriba un snapshot de telemetria amb Postgres abastable, endpoints HTTP sans, contenidors en marxa o disc sota llindar, qualsevol alerta que hagués quedat en estat `FIRING` es tanca automàticament a `RESOLVED`.
  - Afegit endpoint `POST /api/v1/alerts/:id/resolve` ([`alert/handler.go`](backend/internal/alert/handler.go)) i botó **Marcar com a resolta** a la taula d'incidències ([`AlertsView.tsx`](frontend/src/modules/alerts/views/AlertsView.tsx)) perquè els operadors puguin tancar incidències manualment en qualsevol moment.

## [0.1.5] - 2026-11-11

### Added
- **Monitorització de Docker per llista blanca (`required_containers`) i targeta de resum global del host**:
  - L'agent ([`collector_docker.go`](backend/internal/agent/collector_docker.go)) recull exclusivament els contenidors definits a `required_containers` com a monitoritzats (estalviant recursos de CPU/RAM). Si un d'aquests contenidors no existeix a Docker, es marca com a `missing` (unhealthy).
  - Comptadors globals de contenidors del host a [`telemetry/model.go`](backend/internal/telemetry/model.go): `total_host_containers`, `running_host_containers`, `stopped_host_containers`.
  - Afegit un segon quadradet específic al panell de cada servidor a [`DashboardView.tsx`](frontend/src/modules/telemetry/views/DashboardView.tsx):
    1. **Dockers Monitoritzats**: `X/Y actius` (verd si tots funcionen, vermell només si cau un dels monitoritzats).
    2. **Total Contenidors Host**: mostra el total de contenidors reals al host (ex: `31 al host (18 actius, 13 aturats)`) com a informació neutra.
  - Afegida traça al log de l'agent quan envia amb èxit el report de telemetria al Punt Central ([`runner.go`](backend/internal/agent/runner.go)).

## [0.1.4] - 2026-11-11

### Fixed
- **Suport natiu per al port 465 (SMTPS amb SSL/TLS directe) i traces de log a SMTP**:
  - Implementat `tls.Dial` a [`smtp.go`](backend/internal/shared/smtp.go) per connectar a servidors SMTP que requereixen TLS directe des del primer byte (evitant l'error `EOF` de `net/smtp`).
  - Afegits logs detallats d'inici, remitent, destinataris, mode TLS i resultat d'enviament SMTP.
  - Enviament de correu asíncron al servei d'alertes ([`alert/service.go`](backend/internal/alert/service.go)) per evitar que un retard de xarxa al servidor SMTP bloquegi les peticions HTTP de l'agent.
- **Filtrat d'alertes de contenidors Docker caiguts segons `required_containers`**:
  - A [`evaluator.go`](backend/internal/agent/evaluator.go), si s'ha definit una llista de contenidors obligatoris (`required_containers`), l'alerta `AlertOnContainerDown` només es dispara si un d'aquests contenidors obligatoris no està `running` o està `unhealthy` (evitant que contenidors aturats aliens disparin falses alarmes).
- **Traces de log detallades per a la connexió de PostgreSQL**:
  - A [`collector_postgres.go`](backend/internal/agent/collector_postgres.go), s'imprimeix al log de l'agent l'error exacte de connexió (host, port, db, usuari) o el temps de resposta en mil·lisegons si és correcte.
- **Augment del timeout del client HTTP de l'agent**:
  - Pujat de 10s a 30s a [`runner.go`](backend/internal/agent/runner.go) per evitar `context deadline exceeded` en xarxes amb latència.

## [0.1.3] - 2026-11-11

### Changed
- Actualitzat el nom d'usuari per defecte de PostgreSQL a [`ServerConfigYamlView.tsx`](frontend/src/modules/servers/views/ServerConfigYamlView.tsx) de `pg_monitor` a `rawcraft_monitor` (ja que els noms començats per `pg_` són reservats per PostgreSQL com a rols del sistema).

## [0.1.2] - 2026-11-11

### Added
- **Secció i Modal "Instal·lació des del servidor" a Inventari i YAML (`frontend/`)**:
  - Afegit botó directe **Instal·lació des del servidor** a cada fila de [`ServersListView.tsx`](frontend/src/modules/servers/views/ServersListView.tsx) que obre un modal amb el bloc Bash `curl` complet (binari + `config.yaml` amb `X-Agent-Key` + `systemd`) i la comanda ràpida per actualitzar només el `config.yaml` i reiniciar el servei.
  - Afegit el bloc Bash d'instal·lació directe també al modal de creació/rotació d'`API Key` a [`ServersListView.tsx`](frontend/src/modules/servers/views/ServersListView.tsx).
  - Reestructurada la pestanya **2. Instal·lació des del servidor & `config.yaml`** a [`ServerConfigYamlView.tsx`](frontend/src/modules/servers/views/ServerConfigYamlView.tsx) amb targeta principal destacada per copiar tot el Bash d'instal·lació o la comanda d'actualització del YAML amb un clic.

## [0.1.1] - 2026-11-11

### Added
- **Descàrrega directa via `curl` de l'Agent, `config.yaml` i unitat `systemd`**:
  - `GET /api/v1/agent/binary`: Serveix directament el binari estàtic Linux `rawcraft-agent` des del Punt Central.
  - `GET /api/v1/agent/config.yaml`: Serveix directament el fitxer `config.yaml` del servidor autenticat amb `-H "X-Agent-Key: <api_key>"` (o `?key=<api_key>`).
  - `GET /api/v1/agent/systemd.service`: Serveix la unitat `/etc/systemd/system/rawcraft-agent.service` amb `GOMEMLIMIT=20MiB` i `MemoryMax=30M`.
  - Actualitzat el generador de comandes d'instal·lació i la vista `ServerConfigYamlView` amb botó de copiat de comandes `curl` i descàrrega de binari.

## [0.1.0] - 2026-11-11

### Added
- **Especificació funcional i contractes OpenAPI (`0.1.0`)**:
  - `product-functional-spec.md`, `specs/{user,server,telemetry,alert,infra}.md`, `mockups/` (8 pantalles HTML+CSS aprovades) i `contracts/{user,server,telemetry,alert}.openapi.yaml`.
- **Mòdul d'Autenticació i Usuaris (`user`)**:
  - Login JWT (`POST /api/v1/auth/login`), perfil (`/api/v1/auth/me`), canvi de contrasenya pròpia (`PUT /api/v1/auth/password`) i seed automàtic de l'usuari `ADMIN` inicial.
  - CRUD d'usuaris per a `ADMIN`, assignació de permisos d'accés per servidor (`user_servers`) i baixa lògica (*soft-delete*) amb confirmació explícita (`confirm=true`).
- **Mòdul de Servidors i Generador `config.yaml` (`server`)**:
  - Alta i baixa de servidors amb UUID únic i `api_key` (`rcm_live_...` amb hash SHA-256) i rotació de clau (`POST /api/v1/servers/{id}/rotate-key`).
  - Configurador de les 4 potetes (Maquinari/SO + `reboot_required`, Docker + CPU/RAM per contenidor, Endpoints HTTP `200`/`202`, PostgreSQL dins de Docker) i destinataris SMTP.
  - Generador i descarregador de `config.yaml`, unitat `systemd` (`rawcraft-agent.service` amb `GOMEMLIMIT=20MiB`, `MemoryMax=30M`, `CPUQuota=5%`) i comandes d'instal·lació.
- **Mòdul de Telemetria, Agent Recol·lector i Històric (`telemetry`)**:
  - Binari natiu `rawcraft-agent` (`backend/cmd/agent`, `CGO_ENABLED=0`, fora de Docker) amb doble bucle (ràpid de vigilància i lent d'històric) i recol·lectors per a Host/SO (`/etc/os-release`, kernel, `/var/run/reboot-required`, Load, Disc `/`, RAM, Swap, Processos, Usuaris, IPv4), Docker (`/var/run/docker.sock` amb worker pool de 3 goroutines per a CPU/RAM), Endpoints HTTP (`200`/`202`) i PostgreSQL (`SELECT 1`, `% connexions`, mida BD, consultes lentes i locks).
  - Dashboard general amb bloc estil consola MOTD Linux, `os_name`, badge `Reboot required`, detall de servidor en viu i gràfiques d'evolució temporal (`6h`, `24h`, `7d`, `30d`, `365d`).
  - Política de retenció d'històric configurable (per defecte **365 dies**) amb worker diari de purga.
- **Mòdul d'Alertes i Notificacions (`alert`)**:
  - Motor d'alertes amb finestra de sosteniment (`sustained_checks`), histèresi del 5% i cicle `FIRING` → `RESOLVED` sense tempestes de correus.
  - Vigilància creuada: worker de *Heartbeat* al Punt Central (`SERVER_OFFLINE`) i detecció de `CENTRAL_UNREACHABLE` a l'agent.
  - Panell d'alertes filtrat pels servidors autoritzats amb acció `Acknowledge` i previsualització de correus SMTP.
- **Infraestructura i CI/CD (`infra`)**:
  - `backend/Dockerfile`, `frontend/Dockerfile` (`nginx.conf`), `docker-compose.yml` amb Traefik i xarxes `web` / `postgres-network`, plantilles `.env*.example` i pipelines GitHub Actions (`ci.yml` i `deploy.yml`).
