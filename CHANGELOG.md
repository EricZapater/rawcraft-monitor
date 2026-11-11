# Changelog

Tots els canvis rellevants d'aquest projecte es documenten en aquest fitxer.

El format es basa en [Keep a Changelog](https://keepachangelog.com/ca/1.0.0/),
i aquest projecte segueix [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
