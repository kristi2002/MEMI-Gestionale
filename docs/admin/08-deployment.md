# 08 · Deployment & Operations

> How the platform runs in production (Hetzner + Coolify) and locally.

## Topology

Four containers behind Traefik (managed by Coolify), one `docker-compose.yml`:

| Service | Build context | Port | Domain (default) |
|---|---|---|---|
| `mysql` | `mysql:8.0` | 3306 | internal only |
| `backend` | `./MEMI-Backend` | 3000 | `api.memi.testdemo.it` |
| `ecommerce` | `./Memi Abbigliamento` | 80 | `memi.testdemo.it` (+ www) |
| `admin` | `./MEMI` | 80 | `admin.memi.testdemo.it` |

Traefik labels on each service set the HTTPS router (letsencrypt) + an HTTP→HTTPS
redirect. The admin/ecommerce nginx proxy `/api/*` to `backend:3000`, so browsers
make same-origin calls.

## Admin container build (`MEMI/Dockerfile`)
1. **Build stage** (`node:20-alpine`): runs `scripts/cache-bust.js .` which rewrites
   every local `?v=` in the admin HTML to a content hash (auto-discovers assets; never
   fails the build).
2. **Serve stage** (`nginx:alpine`): copies `nginx.conf` + the built files.

`MEMI/nginx.conf`: serves static files; `no-cache` on HTML (deploys show on
refresh); `immutable` 30-day cache on hashed assets; `^~ /api/` proxied to the
backend (priority over the asset regex so `/api/uploads/*` resolve); security headers
(HSTS, X-Frame-Options SAMEORIGIN, nosniff, Referrer-Policy, Permissions-Policy);
gzip; `404 → /404.html`.

## Coolify setup
- Deploy the repo as a **Docker Compose** application (the screenshot names it
  `Docker Compose` build pack). Set the three domains (backend/ecommerce/admin).
- Set environment variables (below) in Coolify → Environment. Push to `main` →
  Coolify auto-deploys (rebuild → cache-bust → fresh content hashes → live on refresh).

## Environment variables

Required (backend **fails fast on boot** without the JWT secrets):
```
DB_HOST DB_PORT DB_NAME DB_USER DB_PASSWORD MYSQL_ROOT_PASSWORD
JWT_SECRET JWT_ADMIN_SECRET            # 64-char secrets; missing → boot abort by design
ALLOWED_ORIGINS                        # must include the admin + shop domains
FRONTEND_URL                           # shop base (used in emails, feed links, recovery)
ADMIN_EMAIL ADMIN_PASSWORD             # bootstraps/rotates the admin login on boot
```
Optional (features degrade gracefully if unset):
```
STRIPE_SECRET_KEY STRIPE_PUBLISHABLE_KEY STRIPE_WEBHOOK_SECRET   # else /create-intent 503
SMTP_HOST SMTP_PORT SMTP_SECURE SMTP_USER SMTP_PASS SMTP_FROM    # else emails no-op
UPLOADS_DIR (=/app/uploads)  MAX_UPLOAD_MB (=8)
API_DOMAIN SHOP_DOMAIN ADMIN_DOMAIN                              # Traefik host rules
```
> **Local dev needs ZERO secrets** — `docker-compose.local.yml` supplies dev JWT
> defaults, and Stripe/SMTP can stay unset. Don't add fake keys to make them "work".

## Persistent volumes
- `mysql_data` — the database.
- `uploads_data` — mounted at `/app/uploads`; **product & media images survive
  redeploys**. Do not wipe it.

## Schema & seed behaviour
- **Schema self-heals on boot** (`db/migrations.js → ensureSchema()` + the feature
  `STATEMENTS`; `CREATE TABLE IF NOT EXISTS`, structural only). New tables appear
  automatically on deploy.
- **Seed data** loads only on a fresh volume (`initdb.d`) or via `npm run db:init`.
- **Admin bootstrap**: if `ADMIN_EMAIL`/`ADMIN_PASSWORD` are set, the backend upserts
  that admin with a fresh bcrypt hash on startup. If default credentials
  (`admin@memi.it` / `memi2026admin`) are still active, the admin shows a red security
  warning.

## Health & monitoring
- `GET /api/health` → `{"status":"ok",...}`. Compose healthchecks gate `backend`
  (HTTP 200) and `mysql` (`mysqladmin ping`); `admin`/`ecommerce` depend on
  `backend` healthy.
- `deploy/` has `backup.sh`, `restore.sh`, `healthcheck-monitor.sh`.

## Local run
```
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build
# Admin  http://localhost:8081   Shop http://localhost:8080   API http://localhost:3000
# MySQL  localhost:3307 (inspection)   Admin login admin@memi.it / memi2026admin
docker compose down          # stop
docker compose down -v       # reset DB to seed (LOCAL ONLY)
```

## Rate limiting & security (backend)
- `helmet`, CORS restricted to `ALLOWED_ORIGINS`, JSON body limit 2mb.
- Rate limiters: global `/api`, stricter on auth login/register/forgot/reset and on
  gift-card code probing.

## Don't
- Commit secrets or real `STRIPE_*`/`SMTP_*` keys.
- Run `down -v` against anything but local.
- Make destructive `schema.sql` drops/renames — add a migration instead.
