# MEMI — Changelog & Roadmap
*Consolidated record. Replaces AUDIT-AND-PLAN.md, CHANGES-DEPLOY-READY.md, CHANGES-DESIGN-SEO.md,
and ADMIN-REACT-MIGRATION-PLAN.md (safe to delete those four once this is committed).*

Three parts: **(1)** the deploy-readiness sprint (backend/connection/security), **(2)** the
design & SEO sprint (storefront), **(3)** the admin → React roadmap. Verify backend work with
`bash verify/run.sh`. Nothing was pushed/deployed by the agent — review, then commit/deploy.

---

# Part 1 — Deploy-readiness sprint (Luglio 2026)

Goal: make the platform correct and deployable on Hetzner/Coolify without new features. The backend
(Node/Express + MySQL 8) was already solid; the fixes closed real correctness, connection, and
security gaps. **Verification:** `bash verify/run.sh` = 36/36 JS syntax, cache-version consistency,
14/14 route-contract + lifecycle invariants, 6/6 order-flow simulations (mock DB + mock Stripe).
`run-live.sh` hits a running stack.

## Backend — correctness & security (`MEMI-Backend/`)
1. **Paid orders now mark `payment_status='pagato'`** after a *verified, succeeded* Stripe
   PaymentIntent. Previously they stayed `in_attesa`, and since every dashboard/finance/top-product
   query filters `pagato`, **the admin dashboard showed ~zero revenue** — this was the #1 "admin is
   broken" symptom. (`routes/orders.js`)
2. **No more price trust.** Checkout re-resolves every line item's price/name from the `products`
   table (draft/unknown products rejected), and the Stripe amount + currency must equal the
   server-computed total or the order is refused (402). A client can no longer pay €1 for a €500
   order. (`routes/orders.js`)
3. **PaymentIntent replay protection.** Added `orders.payment_intent_id` (`UNIQUE`); a reused
   intent → 409. (`schema.sql` + `db/migrations.js`)
4. **Input validation → 4xx not 500:** order create (qty/product_id/payment_method), order-status
   enum, admin-order enums, `PUT /auth/me` null fields, `PUT /discounts/:id` enums.
5. **One invoice per order:** `UNIQUE(order_id)` on `invoices` so the dedupe fires.
6. **Admin credential safety:** `bootstrapAdmin` upserts an admin from `ADMIN_EMAIL`/`ADMIN_PASSWORD`
   at boot and logs a red `🔴 SECURITY` warning if the shipped default (`memi2026admin`) is still
   active. `docker-compose.yml` passes these vars.
7. Loyalty ledger rows now link to their order (`awardPurchasePoints(..., orderId)`).

## Storefront ↔ backend connection (`Memi Abbigliamento/`)
8. **Fixed three broken `api-client.js` paths** — order history `/orders` → `/orders/my`, reviews
   `/reviews?product_id=` → `/reviews/product/:id`, returns `/resi` → `/resi/request`. These had
   silently broken the account order history, PDP reviews, and returns.
9. **Checkout money correctness:** rebuild the PaymentIntent whenever a discount changes the total
   (no stale/pre-discount charge); the DEMO-cart fallback and the unpaid-order fallback are now
   local-dev only (no phantom/unpaid orders in prod).
10. Quick-add / wishlist use the card's real `data-id` (not a slugified name).
11. Cache alignment: `app.js?v=11`, `api-client.js?v=3` across all storefront HTML.

## Admin panel (`MEMI/`)
12. "Invia tracking al cliente" button now renders (`openModal` gained an optional footer arg).
13. Removed duplicate `renderView` branches — analytics refetches, CMS/blog loading states correct.
14. "Nuovo reso" loads orders on demand (works on direct navigation/refresh).
15. `statusLabel` completed for all resi/invoice/review enums (no more raw codes).
16. Admin cache: `dashboard.html` → `app.js?v=22`, `admin-api.js?v=15`.

## Deploy hardening
`docker-compose.yml` was already solid (restart policies, health-gated startup, `mysql_data` +
`uploads_data` volumes, Traefik TLS). Added the admin bootstrap vars; `MEMI-Backend/.env.example`
now documents that `ADMIN_EMAIL`/`ADMIN_PASSWORD` are read at startup. **Go-live checklist:** strong
`JWT_SECRET`/`JWT_ADMIN_SECRET`, `DB_PASSWORD`, `MYSQL_ROOT_PASSWORD`; set `ADMIN_EMAIL` +
`ADMIN_PASSWORD`; real `STRIPE_*` and `SMTP_*`; `ALLOWED_ORIGINS`/domains; confirm no red
default-admin warning in the boot log.

---

# Part 2 — Design & SEO sprint (Luglio 2026, storefront)

## Footer
Removed a duplicated `.sf2-inner` rule in `app.js` (the second copy zeroed the top padding, gluing
the columns to the trust strip). Now `padding: 3.25rem 2rem 3.5rem`.

## Editoriali pages (light redesign)
The three editorial pages dropped the near-black `#0e0b09` background for warm off-white sections
(`#FBF9F5`), espresso/brown text, a viola-tinted pull-quote (`--lavender-light`), white pagination
with `--beige` dividers, and a softened photographic-hero veil — keeping the exact photo-spread
layout. Two bugs fixed along the way:
- **`.ed-shop-btn` padding** used the undefined `--space-7` token → an invalid `padding` declaration
  → a cramped, zero-padding button. Replaced with `2rem` inline and **added `--space-7: 1.75rem` to
  `tokens.css`** so the gap can't bite elsewhere.
- **Nav-icon "circles"** appeared only on these pages because their CSS reset covered `*`, `html`,
  `body`, `img`, `a` but **not `button`** — so the header's `<button>` icons kept the browser's
  default border. Added `button { border:none; background:none; cursor:pointer; font-family:inherit }`.

## SEO (production-ready)
- Homepage: kept the existing title/description/OG/Twitter/canonical/`ClothingStore` JSON-LD; added
  `og:locale`, `og:image` dimensions, `robots` (`max-image-preview:large`), `theme-color`,
  `apple-touch-icon`, and a **`WebSite` + `SearchAction`** schema (Google sitelinks search box).
- `product.html`: after the product loads, injects dynamic **`Product` + `Offer` JSON-LD** (name,
  sku, brand, EUR price, in/out-of-stock) plus per-product title, description, canonical, and OG/
  Twitter — making product pages eligible for rich results.
- New **`robots.txt`** (blocks checkout/account/api + thin search variants, links the sitemap) and
  **`sitemap.xml`** (home, shop, 15 collections, 23 products, 3 editorials, content pages).
- Domain used throughout: `https://memiabbigliamento.it` — change everywhere (homepage,
  `product.html` `injectSeo` base, `robots.txt`, `sitemap.xml`) if the final host differs.
- After deploy: submit `https://memiabbigliamento.it/sitemap.xml` in Google Search Console.

## Admin — hid the "ghost" features
Commented out (reversible) the non-functional sidebar items in `dashboard.html`: **Chat clienti,
Marketing→Automazioni/Pop-up, Analytics→Report/Live view, Content→Menu, Finance→Fatture & Spese,
Customers→Segmenti.** The working sections (Ordini, Prodotti, Clienti, Sconti, Spedizioni, real
Finance, Loyalty, Reviews, Campagne, Newsletter, CMS…) stay. Restore any one by uncommenting once
its backend exists.

## Cache-busting — solved permanently
Added `Memi Abbigliamento/scripts/cache-bust.js` (content-hashes `app.js`/`tokens.css`/etc. and
rewrites every `?v=…` across all HTML) and wired it into a **multi-stage `Dockerfile`** (Node build
stage runs it, nginx serves), with a `|| echo` fallback so it can't break the build; `.dockerignore`
re-includes the script. **Result: you never bump `?v=N` by hand again** — each build re-hashes
changed assets automatically. (This supersedes the manual `app.js?v=11 → v=12` step.)

## Real product images
The shop grid and PDP already rendered real `/api/uploads` WebP photos; wired the remaining
surfaces — **search results page, search dropdown, cart drawer, wishlist drawer** — to show real
images (looked up from the search catalog by product id), falling back to the pastel placeholder
when a product has no uploaded photo. Also fixed the search dropdown to link to `/product?id=`
(canonical) instead of the redirect stub. *Last mile is content:* upload real photos per product in
the admin so they appear everywhere.

---

# Part 3 — Admin → React migration (roadmap, not yet done)

Replace the ~2,180-line jQuery admin (`MEMI/`) with a maintainable React app; **keep the
Express/MySQL backend untouched** (same `/api`). Do it in your VS Code, one slice at a time.

- **Stack:** Vite + React + TypeScript + **TanStack Query** + React Router + Zustand (UI-only state)
  + shadcn/ui. Not Next.js — the admin is a private dashboard with no SEO need, and Vite emits
  content-hashed filenames (kills cache-busting for free). TanStack Query *replaces the entire
  `_origRenderView` override* (declarative fetch/cache/loading/empty/error + refetch-after-mutation).
- **Phase order:** (1) scaffold + auth + layout; (2) **Orders** vertical slice end-to-end (proves
  API layer, tables, modals, mutations — add Vitest tests here); (3) Products + image upload against
  the existing sharp pipeline; (4) Customers/Discounts/Shipping; (5) Dashboard/KPIs/Loyalty/Settings/
  Staff/Invoices/Resi; (6) cutover `admin.…` to the React build, retire `MEMI/`.
- **Don't rebuild the ghost sections.** Reintroduce a view only once its backend API exists.
- **Storefront:** Next.js is a reasonable later move there (SSR helps the client-rendered product
  pages), but it's lower priority than the admin. The cheap cache-bust step above already removes
  the storefront's main maintenance pain without a rewrite.
- **Effort:** a few weeks incremental (Phase 1 ~1–2 days, Phase 2 ~2–3 days, others ~1–2 days each);
  the old admin keeps working throughout.

---

## Standing reminders
- **Deploy = commit + redeploy.** With the cache-bust build step, no manual `?v=N` bumps.
- **Run `node --check "Memi Abbigliamento/app.js"`** on your machine after pulling (the sandbox's
  file-sync truncates large files, so JS checks are unreliable there — not a code issue).
- **Don't run `docker compose down -v`** against production (destroys the DB + uploads volumes).
