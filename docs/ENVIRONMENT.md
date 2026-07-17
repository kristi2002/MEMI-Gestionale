# MEMI — Environment Variable Reference

> **Canonical env-var reference. Written 2026-07-10.**
> This is the single source of truth for every environment variable used by the
> MEMI platform (backend API + Docker/Coolify deploy). Where the two
> `.env.example` files disagree, **this doc wins** — see
> [Reconciliation note](#reconciliation--the-two-envexample-files-are-stale) at
> the bottom.

**Canonical domains** (use these everywhere — not `memi.it`, not `memiabbigliamento.it`):

| Role  | Domain                     |
|-------|----------------------------|
| Shop  | `memi.testdemo.it`         |
| Admin | `admin.memi.testdemo.it`   |
| API   | `api.memi.testdemo.it`     |

**Deploy target:** Hetzner + Coolify + Traefik + Let's Encrypt.
Each variable below is consumed by the `backend` service (`MEMI-Backend`) unless
noted as a **compose/deploy** var (read by `docker-compose.yml` / Traefik, not by
Node).

---

## Local dev needs ZERO secrets

`docker compose -f docker-compose.yml -f docker-compose.local.yml up --build` boots
a full working stack with **no `.env` at all**. Compose supplies dev defaults for
the two required secrets (`JWT_SECRET`, `JWT_ADMIN_SECRET`) and leaves Stripe/SMTP
unset. Result: card checkout returns 503 and emails are silent no-ops, but auth,
catalog, cart, orders, and the admin panel all work. **Do not invent fake
Stripe/SMTP keys to make them "work" locally** — leave them unset.

## Generate a secret

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Use this for `JWT_SECRET` and again (a *different* value) for `JWT_ADMIN_SECRET`.

## Legend

- **Required** — backend calls `process.exit(1)` on boot if unset (only the two JWT secrets).
- **Recommended** — not enforced, but production is misconfigured/insecure without it.
- **Optional** — feature degrades gracefully (503 or silent no-op) when unset.

---

## Database

| Variable | Level | Default | Controls | If wrong / missing |
|----------|-------|---------|----------|--------------------|
| `DB_HOST` | Recommended | `localhost` (code) · `mysql` (compose) | MySQL host the pool connects to. | Wrong host → backend can't reach DB; every data endpoint 500s. |
| `DB_PORT` | Optional | `3306` | MySQL port. | Wrong port → connection refused at boot. |
| `DB_USER` | Recommended | `memi_user` | DB login user. | Auth failure → pool can't connect. |
| `DB_PASSWORD` | Recommended | `''` (code) · `changeme_user` (compose) | DB password. | Wrong password → `ER_ACCESS_DENIED`; all queries fail. |
| `DB_NAME` | Recommended | `memi_db` | Schema/database name. | Wrong name → "table missing" 500s; schema self-heal targets the wrong DB. |
| `MYSQL_ROOT_PASSWORD` | Recommended (compose/deploy) | `changeme_root` | Root password for the `mysql` container + healthcheck. **Read by compose, not Node.** | Weak default in production = security risk. Change it. |

> The pool is created in `MEMI-Backend/src/db/index.js` (connectionLimit 10,
> `utf8mb4`, UTC timezone). `DB_HOST`/`DB_PORT` are fixed to `mysql:3306` inside the
> compose network — you normally only override the DB vars when running the backend
> outside Docker.

## JWT / Auth

| Variable | Level | Default | Controls | If wrong / missing |
|----------|-------|---------|----------|--------------------|
| `JWT_SECRET` | **Required (fail-fast)** | *none* — `exit(1)` | Signs/verifies **customer** tokens. | Unset → backend refuses to boot. Changed after launch → all existing customer sessions invalidated. |
| `JWT_ADMIN_SECRET` | **Required (fail-fast)** | *none* — `exit(1)` | Signs/verifies **admin** tokens. Must differ from `JWT_SECRET`. | Unset → backend refuses to boot. Reused/weak → admin panel compromise. |
| `JWT_EXPIRES_IN` | Optional | `7d` | Customer token lifetime. | Too long = stale-session risk; malformed = token signing errors. |
| `JWT_ADMIN_EXPIRES_IN` | Optional | `8h` | Admin token lifetime. | Same as above for admins. |

> Fail-fast lives in `MEMI-Backend/src/server.js` (~L77-83): any of
> `['JWT_SECRET','JWT_ADMIN_SECRET']` missing → logs the missing names and exits.
> Compose supplies dev defaults (`replace_me_64_char_secret` /
> `replace_me_admin_secret`) so local boots — **replace both in production.**

## CORS / Domains

| Variable | Level | Default | Controls | If wrong / missing |
|----------|-------|---------|----------|--------------------|
| `ALLOWED_ORIGINS` | Recommended | `https://memi.testdemo.it,https://admin.memi.testdemo.it` (compose) | Comma-separated CORS allow-list (`server.js` splits/trims). | Missing your real domain → browser CORS errors; storefront/admin API calls blocked. Local override sets `http://localhost:8080,http://localhost:8081`. |
| `FRONTEND_URL` | Recommended | `https://memi.testdemo.it` | Base URL baked into email links (password reset, etc.). | Wrong → reset/confirmation links point at the wrong host. |
| `SHOP_DOMAIN` | Recommended (compose/deploy) | `memi.testdemo.it` | Traefik Host rule for the storefront container. | Wrong → TLS/routing for the shop breaks. |
| `ADMIN_DOMAIN` | Recommended (compose/deploy) | `admin.memi.testdemo.it` | Traefik Host rule for the admin container. | Wrong → admin panel unreachable at its domain. |
| `API_DOMAIN` | Recommended (compose/deploy) | `api.memi.testdemo.it` | Traefik Host rule for the backend container. | Wrong → API unreachable at its domain. |

## Stripe (payments)

| Variable | Level | Default | Controls | If wrong / missing |
|----------|-------|---------|----------|--------------------|
| `STRIPE_SECRET_KEY` | Optional | *unset* | Server-side Stripe API key; enables PaymentIntents. | Unset → `POST /api/payments/create-intent` returns **503** (no crash). Card checkout disabled. Prod boot logs a red warning. |
| `STRIPE_PUBLISHABLE_KEY` | Optional | *unset* | Client publishable key for Stripe.js. | Unset → checkout can't mount the card form; treated together with the secret key (both must be set). |
| `STRIPE_WEBHOOK_SECRET` | Optional | *unset* | Verifies signatures on `POST /api/payments/webhook`. | Unset → webhook rejects **every** event with **503** (fails safe). Payments won't reconcile to `pagato` via webhook. Prod boot logs a red warning. |

> Point the Stripe dashboard webhook at `https://api.memi.testdemo.it/api/payments/webhook`
> (subscribe to at least `payment_intent.succeeded` and `charge.dispute.created`).

## PayPal (alternative payments — scaffolding)

Config-gated exactly like Stripe: with credentials unset, the checkout hides the option and
every provider endpoint returns **503** — nothing breaks. Set these once the client provides
merchant accounts (`src/payment-providers.js`).

| Variable | Level | Default | Controls | If wrong / missing |
|----------|-------|---------|----------|--------------------|
| `PAYPAL_CLIENT_ID` | Optional | *unset* | PayPal REST client id (also sent to the browser for the PayPal Buttons SDK). | Unset → PayPal hidden at checkout; `/api/payments/paypal/*` → 503. |
| `PAYPAL_SECRET` | Optional | *unset* | PayPal REST secret (server-only). | Unset → PayPal disabled. |
| `PAYPAL_ENV` | Optional | `sandbox` | `sandbox` or `live` — selects the PayPal API host. | Wrong value falls back to sandbox. |
| `PAYPAL_WEBHOOK_ID` | Optional (**required for live PayPal**) | *unset* | Webhook id from the PayPal dashboard. `POST /api/payments/paypal/webhook` verifies each event's signature against it (`/v1/notifications/verify-webhook-signature`). | Unset → webhook events are acknowledged (200) but **never reconciled** (no order state change on an unverifiable event). Set → events are verify-or-reject (bad signature → 400). |

> The order handler re-verifies every PayPal transaction amount server-side before
> marking `pagato` (never trusts the client). See `docs/SECURITY.md`.
>
> **Klarna (re-added Luglio 2026)** rides on Stripe — no separate `KLARNA_*` variables exist.
> It uses the same `STRIPE_SECRET_KEY`/`STRIPE_PUBLISHABLE_KEY` PaymentIntent as the card flow,
> mounted as a Stripe Payment Element scoped to `paymentMethodOrder: ['klarna']`, redirect-based
> (buyer completes on Klarna's hosted page, returns to `checkout.html?payment_intent_client_secret=...`).
> Klarna must also be enabled for the Stripe account in the Stripe Dashboard (Settings > Payment
> methods) for the account's country/currency — the Payment Element mounts empty otherwise.

## SumUp (alternative card processor — scaffolding)

Config-gated exactly like PayPal: with credentials unset, the checkout hides Carta/SumUp and
falls back to Stripe Elements (or 503s if Stripe is also unset) — nothing breaks. When set,
SumUp's widget REPLACES the Stripe card form (takes priority over Stripe for card payments);
Klarna and PayPal are unaffected either way. Set these once the client provides a SumUp
merchant account (`src/payment-providers.js`).

| Variable | Level | Default | Controls | If wrong / missing |
|----------|-------|---------|----------|--------------------|
| `SUMUP_API_KEY` | Optional | *unset* | SumUp secret API key (Bearer token) — generated in the SumUp merchant dashboard (`me.sumup.com` > Settings > API Keys), **not** the developer.sumup.com OAuth app flow. | Unset → Carta falls back to Stripe; `/api/payments/sumup/*` → 503. |
| `SUMUP_MERCHANT_CODE` | Optional | *unset* | SumUp merchant identifier (`me.sumup.com` > Settings > Account), short alphanumeric id. | Unset → SumUp disabled. |

> The order handler re-verifies every SumUp checkout's status AND amount server-side
> (`getSumupCheckout`) before marking `pagato` — never trusts the client-reported `sumup_checkout_id`
> alone. See `docs/SECURITY.md`.

## SMTP / Email

| Variable | Level | Default | Controls | If wrong / missing |
|----------|-------|---------|----------|--------------------|
| `SMTP_HOST` | Optional | `smtp.gmail.com` | Mail server host. | Wrong host → send attempts fail (but only matter once `SMTP_USER` is set). |
| `SMTP_PORT` | Optional | `587` | Mail server port. | Mismatch with `SMTP_SECURE` → connection/TLS errors. |
| `SMTP_SECURE` | Optional | `false` | `"true"` = implicit TLS (port 465); anything else = STARTTLS. Compared as string `=== 'true'`. | Wrong value for the port → handshake failures. |
| `SMTP_USER` | **Recommended** | *unset* | SMTP auth user. **This is the master email switch.** | Unset → **ALL** transactional emails (order confirmation, shipping, welcome, password reset, gift-card delivery) are **silent no-ops** — never throw. Required for a real store. Prod boot logs a red warning. |
| `SMTP_PASS` | Recommended | *unset* | SMTP auth password / app-password. | Set `SMTP_USER` without a valid `SMTP_PASS` → auth failures on send. |
| `SMTP_FROM` | Optional | falls back to `SMTP_USER` | Display "From" address on outgoing mail. | Unset → mail is sent as `SMTP_USER`. |

## Admin bootstrap

| Variable | Level | Default | Controls | If wrong / missing |
|----------|-------|---------|----------|--------------------|
| `ADMIN_EMAIL` | **Recommended** | *unset* | With `ADMIN_PASSWORD`, **seeds** the admin login (`db/migrations.js → bootstrapAdmin`). As of 2026-07-15 it only creates a missing admin or **replaces the shipped default hash** — it no longer overwrites a password changed in-app on every boot. | Unset → no seed; you rely on the seeded default admin. |
| `ADMIN_PASSWORD` | **Recommended** | *unset* | Hashed and applied only when creating the admin or replacing the default hash (see `ADMIN_PASSWORD_RESET` to force a rotation). | Unset → default admin stays active → **prod refuses to boot** (see below). |
| `ADMIN_PASSWORD_RESET` | Optional | *unset* | `=1` forces `ADMIN_PASSWORD` to be re-applied to `ADMIN_EMAIL` on the next boot even if the current password is non-default. Use for an intentional env-driven rotation, then unset it. | Unset → an in-app password change survives restarts. |
| `ALLOW_DEFAULT_ADMIN` | Optional | *unset* | Escape hatch: `=1` lets production boot even with the default admin password still active. | Only for a throwaway staging box — **INSECURE** in real production. |

> **Seeded default & boot guard:** a fresh DB seeds `admin@memi.it` / `memi2026admin`.
> In **production** the backend now **refuses to boot** (`process.exit(1)`) if any admin
> still carries that shipped default password — the same fail-fast philosophy as the JWT
> secrets. Set `ADMIN_EMAIL=admin@memi.it` + a strong `ADMIN_PASSWORD` to rotate it before
> going live (or set `ALLOW_DEFAULT_ADMIN=1` to bypass, not recommended). In dev/non-prod it
> only logs a warning.

## Uploads

| Variable | Level | Default | Controls | If wrong / missing |
|----------|-------|---------|----------|--------------------|
| `UPLOADS_DIR` | Recommended | `/app/uploads` (compose) · `<src>/../uploads` (code) | Filesystem dir for processed WebP product images (`images.js`). Backed by the `uploads_data` Docker volume; served at `/api/uploads/<file>`. | Not a persistent volume → uploaded images vanish on redeploy. |
| `MAX_UPLOAD_MB` | Optional | `8` | Per-file upload size cap (products, media, settings). CSV/ZIP import allows `MAX_UPLOAD_MB × 30`. | Too low → large product photos rejected. Read in `routes/products.js`, `products-import.js`, `settings.js`. |

## Logging / Runtime

| Variable | Level | Default | Controls | If wrong / missing |
|----------|-------|---------|----------|--------------------|
| `NODE_ENV` | Recommended | `production` (compose) | Gates the loud prod boot warnings for Stripe/SMTP (`server.js` ~L89). | Not `production` → the red misconfiguration warnings are suppressed (fine for local dev). |
| `PORT` | Optional | `3000` | Port the Express server listens on. | Changing it desyncs the healthcheck + Traefik `loadbalancer.server.port` (both assume 3000). |
| `LOG_LEVEL` | Optional | `info` | pino log level: `trace\|debug\|info\|warn\|error\|fatal` (`logger.js`). | Invalid value → pino errors; `debug` in prod = noisy logs. |

---

## The two `.env.example` files — reconciled (2026-07-10)

Both example files were reconciled to this doc during the go-live pass:

- **Root `./.env.example`** — expanded to the full superset that `docker-compose.yml`
  actually consumes (Stripe, SMTP, `ADMIN_EMAIL`/`ADMIN_PASSWORD`, `ALLOW_DEFAULT_ADMIN`,
  `FRONTEND_URL`, `MAX_UPLOAD_MB`) plus the deploy-only domain vars.
- **`MEMI-Backend/.env.example`** — domains fixed to the canonical `*.memi.testdemo.it`
  in `ALLOWED_ORIGINS`, `SMTP_FROM`, `FRONTEND_URL`; admin-bootstrap note updated for the
  new prod boot guard.

The split is intentional: compose/deploy-only vars (`MYSQL_ROOT_PASSWORD`, `SHOP_DOMAIN`,
`ADMIN_DOMAIN`, `API_DOMAIN`) live in the **root** `.env` (read by `docker-compose.yml`);
the rest are backend runtime vars. This doc remains the canonical superset.
