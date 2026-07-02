'use strict';
/* Stripe webhook handler tests — mock DB pool + mock Stripe, no live MySQL needed.
   Verifies (Phase 2 of docs/PRODUCTION-ROADMAP.md):
     - missing STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET -> 503, doesn't crash
     - bad signature -> 400
     - payment_intent.succeeded with a matching order -> 200, no warning logged
     - payment_intent.succeeded with NO matching order -> 200, but a warning IS logged
       (the "customer charged, no order created" safety-net case)
     - charge.dispute.created -> 200, warning logged
     - unrecognized event type -> 200, no crash
   Run: (cd MEMI-Backend && npm install && node test/webhook-logic.test.cjs)          */
const assert = require('assert');
const Module = require('module');

let ordersTable = [];
const mockPool = {
  execute: async (sql, params) => {
    if (/FROM orders WHERE payment_intent_id/i.test(sql)) {
      const found = ordersTable.find(o => o.payment_intent_id === params[0]);
      return [found ? [found] : []];
    }
    return [[]];
  },
};

let constructEventBehavior = null;
const origLoad = Module._load;
Module._load = function (request) {
  if (request === '../db') return { pool: mockPool, testConnection: async () => {} };
  if (request === 'stripe') {
    return function () {
      return { webhooks: { constructEvent: (...args) => constructEventBehavior(...args) } };
    };
  }
  return origLoad.apply(this, arguments);
};

const payments = require('../src/routes/payments');
const { stripeWebhookHandler } = payments;

function mockRes() {
  return { code: 200, body: null, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; } };
}
function mockReq(headers) {
  return { body: Buffer.from('{}'), headers: headers || {} };
}

(async () => {
  let n = 0;
  const origError = console.error;
  let errorLogs = [];
  console.error = (...args) => { errorLogs.push(args.join(' ')); };

  // T1: not configured at all -> 503
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  let res = mockRes();
  await stripeWebhookHandler(mockReq(), res);
  assert.strictEqual(res.code, 503, 'T1 expected 503 when unconfigured');
  n++; console.log('  ✓ T1 unconfigured (no STRIPE_SECRET_KEY/WEBHOOK_SECRET) -> 503');

  // T2: secret key set but webhook secret missing -> 503
  process.env.STRIPE_SECRET_KEY = 'sk_test_x';
  delete process.env.STRIPE_WEBHOOK_SECRET;
  res = mockRes();
  await stripeWebhookHandler(mockReq(), res);
  assert.strictEqual(res.code, 503, 'T2 expected 503 when webhook secret missing');
  n++; console.log('  ✓ T2 STRIPE_SECRET_KEY set but no STRIPE_WEBHOOK_SECRET -> 503');

  // T3: both configured, bad signature -> 400
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
  constructEventBehavior = () => { throw new Error('signature mismatch'); };
  res = mockRes();
  await stripeWebhookHandler(mockReq({ 'stripe-signature': 'bad' }), res);
  assert.strictEqual(res.code, 400, 'T3 expected 400 on bad signature');
  n++; console.log('  ✓ T3 invalid signature -> 400');

  // T4: payment_intent.succeeded WITH a matching order -> 200, no warning
  ordersTable = [{ id: 1, payment_intent_id: 'pi_known', order_number: '#10300' }];
  constructEventBehavior = () => ({
    type: 'payment_intent.succeeded',
    data: { object: { id: 'pi_known', amount: 8900, currency: 'eur' } },
  });
  errorLogs = [];
  res = mockRes();
  await stripeWebhookHandler(mockReq({ 'stripe-signature': 'ok' }), res);
  assert.strictEqual(res.code, 200, 'T4 expected 200');
  assert.deepStrictEqual(res.body, { received: true }, 'T4 body received:true');
  assert.ok(!errorLogs.some(l => l.includes('NO matching order')), 'T4 no orphan-payment warning for a known order');
  n++; console.log('  ✓ T4 payment_intent.succeeded with matching order -> 200, no warning');

  // T5: payment_intent.succeeded with NO matching order -> 200, but warning logged
  ordersTable = [];
  constructEventBehavior = () => ({
    type: 'payment_intent.succeeded',
    data: { object: { id: 'pi_orphan', amount: 5000, currency: 'eur' } },
  });
  errorLogs = [];
  res = mockRes();
  await stripeWebhookHandler(mockReq({ 'stripe-signature': 'ok' }), res);
  assert.strictEqual(res.code, 200, 'T5 expected 200 (ack to Stripe even though we flagged it)');
  assert.ok(errorLogs.some(l => l.includes('pi_orphan') && l.includes('NO matching order')), 'T5 orphan-payment warning logged');
  n++; console.log('  ✓ T5 payment_intent.succeeded with NO matching order -> 200 + warning logged');

  // T6: charge.dispute.created -> 200, warning logged
  constructEventBehavior = () => ({
    type: 'charge.dispute.created',
    data: { object: { charge: 'ch_123', amount: 2000, currency: 'eur', reason: 'fraudulent' } },
  });
  errorLogs = [];
  res = mockRes();
  await stripeWebhookHandler(mockReq({ 'stripe-signature': 'ok' }), res);
  assert.strictEqual(res.code, 200, 'T6 expected 200');
  assert.ok(errorLogs.some(l => l.includes('Dispute opened') && l.includes('ch_123')), 'T6 dispute warning logged');
  n++; console.log('  ✓ T6 charge.dispute.created -> 200 + warning logged');

  // T7: unrecognized event type -> 200, no crash
  constructEventBehavior = () => ({ type: 'customer.created', data: { object: {} } });
  res = mockRes();
  await stripeWebhookHandler(mockReq({ 'stripe-signature': 'ok' }), res);
  assert.strictEqual(res.code, 200, 'T7 expected 200 for unrecognized event type');
  n++; console.log('  ✓ T7 unrecognized event type -> 200, no crash');

  console.error = origError;
  console.log(`\nALL ${n} webhook-logic tests passed.`);
})().catch(e => { console.error('TEST FAILED:', e.stack || e.message); process.exit(1); });
