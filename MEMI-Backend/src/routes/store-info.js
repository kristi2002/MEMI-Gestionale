'use strict';

/**
 * GET /api/store-info — public company/legal identity for the storefront.
 *
 * Italian law requires a seller to publish its identity on the site: ragione
 * sociale, sede legale, P. IVA and contact details (D.Lgs 70/2003 art. 7 for
 * e-commerce; DPR 633/72 art. 35 for the VAT number). Those values used to be
 * hardcoded placeholders — "[Ragione sociale e P.IVA da completare]" — in the
 * footer and in privacy/termini/cookie-policy, which is a launch blocker.
 *
 * They now live in `store_settings` (editable from the admin), and this endpoint
 * exposes ONLY the whitelisted, deliberately-public subset. It is intentionally
 * separate from /api/admin/settings, which is admin-gated and returns everything.
 */

const router = require('express').Router();
const { pool } = require('../db');

/** Whitelist — anything not listed here is never served publicly. */
const PUBLIC_KEYS = [
  'company_name',
  'company_legal_name',
  'company_vat',
  'company_fiscal_code',
  'company_rea',
  'company_share_capital',
  'company_address',
  'company_cap',
  'company_city',
  'company_province',
  'company_country',
  'company_email',
  'company_pec',
  'company_phone',
  'store_name',
  'store_url',
];

/** Short in-process cache: this is hit on every storefront page render. */
let cache = { at: 0, data: null };
const TTL_MS = 60_000;

router.get('/', async (req, res) => {
  try {
    if (cache.data && Date.now() - cache.at < TTL_MS) return res.json(cache.data);

    const [rows] = await pool.execute('SELECT `key`, `value` FROM store_settings');
    const all = {};
    rows.forEach((r) => { all[r.key] = r.value; });

    const out = {};
    for (const k of PUBLIC_KEYS) {
      const v = (all[k] ?? '').trim();
      if (v) out[k] = v;
    }

    // One preformatted line the footer can print verbatim, so every surface renders
    // the same legal string and none of them re-implement the formatting.
    const parts = [];
    const name = out.company_legal_name || out.company_name;
    if (name) parts.push(name);
    // Italian convention: "62012 Civitanova Marche (MC)" — the province belongs to the
    // town, so it must not become its own comma-separated element.
    const town = [out.company_cap, out.company_city].filter(Boolean).join(' ')
      + (out.company_province ? ` (${out.company_province})` : '');
    const addr = [out.company_address, town.trim(), out.company_country]
      .filter(Boolean).join(', ');
    if (addr) parts.push(addr);
    if (out.company_vat) parts.push('P. IVA ' + out.company_vat);
    if (out.company_fiscal_code && out.company_fiscal_code !== out.company_vat) parts.push('C.F. ' + out.company_fiscal_code);
    if (out.company_rea) parts.push('REA ' + out.company_rea);
    if (out.company_share_capital) parts.push('Cap. soc. ' + out.company_share_capital);

    const payload = {
      ...out,
      legal_line: parts.join(' · '),
      // The storefront uses this to decide between printing the real data and
      // showing an honest "dati in aggiornamento" note — never a fake P. IVA.
      configured: Boolean(out.company_vat && name),
    };

    cache = { at: Date.now(), data: payload };
    return res.json(payload);
  } catch (err) {
    (req.log || console).error({ err }, 'store-info');
    // Never fail a page render over this — the storefront degrades to its fallback.
    return res.json({ legal_line: '', configured: false });
  }
});

/** Called by the settings PUT so an edit is visible immediately, not up to a minute later. */
function invalidateStoreInfoCache() {
  cache = { at: 0, data: null };
}

module.exports = router;
module.exports.invalidateStoreInfoCache = invalidateStoreInfoCache;
