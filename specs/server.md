# Especificació del Mòdul: Servidors i Configuració YAML (`server`)

## Resum de l'Èpica
Gestionar l'inventari de servidors monitoritzats, permetre configurar per a cada servidor quines mètriques de les 4 potetes (Maquinari/SO, Docker, Endpoints HTTP, PostgreSQL) estan actives juntament amb els seus llindars i destinataris d'alerta, gestionar les seves `api_key` i generar el fitxer `config.yaml` llest per a l'agent.

---

## Històries d'Usuari

### HU-SRV-01: Alta i baixa de servidors (només `ADMIN`)
**Com a** usuari amb rol `ADMIN`,  
**vull** registrar un nou servidor al Punt Central i poder donar-lo de baixa amb confirmació explícita,  
**per** començar a monitoritzar noves màquines a mesura que l'infraestructura creix.

#### Criteris d'acceptació:
1. En crear un servidor s'indica com a mínim: `name` (ex. `"prod-node-01"`), `description` opcional i intervals per defecte (`check_interval_seconds`, per defecte `15`, i `report_interval_seconds`, per defecte `300`).
2. El sistema genera automàticament un identificador únic `id` (UUID) i una `api_key` secreta per a l'autenticació de l'agent.
3. Baixa de servidor (entitat sensible): requereix confirmació explícita a la UI i el flag `confirm=true` al backend, aplicant *soft-delete* (`deleted_at`) per no perdre accidentalment l'històric associat.
4. L'`ADMIN` pot regenerar/rotar l'`api_key` d'un servidor en cas de compromís, invalidant l'anterior immediatament.

---

### HU-SRV-02: Configuració de les 4 potetes i llindars per servidor (només `ADMIN`)
**Com a** usuari amb rol `ADMIN`,  
**vull** configurar des d'un formulari visual quines mètriques, contenidors, endpoints HTTP i instàncies PostgreSQL ha de vigilar l'agent d'un servidor i amb quins llindars,  
**per** adaptar la monitorització al que hi ha desplegat a cada màquina.

#### Criteris d'acceptació:
1. **Poteta 1 — Maquinari i Sistema Operatiu**:
   - Permet activar/desactivar individualment la recollida de: `os_info` (versió SO, kernel, `reboot_required`), `system_load`, `disk_usage`, `memory_usage`, `swap_usage`, `processes`, `users_logged_in`, `network_ip` (amb opció d'indicar interfície preferida, ex. `ens3`, o autodetecció).
   - Permet definir els llindars d'alerta: `max_load_1m`, `max_disk_percent` (i llista de punts de muntatge, per defecte `["/"]`), `max_memory_percent`, `max_swap_percent`, `max_processes`, `max_users_logged_in` i nombre de comprovacions consecutives (`sustained_checks`, per defecte `4`).
2. **Poteta 2 — Docker**:
   - Activar/desactivar la monitorització de Docker (`/var/run/docker.sock`) i la recollida de CPU i RAM per contenidor.
   - Configurar alerta si un contenidor cau (`alert_on_container_down: true`), llista opcional de contenidors ignorats (`ignore_containers: ["temp-job"]`), llista opcional de contenidors obligatoris (`required_containers`) i llindars màxims opcionals de `% CPU` i `% RAM` per contenidor (`max_container_cpu_percent`, `max_container_memory_percent`).
3. **Poteta 3 — Endpoints HTTP (dins dels Dockers)**:
   - Afegir/editar/eliminar una llista d'endpoints a verificar: `name`, `url` (ex. `http://127.0.0.1:8080/health`), `method` (`GET`/`HEAD`), `expected_status_codes` (per defecte `[200, 202]`), `timeout_seconds` (per defecte `5`).
4. **Poteta 4 — PostgreSQL (dins de Docker)**:
   - Afegir/editar/eliminar una o més instàncies de PostgreSQL a verificar: `name`, `host`, `port`, `user`, `password`, `dbname`, `sslmode`.
   - Definir llindars d'alerta per a Postgres: `max_connections_percent` (per defecte `80%`), `long_query_threshold_seconds` (per defecte `60s`), `max_long_running_queries` (per defecte `1`).
5. **Notificacions i SMTP del servidor**:
   - Definir la llista d'emails destinataris d'alertes d'aquest servidor (amb botó ràpid per incloure els emails dels usuaris que tenen accés al servidor) i els paràmetres SMTP (podent heretar la configuració SMTP global definida al Punt Central o especificar-ne una de pròpia).

---

### HU-SRV-03: Generació i descàrrega del fitxer `config.yaml` (només `ADMIN`)
**Com a** usuari amb rol `ADMIN`,  
**vull** previsualitzar i descarregar el fitxer `config.yaml` complet d'un servidor des de la interfície web,  
**per** copiar-lo directament al servidor on corre l'agent (`rawcraft-agent`) sense haver d'escriure el YAML a mà ni cometre errors d'identificador.

#### Criteris d'acceptació:
1. El fitxer `config.yaml` generat pel backend inclou:
   - `server_id` (UUID únic del servidor), `server_name`, `central_url` i `api_key`.
   - Límits d'execució i intervals (`check_interval_seconds`, `report_interval_seconds`, `central_unreachable_alert_after_failures`).
   - La configuració completa de les 4 potetes i els seus llindars tal com s'ha desat a la `HU-SRV-02`.
   - La configuració SMTP i la llista d'emails destinataris.
2. Des de la Web es pot tant copiar el contingut al porta-retalls com descarregar el fitxer `<server-slug>-config.yaml`.
