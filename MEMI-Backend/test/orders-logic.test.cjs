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
const mockPool = {
  getConnection: async () => makeConn(),
  execute: async (sql, params) => {
    sqlLog.push({ sql, params });
    if (/FROM products WHERE id/i.test(sql)) { const p = PRODUCTS[params[0]]; return [ p ? [p] : [] ]; }
    if (/FROM product_sizes/i.test(sql)) return [[{ stock: 100 }]];
    if (/FROM discount_codes/i.test(sql)) return [[]];
    return [[]];
  },
};
let stripeBehavior = null;
const origLoad = Module._load;
Module._load = function (request) {
  if (request === '../db')      return { pool: mockPool, testConnection: async () => {} };
  if (request === '../email')   return { sendOrderConfirmation: async()=>{}, sendShippingConfirmation: async()=>{} };
  if (request === '../loyalty') return { awardPurchasePoints: async()=>{} };
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
  stripeBehavior = async () => ({ status:'succeeded', amount:18390, currency:'eur' });
  sqlLog = []; res = mockRes();
  await postOrder({ customer:null, body:{ nome:'A',cognome:'B',email:'a@b.it',indirizzo:'x',citta:'y',cap:'00100',
    items:[{ product_id:'vestito-lino-cannes', taglia:'m', qty:2 }], payment_method:'carta', payment_intent_id:'pi_123' }}, res);
  assert.strictEqual(res.code, 201, 'T2 code '+res.code+' '+JSON.stringify(res.body));
  const oo2 = sqlLog.find(e=>/INSERT INTO orders/i.test(e.sql));
  assert.ok(oo2.params.includes('pagato'), 'T2 payment_status pagato');
  assert.ok(oo2.params.includes('pi_123'), 'T2 payment_intent_id stored');
  n++; console.log('  ✓ T2 verified Stripe -> payment_status pagato (dashboard revenue works)');

  stripeBehavior = async () => ({ status:'succeeded', amount:100, currency:'eur' });
  sqlLog = []; res = mockRes();
  await postOrder({ customer:null, body:{ nome:'A',cognome:'B',email:'a@b.it',indirizzo:'x',citta:'y',cap:'00100',
    items:[{ product_id:'vestito-lino-cannes', taglia:'m', qty:2 }], payment_method:'carta', payment_intent_id:'pi_x' }}, res);
  assert.strictEqual(res.code, 402, 'T3 expected 402');
  assert.ok(!sqlLog.some(e=>/INSERT INTO orders/i.test(e.sql)), 'T3 no order on mismatch');
  n++; console.log('  ✓ T3 Stripe amount mismatch -> 402, no order written');

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

  console.log(`\nALL ${n} order-logic tests passed.`);
})().catch(e => { console.error('TEST FAILED:', e.stack || e.message); process.exit(1); });
