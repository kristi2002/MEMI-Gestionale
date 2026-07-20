'use strict';

/**
 * Tracking webhook — receives pushed status updates from the tracking aggregator
 * (AfterShip payload shape) so a shipment's status updates without anyone clicking
 * "Aggiorna". Mounted in server.js BEFORE express.json() with express.raw(): HMAC
 * signature verification needs the exact raw request body.
 *
 * Config-gated, mirroring the Stripe/PayPal webhooks:
 *   - TRACKING_WEBHOOK_SECRET unset  → 503 (feature off; nothing to spoof).
 *   - set → verify HMAC-SHA256(rawBody) base64 against the `aftership-hmac-sha256`
 *     header (timing-safe); mismatch → 401. Only verified events mutate an order.
 */

const crypto = require('crypto');
const { pool } = require('../db');
const { sendOrderStatusUpdate } = require('../email');
const { persistTrackingEvents, mapAggregatorStatus, INTERNAL_STATUSES } = require('../courier-tracking');

function timingSafeEq(a, b) {
  const ba = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  if (ba.length !== bb.length) return false;
  try { return crypto.timingSafeEqual(ba, bb); } catch (_) { return false; }
}

async function handler(req, res) {
  const secret = process.env.TRACKING_WEBHOOK_SECRET;
  if (!secret) return res.status(503).json({ error: 'Webhook tracking non configurato' });

  // req.body is a Buffer (express.raw). Verify the signature over the raw bytes.
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body || ''));
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('base64');
  const provided = req.headers['aftership-hmac-sha256'] || req.headers['x-tracking-hmac-sha256'] || '';
  if (!timingSafeEq(expected, provided)) return res.status(401).json({ error: 'Firma non valida' });

  let payload;
  try { payload = JSON.parse(raw.toString('utf8')); } catch (_) { return res.status(400).json({ error: 'JSON non valido' }); }

  const tracking = (payload && payload.msg && payload.msg.tracking) || (payload && payload.tracking) || {};
  const trackingNumber = tracking.tracking_number;
  if (!trackingNumber) return res.status(200).json({ ok: true, ignored: 'no_tracking_number' });

  const mapped = mapAggregatorStatus(tracking.tag);
  const status = INTERNAL_STATUSES.includes(mapped) ? mapped : 'in_transito';
  const checkpoints = Array.isArray(tracking.checkpoints) ? tracking.checkpoints : [];
  const events = checkpoints.map((c) => ({
    label: String(c.message || c.subtag_message || c.tag || ''),
    at: c.checkpoint_time || c.created_at || null,
  }));

  try {
    const [[o]] = await pool.execute(
      'SELECT id, order_number, customer_nome, customer_email, courier_code, order_status FROM orders WHERE tracking_number = ? LIMIT 1',
      [trackingNumber]
    );
    if (!o) return res.status(200).json({ ok: true, ignored: 'order_not_found' });

    await pool.execute('UPDATE shipments SET stato = ? WHERE order_id = ?', [status, o.id]);
    let promoted = false;
    if (status === 'consegnato' && o.order_status !== 'consegnato') {
      await pool.execute(
        "UPDATE orders SET order_status = 'consegnato', delivered_at = COALESCE(delivered_at, CURRENT_TIMESTAMP) WHERE id = ?",
        [o.id]
      );
      promoted = true;
    }
    if (events.length) await persistTrackingEvents(pool, { orderId: o.id, trackingNumber, events, source: 'webhook', status });
    if (promoted) {
      sendOrderStatusUpdate({
        order_number: o.order_number, nome: o.customer_nome, email: o.customer_email,
        status: 'consegnato', tracking_number: trackingNumber, courier_code: o.courier_code,
      }).catch(() => {});
    }
    return res.json({ ok: true, order: o.order_number, status });
  } catch (err) {
    console.error('tracking webhook error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
}

module.exports = { handler };
