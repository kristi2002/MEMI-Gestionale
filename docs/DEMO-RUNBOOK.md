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
14. Resize the window → **admin is mobile-responsive** (bottom nav under 600px).

### Act 3 — Close the loop (back to storefront)
15. Storefront → **Account** → the order now shows a **tracking badge** because admin shipped it.

That arc proves the complete real system. End there.

---

## ⛔ DANGER ZONE — do NOT click / do NOT promise

**Admin tabs that are mock or empty** (will look unfinished):
- Marketing / Newsletter (mock), Chat / Messaggi (mock), Analytics (static SVG, fake),
  Finanza, CMS, Canali (not implemented). **Stay out of these.**

**Storefront pages with stale hardcoded counts** (numbers won't match the real catalog):
- The 15 static `/collections/{slug}/` pages, `best-seller.html`, `estate-2025.html`,
  the pre-rendered `products/{slug}/` pages. **Drive everything through `/shop?categoria=…`**
  instead. If a sharp client clicks a collection and sees "9 articoli" that doesn't match,
  it's an awkward moment. Avoid the mixed-link paths (some "vedi tutto"/footer links still
  point at static `/collections/`).

**Things that don't exist yet — don't promise them on screen:**
- Guest order tracking (no `order-tracking.html`), returns (`returns.html`), product reviews.
- Live product image upload: your docs disagree on whether it works (GAPS says no, DEPLOYMENT
  Phase 6 says yes). **Verify tonight** (overnight prompt step 3). If unconfirmed, don't add a
  product live — demo the seeded catalog.

If asked about any of the above: *"that's on the roadmap for the next sprint"* — true, it's in
your gap doc — and move on. Don't improvise it live.

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
