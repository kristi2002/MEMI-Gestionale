# 10 · Testing, Verification & Runbook

> How to verify changes, how features were validated, and how to operate/troubleshoot.

## Verification harnesses (repo root)

- **`bash verify/run.sh`** — the no-live-DB gate. Runs: JS syntax (`node --check`)
  across backend + admin, cache-version (`?v=`) consistency, ~14 route-contract
  checks, mocked order-flow simulations, gift-card + cancel/refund compensation
  simulations, zod validation-schema tests, HTML integrity (`</html>`), and a
  **backend module-load check** (catches boot-time `ReferenceError`s / bad requires).
  **Must exit 0.**
- **`./smoke-test.sh`** — full stack verification (needs the stack up). New backend
  routes should add an assertion here.
- **`./run-live.sh`** — hits an already-running stack.

## Definition of done (per change)
1. `docker compose … up --build` comes up with no backend log errors.
2. `bash verify/run.sh` exits 0.
3. New backend route → add a `smoke-test.sh` assertion **and** a row to the API
   reference ([04-api-reference.md](04-api-reference.md)).
4. Touched `app.js`/`admin-api.js`/`style.css` → keep `?v=` consistent (content-hash
   cache-bust handles the rest at build).
5. Summarise what changed, what was tested, and any assumptions.

## How features were validated this cycle (pattern to reuse)

Because a full local Docker stack was unavailable during development, each feature
was validated three ways — this is the recommended pattern:

1. **`node --check`** on every touched JS file, plus a backend module-load require.
2. **Isolated endpoint tests** — mount the new Express router in a throwaway app with
   a **mocked `pool.execute`** (and stubbed `requireAdmin`/`audit`/`email`), then hit
   it over HTTP and assert status codes, validation, response shape, and side effects.
   Example checks that shipped: expenses/segments/transfers/popups CRUD + validation;
   liveview stats; automations trigger-mapping + templated email; chat guest→admin→
   reply→poll (9 checks); carts beacon upsert + admin summary + recovery email;
   `feed/meta.csv` CSV escaping + absolute links; tax-stats OSS threshold.
3. **In-browser render checks** — a temporary preview page stubs `AdminAPI` and
   renders the view; assert DOM (rows/KPIs/buttons) + **zero console errors**.
   (These preview files are throwaway and are **not** committed.)

> Remaining gap: a single **live** production click-through was not run during
> development. Recommended release gate → run the checklist below on the deployed site.

## Post-deploy smoke checklist (on the live site)
- **Admin login** → dashboard loads; KPIs populate; no red API banner.
- **Orders** → open an order (scheda renders); change status; ship.
- **New real features** → create an **expense**, a **segment** (count updates), a
  **pop-up** (toggle), an **automation** (+ "Esegui test"); open **Tasse** (OSS YTD).
- **Chat** → shop chat bubble → send a message → appears in admin **Chat clienti** →
  reply → customer sees it.
- **Live view** → browse the shop, then check visitors/paths appear.
- **Abandoned carts** → add to cart on the shop, wait > 30 min → it appears; "Invia
  promemoria" (if SMTP configured).
- **Feed** → open `https://<shop>/api/feed/meta.csv` — valid CSV.
- **Mobile** → open admin on a phone → hamburger drawer works; all child views reachable.

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Red "API non raggiungibile" banner | Backend down or CORS. Check `GET /api/health`; ensure `ALLOWED_ORIGINS` includes the admin domain. |
| List endpoints 500 "table missing" | Schema not yet ensured — restart the backend (self-heals on boot). |
| Backend won't boot | Missing `JWT_SECRET`/`JWT_ADMIN_SECRET` (fails fast by design) or DB unreachable. |
| Emails never arrive | `SMTP_*` unset → emails are silent no-ops. Set SMTP. |
| Payments return 503 | `STRIPE_SECRET_KEY` unset. |
| Admin shows red "default credentials" warning | Set `ADMIN_EMAIL`/`ADMIN_PASSWORD` in env and redeploy. |
| Deploy didn't show new code | Hard-refresh; confirm the Docker build ran cache-bust; nginx sends `no-cache` on HTML so a normal reload should suffice. |
| Mobile looks zoomed-out / tiny | Missing `<meta name="viewport">` on that HTML page. |
| Live view / Visitatori always 0 | No storefront traffic yet, or the visitor beacon (`/api/track`) is blocked. |
| Uploaded images 404 | The `uploads_data` volume was wiped, or `/api/uploads` isn't proxied. |

## Operational tasks
- **Reset admin password**: set `ADMIN_EMAIL`/`ADMIN_PASSWORD`, redeploy (upsert on
  boot), or use **Cambia password** in the app.
- **Re-import catalog**: Prodotti → Importa CSV (`?dryRun=1` to preview) — the backend
  downloads & converts images. Re-running appends images; clear first or use
  bulk-images `mode=replace`.
- **Backups**: `deploy/backup.sh` / `deploy/restore.sh` (MySQL + uploads).
- **Prune analytics**: `page_views` auto-prunes rows > 30 days on writes.
