'use strict';

/**
 * Courier tracking — live parcel status pulled from the carrier, pluggable per courier.
 *
 * Mirrors the repo's other external integrations (Stripe, SMTP): entirely
 * config-gated and graceful. If a courier has no adapter or no credentials,
 * fetchTrackingStatus() returns { configured:false } and callers fall back to the
 * manually-set shipment status — nothing breaks and no exception escapes.
 *
 * This is a PROTOTYPE for ONE carrier (BRT). The real HTTP path is implemented but
 * requires a BRT "Web Service Tracking" account to exercise; a deterministic
 * SIMULATE mode makes the whole flow testable offline (local/demo) with no creds.
 *
 * Env:
 *   COURIER_TRACKING_SIMULATE=1                  deterministic offline status (no creds)
 *   BRT_API_URL, BRT_USER_ID, BRT_PASSWORD       real BRT tracking credentials
 *
 * Internal status vocabulary — MUST match the shipments.stato ENUM:
 *   preso_in_carico | in_transito | in_consegna | consegnato | problema
 */

const INTERNAL_STATUSES = ['preso_in_carico', 'in_transito', 'in_consegna', 'consegnato', 'problema'];

const STATUS_LABEL = {
  preso_in_carico: 'Preso in carico dal corriere',
  in_transito:     'In transito',
  in_consegna:     'In consegna',
  consegnato:      'Consegnato',
  problema:        'Problema — contatta il corriere',
};

/* ── BRT status text → internal status ────────────────────────────────────────
   BRT returns free-text / coded events; this maps the common ones. Extend with
   the full BRT event-code table once a real account is connected. */
function mapBrtStatus(raw) {
  const s = String(raw || '').toLowerCase();
  if (/consegnat|delivered/.test(s))                       return 'consegnato';
  if (/in consegna|out for delivery|in distribuzione/.test(s)) return 'in_consegna';
  if (/transit|in viaggio|partit|in transito|lavorazione/.test(s)) return 'in_transito';
  if (/presa in carico|accettazione|ritirat|picked|preso in carico/.test(s)) return 'preso_in_carico';
  if (/giacenz|anomal|errore|problem|mancata/.test(s))     return 'problema';
  return 'in_transito';
}

/* ── Real BRT adapter (config-gated) ──────────────────────────────────────────
   Uses global fetch (Node 18+). Returns { configured:false } when creds are
   absent so the caller degrades to the manual status. */
async function fetchBrt(trackingNumber) {
  const url    = process.env.BRT_API_URL;
  const userId = process.env.BRT_USER_ID;
  const pwd    = process.env.BRT_PASSWORD;
  if (!url || !userId || !pwd) return { configured: false, reason: 'no_credentials', courier: 'brt' };
  if (typeof fetch !== 'function') return { configured: false, reason: 'fetch_unavailable', courier: 'brt' };

  try {
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      // BRT "Tracking by parcel ID" request shape; exact schema depends on the account.
      body: JSON.stringify({ account: { userID: userId, password: pwd }, numberType: 'B', number: trackingNumber }),
    });
    if (!res.ok) return { configured: true, ok: false, reason: 'http_' + res.status, courier: 'brt' };
    const data = await res.json();
    const events = extractBrtEvents(data);
    const last = events.length ? events[events.length - 1] : null;
    return {
      configured: true,
      ok: true,
      courier: 'brt',
      status: last ? mapBrtStatus(last.label) : 'in_transito',
      events,
    };
  } catch (err) {
    return { configured: true, ok: false, reason: err.message, courier: 'brt' };
  }
}

/* Best-effort extraction of the BRT event list — tolerant of shape variations. */
function extractBrtEvents(data) {
  const root = (data && (data.TrackingByReferenceResult || data.result || data)) || {};
  const raw  = root.EVENTI || root.events || root.eventi || [];
  const list = Array.isArray(raw) ? raw : [];
  return list.map(function (e) {
    const label = e.DESCRIZIONE_EVENTO || e.description || e.status || e.stato || '';
    const at    = e.DATA_EVENTO || e.date || e.timestamp || null;
    return { label: String(label), at: at ? String(at) : null };
  });
}

/* ── SIMULATE mode ────────────────────────────────────────────────────────────
   Deterministic status derived from the tracking number, so the same parcel
   always reports the same stage across calls (no Math.random). Lets the whole
   ship → refresh → deliver flow be verified offline with zero courier creds. */
function simulateStatus(courierCode, trackingNumber) {
  const pipeline = ['preso_in_carico', 'in_transito', 'in_consegna', 'consegnato'];
  let h = 0;
  const tn = String(trackingNumber);
  for (let i = 0; i < tn.length; i++) h = (h * 31 + tn.charCodeAt(i)) >>> 0;
  const idx = h % pipeline.length;
  const status = pipeline[idx];

  // Synthetic timeline up to and including the current stage.
  const now = Date.now();
  const events = [];
  for (let i = 0; i <= idx; i++) {
    events.push({
      label: STATUS_LABEL[pipeline[i]],
      at: new Date(now - (idx - i) * 86400000).toISOString(),
    });
  }
  return { configured: true, ok: true, simulated: true, courier: String(courierCode || '').toLowerCase(), status, events };
}

/* ── Adapter registry — ONE carrier for the prototype ─────────────────────────*/
const ADAPTERS = { brt: fetchBrt };

/**
 * Fetch live tracking status for a shipment.
 * @param {string} courierCode
 * @param {string} trackingNumber
 * @returns {Promise<{configured:boolean, ok?:boolean, simulated?:boolean,
 *                     courier?:string, status?:string, events?:Array, reason?:string}>}
 */
async function fetchTrackingStatus(courierCode, trackingNumber) {
  const code = String(courierCode || '').toLowerCase();
  if (!trackingNumber) return { configured: false, reason: 'no_tracking_number', courier: code };

  // SIMULATE takes precedence so a demo/local box works without any adapter creds.
  if (process.env.COURIER_TRACKING_SIMULATE === '1') return simulateStatus(code, trackingNumber);

  const adapter = ADAPTERS[code];
  if (!adapter) return { configured: false, reason: 'no_adapter', courier: code };
  return adapter(trackingNumber);
}

module.exports = {
  fetchTrackingStatus,
  mapBrtStatus,
  simulateStatus,
  INTERNAL_STATUSES,
  STATUS_LABEL,
};
