# 08. Environment & Configuration

> How MEMI is configured across environments: the zero-secrets local principle, the boot-time secret validation that hard-fails an unsafe deploy, a grouped reference of every environment variable, and the four Docker Compose files. Verified against `.env.example`, `MEMI-Backend/.env.example`, the compose files, and `MEMI-Backend/src/server.js` — trust this over older `ENVIRONMENT.md`.

---

## Zero-secrets local principle

Local development needs **no `.env` and no secrets**. This is deliberate, and it works because two compose files layer:

- **`docker-compose.yml`** is the production base. Its env values are `${VAR:-default}` interpolations, and the JWT defaults are *placeholders* (`replace_me_64_char_secret`, `replace_me_admin_secret`). Those placeholders are rejected by the boot check, so **the base file alone will NOT boot** — a deploy that forgets to set real secrets fails loudly instead of silently signing every token with a value that is public in this repo.
- **`docker-compose.local.yml`** (the local override) supplies dev-only `JWT_SECRET` / `JWT_ADMIN_SECRET` (two different ≥32-char strings), local `ALLOWED_ORIGINS`, and published host ports. Because you pass it explicitly, it never affects the production deploy.

So the golden local command supplies its own dev secrets and still needs zero setup:

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build
```

## Secret validation at boot (hard fail)

`MEMI-Backend/src/server.js` validates the JWT secrets before the server listens. If any check fails it prints the problems and `process.exit(1)` — the container never serves traffic. For **each** of `JWT_SECRET` and `JWT_ADMIN_SECRET`:

1. **Present** — not unset.
2. **Not a placeholder** — rejected by regex `/^(replace_me|changeme|your_|placeholder)/i`.
3. **At least 32 characters.**
4. **Different from each other** — identical secrets would collapse the customer/admin trust boundary (a customer token would verify as an admin token).

`jwt.sign/verify` would otherwise throw only at request time, turning every login into an opaque 500; this catches it at boot instead.

In addition, when `NODE_ENV=production` the boot prints **loud warnings** (not fatal) for degraded-but-important config: missing `STRIPE_SECRET_KEY`/`STRIPE_PUBLISHABLE_KEY`, missing `STRIPE_WEBHOOK_SECRET`, missing `SMTP_USER`, a `sk_test_` Stripe key, a weak/placeholder `DB_PASSWORD` (<12 chars), and an `ADMIN_PASSWORD` under 12 chars.

## Environment variable reference

Grouped by concern. "Required?" is from the backend's perspective; unset optional vars degrade gracefully unless noted.

### Core (database, secrets, server)

| Variable | Purpose | Required? | Default / gating |
|----------|---------|-----------|------------------|
| `DB_HOST` | MySQL host | Yes (has default) | `mysql` (compose service name) |
| `DB_PORT` | MySQL port | No | `3306` |
| `DB_NAME` | Database name | Yes | `memi_db` |
| `DB_USER` | DB user | Yes | `memi_user` |
| `DB_PASSWORD` | DB password | Yes | prod warns if <12 chars or placeholder |
| `MYSQL_ROOT_PASSWORD` | MySQL root pw (mysql container only) | Yes (compose) | `changeme_root` |
| `JWT_SECRET` | Signs customer JWTs | **Yes — hard fail** | must be present, non-placeholder, ≥32 chars, ≠ admin secret |
| `JWT_ADMIN_SECRET` | Signs admin JWTs | **Yes — hard fail** | same rules; must differ from `JWT_SECRET` |
| `JWT_EXPIRES_IN` | Customer token TTL | No | `7d` |
| `JWT_ADMIN_EXPIRES_IN` | Admin token TTL | No | `8h` |
| `PORT` | API listen port | No | `3000` |
| `NODE_ENV` | Environment mode | No | `production` in compose; non-prod relaxes CORS + silences boot warnings |
| `LOG_LEVEL` | pino log level | No | `info` |

### Admin bootstrap

| Variable | Purpose | Required? | Default / gating |
|----------|---------|-----------|------------------|
| `ADMIN_EMAIL` | Admin account to seed/rotate on boot | No | schema seeds `admin@memi.it` on a fresh DB |
| `ADMIN_PASSWORD` | Sets/rotates that admin's password | Recommended | prod **refuses to boot** if any admin still has the shipped default password |
| `ADMIN_PASSWORD_RESET` | Force a password rotation on boot | No | `bootstrapAdmin` otherwise seeds only a missing admin / replaces the DEFAULT hash |
| `ALLOW_DEFAULT_ADMIN` | Escape hatch: boot in prod with default creds (INSECURE) | No | unset |

### Stripe

| Variable | Purpose | Required? | Default / gating |
|----------|---------|-----------|------------------|
| `STRIPE_SECRET_KEY` | Server-side Stripe key | No | **missing → `/api/payments/create-intent` returns 503** (no crash) |
| `STRIPE_PUBLISHABLE_KEY` | Browser Stripe key | No | card checkout disabled without it |
| `STRIPE_WEBHOOK_SECRET` | Verifies `/api/payments/webhook` | No | missing → webhook rejects every event (503, fails safe) |

### SumUp (card payments — see `07-payments-integrations.md` for sandbox vs live)

| Variable | Purpose | Required? | Default / gating |
|----------|---------|-----------|------------------|
| `SUMUP_API_KEY` | SumUp API key (me.sumup.com → API Keys) | No | unset → checkout hides Carta/SumUp, falls back to Stripe (or 503 if Stripe also unset) |
| `SUMUP_MERCHANT_CODE` | SumUp merchant code (Settings → Account) | No | required alongside the API key |

### PayPal (scaffolding)

| Variable | Purpose | Required? | Default / gating |
|----------|---------|-----------|------------------|
| `PAYPAL_CLIENT_ID` | PayPal client id | No | no creds → checkout hides PayPal, API returns 503 |
| `PAYPAL_SECRET` | PayPal secret | No | code reads `PAYPAL_SECRET` (this is the canonical name) |
| `PAYPAL_ENV` | `sandbox` \| `live` | No | `sandbox` |
| `PAYPAL_WEBHOOK_ID` | Verifies PayPal webhook signatures | No | unset → webhook events acknowledged but never used to change order state |

### SMTP / email

| Variable | Purpose | Required? | Default / gating |
|----------|---------|-----------|------------------|
| `SMTP_USER` | Mail account user | No | **unset → ALL emails are silent no-ops** (order/shipping/welcome/reset never throw) |
| `SMTP_PASS` | Mail account password | No | — |
| `SMTP_HOST` | SMTP host | No | `smtp.gmail.com` |
| `SMTP_PORT` | SMTP port | No | `587` |
| `SMTP_SECURE` | TLS mode | No | `false` |
| `SMTP_FROM` | From header | No | `Memi Abbigliamento <info@memi.testdemo.it>` |

### Lifecycle / marketing emails

| Variable | Purpose | Required? | Default / gating |
|----------|---------|-----------|------------------|
| `LIFECYCLE_SEND_HOUR` | Local hour the daily batch fires | No | `9` |
| `DISABLE_EMAIL_SCHEDULER` | Disable the in-process scheduler | No | `1` idles it; also idle without SMTP |
| `lifecycle_*` (store_settings) | Per-campaign tunables (DB rows, not env) | No | see `src/lifecycle.js` |

### Web / origins & uploads

| Variable | Purpose | Required? | Default / gating |
|----------|---------|-----------|------------------|
| `ALLOWED_ORIGINS` | CORS allow-list (comma-separated) | Prod | enforced only when `NODE_ENV=production` |
| `FRONTEND_URL` | Base URL used in email links | No | `https://memi.testdemo.it` |
| `SHOP_DOMAIN` / `ADMIN_DOMAIN` / `API_DOMAIN` | Traefik host rules (compose) | Prod | `memi.testdemo.it` / `admin.…` / `api.…` |
| `UPLOADS_DIR` | Product-image storage path | No | `/app/uploads` (persisted in `uploads_data` volume) |
| `MAX_UPLOAD_MB` | Max upload size | No | `8` |
| `COURIER_TRACKING_SIMULATE` | Offline courier tracking (local override) | No | `1` in `docker-compose.local.yml` |

> Names verified in code: PayPal's secret is `PAYPAL_SECRET` — there is no `PAYPAL_CLIENT_SECRET` in the source.

## Config-gating summary: degrade vs hard-fail

| Missing config | Behavior |
|----------------|----------|
| `JWT_SECRET` / `JWT_ADMIN_SECRET` (missing/placeholder/<32/identical) | **HARD FAIL — backend `exit(1)`, never listens** |
| Default admin password still active (production) | **HARD FAIL at boot** unless `ALLOW_DEFAULT_ADMIN=1` |
| `STRIPE_SECRET_KEY` | Graceful — `create-intent` returns 503 |
| `STRIPE_WEBHOOK_SECRET` | Graceful — webhook rejects events (503) |
| `SMTP_USER` | Graceful — emails become silent no-ops |
| SumUp / PayPal creds | Graceful — option hidden in checkout; provider endpoints 503 |

## The four Compose files

| File | Purpose | Builds |
|------|---------|--------|
| `docker-compose.yml` | Production base (Traefik/Coolify). Placeholder JWT defaults → won't boot alone by design | `mysql`, `backend`, `ecommerce` (storefront nginx), `admin` (React `MEMI-Admin`) |
| `docker-compose.local.yml` | Local dev overrides: published host ports + dev JWT secrets + local CORS | overrides the four services above (no new builds) |
| `docker-compose.admin-next.yml` | Legacy jQuery `MEMI/` admin as a separate `admin-legacy` service (rollback / side-by-side) | `admin-legacy` (builds `./MEMI`) |
| `docker-compose.admin-next.local.yml` | Local override for the legacy admin — exposes it on host port `8082` | ports only for `admin-legacy` |

The primary `admin` service builds the **React `MEMI-Admin/`**; the legacy jQuery admin (`./MEMI`) is rollback-only and reached only via the two `admin-next` overlays.

## Local run quickstart

```bash
# Full stack (add -d to detach)
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build
```

Ready when the backend logs show both:

```
Core schema ensured          # migrations done
🚀  MEMI API running on port 3000
```

Local URLs and credentials:

| What | Address |
|------|---------|
| Shop (storefront) | http://localhost:8080 |
| Admin panel | http://localhost:8081 |
| API | http://localhost:3000 |
| Health check | `curl http://localhost:3000/health` → `{"status":"ok","db":"ok",...}` |
| MySQL (inspection) | `localhost:3307` |

Default seeded admin (fresh volume): **`admin@memi.it` / `memi2026admin`**.

Housekeeping:

```bash
docker compose logs -f backend           # tail backend logs
docker compose down                       # stop (keep data)
docker compose down -v                    # reset DB to seed state (LOCAL only)
docker exec <backend-container> node src/db/init.js   # re-init DB inside the container
```

> Seed data loads only on a fresh volume (`initdb.d`) or via `db/init.js`; the schema self-heals structurally on every boot via `db/migrations.js`. If list endpoints 500 with "table missing", restart the backend.

To run the legacy admin alongside (rollback check) on port `8082`:

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml \
  -f docker-compose.admin-next.yml -f docker-compose.admin-next.local.yml \
  up --build admin-legacy
```

---
*Consolidated from: ENVIRONMENT.md, LOCAL-RUN.md.*
