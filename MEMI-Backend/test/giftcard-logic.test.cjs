'use strict';
/* Gift-card checkout redemption tests — mock DB pool + mock Stripe, no live MySQL needed.
   Verifies (Phase 3 of docs/PRODUCTION-ROADMAP.md):
     - a gift card that fully covers the order -> total=0, payment_status='pagato', no
       Stripe verification required even for payment_method='carta'
     - a gift card that partially covers the order -> total reduced by the gift card amount,
       remaining balance still goes through normal Stripe verification
     - an unknown/inactive/depleted gift card code -> 400, no order written
     - a gift card race (balance spent by another order between the read and the conditional
       UPDATE) -> 409, order rolled back, nothing written
   Run: (cd MEMI-Backend && npm install && node test/giftcard-logic.test.cjs)          */
const assert = require('assert');
const Module = require('module');

let sqlLog = [];
let giftCardsTable = [];
let giftCardUpdateAffectedRows = null; // null = compute naturally from the mock table

function makeConn() {
  return {
    beginTransaction: async () => {}, commit: async () => {},
    rollback: async () => {}, release: () => {},
    execute: async (sql, params) => {
      sqlLog.push({ sql, params });
      if (/UPDATE gift_cards SET balance/i.test(sql)) {
        if (giftCardUpdateAffectedRows !== null) return [{ affectedRows: giftCardUpdateAffectedRows }];
        const [amount, , code, minBalance] = params;
        const card = giftCardsTable.find(c => c.code === code);
        if (!card || Number(card.balance) < minBalance) return [{ affectedRows: 0 }];
        card.balance = Number(card.balance) - amount;
        return [{ affectedRows: 1 }];
      }
      if (/INSERT INTO counters/i.test(sql)) return [{ affectedRows: 2 }]; // atomic order-number counter (update branch)
      if (/LAST_INSERT_ID/i.test(sql))       return [[{ n: 10255 }]];
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
    if (/FROM product_sizes/i.test(sql)) return [[{ taglia:'s', stock:100 }, { taglia:'m', stock:100 }, { taglia:'l', stock:100 }]];
    if (/FROM discount_codes/i.test(sql)) return [[]];
    if (/FROM gift_cards WHERE code/i.test(sql)) {
      const card = giftCardsTable.find(c => c.code === params[0]);
      return [ card ? [card] : [] ];
    }
    return [[]];
  },
};
let stripeBehavior = null;
const origLoad = Module._load;
Module._load = function (request) {
  if (request === '../db')      return { pool: mockPool, testConnection: async () => {} };
  if (request === '../email')   return { sendOrderConfirmation: async()=>{}, sendShippingConfirmation: async()=>{}, sendOrderStatusUpdate: async()=>{} };
  if (request === '../loyalty') return { awardPurchasePoints: async()=>{} };
  // audit.js requires db as './db' (relative to src/), a different string than '../db'
  // above — without this it would fall through to a REAL, unmocked mysql2 pool.
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
function baseOrderBody(extra) {
  return Object.assign({
    nome:'A', cognome:'B', email:'a@b.it', indirizzo:'x', citta:'y', cap:'00100',
    items:[{ product_id:'vestito-lino-cannes', taglia:'m', qty:1 }],
  }, extra);
}

(async () => {
  const postOrder = handlerFor('post', '/');
  let n = 0;
  delete process.env.STRIPE_SECRET_KEY;

  // T1: gift card fully covers the order (balance 200 >= subtotal 89 + default shipping 5.90 = 94.90)
  giftCardsTable = [{ code: 'MEMI-FULL', balance: 200, stato: 'attiva' }];
  giftCardUpdateAffectedRows = null;
  sqlLog = [];
  let res = mockRes();
  await postOrder({ customer:null, body: baseOrderBody({ payment_method:'carta', gift_card_code:'memi-full' }) }, res);
  assert.strictEqual(res.code, 201, 'T1 code ' + res.code + ' ' + JSON.stringify(res.body));
  let oo = sqlLog.find(e => /INSERT INTO orders/i.test(e.sql));
  assert.ok(oo.params.includes(0), 'T1 total is 0');
  assert.ok(oo.params.includes('pagato'), 'T1 payment_status pagato with no Stripe call needed');
  assert.ok(oo.params.includes('MEMI-FULL'), 'T1 gift_card_code stored');
  assert.ok(oo.params.includes(94.9), 'T1 gift_card_amount = subtotal+shipping (94.90)');
  assert.strictEqual(giftCardsTable[0].balance, 200 - 94.9, 'T1 balance deducted by 94.90');
  n++; console.log('  ✓ T1 gift card fully covers order -> total 0, pagato, no Stripe needed');

  // T2: gift card partially covers the order (balance 30 < preGiftTotal 94.90), remaining via Stripe
  giftCardsTable = [{ code: 'MEMI-PART', balance: 30, stato: 'attiva' }];
  process.env.STRIPE_SECRET_KEY = 'sk_test_x';
  stripeBehavior = async () => ({ status: 'succeeded', amount: 6490, currency: 'eur' }); // (94.90-30)*100
  sqlLog = [];
  res = mockRes();
  await postOrder({ customer:null, body: baseOrderBody({ payment_method:'carta', payment_intent_id:'pi_part', gift_card_code:'MEMI-PART' }) }, res);
  assert.strictEqual(res.code, 201, 'T2 code ' + res.code + ' ' + JSON.stringify(res.body));
  oo = sqlLog.find(e => /INSERT INTO orders/i.test(e.sql));
  assert.ok(oo.params.includes(64.9), 'T2 total = 94.90-30 = 64.90');
  assert.ok(oo.params.includes(30), 'T2 gift_card_amount = 30 (full balance)');
  assert.ok(oo.params.includes('pagato'), 'T2 payment_status pagato via verified Stripe for the remainder');
  assert.strictEqual(giftCardsTable[0].balance, 0, 'T2 balance fully drained');
  n++; console.log('  ✓ T2 gift card partially covers order -> remainder verified via Stripe');
  delete process.env.STRIPE_SECRET_KEY;

  // T3: unknown gift card code -> 400, no order written
  giftCardsTable = [];
  sqlLog = [];
  res = mockRes();
  await postOrder({ customer:null, body: baseOrderBody({ gift_card_code:'MEMI-NOPE' }) }, res);
  assert.strictEqual(res.code, 400, 'T3 expected 400');
  assert.ok(!sqlLog.some(e => /INSERT INTO orders/i.test(e.sql)), 'T3 no order written');
  n++; console.log('  ✓ T3 unknown gift card code -> 400, no order written');

  // T4: depleted gift card (balance 0) -> 400
  giftCardsTable = [{ code: 'MEMI-EMPTY', balance: 0, stato: 'attiva' }];
  sqlLog = [];
  res = mockRes();
  await postOrder({ customer:null, body: baseOrderBody({ gift_card_code:'MEMI-EMPTY' }) }, res);
  assert.strictEqual(res.code, 400, 'T4 expected 400');
  n++; console.log('  ✓ T4 depleted (balance=0) gift card -> 400');

  // T5: race condition — balance spent between the read-check and the conditional UPDATE
  giftCardsTable = [{ code: 'MEMI-RACE', balance: 200, stato: 'attiva' }];
  giftCardUpdateAffectedRows = 0; // force the conditional UPDATE to report "nothing matched"
  sqlLog = [];
  res = mockRes();
  await postOrder({ customer:null, body: baseOrderBody({ gift_card_code:'MEMI-RACE' }) }, res);
  assert.strictEqual(res.code, 409, 'T5 expected 409');
  assert.ok(!sqlLog.some(e => /INSERT INTO orders/i.test(e.sql)), 'T5 no order written on race');
  giftCardUpdateAffectedRows = null;
  n++; console.log('  ✓ T5 gift card race (concurrent spend) -> 409, order rolled back');

  console.log(`\nALL ${n} gift-card-logic tests passed.`);
})().catch(e => { console.error('TEST FAILED:', e.stack || e.message); process.exit(1); });
