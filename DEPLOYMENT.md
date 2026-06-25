# MEMI — Deployment Guide (Coolify on Hetzner)

## Architecture overview

```
Internet
   │
   ▼
Hetzner VPS (Coolify + Traefik)
   │
   ├─ api.memi.it  ──▶  MEMI-Backend  (Node.js :3000)
   │                          │
   ├─ memi.it       ──▶  E-commerce   (nginx :80)
   │                          │
   └─ admin.memi.it ──▶  Admin panel  (nginx :80)
                               │
                        MySQL 8 (internal, port 3306)
```

All three apps live on the same server. Coolify manages TLS (Let's Encrypt) via Traefik. MySQL is only reachable internally — never exposed to the internet in production.

---

## 1. Prerequisites

- Hetzner VPS (CX21 or higher — 2 vCPU / 4 GB RAM is comfortable)
- Coolify installed on the VPS (see https://coolify.io/docs/installation)
- A domain (e.g. `memi.it`) with DNS managed via your registrar
- GitHub account (or any git host) with push access to this repo

---

## 2. DNS setup

Add these A records pointing to your Hetzner server IP:

| Record         | Type | Value          |
|----------------|------|----------------|
| `memi.it`      | A    | `<server-ip>`  |
| `www.memi.it`  | A    | `<server-ip>`  |
| `api.memi.it`  | A    | `<server-ip>`  |
| `admin.memi.it`| A    | `<server-ip>`  |

DNS changes can take up to 24 hours but usually propagate in minutes.

---

## 3. Prepare environment variables

On your server (or in Coolify's env UI), set these secrets:

```bash
# Generate secrets with:
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

| Variable              | Description                                     |
|-----------------------|-------------------------------------------------|
| `MYSQL_ROOT_PASSWORD` | MySQL root password (strong, keep safe)         |
| `DB_USER`             | `memi_user`                                     |
| `DB_PASSWORD`         | MySQL user password (strong)                    |
| `DB_NAME`             | `memi_db`                                       |
| `JWT_SECRET`          | 64-char hex secret for customer JWTs            |
| `JWT_ADMIN_SECRET`    | 64-char hex secret for admin JWTs (different!)  |
| `ALLOWED_ORIGINS`     | `https://memi.it,https://admin.memi.it`         |
| `STRIPE_SECRET_KEY`   | Stripe secret key — `sk_live_...` for prod, `sk_test_...` for staging |
| `STRIPE_PUBLISHABLE_KEY` | Stripe publishable key — `pk_live_...` or `pk_test_...` |
| `SMTP_HOST`           | SMTP server (e.g. `smtp.gmail.com`, `smtp.sendgrid.net`) |
| `SMTP_PORT`           | `587` (STARTTLS) or `465` (SSL)                 |
| `SMTP_SECURE`         | `true` if port 465, `false` if port 587         |
| `SMTP_USER`           | SMTP username / email address                   |
| `SMTP_PASS`           | SMTP password or app-specific password          |
| `SMTP_FROM`           | Sender name + address, e.g. `"Memi Abbigliamento <info@memi.it>"` |

**Note on optional vars:** If `STRIPE_SECRET_KEY` is not set, `/api/payments/create-intent` returns 503 (checkout won't work but site won't crash). If `SMTP_USER` is not set, order confirmation emails are silently skipped (orders still save correctly).

---

## 4. Deploy with Docker Compose on Coolify

### Option A — Single docker-compose deployment (recommended)

1. In Coolify: **New Resource → Docker Compose**
2. Point it at your repository (GitHub, GitLab, or Gitea)
3. Set **Compose file path** to `docker-compose.yml`
4. Add all environment variables from step 3 in Coolify's **Environment Variables** tab
5. Set the **domains** for each service:
   - `backend`   → `api.memi.it`
   - `ecommerce` → `memi.it`, `www.memi.it`
   - `admin`     → `admin.memi.it`
6. Click **Deploy**

Coolify will:
- Build all three Docker images
- Start MySQL first (health-checked)
- Run `schema.sql` automatically on first MySQL start
- Start backend (waits for MySQL healthy)
- Start both nginx static frontends
- Provision Let's Encrypt certs automatically

### Option B — Three separate Coolify resources

Deploy each service as its own resource if you prefer independent redeploy:

1. **MySQL** → New Resource → Database → MySQL 8
   - Name: `memi-mysql`
   - Set `DB_NAME`, `DB_USER`, `DB_PASSWORD`
   - After creation: connect via Coolify's terminal and run:
     ```bash
     mysql -u root -p memi_db < /path/to/schema.sql
     ```

2. **Backend** → New Resource → Application → Dockerfile
   - Dockerfile path: `MEMI-Backend/Dockerfile`
   - Port: `3000`
   - Domain: `api.memi.it`
   - Add all env vars; set `DB_HOST` to the internal hostname Coolify assigns MySQL

3. **E-commerce** → New Resource → Application → Dockerfile
   - Dockerfile path: `Memi Abbigliamento/Dockerfile`
   - Port: `80`
   - Domain: `memi.it`, `www.memi.it`
   - **Important**: Set the API URL in nginx or via a build arg (see §6)

4. **Admin** → New Resource → Application → Dockerfile
   - Dockerfile path: `MEMI/Dockerfile`
   - Port: `80`
   - Domain: `admin.memi.it`
   - **Important**: Set the API URL (see §6)

---

## 5. First-run: seed & verify

After the first deploy, verify everything is connected:

```bash
# Health check the API
curl https://api.memi.it/health
# Expected: {"status":"ok","ts":"..."}

# Test products endpoint
curl https://api.memi.it/api/products | python3 -m json.tool | head -30
# Expected: JSON array of 23 products

# Test admin login
curl -X POST https://api.memi.it/api/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@memi.it","password":"memi2026admin"}'
# Expected: {"token":"...","admin":{...}}
```

**Change the default admin password immediately** after first login:
```sql
-- Connect to MySQL via Coolify terminal
UPDATE admin_users
SET password_hash = '$2b$10$...'   -- bcrypt hash of your new password
WHERE email = 'admin@memi.it';
```
Or use the Coolify terminal to run:
```bash
node -e "require('bcryptjs').hash('your_new_password', 10, (e,h)=>console.log(h))"
```

---

## 6. Wiring the frontend API URL

The e-commerce and admin panel need to know the API base URL. There are two approaches:

### Approach A — nginx proxy_pass (simplest, no CORS)

Add to the e-commerce nginx.conf:
```nginx
location /api/ {
    proxy_pass http://backend:3000/api/;
    proxy_set_header Host $host;
}
```
With this, both `memi.it/api/*` and `admin.memi.it/api/*` proxy to the backend. The frontend scripts use `/api` (same origin), so CORS is never an issue.

This is the **recommended setup** and is already configured in the nginx.conf files.

### Approach B — Separate API subdomain

Set `<meta name="memi-api" content="https://api.memi.it/api">` in each HTML file's `<head>`. The `api-client.js` and `admin-api.js` read this tag automatically.

---

## 7. Update the nginx.conf files for API proxy (Approach A)

Update `Memi Abbigliamento/nginx.conf` and `MEMI/nginx.conf` to add the proxy block:

```nginx
# Add inside the server {} block:
location /api/ {
    proxy_pass http://backend:3000/api/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_read_timeout 30s;
}
```

---

## 8. Auto-deploy on push

In each Coolify resource → **Settings → Webhooks**, enable "Deploy on push". Coolify adds a webhook to your GitHub repo so every push to `main` triggers a rebuild and redeploy automatically.

---

## 9. Backups

MySQL data is stored in the `mysql_data` Docker volume. Set up automated backups:

```bash
# Daily backup cron (run on the Hetzner server)
0 3 * * * docker exec $(docker ps -qf name=mysql) \
  mysqldump -u root -p${MYSQL_ROOT_PASSWORD} memi_db \
  | gzip > /backups/memi_$(date +%Y%m%d).sql.gz

# Keep last 30 days
find /backups -name "memi_*.sql.gz" -mtime +30 -delete
```

---

## 10. Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Backend won't start | MySQL not ready | Wait for MySQL healthcheck to pass |
| 401 on admin login | Wrong credentials or token expired | Re-login; check JWT_ADMIN_SECRET is set |
| CORS errors in browser | ALLOWED_ORIGINS missing frontend domain | Add domain to `ALLOWED_ORIGINS` env var |
| Products not loading | DB not seeded | Run schema.sql manually via Coolify terminal |
| "Token admin mancante" | admin-api.js loaded after app.js | Verify script order in dashboard.html |
| Checkout submits but no order | API unreachable from frontend | Check nginx proxy_pass block or CORS config |
| Checkout shows "Servizio pagamenti non disponibile" | `STRIPE_SECRET_KEY` not set | Add Stripe env vars in Coolify |
| Order saved but no confirmation email | `SMTP_USER` not set or SMTP error | Check backend logs: `docker compose logs backend \| grep -i email`; add SMTP env vars |
| Stripe card error in browser | Wrong `STRIPE_PUBLISHABLE_KEY` | Verify pk_ key matches sk_ key environment (test vs live) |
| List endpoints return 500 (settings/reviews/newsletter/resi/invoices/products) | DB initialized with an older schema — tables missing (the `initdb.d` schema only runs on a fresh volume) | **Restart the backend** — `db/migrations.js → ensureSchema()` auto-creates missing tables on boot. Watch for `Core schema ensured` in logs. |
| Backend exits immediately on boot | `JWT_SECRET` or `JWT_ADMIN_SECRET` not set | Set both in Coolify env; the startup guard fails fast by design. |
| Admin code/UI changes not showing after deploy | Browser cached `app.js` (nginx serves JS `immutable`) | Bump the `?v=N` query on the script tags (admin: `dashboard.html`; storefront: bulk across pages) and hard-refresh. |

> **Phase 4 note — DB self-heal:** the backend now applies `schema.sql`'s
> `CREATE TABLE IF NOT EXISTS` statements (structural only, seeds skipped) on every
> startup via `ensureSchema()`, plus ensures the Phase-4 feature tables. A drifted
> production database is repaired automatically on the next backend restart — no
> manual `schema.sql` run needed. First-time **seed data** still comes from the
> `initdb.d` mount (fresh volume) or `npm run db:init`.
>
> For running the whole stack locally, see **LOCAL-RUN.md**.
