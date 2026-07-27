'use strict';

/**
 * refunds.js — the single money-back primitive.
 * ──────────────────────────────────────────────────────────
 * One place that actually moves money back to the customer, dispatched by the
 * order's payment_intent_id prefix:
 *   • 'sumup_…' → SumUp   • 'paypal_…' → PayPal   • 'pi_…' → Stripe
 * Anything else is 'unknown' and refuses rather than guessing: sending a PayPal order id
 * to stripe.refunds.create() is a guaranteed failure, and it used to abort the whole
 * cancellation instead of degrading to a manual refund.
 * Reused by the Resi refund endpoint AND order cancellation, so both flows
 * behave identically. Provider-agnostic bookkeeping (restock / points / totals)
 * stays in order-compensation.js — this file ONLY talks to the payment provider.
 */

const providers = require('./payment-providers');

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  return require('stripe')(process.env.STRIPE_SECRET_KEY);
}

/**
 * Which provider owns a stored payment reference. Prefixes are written at order time
 * (orders.js); Stripe PaymentIntents are always 'pi_…'.
 * @returns {'sumup'|'paypal'|'stripe'|'unknown'}
 */
function providerFor(paymentIntentId) {
  const s = String(paymentIntentId || '');
  if (s.startsWith('sumup_'))  return 'sumup';
  if (s.startsWith('paypal_')) return 'paypal';
  if (s.startsWith('pi_'))     return 'stripe';
  return 'unknown';
}

/** True when the provider that owns this reference is configured and can refund it. */
function canRefund(paymentIntentId) {
  switch (providerFor(paymentIntentId)) {
    case 'sumup':  return providers.sumupConfigured();
    case 'paypal': return providers.paypalConfigured();
    case 'stripe': return Boolean(process.env.STRIPE_SECRET_KEY);
    default:       return false;   // unknown/manual rail → caller degrades to a manual refund
  }
}

/**
 * Issue a real refund of `amountCents` against a payment intent.
 * @returns {Promise<{ id: string|null, provider: 'sumup'|'stripe' }>}
 * @throws  an Error (with .code) when no provider is configured or the provider call fails.
 */
async function issueProviderRefund(paymentIntentId, amountCents) {
  const pid = String(paymentIntentId || '');
  const cents = Math.round(Number(amountCents) || 0);
  if (cents < 1) { const e = new Error('Importo rimborso non valido'); e.code = 'BAD_AMOUNT'; throw e; }

  const provider = providerFor(pid);

  if (provider === 'sumup') {
    if (!providers.sumupConfigured()) {
      const e = new Error('SumUp non configurato sul server.'); e.code = 'NO_PROVIDER'; throw e;
    }
    const r = await providers.refundSumupCheckout(pid.slice('sumup_'.length), cents);
    return { id: r.transactionId || null, provider: 'sumup' };
  }

  if (provider === 'paypal') {
    if (!providers.paypalConfigured()) {
      const e = new Error('PayPal non configurato sul server.'); e.code = 'NO_PROVIDER'; throw e;
    }
    const r = await providers.refundPaypalOrder(pid.slice('paypal_'.length), cents);
    return { id: r.refundId || null, provider: 'paypal' };
  }

  if (provider !== 'stripe') {
    // Not a rail we can move money on (manual/bank transfer, or a reference from before
    // prefixes existed). Signal NO_PROVIDER so cancellation degrades to "rimborso manuale"
    // instead of failing the whole operation.
    const e = new Error('Rimborso automatico non disponibile per questo metodo di pagamento.');
    e.code = 'NO_PROVIDER'; throw e;
  }

  const stripe = getStripe();
  if (!stripe) { const e = new Error('Stripe non configurato sul server.'); e.code = 'NO_PROVIDER'; throw e; }
  const refund = await stripe.refunds.create({ payment_intent: pid, amount: cents });
  return { id: refund.id || null, provider: 'stripe' };
}

module.exports = { issueProviderRefund, canRefund, providerFor, getStripe };
