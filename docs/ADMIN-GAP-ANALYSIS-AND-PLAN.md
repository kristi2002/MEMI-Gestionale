# Admin Panel — Gap Analysis & Phased Plan (Deployment-ready)

> Scope: the **admin/gestionale** app (`MEMI/`). Goal stated by the owner: a
> full-fledged, mobile-usable platform, ready to auto-deploy on Hetzner via Coolify.
> Companion to [ADMIN-PANEL.md](ADMIN-PANEL.md) (current state).

## A. Gaps, ranked by impact

### P0 — blocks "usable on a phone" and "looks finished"
1. **Mobile nav is broken** — child views unreachable at ≤600px. The single most
   visible defect. Fix: off-canvas drawer sidebar toggled by the hamburger, with a
   backdrop, keeping the full nav tree (parents + children) reachable.
2. **Cramped modals** — 43 flows through one 560px modal. On phones they overflow;
   detail views are unreadable. Fix: (a) responsive modal system (full-screen sheet
   on mobile, size variants on desktop), and (b) promote the 3 heaviest *detail*
   flows (order, customer, product) to full-page "schede" (detail pages) using a
   reusable pattern, leaving light create/edit as (larger) modals.
3. **Responsive layout holes** — page headers, KPI grids, table tools, forms need
   phone breakpoints; wide tables need graceful horizontal scroll with sticky first
   column feel.

### P1 — correctness / production hardening
4. **Auth 401 redirect disabled** (dev bypass in `admin-api.js`). Re-enable so an
   expired session returns to login instead of silently failing every call.
5. **Logged-in identity** — sidebar/topbar show hardcoded `Admin / admin@memi.it`.
   Wire to `/admin/auth/me` so the real name/email/role show and role permissions
   apply on first paint.
6. **Ghost views** — decide per view: (keep hidden) vs (build minimal real backing)
   vs (remove). At minimum, every *reachable* nav item must not look broken/empty
   without explanation.

### P2 — polish / completeness
7. **Files** page should use the real upload pipeline or be clearly labeled "by URL".
8. **Display-only** numbers (OSS threshold used YTD, store speed score) should be
   real or removed.
9. **Empty states** — consistent, friendly, actionable across all views.
10. **Keyboard/focus/ESC** handling on modals & drawer; a11y basics.

## B. Design decisions (locked for this pass)

- **Non-destructive edits.** Per the repo operational rule, existing large files
  (`app.js`, `style.css`) are changed by **appends** where possible (new CSS blocks
  override earlier rules; a trailing IIFE adds behavior) and surgical, verified edits
  otherwise. Every JS change is validated with `node --check` + byte-count before
  moving on. New files use `Write`.
- **No framework churn.** Stay jQuery + string-render + `VIEWS`/`renderView`. The
  detail-page pattern is a new `VIEWS.*-detail` renderer + a route, not a rewrite.
- **Mobile-first CSS**, added as a dedicated appended section so nothing existing is
  deleted (lower regression risk on a 500-line shared stylesheet).

## C. Phased plan

### Phase 1 — Documentation ✅ (this + ADMIN-PANEL.md)

### Phase 2 — Mobile navigation (P0-1)
- Off-canvas drawer: `.app.nav-open .sidebar` slides in; `#mobileMenu` toggles it;
  a backdrop closes it; picking a nav item closes it. Full nav tree preserved.
- Remove the broken bottom-bar behavior in favor of the drawer at ≤820px.
- Verify at 375px that every child view is reachable.

### Phase 3 — Responsive + modal system (P0-2, P0-3)
- Modal: size variants (`.modal.lg`/`.xl`), **full-screen sheet on mobile**, sticky
  header/footer, scroll body, ESC/backdrop close, focus trap-lite.
- Responsive: page-head stacks, KPI grids collapse, `.table-tools` wrap, forms go
  single-column, tables scroll cleanly, cards padding.

### Phase 4 — Detail pages ("schede") (P0-2b)
- Reusable full-page detail scaffold (`detailPage(title, sub, backView, bodyHtml)`).
- **Order detail** (`order-detail`): summary, line items, customer, payment,
  timeline, actions (status/ship/tracking/cancel) — replaces the cramped order modal.
- **Customer detail** (`customer-detail`): profile, stats, orders, loyalty, actions.
- **Product detail** (`product-detail`): gallery, variants/stock, meta, actions.
- Keep the modal versions as fallback; wire row clicks to the detail routes.

### Phase 5 — Logic audit & fixes (P1-4/5/6, P2)
- Re-enable 401 redirect (guarded so it doesn't fire during the intended dev flow).
- Wire real admin identity from `/admin/auth/me`.
- Sweep every reachable view; fix broken buttons; make ghost/empty views honest
  (label placeholders, hide truly-dead nav).

### Phase 6 — Test, deploy-verify, docs, ship
- `bash verify/run.sh` green; `node --check` on JS; browser preview at 375 / 768 /
  1280 with click-through of primary buttons.
- Confirm `MEMI/Dockerfile`, `nginx.conf`, compose `admin` service, cache-bust.
- Update this doc + ADMIN-PANEL.md + CLAUDE.md notes; commit & push `main`.

## D. Explicitly out of scope for this pass (tracked, not done)
- Building real backends for ghost views (segments, automations, pop-ups, reports,
  live view, POS, social channels, bills, chat/messaging). These stay hidden or
  labeled; wiring them is a separate backend effort.
- Splitting `app.js` into modules (valuable, but high-risk churn; defer).
