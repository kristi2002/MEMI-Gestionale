'use strict';

/**
 * Alternative payment provider — PayPal.
 * ────────────────────────────────────────────────
 * SCAFFOLDING (added 2026-07-10). Both providers are **config-gated exactly like Stripe**:
 * with no credentials set every entry point reports "not configured" and the routes/checkout
 * return 503 — nothing breaks, the UI simply hides the option. The moment the client sets the
 * env vars below, the flow is live. The PayPal path implements the real Orders v2 REST calls
 * (OAuth → create-order → capture → verify) so it works as soon as credentials exist.
 *
 * Nothing here can be end-to-end tested without the client's sandbox/live merchant accounts,
 * so it must NOT silently mark orders paid: verification failures throw and the order handler
 * refuses the order (never a silent `in_attesa`). See docs/SECURITY.md + docs/ENVIRONMENT.md.
 *
 * Env:
 *   PAYPAL_CLIENT_ID, PAYPAL_SECRET, PAYPAL_ENV=sandbox|live   (PayPal Orders v2)
 */

// ── config detection ─────────────────────────────────────────
function paypalConfigured() {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_SECRET);
}
function paypalEnv() {
  return process.env.PAYPAL_ENV === 'live' ? 'live' : 'sandbox';
}
function paypalBase() {
  return paypalEnv() === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
}
// Small fetch helper that throws a useful error on non-2xx.
async function httpJson(url, opts) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch (_) { body = { raw: text }; }
  if (!res.ok) {
    const msg = (body && (body.message || body.error_description || body.error)) || `HTTP ${res.status}`;
    const err = new Error(`${url.split('/').slice(0, 3).join('/')} → ${res.status}: ${msg}`);
    err.status = res.status; err.body = body;
    throw err;
  }
  return body;
}

// ── PayPal (Orders v2) ───────────────────────────────────────
async function paypalAccessToken() {
  const creds = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_SECRET}`).toString('base64');
  const body = await httpJson(`${paypalBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  return body.access_token;
}

/** Create a PayPal order for `amountCents` EUR. Returns { id, status }. */
async function createPaypalOrder(amountCents) {
  const token = await paypalAccessToken();
  const value = (Math.round(amountCents) / 100).toFixed(2);
  const body = await httpJson(`${paypalBase()}/v2/checkout/orders`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{ amount: { currency_code: 'EUR', value } }],
    }),
  });
  return { id: body.id, status: body.status };
}

/** Capture an approved PayPal order. Returns { status, amountCents, currency }. */
async function capturePaypalOrder(orderId) {
  const token = await paypalAccessToken();
  const body = await httpJson(`${paypalBase()}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  const cap = body?.purchase_units?.[0]?.payments?.captures?.[0];
  const amt = cap?.amount;
  return {
    status: cap?.status || body.status,          // COMPLETED on success
    amountCents: amt ? Math.round(Number(amt.value) * 100) : null,
    currency: amt?.currency_code || null,
  };
}

/**
 * Inspect a PayPal order WITHOUT capturing. Returns { status, amountCents, currency }.
 * For an APPROVED order the amount comes from purchase_units[].amount; for a COMPLETED order
 * (already captured — e.g. an idempotent retry) it comes from the capture. The order handler
 * uses this to verify the buyer approved the right amount, then captures only AFTER the order
 * is safely persisted (so an oversell/stock 409 can't leave the buyer charged with no order).
 */
async function inspectPaypalOrder(orderId) {
  const token = await paypalAccessToken();
  const info = await httpJson(`${paypalBase()}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const pu = info && info.purchase_units && info.purchase_units[0];
  let amountCents = null, currency = null;
  if (info.status === 'COMPLETED') {
    const cap = pu && pu.payments && pu.payments.captures && pu.payments.captures[0];
    if (cap && cap.amount) { amountCents = Math.round(Number(cap.amount.value) * 100); currency = cap.amount.currency_code; }
  } else if (pu && pu.amount) {
    amountCents = Math.round(Number(pu.amount.value) * 100); currency = pu.amount.currency_code;
  }
  return { status: info.status, amountCents, currency };
}

/**
 * Verify a PayPal order matches the expected amount and is captured/completed.
 * (Retained for reference/webhook use. The order handler now uses inspectPaypalOrder +
 * capture-after-commit instead, so a post-payment failure never leaves a charged-but-orderless
 * buyer.) Idempotent: captures an APPROVED order, verifies a COMPLETED one.
 */
async function verifyPaypalOrder(orderId, expectedCents) {
  const token = await paypalAccessToken();
  const info = await httpJson(`${paypalBase()}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  let amountCents, currency, status = info.status;
  if (status === 'COMPLETED') {
    const cap = info?.purchase_units?.[0]?.payments?.captures?.[0];
    amountCents = cap ? Math.round(Number(cap.amount.value) * 100) : null;
    currency = cap?.amount?.currency_code;
  } else if (status === 'APPROVED') {
    const captured = await capturePaypalOrder(orderId);
    status = captured.status; amountCents = captured.amountCents; currency = captured.currency;
  } else {
    throw new Error(`PayPal order ${orderId} not payable (status ${status})`);
  }
  if (status !== 'COMPLETED') throw new Error(`PayPal capture not completed (status ${status})`);
  if (currency !== 'EUR')     throw new Error(`PayPal currency mismatch (${currency})`);
  if (Number(amountCents) !== Math.round(expectedCents))
    throw new Error(`PayPal amount mismatch (got ${amountCents}, expected ${Math.round(expectedCents)})`);
  return { ok: true, amountCents, currency };
}

/**
 * Verify a PayPal webhook's authenticity via /v1/notifications/verify-webhook-signature.
 * Unlike Stripe (raw-body HMAC), PayPal re-verifies from the parsed event + transmission
 * headers + the configured PAYPAL_WEBHOOK_ID. Returns { verified, reason }.
 * Never throws for a "not verified" outcome — only for network/token failures.
 */
async function verifyPaypalWebhook(headers, event) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) return { verified: false, reason: 'no_webhook_id' };
  const h = headers || {};
  const token = await paypalAccessToken();
  const payload = {
    auth_algo:         h['paypal-auth-algo'],
    cert_url:          h['paypal-cert-url'],
    transmission_id:   h['paypal-transmission-id'],
    transmission_sig:  h['paypal-transmission-sig'],
    transmission_time: h['paypal-transmission-time'],
    webhook_id:        webhookId,
    webhook_event:     event,
  };
  const res = await httpJson(`${paypalBase()}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { verified: res && res.verification_status === 'SUCCESS', reason: (res && res.verification_status) || 'unknown' };
}

module.exports = {
  paypalConfigured, paypalEnv,
  createPaypalOrder, capturePaypalOrder, inspectPaypalOrder, verifyPaypalOrder,
  verifyPaypalWebhook,
};
