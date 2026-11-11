# UX — Mòdul user

**Veredicte**: APTE
**Data**: 2026-11-11

## Flux revisats
- **Inici de sessió (`HU-USR-01`) — web (`LoginView.tsx`)**: Flux directe i sense fricció. El formulari demana únicament correu electrònic i contrasenya amb commutador per mostrar/amagar la contrasenya, missatge d'error contextual (`401`) i nota clara que l'accés és restringit sense registre públic.
- **Canvi de contrasenya pròpia (`HU-USR-04`) — web (`AppLayout.tsx`)**: Accessible en tot moment des de la barra superior (`Topbar`) per a qualsevol usuari autenticat (`ADMIN` o `USER`). Validació immediata de longitud mínima (8 caràcters) i coincidència de confirmació abans d'enviar la petició.
- **Gestió d'usuaris i permisos per servidor (`HU-USR-02`, `HU-USR-03`) — web (`UsersView.tsx`)**: Taula clara amb rol (`ADMIN`/`USER`), xips amb els noms dels servidors assignats (`server_ids`), estat (`Actiu`/`Inactiu`) i diàlegs modals tant per a l'alta/edició amb llista de checkboxes de servidors com per a la baixa amb confirmació explícita (`confirm=true`).

## Usabilitat
- [OK] El flux d'inici de sessió (`LoginView.tsx`) és net, amb autofill semàntic (`autoComplete="username"` i `autoComplete="current-password"`) i botó per revelar la contrasenya (`VisibilityIcon` / `VisibilityOffIcon`).
- [OK] En l'alta i edició d'usuaris (`UsersView.tsx`), quan es selecciona el rol `ADMIN`, la secció de checkboxes de `server_ids` s'oculta automàticament perquè l'administrador ja té accés global a tots els servidors; quan es selecciona `USER`, es mostra la llista de servidors amb nom i IP/descripció perquè l'assignació sigui inequívoca.
- [OK] Es protegeix l'administrador actual contra l'auto-desactivació (`disabled={editingUser?.id === currentUser?.id}` al `Switch` d'`is_active`) i contra l'auto-baixa (el botó `Baixa` no es renderitza per al propi usuari autenticat).
- [OK] El canvi de contrasenya pròpia (`HU-USR-04`) està disponible des de qualsevol pantalla a la capçalera superior sense obligar a sortir del flux de monitorització.

## Fidelitat al mockup aprovat
- [OK] **`mockups/user/login.html` vs. `LoginView.tsx` + `AppLayout.tsx`**: Fidelitat total en estructura, paleta fosca de fons (`#0f172a`), targeta blanca centrada (`maxWidth: 420px`), icona `>_` amb tipografia `Roboto Mono`, textos descriptius, alerta d'error `401` amb vora esquerra vermella (`4px solid #d32f2f`) i nota inferior de seguretat. El formulari de canvi de contrasenya pròpia (`HU-USR-04`) conserva exactament els 3 camps i els missatges d'èxit/error aprovats al mockup.
- [OK] **`mockups/user/users.html` vs. `UsersView.tsx`**: La taula d'usuaris reprodueix les 6 columnes aprovades (`Usuari`, `Rol`, `Servidors Autoritzats`, `Estat`, `Data d'alta`, `Accions`), els badges diferenciats per a `ADMIN` (`#e0e7ff`/`#3730a3`) i `USER` (`#f1f5f9`/`#334155`), els xips monoespaiats per a cada servidor autoritzat, el modal d'alta/edició amb checkboxes de servidors i el modal de confirmació de baixa d'entitat sensible (`confirm=true`).

## Consistència visual
- [OK] Ús coherent de components de Material UI (`Paper`, `Dialog`, `DialogTitle`, `DialogContent`, `DialogActions`, `Button`, `Chip`, `Alert`, `Checkbox`, `Switch`, `CircularProgress`) combinats amb la paleta corporativa definida al tema global (`App.tsx`).
- [OK] Els estils de botons primaris (`contained` en `#1976d2`), secundaris (`outlined` amb vora `#e2e8f0`) i destructius (`color="error"`) mantenen la mateixa jerarquia visual que la resta de mòduls.

## Responsive/mòbil
- [OK] La targeta de login s'adapta a qualsevol amplada de finestra gràcies al contenidor flexible amb padding lateral (`p: 3`, `maxWidth: 420`).
- [OK] La taula d'usuaris està embolcallada dins d'un contenidor amb `overflowX: 'auto'` i `maxWidth: '100%'`, i la capçalera de pàgina utilitza `flexWrap: 'wrap'` perquè el botó `+ Nou Usuari` no es talli en pantalles estretes.
- [Millorable] El menú lateral (`aside` de `240px` a `AppLayout.tsx`) és fix en horitzontal; en resolucions mòbils molt estretes (< 600px) restaria amplada útil al contingut principal, tot i que per a una consola d'administració web d'escriptori/tauleta funciona correctament.

## Feedback a l'usuari
- [OK] **Estats de càrrega**: Spinner `CircularProgress` tant al botó d'entrar (`authLoading`) com a la càrrega inicial de la taula d'usuaris (`usersLoading`) i estats de desat (`Desant...`, `Processant...`, `Actualitzant...`) amb deshabilitació dels botons per evitar dobles enviaments.
- [OK] **Gestió d'errors HTTP i validació**: Es mostra explícitament l'`Error 401` en cas de credencials invàlides o usuari inactiu, i l'`Error 409 Conflict` dins del propi modal quan s'intenta donar d'alta o editar un correu electrònic duplicat.
- [OK] **Confirmació d'operació destructiva**: La baixa d'un usuari obre un diàleg modal d'advertència que explica l'aplicació de *soft-delete* (`confirm=true`) i la revocació immediatament d'accés als servidors.

## Accessibilitat bàsica
- [OK] Tots els camps dels formularis de login, canvi de contrasenya i alta/edició d'usuari tenen etiquetes `<label htmlFor={...}>` enllaçades explícitament amb `useId()`.
- [OK] El bloc d'errors de login utilitza `aria-live="polite"` i s'associa als inputs mitjançant `aria-describedby`.
- [OK] El botó de mostrar/amagar contrasenya disposa d'`aria-pressed` i `aria-label` descriptiu en català (`Mostra contrasenya` / `Amaga contrasenya`).
- [OK] El contenidor amb scroll horitzontal de la taula d'usuaris inclou `tabIndex={0}`, `role="region"` i `aria-label="Taula d'usuaris i permisos per servidor"` per a navegació amb teclat.

## Incidències
1. **[Detall]** A `AppLayout.tsx`, quan s'actualitza amb èxit la contrasenya pròpia (`HU-USR-04`), es mostra l'alerta verda `Contrasenya actualitzada correctament.` i es buiden els camps, però el modal roman obert fins que l'usuari prem `Tancar`. Tancar automàticament el modal passats uns segons o destacar el botó de tancament després de l'èxit podria arrodonir encara més el flux.
