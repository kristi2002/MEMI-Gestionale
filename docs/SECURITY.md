# MEMI — Security & Auth Model

> **Written:** 2026-07-10. Audience: platform owner and future maintainers.
> This document describes the security model **as it actually is in the code today**,
> including honest callouts of known gaps and a hardening backlog. Where the code and
> older docs disagree, this document reflects the code.

MEMI is a three-app platform: the **storefront** (static, nginx), the **admin panel**
(`MEMI/`, jQuery SPA), and the **backend** (`MEMI-Backend/`, Express + MySQL). All
runtime security lives in the backend and the two `nginx.conf` files. Backend and
frontends talk **same-origin** in production: nginx proxies `/api/*` to `backend:3000`,
so there is no CORS in the normal production path.

> ### ✅ Go-live hardening pass (2026-07-10) — what changed
> Two of the top gaps this document originally flagged are now **fixed** in code (see the
> sections below for the model, and `docs/GO-LIVE-PLAN-2026-07.md`):
> - **Server-side RBAC is now enforced.** `requirePermission(view)` (`src/middleware/auth.js`)
>   is wired at the admin route mounts in `src/server.js` using the *same* permission model the
>   UI uses. A staff account can no longer reach a section its permission set excludes — including
>   the returns/**Stripe-refund** endpoint (`/api/admin/resi/:id/refund` → gated to the `returns`
>   view) and `audit-log`/`bills`/`liveview` (admin-only). Verified by `test/hardening-golive.test.cjs`.
> - **Default-admin boot guard.** In production the backend now **refuses to boot** if any admin
>   still carries the shipped default password (`db/migrations.js → bootstrapAdmin`), unless
>   `ALLOW_DEFAULT_ADMIN=1`. Previously only a warning.
>
> Still on the backlog (documented, not yet built): explicit **CSRF token** (currently mitigated
> by SameSite=Lax + prod CORS + JSON content-type — see §5), **JWT revocation/blacklist**, a
> nginx **Content-Security-Policy**, and moving the customer token out of localStorage.

---

## 1. Authentication

Two entirely separate auth realms, with separate signing secrets, lifetimes, and
transport. They do not share tokens.

### 1.1 Customer authentication (storefront)

- **Mechanism:** stateless **JWT**, signed with `JWT_SECRET`.
- **Lifetime:** `JWT_EXPIRES_IN` (default **7 days**).
- **Transport:** `Authorization: Bearer <token>` header.
- **Client storage:** browser **localStorage** under key `memi_token`.
- **Password hashing:** **bcrypt** (`bcryptjs`), cost factor **10**.
- **Middleware:** `requireCustomer` (hard 401 if missing/invalid) and
  `optionalCustomer` (attaches `req.customer` if a valid token is present, else
  proceeds as guest) — both in `src/middleware/auth.js`.
- **JWT payload:** `{ id, email, nome }`. No roles; customers have no elevated access.
- **Endpoints:** `POST /api/auth/register`, `POST /api/auth/login`,
  `GET/PUT /api/auth/me`, `POST /api/auth/logout` (see §3 for what logout does — and
  does not — do).

> **localStorage vs. XSS:** because the customer token lives in localStorage and is
> sent as a Bearer header, any successful XSS on the storefront can read the token.
> This is the standard trade-off of header-based JWTs. The storefront's CSP/headers
> (§6) and input handling are the compensating controls; keeping storefront JS free of
> injection sinks is the ongoing mitigation.

### 1.2 Admin authentication (admin panel)

- **Mechanism:** stateless **JWT**, signed with a **separate** secret `JWT_ADMIN_SECRET`.
- **Lifetime:** `JWT_ADMIN_EXPIRES_IN` (default **8 hours**) — deliberately shorter
  than the customer token.
- **Transport (primary):** **HttpOnly cookie** `memi_admin_token`.
  - `HttpOnly: true` — not readable from JavaScript (mitigates token theft via XSS).
  - `SameSite: Lax`.
  - `secure` is **derived per-request** from `req.secure || x-forwarded-proto === 'https'`,
    so the cookie is `Secure` over HTTPS in production but still works over
    `http://localhost` in dev.
  - `path: /`, `maxAge: 8h` (matches the JWT lifetime).
- **Transport (fallback):** a legacy `Authorization: Bearer <token>` header path is
  **retained** in `requireAdmin` so any still-active header-based session keeps working
  during the cookie migration. The login response still returns `token` for backward
  compatibility, but the client no longer stores it.
- **Cookie parsing is hand-rolled:** `readCookie(req, name)` in `src/middleware/auth.js`
  splits the raw `Cookie` header itself — there is **no `cookie-parser` dependency**.
- **Password hashing:** bcrypt cost **10** (same as customers).
- **JWT payload:** `{ id, email, nome, role, permissions }`.
- **Endpoints:** `POST /api/admin/auth/login`, `POST /api/admin/auth/logout`
  (clears the cookie), `GET /api/admin/auth/me`, `PUT /api/admin/auth/password`
  (self-service password change, requires the current password).

---

## 2. Authorization / RBAC

Defined in `src/permissions.js` and enforced by `requireAdmin` / `requireRole()` in
`src/middleware/auth.js`.

### 2.1 Two-tier backend enforcement

| Guard | Meaning | Grants |
|-------|---------|--------|
| `requireAdmin` | Any valid admin **or** staff token | Reaches nearly all `/api/admin/*` CRUD |
| `requireRole('admin')` | Full-admin role only | Admin-only sections |

`requireRole(...roles)` must be chained **after** `requireAdmin` (it reads
`req.admin.role`) and returns **403** if the token's role is not in the allowed set.

### 2.2 Fine-grained permission presets (frontend-facing)

`permissions.js` also models a granular, view-based permission scheme:

- `resolvePermissions(role, permissionsJson)` returns the list of **admin UI views** a
  user may see:
  - an explicit non-empty `admin_users.permissions` JSON array → use it verbatim;
  - else `role === 'admin'` → `null` (full access);
  - else → `STAFF_VIEWS` (the default operational surface for legacy staff).
- **Presets:** `admin` (full/`null`), `staff` (broad ops surface), `warehouse`,
  `customer_service`, `marketing` — each a curated view list. Custom profiles are stored
  as an explicit `permissions` array on a `role='staff'` account, so no DB ENUM change is
  needed to add a profile.
- `ADMIN_ONLY` lists the sections a full admin sees by default (analytics, reports,
  liveview, finance, payouts, bills, taxes, integrations, staff, settings, audit-log) —
  it mirrors the frontend's `ADMIN_ONLY_VIEWS`.

### 2.3 ⚠️ KNOWN GAP — fine-grained permissions are NOT enforced on the backend

**This is the most important authorization caveat in the platform and is being
addressed in the go-live pass.**

The granular `permissions` array currently gates **only the admin UI (frontend)** — it
decides which menu items and views render. The **backend enforces only the coarse tier**
(`requireAdmin` vs. `requireRole('admin')`). It does **not** consult the per-view
`permissions` array when authorizing an API call.

**Consequence:** a `staff` token (or any custom profile such as `warehouse` or
`marketing`) can reach **nearly all `/api/admin/*` CRUD endpoints** regardless of the
views its profile is supposed to be limited to — because those endpoints are guarded by
`requireAdmin`, which every staff token satisfies.

**Concrete high-impact example:** `POST /api/admin/resi/:id/refund` — which issues a
**real Stripe refund** (moves money) — is guarded by `requireAdmin` only
(`src/routes/resi.js`), **not** `requireRole('admin')`. A `staff` token whose UI profile
never shows the refund button can still call this endpoint directly and trigger a live
refund. The same pattern applies to most admin CRUD (orders, discounts, gift cards,
inventory, etc.).

**Hardening direction:** enforce the resolved `permissions` list server-side (a
middleware like `requireView('returns')` per route, plus `requireRole('admin')` on
money-movement endpoints such as refunds). Tracked in the hardening backlog (§10) and
the go-live plan.

---

## 3. Session / token lifecycle & revocation limits

Both realms are **stateless JWT** — the server keeps **no session store** and there is
**no server-side token registry**.

- **Customer logout is client-side only.** `POST /api/auth/logout` simply returns
  `{ ok: true }`; the actual logout is the browser deleting `memi_token` from
  localStorage. The endpoint's own comment notes it exists "for logging / future token
  blacklist implementation."
- **No revocation / no blacklist.** A customer JWT remains valid until it **expires**
  (up to 7 days). There is no way to invalidate a specific issued token — not on logout,
  not on password change, not on suspected compromise. **This is a known limitation.**
  Changing a customer's password does **not** invalidate existing tokens.
- **Admin logout is slightly better:** `POST /api/admin/auth/logout` actively
  `clearCookie`s `memi_admin_token`, so the browser stops presenting it. But the JWT
  itself is still cryptographically valid until its 8h expiry — anyone who captured it
  (or is using the legacy Bearer fallback) could still use it until expiry. The shorter
  8h admin lifetime limits the blast radius.
- **Practical mitigations today:** short admin lifetime (8h), HttpOnly cookie (admin
  token not readable by JS). **Real revocation would require** a server-side token/version
  store or a `token_version` claim checked on each request (see §10).

---

## 4. Rate limiting

`express-rate-limit`, all windows **15 minutes**, configured in `src/server.js`.
`app.set('trust proxy', 1)` is set so limits key off the real client IP behind nginx.

| Limiter | Max / 15 min | Applies to |
|---------|--------------|------------|
| `apiLimiter` | **300** | All of `/api` (baseline) |
| `authLimiter` | **20** | `auth/login`, `auth/register`, `auth/forgot-password`, `auth/reset-password`, `admin/auth/login` |
| `checkoutLimiter` | **30** | `POST /api/orders`, `POST /api/payments/create-intent` |
| `publicWriteLimiter` | **10** | `POST /api/reviews`, `POST /api/newsletter/subscribe`, `POST /api/resi/request` |
| `codeProbeLimiter` | **30** | `/api/giftcards/validate` (throttles code enumeration) |

The uploads static handler (`/api/uploads`) is mounted **before** the limiters so image
requests are never throttled.

---

## 5. CORS & origins

Configured in `src/server.js` via the `cors` middleware.

- **Allowlist** comes from `ALLOWED_ORIGINS` (comma-separated env var).
- **Requests with no `Origin`** (server-to-server, curl, health checks) are always allowed.
- **`credentials: true`** (cookies allowed cross-origin when the origin is on the list).
- **Methods:** `GET, POST, PUT, DELETE, OPTIONS`. **Allowed headers:**
  `Content-Type, Authorization`. **Exposed:** `X-Total-Count`.

> **⚠️ Non-production allows ALL origins.** The check is:
> `if (process.env.NODE_ENV !== 'production') return cb(null, true);`
> Any origin is accepted unless `NODE_ENV` is **exactly** the string `production`.
> A deploy that forgets to set `NODE_ENV=production` (or sets it to `prod`, `Production`,
> etc.) silently runs with **wide-open CORS**. Verify `NODE_ENV=production` in prod
> (see the production checklist, §11). In production, same-origin nginx proxying means
> CORS is normally not exercised at all — but a wrong `NODE_ENV` removes the safety net.

---

## 6. HTTP security headers

### 6.1 Backend (helmet)

`src/server.js` enables **helmet** with `crossOriginResourcePolicy: { policy: 'cross-origin' }`
(so cross-origin asset/image loads are permitted). Helmet supplies its default set of
protective response headers on API responses.

### 6.2 nginx (both apps)

Both `MEMI/nginx.conf` (admin) and `Memi Abbigliamento/nginx.conf` (storefront) set the
**same** header block on both the HTML `location /` and the static-asset `location`:

| Header | Value |
|--------|-------|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |
| `X-Frame-Options` | `SAMEORIGIN` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` (all off) |

**Caching:** HTML is served `Cache-Control: no-cache, must-revalidate` (deploys show
immediately); hashed/versioned static assets (`css, js, png, jpg, svg/webp, ico, woff2`)
are `public, max-age=2592000, immutable` (**30 days**). Both apps enable `gzip`.

> **Note:** there is **no `Content-Security-Policy` header** set at the nginx layer. A CSP
> would meaningfully reduce the XSS blast radius that matters for the localStorage
> customer token (§1.1). Consider adding one (§10).

---

## 7. Input validation

`src/validation.js` — **zod** schemas applied via the `validateBody(schema)` middleware
at the highest-risk boundaries. On success it **replaces `req.body`** with the
parsed/coerced result (numeric strings become numbers, emails normalized/lowercased), so
downstream handlers get typed data. On failure it returns **400** with the first
validation message (Italian-friendly).

- **Covered endpoints:** register, login, create-order, discount (create/update),
  giftcard (create/update), payments create-intent, product (create/update), campaign
  (create/update), staff (create/update).
- **Layered, not a replacement:** zod runs **on top of** each route's existing manual
  business-rule checks (enum membership, stock availability, ownership, etc.), which
  remain inline. It catches malformed/oversized input before it reaches a query.
- **Body size:** `express.json({ limit: '2mb' })` caps request bodies.
- **SQL:** all DB access uses parameterized queries via `mysql2/promise` (`pool.execute`
  with `?` placeholders) — no string-concatenated SQL in the auth/validation path.

---

## 8. Audit logging

`src/audit.js` — `logAdminAction({ adminId, adminEmail, action, entityType, entityId, details })`
inserts a row into the `audit_log` table.

- **Best-effort by design:** a logging failure must never break the action it records;
  every call site chains `.catch(() => {})`.
- **Covered sensitive actions:** order status change / ship / delete; discount
  create-update-delete; gift-card create-update-delete; **resi (return) refund**; staff
  create-update-delete; loyalty config / point adjustments; settings update; admin
  self-service password change.
- **Records:** who (admin id + email), what (`action` verb + `entity_type`/`entity_id`),
  and a JSON `details` blob (e.g. old/new values, refund id, manual flag, amount).

> Because logging is best-effort and fire-and-forget, the audit trail is a monitoring aid,
> not a guaranteed tamper-proof ledger. It is not currently append-only or signed.

---

## 9. Payment / checkout integrity

Enforced server-side in the orders/payments routes (see also
`CLAUDE.md` Sprint 2/3 notes):

- **Server re-resolves line prices** from the `products` table at checkout — the client
  cannot dictate prices.
- **Stripe amount + currency are verified** against the server-computed total before the
  order is accepted.
- **`payment_intent_id` is UNIQUE** in the DB — a captured PaymentIntent cannot be
  replayed to create a second paid order.
- **Atomic stock decrement** via `UPDATE ... WHERE stock >= ?` → returns **409** rather
  than overselling (no negative stock, no race-condition oversell).
- **`POST /api/orders`** checks stock before accepting and rejects with 400 if a size is
  unavailable.
- **Stripe webhook** (`/api/payments/webhook`) is registered with `express.raw` **before**
  `express.json()` so the raw body is available for signature verification; a verified
  `payment_intent.succeeded` reconciles an `in_attesa` order to `pagato` and triggers the
  automatic invoice. Missing `STRIPE_WEBHOOK_SECRET` → the webhook rejects all events (503),
  and (in production) logs a loud boot warning.
- **Graceful degradation:** missing `STRIPE_SECRET_KEY` → `/api/payments/create-intent`
  returns 503 (no crash). Missing `SMTP_USER` → all emails are silent no-ops.

---

## 10. Known gaps & hardening backlog

Ordered roughly by risk. Items 1–2 are the priorities for go-live.

1. **Staff-scope not enforced on the backend (privilege escalation).** The granular
   `permissions` presets gate only the admin UI; the API enforces only `requireAdmin` /
   `requireRole('admin')`. A `staff`/`warehouse`/`marketing` token can reach nearly all
   `/api/admin/*` CRUD, **including `POST /api/admin/resi/:id/refund` (real Stripe
   refunds).** _Fix:_ add per-view server-side enforcement (e.g. `requireView('returns')`)
   and put `requireRole('admin')` on all money-movement endpoints (refunds, payouts,
   settings, staff management). **(See §2.3.)**

2. **No JWT revocation / blacklist (both realms).** Tokens stay valid until expiry;
   logout is client-side (customer) or cookie-clear only (admin). Password change does not
   invalidate existing tokens. _Fix:_ add a `token_version` claim per user checked on each
   request, or a short-lived-access + refresh-token model, or a server-side deny-list for
   emergency revocation. **(See §3.)**

3. **CSRF on the admin cookie.** The admin now authenticates via a cookie
   (`memi_admin_token`, SameSite=Lax). SameSite=Lax blocks cross-site POST from forms, but
   is not a complete CSRF defense (e.g. top-level GET navigations, and any state-changing
   GET). There is **no CSRF token** and no cookie-parser. _Fix:_ add a double-submit CSRF
   token or an `Origin`/`Fetch-Metadata` check for cookie-authenticated state-changing
   admin requests; consider `SameSite=Strict` where UX allows.

4. **Default admin credentials shipped in schema.** The schema seeds a default admin.
   _Mitigation in place:_ a red boot-time security warning when default credentials are
   active, plus `ADMIN_EMAIL` / `ADMIN_PASSWORD` env overrides to bootstrap a real admin.
   _Fix:_ force a password change on first login / refuse to boot in production with
   default creds.

5. **`NODE_ENV`-gated CORS is fail-open.** If `NODE_ENV` is anything other than exactly
   `production`, **all origins are allowed** (§5). _Fix:_ default to the restrictive
   allowlist unless explicitly in a known dev mode, and assert `NODE_ENV=production` at
   boot in prod.

6. **No Content-Security-Policy.** nginx sets HSTS/frame/nosniff/referrer/permissions but
   no CSP. A CSP is the strongest structural mitigation for the localStorage customer
   token's XSS exposure (§1.1, §6.2). _Fix:_ add a tuned CSP to both nginx configs.

7. **Customer token in localStorage.** Readable by any XSS on the storefront. _Fix (longer
   term):_ move customer auth to an HttpOnly cookie as was done for admin, or add CSP + strict
   input handling as compensating controls.

8. **Audit log is best-effort, not tamper-evident.** Fire-and-forget inserts, not
   append-only/signed. _Fix:_ if regulatory/forensic needs grow, move to an append-only or
   signed log.

9. **Hand-rolled cookie parsing.** `readCookie` is minimal and dependency-free; fine today,
   but any future cookie-handling complexity should prefer a vetted library.

---

## 11. Production checklist

Before/at go-live, confirm:

- [ ] `JWT_SECRET` and `JWT_ADMIN_SECRET` are set to strong, distinct random values
      (backend **fails fast on boot** if either is missing — by design).
- [ ] `NODE_ENV=production` (exact string) — otherwise CORS is wide open (§5) and prod
      warnings are suppressed.
- [ ] `ALLOWED_ORIGINS` lists exactly the real storefront + admin origins.
- [ ] Default admin credentials **rotated**; `ADMIN_EMAIL`/`ADMIN_PASSWORD` used to seed a
      real admin; confirm the red default-cred boot warning is **absent**.
- [ ] `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, and `STRIPE_WEBHOOK_SECRET` set (else
      checkout/webhook are disabled — loud boot warnings in prod confirm this).
- [ ] `SMTP_USER` set (else all transactional emails — order/shipping/welcome/password
      reset — are silent no-ops).
- [ ] `FRONTEND_URL` set correctly (password-reset links point at
      `FRONTEND_URL/reset-password.html?token=`).
- [ ] TLS terminated upstream; `X-Forwarded-Proto` correctly forwarded so the admin cookie
      is issued `Secure` and rate limits key off the real client IP (`trust proxy` = 1).
- [ ] nginx security headers present on both apps (verify with `curl -I`).
- [ ] Hardening backlog items 1–2 (staff-scope enforcement, token revocation) scheduled/
      resolved before exposing staff accounts to untrusted operators.
- [ ] `docker compose ... up --build` boots clean; `./smoke-test.sh` and
      `bash verify/run.sh` pass.

---

_This document is intentionally candid about gaps so the owner can make informed go-live
decisions. Trust the code over older docs where they disagree; re-grep before assuming a
gap here has since been closed._
