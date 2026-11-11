# UX — Mòdul alert

**Veredicte**: APTE
**Data**: 2026-11-11

## Flux revisats
- **Llistat, filtratge i reconeixement d'alertes (`HU-ALT-03`) — web (`AlertsView.tsx`)**: Consulta d'alertes actives (`FIRING`) i històriques (`RESOLVED`), filtratge combinat per servidor, estat (`FIRING`/`RESOLVED`), categoria (`HOST`, `DOCKER`, `HTTP_ENDPOINT`, `POSTGRES`, `HEARTBEAT`) i severitat (`CRITICAL`/`WARNING`), i acció `Acknowledge` sobre alertes actives.
- **Previsualització del format de correu SMTP (`HU-ALT-01`, `HU-ALT-02`) — web (`AlertsView.tsx`)**: Commutació a la vista de previsualització dels correus d'obertura (`[FIRING][CRITICAL]`) i de recuperació (`[RESOLVED]`) amb el context del servidor en el moment de l'alerta.
- **Indicador global d'alertes actives al menú lateral — web (`AppLayout.tsx`)**: Badge vermell amb el comptador `activeFiringCount` sempre visible al costat de l'enllaç `Alertes` de la barra de navegació lateral.

## Usabilitat
- [OK] Les alertes en estat `FIRING` destaquen immediatament a la taula gràcies al fons vermell suau (`#fff5f5`), el badge `FIRING` (`#fee2e2` / `#991b1b`) i la columna de durada en curs (`En curs (Xm Ys)` en vermell `#dc2626`).
- [OK] Els 4 selectors de filtre a la part superior permeten acotar incidències de seguida (per exemple, veure només les alertes `FIRING` de `DOCKER` d'un servidor concret) i disparen la recàrrega automàticament en canviar qualsevol filtre.
- [OK] El botó `Acknowledge` en una alerta `FIRING` proporciona confirmació immediata: mentre es processa mostra `...` i queda deshabilitat, i un cop completat passa a mostrar el text verd `Reconeguda (<usuari>)`.
- [OK] La segona vista (`2. Format Correu SMTP (FIRING & RESOLVED)`) utilitza dinàmicament les dades de la primera alerta de la llista (`sampleAlert`) o valors d'exemple realistes per mostrar exactament quin correu envia l'agent i evitar dubtes sobre com funcionen les notificacions amb *cooldown*.

## Fidelitat al mockup aprovat
- [OK] **`mockups/alert/alerts.html` vs. `AlertsView.tsx`**: Fidelitat completa tant en la vista de taula com en la vista de correu SMTP. La taula inclou les 7 columnes aprovades (`Estat`, `Servidor`, `Categoria & Recurs`, `Detall de la Incidència (Valor vs. Llindar)`, `Inici (fired_at)`, `Resolució / Durada`, `Acció`), xips de categoria monoespaiats, files actives ressaltades en `#fff5f5` i comptador superior `● N Alertes Actives (FIRING)`.
- [OK] La vista de previsualització dels correus SMTP reprodueix les dues targetes en paral·lel (`CORREU D'OBERTURA (FIRING)` i `CORREU DE RECUPERACIÓ (RESOLVED)`) amb assumpte, destinataris i cos del missatge en bloc terminal fosc (`#0f172a`) incloent el bloc `Context del servidor en el moment de l'alerta` i l'avís de no repetició de correus mentre duri l'estat `FIRING`.

## Consistència visual
- [OK] Ús coherent de `Paper`, `Button`, `Typography`, `Alert` (`MuiAlert`) i `CircularProgress`, mantenint la mateixa estètica de taules, filtres i capçaleres que `UsersView`, `ServersListView` i `ServerDetailView`.
- [OK] El comptador d'`activeFiringCount` a la barra superior de `AlertsView.tsx` està sincronitzat amb el mateix store (`useAlertsStore`) que alimenta el badge vermell del menú lateral a `AppLayout.tsx`.

## Responsive/mòbil
- [OK] La barra de filtres utilitza `display: 'flex'` amb `flexWrap: 'wrap'` i `gap: 1.5`, adaptant els 4 desplegables en diverses línies en pantalles petites.
- [OK] La taula de 7 columnes està continguda dins d'una regió amb `overflowX: 'auto'` i `maxWidth: '100%'`, i la vista dels 2 correus SMTP passa de 2 columnes a 1 columna (`gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }`) en pantalles estretes.

## Feedback a l'usuari
- [OK] **Estats de càrrega i buit**: Mostra `CircularProgress` centrada quan carrega per primera vegada i un missatge clar (`No hi ha cap alerta que coincideixi amb els filtres seleccionats.`) quan la cerca no retorna resultats.
- [OK] **Feedback d'error**: Qualsevol error de xarxa en llistar o reconèixer una alerta es mostra en un `MuiAlert severity="error"` tancable a la part superior de la vista.
- [OK] **Valors i llindars explícits**: A la columna de detall es mostren tant el missatge de l'agent com el parell `(Valor: X / Llindar: Y)` quan estan disponibles, facilitant entendre per què s'ha disparat l'alerta.

## Accessibilitat bàsica
- [OK] Tots quatre desplegables `<select>` de la barra de filtres disposen d'atribut `aria-label` explícit (`Filtra per servidor`, `Filtra per estat d'alerta`, `Filtra per categoria`, `Filtra per severitat`).
- [OK] La taula d'alertes està envoltada per un contenidor amb `tabIndex={0}`, `role="region"` i `aria-label="Taula d'alertes i incidències"`.
- [OK] Bon contrast cromàtic tant en els badges `FIRING` (`#991b1b` sobre `#fee2e2`) i `RESOLVED` (`#166534` sobre `#dcfce7`) com en els blocs de previsualització de correu (`#f8fafc` sobre `#0f172a`).

## Incidències
1. **[Detall]** A `AlertsView.tsx`, quan l'usuari aplica filtres i vol tornar a veure totes les alertes, ha de tornar a posar manualment cada `<select>` a la primera opció (`Tots...`). Afegir un petit botó `Netejar filtres` quan algun filtre està actiu agilitzaria la neteja ràpida.
