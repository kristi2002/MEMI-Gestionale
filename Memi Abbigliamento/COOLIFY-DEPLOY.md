# Deploying the MEMI storefront (Coolify on Hetzner)

> **Rewritten 2026-07-10.** The previous version of this file described a **Caddy** image with a
> `Caddyfile` and a `server.py` — none of which exist in this repo. The storefront is actually
> served by **nginx** (`Memi Abbigliamento/Dockerfile` → `nginx:alpine` + `nginx.conf`), and the
> whole platform (mysql + backend + ecommerce + admin) deploys together from the root
> `docker-compose.yml`. The stale single-service instructions were removed to avoid confusion.

## Canonical deployment references
- **`docs/DEPLOYMENT.md`** — full topology, deploy flow, persistence, post-deploy verification (Coolify/Traefik on Hetzner).
- **`docs/ENVIRONMENT.md`** — the complete, authoritative environment-variable reference.
- **`docs/PRODUCTION-READINESS.md`** — Italian go-live checklist (DNS, first-boot, backup/monitoring cron).
- **`docs/GO-LIVE-PLAN-2026-07.md`** — the current go-live plan and gap analysis.
- **`deploy/`** — `backup.sh`, `restore.sh`, `healthcheck-monitor.sh` (crontab-ready).

## How this app actually builds & serves
- `Dockerfile`: build stage `node:20-alpine` runs `scripts/cache-bust.js .` (content-hash rewrite
  of `?v=` on local JS/CSS — no manual version bumps needed for deploys); serve stage
  `nginx:alpine` copies `nginx.conf` → `/etc/nginx/conf.d/default.conf` and the tree →
  `/usr/share/nginx/html`. Listens on **port 80**.
- `nginx.conf`: proxies `^~ /api/` → `backend:3000` (same-origin, so no CORS in prod), serves HTML
  `no-cache, must-revalidate`, hashed assets `immutable 30d`, full security-header set + gzip.
- **Canonical domain:** `memi.testdemo.it` (admin `admin.memi.testdemo.it`, api `api.memi.testdemo.it`).
  Traefik/Let's Encrypt labels live in the root `docker-compose.yml`.

For the recommended Coolify flow, deploy the root `docker-compose.yml` as a single Docker-Compose
resource (or one resource per service pointing at the same file) and set the environment variables
from `docs/ENVIRONMENT.md` on the `backend` service. Enable the GitHub webhook for auto-deploy on
push. Add domains + SSL in Coolify's **Domains** tab once DNS resolves.
