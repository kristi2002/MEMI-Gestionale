'use strict';

/**
 * /api/payments  — Stripe PaymentIntent management
 *
 * POST /api/payments/create-intent
 *   Body: { amount_cents: number }
 *   Returns: { client_secret, payment_intent_id }
 *
 * Requires STRIPE_SECRET_KEY env var. If not set, returns 503.
 *
 * POST /api/payments/webhook  (mounted directly on `app`, NOT under this router — see
 *   server.js. Needs the raw request body for signature verification, so it must be
 *   registered before the global express.json() body parser.) Exported as
 *   `stripeWebhookHandler` below.
 */

const router = require('express').Router();
const { pool } = require('../db');
const { ensureInvoiceForOrder } = require('../invoicing');
const { validateBody, createIntentSchema } = require('../validation');
const providers = require('../payment-providers');   // PayPal scaffolding (config-gated)

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  return require('stripe')(process.env.STRIPE_SECRET_KEY);
}

/* ── POST /api/payments/create-intent ── */
router.post('/create-intent', validateBody(createIntentSchema), async (req, res) => {
  const stripe = getStripe();
  if (!stripe) {
    return res.status(503).json({ error: 'Pagamenti non configurati sul server.' });
  }

  const { amount_cents } = req.body;
  if (!amount_cents || typeof amount_cents !== 'number' || amount_cents < 50) {
    return res.status(400).json({ error: 'Importo non valido (minimo €0.50).' });
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount:   Math.round(amount_cents),
      currency: 'eur',
      automatic_payment_methods: { enabled: true },
    });

    res.json({
      client_secret:     paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
    });
  } catch (err) {
    (req.log || console).error({ err }, '[Stripe] create-intent error');
    res.status(502).json({ error: 'Errore Stripe: ' + (err.message || 'sconosciuto') });
  }
});

/* ── GET /api/payments/config ── */
// Public, non-secret config the checkout uses to decide which payment methods to offer and
// how to initialise their client SDKs. The Stripe publishable key and PayPal client-id are
// designed to be public; secrets never leave the server. Providers with no credentials set
// report `false` so the storefront hides the option instead of dead-ending on it.
router.get('/config', (req, res) => {
  return res.json({
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null,   // back-compat top-level field
    providers: {
      stripe: Boolean(process.env.STRIPE_SECRET_KEY),
      paypal: providers.paypalConfigured(),
    },
    paypal: providers.paypalConfigured()
      ? { clientId: process.env.PAYPAL_CLIENT_ID, env: providers.paypalEnv() }
      : null,
  });
});

// ── PayPal (config-gated) ─────────────────────────────────────
// Standard Orders v2 flow: create-order → (buyer approves in the PayPal popup) → capture.
// The final trust check is re-done server-side in POST /api/orders (verifyPaypalOrder), so
// these endpoints are conveniences for the PayPal JS SDK, not the source of truth.
router.post('/paypal/create-order', validateBody(createIntentSchema), async (req, res) => {
  if (!providers.paypalConfigured())
    return res.status(503).json({ error: 'PayPal non configurato sul server.' });
  const { amount_cents } = req.body;
  if (!amount_cents || typeof amount_cents !== 'number' || amount_cents < 50)
    return res.status(400).json({ error: 'Importo non valido (minimo €0.50).' });
  try {
    const order = await providers.createPaypalOrder(amount_cents);
    return res.json(order);   // { id, status }
  } catch (err) {
    (req.log || console).error({ err }, '[PayPal] create-order error');
    return res.status(502).json({ error: 'Errore PayPal: ' + (err.message || 'sconosciuto') });
  }
});

router.post('/paypal/capture', async (req, res) => {
  if (!providers.paypalConfigured())
    return res.status(503).json({ error: 'PayPal non configurato sul server.' });
  const orderId = req.body && req.body.paypal_order_id;
  if (!orderId) return res.status(400).json({ error: 'paypal_order_id mancante' });
  try {
    const result = await providers.capturePaypalOrder(String(orderId));
    return res.json(result);   // { status, amountCents, currency }
  } catch (err) {
    (req.log || console).error({ err }, '[PayPal] capture error');
    return res.status(502).json({ error: 'Errore PayPal: ' + (err.message || 'sconosciuto') });
  }
});

/* ── Provider webhooks (config-gated stubs) ──
 * Mounted under this JSON-parsed router (unlike the Stripe webhook, which needs the raw body).
 * PayPal signature verification against the client's live account is a TODO once
 * credentials exist; until then these reconcile a known in_attesa order to pagato only when the
 * matching provider transaction reference is present, and otherwise just acknowledge (200) so
 * the provider doesn't retry. They never create orders. */
async function reconcileByReference(reference, res) {
  try {
    const [[order]] = await pool.execute(
      'SELECT id, order_number, payment_status FROM orders WHERE payment_intent_id = ?', [reference]
    );
    if (order && order.payment_status === 'in_attesa') {
      await pool.execute("UPDATE orders SET payment_status = 'pagato' WHERE id = ?", [order.id]);
      ensureInvoiceForOrder(pool, order.id).catch(() => {});
      console.log(`[Provider Webhook] order ${order.order_number} reconciled to 'pagato' (${reference})`);
    }
  } catch (err) {
    console.error('[Provider Webhook] reconcile error:', err.message);
  }
  return res.json({ received: true });
}

router.post('/paypal/webhook', async (req, res) => {
  if (!providers.paypalConfigured()) return res.status(503).json({ error: 'PayPal non configurato.' });

  // Signature verification: we only ever mutate order state on a webhook we can PROVE came
  // from PayPal. With PAYPAL_WEBHOOK_ID set we verify-or-reject; without it we acknowledge
  // (200) but never reconcile — otherwise a forged event referencing a known payment id could
  // flip an order to 'pagato' without a real payment.
  if (!process.env.PAYPAL_WEBHOOK_ID) {
    console.warn('[PayPal Webhook] PAYPAL_WEBHOOK_ID not set — event acknowledged but NOT trusted (no reconciliation). Set it before going live.');
    return res.json({ received: true, verified: false });
  }
  try {
    const v = await providers.verifyPaypalWebhook(req.headers, req.body || {});
    if (!v.verified) {
      console.error('[PayPal Webhook] signature verification failed:', v.reason);
      return res.status(400).json({ error: 'Firma webhook PayPal non valida.' });
    }
  } catch (err) {
    console.error('[PayPal Webhook] verification error:', err.message);
    return res.status(400).json({ error: 'Verifica firma webhook non riuscita.' });
  }

  const ev = req.body || {};
  const ref = ev?.resource?.supplementary_data?.related_ids?.order_id || ev?.resource?.id;
  if (ev.event_type === 'CHECKOUT.ORDER.APPROVED' || ev.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
    if (ref) return reconcileByReference(String(ref), res);
  }
  return res.json({ received: true });
});

/* ── POST /api/payments/webhook ──
 * Safety net, not the primary order-creation path (that's still POST /api/orders after
 * Stripe.js confirms client-side). Two things this catches that the primary path can't:
 *   - payment_intent.succeeded with no matching order: the customer's card was charged but
 *     the browser never completed POST /api/orders (closed tab, crash, network drop). We
 *     can't safely reconstruct the order (no cart/shipping data on a bare PaymentIntent), so
 *     this logs a loud warning for manual follow-up rather than guessing.
 *   - charge.dispute.created: logged for admin visibility; no automated action.
 * Requires the raw request body — see server.js for why this isn't behind express.json(). */
async function stripeWebhookHandler(req, res) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !webhookSecret) {
    console.error('[Stripe Webhook] received but STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET not configured');
    return res.status(503).json({ error: 'Webhook non configurato sul server.' });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], webhookSecret);
  } catch (err) {
    console.error('[Stripe Webhook] signature verification failed:', err.message);
    return res.status(400).json({ error: 'Firma webhook non valida.' });
  }

  try {
    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object;
      const [[existing]] = await pool.execute(
        'SELECT id, order_number, payment_status FROM orders WHERE payment_intent_id = ?', [pi.id]
      );
      if (!existing) {
        console.error(
          `[Stripe Webhook] ⚠️  payment_intent.succeeded (${pi.id}, ${pi.amount / 100} ${pi.currency}) ` +
          'has NO matching order — the customer was charged but no order was ever created. ' +
          'Investigate in the Stripe dashboard and follow up manually (refund or contact customer).'
        );
      } else if (existing.payment_status === 'in_attesa') {
        // Async payment confirmed after checkout responded: reconcile to 'pagato'
        // (and emit the invoice) so the dashboard revenue matches Stripe.
        await pool.execute("UPDATE orders SET payment_status = 'pagato' WHERE id = ?", [existing.id]);
        ensureInvoiceForOrder(pool, existing.id).catch(() => {});
        console.log(
          `[Stripe Webhook] order ${existing.order_number} reconciled to 'pagato' (${pi.id})`
        );
      }
    } else if (event.type === 'charge.dispute.created') {
      const dispute = event.data.object;
      console.error(
        `[Stripe Webhook] ⚠️  Dispute opened on charge ${dispute.charge} — ` +
        `${dispute.amount / 100} ${dispute.currency}, reason: ${dispute.reason}. Review in Stripe dashboard.`
      );
    }
    return res.json({ received: true });
  } catch (err) {
    console.error('[Stripe Webhook] handler error:', err.message);
    // Acknowledge anyway — Stripe retries on non-2xx, and a DB hiccup here shouldn't cause
    // repeated re-delivery of an event we already logged.
    return res.json({ received: true });
  }
}

module.exports = router;
module.exports.stripeWebhookHandler = stripeWebhookHandler;
