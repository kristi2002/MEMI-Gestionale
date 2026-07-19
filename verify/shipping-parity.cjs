'use strict';
/**
 * Checkout/server shipping parity.
 *
 * The storefront computes the amount it charges the payment provider; POST /api/orders
 * recomputes the total server-side and rejects any mismatch with 402 "Importo del pagamento
 * non corrisponde". If the two ever disagree by even a cent, EVERY card order for that
 * case fails — which is exactly what shipped before (page said "Gratis", server charged 5.90).
 *
 * The storefront mirrors MEMI-Backend/src/shipping-rates.js inside a marked block in
 * checkout.html (==SHIPPING-CORE-START== … ==SHIPPING-CORE-END==). This lifts that block out
 * and diffs it against the real server module across a full matrix — zones × countries ×
 * methods × goods (incl. every free-shipping threshold boundary) AND the empty-table
 * fallback. No DOM, no network.
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'Memi Abbigliamento', 'checkout.html'), 'utf8');
const server = require(path.join(ROOT, 'MEMI-Backend', 'src', 'shipping-rates.js'));

// Lift the client's mirrored shipping core straight out of the page. The markers live inside
// /* … */ comments, so capture the code BETWEEN the start comment's closing */ and the end
// comment's opening /* — that group is pure, evaluable JS.
const block = html.match(/==SHIPPING-CORE-START==[\s\S]*?\*\/([\s\S]*?)\/\*[\s\S]*?==SHIPPING-CORE-END==/);
if (!block) { console.error('  x could not find SHIPPING-CORE block in checkout.html'); process.exit(1); }
const client = vm.runInNewContext(
  block[1] + '\n;({ matchZone: matchZone, resolveShippingCost: resolveShippingCost });'
);

const r2 = (n) => Math.round(Number(n) * 100) / 100;
const clientCost = (zones, country, method, goods) =>
  r2(client.resolveShippingCost(method, goods, client.matchZone(zones, country, method)));
const serverCost = (zones, country, method, goods) => r2(server.quoteShipping(zones, method, goods, country).cost);

// The real configured zones (must match the live shipping_zones table) + empty-table fallback.
const ZONES = [
  { id: 1, nome: 'Italia - Standard', paesi: 'Italia', metodo: 'Standard 3-5gg', prezzo: '5.90', spedizione_gratuita_da: '100.00' },
  { id: 2, nome: 'Italia - Express', paesi: 'Italia', metodo: 'Express 24h', prezzo: '12.90', spedizione_gratuita_da: null },
  { id: 3, nome: 'Italia - Isole', paesi: 'Sicilia, Sardegna', metodo: 'Standard 5-7gg', prezzo: '9.90', spedizione_gratuita_da: '99.00' },
  { id: 4, nome: 'UE - Zona 1', paesi: 'FR, DE, ES, AT', metodo: 'Standard 4-6gg', prezzo: '14.90', spedizione_gratuita_da: '149.00' },
  { id: 5, nome: 'UE - Zona 2', paesi: 'NL, BE, PT, GR', metodo: 'Standard 5-7gg', prezzo: '17.90', spedizione_gratuita_da: '179.00' },
  { id: 6, nome: 'Mondo', paesi: 'Resto del mondo', metodo: 'DHL Express', prezzo: '29.90', spedizione_gratuita_da: null },
];

const COUNTRIES = ['Italia', 'Germania', 'Francia', 'Spagna', 'Paesi Bassi'];
const METHODS = ['standard', 'express', 'ritiro'];
// Goods values straddle every configured free-shipping threshold (100 / 149 / 179) + built-in 100.
const GOODS = [0, 0.01, 25, 78, 79, 89, 98.99, 99, 99.99, 100, 100.01, 148.99, 149, 150, 178.99, 179, 1000];

let n = 0, bad = 0;
for (const zoneset of [ZONES, []]) {
  for (const c of COUNTRIES) {
    for (const mth of METHODS) {
      for (const g of GOODS) {
        const cl = clientCost(zoneset, c, mth, g);
        const sv = serverCost(zoneset, c, mth, g);
        n++;
        if (cl !== sv) { bad++; console.error(`  x ${c}/${mth}/EUR${g} zones=${zoneset.length}: client=${cl} server=${sv}`); }
      }
    }
  }
}

// Built-in rules still hold when no zone matches (empty table).
assert.strictEqual(server.resolveShipping('standard', 99.99, null).cost, 5.90, 'built-in: under 100 -> paid');
assert.strictEqual(server.resolveShipping('standard', 100, null).cost, 0, 'built-in: 100+ -> free');
assert.strictEqual(server.resolveShipping('express', 500, null).cost, 8.90, 'built-in: express never free');
assert.strictEqual(server.resolveShipping('ritiro', 0, null).cost, 0, 'pickup always free');
assert.strictEqual(server.resolveShipping(undefined, 10, null).cost, 5.90, 'absent method -> standard');
assert.strictEqual(server.resolveShipping('free-plz', 10, null).cost, 5.90, 'garbage method -> standard');

// Owner-approved zone activation matrix (guards against silent re-drift of the data → code contract).
assert.strictEqual(serverCost(ZONES, 'Italia', 'standard', 100), 0, 'IT standard free >= 100');
assert.strictEqual(serverCost(ZONES, 'Italia', 'standard', 99), 5.90, 'IT standard paid < 100');
assert.strictEqual(serverCost(ZONES, 'Italia', 'express', 50), 12.90, 'IT express zone = 12.90');
assert.strictEqual(serverCost(ZONES, 'Germania', 'standard', 50), 14.90, 'DE standard zone = 14.90');
assert.strictEqual(serverCost(ZONES, 'Germania', 'express', 50), 8.90, 'DE express falls back to built-in (no EU express zone)');
assert.strictEqual(serverCost(ZONES, 'Paesi Bassi', 'standard', 50), 17.90, 'NL standard zone = 17.90');
assert.strictEqual(serverCost(ZONES, 'Italia', 'ritiro', 0), 0, 'pickup always free (zoned country)');
n += 13;

if (bad) { console.error('  x ' + bad + ' client/server shipping mismatches'); process.exit(1); }
console.log('  ok - ' + n + ' shipping parity + rule checks (client matches server across zones × countries × methods × goods)');
