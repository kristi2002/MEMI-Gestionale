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

/* ── Generic tracking aggregator (AfterShip-style) ────────────────────────────
   ONE API + key covers every courier, so "Aggiorna" works for GLS/DHL/Poste/SDA…
   not just BRT. Config-gated exactly like the BRT adapter: no key → {configured:false}
   and the caller degrades to the manually-set status. Maps our courier codes to the
   aggregator's carrier slugs (falls back to the raw code). Env:
     TRACKING_AGGREGATOR_KEY (or AFTERSHIP_API_KEY), TRACKING_AGGREGATOR_URL (optional). */
const AGGREGATOR_CARRIER = {
  brt: 'brt', bartolini: 'brt',
  gls: 'gls-italy', dhl: 'dhl',
  poste: 'poste-italiane', pi: 'poste-italiane',
  sda: 'sda-it', ups: 'ups', fedex: 'fedex', tnt: 'tnt',
};

/* AfterShip tag → internal status vocabulary. */
function mapAggregatorStatus(tag) {
  const s = String(tag || '').toLowerCase();
  if (/delivered/.test(s))                       return 'consegnato';
  if (/outfordelivery|out_for_delivery/.test(s)) return 'in_consegna';
  if (/intransit|in_transit/.test(s))            return 'in_transito';
  if (/inforeceived|info_received|pending/.test(s)) return 'preso_in_carico';
  if (/exception|attemptfail|failedattempt|expired/.test(s)) return 'problema';
  return 'in_transito';
}

async function fetchAggregator(courierCode, trackingNumber) {
  const key = process.env.TRACKING_AGGREGATOR_KEY || process.env.AFTERSHIP_API_KEY;
  if (!key) return { configured: false, reason: 'no_aggregator_key', courier: courierCode };
  if (typeof fetch !== 'function') return { configured: false, reason: 'fetch_unavailable', courier: courierCode };
  const code = String(courierCode || '').toLowerCase();
  const slug = AGGREGATOR_CARRIER[code] || code;
  const base = process.env.TRACKING_AGGREGATOR_URL || 'https://api.aftership.com/v4';
  try {
    const res = await fetch(`${base}/trackings/${encodeURIComponent(slug)}/${encodeURIComponent(trackingNumber)}`, {
      headers: { 'aftership-api-key': key, 'Content-Type': 'application/json' },
    });
    if (!res.ok) return { configured: true, ok: false, reason: 'http_' + res.status, courier: slug };
    const data = await res.json();
    const t = (data && data.data && data.data.tracking) || {};
    const checkpoints = Array.isArray(t.checkpoints) ? t.checkpoints : [];
    const events = checkpoints.map((c) => ({
      label: String(c.message || c.subtag_message || c.tag || ''),
      at: c.checkpoint_time || c.created_at || null,
    }));
    return { configured: true, ok: true, aggregator: true, courier: slug, status: mapAggregatorStatus(t.tag), events };
  } catch (err) {
    return { configured: true, ok: false, reason: err.message, courier: slug };
  }
}

/* ── Persist a courier's event timeline (deduped by tracking+label+time). Best-effort:
   swallows its own errors so a tracking refresh/webhook never fails on logging. ── */
async function persistTrackingEvents(pool, opts) {
  const { orderId, trackingNumber, events, source, status } = opts || {};
  if (!pool || !orderId || !trackingNumber || !Array.isArray(events) || !events.length) return 0;
  let inserted = 0;
  for (const ev of events) {
    const label = String((ev && ev.label) || '').slice(0, 255);
    if (!label) continue;
    const at = ev && ev.at ? new Date(ev.at) : null;
    const atStr = at && !isNaN(at.getTime()) ? at.toISOString().slice(0, 19).replace('T', ' ') : null;
    const dedup = `${trackingNumber}|${label}|${atStr || ''}`.slice(0, 200);
    try {
      const [r] = await pool.execute(
        `INSERT IGNORE INTO shipment_events (order_id, tracking_number, status, label, event_at, source, dedup_key)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [orderId, trackingNumber, status || null, label, atStr, source || 'refresh', dedup]
      );
      if (r && r.affectedRows) inserted += r.affectedRows;
    } catch (_) { /* best-effort */ }
  }
  return inserted;
}

/* ── Adapter registry — dedicated adapters take precedence over the aggregator ──*/
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

  // A dedicated adapter (e.g. BRT) wins when its credentials are set; otherwise the
  // generic aggregator covers every courier with one key. Both are config-gated.
  const adapter = ADAPTERS[code];
  if (adapter) {
    const r = await adapter(trackingNumber);
    if (r && r.configured !== false) return r;
  }
  return fetchAggregator(code, trackingNumber);
}

module.exports = {
  fetchTrackingStatus,
  fetchAggregator,
  mapBrtStatus,
  mapAggregatorStatus,
  persistTrackingEvents,
  simulateStatus,
  INTERNAL_STATUSES,
  STATUS_LABEL,
};
