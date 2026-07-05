# MEMI — Deployment & Operations (Hetzner + Coolify)

> Regenerated 2026-07-05. Verified against the live server (Coolify 4.1.2 on Hetzner, 91.99.137.240).

## Topology
One Coolify "Docker Compose" resource builds all four services from `docker-compose.yml`:
mysql (8.0, volume `mysql_data`), backend (Node, volume `uploads_data` at /app/uploads),
ecommerce (nginx static), admin (nginx static). Traefik (coolify-proxy) terminates TLS via
labels: `SHOP_DOMAIN` (+www), `ADMIN_DOMAIN`, `API_DOMAIN`, all with letsencrypt + HTTP→HTTPS redirect.

## Deploy flow (verified working)
1. Push to `main` on GitHub (`kristi2002/MEMI-Gestionale`).
2. Coolify webhook builds images tagged `<uuid>_<service>:<git-sha>` and restarts containers.
3. Both static Dockerfiles run `scripts/cache-bust.js` at build → content-hash `?v=`; nginx serves HTML
   `no-cache` → deploys are visible on plain refresh, no manual cache work.
4. Confirm what's live: `docker ps --format '{{.Names}} {{.Image}}'` on the server — image tag = commit SHA.

## Environment variables (set in Coolify → resource → Environment)
Required: `DB_NAME, DB_USER, DB_PASSWORD, MYSQL_ROOT_PASSWORD, JWT_SECRET, JWT_ADMIN_SECRET,
ALLOWED_ORIGINS, SHOP_DOMAIN, ADMIN_DOMAIN, API_DOMAIN, FRONTEND_URL`.
Recommended: `ADMIN_EMAIL, ADMIN_PASSWORD` (bootstraps/rotates the admin login at boot; a red warning
is logged if the seeded default admin@memi.it/memi2026admin is still active in production).
Payments: `STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET` (webhook endpoint:
`https://<API_DOMAIN>/api/payments/webhook`, events: payment_intent.succeeded, charge.dispute.created).
Email: `SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM` (all emails silently skip if
SMTP_USER unset). Uploads: `MAX_UPLOAD_MB` (default 8). Logging: `LOG_LEVEL`.
Backend fails fast on boot without both JWT secrets (compose supplies dev defaults locally only).

## Data persistence
- `mysql_data` — the database. `uploads_data` — product images. Both survive redeploys.
- NEVER `docker compose down -v` on the server.

## Backup / restore (deploy/ scripts)
- `deploy/backup.sh` — mysqldump + uploads tar (run via cron on the server).
- `deploy/restore.sh` — restore from a backup file.
- `deploy/healthcheck-monitor.sh` — polls `/health`, alerts on failure.
Recommended cron: nightly backup + off-server copy (Hetzner Storage Box / S3).

## Post-deploy verification
1. `curl -s https://<API_DOMAIN>/health` → `{"status":"ok"}`
2. `curl -s https://<SHOP_DOMAIN>/api/products?limit=1` → JSON product
3. Admin login loads dashboard KPIs (real numbers, not dashes).
4. Locally before pushing: `bash verify/run.sh` must exit 0; full-stack: `./smoke-test.sh`.

## Local development
`docker compose -f docker-compose.yml -f docker-compose.local.yml up --build`
→ shop :8080, admin :8081, api :3000, mysql :3307. Zero secrets needed. Reset DB: `down -v` (local only).
Backend without Docker: `cd MEMI-Backend && npm install && npm run db:init && npm start`.

## Known operational cautions
- MySQL is not exposed publicly in prod (no ports mapping in base compose) — good; keep it that way.
- `uploads_data` grows with product images; monitor disk (Hetzner default volumes).
- Coolify re-clones the repo per deployment — never edit files inside `/artifacts/...` on the server.
- Development machine caveat: the repo previously suffered file truncation from a sync tool on the
  Windows Desktop folder (see MEMI-CHANGELOG-AND-ROADMAP.md 2026-07-05). Prefer moving the repo out of
  synced folders; `verify/run.sh` catches truncated JS.
