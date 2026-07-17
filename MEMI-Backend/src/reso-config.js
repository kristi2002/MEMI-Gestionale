'use strict';

/**
 * reso-config.js — return (reso) policy conditions.
 * ──────────────────────────────────────────────────────────
 * Mirrors the lifecycle.js pattern: defaults live in code, the admin can
 * override any of them via store_settings (keys `reso_%`). Nothing is seeded
 * into the DB — an absent key simply falls back to the default here, so old
 * volumes keep working and the "Condizioni di reso" admin card upserts only the
 * keys the operator actually changes.
 *
 * These conditions gate whether a CUSTOMER can OPEN a return request. Approval
 * and the actual refund always stay a manual admin action (a human operator
 * must inspect the returned goods first) — see routes/resi.js.
 */

const { pool } = require('./db');

const DEFAULT_REASONS = [
  'Taglia errata',
  'Non corrispondente alla descrizione',
  'Difetto di produzione',
  'Danneggiato alla consegna',
  'Non gradito',
  'Altro',
];

const DEFAULTS = {
  reso_enabled:     '1',   // master switch for customer-initiated returns
  reso_window_days: '30',  // days after delivery within which a return may be opened
  reso_reasons:     JSON.stringify(DEFAULT_REASONS),
};

function intOr(v, fallback) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Parse the reasons setting (JSON array) → clean string[]; falls back to defaults. */
function parseReasons(raw) {
  if (!raw) return DEFAULT_REASONS.slice();
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      const clean = arr.map((s) => String(s || '').trim()).filter(Boolean);
      if (clean.length) return clean;
    }
  } catch (_) { /* fall through to defaults */ }
  return DEFAULT_REASONS.slice();
}

/**
 * Load the effective reso config (store_settings overrides merged over DEFAULTS).
 * Returns a normalized object the routes can use directly.
 */
async function loadResoConfig() {
  let cfg = { ...DEFAULTS };
  try {
    const [rows] = await pool.execute(
      "SELECT `key`, `value` FROM store_settings WHERE `key` LIKE 'reso\\_%'"
    );
    rows.forEach((r) => { if (r.value != null) cfg[r.key] = r.value; });
  } catch (_) { /* store_settings may be missing on a very old volume */ }

  return {
    enabled:     cfg.reso_enabled !== '0' && cfg.reso_enabled !== 'false',
    windowDays:  intOr(cfg.reso_window_days, 30),
    reasons:     parseReasons(cfg.reso_reasons),
  };
}

module.exports = { loadResoConfig, DEFAULTS, DEFAULT_REASONS };
