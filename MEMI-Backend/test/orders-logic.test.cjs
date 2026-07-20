'use strict';
/* Order-flow simulation — mock DB pool + mock Stripe, no live MySQL needed.
   Verifies the deploy-readiness fixes:
     - line prices are re-resolved from the catalog (client can't fake prices)
     - a verified Stripe payment sets payment_status='pagato' (unblocks the admin dashboard)
     - a Stripe amount mismatch is rejected (402) with no order written
     - invalid enum / unknown product / bad payment method return 4xx (not 500)
   Run: (cd MEMI-Backend && npm install && node test/orders-logic.test.cjs)          */
const assert = require('assert');
const Module = require('module');

let sqlLog = [];
function makeConn() {
  return {
    beginTransaction: async () => {}, commit: async () => {},
    rollback: async () => {}, release: () => {},
    execute: async (sql, params) => {
      sqlLog.push({ sql, params });
      if (/SELECT MAX/i.test(sql))            return [[{ max_n: 10254 }]];
      if (/INSERT INTO orders/i.test(sql))     return [{ insertId: 42 }];
      return [{}];
    },
  };
}
const PRODUCTS = { 'vestito-lino-cannes': { id:'vestito-lino-cannes', name:'Vestito Lino Cannes', price:89, status:'attivo' } };
// Controllable per-test: a discount code row (or null) and which emails already used it.
let DISCOUNT_ROW = null;
let usedByEmail = new Set();
const mockPool = {
  getConnection: async () => makeConn(),
  execute: async (sql, params) => {
    sqlLog.push({ sql, params });
    if (/FROM products WHERE id/i.test(sql)) { const p = PRODUCTS[params[0]]; return [ p ? [p] : [] ]; }
    if (/FROM product_sizes/i.test(sql)) return [[{ stock: 100 }]];
    if (/FROM discount_usage WHERE code_id/i.test(sql)) {
      const [, email] = params;
      return [ usedByEmail.has(email) ? [{ id: 1 }] : [] ];
    }
    if (/FROM discount_codes/i.test(sql)) return [ DISCOUNT_ROW ? [DISCOUNT_ROW] : [] ];
    return [[]];
  },
};
let stripeBehavior = null;
const origLoad = Module._load;
Module._load = function (request) {
  if (request === '../db')      return { pool: mockPool, testConnection: async () => {} };
  if (request === '../email')   return { sendOrderConfirmation: async()=>{}, sendShippingConfirmation: async()=>{}, sendOrderStatusUpdate: async()=>{} };
  if (request === '../loyalty') return { awardPurchasePoints: async()=>{} };
  // audit.js requires db as './db' (relative to src/, not src/routes/) — a different
  // string than the '../db' intercepted above, so without this it would fall through
  // to a REAL, unmocked mysql2 pool. Mock the whole module, same as email/loyalty.
  if (request === '../audit')   return { logAdminAction: async () => {} };
  if (request === 'stripe')     return function(){ return { paymentIntents: { retrieve: async(id)=> stripeBehavior(id) } }; };
  return origLoad.apply(this, arguments);
};
const router = require('../src/routes/orders');
function handlerFor(method, path) {
  const layer = router.stack.find(l => l.route && l.route.path === path && l.route.methods[method]);
  if (!layer) throw new Error('route not found: ' + method + ' ' + path);
  const s = layer.route.stack; return s[s.length - 1].handle;
}
function mockRes(){ return { code:200, body:null, status(c){this.code=c;return this;}, json(o){this.body=o;return this;} }; }

(async () => {
  const postOrder = handlerFor('post', '/');
  const putStatus = handlerFor('put', '/admin/:id/status');
  let n = 0;

  delete process.env.STRIPE_SECRET_KEY;
  sqlLog = [];
  let res = mockRes();
  await postOrder({ customer:null, body:{ nome:'A',cognome:'B',email:'a@b.it',indirizzo:'x',citta:'y',cap:'00100',
    items:[{ product_id:'vestito-lino-cannes', taglia:'m', qty:2, price:1, product_name:'HACK' }], payment_method:'carta' }}, res);
  assert.strictEqual(res.code, 201, 'T1 code '+res.code+' '+JSON.stringify(res.body));
  const oi = sqlLog.find(e=>/INSERT INTO order_items/i.test(e.sql));
  const oo = sqlLog.find(e=>/INSERT INTO orders/i.test(e.sql));
  assert.ok(oi.params.includes(89), 'T1 line price must be DB price 89');
  assert.ok(!oi.params.includes(1),  'T1 client price 1 must be ignored');
  assert.ok(oo.params.includes(178), 'T1 subtotal 178');
  assert.ok(oo.params.includes('in_attesa'), 'T1 in_attesa without Stripe');
  n++; console.log('  ✓ T1 price re-resolved from catalog; in_attesa without Stripe');

  process.env.STRIPE_SECRET_KEY = 'sk_test_x';
  stripeBehavior = async () => ({ status:'succeeded', amount:17800, currency:'eur' });
  sqlLog = []; res = mockRes();
  await postOrder({ customer:null, body:{ nome:'A',cognome:'B',email:'a@b.it',indirizzo:'x',citta:'y',cap:'00100',
    items:[{ product_id:'vestito-lino-cannes', taglia:'m', qty:2 }], payment_method:'carta', payment_intent_id:'pi_123' }}, res);
  assert.strictEqual(res.code, 201, 'T2 code '+res.code+' '+JSON.stringify(res.body));
  const oo2 = sqlLog.find(e=>/INSERT INTO orders/i.test(e.sql));
  assert.ok(oo2.params.includes('pagato'), 'T2 payment_status pagato');
  assert.ok(oo2.params.includes('pi_123'), 'T2 payment_intent_id stored');
  n++; console.log('  ✓ T2 verified Stripe -> payment_status pagato (dashboard revenue works)');

  // Shipping is server-authoritative: 89 < 100 -> standard shipping (5.90) is added, so the
  // PaymentIntent must be 94.90. A client that paid only 89.00 is rejected.
  stripeBehavior = async () => ({ status:'succeeded', amount:9490, currency:'eur' });
  sqlLog = []; res = mockRes();
  await postOrder({ customer:null, body:{ nome:'A',cognome:'B',email:'a@b.it',indirizzo:'x',citta:'y',cap:'00100',
    items:[{ product_id:'vestito-lino-cannes', taglia:'m', qty:1 }], payment_method:'carta',
    payment_intent_id:'pi_ship', shipping_method:'standard' }}, res);
  assert.strictEqual(res.code, 201, 'T2b code '+res.code+' '+JSON.stringify(res.body));
  const oo2b = sqlLog.find(e=>/INSERT INTO orders/i.test(e.sql));
  assert.ok(oo2b.params.includes(5.9), 'T2b shipping_cost 5.90 persisted under threshold');
  n++; console.log('  ✓ T2b under-threshold order charged 5.90 shipping (free only over 100)');

  // Same cart, but the browser claims free shipping -> amounts disagree -> 402, no order.
  stripeBehavior = async () => ({ status:'succeeded', amount:8900, currency:'eur' });
  sqlLog = []; res = mockRes();
  await postOrder({ customer:null, body:{ nome:'A',cognome:'B',email:'a@b.it',indirizzo:'x',citta:'y',cap:'00100',
    items:[{ product_id:'vestito-lino-cannes', taglia:'m', qty:1 }], payment_method:'carta',
    payment_intent_id:'pi_ship2', shipping_method:'standard' }}, res);
  assert.strictEqual(res.code, 402, 'T2c must reject a client that skipped shipping');
  assert.ok(!sqlLog.find(e=>/INSERT INTO orders/i.test(e.sql)), 'T2c no order written');
  n++; console.log('  ✓ T2c client skipping shipping -> 402, no order written');

  stripeBehavior = async () => ({ status:'succeeded', amount:100, currency:'eur' });
  sqlLog = []; res = mockRes();
  await postOrder({ customer:null, body:{ nome:'A',cognome:'B',email:'a@b.it',indirizzo:'x',citta:'y',cap:'00100',
    items:[{ product_id:'vestito-lino-cannes', taglia:'m', qty:2 }], payment_method:'carta', payment_intent_id:'pi_x' }}, res);
  assert.strictEqual(res.code, 402, 'T3 expected 402');
  assert.ok(!sqlLog.some(e=>/INSERT INTO orders/i.test(e.sql)), 'T3 no order on mismatch');
  n++; console.log('  ✓ T3 Stripe amount mismatch -> 402, no order written');

  // ── Klarna: rides on Stripe, but its OWN verification branch (payment_method:'klarna'),
  //    tolerant of 'processing'. 89 goods + 5.90 standard shipping = 94.90 -> 9490 cents. ──
  process.env.STRIPE_SECRET_KEY = 'sk_test_x';

  // KL1: succeeded -> pagato, PI stored.
  stripeBehavior = async () => ({ status:'succeeded', amount:9490, currency:'eur' });
  sqlLog = []; res = mockRes();
  await postOrder({ customer:null, body:{ nome:'A',cognome:'B',email:'a@b.it',indirizzo:'x',citta:'y',cap:'00100',
    items:[{ product_id:'vestito-lino-cannes', taglia:'m', qty:1 }], payment_method:'klarna',
    payment_intent_id:'pi_kl_ok', shipping_method:'standard' }}, res);
  assert.strictEqual(res.code, 201, 'KL1 code '+res.code+' '+JSON.stringify(res.body));
  let ooK = sqlLog.find(e=>/INSERT INTO orders/i.test(e.sql));
  assert.ok(ooK.params.includes('pagato'), 'KL1 succeeded -> pagato');
  assert.ok(ooK.params.includes('pi_kl_ok'), 'KL1 payment_intent_id stored');
  n++; console.log('  ✓ KL1 Klarna succeeded -> pagato, PI stored');

  // KL2: processing -> in_attesa. The order IS created and the PI stored, so the Stripe webhook
  //      (payment_intent.succeeded) can promote it to pagato — a slow Klarna settle never drops it.
  stripeBehavior = async () => ({ status:'processing', amount:9490, currency:'eur' });
  sqlLog = []; res = mockRes();
  await postOrder({ customer:null, body:{ nome:'A',cognome:'B',email:'a@b.it',indirizzo:'x',citta:'y',cap:'00100',
    items:[{ product_id:'vestito-lino-cannes', taglia:'m', qty:1 }], payment_method:'klarna',
    payment_intent_id:'pi_kl_proc', shipping_method:'standard' }}, res);
  assert.strictEqual(res.code, 201, 'KL2 code '+res.code+' '+JSON.stringify(res.body));
  ooK = sqlLog.find(e=>/INSERT INTO orders/i.test(e.sql));
  assert.ok(ooK.params.includes('in_attesa'), 'KL2 processing -> in_attesa (webhook settles later)');
  assert.ok(ooK.params.includes('pi_kl_proc'), 'KL2 PI stored so the webhook can reconcile');
  n++; console.log('  ✓ KL2 Klarna processing -> in_attesa + PI stored (no dropped order)');

  // KL3: amount mismatch -> 402, no order. This is the anti-tampering gap the branch closed
  //      (before, a Klarna order fell through with NO server-side amount check).
  stripeBehavior = async () => ({ status:'succeeded', amount:100, currency:'eur' });
  sqlLog = []; res = mockRes();
  await postOrder({ customer:null, body:{ nome:'A',cognome:'B',email:'a@b.it',indirizzo:'x',citta:'y',cap:'00100',
    items:[{ product_id:'vestito-lino-cannes', taglia:'m', qty:1 }], payment_method:'klarna',
    payment_intent_id:'pi_kl_bad', shipping_method:'standard' }}, res);
  assert.strictEqual(res.code, 402, 'KL3 amount mismatch -> 402');
  assert.ok(!sqlLog.some(e=>/INSERT INTO orders/i.test(e.sql)), 'KL3 no order on mismatch');
  n++; console.log('  ✓ KL3 Klarna amount mismatch -> 402, no order (anti-tampering)');

  // KL4: any status that is neither succeeded nor processing -> 402, no order.
  stripeBehavior = async () => ({ status:'requires_action', amount:9490, currency:'eur' });
  sqlLog = []; res = mockRes();
  await postOrder({ customer:null, body:{ nome:'A',cognome:'B',email:'a@b.it',indirizzo:'x',citta:'y',cap:'00100',
    items:[{ product_id:'vestito-lino-cannes', taglia:'m', qty:1 }], payment_method:'klarna',
    payment_intent_id:'pi_kl_ra', shipping_method:'standard' }}, res);
  assert.strictEqual(res.code, 402, 'KL4 requires_action -> 402');
  assert.ok(!sqlLog.some(e=>/INSERT INTO orders/i.test(e.sql)), 'KL4 no order on incomplete');
  n++; console.log('  ✓ KL4 Klarna incomplete (requires_action) -> 402, no order');

  // KL5: Klarna selected but Stripe not configured -> 503, never an unverified in_attesa order.
  delete process.env.STRIPE_SECRET_KEY;
  sqlLog = []; res = mockRes();
  await postOrder({ customer:null, body:{ nome:'A',cognome:'B',email:'a@b.it',indirizzo:'x',citta:'y',cap:'00100',
    items:[{ product_id:'vestito-lino-cannes', taglia:'m', qty:1 }], payment_method:'klarna',
    payment_intent_id:'pi_kl_nostripe', shipping_method:'standard' }}, res);
  assert.strictEqual(res.code, 503, 'KL5 Klarna without Stripe -> 503');
  assert.ok(!sqlLog.some(e=>/INSERT INTO orders/i.test(e.sql)), 'KL5 no unverified order written');
  n++; console.log('  ✓ KL5 Klarna without Stripe configured -> 503, no order');

  delete process.env.STRIPE_SECRET_KEY;
  res = mockRes();
  await postOrder({ customer:null, body:{ nome:'A',cognome:'B',email:'a@b.it',indirizzo:'x',citta:'y',cap:'1',
    items:[{ product_id:'vestito-lino-cannes', qty:1 }], payment_method:'bitcoin' }}, res);
  assert.strictEqual(res.code, 400, 'T4 expected 400');
  n++; console.log('  ✓ T4 invalid payment_method -> 400');

  res = mockRes();
  await postOrder({ customer:null, body:{ nome:'A',cognome:'B',email:'a@b.it',indirizzo:'x',citta:'y',cap:'1',
    items:[{ product_id:'ghost', qty:1 }], payment_method:'carta' }}, res);
  assert.strictEqual(res.code, 400, 'T5 expected 400');
  n++; console.log('  ✓ T5 unknown product -> 400 (not 500)');

  res = mockRes();
  await putStatus({ admin:{}, params:{id:'1'}, body:{ order_status:'teleported' } }, res);
  assert.strictEqual(res.code, 400, 'T6 expected 400');
  n++; console.log('  ✓ T6 invalid order_status enum -> 400');

  // T7: first use of a discount code by an email succeeds
  delete process.env.STRIPE_SECRET_KEY;
  DISCOUNT_ROW = { id: 9, code: 'WELCOME10', tipo: 'fisso', valore: 10, min_order: 0 };
  usedByEmail = new Set();
  sqlLog = []; res = mockRes();
  await postOrder({ customer:null, body:{ nome:'A',cognome:'B',email:'first@b.it',indirizzo:'x',citta:'y',cap:'00100',
    items:[{ product_id:'vestito-lino-cannes', taglia:'m', qty:1 }], payment_method:'carta', discount_code:'welcome10' }}, res);
  assert.strictEqual(res.code, 201, 'T7 code '+res.code+' '+JSON.stringify(res.body));
  n++; console.log('  ✓ T7 discount code first use by an email -> accepted');

  // T8: same email trying the same code again -> rejected (closes the multi-account abuse gap)
  usedByEmail.add('second@b.it');
  sqlLog = []; res = mockRes();
  await postOrder({ customer:null, body:{ nome:'A',cognome:'B',email:'second@b.it',indirizzo:'x',citta:'y',cap:'00100',
    items:[{ product_id:'vestito-lino-cannes', taglia:'m', qty:1 }], payment_method:'carta', discount_code:'welcome10' }}, res);
  assert.strictEqual(res.code, 400, 'T8 expected 400 (already used)');
  assert.ok(!sqlLog.some(e=>/INSERT INTO orders/i.test(e.sql)), 'T8 no order written on reuse');
  n++; console.log('  ✓ T8 same email reusing a discount code -> 400, no order written');
  DISCOUNT_ROW = null; usedByEmail = new Set();

  console.log(`\nALL ${n} order-logic tests passed.`);
})().catch(e => { console.error('TEST FAILED:', e.stack || e.message); process.exit(1); });
