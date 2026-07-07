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
// Returns the Stripe publishable key so the frontend can initialise Stripe.js
// The secret key never leaves the server.
router.get('/config', (req, res) => {
  const pk = process.env.STRIPE_PUBLISHABLE_KEY || null;
  return res.json({ publishableKey: pk });
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
