# Especificació del Mòdul: Infraestructura, CI/CD i Desplegament (`infra`)

## Resum de l'Èpica
Automatitzar la validació contínua (CI), la construcció i publicació d'imatges Docker a GitHub Container Registry (GHCR), el desplegament automàtic del Punt Central al VPS via SSH + Docker Compose + Traefik (seguint el patró de `nasc`), i la compilació i instal·lació com a servei `systemd` del binari natiu `rawcraft-agent` als servidors monitoritzats.

---

## Històries d'Usuari

### HU-INF-01: Pipeline d'Integració Contínua (`ci.yml`)
**Com a** equip de desenvolupament,  
**vull** que cada `push` a `main` o `feat/*` i cada `pull_request` cap a `main` executi automàticament els tests i la compilació de Backend (API + Agent) i Frontend,  
**per** detectar errors de compilació, tipatge o tests abans d'integrar canvis.

#### Criteris d'acceptació:
1. El workflow `.github/workflows/ci.yml` defineix dos jobs en paral·lel:
   - **`backend-test`**: Configura Go `1.26.x` amb caché de `backend/go.sum`, executa `go mod download`, `go test -v ./...`, i compila tant el servidor central (`go build -v ./cmd/api`) com l'agent recol·lector (`CGO_ENABLED=0 go build -v ./cmd/agent`).
   - **`frontend-test`**: Configura Node `22` i `pnpm` `10`, executa `pnpm install --frozen-lockfile` i `pnpm run build` (validació TypeScript + build de Vite).
2. Qualsevol fallada de test, tipatge o build fa fallar el pipeline de manera clara.

---

### HU-INF-02: Containerització Multi-stage i `docker-compose.yml` amb Traefik (Patró `nasc`)
**Com a** administrador d'infraestructura,  
**vull** disposar dels `Dockerfile` multi-stage per a Backend i Frontend i d'un `docker-compose.yml` connectat a les xarxes `web` (Traefik) i `postgres-network`,  
**per** desplegar el Punt Central amb HTTPS automàtic (Let's Encrypt) de manera idèntica a la resta d'aplicacions del servidor (`nasc`).

#### Criteris d'acceptació:
1. **`backend/Dockerfile`**: Build multi-stage que compila `./cmd/api` i genera una imatge d'execució lleugera que inclou les migracions SQL i escolta al port `8080` (amb endpoint `/health`).
2. **`frontend/Dockerfile`**: Build multi-stage que compila el projecte amb `pnpm` i serveix els estàtics amb Nginx al port `80` (amb fallback SPA `try_files $uri /index.html`).
3. **`docker-compose.yml` a l'arrel**:
   - Defineix els serveis `rawcraft-monitor-backend` (`ghcr.io/${GITHUB_REPOSITORY_OWNER:-ericzapater}/rawcraft-monitor-backend:latest`) i `rawcraft-monitor-frontend` (`ghcr.io/${GITHUB_REPOSITORY_OWNER:-ericzapater}/rawcraft-monitor-frontend:latest`).
   - Configura `restart: unless-stopped`, `TZ=Europe/Madrid`, fitxers `.env.backend` i `.env.frontend`, xarxes externes `web` i `postgres-network`, i les etiquetes `traefik.*` (`entrypoints=websecure`, `tls.certresolver=letsencrypt`).
4. Inclou les plantilles `.env.example`, `.env.backend.example` i `.env.frontend.example` sense cap secret real.

---

### HU-INF-03: Pipeline de Desplegament Continu a GHCR i VPS (`deploy.yml`)
**Com a** administrador d'infraestructura,  
**vull** un workflow `.github/workflows/deploy.yml` que construeixi i publiqui les imatges a GHCR i les desplegui per SSH al VPS quan es faci push a `main`, es creï un tag `v*.*.*` o s'executi manualment (`workflow_dispatch`),  
**per** actualitzar el Punt Central en producció de forma desatesa.

#### Criteris d'acceptació:
1. **Stage 1 (`build-and-push`)**:
   - Inicia sessió a `ghcr.io` amb `GITHUB_TOKEN`.
   - Extreu metadades i tags (`semver`, `sha-`, `latest` a la branca per defecte) amb `docker/metadata-action@v5`.
   - Construeix i puja les imatges `rawcraft-monitor-backend` i `rawcraft-monitor-frontend` amb `docker/build-push-action@v6` i caché GHA (`type=gha`).
   - Compila el binari estàtic `rawcraft-agent` (`CGO_ENABLED=0 GOOS=linux GOARCH=amd64` i `arm64`) i el puja com a artefacte del workflow (i l'adjunta a la GitHub Release quan l'esdeveniment és un tag `v*.*.*`).
2. **Stage 2 (`deploy-to-vps`)**:
   - S'executa després de `build-and-push` (si `github.event_name == 'push'` o `inputs.deploy_images == true`).
   - Copia `docker-compose.yml` a `~/rawcraft-monitor` al servidor remot mitjançant `appleboy/scp-action` usant els secrets `SSH_HOST`, `SSH_USER`, `SSH_KEY` i `SSH_PORT`.
   - Connecta per SSH amb `appleboy/ssh-action`, s'autentica a `ghcr.io`, executa `docker compose pull`, `docker compose up -d --remove-orphans`, `docker image prune -f` i verifica l'estat amb `docker compose ps`.
3. Seguint la Constitution, el primer desplegament real a producció requereix la validació humana explícita (**Checkpoint 6**).

---

### HU-INF-04: Instal·lació i servei `systemd` amb límit de RAM per a `rawcraft-agent`
**Com a** administrador d'un servidor monitoritzat,  
**vull** disposar d'un fitxer d'unitat `rawcraft-agent.service` per a `systemd` i d'un script/comanda d'instal·lació ràpida,  
**per** deixar l'agent corrent fora de Docker amb arrencada automàtica i consum de RAM limitat pel kernel.

#### Criteris d'acceptació:
1. Es proporciona la plantilla d'unitat `systemd` (`rawcraft-agent.service`) amb:
   - Execució de `/usr/local/bin/rawcraft-agent -config /etc/rawcraft-agent/config.yaml`.
   - Variable d'entorn `GOMEMLIMIT=20MiB`.
   - Restriccions de recursos a nivell de cgroups: `MemoryMax=30M` i `CPUQuota=5%`.
   - Reinici automàtic (`Restart=always`, `RestartSec=5s`).
2. A la vista de descàrrega del `config.yaml` de la Web (`HU-SRV-03`), es mostren també les instruccions/comandes exactes per instal·lar el binari, col·locar el `config.yaml` amb permisos `0600` i habilitar el servei amb `systemctl enable --now rawcraft-agent`.
