# Especificació del Mòdul: Telemetria, Agent i Històric (`telemetry`)

## Resum de l'Èpica
Recollir a cada servidor (mitjançant el binari lleuger `rawcraft-agent` fora de Docker) les mètriques de sistema/SO, contenidors Docker, endpoints HTTP i PostgreSQL; enviar-les periòdicament al Punt Central; presentar-les al Dashboard d'estat actual i a les vistes de detall amb gràfiques d'evolució històrica; i purgar automàticament les dades segons la política de retenció (per defecte 365 dies).

---

## Històries d'Usuari

### HU-TEL-01: Recollida i enviament periòdic de telemetria per l'Agent (`rawcraft-agent`)
**Com a** administrador d'infraestructura,  
**vull** que el binari `rawcraft-agent` instal·lat fora de Docker llegeixi les mètriques activades al `config.yaml` i les enviï al Punt Central a cada `report_interval_seconds` amb un consum mínim de RAM,  
**per** tenir les dades registrades i historificades sense penalitzar els recursos del servidor.

#### Criteris d'acceptació:
1. L'agent s'executa com a procés natiu Linux (fora de Docker) compilat sense CGO (`CGO_ENABLED=0`) i aplica `GOMEMLIMIT=20MiB`. Inclou una plantilla de servei `systemd` amb `MemoryMax=30M` i `CPUQuota=5%`.
2. Segons els flags del `config.yaml`, a cada cicle de telemetria l'agent recull:
   - **Host/SO**: `os_name` (d'`/etc/os-release`), `kernel_version`, `arch`, `hostname`, `uptime_seconds`, `reboot_required` (existència de `/var/run/reboot-required`), `load_1m`/`5m`/`15m`, ús de disc per punt de muntatge (`total_gb`, `used_gb`, `used_percent`), memòria RAM (`total_mb`, `used_mb`, `used_percent`), Swap (`total_mb`, `used_mb`, `used_percent`), `processes_count`, `users_logged_in`, interfície i IPv4 (`interface_name`, `ipv4_address`).
   - **Docker**: Estat del dimoni (`docker_daemon_up`) i, per a cada contenidor, `container_id`, `name`, `image`, `state`, `status`, `health`, `exit_code`, `cpu_percent`, `memory_used_mb`, `memory_limit_mb` i `memory_percent` (llegits de `/var/run/docker.sock` amb un worker pool màxim de 3 lectures simultànies).
   - **Endpoints HTTP**: Per a cada endpoint configurat, `name`, `url`, `up` (`true` si retorna un dels codis esperats, ex. `200` o `202`), `status_code`, `response_time_ms` i `error_message`.
   - **PostgreSQL**: Per a cada instància configurada, `name`, `up` (`SELECT 1`), `latency_ms`, `active_connections`, `max_connections`, `connections_percent`, `database_size_mb`, `long_running_queries` i `locks_waiting`.
3. L'agent envia l'snapshot a `POST /api/v1/agent/telemetry` autenticat amb el seu `X-Agent-Key`.
4. El Punt Central valida la clau del servidor, desa l'snapshot a l'històric i actualitza el `last_seen_at` i l'últim estat del servidor.

---

### HU-TEL-02: Dashboard general de servidors (Vista resum d'estat actual)
**Com a** usuari autenticat (`ADMIN` o `USER`),  
**vull** veure en una única pantalla l'estat actual de tots els servidors als quals tinc accés, incloent-hi el bloc de resum estil consola Linux (`System information as of...`) i el resum de salut dels seus Dockers, HTTP checks i Postgres,  
**per** detectar d'un cop d'ull si tot funciona o si hi ha algun servidor o servei amb problemes.

#### Criteris d'acceptació:
1. L'usuari només veu les targetes dels servidors als quals té permís (`ADMIN` els veu tots).
2. Cada targeta de servidor mostra:
   - Nom del servidor, estat global (`ONLINE`, `WARNING`, `CRITICAL`, `OFFLINE` si fa més de $2 \times \text{report\_interval}$ que no reporta), data/hora de l'última lectura (`System information as of...`).
   - Versió del SO (`os_name`, `kernel_version`) i un badge visible d'avís **`Reboot required`** si `reboot_required == true`.
   - Bloc de mètriques estil MOTD Linux:
     - `System load` (`1m`)
     - `Usage of /` (`% of XX.XX GB`)
     - `Memory usage` (`%`)
     - `Swap usage` (`%`)
     - `Processes` (comptador)
     - `Users logged in` (comptador)
     - `IPv4 address for <iface>` (IP)
   - Resum ràpid amb semàfor de les altres 3 potetes (si estan actives):
     - **Dockers**: ex. `8 running / 0 stopped` (o avís en vermell si n'hi ha algun caigut/unhealthy).
     - **HTTP Endpoints**: ex. `4/4 OK` (200/202).
     - **PostgreSQL**: ex. `UP (14% conn, 1.2 GB)`.

---

### HU-TEL-03: Vista de detall d'un servidor (Dockers, Endpoints HTTP i PostgreSQL en viu)
**Com a** usuari amb accés a un servidor,  
**vull** entrar al detall del servidor per inspeccionar la taula completa dels seus contenidors Docker (amb CPU i RAM de cadascun), l'estat i latència de cada endpoint HTTP i el detall de salut de PostgreSQL,  
**per** diagnosticar quin contenidor o servei concret està consumint recursos o fallant.

#### Criteris d'acceptació:
1. Mostra la fitxa completa de maquinari i SO (incloent `os_name`, `kernel_version`, `arch`, `uptime` i l'indicador `reboot_required`).
2. **Taula de Contenidors Docker**: Mostra nom, imatge, estat (`running`, `exited`, `restarting`, `unhealthy`) amb codi de color, temps actiu (`status`), `% CPU` i `RAM (MB / Límit MB i %)` ordenable per consum de RAM o CPU.
3. **Taula d'Endpoints HTTP**: Mostra nom, URL, codis esperats (`200`/`202`), últim codi rebut, temps de resposta (`ms`) i estat (`UP`/`DOWN`).
4. **Secció PostgreSQL**: Mostra per a cada instància l'estat (`UP`/`DOWN`), latència (`ms`), barra d'ocupació de connexions (`active / max` i `%`), mida de la BD (`MB`/`GB`), consultes lentes actives i locks en espera.

---

### HU-TEL-04: Consulta d'històric i gràfiques d'evolució temporal
**Com a** usuari amb accés a un servidor,  
**vull** consultar les gràfiques d'evolució històrica del servidor filtrant per rang de temps (`Últimes 6h`, `24h`, `7 dies`, `30 dies`, `365 dies` o rang de dates personalitzat),  
**per** analitzar tendències de consum (creixement de disc o BD, pics de memòria/load, latència d'endpoints i recursos per contenidor).

#### Criteris d'acceptació:
1. Gràfiques temporals per a les mètriques de Host: System Load (`1m`, `5m`, `15m`), % d'ús de Memòria i Swap, % d'ús de Disc i nombre de processos.
2. Gràfiques temporals per a Contenidors Docker: evolució de `% CPU` i `MB RAM` per contenidor.
3. Gràfiques temporals per a Endpoints HTTP (latència en `ms` i disponibilitat) i PostgreSQL (`% connexions` i mida de la BD en `MB`).
4. Per a rangs llargs (ex. 30d o 365d), l'endpoint d'històric retorna punts agregats (mitjana/màxim per interval) perquè la gràfica carregui ràpidament sense enviar desenes de milers de punts crus al navegador.

---

### HU-TEL-05: Configuració i execució de la política de retenció d'històric (365 dies per defecte)
**Com a** usuari amb rol `ADMIN`,  
**vull** poder consultar i modificar el nombre de dies de retenció de l'històric (inicialment **365 dies**),  
**per** controlar l'espai que ocupa la base de dades del Punt Central.

#### Criteris d'acceptació:
1. La configuració global del sistema s'inicia amb `retention_days = 365`.
2. L'`ADMIN` pot modificar `retention_days` des de la pantalla de Configuració Global (mínim 7 dies).
3. El backend executa un procés diari automàtic que elimina els snapshots de telemetria i les alertes en estat `RESOLVED` amb antiguitat superior a `retention_days`.
