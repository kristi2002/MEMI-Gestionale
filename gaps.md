# MEMI Gaps & Known Issues

Status key: ✅ Fixed | ⚠️ Known limitation | ❌ Missing | 🔄 Workaround in place

---

## Critical — Fixed This Session

| # | Issue | Root Cause | Fix Applied |
|---|-------|-----------|-------------|
| 1 | Nav bar disappearing on all pages | app.js truncated at line 1834 by Python OneDrive FUSE write | Restored from `git show acb59e3` + re-applied footer CSS change |
| 2 | 23 PDP pages serving old broken app.js | `../../app.js` without `?v=6` → cached truncated version | Batch-updated all 23 pages to `?v=6` |
| 3 | 15 collection pages serving old app.js | Same — still on `?v=5` | Batch-updated all 15 pages to `?v=6` |
| 4 | Footer color remained dark | Python write corrupted app.js | Re-applied lavender theme on restored file |
| 5 | "I miei ordini" drawer link pointed to shop | `href="shop"` in account drawer | Fixed to `href="account"` in app.js |

---

## Critical — Fixed Earlier Sessions

| # | Issue | Fix |
|---|-------|-----|
| 6 | Ghost content below footer (drawers rendered as text) | Added `<link rel="stylesheet" href="app.css">` to estate-2025.html and best-seller.html |
| 7 | Gateway timeout on first page load | Added backend healthcheck + `depends_on: service_healthy` in docker-compose.yml |
| 8 | Rank badges on all best-seller products | Removed badges 4–11, kept only gold/silver/bronze on top 3 |
| 9 | Look.html hotspots always same products | Replaced static HTML hotspots with dynamic `renderHotspots(idx)` reading LOOKS array |
| 10 | Estate-2025 filter section mismatched design | Replaced with `.ec-filterbar` sticky filter bar matching project design language |

---

## Missing Features

### ❌ Real product images
All product images use Unsplash placeholder URLs or CSS placeholder shapes (`.ph-fig` divs). No real product photography has been uploaded.

**What's needed:** Upload real photos for each product and update the `images` JSON field in the `products` DB table OR update the static `data-img-*` attributes in each PDP.

### ❌ Payment processing
`checkout.html` collects payment method selection (Carta, PayPal, Klarna) but does **not** integrate any real payment gateway. On submit it calls `MemiAPI.orders.place()` which creates the order as `payment_status: 'in_attesa'`.

**What's needed:** Stripe Elements (or similar) for real card processing. Klarna and PayPal would need their respective SDKs.

### ❌ Email notifications
No email sending is implemented. Customers receive no order confirmation email. Admins receive no new-order alerts.

**What's needed:** Add nodemailer (or SendGrid/Resend) to the backend. Trigger from `POST /api/orders` after order creation.

### ❌ Order tracking page (customer-facing)
Customers can see order status in account.html but there's no dedicated tracking page with shipment timeline.

### ❌ Admin product image upload
Admin can create/edit products but cannot upload images. The `images` field must be manually set to JSON URL arrays.

### ❌ Inventory deduction on order placement
`POST /api/orders` does NOT decrement `product_sizes.stock`. It validates the cart but doesn't update stock.

**Fix needed in** `src/routes/orders.js`: after creating order_items, run `UPDATE product_sizes SET stock = stock - qty WHERE product_id=? AND taglia=?` for each item.

---

## Known Limitations / Workarounds

### ⚠️ Static product catalog
Products in the shop are hardcoded in HTML (shop.html, collections/, best-sellers, estate-2025). Adding a product via admin panel creates it in the DB but does NOT update the static HTML — the new product won't appear on the site until the HTML is manually updated.

**Long-term fix:** Generate product cards dynamically from `MemiAPI.products.list()` in shop.html and collections. Short-term: add products to both the DB (via admin) AND the static HTML.

### ⚠️ productsData.js must stay in sync
`productsData.js` is the source of truth for `search.html`. Any new product must be added there too.

### ⚠️ OneDrive FUSE partial writes
Writing large files via Python `open(path, 'w')` on an OneDrive-mounted path can truncate the file. **Always use the Edit tool for targeted changes to existing files.** If a full rewrite is needed, write to `/tmp/` first, validate with `node --check`, then `cp` to the destination.

### ⚠️ App.js version bumping
When app.js changes, the version must be bumped in **all** HTML files:
- Root pages (16 HTML files)
- `products/*/index.html` (23 files)
- `collections/*/index.html` (15 files)

Use: `find . -name "*.html" | xargs sed -i 's/app\.js?v=6/app.js?v=7/g'` (adjust version numbers).

### ⚠️ `product.html` (root) is orphaned
`product.html` at the root uses `?id=slug` query params and has a hardcoded PRODUCTS object. No nav links point to it — all shop links go to `products/{slug}/index.html`. It's kept as a fallback but isn't the primary PDP.

### ⚠️ Breadcrumbs in PDPs link to collections
Individual PDP breadcrumbs (e.g., `vestiti`) link to `../../collections/vestiti/index.html`. These pages exist so breadcrumbs work.

---

## TODOs for Future Sprints

- [ ] Real product photography upload + image management in admin
- [ ] Stripe payment integration in checkout.html
- [ ] Order confirmation email (nodemailer/Resend)
- [ ] Inventory deduction on order creation
- [ ] Dynamic product loading in shop.html from API (remove hardcoded HTML)
- [ ] Customer-facing order tracking page
- [ ] Newsletter signup integration
- [ ] Size guide modal on PDP pages
- [ ] Product reviews/ratings table + display
- [ ] Mobile-optimised admin view (current admin is desktop-first)
- [ ] `campagne.html` — decide if this is the same as `editoriali.html` or remove it
