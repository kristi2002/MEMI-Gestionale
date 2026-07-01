# MEMI — Design & SEO Sprint: Change Record
*Luglio 2026 · storefront (`Memi Abbigliamento/`) · follows the deploy-readiness sprint*

Companion to `CHANGES-DEPLOY-READY.md`. This records the storefront design and SEO work done
after the correctness sprint. All changes are on the host files; commit + redeploy to publish.

---

## 1. Footer — spacing between the trust strip and the columns
`app.js` (`injectFooter` CSS) had a **duplicated `.sf2-inner` rule**; the second copy reset the
top padding to `0`, so the Negozio/Azienda/Supporto columns sat flush against the trust strip.
Removed the duplicate and set `padding: 3.25rem 2rem 3.5rem`, giving clear separation.
**Cache note:** `app.js` changed → bump `app.js?v=11` → `?v=12` across all storefront HTML.

## 2. Editoriali pages — light pastel redesign
The three editorial pages (`editoriali/primavera-estate-2026/`, `estate-2025/`,
`autunno-inverno-2025/`) used a near-black `#0e0b09` background that clashed with the pastel
token system. Redesigned to light while keeping the exact photo-spread layout:
- Section backgrounds `#0e0b09` → warm off-white `#FBF9F5`; pull-quote → `var(--lavender-light)`
  (viola tint); pagination → white with `var(--beige)` dividers.
- All white section text (`rgba(255,255,255,.x)`) → `var(--espresso)` / `var(--brown-mid)` /
  `var(--brown-light)`.
- Hero keeps the photographic image + white title, but the heavy dark veil was softened to a
  subtle espresso gradient (`rgba(59,43,43,…)`) that still keeps the title legible.
- These are inline `<style>` changes in the page HTML (served no-cache) — no version bump needed.

## 3. Editoriali — "Scopri i pezzi" button padding (`--space-7` bug)
The `.ed-shop-btn` used `padding: var(--space-4) var(--space-7)`, but **`--space-7` was never
defined** in `tokens.css` (the scale jumps `--space-6` → `--space-8`). An undefined custom
property invalidates the whole `padding` declaration, so the button rendered with zero padding
(cramped pill). Fixed two ways:
- Replaced `var(--space-7)` with an explicit `2rem` on the three editoriali pages (immediate).
- Added the missing `--space-7: 1.75rem;` to `tokens.css` so the gap can't break the style
  elsewhere. **Cache note:** to reach cached visitors via the token, bump `tokens.css?v=2` → `?v=3`;
  the editoriali button is already fixed inline regardless.

## 4. Editoriali — nav icon "circles" (missing `button` reset)
The nav icon buttons showed a faint bordered circle only on the editoriali pages. Cause: those
pages' CSS reset covered `*`, `html`, `body`, `img`, `a` but **not `button`**, so the injected
header's `<button class="icon-btn">` fell back to the browser's default button border/background.
Added `button { border: none; background: none; cursor: pointer; font-family: inherit; }` to the
reset on all three pages, matching every other page. Inline HTML — no version bump.

## 5. SEO — production-ready
- **`index.html`**: kept the existing title/description/OG/Twitter/canonical/`ClothingStore`
  JSON-LD; added `og:locale`, `og:image` dimensions, `robots` (`max-image-preview:large`),
  `theme-color`, `apple-touch-icon`, and a **`WebSite` + `SearchAction`** JSON-LD (Google
  sitelinks search box). Enriched the store schema (currency, payment methods).
- **`product.html`**: the PDP now injects, after the product loads, dynamic
  `Product` + `Offer` JSON-LD (name, sku, brand, price in EUR, in/out-of-stock from `status`),
  plus per-product `<title>`, meta description, canonical, and Open Graph / Twitter tags from the
  live product. This makes product pages eligible for Google rich results.
- **`robots.txt`** (new): allows crawl, disallows `/checkout`, `/account`, `/order-confirm`,
  `/reset-password`, `/forgot-password`, `/clear-cart.html`, `/api/`, and thin search-query
  variants; points to the sitemap.
- **`sitemap.xml`** (new): home, shop, 15 collections, 23 products (`/product?id=…`), 3
  editorials, and content pages. Namespace `http://www.sitemaps.org/schemas/sitemap/0.9`.
- **Domain:** all canonicals/sitemap use `https://memiabbigliamento.it` (matching the existing
  homepage canonical). If the final production host differs, update it in `index.html`,
  `product.html` (the `base` var in `injectSeo`), `robots.txt`, and `sitemap.xml`.
- **After deploy:** submit `https://memiabbigliamento.it/sitemap.xml` in Google Search Console.

---

## Files touched
- `Memi Abbigliamento/app.js` — footer `.sf2-inner` de-duplicated (needs `?v=` bump).
- `Memi Abbigliamento/tokens.css` — added `--space-7` (optional `?v=` bump).
- `Memi Abbigliamento/index.html` — SEO head additions.
- `Memi Abbigliamento/product.html` — dynamic Product JSON-LD + meta.
- `Memi Abbigliamento/editoriali/{primavera-estate-2026,estate-2025,autunno-inverno-2025}/index.html`
  — light redesign, button padding, `button` reset.
- `Memi Abbigliamento/robots.txt` — new.
- `Memi Abbigliamento/sitemap.xml` — new.

## Cache-busting summary (do at commit time)
- Required: `app.js?v=11` → `?v=12` across all storefront HTML (footer fix).
- Optional: `tokens.css?v=2` → `?v=3` (only if you want the `--space-7` token to reach cached
  visitors; the editoriali button is fixed inline already).
- Everything else is inline HTML / new files — served fresh, no bump needed.
