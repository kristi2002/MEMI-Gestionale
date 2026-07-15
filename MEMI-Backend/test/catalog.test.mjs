/**
 * catalog.test.mjs — backend integration + image tests (Phase 3.1 + 3.2)
 * ----------------------------------------------------------------------
 * Proves the admin → DB → API round-trip for the product catalog:
 *   • admin-create a product (with sizes + collection)  → DB
 *   • GET /api/products (and ?collection / ?categoria filters) include it
 *   • GET /api/products/:id returns sizes + images
 *   • PUT updates it
 *   • image upload → stored → served (HTTP 200, image/webp) → referenced in JSON
 *   • placing an order deducts stock
 *   • DELETE removes it everywhere
 *
 * Requires the local stack to be UP (docker compose ... up). No external deps:
 * uses Node's built-in test runner + global fetch/FormData/Blob (Node >= 18).
 *
 * Run:  npm test            (from MEMI-Backend/, with the stack running)
 * Base: override with  MEMI_BASE=http://localhost:3000
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const BASE  = process.env.MEMI_BASE  || 'http://localhost:3000';
const EMAIL = process.env.ADMIN_EMAIL || 'admin@memi.it';
const PASS  = process.env.ADMIN_PASS  || process.env.ADMIN_PASSWORD || 'memi2026admin';

const ID    = 'itest-' + Date.now();
const NAME  = 'ITEST Prodotto ' + ID;
const COLL  = 'vestiti';        // a collection slug that has a storefront page
const CAT   = 'vestiti';

// 1x1 PNG (decodable by sharp) used for the upload test.
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

let token;
const auth = () => ({ Authorization: 'Bearer ' + token });
const json = (extra = {}) => ({ 'Content-Type': 'application/json', ...extra });

test('catalog admin→DB→API round-trip', async (t) => {
  await t.test('admin login returns a token', async () => {
    const r = await fetch(`${BASE}/api/admin/auth/login`, {
      method: 'POST', headers: json(),
      body: JSON.stringify({ email: EMAIL, password: PASS }),
    });
    assert.equal(r.status, 200, 'login should be 200');
    const b = await r.json();
    assert.ok(b.token, 'token present');
    token = b.token;
  });

  await t.test('create product persists to DB', async () => {
    const r = await fetch(`${BASE}/api/products`, {
      method: 'POST', headers: json(auth()),
      body: JSON.stringify({
        id: ID, name: NAME, categoria: CAT, price: 99.0,
        color_label: 'Test', colore: 'blush', description: 'desc',
        collections: ['shop-all', COLL], status: 'attivo',
        taglie: [{ taglia: 'M', stock: 5 }, { taglia: 'L', stock: 2 }],
      }),
    });
    assert.equal(r.status, 201, 'create should be 201');
  });

  await t.test('GET /api/products includes the new product', async () => {
    const list = await (await fetch(`${BASE}/api/products?limit=500`)).json();
    assert.ok(Array.isArray(list));
    assert.ok(list.find((p) => p.id === ID), 'product in full list');
  });

  await t.test('?collection and ?categoria filters include it', async () => {
    const byColl = await (await fetch(`${BASE}/api/products?collection=${COLL}&limit=500`)).json();
    assert.ok(byColl.find((p) => p.id === ID), 'product in collection filter');
    const byCat = await (await fetch(`${BASE}/api/products?categoria=${CAT}&limit=500`)).json();
    assert.ok(byCat.find((p) => p.id === ID), 'product in category filter');
  });

  await t.test('GET /api/products/:id returns sizes', async () => {
    const p = await (await fetch(`${BASE}/api/products/${ID}`)).json();
    assert.equal(p.id, ID);
    assert.ok(Array.isArray(p.taglie), 'taglie array');
    const m = p.taglie.find((s) => s.taglia === 'M');
    assert.ok(m && Number(m.stock) === 5, 'size M stock seeded = 5');
  });

  await t.test('PUT updates the product', async () => {
    const r = await fetch(`${BASE}/api/products/${ID}`, {
      method: 'PUT', headers: json(auth()),
      body: JSON.stringify({ price: 79.5, name: NAME + ' (mod)' }),
    });
    assert.equal(r.status, 200);
    const p = await (await fetch(`${BASE}/api/products/${ID}`)).json();
    assert.equal(Number(p.price), 79.5, 'price updated');
    assert.match(p.name, /\(mod\)$/, 'name updated');
  });

  await t.test('image upload is stored, served and referenced', async () => {
    const fd = new FormData();
    fd.append('images', new Blob([PNG_1x1], { type: 'image/png' }), 'test.png');
    const up = await fetch(`${BASE}/api/products/${ID}/images`, { method: 'POST', headers: auth(), body: fd });
    assert.equal(up.status, 201, 'upload should be 201');
    const body = await up.json();
    assert.ok(Array.isArray(body.images) && body.images.length, 'images array returned');

    const variant = body.images[0];
    const url = (typeof variant === 'string') ? variant : (variant.full || variant.card || variant.thumb);
    assert.ok(/^\/api\/uploads\//.test(url), 'served under /api/uploads/');

    const img = await fetch(BASE + url);
    assert.equal(img.status, 200, 'image served 200');
    assert.match(img.headers.get('content-type') || '', /image\/(webp|png|jpeg)/, 'image content-type');

    // And the product JSON now references the image.
    const p = await (await fetch(`${BASE}/api/products/${ID}`)).json();
    const imgs = JSON.stringify(p.images);
    assert.ok(imgs.includes(url.split('/').pop()), 'product JSON references the uploaded image');
  });

  await t.test('placing an order deducts stock', async () => {
    const before = await (await fetch(`${BASE}/api/products/${ID}/stock`)).json();
    const mBefore = Number(before.find((s) => s.taglia === 'M').stock);

    const order = await fetch(`${BASE}/api/orders`, {
      method: 'POST', headers: json(),
      body: JSON.stringify({
        nome: 'Test', cognome: 'Buyer', email: 'buyer@example.com',
        indirizzo: 'Via Test 1', citta: 'Milano', cap: '20100',
        // 'carta' — the only always-valid method. ('bonifico' was never in the API's
        // ENUM('carta','paypal','klarna'); this subtest could never pass with it.)
        // Without STRIPE_SECRET_KEY configured the order is accepted as in_attesa (2xx).
        payment_method: 'carta',
        items: [{ product_id: ID, product_name: NAME, taglia: 'M', colore: 'blush', price: 79.5, qty: 2 }],
      }),
    });
    assert.ok(order.status >= 200 && order.status < 300, 'order placed (HTTP ' + order.status + ')');

    const after = await (await fetch(`${BASE}/api/products/${ID}/stock`)).json();
    const mAfter = Number(after.find((s) => s.taglia === 'M').stock);
    assert.equal(mAfter, mBefore - 2, 'stock for M decremented by 2');
  });

  await t.test('DELETE removes it from the catalog', async () => {
    const r = await fetch(`${BASE}/api/products/${ID}`, { method: 'DELETE', headers: auth() });
    assert.equal(r.status, 200, 'delete should be 200');
    const gone = await fetch(`${BASE}/api/products/${ID}`);
    assert.equal(gone.status, 404, 'detail now 404');
    const list = await (await fetch(`${BASE}/api/products?limit=500`)).json();
    assert.ok(!list.find((p) => p.id === ID), 'absent from list');
  });
});
