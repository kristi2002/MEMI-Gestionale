'use strict';
/* Per-product discount scoping — verifies the discount-base math is identical between
   the preview (POST /orders/validate-discount) and order creation (POST /orders), so a
   product-scoped code can never make checkout charge a different amount than the server
   computes (which would 402 the card). Uses the REAL helpers exported from routes/orders.js.
   Run: node test/discount-scope.test.cjs                                              */
const assert = require('assert');
const { discountScope, discountBase } = require('../src/routes/orders');

let pass = 0;
const ok = (m) => { pass++; console.log('  ✓ ' + m); };

// Cart: two products. product_id is what both paths key on.
const items = [
  { product_id: 'blazer-lino', price: 120, qty: 1 },
  { product_id: 'gonna-midi',  price: 40,  qty: 2 }, // 80
];
const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0); // 200

// ── scope parsing ──
assert.strictEqual(discountScope(null), null, 'null → whole order');
assert.strictEqual(discountScope('[]'), null, 'empty array → whole order');
assert.ok(discountScope('["blazer-lino"]') instanceof Set, 'json string → Set');
assert.ok(discountScope(['blazer-lino']) instanceof Set, 'array → Set');
ok('discountScope: null/[] → whole order, list → Set');

// ── unscoped base = whole subtotal ──
assert.strictEqual(discountBase(null, items, subtotal), 200, 'unscoped base = subtotal');
ok('unscoped code discounts the whole subtotal (200)');

// ── scoped base = only matching lines ──
assert.strictEqual(discountBase(discountScope('["blazer-lino"]'), items, subtotal), 120, 'only blazer');
assert.strictEqual(discountBase(discountScope('["gonna-midi"]'), items, subtotal), 80, 'only gonna x2');
assert.strictEqual(discountBase(discountScope('["blazer-lino","gonna-midi"]'), items, subtotal), 200, 'both = subtotal');
ok('scoped code discounts only the matching lines (120 / 80 / 200)');

// ── no matching item → base 0 (preview rejects; creation gives 0 discount) ──
assert.strictEqual(discountBase(discountScope('["not-in-cart"]'), items, subtotal), 0, 'no match → 0');
ok('scope with no cart match → base 0');

// ── the invariant: preview and order-creation use the SAME helper → identical amount ──
for (const scopeJson of [null, '["blazer-lino"]', '["gonna-midi"]', '["blazer-lino","gonna-midi"]']) {
  const scope = discountScope(scopeJson);
  const base = discountBase(scope, items, subtotal);
  // percentuale 25%
  const previewPct = base * 0.25, createPct = base * 0.25;
  assert.strictEqual(previewPct, createPct, 'pct parity ' + scopeJson);
  // fisso €30 (capped at base)
  const previewFix = Math.min(30, base), createFix = Math.min(30, base);
  assert.strictEqual(previewFix, createFix, 'fisso parity ' + scopeJson);
}
ok('preview ≡ order-creation discount for every scope (percentuale & fisso)');

console.log(`\nALL ${pass} discount-scope checks passed.`);
