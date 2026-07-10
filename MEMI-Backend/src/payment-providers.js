'use strict';

/**
 * Alternative payment providers — PayPal & Klarna.
 * ────────────────────────────────────────────────
 * SCAFFOLDING (added 2026-07-10). Both providers are **config-gated exactly like Stripe**:
 * with no credentials set every entry point reports "not configured" and the routes/checkout
 * return 503 — nothing breaks, the UI simply hides the option. The moment the client sets the
 * env vars below, the flow is live. The PayPal path implements the real Orders v2 REST calls
 * (OAuth → create-order → capture → verify) so it works as soon as credentials exist; the
 * Klarna path implements the Payments-API session/authorize shape and is marked where a live
 * account's region/flow must be confirmed (`// TODO(klarna-live)`).
 *
 * Nothing here can be end-to-end tested without the client's sandbox/live merchant accounts,
 * so it must NOT silently mark orders paid: verification failures throw and the order handler
 * refuses the order (never a silent `in_attesa`). See docs/SECURITY.md + docs/ENVIRONMENT.md.
 *
 * Env:
 *   PAYPAL_CLIENT_ID, PAYPAL_SECRET, PAYPAL_ENV=sandbox|live   (PayPal Orders v2)
 *   KLARNA_USERNAME, KLARNA_PASSWORD, KLARNA_REGION=eu|na|oc, KLARNA_ENV=playground|live
 */

// ── config detection ─────────────────────────────────────────
function paypalConfigured() {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_SECRET);
}
function klarnaConfigured() {
  return Boolean(process.env.KLARNA_USERNAME && process.env.KLARNA_PASSWORD);
}
function paypalEnv() {
  return process.env.PAYPAL_ENV === 'live' ? 'live' : 'sandbox';
}
function paypalBase() {
  return paypalEnv() === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
}
function klarnaBase() {
  const live = process.env.KLARNA_ENV === 'live';
  const region = (process.env.KLARNA_REGION || 'eu').toLowerCase();
  // EU has no region prefix; NA/OC do. Playground mirrors the same host shape.
  const host = live ? 'api' : 'api.playground';
  const prefix = region === 'na' ? '-na' : region === 'oc' ? '-oc' : '';
  return `https://${host}${prefix}.klarna.com`;
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

// ── Klarna (Payments API) — structural scaffold ──────────────
function klarnaAuthHeader() {
  const creds = Buffer.from(`${process.env.KLARNA_USERNAME}:${process.env.KLARNA_PASSWORD}`).toString('base64');
  return `Basic ${creds}`;
}

/**
 * Create a Klarna payment session for the cart. Returns { session_id, client_token }.
 * The storefront then mounts Klarna.js with the client_token; on buyer authorization it
 * receives an `authorization_token` which it sends to POST /klarna/create-order below.
 */
async function createKlarnaSession({ amountCents, orderLines, locale = 'it-IT', country = 'IT', currency = 'EUR' }) {
  const body = await httpJson(`${klarnaBase()}/payments/v1/sessions`, {
    method: 'POST',
    headers: { Authorization: klarnaAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      purchase_country: country,
      purchase_currency: currency,
      locale,
      order_amount: Math.round(amountCents),
      order_lines: orderLines || [{
        name: 'Ordine MEMI', quantity: 1,
        unit_price: Math.round(amountCents), total_amount: Math.round(amountCents),
      }],
    }),
  });
  return { session_id: body.session_id, client_token: body.client_token };
}

/**
 * Turn a buyer-authorized Klarna session into an order. Returns { order_id, amountCents, currency }.
 * TODO(klarna-live): confirm the merchant reference/urls and Order-Management verification flow
 * against the client's live account before relying on this to mark orders paid.
 */
async function createKlarnaOrder(authorizationToken, { amountCents, orderLines, currency = 'EUR' }) {
  const body = await httpJson(`${klarnaBase()}/payments/v1/authorizations/${encodeURIComponent(authorizationToken)}/order`, {
    method: 'POST',
    headers: { Authorization: klarnaAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      purchase_currency: currency,
      order_amount: Math.round(amountCents),
      order_lines: orderLines || [{
        name: 'Ordine MEMI', quantity: 1,
        unit_price: Math.round(amountCents), total_amount: Math.round(amountCents),
      }],
    }),
  });
  return { order_id: body.order_id, amountCents: Math.round(amountCents), currency };
}

/** Verify a Klarna order amount via Order Management. Throws on mismatch. */
async function verifyKlarnaOrder(orderId, expectedCents) {
  const info = await httpJson(`${klarnaBase()}/ordermanagement/v1/orders/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: klarnaAuthHeader() },
  });
  const amountCents = Number(info.order_amount);
  if (info.purchase_currency !== 'EUR') throw new Error(`Klarna currency mismatch (${info.purchase_currency})`);
  if (amountCents !== Math.round(expectedCents))
    throw new Error(`Klarna amount mismatch (got ${amountCents}, expected ${Math.round(expectedCents)})`);
  return { ok: true, amountCents, currency: info.purchase_currency };
}

module.exports = {
  paypalConfigured, klarnaConfigured, paypalEnv,
  createPaypalOrder, capturePaypalOrder, inspectPaypalOrder, verifyPaypalOrder,
  createKlarnaSession, createKlarnaOrder, verifyKlarnaOrder,
};
