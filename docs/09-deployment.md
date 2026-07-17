# 09. Deployment & Go-Live

> How MEMI Abbigliamento runs in production — Hetzner + Coolify + Traefik — and the
> code-verified checklist for taking the three-app monorepo live. This consolidates five
> overlapping readiness/deploy docs into one narrative. **Trust the code over any older
> doc when they disagree.** For the full env-var list see `docs/08-environment-config.md`;
> for payment specifics see `docs/07-payments-integrations.md`; for verification and the
> known-issues drift list see `docs/10-testing-runbook.md`.

---

## 1. Target platform

- **Server:** a single Hetzner VPS.
- **Orchestrator:** **Coolify** (the historical live box ran Coolify 4.x). One Coolify
  resource of type **Docker Compose** builds and runs the whole stack from the repo's
  root `docker-compose.yml`.
- **Reverse proxy / TLS:** **Traefik** (Coolify's built-in `coolify-proxy`) terminates
  HTTPS. Each service carries `traefik.*` labels in `docker-compose.yml` that declare its
  host rule, the `websecure` entrypoint, a `letsencrypt` cert resolver, and an
  HTTP→HTTPS redirect middleware. There is **no Caddy** in this repo (an old
  `COOLIFY-DEPLOY.md` described a Caddy setup that never existed — ignore it).

### How a deploy happens

1. Push to `main` on GitHub (repo `kristi2002/MEMI-Gestionale`).
2. Coolify's **"Deploy on push to main"** webhook (Settings → Webhooks) fires and rebuilds
   the Docker images, then recreates the containers. Volumes persist across the rebuild.
3. Each static Dockerfile runs its cache-bust step (§4), so a plain browser refresh shows
   the new build — no manual cache work.
4. Confirm what's actually live on the server: `docker ps --format '{{.Names}} {{.Image}}'`
   — the image tag encodes the git SHA.

**"Redeploy trigger" commit pattern.** Because a deploy is driven by a push, the repo
history contains empty/no-op commits whose only purpose is to force Coolify to rebuild
(e.g. commit `314b8f8`, *"Redeploy trigger: retry Coolify build"*). This is deliberate —
use it when a build died mid-way and you need a clean retry.

**OOM caution.** The backend image runs `npm install` (with `sharp`, which pulls native
libvips) during the build. On a small Hetzner box an npm install can be **OOM-killed**
mid-flight, especially right after an env change busts the layer cache. If a build dies
during install, just re-trigger (the retry usually succeeds against a warm cache); if it
keeps dying, add swap or a larger instance.

---

## 2. Production topology

Four containers, one compose file, behind Traefik:

| Service | Build context | Internal port | Domain (compose default) | Volume |
|---|---|---|---|---|
| `mysql` | `mysql:8.0` image | 3306 | internal only (not published) | `mysql_data` |
| `backend` | `./MEMI-Backend` | 3000 | `api.memi.testdemo.it` | `uploads_data` → `/app/uploads` |
| `ecommerce` | `./Memi Abbigliamento` | 80 | `memi.testdemo.it` (+ `www.`) | — |
| `admin` | `./MEMI-Admin` | 80 | `admin.memi.testdemo.it` | — |

**Canonical domains** (settled 2026-07-10; matches the compose defaults, overridable via
`SHOP_DOMAIN` / `ADMIN_DOMAIN` / `API_DOMAIN`):

- Shop → `memi.testdemo.it` (+ `www.memi.testdemo.it`)
- Admin → `admin.memi.testdemo.it`
- API → `api.memi.testdemo.it`

The retired `memi.it` / `memiabbigliamento.it` placeholders still appear in a few older
docs and cron examples — ignore them.

**The `admin` service builds from `MEMI-Admin/` (React + Vite), not the legacy jQuery
`MEMI/`.** The `MEMI/` app is rollback-only and is *not* what ships. (Several older docs,
including `docs/admin/08-deployment.md`, still say the admin builds from `./MEMI` — that is
stale; the compose file is authoritative.)

### The `api.` subdomain is not on the browser hot path

The storefront and the admin both call the API **same-origin**: their own nginx proxies
`/api/*` to `backend:3000` (see the two `nginx.conf`). So a browser on `memi.testdemo.it`
never contacts `api.memi.testdemo.it` — that Traefik router exists but is **unused by
normal app traffic**. It is only reached directly for **server-to-server webhooks**
(Stripe/PayPal endpoints are configured as `https://<API_DOMAIN>/api/payments/webhook`,
`/api/payments/paypal/webhook`) and for **direct health/API probing** (`curl
https://api.memi.testdemo.it/health`). If you drop the `api.` DNS record, the apps keep
working but webhooks and direct probes break.

### Data persistence

- `mysql_data` — the database. `uploads_data` — product/media images (WebP variants
  written by the sharp pipeline), mounted at `/app/uploads`. **Both survive redeploys.**
- MySQL is **not** published in the base compose (no `ports:` mapping) — keep it that way.
- **NEVER run `docker compose down -v` on the server** — it destroys both volumes.

---

## 3. First-boot notes

- **Schema self-heals on boot** — `MEMI-Backend/src/db/migrations.js → ensureSchema()`
  runs `CREATE TABLE IF NOT EXISTS` (structural only). New tables appear automatically on
  a deploy. The base schema is also applied once via `initdb.d/01-schema.sql` when the
  `mysql_data` volume is empty.
- **Seed data** loads only on a fresh volume (via `initdb.d`) or `npm run db:init`.
- **Admin bootstrap** — if `ADMIN_EMAIL` / `ADMIN_PASSWORD` are set, the backend upserts
  that admin with a fresh bcrypt hash. `bootstrapAdmin` **preserves** an in-app-changed
  password across restarts (it only seeds a missing admin or replaces the shipped DEFAULT
  hash); `ADMIN_PASSWORD_RESET=1` forces a rotation. In production the backend **refuses
  to boot** if any admin still carries the default password, unless `ALLOW_DEFAULT_ADMIN=1`.
- **Fresh-volume race, now handled** — MySQL's healthcheck can go green before the
  `initdb.d` seed finishes. The backend retries its first DB connection
  (`server.js → connectWithRetry`), so `docker compose up` no longer reports a spurious
  "dependency backend failed to start" on the very first boot.

---

## 4. Build specifics

### Backend (`MEMI-Backend/Dockerfile`)

`node:20-alpine`, installs curl for the healthcheck, `npm install --omit=dev` (uses
`install` not `ci` so newly-added deps like sharp/multer reconcile), copies `src/`,
creates `/app/uploads`, drops to a non-root `memi` user, `CMD node src/server.js`. The
`uploads_data` volume mounted at `/app/uploads` inherits that ownership so the app can write.

### Storefront (`Memi Abbigliamento/Dockerfile`)

Two stages. **Build:** `node:20-alpine` runs `node scripts/cache-bust.js .` — this
rewrites every local `?v=` query on `app.js` / CSS / etc. across all HTML to a
**content hash**, so source `?v=N` values only need to be *consistent*, never manually
bumped (`|| echo` guards so the build never fails here). **Serve:** `nginx:alpine` copies
`nginx.conf` + the hashed tree.

### Admin (`MEMI-Admin/Dockerfile`)

Two stages. **Build:** `node:20` runs `npm install` then `npm run build` (`tsc -b` +
`vite build`) → static `dist/` with **hashed asset filenames** (Vite handles cache-busting
natively; there is no `cache-bust.js` step here). A TypeScript or Vite build error fails
the deploy. **Serve:** `nginx:alpine` copies `nginx.conf` + `dist`.

### nginx caching & security headers (both static apps)

Both `Memi Abbigliamento/nginx.conf` and `MEMI-Admin/nginx.conf`:

- **HTML** → `Cache-Control: no-cache, must-revalidate` — deploys are visible on plain
  refresh.
- **Hashed/versioned assets** (storefront: `css|js|png|jpg|webp|ico|woff2?`; admin:
  everything under `/assets/`) → `public, max-age=2592000, immutable` (**30 days**).
- **Security headers** on both HTML and asset locations: `Strict-Transport-Security`
  (`max-age=31536000; includeSubDomains`), `X-Frame-Options: SAMEORIGIN`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy: camera=(), microphone=(), geolocation=()`. **gzip** on.
- `^~ /api/` proxied to `backend:3000` with a deferred DNS resolver (so nginx starts even
  if the backend isn't up yet) and `X-Forwarded-Proto` forwarded. The `^~` prefix wins over
  the asset regex so `/api/uploads/<hash>.webp` proxies instead of 404-ing on local disk.
- Storefront serves `/.well-known/apple-developer-merchantid-domain-association` (Stripe
  Apple Pay domain verification) and `404 → /404.html`; the React admin instead does an
  SPA fallback (`try_files … /index.html`).
- **No `Content-Security-Policy` is set at the nginx layer** — a known hardening gap (§6).

The backend adds **helmet** headers on API responses (`crossOriginResourcePolicy:
cross-origin`).

---

## 5. Go-live checklist

Set these in **Coolify → resource → Environment**. Full descriptions in
`docs/08-environment-config.md`; payment details in `docs/07-payments-integrations.md`.
Generate a secret with `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`.

**Secrets & core config**
- [ ] `JWT_SECRET` and `JWT_ADMIN_SECRET` — strong, **distinct**, ≥32 chars (the backend
      **fails fast on boot** if either is missing, a placeholder, too short, or if the two
      are identical). Compose supplies dev values only via `docker-compose.local.yml`.
- [ ] `NODE_ENV=production` (**exact string**) — otherwise CORS is fail-open to all
      origins and prod boot-warnings are suppressed (§6).
- [ ] `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `MYSQL_ROOT_PASSWORD` — strong DB passwords.
- [ ] `ALLOWED_ORIGINS` — exactly the shop + admin origins
      (`https://memi.testdemo.it,https://admin.memi.testdemo.it`).
- [ ] `FRONTEND_URL=https://memi.testdemo.it` — used in password-reset / email links.
- [ ] `SHOP_DOMAIN`, `ADMIN_DOMAIN`, `API_DOMAIN` — Traefik host rules.

**Admin account**
- [ ] `ADMIN_EMAIL` + `ADMIN_PASSWORD` set → rotate off the shipped default
      (`admin@memi.it` / `memi2026admin`); confirm the red default-cred boot warning is
      **absent**. Leave `ALLOW_DEFAULT_ADMIN` unset.

**Payments** (see `docs/07-payments-integrations.md`)
- [ ] `STRIPE_SECRET_KEY` (`sk_live_…`) + `STRIPE_PUBLISHABLE_KEY` (`pk_live_…`) — checkout
      reads the publishable key from `GET /api/payments/config`, so it **must** be set or
      card checkout silently disables.
- [ ] `STRIPE_WEBHOOK_SECRET` — from the Stripe dashboard webhook pointed at
      `https://<API_DOMAIN>/api/payments/webhook` (events: `payment_intent.succeeded`,
      `charge.dispute.created`). Missing → the webhook rejects all events (503).
- [ ] **SumUp → LIVE merchant** — swap the sandbox merchant (`MWJ0XBGY`) for the live one
      (`MRRCM5V4`): set `SUMUP_API_KEY` + `SUMUP_MERCHANT_CODE` to live values.
- [ ] PayPal — `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET`, `PAYPAL_ENV=live`, and
      **`PAYPAL_WEBHOOK_ID`** (the webhook is verified-or-rejected only when this is set).
- [ ] Stripe **domain verification** for Apple Pay / Google Pay wallets (add the live
      domain in the Stripe dashboard; the `.well-known` route already serves the file).

**Email**
- [ ] `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` — else
      **all** transactional/lifecycle emails are silent no-ops.

**Infra**
- [ ] DNS `A` records for `memi.testdemo.it`, `www.`, `admin.`, `api.` → the Hetzner IP.
- [ ] TLS terminated by Traefik (letsencrypt); `X-Forwarded-Proto` forwarded so the admin
      cookie is issued `Secure` and rate limits key off the real client IP
      (`trust proxy` = 1).
- [ ] Backup cron installed (§7); archives synced off-box.
- [ ] `MAX_UPLOAD_MB` (default 8) as desired.

**Post-deploy verification** (details in `docs/10-testing-runbook.md`)
- [ ] `curl https://api.memi.testdemo.it/health` → `{"status":"ok","db":"ok",…}`.
- [ ] `curl https://memi.testdemo.it/api/products?limit=1` → JSON product (proves the
      same-origin proxy).
- [ ] Admin login loads real dashboard KPIs (not dashes / not the offline banner).
- [ ] Backend boot log shows `Core schema ensured`, `Migrations applied`,
      `MEMI API running on port 3000`, `Admin account bootstrapped from env` — and **no**
      `🔴 SECURITY` default-cred line.
- [ ] Locally before pushing: `bash verify/run.sh` exits 0; full stack: `./smoke-test.sh`.

---

## 6. Security hardening summary

From `docs/SECURITY.md` (candid about remaining gaps — verify against code before assuming
a gap is closed):

**In place**
- **Distinct admin realm** — admin JWT signed with a separate `JWT_ADMIN_SECRET`, 8h
  lifetime, delivered as an **HttpOnly cookie** `memi_admin_token` (`SameSite=Lax`,
  `Secure` derived per-request from `X-Forwarded-Proto`), with a legacy Bearer fallback.
  Customer JWT is a separate 7d Bearer token. Boot aborts if the two secrets are identical.
- **Server-side RBAC** — `requirePermission(view)` gates admin route mounts; admin **order**
  routes and the returns **refund** endpoint are permission-gated, not `requireAdmin`-only.
- **PayPal webhook signature verification** (`verifyPaypalWebhook`) — verifies-or-rejects
  when `PAYPAL_WEBHOOK_ID` is set; refuses to reconcile unverified events otherwise.
- **Stripe webhook** uses raw-body signature verification (`express.raw` before
  `express.json`); `payment_intent_id` is UNIQUE (no replay); checkout re-resolves prices
  server-side and verifies the Stripe amount; atomic stock decrement (no oversell).
- **Input bounds** — zod `validateBody` on the highest-risk routes; `cleanAddr` caps
  address fields at 120 chars; `express.json({ limit: '2mb' })`.
- **Rate limiting** — `express-rate-limit`, 15-min windows: `apiLimiter` 300/window
  baseline, `authLimiter` 20, `checkoutLimiter` 30, `publicWriteLimiter` 10,
  `codeProbeLimiter` 30. `trust proxy = 1`.
- **Security headers** on both nginx apps (§4); helmet on the API. Secrets are **not**
  committed (the repo's `docker-compose.yml` ships only placeholder defaults that
  deliberately refuse to boot).

**Known gaps / backlog** (see `docs/SECURITY.md §10` and `docs/10-testing-runbook.md`):
no CSRF token on the admin cookie (mitigated by `SameSite=Lax` + prod CORS + JSON); no JWT
revocation/blacklist (tokens valid until expiry); **`NODE_ENV`-gated CORS is fail-open** if
`NODE_ENV` ≠ exactly `production`; no nginx CSP; customer token in localStorage.

---

## 7. Ops — backup / restore / monitoring

Installable scripts live in `deploy/` (see `deploy/README.md`). They **discover
containers/volumes by the Docker Compose service label** (`com.docker.compose.service=…`),
so they work regardless of the project-name prefix Compose derives — never hardcode a
volume name like `memi_uploads_data`.

| Script | What it does |
|---|---|
| `deploy/backup.sh [db\|uploads\|all]` | `mysqldump --single-transaction --routines --triggers` → gzip, and/or tars the uploads volume; prunes archives older than `RETENTION_DAYS` (default 30); guards against a silent empty dump. Passes the DB password via `MYSQL_PWD` inside the container (never on the visible arg list). |
| `deploy/restore.sh <db\|uploads> <archive>` | Restores a `backup.sh` archive. **Destructive** — prompts for `yes` unless `FORCE=1`. |
| `deploy/healthcheck-monitor.sh` | Polls `/health` (which also checks DB connectivity); alerts **once** on down, suppresses repeats, sends one recovery note. Email (`mail`) and/or webhook (Slack/Discord). |

**Cron (Hetzner box)** — `chmod +x deploy/*.sh`, `mkdir -p /backups`, `crontab -e`:

```cron
# Daily DB backup 03:00
0 3 * * *  MYSQL_ROOT_PASSWORD='<root-pw>' BACKUP_DIR=/backups /opt/memi/deploy/backup.sh db      >> /var/log/memi-backup.log 2>&1
# Weekly uploads backup Sun 04:00
0 4 * * 0  BACKUP_DIR=/backups /opt/memi/deploy/backup.sh uploads                                 >> /var/log/memi-backup.log 2>&1
# Health monitor every 5 min
*/5 * * * * HEALTH_URL=https://api.memi.testdemo.it/health ALERT_EMAIL=you@example.com /opt/memi/deploy/healthcheck-monitor.sh >> /var/log/memi-health.log 2>&1
```

Sync `/backups` off-box (Hetzner Storage Box / S3) with a second cron — a backup on the
same disk it protects is not disaster recovery. **Do a restore drill on staging at least
once** (both round-trips were verified: DB dump → restore keeps all 23 products; uploads
tar → wipe → restore restores the WebP variants). UptimeRobot / Better Uptime are fine
complements to the health monitor.

**DB re-init** — inside the backend container: `docker exec <backend> node src/db/init.js`
(or `npm run db:init`). Only needed to (re)load seed data; the schema self-heals on boot.

---

## 8. Local development (reference)

Zero secrets needed — `docker-compose.local.yml` layers on published ports and dev-only
JWT values:

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build
# Shop http://localhost:8080 · Admin http://localhost:8081 · API http://localhost:3000
# MySQL localhost:3307 (inspection) · admin@memi.it / memi2026admin
docker compose down        # stop
docker compose down -v     # reset DB to seed — LOCAL ONLY, never on the server
```

---

## 9. Known gaps & roadmap

Deployment/hardening is ~90% complete; the platform is genuinely deployable. Honest open
items (from `PRODUCTION-ROADMAP.md`, `DEPLOYMENT-READINESS-PLAN-2026-07-15.md`, and the
go-live plan) — cross-reference `docs/10-testing-runbook.md` for the live drift/known-issue
list:

- **Payments needing client accounts:** PayPal/Klarna **live** processing is scaffolded and
  config-gated but never run end-to-end against real merchant creds; SumUp must be flipped
  to the live merchant. Wallets need Stripe domain verification on the live HTTPS domain.
- **Admin CRUD completeness:** the React admin still lacks manual order creation and PO
  line-item editing; a few list pages remain read/export-only.
- **Security backlog:** CSRF token on the admin cookie, JWT revocation, nginx CSP, moving
  the customer token off localStorage, and hardening the `NODE_ENV`-gated CORS fail-open.
- **Test coverage:** ~25 routers still lack unit tests; add a smoke assertion as each admin
  CRUD page lands (repo "definition of done"). Note the pre-existing `smoke-test.sh [9]
  Colors` block tests a `/api/colors` feature that does not exist — build it or delete the
  block.
- **Backlog needing contracts:** real courier label/tracking APIs (SDA/BRT/GLS), SDI
  e-invoicing, GA4 analytics, file-upload virus scanning, multi-rate/line-item VAT.
- **Execution:** actual Coolify/DNS/secrets provisioning happens on the client's Hetzner
  box — outside what can be done without server access.

---

*Consolidated from: DEPLOYMENT.md, DEPLOYMENT-READINESS-PLAN-2026-07-15.md, GO-LIVE-PLAN-2026-07.md, PRODUCTION-READINESS.md, PRODUCTION-ROADMAP.md, SECURITY.md, admin/08-deployment.md.*
