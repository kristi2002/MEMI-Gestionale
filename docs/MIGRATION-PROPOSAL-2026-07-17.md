# Migration proposal — 2026-07-17

**Status:** ✅ APPLIED 2026-07-17 — Part A (per-product scoping) and Part B option 1
(document + drift guard) both implemented and covered by `verify/run.sh` (sec 6d, 6e).
The sections below are kept as the design record.
**Scope:** two independent schema questions raised while building the abandoned-cart
promemoria and the feature analyses.

- **A.** Per-product discount scoping — make a discount code apply *only* to specific
  products (so the cart-recover "sconto per articoli selezionati" becomes a real
  per-item discount, not just an order-level code with the items featured in the email).
- **B.** `schema.sql` drift — 24 tables live in `migrations.js` but not `schema.sql`.

Each part is self-contained; A and B can be approved/applied independently.

---

## A. Per-product discount scoping

### Goal
A discount code can be restricted to a set of product IDs. When set, the discount is
computed on the **subtotal of the matching line items only**; a cart with none of those
products gets no discount. `NULL` = current behaviour (whole-order discount).

### Current state
`discount_codes` (`schema.sql:214`, self-healed in `migrations.js`) is order-level:
`code, tipo ENUM('percentuale','fisso','spedizione'), valore, utilizzi, max_utilizzi,
scadenza, stato, min_order`. There is **no product scoping**. Discount is applied to the
whole `subtotal` at two sites in `routes/orders.js`:

- **Order creation** — `orders.js:191-192`
  ```js
  if (dc.tipo === 'percentuale')  discountAmount = subtotal * (dcValore / 100);
  else if (dc.tipo === 'fisso')   discountAmount = Math.min(dcValore, subtotal);
  ```
- **Public preview** (`POST /api/discounts/validate` or similar) — `orders.js:1100-1101`, same shape.

The cart-recover endpoint I added (`routes/carts.js`) already collects the selected
`item_ids` and mints a code, but currently discards the scope — the minted code is
order-level.

### Proposed change (additive, non-destructive)

**1. Column** — nullable JSON list of product IDs.

`schema.sql` (under the `discount_codes` table):
```sql
product_ids JSON NULL,   -- NULL = whole order; else discount applies only to these product_ids
```

`migrations.js` self-heal (add next to the other `ensureColumn` calls, ~line 638) so
existing databases pick it up on boot with zero downtime:
```js
await ensureColumn(pool, 'discount_codes', 'product_ids', 'product_ids JSON NULL');
```
(`ensureColumn` already exists at `migrations.js:402` — `ADD COLUMN` guarded by
`information_schema` lookup, MySQL-8 safe.)

**2. Application logic** — compute the discount against the scoped subtotal. At both
sites, replace the flat `subtotal` with a scope-aware base:
```js
const scope = dc.product_ids ? new Set(JSON.parse(dc.product_ids).map(String)) : null;
const base  = scope
  ? resolved.filter(i => scope.has(String(i.product_id))).reduce((s,i) => s + i.price*i.qty, 0)
  : subtotal;
if (dc.tipo === 'percentuale')  discountAmount = base * (dcValore / 100);
else if (dc.tipo === 'fisso')   discountAmount = Math.min(dcValore, base);
```
`resolved` already carries `product_id`, `price`, `qty`, so no extra query. The
`min_order <= subtotal` gate stays on the **order** subtotal (a minimum-spend threshold
is about the whole basket) — this is a deliberate choice, easy to flip if you'd rather
gate on the scoped base.

**3. Mint with scope** — in `routes/carts.js` `mintCartDiscount`, persist the selected
items when the admin scoped the promemoria:
```js
`INSERT INTO discount_codes (code, tipo, valore, max_utilizzi, scadenza, stato, min_order, product_ids)
 VALUES (?, ?, ?, 1, ?, 'attivo', 0, ?)`
// product_ids = featured.length ? JSON.stringify(featured.map(i => String(i.id))) : null
```
Then the email copy changes from "featuring these items" to a genuine "X% su questi
articoli", because the code will only discount them at checkout.

**4. Admin UI (optional, follow-up)** — the Sconti form (`MEMI-Admin`, discounts) could
gain an optional product multiselect writing `product_ids`. Not required for the
cart-recover flow; can ship later.

### Compatibility / rollback
- Fully backward compatible: every existing code has `product_ids = NULL` → unchanged behaviour.
- Rollback = `ALTER TABLE discount_codes DROP COLUMN product_ids;` (only if truly needed;
  leaving an unused nullable column is harmless).

### Tests to add
- `verify/run.sh` unit: percentuale/fisso on a scoped code → discount only on matching
  lines; cart without any scoped product → 0 discount; `NULL` scope → whole-order (regression).
- `smoke-test.sh`: create a scoped code, place an order with/without the product, assert totals.

---

## B. `schema.sql` drift — the honest picture

### Finding (corrected)
Not 3 tables — **24**. `schema.sql` defines only the ~18 *core* tables; `migrations.js
ensureSchema()` creates everything else on boot (`CREATE TABLE IF NOT EXISTS`, structural
only). Tables only in `migrations.js`:

```
audit_log, automations, blog_posts, campaigns, carts, cms_pages, conversations,
customer_segments, email_events, gift_cards, loyalty_transactions, messages, page_views,
pickup_points, po_items, popups, product_categories, product_collections, product_colors,
product_variants, purchase_orders, stock_transfers, store_expenses, suppliers
```

This is **by design** (CLAUDE.md: "Schema self-heals on boot… structural only"), and both
run at startup, so these tables always exist. The drift is a *canonical-source* /
documentation problem, not a runtime bug.

### Recommendation — do **not** copy all 24 into `schema.sql`
Hand-copying would create **two hand-maintained definitions** of each table and make drift
strictly worse (the next edit lands in one file only). Better options, in order of
preference:

1. **Document the split (cheapest, recommended).** Add a header comment to `schema.sql`
   stating it is the *core seed* and that `migrations.js ensureSchema()` is the canonical
   source for the extended tables, with the list above. Add a `verify/run.sh` check that
   every `CREATE TABLE` in `migrations.js` is either in `schema.sql` or in that documented
   allow-list — so a *new* table can't be added without being acknowledged. This keeps one
   source of truth and prevents silent drift.

2. **Generate `schema.sql` from the live DB** as a build/CI artifact (`mysqldump
   --no-data`) so it's always a faithful, never-hand-edited snapshot. Bigger lift; worth it
   only if an accurate full-schema file is a hard requirement (e.g. for external tooling).

3. **Copy the 24 into `schema.sql`** (what was literally asked). Feasible and additive, but
   I recommend against it for the maintenance reason above. If you still want it, I'll port
   them verbatim from `migrations.js` and add a "keep in sync with migrations.js" banner.

The two specific tables I flagged earlier (`stock_transfers`, `gift_cards`,
`product_colors`) are just three of the 24 — no reason to special-case them.

---

## Suggested order of work
1. **A** first — it unblocks the real per-item discount and is low-risk (one nullable
   column + two small logic edits + mint tweak + tests). ~½ day.
2. **B** — pick option 1 (document + guard) unless you specifically need a full-schema
   file, then option 2. ~1–2 h for option 1.

Tell me which option you want for B, and whether to apply A now; I'll implement, run
`verify/run.sh`, and (for A) add the smoke assertions.
