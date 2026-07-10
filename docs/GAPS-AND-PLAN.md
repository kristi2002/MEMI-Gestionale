# MEMI — Gap analysis & phased plan (2026-07-05)

> ⚠️ **Historical snapshot.** Current gap analysis: **`docs/GO-LIVE-PLAN-2026-07.md`**; current
> feature status: **`docs/STATUS.md`**. The "ghost views mock" framing here is superseded (those
> features are built).

Derived from the full code audit (see STATUS.md). Goal: a credible, full-fledged e-commerce platform on
Hetzner/Coolify. The platform core (catalog, checkout with verified Stripe, orders, shipping, returns,
invoices, discounts, gift cards, loyalty, reviews, staff, settings, audit) is already WIRED and deployed.
The gaps below are ranked by client-visible value vs risk.

## Gaps
| # | Gap | Impact | Effort |
|---|---|---|---|
| G1 | Admin "invia tracking al cliente" only copies to clipboard — no email endpoint | Client-visible flaw in a core flow | S |
| G2 | Newsletter form UX feedback minimal | Trust | S |
| G3 | CMS pages/blog editable in admin but never rendered on the storefront (blog.html is a shell; only `GET /api/cms/published/:slug` exists, no public list) | Whole admin section looks pointless | M |
| G4 | Mixed nav links: `/shop?categoria=…` vs `/collections/<slug>/` → inconsistent counts/UX | Polish | S |
| G5 | Collection filter counts frozen at build time (drift) | Minor UX lie | M |
| G6 | Security: no rate limit on reviews/newsletter/giftcard-validate; zod missing on many admin PUTs; audit log not called on all sensitive ops | Hardening | M |
| G7 | Staff cannot change their own password | Ops annoyance | S |
| G8 | SEO: no Product JSON-LD on product page; collections lack canonical; sitemap lists query URLs | Organic traffic | M |
| G9 | Façade admin views (Chat, POS, Social, Apps, Pop-ups, Menus, Bills, Live view, Abandoned carts) look broken to a client | Credibility | S (hide) / XL (build) |
| G10 | Admin dashboard lacks catalog KPIs from the approved cockpit preview (Prodotti / Scorte basse / Esauriti / Vendite oggi) | Client expectation | M |
| G11 | nginx: no HSTS header | Security header hygiene | S |
| G12 | Backups exist as scripts but cron installation is a manual server step (unverified) | Data safety | S (ops) |

## Phases — status 2026-07-05: A ✅ · B ✅ · C ✅ (2026-07-05) · D ✅ · E ✅ — all phases delivered
- **Phase A — quick wins (code now):** G1 endpoint `POST /api/orders/admin/:id/send-tracking` reusing the
  existing shipping-confirmation email + wire the admin button; G11 HSTS in both nginx configs; G4 unify
  storefront nav/footer links onto `/collections/<slug>/`; G9 hide façade views from admin nav (keep code);
  G2 confirm newsletter feedback.
- **Phase B — content platform:** public blog endpoints (`GET /api/cms/blog/published` list) + storefront
  blog index/article rendering via the existing published-slug endpoint.
- **Phase C — hardening:** rate limits (reviews, newsletter subscribe, giftcard validate, forgot-password);
  zod schemas for remaining admin mutations; audit-log coverage for products/orders/settings mutations;
  G7 staff self password change (`PUT /api/admin/auth/password`).
- **Phase D — SEO & drift:** Product JSON-LD injected on product hydrate; canonical tags on collection pages
  (generator tweak); client-side recount of filter chips after cards render (kills G5 without infra work).
- **Phase E — dashboard:** catalog KPI row (products count, low stock ≤3, out-of-stock, today's sales) on
  the admin dashboard using existing endpoints (products list + kpis), matching the cockpit preview.

## Ground rules during implementation
Every new route gets: a row in docs/integrations.md, a contract entry in verify/contract.cjs when
applicable, and `bash verify/run.sh` green before commit. All file writes verified against truncation
(wc -c + tail + node --check). One commit per phase.

## Out of scope for this round (needs product decisions)
Real chat backend, marketplace/social integrations, POS, marketing automations, expense tracking,
GA4/analytics integration (liveview), multi-language UI.
