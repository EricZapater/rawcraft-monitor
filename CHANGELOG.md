# Changelog

Tots els canvis rellevants d'aquest projecte es documenten en aquest fitxer.

El format es basa en [Keep a Changelog](https://keepachangelog.com/ca/1.0.0/),
i aquest projecte segueix [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
