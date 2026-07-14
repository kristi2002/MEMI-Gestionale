'use strict';

/**
 * Shipping price resolution — server-authoritative.
 *
 * The browser sends only the shipping *method*; the price is always computed here and
 * re-verified against the payment amount in POST /api/orders. A client that sends its
 * own shipping amount cannot influence the total.
 *
 * Business rule: standard shipping is free once the goods total (after any discount,
 * shipping excluded) reaches FREE_SHIPPING_THRESHOLD. Express is a paid upgrade and is
 * never free; in-store pickup is always free.
 *
 * If the admin has configured a matching row in `shipping_zones` (Spedizioni → Zone &
 * Tariffe), that zone's `prezzo` / `spedizione_gratuita_da` override the built-ins for
 * standard shipping. The table ships empty, so these constants are the live default.
 */

const FREE_SHIPPING_THRESHOLD = 100;   // € of goods → standard shipping becomes free

const RATES = {
  standard: 5.90,
  express:  8.90,
  ritiro:   0,
};

const DEFAULT_METHOD = 'standard';
const METHODS = Object.keys(RATES);

function round2(n) { return Math.round(Number(n) * 100) / 100; }

/** Unknown/absent method → the default, never a throw (an old cached page must not 500). */
function normalizeMethod(method) {
  const k = String(method == null ? '' : method).trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(RATES, k) ? k : DEFAULT_METHOD;
}

/**
 * @param {string}      method     standard | express | ritiro (anything else → standard)
 * @param {number}      goodsTotal subtotal after discount, shipping excluded
 * @param {object|null} zone       optional shipping_zones row {prezzo, spedizione_gratuita_da}
 * @returns {{method:string, cost:number, freeThreshold:number|null, free:boolean}}
 */
function resolveShipping(method, goodsTotal, zone) {
  const m = normalizeMethod(method);
  if (m === 'ritiro') return { method: m, cost: 0, freeThreshold: null, free: true };

  let base = RATES[m];
  // Only standard shipping is free over the threshold — express is a paid upgrade.
  let threshold = m === 'standard' ? FREE_SHIPPING_THRESHOLD : null;

  // A configured zone overrides the built-in standard rate. Express stays a flat upgrade.
  if (zone && m === 'standard') {
    if (zone.prezzo != null && Number.isFinite(Number(zone.prezzo))) base = Number(zone.prezzo);
    threshold = zone.spedizione_gratuita_da == null ? null : Number(zone.spedizione_gratuita_da);
    if (threshold != null && !Number.isFinite(threshold)) threshold = FREE_SHIPPING_THRESHOLD;
  }

  const goods = Number(goodsTotal);
  const free  = threshold != null && Number.isFinite(goods) && goods >= threshold;
  return { method: m, cost: free ? 0 : round2(base), freeThreshold: threshold, free };
}

module.exports = { resolveShipping, normalizeMethod, FREE_SHIPPING_THRESHOLD, RATES, METHODS, DEFAULT_METHOD };
