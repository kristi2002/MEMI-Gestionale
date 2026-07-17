'use strict';

/**
 * refunds.js — the single money-back primitive.
 * ──────────────────────────────────────────────────────────
 * One place that actually moves money back to the customer, dispatched by the
 * order's payment_intent_id prefix:
 *   • 'sumup_…' → SumUp refund API   • 'pi_…' (or anything else) → Stripe
 * Reused by the Resi refund endpoint AND order cancellation, so both flows
 * behave identically. Provider-agnostic bookkeeping (restock / points / totals)
 * stays in order-compensation.js — this file ONLY talks to the payment provider.
 */

const providers = require('./payment-providers');

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  return require('stripe')(process.env.STRIPE_SECRET_KEY);
}

/** True when at least one provider capable of refunding the given intent is configured. */
function canRefund(paymentIntentId) {
  const isSumup = /^sumup_/.test(String(paymentIntentId || ''));
  return isSumup ? providers.sumupConfigured() : Boolean(process.env.STRIPE_SECRET_KEY);
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

  if (/^sumup_/.test(pid)) {
    if (!providers.sumupConfigured()) {
      const e = new Error('SumUp non configurato sul server.'); e.code = 'NO_PROVIDER'; throw e;
    }
    const r = await providers.refundSumupCheckout(pid.slice('sumup_'.length), cents);
    return { id: r.transactionId || null, provider: 'sumup' };
  }

  const stripe = getStripe();
  if (!stripe) { const e = new Error('Stripe non configurato sul server.'); e.code = 'NO_PROVIDER'; throw e; }
  const refund = await stripe.refunds.create({ payment_intent: pid, amount: cents });
  return { id: refund.id || null, provider: 'stripe' };
}

module.exports = { issueProviderRefund, canRefund, getStripe };
