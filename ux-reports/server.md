# UX — Mòdul server

**Veredicte**: APTE
**Data**: 2026-11-11

## Flux revisats
- **Inventari de servidors monitoritzats (`HU-SRV-01`) — web (`ServersListView.tsx`)**: Visualització del llistat de servidors amb UUID, estat (`ONLINE`/`CRITICAL`/`OFFLINE`), sistema operatiu, interfície/IP, intervals de bucle ràpid i lent, i resum de potetes actives (`Host/SO`, `Docker`, `HTTP`, `Postgres`).
- **Alta de servidor, generació/rotació d'`api_key` i baixa (`HU-SRV-01`) — web (`ServersListView.tsx`)**: Modal d'alta ràpida, modal de presentació i còpia d'`api_key` amb pas directe al configurador YAML, rotació d'`api_key` i modal de confirmació de baixa sensible (`confirm=true`).
- **Configurador de les 4 potetes i destinataris SMTP (`HU-SRV-02`) — web (`ServerConfigYamlView.tsx`)**: Edició visual dels intervals, Poteta 1 (Host/SO), Poteta 2 (Docker + CPU/RAM + contenidors obligatoris/ignorats), Poteta 3 (taula interactiva d'endpoints HTTP esperant `200`/`202`), Poteta 4 (PostgreSQL dins de Docker) i Secció 5 (SMTP amb botó d'autocompletat d'emails dels usuaris autoritzats del servidor).
- **Previsualització i descàrrega de `config.yaml` i servei `systemd` (`HU-SRV-03`, `HU-INF-04`) — web (`ServerConfigYamlView.tsx`)**: Vista en dues columnes amb el bloc `/etc/rawcraft-agent/config.yaml`, la unitat `/etc/systemd/system/rawcraft-agent.service` (`GOMEMLIMIT=20MiB`, `MemoryMax=30M`, `CPUQuota=5%`) i les comandes d'instal·lació al host Linux, amb botons de còpia al porta-retalls i descàrrega directa d'arxiu `.yaml`.

## Usabilitat
- [OK] El flux d'alta d'un nou servidor guia l'administrador de manera natural: en crear el servidor s'obre immediatament el modal amb la nova `api_key` generada, opció de copiar-la i un botó primari (`Entès, configurar i descarregar config.yaml`) que porta directament a `/servers/:id/config`.
- [OK] El configurador de les 4 potetes (`ServerConfigYamlView.tsx`) agrupa amb molta claredat una gran quantitat de paràmetres tècnics en targetes independents amb el seu propi commutador `Activa`.
- [OK] El botó **"Omplir amb els emails dels usuaris autoritzats d'aquest servidor"** a la secció 5 (`handleFillAuthorizedEmails`) resol un cas d'ús molt pràctic: filtra automàticament els usuaris actius que són `ADMIN` o tenen el `server_id` actual a `server_ids` i els fusiona sense duplicats al camp `to_emails`.
- [OK] El botó superior **"Desar i Descarregar `config.yaml`"** desa la configuració al backend, canvia a la pestanya de previsualització YAML i dispara la descàrrega del fitxer `<server>-config.yaml` en un sol clic.

## Fidelitat al mockup aprovat
- [OK] **`mockups/server/servers-list.html` vs. `ServersListView.tsx`**: Estructura de taula de 5 columnes idèntica al mockup (`Servidor & UUID`, `Sistema Operatiu / IP`, `Intervals (Watchdog / Històric)`, `Potetes Actives`, `Accions`), píndoles grises per a les 4 potetes amb comptadors (`Docker (N)`, `HTTP (N)`, `Postgres (N)`) i els tres modals previstos (Alta, Nova API Key en caixa fosca `#0f172a` amb text `#38bdf8`, i Confirmació de baixa amb `confirm=true`).
- [OK] **`mockups/server/server-config-yaml.html` vs. `ServerConfigYamlView.tsx`**: Disposició en graella 2x2 per a les 4 potetes més targeta inferior d'SMTP i destinataris. La segona pestanya reprodueix exactament l'estructura de dos blocs terminals foscos (`#0f172a`): a l'esquerra el `/etc/rawcraft-agent/config.yaml` i a la dreta la unitat `/etc/systemd/system/rawcraft-agent.service` seguida de les comandes `sudo install` / `chmod 0600` / `systemctl enable --now rawcraft-agent`.

## Consistència visual
- [OK] Ús homogeni de `Paper`, `Dialog`, `Button`, `Chip`, `Checkbox`, `FormControlLabel`, `Alert` i tipografia `Roboto Mono` per a identificadors UUID, adreces IP, rutes de fitxers, codis HTTP i blocs YAML/systemd.
- [OK] Coherència amb el model de permisos: un usuari amb rol `USER` pot consultar l'inventari i previsualitzar la configuració dels seus servidors, mentre que les accions destructives o d'escriptura (`+ Registrar Nou Servidor`, `Rotar API Key`, `Baixa`, `Desar i Descarregar config.yaml`) es mostren condicionades a `isAdmin`.

## Responsive/mòbil
- [OK] Les graelles de `ServerConfigYamlView.tsx` utilitzen `gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }` (i `repeat(4, 1fr)` a `md` per als intervals superiors), col·lapsant a una sola columna en pantalles petites sense solapar camps.
- [OK] La taula d'inventari de servidors disposa de contenidor amb `overflowX: 'auto'` per fer scroll horitzontal sense trencar el layout.
- [Millorable] A la Poteta 3 (`Endpoints HTTP`), la fila d'afegir un nou endpoint té una graella fixa de 5 columnes (`gridTemplateColumns: '1fr 1.4fr 0.8fr 0.6fr auto'`). En pantalles d'escriptori es veu molt compacta i alineada, però en finestres molt estretes (< 600px) els inputs d'aquesta fila poden quedar comprimits.

## Feedback a l'usuari
- [OK] **Accions de porta-retalls**: Tant el botó `Copiar API Key` (`copiedKey ? 'Copiada!' : 'Copiar API Key'`) com el botó `Copiar config.yaml` (`copiedYaml ? 'Copiat!' : 'Copiar config.yaml'`) proporcionen feedback immediat en el text del botó.
- [OK] **Desat i errors**: Es mostra un `Alert severity="success"` (`Configuració de les 4 potetes desada correctament.`) en desar canvis i `Alert severity="error"` tancable si falla qualsevol crida a l'API.
- [OK] **Baixa sensible**: El modal de baixa explica explícitament que s'aplicarà *soft-delete* (`confirm=true`), es desactivarà el *Heartbeat* i es conservarà l'històric fins que venci la política de retenció.

## Accessibilitat bàsica
- [OK] Els camps del modal d'alta de servidor tenen etiquetes `<label htmlFor={...}>` associades amb `useId()`, i els botons d'eliminar endpoints HTTP tenen `aria-label` explícit (`aria-label="Elimina endpoint <nom>"`).
- [OK] La taula d'inventari està envoltada per una regió enfocable (`tabIndex={0}`, `role="region"`, `aria-label="Taula d'inventari de servidors monitoritzats"`).
- [Millorable] A `ServerConfigYamlView.tsx`, diversos `<label>` dels inputs numèrics de llindars són visuals (estan just a sobre de l'`<input>` dins del mateix `<Box>`) però no tenen l'atribut `htmlFor`/`id` enllaçat, a diferència dels formularis de `LoginView`, `UsersView` i `ServersListView`.

## Incidències
1. **[Detall]** A `ServerConfigYamlView.tsx` (Potetes 1–5), les etiquetes `<label>` dels camps de llindars i paràmetres SMTP estan col·locades visualment sobre cada `<input>` però sense atribut `htmlFor` vinculat a un `id`. Vincular-les amb `htmlFor` milloraria l'experiència amb lectors de pantalla i permetria fer clic sobre el text de l'etiqueta per enfocar l'input.
2. **[Detall]** A `ServersListView.tsx`, el botó `Rotar API Key` executa la rotació immediatament en fer clic i mostra la nova clau al modal. Tot i que el modal avisa clarament que l'anterior `api_key` ha quedat invalidada, afegir una confirmació prèvia evitaria rotacions accidentals per un clic involuntari.
