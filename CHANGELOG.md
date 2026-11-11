# Changelog

Tots els canvis rellevants d'aquest projecte es documenten en aquest fitxer.

El format es basa en [Keep a Changelog](https://keepachangelog.com/ca/1.0.0/),
i aquest projecte segueix [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
