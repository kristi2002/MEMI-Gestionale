'use strict';
/**
 * Checkout/server shipping parity.
 *
 * The storefront computes the amount it charges Stripe; POST /api/orders recomputes the
 * total server-side and rejects any mismatch with 402 "Importo del pagamento non
 * corrisponde". If the two ever disagree by even a cent, EVERY card order fails — which
 * is exactly what shipped (page said "Gratis", server charged 5.90).
 *
 * This lifts the real shippingFor() out of checkout.html and diffs it against the real
 * server module across a matrix. No DOM, no network.
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'Memi Abbigliamento', 'checkout.html'), 'utf8');
const { resolveShipping } = require(path.join(ROOT, 'MEMI-Backend', 'src', 'shipping-rates.js'));

// Pull the client's shipping constants + function straight out of the page.
function grab(re, what) {
  const m = html.match(re);
  if (!m) { console.error('  x could not find ' + what + ' in checkout.html'); process.exit(1); }
  return m[0];
}
const src = [
  grab(/var FREE_SHIPPING_THRESHOLD = [^;]+;/, 'FREE_SHIPPING_THRESHOLD'),
  grab(/var SHIPPING_RATES = \{[^}]*\};/, 'SHIPPING_RATES'),
  grab(/function shippingFor\(method, goodsTotal\) \{[\s\S]*?\n    \}/, 'shippingFor'),
  'shippingFor',
].join('\n');
const clientShippingFor = vm.runInNewContext(src);

const METHODS = ['standard', 'express', 'ritiro'];
const GOODS   = [0, 0.01, 25, 89, 99.99, 100, 100.01, 150, 1000];

let n = 0, bad = 0;
for (const m of METHODS) {
  for (const g of GOODS) {
    const client = Math.round(clientShippingFor(m, g) * 100) / 100;
    const server = resolveShipping(m, g, null).cost;
    n++;
    if (client !== server) {
      bad++;
      console.error(`  x ${m} @ EUR${g}: client=${client} server=${server}`);
    }
  }
}

// The rule the owner stated: free ONLY above 100.
assert.strictEqual(resolveShipping('standard', 99.99, null).cost, 5.90, 'under 100 -> paid');
assert.strictEqual(resolveShipping('standard', 100, null).cost, 0,      '100+ -> free');
assert.strictEqual(resolveShipping('express', 500, null).cost, 8.90,    'express never free');
assert.strictEqual(resolveShipping('ritiro', 0, null).cost, 0,          'pickup always free');
// An unknown/absent method must not 500 or become free.
assert.strictEqual(resolveShipping(undefined, 10, null).cost, 5.90,     'absent -> standard');
assert.strictEqual(resolveShipping('free-plz', 10, null).cost, 5.90,    'garbage -> standard');
n += 6;

if (bad) { console.error('  x ' + bad + ' client/server shipping mismatches'); process.exit(1); }
console.log('  ok - ' + n + ' shipping parity + rule checks (client matches server on all ' + (METHODS.length * GOODS.length) + ' combos)');
