# MEMI — Client Demo Runbook
**Meeting: tomorrow 11:00. Goal: stabilize & rehearse the happy path. Do NOT add features.**

---

## TL;DR strategy
Your strongest asset is the **full order loop**, and it's all real:
customer orders → Stripe charges → DB saves → inventory deducts → admin sees it →
admin ships → email + tracking → customer sees tracking. Build the demo around that.
Avoid every mock/static/missing area (see Danger Zone). Rehearse once tonight, record a
backup video, walk in with the stack already running.

---

## TONIGHT (in order)

- [ ] **1. Clean boot.** Wipes data and rebuilds seed (23 products + admin account):
  ```bash
  docker compose down -v
  docker compose -f docker-compose.yml -f docker-compose.local.yml up --build
  ```
  Wait for logs: `MEMI API running on port 3000` and `Core schema ensured`. No errors.

- [ ] **2. Run the smoke test, get it green:**
  ```bash
  chmod +x smoke-test.sh && ./smoke-test.sh
  ```
  If anything is red, fix it (or use the overnight prompt below).

- [ ] **3. Set Stripe TEST keys** so live checkout actually completes on screen.
  In your `.env` (NOT live keys — you don't want a real charge in a demo):
  ```
  STRIPE_SECRET_KEY=sk_test_...
  STRIPE_PUBLISHABLE_KEY=pk_test_...
  ```
  Without these, checkout shows "Servizio pagamenti non disponibile". Test card at demo time:
  **4242 4242 4242 4242**, any future expiry, any CVC, any ZIP.

- [ ] **4. (Optional but great) Set SMTP** so a real confirmation email lands during the
  demo. If you skip it, orders still save fine — just don't promise email on screen.

- [ ] **5. Walk the ENTIRE demo path yourself, once, end to end** (see script below).
  Whatever breaks or looks off, fix it or route around it tonight. This rehearsal is
  the single most valuable thing you'll do.

- [ ] **6. Record a backup screen capture** of the full happy path. If wifi/Docker/anything
  dies at 11:00, you play the video and narrate. Pros always have this.

- [ ] **7. If you touched `app.js`:** bump `?v=N` everywhere it's referenced, hard-refresh.

---

## THE DEMO SCRIPT (the route to walk)

### Act 1 — Storefront, the customer experience (localhost:8080)
1. **Home** — show "Nuovi Arrivi" (it's dynamic, pulled live from the API) + the mega-menu.
2. **Shop** via the *Shop* mega-menu → lands on `/shop?categoria=…` — **dynamic, real counts.**
   Demo the multi-select filters, the grid/list view toggle, pagination.
3. **Open a product** (dynamic detail page) — pick size, add to cart.
4. **Search** — type a query, show live results.
5. **Cart → Checkout.**
6. **Register a new account live** (or log in) — shows real auth.
7. **Pay with Stripe test card 4242…** → payment succeeds → order confirmation.
8. *(if SMTP set)* glance at the inbox — confirmation email arrives.

### Act 2 — Admin, the business side (localhost:8081, `admin@memi.it` / `memi2026admin`)
9. **Dashboard** — real KPIs + recent orders. Point out: *"the order I just placed is already here."*
10. **Orders** → open that order → **mark as Shipped** → *(email fires if SMTP)* tracking attached.
11. **Products / Inventory** — show the **stock was deducted** by that purchase. (This lands well.)
12. **Customers** — the customer you just registered is here (VIP flag if spend > €300).
13. **Discounts** and **Shipping → Zones / Couriers** — all real data.
14. Resize the window → **admin is mobile-responsive** (off-canvas drawer nav ≤900px; hamburger toggles `.sidebar.mobile-open`).

### Act 3 — Close the loop (back to storefront)
15. Storefront → **Account** → the order now shows a **tracking badge** because admin shipped it.

That arc proves the complete real system. End there.

---

## ⛔ DANGER ZONE — do NOT click / do NOT promise

> **Corrected 2026-07-10.** The old danger list was stale — chat, newsletter, analytics
> (live view), abandoned carts, pop-ups, automations, guest order tracking, returns, product
> reviews and product image upload are all **real and working** now. The genuinely-incomplete
> surfaces are much narrower:

**Not integrated — will dead-end (avoid on screen):**
- **PayPal / Klarna at checkout** — the tabs/buttons show but aren't wired (scaffolding in
  progress). Demo card payment (Stripe) only.
- **POS / Apps store / Social auto-sync** — config-only shells: you can enter keys but nothing
  syncs to a third party. Don't promise a live Mailchimp/Meta push.
- **Analytics → "Fonti traffico"** — placeholder pending a GA key. The **Live View** visitor
  feed IS real (self-hosted beacons); show that instead.

**Card checkout prerequisite:** `checkout.html` needs `<meta name="stripe-pk">` present (or the
go-live fix that reads `GET /api/payments/config`) — without a publishable key the card form is
disabled. Set Stripe TEST keys (step 3) before demoing checkout.

**Catalog-count nuance (mostly self-correcting):** the 15 `/collections/{slug}/` pages and the
23 pre-rendered `products/{slug}/` pages bake a count/price at build time that JS re-hydrates
from the live API on load — a fast client could see a flash of a stale number before JS runs.
Driving through `/shop?categoria=…` (the primary nav path) avoids it entirely.

If asked about the not-integrated items: *"that's the next integration step — it needs your
merchant/analytics accounts"* — true — and move on. Don't improvise it live.

---

## MORNING OF (T-30 min)
- [ ] Boot the stack **early** — don't `up --build` in front of the client. Have it running.
- [ ] One silent dry-run of the full path. Leave it on the home page.
- [ ] Confirm Stripe test mode works (one test checkout), then `down -v && up` for a clean slate,
      or just leave the dry-run order in (it makes the dashboard look alive — your call).
- [ ] Backup video open in a tab. Phone hotspot ready in case wifi dies.
- [ ] Browser zoom/font readable from across a table. Close noisy tabs/notifications.

---

## TROUBLESHOOTING QUICK-REF (from DEPLOYMENT.md)
| Symptom | Fix |
|---|---|
| Checkout: "Servizio pagamenti non disponibile" | `STRIPE_SECRET_KEY` not set |
| Stripe card error in browser | `pk_` and `sk_` keys mismatched (test vs live) |
| Products not loading | DB not seeded → `docker compose down -v` then up |
| A list endpoint 500s (table missing) | Restart backend — `ensureSchema()` self-heals on boot |
| Admin code/UI change not showing | Bump `?v=N`, hard-refresh (nginx serves JS immutable) |
| "Token admin mancante" | `admin-api.js` must load before `app.js` in dashboard.html |
| Backend exits on boot | `JWT_SECRET` / `JWT_ADMIN_SECRET` not set (compose has dev defaults) |
| Order saved, no email | `SMTP_USER` not set — orders still save; just don't show inbox |

---

## SECURITY NOTE
If this demo is on a public staging domain, the default admin password (`memi2026admin`)
is publicly documented. Fine for a controlled demo; **change it before anyone else has the URL.**
