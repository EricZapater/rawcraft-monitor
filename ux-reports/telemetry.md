# UX — Mòdul telemetry

**Veredicte**: APTE
**Data**: 2026-11-11

## Flux revisats
- **Dashboard General de Servidors (`HU-TEL-02`) — web (`DashboardView.tsx`)**: Lectura ràpida de la franja superior de 4 KPIs globals (`Servidors Monitoritzats`, `Contenidors Docker`, `Endpoints HTTP`, `Instàncies PostgreSQL`), targetes de servidor amb versió de SO (`os_name`), kernel, uptime, badge `⚠ Reboot required`, consola terminal MOTD Linux amb les 8 mètriques clau (incloent `Agent RAM: X MB / 30 MB`), semàfor de les altres 3 potetes i estat buit quan l'usuari no té servidors assignats.
- **Detall de Servidor en Viu (`HU-TEL-03`) — web (`ServerDetailView.tsx`)**: Consulta en temps real (amb auto-refresc cada 15s) del banner de SO + `Reboot required`, taula ordenable de contenidors Docker amb barres visuals de `% RAM` i `% CPU`, taula d'endpoints HTTP (`200`/`202`) i targeta de salut de PostgreSQL (`SELECT 1`, barra de `% connexions`, mida BD, consultes lentes i `locks_waiting`).
- **Històric de 365 dies i Política de Retenció (`HU-TEL-04`, `HU-TEL-05`) — web (`ServerHistoryView.tsx`)**: Commutació entre els 5 rangs temporals (`6h`, `24h`, `7 dies`, `30 dies`, `365 dies`), visualització de les 4 gràfiques SVG d'evolució temporal i obertura del modal de configuració de `retention_days` (365 dies per defecte).

## Usabilitat
- [OK] El Dashboard (`DashboardView.tsx`) permet diagnosticar d'un sol cop d'ull l'estat de tota la infraestructura i la salut de cada servidor gràcies a la combinació del bloc MOTD d'estil terminal Linux i les 3 caixes semàfor inferiors (`Dockers`, `Endpoints HTTP`, `PostgreSQL`).
- [OK] En el detall en viu (`ServerDetailView.tsx`), les capçaleres de la taula de contenidors Docker (`Contenidor`, `CPU (%)`, `Memòria RAM`) són clicables per ordenar ascendentment o descendentment (`↑`/`↓`), ordenant per defecte per `% de RAM` descendent per detectar ràpidament quin contenidor consumeix més recursos.
- [OK] Navegació creuada molt fluida entre les tres vistes del mòdul: des del Dashboard es pot anar tant a `Històric & Gràfiques` com a `Veure Detall Complet →`, i des del detall es pot saltar a l'històric o tornar al Dashboard amb un sol clic.
- [OK] Auto-refresc silenciós (`30s` al Dashboard, `15s` al Detall en viu) que manté les dades actualitzades sense mostrar spinners intrusius un cop ja s'ha carregat el primer snapshot.

## Fidelitat al mockup aprovat
- [OK] **`mockups/telemetry/dashboard.html` vs. `DashboardView.tsx`**: Fidelitat exacta al mockup aprovat: franja de 4 KPIs, graella de 2 columnes de servidors, capçalera amb `os_name` (`Ubuntu 24.04.1 LTS • Kernel ...`), badge groc `⚠ Reboot required` (`#fef3c7` / `#92400e`), consola terminal MOTD (`#0f172a`) amb capçalera `System information as of ...` i les 8 mètriques en 2 columnes (`System load`, `Processes`, `Usage of /`, `Users logged in`, `Memory usage`, `IPv4 for <iface>`, `Swap usage`, `Agent RAM`), les 3 caixes de potetes i l'estat buit (`No tens cap servidor assignat`).
- [OK] **`mockups/telemetry/server-detail.html` vs. `ServerDetailView.tsx`**: Reprodueix el banner superior amb totes les mètriques de host resumides i el badge `⚠ Reboot required (/var/run/reboot-required)`, la taula de contenidors Docker amb indicador `dockerd: UP/DOWN`, píndoles d'estat (`running (healthy)` vs `exited [exit_code]`) i barra de progrés de memòria (`width: 110px, height: 7px`), més la graella inferior `1.2fr 0.8fr` amb la taula d'endpoints HTTP (`200`/`202`) i la fitxa de PostgreSQL.
- [OK] **`mockups/telemetry/server-history.html` vs. `ServerHistoryView.tsx`**: Selector de rangs (`6h`, `24h`, `7 dies`, `30 dies`, `365 dies`), graella 2x2 amb les 4 gràfiques SVG (`System Load` amb línia discontínua de llindar, `Memòria RAM / Swap / Disc`, `Consum RAM per Contenidor Docker` i `PostgreSQL & Latència HTTP`) i modal de `Política de Retenció d'Històric (HU-TEL-05)` amb valor inicial de `365 dies`.

## Consistència visual
- [OK] Paleta semàntica d'estats totalment coherent a les tres pantalles: verd (`#16a34a` / fons `#dcfce7`) per a serveis saludables, vermell (`#dc2626` / fons `#fee2e2`) per a contenidors caiguts, endpoints KO o connexions altes (> 80%), i ambre (`#92400e` / fons `#fef3c7`) per a `WARNING` i `Reboot required`.
- [OK] Les barres de progrés de RAM de contenidors Docker i de connexions PostgreSQL canvien automàticament de blau (`#1976d2`) a vermell (`#dc2626`) quan superen el llindar crític (85% en Docker, 80% en Postgres).

## Responsive/mòbil
- [OK] Les graelles de KPIs (`xs: '1fr 1fr', md: 'repeat(4, 1fr)'`), targetes de servidor (`xs: '1fr', lg: '1fr 1fr'`), consola MOTD (`xs: '1fr', sm: '1fr 1fr'`), caixes de potetes (`xs: '1fr', sm: 'repeat(3, 1fr)'`) i gràfiques històriques (`xs: '1fr', md: '1fr 1fr'`) s'adapten progressivament a qualsevol mida de pantalla.
- [OK] Tant la taula de contenidors Docker com la taula d'endpoints HTTP tenen contenidors amb `overflowX: 'auto'` i `maxWidth: '100%'`.

## Feedback a l'usuari
- [OK] **Estat buit orientat a l'acció**: Quan no hi ha servidors assignats al Dashboard, es mostra una targeta clara explicant el motiu i un botó directe `Anar a Inventari de Servidors`. També hi ha estats buits específics quan un servidor no té contenidors, endpoints HTTP o instàncies PostgreSQL.
- [OK] **Indicador d'actualitat de les dades**: Cada targeta del Dashboard mostra `Últim report: fa X segons/min (cicle 5m)` i el bloc MOTD mostra la marca temporal exacta de l'snapshot.
- [OK] **Permisos al modal de retenció**: Els usuaris `USER` poden consultar que la política de retenció és de 365 dies, però l'input i el botó `Desar retenció` només estan habilitats per al rol `ADMIN`.

## Accessibilitat bàsica
- [OK] Alt contrast al bloc terminal MOTD (`#f8fafc` i `#38bdf8` sobre `#0f172a`), fàcil de llegir sense fatiga visual.
- [OK] Les taules de Docker i d'Endpoints HTTP disposen de `tabIndex={0}`, `role="region"` i `aria-label` descriptiu, i el camp `retention_days` del modal d'històric té `<label htmlFor={retentionInputId}>` enllaçat amb `useId()`.
- [Millorable] A `ServerDetailView.tsx`, les columnes ordenables de la taula Docker (`Contenidor`, `CPU (%)`, `Memòria RAM`) gestionen l'ordenació amb `onClick` sobre el `<th>`, sense atribut `aria-sort` ni botó enfocable per teclat.

## Incidències
1. **[Detall]** A `ServerDetailView.tsx`, les capçaleres d'ordenació de la taula de contenidors Docker (`<th>` amb `onClick={() => handleSort(...)}`) funcionen molt bé amb ratolí, però afegir `aria-sort` i un `<button>` intern permetria activar l'ordenació també amb la tecla `Tab`/`Enter` des del teclat.
