'use strict';
/**
 * carts-recovery.test.cjs — abandoned-cart recovery (src/routes/carts.js).
 * Verifies the categories endpoint and the four recovery modes the admin modal drives:
 *   1. plain whole-cart reminder      3. discount scoped to chosen products
 *   2. reminder featuring chosen items 4. discount scoped to a whole category
 * Self-contained: mocks db/email/audit/auth via Module._load; no live DB or SMTP.
 */
const assert = require('assert');
const Module = require('module');

/* ── in-memory data ─────────────────────────────────────────────── */
const db = {
  carts: {
    1: { id: 1, email: 'clara@example.it', total: 93,
         items: [{ id: 'a', name: 'Cintura A', price: 28, qty: 1, taglia: 'M' },
                 { id: 'b', name: 'Borsa B', price: 65, qty: 1 }] },
    2: { id: 2, email: null, total: 40, items: [{ id: 'a', name: 'Cintura A', price: 28, qty: 1 }] },
  },
  products: [
    { id: 'a', categoria: 'cinture', status: 'attivo' },
    { id: 'b', categoria: 'borse',   status: 'attivo' },
    { id: 'c', categoria: 'borse',   status: 'attivo' },
    { id: 'd', categoria: 'borse',   status: 'bozza'  }, // excluded from scope/counts
  ],
  emails: [], minted: [], updated: [],
};

function handle(sql, params) {
  const S = String(sql).replace(/\s+/g, ' ').trim();
  if (/^SELECT c\.id, c\.token/i.test(S)) {
    // GET / list — return every seeded cart as a DB row (items as JSON string).
    return [Object.values(db.carts).map((c) => ({
      id: c.id, token: 't' + c.id, customer_id: null, email: c.email,
      items: JSON.stringify(c.items), item_count: c.items.reduce((s, it) => s + (it.qty || 1), 0),
      total: c.total, updated_at: '2026-01-01 00:00:00', created_at: '2026-01-01 00:00:00', customer_nome: 'X',
    }))];
  }
  if (/^SELECT id, email, total, items FROM carts WHERE id = \?/i.test(S)) {
    const c = db.carts[params[0]];
    return [c ? [{ id: c.id, email: c.email, total: c.total, items: JSON.stringify(c.items) }] : []];
  }
  if (/^SELECT items FROM carts WHERE id = \?/i.test(S)) {
    const c = db.carts[params[0]];
    return [c ? [{ items: JSON.stringify(c.items) }] : []];
  }
  if (/^SELECT id, categoria FROM products WHERE id IN/i.test(S)) {
    const ids = (params[0] || []).map(String);
    return [db.products.filter((p) => ids.includes(String(p.id))).map((p) => ({ id: p.id, categoria: p.categoria }))];
  }
  if (/^SELECT categoria, COUNT\(\*\) AS n FROM products WHERE categoria IN/i.test(S)) {
    const cats = (params[0] || []).map(String);
    const out = {};
    db.products.filter((p) => cats.includes(p.categoria) && p.status !== 'bozza').forEach((p) => { out[p.categoria] = (out[p.categoria] || 0) + 1; });
    return [Object.entries(out).map(([categoria, n]) => ({ categoria, n }))];
  }
  if (/^SELECT id FROM products WHERE categoria = \? AND status <> 'bozza'/i.test(S)) {
    const cat = params[0];
    return [db.products.filter((p) => p.categoria === cat && p.status !== 'bozza').map((p) => ({ id: p.id }))];
  }
  if (/^INSERT INTO discount_codes/i.test(S)) {
    db.minted.push({ code: params[0], tipo: params[1], valore: params[2], scadenza: params[3], product_ids: params[4] });
    return [{ insertId: db.minted.length, affectedRows: 1 }];
  }
  if (/^UPDATE carts SET status = 'recuperato'/i.test(S)) {
    db.updated.push(params[params.length - 1]);
    return [{ affectedRows: 1 }];
  }
  throw new Error('unhandled SQL: ' + S);
}
const pool = { execute: async (s, p) => handle(s, p), query: async (s, p) => handle(s, p) };

/* ── module interception ────────────────────────────────────────── */
const orig = Module._load;
Module._load = function (request) {
  if (request === '../db') return { pool, testConnection: async () => {} };
  if (request === '../email') return { sendGenericEmail: async (m) => { db.emails.push(m); } };
  if (request === '../audit') return { logAdminAction: async () => {} };
  if (request === '../middleware/auth') return { requireAdmin: (q, r, n) => n(), requirePermission: () => (q, r, n) => n() };
  return orig.apply(this, arguments);
};

const router = require('../src/routes/carts');
function handlerFor(method, path) {
  const layer = router.stack.find((l) => l.route && l.route.path === path && l.route.methods[method]);
  if (!layer) throw new Error('route not found: ' + method + ' ' + path);
  const s = layer.route.stack; return s[s.length - 1].handle;
}
function mockRes() { return { code: 200, body: null, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; } }; }
const flush = () => new Promise((r) => setTimeout(r, 10));
const ADMIN = { admin: { id: 1, email: 'admin@memi.it' } };

const getList = handlerFor('get', '/');
const getCats = handlerFor('get', '/:id/categories');
const recover = handlerFor('post', '/:id/recover');

let n = 0;
const ok = (m) => { console.log('  ✓ ' + m); n++; };

(async () => {
  /* 1) categories endpoint */
  {
    const res = mockRes();
    await getCats({ ...ADMIN, params: { id: 1 } }, res); await flush();
    assert.strictEqual(res.code, 200);
    const cats = res.body.categories;
    assert.strictEqual(cats.length, 2, 'two categories in cart');
    // sorted: equal cart_items (1) → alphabetical → borse before cinture
    assert.strictEqual(cats[0].categoria, 'borse');
    assert.strictEqual(cats[0].cart_items, 1);
    assert.strictEqual(cats[0].catalog_products, 2, 'borse scope excludes the bozza product');
    assert.strictEqual(cats[1].categoria, 'cinture');
    assert.strictEqual(cats[1].catalog_products, 1);
    ok('categories: per-cart categories with catalog scope (bozza excluded)');
  }

  /* 2) plain reminder */
  {
    db.emails = []; db.minted = []; db.updated = [];
    const res = mockRes();
    await recover({ ...ADMIN, params: { id: 1 }, body: {} }, res); await flush();
    assert.strictEqual(res.code, 200);
    assert.strictEqual(res.body.discount_code, null, 'no code for a plain reminder');
    assert.strictEqual(db.emails.length, 1);
    assert.ok(/lasciato qualcosa/i.test(db.emails[0].subject), 'plain reminder subject');
    assert.ok(!/🎁/.test(db.emails[0].html), 'no gift emoji without discount');
    assert.ok(!/ti aspettano/i.test(db.emails[0].html), 'no featured list without item_ids');
    assert.deepStrictEqual(db.updated, [1], 'cart marked recuperato');
    ok('mode 1 reminder: plain whole-cart email, no code');
  }

  /* 3) reminder featuring chosen items, no discount */
  {
    db.emails = []; db.minted = [];
    const res = mockRes();
    await recover({ ...ADMIN, params: { id: 1 }, body: { item_ids: ['a'] } }, res); await flush();
    assert.strictEqual(res.code, 200);
    assert.strictEqual(res.body.discount_code, null, 'no code when only item_ids given');
    assert.strictEqual(db.minted.length, 0, 'no discount minted');
    assert.ok(/ti aspettano/i.test(db.emails[0].html), 'features chosen items');
    assert.ok(/Cintura A/.test(db.emails[0].html), 'names the chosen product');
    assert.ok(!/Borsa B/.test(db.emails[0].html), 'does not feature unchosen product');
    ok('mode 2 items: reminder featuring 1 chosen product, no discount');
  }

  /* 4) discount scoped to chosen items */
  {
    db.emails = []; db.minted = [];
    const res = mockRes();
    await recover({ ...ADMIN, params: { id: 1 }, body: { discount: { tipo: 'percentuale', valore: 10 }, item_ids: ['a'] } }, res); await flush();
    assert.strictEqual(res.code, 200);
    assert.ok(res.body.discount_code, 'a code is returned');
    assert.strictEqual(db.minted.length, 1);
    assert.strictEqual(db.minted[0].product_ids, JSON.stringify(['a']), 'code scoped to chosen item');
    assert.ok(/10% di sconto/.test(db.emails[0].html), 'email states the discount');
    assert.ok(/sugli articoli qui sopra/i.test(db.emails[0].html), 'scoped-to-items copy');
    ok('mode 3 discount_items: single-use code scoped to chosen products');
  }

  /* 5) discount scoped to a whole category */
  {
    db.emails = []; db.minted = [];
    const res = mockRes();
    await recover({ ...ADMIN, params: { id: 1 }, body: { discount: { tipo: 'fisso', valore: 5 }, category: 'borse' } }, res); await flush();
    assert.strictEqual(res.code, 200);
    assert.ok(res.body.discount_code, 'a code is returned');
    assert.strictEqual(db.minted.length, 1);
    assert.strictEqual(db.minted[0].product_ids, JSON.stringify(['b', 'c']), 'code scoped to category products (bozza excluded)');
    assert.ok(/categoria borse/i.test(db.emails[0].html), 'email names the category');
    assert.ok(/Borsa B/.test(db.emails[0].html), 'features cart items in that category');
    assert.ok(!/Cintura A/.test(db.emails[0].html), 'does not feature items outside the category');
    ok('mode 4 discount_category: code scoped to the category snapshot');
  }

  /* 6) empty-category guard */
  {
    const res = mockRes();
    await recover({ ...ADMIN, params: { id: 1 }, body: { discount: { tipo: 'fisso', valore: 5 }, category: 'inesistente' } }, res); await flush();
    assert.strictEqual(res.code, 400, 'category with no live products → 400');
    ok('category with no products is rejected (400)');
  }

  /* 7) no email on the cart */
  {
    const res = mockRes();
    await recover({ ...ADMIN, params: { id: 2 }, body: {} }, res); await flush();
    assert.strictEqual(res.code, 400, 'cart without email cannot be recovered');
    ok('cart without email → 400');
  }

  /* 8) list enriches each item with its category */
  {
    const res = mockRes();
    await getList({ ...ADMIN, query: {} }, res); await flush();
    assert.strictEqual(res.code, 200);
    const cart = res.body.carts.find((c) => c.id === 1);
    assert.ok(cart, 'cart 1 present in list');
    assert.strictEqual(cart.items[0].categoria, 'cinture', 'item a enriched with its category');
    assert.strictEqual(cart.items[1].categoria, 'borse', 'item b enriched with its category');
    ok('list: every cart item is enriched with its categoria');
  }

  console.log('\nALL ' + n + ' carts-recovery tests passed.');
})().catch((e) => { console.error('FAILED:', e.stack || e.message); process.exit(1); });
