# MEMI — Debugging Guide

This document covers the most likely failure modes, how to diagnose them, and how to fix them. Keep it open during production incidents.

---

## Architecture in 30 seconds

```
Browser
  └─▶ Traefik (SSL termination, Hetzner/Coolify)
        ├─▶ ecommerce container  (nginx:alpine, port 80)
        │     └─▶ /api/* ──proxy──▶ backend container (Node.js, port 3000)
        ├─▶ backend container    (Node.js/Express, port 3000)
        │     └─▶ MySQL container (port 3306)
        └─▶ admin container      (nginx:alpine, port 80)
              └─▶ /api/* ──proxy──▶ backend container (Node.js, port 3000)
```

All four containers share the `memi_net` Docker bridge network. The MySQL data volume is named `mysql_data` and persists across redeploys.

---

## Symptom: Nav / header missing on a page

**Root cause A — The page doesn't load `app.js`.**

Check: open DevTools → Network → filter for `app.js`. If it's absent, the page's HTML is missing the script tag.

Every page must have near the closing `</body>`:
```html
<script src="api-client.js"></script>   <!-- or ../../api-client.js for nested pages -->
<script src="app.js?v=7"></script>      <!-- bump version number after each deploy -->
```

Depth guide:
- Root pages (`/shop`, `/about`, etc.): `src="app.js?v=7"`
- One level deep (`/look`, `/editoriali`): `src="app.js?v=7"`
- Two levels deep (`/collections/novita/`): `src="../../app.js?v=7"`

**Root cause B — `app.js` loads but throws a runtime error.**

Open DevTools → Console. If there's a red error in `app.js`, the entire `init()` function aborts before `injectHeader()` runs.

**Root cause C — `data-include="site-header"` placeholder is missing from the page.**

`injectHeader()` looks for `<div data-include="site-header"></div>`. Without it, there's nothing to replace.

**Root cause D — Browser has a stale cached version of `app.js`.**

The nginx `Cache-Control: immutable` header only applies per URL. Bumping `?v=5` to `?v=6` forces a fresh download because it's a new URL. If you change `app.js` without bumping the version, users with the old URL cached won't get the update for 30 days. **Always bump the version number in every HTML file after modifying `app.js`.**

Quick fix for testing locally: DevTools → Network → ☑️ "Disable cache" and hard-reload (Cmd/Ctrl+Shift+R).

---

## Symptom: Product cards not visible on `/shop?categoria=...`

**Root cause** — The `html.filtering` CSS class is applied in `<head>` to prevent a flash of unfiltered content. It sets `#productGrid { opacity: 0 }`. The inline filter script in `shop.html` must remove this class once filtering runs.

`shop.html`'s `applyFilters()` function removes the class at the end:
```javascript
document.documentElement.classList.remove('filtering');
```

If you see an empty/invisible grid on filtered shop URLs (`/shop?categoria=novita`, `/shop?saldi=1`), check:
1. DevTools Console for JS errors in the inline `<script>` block at the bottom of `shop.html`.
2. That `document.documentElement.classList` no longer has `filtering` after page load (Elements panel → `<html class="...">`).
3. That `applyFilters()` is called inside the `DOMContentLoaded` listener.

---

## Symptom: Products load but then disappear / show "0 results"

This happens when `applyFilters()` runs but filters out every card.

Check the `data-*` attributes on product card elements:
```html
<article class="product-card"
  data-categoria="vestiti"
  data-taglie="xs s m l"
  data-colore="avorio"
  data-prezzo="89">
```

And the active filter state in the browser console:
```javascript
// paste in console on the shop page
window._af  // not exposed — add temporarily for debugging
```

The `af` object (inside the IIFE) tracks current filters. If `af.categoria = 'novita'` but no cards have `badge-new`, all cards will be hidden.

---

## Symptom: Category filter checkboxes do nothing

**Root cause** — The `input[data-cat]` checkboxes in the filter drawer have no `change` event listeners wired up in `DOMContentLoaded`.

`shop.html` has an `af` object tracking active filters and an `applyFilters()` function, but the `DOMContentLoaded` block must explicitly add listeners to checkboxes:

```javascript
document.querySelectorAll('input[data-cat]').forEach(function(cb) {
  cb.addEventListener('change', function() {
    if (cb.checked) {
      af.categorie.push(cb.dataset.cat);
    } else {
      af.categorie = af.categorie.filter(function(c) { return c !== cb.dataset.cat; });
    }
    applyFilters();
  });
});
```

Also check the "Mostra X articoli" button — it must call `applyFilters()`, not `closeFilterDrawer()` directly. `applyFilters()` already closes the drawer internally.

**Note:** `af.categorie` is an **array** (multi-select). Cards are shown if `af.categorie` is empty (no filter) OR if their `data-categoria` appears in the array. This replaced the old `af.categoria` single-string approach. If you see old code referencing `af.categoria` (singular), update it to `af.categorie` (plural, array).

---

## Symptom: API calls return 404 or connection refused

**Step 1 — Is the backend container running?**
```bash
docker compose ps
# All four containers should show "Up" or "healthy"
```

**Step 2 — Can the ecommerce/admin container reach the backend?**
```bash
docker compose exec ecommerce wget -qO- http://backend:3000/health
# Should return: {"status":"ok","ts":"..."}
```

If this fails, the containers aren't on the same network. Verify `memi_net` in `docker-compose.yml` is declared under both `ecommerce` and `backend`.

**Step 3 — Is nginx proxying `/api/` correctly?**

The ecommerce `nginx.conf` uses a lazy DNS resolver:
```nginx
resolver 127.0.0.11 valid=10s ipv6=off;
set $backend_upstream http://backend:3000;
```

The `set $backend_upstream` trick prevents nginx from crashing at startup if `backend` isn't up yet. If the backend comes up after nginx, the first few requests may fail until the DNS TTL (10 s) passes.

**Step 4 — Check backend logs**
```bash
docker compose logs backend --tail=100
# Look for: ✅ MySQL connected / ❌ Failed to start
```

**Step 5 — Check CORS errors**

In production, the backend allows only origins listed in `ALLOWED_ORIGINS` env var (comma-separated). If the browser console shows a CORS error, add the current domain:
```
ALLOWED_ORIGINS=https://memi.testdemo.it,https://admin.memi.testdemo.it
```

Restart the backend container after changing env vars in Coolify.

---

## Symptom: Admin login fails ("Credenziali non valide")

**Check 1 — Is there an admin user in the database?**
```bash
docker compose exec mysql mysql -u memi_user -p memi_db \
  -e "SELECT email, ruolo FROM utenti WHERE ruolo='admin';"
```

If empty, the database seeding step was skipped. Run the seed script or insert manually:
```sql
INSERT INTO utenti (nome, email, password_hash, ruolo)
VALUES ('Admin', 'admin@memi.it', '$2b$10$...bcrypt_hash...', 'admin');
```

Use Node.js to generate the hash:
```bash
node -e "require('bcryptjs').hash('your_password',10).then(console.log)"
```

**Check 2 — Is `JWT_ADMIN_SECRET` set?**

The backend requires two separate secrets. Check your Coolify env vars:
- `JWT_SECRET` — for customer tokens
- `JWT_ADMIN_SECRET` — for admin tokens

If `JWT_ADMIN_SECRET` is missing, all admin logins return 500.

---

## Symptom: Stripe payment fails / checkout hangs

**Step 1 — Check STRIPE_SECRET_KEY is set on backend**
```bash
docker compose exec backend printenv STRIPE_SECRET_KEY
# Should print sk_live_... or sk_test_...
```
If empty, the `/api/payments/create-intent` endpoint returns 503 and checkout stops at "Elaborazione pagamento...".

**Step 2 — Check Stripe publishable key in checkout.html**

`checkout.html` calls `Stripe(STRIPE_PUBLISHABLE_KEY)` where the key is fetched from `/api/payments/config` or hardcoded as `data-pk` on the script tag. If wrong, Stripe.js throws `IntegrationError: Invalid API Key`.

**Step 3 — Check browser console for Stripe errors**

Stripe errors bubble up as JavaScript exceptions. Common codes:
- `card_declined` — test card rejected; use `4242 4242 4242 4242` for success
- `insufficient_funds` — use `4000 0000 0000 9995` to simulate
- `incorrect_cvc` — wrong 3-digit code

**Step 4 — PaymentIntent verification fails in backend**

If `POST /api/orders` returns 400 "Pagamento non verificato", the `payment_intent_id` sent from frontend doesn't match any Stripe PaymentIntent, or the PaymentIntent status is not `succeeded`. Check Stripe Dashboard → Payments for the intent ID.

**Step 5 — SMTP / email errors after order**

If the order is saved but the customer reports no confirmation email:
```bash
docker compose logs backend --tail=50 | grep -i email
# Look for: Email sent: <messageId> or Email error: ...
```
If `SMTP_USER` is not set, `sendOrderConfirmation()` silently skips sending — no error, no email. This is intentional for dev environments.

---

## Symptom: MySQL data lost after redeploy

The `docker-compose.yml` uses a named volume:
```yaml
volumes:
  mysql_data:
    driver: local
```

Named volumes persist across `docker compose up/down` and Coolify redeploys **as long as you don't run `docker volume rm mysql_data`** or delete the Coolify service.

To verify the volume exists on the host:
```bash
docker volume ls | grep mysql_data
```

To back up before a risky operation:
```bash
docker compose exec mysql mysqldump -u root -p memi_db > backup_$(date +%Y%m%d).sql
```

---

## Symptom: SSL certificate errors / mixed content warnings

Coolify + Traefik handle SSL automatically via Let's Encrypt. Common causes:

- **Domain not pointing to the Hetzner server** — check DNS A record for `memi.testdemo.it`.
- **Port 80 blocked** — Traefik needs port 80 open for the ACME HTTP-01 challenge.
- **Traefik labels wrong** — each service needs matching `traefik.http.routers.<name>.rule=Host(...)` labels in `docker-compose.yml`.
- **Mixed content** — if any HTML page loads assets over `http://` while the page itself is `https://`, the browser blocks them. All asset URLs must be relative (`/app.js`) or use `https://`.

---

## Versioning / deploy checklist

When you push code changes:

| Changed file | Action needed |
|---|---|
| `app.js` | Bump `?v=N` in every HTML file that loads it (56 files total: root pages, products/, collections/, editoriali/) |
| `tokens.css` / `shop.css` / `app.css` | Bump `?v=N` in every HTML file that loads it |
| `api-client.js` | Bump `?v=N` in every HTML file that loads it |
| HTML files only | No version bump needed |
| Backend `.js` files | Rebuild + redeploy `backend` service in Coolify |
| `src/email.js` | Part of backend build — rebuild + redeploy `backend` |
| `docker-compose.yml` | Rebuild + redeploy all services |
| `nginx.conf` | Rebuild + redeploy `ecommerce` or `admin` service |

**Current versions:** `app.js?v=7`, `tokens.css?v=2`, `shop.css?v=2`

After deploying, always verify in DevTools → Network that the new file version is being served (check response headers for the file).

---

## Quick health check script

Run this in the browser console on any page to verify the core systems:

```javascript
// 1. Check app.js loaded
console.log('app.js:', typeof injectHeader !== 'undefined' ? '✅' : '❌ NOT LOADED');

// 2. Check nav injected
console.log('nav:', !!document.getElementById('siteHeader') ? '✅' : '❌ MISSING');

// 3. Check API reachable
fetch('/api/products?limit=1')
  .then(r => r.ok ? console.log('API:', '✅', r.status) : console.log('API:', '❌', r.status))
  .catch(() => console.log('API:', '❌ UNREACHABLE'));

// 4. Check auth token
console.log('customer token:', !!localStorage.getItem('memi_token') ? 'present' : 'none');
console.log('admin token:', !!localStorage.getItem('memi_admin_token') ? 'present' : 'none');
```

---

## File map — what does what

| File | Purpose |
|---|---|
| `Memi Abbigliamento/app.js` | Nav injection, cart drawer, auth drawer, footer injection, all shared UI |
| `Memi Abbigliamento/api-client.js` | Thin fetch wrapper around `/api`. Exposes `window.MemiAPI` |
| `Memi Abbigliamento/shop.html` | Shop page — inline filter script handles URL params + pagination |
| `Memi Abbigliamento/shop-filters.js` | Filter drawer for `/collections/*` pages (NOT used by shop.html) |
| `Memi Abbigliamento/nginx.conf` | Nginx config — routes `/api/*` to backend, caches assets, serves static files |
| `MEMI-Backend/src/server.js` | Express entry point — mounts all route modules |
| `MEMI-Backend/src/db/index.js` | MySQL connection pool (mysql2/promise) |
| `MEMI-Backend/src/db/init.js` | Creates tables + seeds if not present |
| `MEMI-Backend/src/middleware/auth.js` | JWT verification middleware |
| `MEMI-Backend/src/routes/auth.js` | Customer register/login/profile |
| `MEMI-Backend/src/routes/admin-auth.js` | Admin login/profile |
| `MEMI-Backend/src/routes/products.js` | Product CRUD |
| `MEMI-Backend/src/routes/orders.js` | Orders (place with Stripe verify + inventory deduct + email, admin manage) |
| `MEMI-Backend/src/routes/payments.js` | POST /api/payments/create-intent — Stripe PaymentIntent creation |
| `MEMI-Backend/src/email.js` | sendOrderConfirmation() — nodemailer, silent no-op if SMTP_USER unset |
| `MEMI/js/admin-api.js` | Admin jQuery API client — exposes `window.AdminAPI` |
| `MEMI/js/app.js` | Admin SPA — views, routing, event handling, real data via _origRenderView pattern |
| `docker-compose.yml` | Defines all 4 services + `mysql_data` volume + `memi_net` network + Stripe/SMTP env vars |
