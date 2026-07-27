'use strict';
/* Refund provider routing — no network, no DB.
   Locks the bug this file was written for: a PayPal-paid order stored a bare PayPal order id,
   canRefund() answered "Stripe can do it", stripe.refunds.create() failed on an unknown intent,
   and because that error is not NO_PROVIDER the cancel endpoint 502'd — so a PayPal order
   could not be cancelled at all.
   Run: node test/refund-routing.test.cjs                                                     */
const assert = require('assert');
const Module = require('module');

let calls;
function reset() { calls = { sumup: [], paypal: [], stripe: [] }; }
reset();

let sumupOn = true, paypalOn = true;

const origLoad = Module._load;
Module._load = function (request) {
  if (request === './payment-providers') return {
    sumupConfigured:  () => sumupOn,
    paypalConfigured: () => paypalOn,
    refundSumupCheckout: async (id, cents) => { calls.sumup.push({ id, cents }); return { transactionId: 'tx_1' }; },
    refundPaypalOrder:   async (id, cents) => { calls.paypal.push({ id, cents }); return { refundId: 'rf_1', status: 'COMPLETED' }; },
  };
  if (request === 'stripe') return function () {
    return { refunds: { create: async (o) => { calls.stripe.push(o); return { id: 're_1' }; } } };
  };
  return origLoad.apply(this, arguments);
};

const { issueProviderRefund, canRefund, providerFor } = require('../src/refunds');

let pass = 0;
const ok = (label) => { pass++; console.log('  ✓ ' + label); };
async function throwsWith(fn, code, label) {
  try { await fn(); assert.fail('expected throw'); }
  catch (e) { assert.strictEqual(e.code, code, label + ': expected code ' + code + ', got ' + e.code); }
  ok(label);
}

(async () => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_x';

  /* ── 1. classification ─────────────────────────────────────── */
  assert.strictEqual(providerFor('sumup_abc'), 'sumup');
  assert.strictEqual(providerFor('paypal_5O190127TN364715T'), 'paypal');
  assert.strictEqual(providerFor('pi_3Abc'), 'stripe');
  assert.strictEqual(providerFor('5O190127TN364715T'), 'unknown');   // legacy bare PayPal id
  assert.strictEqual(providerFor(null), 'unknown');
  ok('providerFor classifies every rail (and refuses to guess)');

  /* ── 2. canRefund follows the owning provider's config ─────── */
  sumupOn = true; paypalOn = true;
  assert.strictEqual(canRefund('sumup_abc'), true);
  assert.strictEqual(canRefund('paypal_X'), true);
  assert.strictEqual(canRefund('pi_1'), true);
  assert.strictEqual(canRefund('5O190127TN364715T'), false);
  paypalOn = false;
  assert.strictEqual(canRefund('paypal_X'), false, 'PayPal unconfigured must not claim refundable');
  paypalOn = true;
  delete process.env.STRIPE_SECRET_KEY;
  assert.strictEqual(canRefund('pi_1'), false);
  process.env.STRIPE_SECRET_KEY = 'sk_test_x';
  ok('canRefund gates on the provider that actually owns the reference');

  /* ── 3. dispatch reaches the right API, and ONLY that one ──── */
  reset();
  let r = await issueProviderRefund('paypal_5O190127TN364715T', 2500);
  assert.deepStrictEqual(calls.paypal, [{ id: '5O190127TN364715T', cents: 2500 }], 'PayPal refund args');
  assert.strictEqual(calls.stripe.length, 0, 'REGRESSION: a PayPal refund must never reach Stripe');
  assert.strictEqual(r.provider, 'paypal');
  assert.strictEqual(r.id, 'rf_1');
  ok('paypal_ ref refunds via PayPal, prefix stripped, Stripe untouched');

  reset();
  r = await issueProviderRefund('sumup_ck_9', 1000);
  assert.deepStrictEqual(calls.sumup, [{ id: 'ck_9', cents: 1000 }]);
  assert.strictEqual(calls.stripe.length + calls.paypal.length, 0);
  assert.strictEqual(r.provider, 'sumup');
  ok('sumup_ ref refunds via SumUp');

  reset();
  r = await issueProviderRefund('pi_3Abc', 500);
  assert.deepStrictEqual(calls.stripe, [{ payment_intent: 'pi_3Abc', amount: 500 }]);
  assert.strictEqual(calls.paypal.length + calls.sumup.length, 0);
  assert.strictEqual(r.provider, 'stripe');
  ok('pi_ ref refunds via Stripe');

  /* ── 4. unrefundable rails degrade instead of exploding ────── */
  reset();
  await throwsWith(() => issueProviderRefund('5O190127TN364715T', 100), 'NO_PROVIDER',
    'bare/legacy reference -> NO_PROVIDER (cancel degrades to manual, no 502)');
  assert.strictEqual(calls.stripe.length, 0, 'unknown ref must not be handed to Stripe');

  paypalOn = false;
  await throwsWith(() => issueProviderRefund('paypal_X', 100), 'NO_PROVIDER',
    'PayPal unconfigured -> NO_PROVIDER, not a provider error');
  paypalOn = true;

  await throwsWith(() => issueProviderRefund('pi_1', 0), 'BAD_AMOUNT', 'zero amount rejected');

  console.log('\nALL ' + pass + ' refund-routing checks passed.');
})().catch((e) => { console.error('\nFAILED: ' + e.message); process.exit(1); });
