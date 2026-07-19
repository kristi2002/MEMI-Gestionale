'use strict';

/**
 * Shipping price resolution — server-authoritative.
 *
 * The browser sends only the shipping *method* and the destination country; the price is
 * always computed here and re-verified against the payment amount in POST /api/orders. A
 * client that sends its own shipping amount cannot influence the total.
 *
 * Business rule: standard shipping is free once the goods total (after any discount,
 * shipping excluded) reaches FREE_SHIPPING_THRESHOLD. Express is a paid upgrade and is
 * never free by default; in-store pickup is always free.
 *
 * If the admin has configured matching rows in `shipping_zones` (Spedizioni → Zone &
 * Tariffe), the zone that matches the destination country AND the chosen method overrides
 * the built-in price / free-shipping threshold — for standard AND express. The built-in
 * RATES below are the fallback when no zone matches.
 *
 * ⚠️  This module is MIRRORED byte-for-behaviour in Memi Abbigliamento/checkout.html
 *     (matchZone + resolveShippingCost). The storefront must compute the SAME number it
 *     charges the payment provider, or POST /api/orders rejects the order with 402. The
 *     harness verify/shipping-parity.cjs diffs the two implementations across a matrix —
 *     KEEP THEM IN SYNC and run `bash verify/run.sh` after any change here.
 */

const FREE_SHIPPING_THRESHOLD = 100;   // € of goods → standard shipping becomes free (built-in default)

const RATES = {
  standard: 5.90,
  express:  8.90,
  ritiro:   0,
};

const DEFAULT_METHOD = 'standard';
const METHODS = Object.keys(RATES);

// Italian country name → ISO code, for the countries the storefront offers at checkout.
// Keys are lowercased. MUST stay identical to COUNTRY_CODES mirrored in checkout.html.
const COUNTRY_CODES = {
  'italia': 'IT', 'germania': 'DE', 'francia': 'FR', 'spagna': 'ES', 'paesi bassi': 'NL',
};

function round2(n) { return Math.round(Number(n) * 100) / 100; }

/** Unknown/absent method → the default, never a throw (an old cached page must not 500). */
function normalizeMethod(method) {
  const k = String(method == null ? '' : method).trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(RATES, k) ? k : DEFAULT_METHOD;
}

/** Classify a zone's free-text `metodo` label into a canonical shipping method. */
function zoneMethod(metodo) {
  const s = String(metodo == null ? '' : metodo).toLowerCase();
  if (/express|expr|24\s*h|corriere espresso/.test(s)) return 'express';
  if (/ritiro|pickup|negozio/.test(s)) return 'ritiro';
  return 'standard';
}

/** A zone whose country list is empty or names the world ("Resto del mondo") is a catch-all. */
function isCatchAll(paesi) {
  const s = String(paesi == null ? '' : paesi).trim().toLowerCase();
  if (s === '') return true;
  return /resto del mondo|\bworld\b|\bmondo\b|\brow\b|^\*$/.test(s);
}

/** Tokenize a zone's `paesi` list into normalized uppercase tokens (codes and/or names). */
function zoneTokens(paesi) {
  return String(paesi == null ? '' : paesi)
    .split(',')
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);
}

/** ISO code for a country name (or '' if unknown). */
function codeFor(countryName) {
  return COUNTRY_CODES[String(countryName == null ? '' : countryName).trim().toLowerCase()] || '';
}

/** Does a (non-catch-all) zone list the given country, by ISO code or by name? */
function zoneMatchesCountry(zone, nameUpper, codeUpper) {
  const tokens = zoneTokens(zone.paesi);
  return (!!codeUpper && tokens.includes(codeUpper)) || (!!nameUpper && tokens.includes(nameUpper));
}

/**
 * Pick the `shipping_zones` row that prices `method` for `countryName`, or null (→ built-ins).
 *
 * Rules: a specific-country zone (matched by ISO code or name) beats a catch-all; a catch-all
 * ("Resto del mondo") applies ONLY to countries not named by any specific zone; the zone's
 * `metodo` must classify to the requested method; lowest `id` wins ties. Pickup is never zoned.
 *
 * @param {Array} zones  all shipping_zones rows
 * @param {string} countryName  destination country (name as shown at checkout, e.g. "Italia")
 * @param {string} method  standard | express | ritiro
 * @returns {object|null}
 */
function matchZone(zones, countryName, method) {
  if (!Array.isArray(zones) || zones.length === 0) return null;
  const m = normalizeMethod(method);
  if (m === 'ritiro') return null;

  const nameUpper = String(countryName == null ? '' : countryName).trim().toUpperCase();
  const codeUpper = codeFor(countryName);
  const countryHasSpecificZone = zones.some(
    (z) => !isCatchAll(z.paesi) && zoneMatchesCountry(z, nameUpper, codeUpper),
  );

  let specific = null;
  let catchAll = null;
  for (const z of zones) {
    if (zoneMethod(z.metodo) !== m) continue;
    if (!isCatchAll(z.paesi) && zoneMatchesCountry(z, nameUpper, codeUpper)) {
      if (!specific || Number(z.id) < Number(specific.id)) specific = z;
    } else if (isCatchAll(z.paesi) && !countryHasSpecificZone) {
      if (!catchAll || Number(z.id) < Number(catchAll.id)) catchAll = z;
    }
  }
  return specific || catchAll || null;
}

/**
 * @param {string}      method     standard | express | ritiro (anything else → standard)
 * @param {number}      goodsTotal subtotal after discount, shipping excluded
 * @param {object|null} zone       a shipping_zones row already matched for this method (matchZone)
 * @returns {{method:string, cost:number, freeThreshold:number|null, free:boolean}}
 */
function resolveShipping(method, goodsTotal, zone) {
  const m = normalizeMethod(method);
  if (m === 'ritiro') return { method: m, cost: 0, freeThreshold: null, free: true };

  let base = RATES[m];
  // Built-in: only standard is free over the threshold — express is a paid upgrade.
  let threshold = m === 'standard' ? FREE_SHIPPING_THRESHOLD : null;

  // A matched zone (standard OR express) overrides the built-in price + free threshold.
  if (zone) {
    if (zone.prezzo != null && Number.isFinite(Number(zone.prezzo))) base = Number(zone.prezzo);
    threshold = zone.spedizione_gratuita_da == null ? null : Number(zone.spedizione_gratuita_da);
    if (threshold != null && !Number.isFinite(threshold)) threshold = null;
  }

  const goods = Number(goodsTotal);
  const free  = threshold != null && Number.isFinite(goods) && goods >= threshold;
  return { method: m, cost: free ? 0 : round2(base), freeThreshold: threshold, free };
}

/** Convenience: match a zone for (country, method) then resolve the cost in one call. */
function quoteShipping(zones, method, goodsTotal, countryName) {
  return resolveShipping(method, goodsTotal, matchZone(zones, countryName, method));
}

module.exports = {
  resolveShipping, matchZone, quoteShipping, normalizeMethod,
  zoneMethod, isCatchAll, codeFor,
  FREE_SHIPPING_THRESHOLD, RATES, METHODS, DEFAULT_METHOD, COUNTRY_CODES,
};
