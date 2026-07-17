'use strict';
/* Compensation-flow simulation — stateful mock DB, no live MySQL needed.
   Verifies that cancelling / deleting / refunding an order puts back:
     stock, gift-card balance, discount redemption, loyalty points, customer totals
   …and that none of it happens twice; plus oversell race and auto-invoicing.
   Run: node test/compensation-logic.test.cjs                                    */
const assert = require('assert');
const Module = require('module');

/* ── stateful mock DB ─────────────────────────────────────────── */
let db, sqlLog, rollbacks, refundEmails, stripeRefunds;
function resetDB() {
  sqlLog = []; rollbacks = 0; refundEmails = []; stripeRefunds = [];
  db = {
    stock: { 'p1|m': 5, 'p2|s': 1, 'p3|m': 10, 'p9|l': 3 },
    products: {
      p1: { id:'p1', name:'Vestito Uno', price:89,   status:'attivo' },
      p2: { id:'p2', name:'Top Due',     price:30,   status:'attivo' },
      p3: { id:'p3', name:'Gonna Tre',   price:89,   status:'attivo' },
    },
    giftCards: { GC1: { code:'GC1', balance:0, stato:'utilizzata' } },
    discounts: { SALE10: { id:7, code:'SALE10', utilizzi:3 } },
    usageRows: [ { code_id:7, order_id:1, customer_email:'a@b.it' } ],
    customers: { 9: { id:9, email:'a@b.it', total_orders:4, total_spent:500, points:120 } },
    ledger: [ { customer_id:9, delta:89, reason:'acquisto', order_id:1 } ],
    orders: {
      1: { id:1, order_number:'MEMI-1', customer_id:9, customer_nome:'Anna', customer_cognome:'B',
           customer_email:'a@b.it', total:89, discount_code:'SALE10', gift_card_code:'GC1',
           gift_card_amount:10, payment_status:'pagato', order_status:'in_attesa',
           payment_intent_id:'pi_1', shipping_address:'x', shipping_citta:'y', shipping_cap:'z', shipping_paese:'IT' },
      2: { id:2, order_number:'MEMI-2', customer_id:null, customer_nome:'Ugo', customer_cognome:'',
           customer_email:'u@b.it', total:30, discount_code:null, gift_card_code:null, gift_card_amount:0,
           payment_status:'in_attesa', order_status:'in_preparazione', payment_intent_id:null,
           shipping_address:'x', shipping_citta:'y', shipping_cap:'z', shipping_paese:'IT' },
      4: { id:4, order_number:'MEMI-4', customer_id:9, customer_nome:'Anna', customer_cognome:'B',
           customer_email:'a@b.it', total:89, discount_code:null, gift_card_code:null, gift_card_amount:0,
           payment_status:'pagato', order_status:'consegnato', payment_intent_id:'pi_4',
           shipping_address:'x', shipping_citta:'y', shipping_cap:'z', shipping_paese:'IT' },
      5: { id:5, order_number:'MEMI-5', customer_id:null, customer_nome:'Pia', customer_cognome:'',
           customer_email:'p@b.it', total:30, discount_code:null, gift_card_code:null, gift_card_amount:0,
           payment_status:'pagato', order_status:'consegnato', payment_intent_id:null,
           shipping_address:'x', shipping_citta:'y', shipping_cap:'z', shipping_paese:'IT' },
      7: { id:7, order_number:'MEMI-7', customer_id:null, customer_nome:'Zoe', customer_cognome:'',
           customer_email:'z@b.it', total:89, discount_code:null, gift_card_code:null, gift_card_amount:0,
           payment_status:'pagato', order_status:'consegnato', payment_intent_id:'pi_7',
           shipping_address:'x', shipping_citta:'y', shipping_cap:'z', shipping_paese:'IT' },
    },
    orderItems: {
      1: [ { product_id:'p1', taglia:'m', qty:2 } ],
      2: [ { product_id:'p9', taglia:'l', qty:1 } ],
      4: [ { product_id:'p1', taglia:'m', qty:1 } ],
      5: [ { product_id:'p2', taglia:'s', qty:1 } ],
      7: [ { product_id:'p3', taglia:'m', qty:1 } ],
    },
    resi: {
      3: { id:3, order_id:4, stato:'approvato', rimborso_amount:null },
      6: { id:6, order_id:5, stato:'approvato', rimborso_amount:null },
      8: { id:8, order_id:7, stato:'in_analisi', rimborso_amount:null },
    },
    invoices: [],
  };
}

async function exec(sql, params) {
  params = params || [];
  sqlLog.push({ sql, params });
  const S = sql.replace(/\s+/g, ' ').trim();

  /* orders */
  if (/^SELECT \* FROM orders WHERE id = \?/i.test(S)) { const o = db.orders[params[0]]; return [o ? [{ ...o }] : []]; }
  if (/^UPDATE orders SET payment_status = 'rimborsato' WHERE id = \?/i.test(S)) {
    const o = db.orders[params[0]]; if (o) o.payment_status = 'rimborsato'; return [{ affectedRows: o ? 1 : 0 }];
  }
  if (/^UPDATE orders SET .* WHERE id = \?$/i.test(S)) {
    const o = db.orders[params[params.length - 1]]; if (!o) return [{ affectedRows: 0 }];
    const cols = S.match(/SET (.*) WHERE/i)[1].split(',').map(c => c.split('=')[0].trim());
    cols.forEach((c, i) => { o[c] = params[i]; });
    return [{ affectedRows: 1 }];
  }
  if (/^DELETE FROM orders WHERE id = \?/i.test(S)) {
    const had = !!db.orders[params[0]]; delete db.orders[params[0]]; return [{ affectedRows: had ? 1 : 0 }];
  }

  /* order items / children */
  if (/SELECT product_id, taglia, qty FROM order_items WHERE order_id = \?/i.test(S))
    return [ (db.orderItems[params[0]] || []).map(r => ({ ...r })) ];
  if (/^DELETE FROM (order_items|shipments|discount_usage|resi|invoices) WHERE order_id = \?/i.test(S)) {
    const t = S.match(/DELETE FROM (\w+)/i)[1].toLowerCase();
    if (t === 'order_items') delete db.orderItems[params[0]];
    if (t === 'discount_usage') db.usageRows = db.usageRows.filter(r => r.order_id !== Number(params[0]));
    if (t === 'resi') for (const k of Object.keys(db.resi)) if (db.resi[k].order_id === Number(params[0])) delete db.resi[k];
    if (t === 'invoices') db.invoices = db.invoices.filter(r => r.order_id !== params[0]);
    return [{ affectedRows: 1 }];
  }

  /* stock */
  if (/UPDATE product_sizes SET stock = stock \+ \? WHERE product_id = \? AND taglia = \?/i.test(S)) {
    const k = params[1] + '|' + params[2];
    db.stock[k] = (db.stock[k] || 0) + Number(params[0]); return [{ affectedRows: 1 }];
  }
  if (/UPDATE product_sizes SET stock = stock - \? WHERE product_id = \? AND taglia = \? AND stock >= \?/i.test(S)) {
    const k = params[1] + '|' + params[2];
    if ((db.stock[k] || 0) >= Number(params[3])) { db.stock[k] -= Number(params[0]); return [{ affectedRows: 1 }]; }
    return [{ affectedRows: 0 }];
  }
  if (/FROM product_sizes/i.test(S) && /^SELECT/i.test(S)) return [[{ stock: 100 }]]; // pre-check passes; the atomic UPDATE is authoritative

  /* gift cards */
  if (/UPDATE gift_cards SET balance = balance \+ \?/i.test(S)) {
    const gc = db.giftCards[params[1]]; if (!gc) return [{ affectedRows: 0 }];
    gc.balance += Number(params[0]);
    if (gc.stato === 'utilizzata' && gc.balance > 0) gc.stato = 'attiva';
    return [{ affectedRows: 1 }];
  }

  /* discounts */
  if (/^SELECT id FROM discount_codes WHERE code = \?/i.test(S)) {
    const d = db.discounts[params[0]]; return [d ? [{ id: d.id }] : []];
  }
  if (/UPDATE discount_codes SET utilizzi = GREATEST\(0, utilizzi - 1\)/i.test(S)) {
    for (const d of Object.values(db.discounts)) if (d.id === params[0]) d.utilizzi = Math.max(0, d.utilizzi - 1);
    return [{ affectedRows: 1 }];
  }
  if (/^DELETE FROM discount_usage WHERE code_id = \? AND order_id = \?/i.test(S)) {
    db.usageRows = db.usageRows.filter(r => !(r.code_id === params[0] && r.order_id === Number(params[1])));
    return [{ affectedRows: 1 }];
  }
  if (/FROM discount_codes/i.test(S)) return [[]];
  if (/FROM discount_usage/i.test(S)) return [[]];

  /* loyalty (REAL loyalty.js runs against these) */
  if (/FROM store_settings WHERE `key` LIKE 'loyalty/i.test(S)) return [[]];
  if (/SELECT customer_id, COALESCE\(SUM\(delta\),0\) AS net FROM loyalty_transactions WHERE order_id = \?/i.test(S)) {
    const agg = {};
    db.ledger.filter(r => r.order_id === params[0] || r.order_id === Number(params[0]))
      .forEach(r => { agg[r.customer_id] = (agg[r.customer_id] || 0) + r.delta; });
    return [Object.entries(agg).map(([customer_id, net]) => ({ customer_id: Number(customer_id), net }))];
  }
  if (/UPDATE customers SET points = GREATEST\(0, COALESCE\(points,0\) \+ \?\)/i.test(S)) {
    const c = db.customers[params[1]]; if (c) c.points = Math.max(0, (c.points || 0) + Number(params[0]));
    return [{ affectedRows: 1 }];
  }
  if (/^SELECT points FROM customers WHERE id = \?/i.test(S)) {
    const c = db.customers[params[0]]; return [c ? [{ points: c.points }] : []];
  }
  if (/^SELECT id FROM customers WHERE email = \?/i.test(S)) {
    const c = Object.values(db.customers).find(c => c.email === params[0]); return [c ? [{ id: c.id }] : []];
  }
  if (/^INSERT INTO loyalty_transactions/i.test(S)) {
    db.ledger.push({ customer_id: params[0], delta: params[1], reason: params[2], order_id: params[3] });
    return [{ insertId: db.ledger.length }];
  }

  /* customer totals */
  if (/UPDATE customers SET total_orders = GREATEST\(0, total_orders - 1\)/i.test(S)) {
    const c = db.customers[params[1]];
    if (c) { c.total_orders = Math.max(0, c.total_orders - 1); c.total_spent = Math.max(0, c.total_spent - Number(params[0])); }
    return [{ affectedRows: 1 }];
  }
  if (/UPDATE customers SET total_spent = GREATEST\(0, total_spent - \?\)/i.test(S)) {
    const c = db.customers[params[1]]; if (c) c.total_spent = Math.max(0, c.total_spent - Number(params[0]));
    return [{ affectedRows: 1 }];
  }
  if (/UPDATE customers SET total_orders = total_orders \+ 1/i.test(S)) return [{ affectedRows: 1 }];

  /* resi */
  if (/^SELECT \* FROM resi WHERE id = \?/i.test(S)) { const r = db.resi[params[0]]; return [r ? [{ ...r }] : []]; }
  if (/^SELECT r\.id, r\.stato/i.test(S)) {
    const r = db.resi[params[0]]; if (!r) return [[]];
    const o = db.orders[r.order_id] || {};
    return [[{ id: r.id, stato: r.stato, rimborso_amount: r.rimborso_amount, order_id: r.order_id,
               payment_intent_id: o.payment_intent_id || null, total: o.total || 0 }]];
  }
  if (/^UPDATE resi SET stato = 'rimborsato', rimborso_amount = \? WHERE id = \?/i.test(S)) {
    const r = db.resi[params[1]]; if (r) { r.stato = 'rimborsato'; r.rimborso_amount = params[0]; }
    return [{ affectedRows: r ? 1 : 0 }];
  }
  if (/^UPDATE resi SET .* WHERE id = \?$/i.test(S)) {
    const r = db.resi[params[params.length - 1]]; if (!r) return [{ affectedRows: 0 }];
    const cols = S.match(/SET (.*) WHERE/i)[1].split(',').map(c => c.split('=')[0].trim());
    cols.forEach((c, i) => { r[c] = params[i]; });
    return [{ affectedRows: 1 }];
  }

  /* invoicing */
  if (/FROM store_settings WHERE `key` = 'auto_invoice'/i.test(S)) return [[]]; // default ON
  if (/^SELECT id FROM invoices WHERE order_id = \?/i.test(S)) {
    const inv = db.invoices.find(i => i.order_id === params[0]); return [inv ? [{ id: 1 }] : []];
  }
  if (/SELECT MAX\(CAST\(SUBSTRING_INDEX\(invoice_number/i.test(S)) {
    return [[{ last_n: db.invoices.length }]];
  }
  if (/^INSERT INTO invoices/i.test(S)) {
    db.invoices.push({ invoice_number: params[0], order_id: params[1], total: params[9] });
    return [{ insertId: db.invoices.length }];
  }

  /* checkout misc */
  if (/FROM products WHERE id/i.test(S)) { const p = db.products[params[0]]; return [p ? [{ ...p }] : []]; }
  if (/SELECT MAX/i.test(S)) return [[{ max_n: 10254 }]];
  if (/^INSERT INTO orders/i.test(S)) {
    // store the row so post-commit hooks (auto-invoice) can read it back
    if (params.length === 21) db.orders[99] = { id: 99, order_number: params[0], customer_id: params[1],
      customer_nome: params[2], customer_cognome: params[3], customer_email: params[4],
      shipping_address: params[6], shipping_citta: params[7], shipping_cap: params[8],
      shipping_paese: params[9], total: params[13], payment_status: params[18], order_status: 'in_attesa' };
    return [{ insertId: 99 }];
  }
  if (/^INSERT INTO order_items/i.test(S)) return [{ insertId: 1 }];
  if (/^INSERT INTO discount_usage/i.test(S)) return [{ insertId: 1 }];
  if (/FROM gift_cards/i.test(S)) return [[]];

  if (/^SELECT/i.test(S)) return [[]];
  return [{ affectedRows: 1 }];
}

function makeConn() {
  return { beginTransaction: async () => {}, commit: async () => {},
           rollback: async () => { rollbacks++; }, release: () => {}, execute: exec };
}
const mockPool = { getConnection: async () => makeConn(), execute: exec };

/* ── module interception ──────────────────────────────────────── */
const origLoad = Module._load;
Module._load = function (request) {
  if (request === '../db') return { pool: mockPool, testConnection: async () => {} };
  if (request === '../email') return {
    sendOrderConfirmation: async () => {}, sendShippingConfirmation: async () => {},
    sendRefundNotification: async (d) => { refundEmails.push(d); },
    sendOrderCancellation: async () => {}, sendReturnRequestReceived: async () => {},
  };
  if (request === '../audit') return { logAdminAction: async () => {} };
  if (request === 'stripe') return function () {
    return { refunds: { create: async (o) => { stripeRefunds.push(o); return { id: 're_mock_1' }; } },
             paymentIntents: { retrieve: async () => stripeBehavior() } };
  };
  return origLoad.apply(this, arguments);
};
let stripeBehavior = async () => ({ status: 'succeeded', amount: 9490, currency: 'eur' });

const ordersRouter = require('../src/routes/orders');
const resiRouter   = require('../src/routes/resi');
function handlerFor(router, method, path) {
  const layer = router.stack.find(l => l.route && l.route.path === path && l.route.methods[method]);
  if (!layer) throw new Error('route not found: ' + method + ' ' + path);
  const s = layer.route.stack; return s[s.length - 1].handle;
}
function mockRes() { return { code: 200, body: null, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; } }; }
const flush = () => new Promise(r => setTimeout(r, 15)); // let fire-and-forget invoice/email promises settle
const ADMIN = { admin: { id: 1, email: 'admin@memi.it' } };

(async () => {
  const putStatus  = handlerFor(ordersRouter, 'put', '/admin/:id/status');
  const delOrder   = handlerFor(ordersRouter, 'delete', '/admin/:id');
  const postOrder  = handlerFor(ordersRouter, 'post', '/');
  const putReso    = handlerFor(resiRouter, 'put', '/:id');
  const refundReso = handlerFor(resiRouter, 'post', '/:id/refund');
  let n = 0;

  /* T1 — cancel puts EVERYTHING back */
  resetDB();
  let res = mockRes();
  await putStatus({ ...ADMIN, params: { id: 1 }, body: { order_status: 'annullato' } }, res);
  assert.strictEqual(res.code, 200, 'T1 code ' + res.code + ' ' + JSON.stringify(res.body));
  assert.strictEqual(res.body.cancelled, true, 'T1 cancelled flag');
  assert.strictEqual(db.stock['p1|m'], 7, 'T1 stock restored 5+2=7, got ' + db.stock['p1|m']);
  assert.strictEqual(db.giftCards.GC1.balance, 10, 'T1 gift card balance restored');
  assert.strictEqual(db.giftCards.GC1.stato, 'attiva', 'T1 gift card reactivated');
  assert.strictEqual(db.discounts.SALE10.utilizzi, 2, 'T1 discount usage decremented');
  assert.strictEqual(db.usageRows.length, 0, 'T1 per-email usage row freed');
  assert.strictEqual(db.customers[9].points, 31, 'T1 points reversed 120-89, got ' + db.customers[9].points);
  assert.strictEqual(db.customers[9].total_orders, 3, 'T1 total_orders -1');
  assert.strictEqual(db.customers[9].total_spent, 411, 'T1 total_spent -89');
  assert.strictEqual(db.orders[1].order_status, 'annullato', 'T1 status set');
  n++; console.log('  ✓ T1 cancel restores stock + gift card + discount + points + totals');

  /* T2 — annullato is terminal; repeat-cancel does NOT double-compensate */
  res = mockRes();
  await putStatus({ ...ADMIN, params: { id: 1 }, body: { order_status: 'in_preparazione' } }, res);
  assert.strictEqual(res.code, 409, 'T2 reactivation must 409');
  res = mockRes();
  await putStatus({ ...ADMIN, params: { id: 1 }, body: { order_status: 'annullato' } }, res);
  assert.strictEqual(res.code, 200, 'T2 idempotent re-cancel ok');
  assert.strictEqual(db.stock['p1|m'], 7, 'T2 NO double restock');
  assert.strictEqual(db.giftCards.GC1.balance, 10, 'T2 NO double gift-card credit');
  assert.strictEqual(db.customers[9].points, 31, 'T2 NO double points reversal (ledger nets to 0)');
  n++; console.log('  ✓ T2 annullato is terminal; re-cancel does not double-compensate');

  /* T3 — deleting a live order compensates first */
  res = mockRes();
  await delOrder({ ...ADMIN, params: { id: 2 }, body: {} }, res);
  assert.strictEqual(res.code, 200, 'T3 code ' + res.code);
  assert.strictEqual(db.stock['p9|l'], 4, 'T3 stock restored 3+1');
  assert.ok(!db.orders[2], 'T3 order row gone');
  assert.ok(!db.orderItems[2], 'T3 items gone');
  n++; console.log('  ✓ T3 delete of a live order restores stock, then removes rows');

  /* T4 — deleting an annullato order does NOT compensate again */
  res = mockRes();
  await delOrder({ ...ADMIN, params: { id: 1 }, body: {} }, res);
  assert.strictEqual(res.code, 200, 'T4 code ' + res.code);
  assert.strictEqual(db.stock['p1|m'], 7, 'T4 NO double restock on delete-after-cancel');
  assert.strictEqual(db.giftCards.GC1.balance, 10, 'T4 gift card untouched');
  n++; console.log('  ✓ T4 delete after cancel does not double-restock');

  /* T5 — Stripe refund restocks + reverses (order 4, reso 3) */
  process.env.STRIPE_SECRET_KEY = 'sk_test_x';
  const stockBefore = db.stock['p1|m'];
  res = mockRes();
  await refundReso({ ...ADMIN, params: { id: 3 }, body: {} }, res);
  await flush();
  assert.strictEqual(res.code, 200, 'T5 code ' + res.code + ' ' + JSON.stringify(res.body));
  assert.strictEqual(stripeRefunds.length, 1, 'T5 Stripe refund issued');
  assert.strictEqual(stripeRefunds[0].amount, 8900, 'T5 refund amount = order total');
  assert.strictEqual(db.resi[3].stato, 'rimborsato', 'T5 reso rimborsato');
  assert.strictEqual(db.orders[4].payment_status, 'rimborsato', 'T5 order rimborsato');
  assert.strictEqual(db.stock['p1|m'], stockBefore + 1, 'T5 goods restocked');
  assert.strictEqual(db.customers[9].total_spent, 411 - 89, 'T5 total_spent reduced');
  assert.strictEqual(refundEmails.length, 1, 'T5 refund email sent');
  n++; console.log('  ✓ T5 Stripe refund restocks goods, reverses totals, notifies customer');

  /* T6 — repeat refund on same reso → 409, no double restock */
  res = mockRes();
  await refundReso({ ...ADMIN, params: { id: 3 }, body: {} }, res);
  assert.strictEqual(res.code, 409, 'T6 already-refunded must 409');
  assert.strictEqual(db.stock['p1|m'], stockBefore + 1, 'T6 NO double restock');
  n++; console.log('  ✓ T6 second refund attempt rejected (409), no double restock');

  /* T7 — manual refund without Stripe configured (PayPal order 5, reso 6) */
  // Stripe configured but the order has no payment_intent → point admin to manual (400)
  res = mockRes();
  await refundReso({ ...ADMIN, params: { id: 6 }, body: {} }, res);
  assert.strictEqual(res.code, 400, 'T7 non-manual on intent-less order must 400, got ' + res.code);
  // Stripe NOT configured and not manual → 503 (unchanged behaviour)
  delete process.env.STRIPE_SECRET_KEY;
  res = mockRes();
  await refundReso({ ...ADMIN, params: { id: 6 }, body: {} }, res);
  assert.strictEqual(res.code, 503, 'T7 non-manual without Stripe must 503, got ' + res.code);
  res = mockRes();
  await refundReso({ ...ADMIN, params: { id: 6 }, body: { manual: true } }, res);
  await flush();
  assert.strictEqual(res.code, 200, 'T7 manual code ' + res.code + ' ' + JSON.stringify(res.body));
  assert.strictEqual(res.body.manual, true, 'T7 manual flag echoed');
  assert.strictEqual(db.resi[6].stato, 'rimborsato', 'T7 reso rimborsato');
  assert.strictEqual(db.orders[5].payment_status, 'rimborsato', 'T7 order rimborsato');
  assert.strictEqual(db.stock['p2|s'], 2, 'T7 goods restocked 1+1');
  assert.strictEqual(stripeRefunds.length, 1, 'T7 NO Stripe call for manual refund');
  n++; console.log('  ✓ T7 manual refund works without Stripe (PayPal/bonifico)');

  /* T8 — PUT stato=rimborsato (legacy path) also compensates, once */
  res = mockRes();
  await putReso({ ...ADMIN, params: { id: 8 }, body: { stato: 'rimborsato', rimborso_amount: 89 } }, res);
  await flush();
  assert.strictEqual(res.code, 200, 'T8 code ' + res.code);
  assert.strictEqual(db.stock['p3|m'], 11, 'T8 restocked 10+1');
  assert.strictEqual(db.orders[7].payment_status, 'rimborsato', 'T8 order rimborsato');
  res = mockRes();
  await putReso({ ...ADMIN, params: { id: 8 }, body: { stato: 'rimborsato' } }, res);
  assert.strictEqual(db.stock['p3|m'], 11, 'T8 repeat PUT: NO double restock');
  n++; console.log('  ✓ T8 PUT stato=rimborsato compensates exactly once');

  /* T9 — oversell race: pre-check passes, atomic decrement refuses */
  res = mockRes();
  await postOrder({ customer: null, body: { nome:'A', cognome:'B', email:'x@y.it', indirizzo:'v', citta:'c', cap:'00100',
    items: [{ product_id:'p2', taglia:'s', qty: 5 }], payment_method:'carta' } }, res);
  assert.strictEqual(res.code, 409, 'T9 expected 409, got ' + res.code + ' ' + JSON.stringify(res.body));
  assert.ok(rollbacks > 0, 'T9 transaction rolled back');
  assert.strictEqual(db.stock['p2|s'], 2, 'T9 stock unchanged');
  n++; console.log('  ✓ T9 concurrent oversell blocked by conditional decrement (409)');

  /* T10 — auto-invoice on paid checkout + on payment_status→pagato */
  process.env.STRIPE_SECRET_KEY = 'sk_test_x';
  stripeBehavior = async () => ({ status: 'succeeded', amount: 9490, currency: 'eur' }); // 89 + 5.90 ship
  db.invoices = [];
  res = mockRes();
  await postOrder({ customer: null, body: { nome:'A', cognome:'B', email:'x@y.it', indirizzo:'v', citta:'c', cap:'00100',
    items: [{ product_id:'p3', taglia:'m', qty: 1 }], payment_method:'carta', payment_intent_id:'pi_new' } }, res);
  await flush();
  assert.strictEqual(res.code, 201, 'T10 checkout code ' + res.code + ' ' + JSON.stringify(res.body));
  assert.strictEqual(db.invoices.length, 1, 'T10 invoice auto-created on paid checkout');
  assert.ok(/^F-\d{4}-\d{4}$/.test(db.invoices[0].invoice_number), 'T10 invoice number format');
  // order 5 got refunded in T7; flip a fresh in_attesa order (order 2 deleted; use order 5→ new one)
  db.orders[11] = { ...db.orders[5], id: 11, order_number:'MEMI-11', payment_status:'in_attesa', order_status:'in_preparazione' };
  db.orderItems[11] = [];
  res = mockRes();
  await putStatus({ ...ADMIN, params: { id: 11 }, body: { payment_status: 'pagato' } }, res);
  await flush();
  assert.strictEqual(res.code, 200, 'T10b code ' + res.code);
  assert.strictEqual(db.invoices.length, 2, 'T10b invoice auto-created when admin marks pagato');
  n++; console.log('  ✓ T10 invoices auto-emitted on paid checkout and on pagato transition');

  /* T11 — PARTIAL refund keeps the order 'pagato' (revenue not zeroed) and does NOT restock */
  db.orders[12] = { id:12, order_number:'MEMI-12', customer_id:null, customer_nome:'Ida', customer_cognome:'',
    customer_email:'i@b.it', total:50, discount_code:null, gift_card_code:null, gift_card_amount:0,
    payment_status:'pagato', order_status:'consegnato', payment_intent_id:'pi_12',
    shipping_address:'x', shipping_citta:'y', shipping_cap:'z', shipping_paese:'IT' };
  db.orderItems[12] = [ { product_id:'p3', taglia:'m', qty:1 } ];
  db.resi[12] = { id:12, order_id:12, stato:'approvato', rimborso_amount:null };
  db.stock['p3|m'] = 7;
  const refundsBefore = stripeRefunds.length;   // STRIPE_SECRET_KEY still set from T10
  res = mockRes();
  await refundReso({ ...ADMIN, params: { id: 12 }, body: { amount: 10 } }, res);
  await flush();
  assert.strictEqual(res.code, 200, 'T11 partial refund code ' + res.code + ' ' + JSON.stringify(res.body));
  assert.strictEqual(stripeRefunds.length, refundsBefore + 1, 'T11 partial Stripe refund issued');
  assert.strictEqual(stripeRefunds[stripeRefunds.length - 1].amount, 1000, 'T11 refund amount = €10 (1000 cents)');
  assert.strictEqual(db.resi[12].stato, 'rimborsato', 'T11 reso marked rimborsato');
  assert.strictEqual(db.orders[12].payment_status, 'pagato', 'T11 order STAYS pagato on partial refund (revenue not zeroed)');
  assert.strictEqual(db.stock['p3|m'], 7, 'T11 partial refund does NOT restock');
  n++; console.log('  ✓ T11 partial refund keeps order pagato + does not restock');

  console.log(`\nALL ${n} compensation-logic tests passed.`);
})().catch(e => { console.error('\n✗ FAILED:', e.message); process.exit(1); });
