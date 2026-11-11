# Especificació del Mòdul: Alertes i Notificacions (`alert`)

## Resum de l'Èpica
Detectar en pocs segons (bucle ràpid de l'agent) qualsevol superació de llindar o caiguda de Docker, Endpoint HTTP o PostgreSQL; enviar notificacions per correu electrònic (SMTP) sense provocar tempestes de correus; aplicar vigilància creuada entre els agents i el Punt Central; i oferir al panell web l'estat i l'històric d'alertes per servidor.

---

## Històries d'Usuari

### HU-ALT-01: Vigilància en bucle ràpid i enviament d'email SMTP des de l'Agent
**Com a** administrador d'un servidor monitoritzat,  
**vull** que l'agent comprovi cada pocs segons (`check_interval_seconds`, ex. 15s) els llindars i l'estat dels Dockers, Endpoints HTTP i Postgres, i m'enviï un correu electrònic quan es produeixi una incidència i quan es recuperi,  
**per** assabentar-me immediatament d'una caiguda sense esperar al cicle de registre històric i sense dependre que el Punt Central estigui operatiu.

#### Criteris d'acceptació:
1. A cada `check_interval_seconds`, l'agent avalua totes les regles actives al seu `config.yaml`:
   - **Host**: Superació sostinguda (`sustained_checks` consecutius) dels llindars de Load, Disc, RAM, Swap, Processos o Usuaris connectats.
   - **Docker**: Dimoni Docker inactiu, contenidor monitoritzat (no inclòs a `ignore_containers` o inclòs a `required_containers`) que passa a estat diferent de `running` o a `unhealthy`, o superació sostinguda del llindar de CPU/RAM del contenidor.
   - **HTTP Endpoints**: Endpoint que retorna un codi HTTP fora dels esperats (`200`/`202` per defecte) o supera el timeout en $N$ comprovacions consecutives (per defecte `2`).
   - **PostgreSQL**: Instància que no respon a `SELECT 1`, supera el `%` màxim de connexions ocupades o supera el límit de consultes encallades.
2. **Control d'estat (`FIRING` / `RESOLVED`) sense tempesta de correus**:
   - Quan una alerta entra en estat `FIRING`, l'agent envia **1 únic correu electrònic** d'incidència oberta als destinataris del `config.yaml` i fa un `POST /api/v1/agent/alerts` immediat al Punt Central.
   - Mentre la condició es mantingui activa, no torna a enviar correu.
   - Quan la condició es resol (aplicant una histèresi del 5% en llindars percentuals per evitar oscil·lacions ràpides), l'alerta passa a `RESOLVED`, l'agent envia **1 correu electrònic de recuperació** i notifica el tancament al Punt Central.

---

### HU-ALT-02: Vigilància creuada (Heartbeat del Punt Central i caiguda del Punt Central)
**Com a** administrador,  
**vull** rebre una alerta per correu tant si un servidor deixa de reportar al Punt Central com si el propi Punt Central deixa de respondre a l'agent d'un altre servidor,  
**per** cobrir el cas d'apagada completa del servidor on viu el Punt Central o de qualsevol altre servidor.

#### Criteris d'acceptació:
1. **Heartbeat al Punt Central**: Un procés periòdic al backend comprova cada minut si algun servidor actiu supera $2.5 \times \text{report\_interval\_seconds}$ sense enviar telemetria. Si ho supera:
   - Crea una alerta `SERVER_OFFLINE` en estat `FIRING` i envia correu SMTP als destinataris configurats per a aquell servidor.
   - Quan el servidor torna a reportar, resol automàticament l'alerta (`RESOLVED`) i envia correu de recuperació.
2. **Vigilància des de l'Agent cap al Punt Central**: Si un agent acumula $K$ errors consecutius (per defecte `3`) en intentar enviar telemetria al `central_url`, dispara una alerta SMTP local (`CENTRAL_UNREACHABLE`) avisant que el Punt Central no respon des d'aquell servidor, i n'envia la recuperació quan la connexió es restableix.

---

### HU-ALT-03: Panell i històric d'alertes a la Web (filtrat per permisos d'usuari)
**Com a** usuari autenticat (`ADMIN` o `USER`),  
**vull** consultar a la Web les alertes actives (`FIRING`) i l'històric d'alertes resoltes (`RESOLVED`) dels servidors als quals tinc accés,  
**per** fer seguiment de les incidències actuals i passades.

#### Criteris d'acceptació:
1. A la barra superior i al Dashboard es mostra un indicador amb el nombre d'alertes actives (`FIRING`) dels servidors autoritzats per a l'usuari.
2. La vista d'Alertes permet filtrar per: servidor (dins dels autoritzats), estat (`FIRING`, `RESOLVED`, `Totes`), categoria (`HOST`, `DOCKER`, `HTTP_ENDPOINT`, `POSTGRES`, `HEARTBEAT`), severitat (`WARNING`, `CRITICAL`) i rang de dates.
3. Cada alerta mostra: servidor, categoria, recurs afectat (ex. contenidor `nginx-proxy` o endpoint `https://.../health`), missatge/valor que ha disparat l'alerta vs. llindar, data d'obertura (`fired_at`), data de resolució (`resolved_at`) i durada.
4. Un usuari pot marcar manualment com a reconeguda/silenciada (`acknowledged`) una alerta activa.
