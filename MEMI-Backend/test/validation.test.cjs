'use strict';
/* Input validation (zod) tests — no DB/network needed. Verifies (Phase 5 of
   docs/PRODUCTION-ROADMAP.md) that validateBody() actually rejects malformed input AND
   doesn't reject legitimate requests the existing route handlers rely on. The order/
   discount/giftcard/payments route tests call handlers directly (bypassing Express's
   middleware chain), so this is the only place the validation layer itself is exercised.
   Run: (cd MEMI-Backend && node test/validation.test.cjs)                              */
const assert = require('assert');
const {
  validateBody, registerSchema, loginSchema, createOrderSchema,
  createDiscountSchema, createGiftcardSchema, createIntentSchema,
} = require('../src/validation');

function mockRes() { return { code: 200, body: null, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; } }; }
function run(schema, body) {
  const req = { body };
  const res = mockRes();
  let calledNext = false;
  validateBody(schema)(req, res, () => { calledNext = true; });
  return { req, res, calledNext };
}

let n = 0;

// ── registerSchema ──
{
  const r = run(registerSchema, { nome: 'Anna', email: 'anna@example.it', password: 'password123' });
  assert.ok(r.calledNext, 'valid register should call next()');
  assert.strictEqual(r.req.body.email, 'anna@example.it', 'email normalized/kept');
  n++;
}
{
  const r = run(registerSchema, { nome: 'Anna', email: 'not-an-email', password: 'password123' });
  assert.ok(!r.calledNext, 'invalid email should NOT call next()');
  assert.strictEqual(r.res.code, 400, 'invalid email -> 400');
  n++;
}
{
  const r = run(registerSchema, { nome: 'Anna', email: 'anna@example.it', password: 'short' });
  assert.ok(!r.calledNext, 'short password should NOT call next()');
  assert.strictEqual(r.res.code, 400, 'short password -> 400');
  n++;
}
{
  // Case/whitespace normalization — a common real-world input shape.
  const r = run(registerSchema, { nome: '  Anna  ', email: '  ANNA@Example.IT ', password: 'password123' });
  assert.ok(r.calledNext, 'should normalize, not reject');
  assert.strictEqual(r.req.body.email, 'anna@example.it', 'email lowercased+trimmed');
  assert.strictEqual(r.req.body.nome, 'Anna', 'nome trimmed');
  n++;
}
console.log(`  ✓ ${n} registerSchema cases passed`);

// ── loginSchema ──
{
  const r = run(loginSchema, { email: 'a@b.it', password: 'x' });
  assert.ok(r.calledNext, 'valid login should call next()');
  n++;
}
{
  const r = run(loginSchema, { email: '', password: 'x' });
  assert.ok(!r.calledNext, 'empty email should NOT call next()');
  n++;
}
console.log(`  ✓ 2 loginSchema cases passed`);

// ── createOrderSchema ──
{
  const r = run(createOrderSchema, {
    nome: 'A', cognome: 'B', email: 'a@b.it', indirizzo: 'Via X 1', citta: 'Milano', cap: '20100',
    items: [{ product_id: 'p1', qty: '2' }],   // qty as string — must coerce
  });
  assert.ok(r.calledNext, 'valid order should call next()');
  assert.strictEqual(r.req.body.items[0].qty, 2, 'qty coerced to number');
  n++;
}
{
  const r = run(createOrderSchema, {
    nome: 'A', cognome: 'B', email: 'a@b.it', indirizzo: 'Via X 1', citta: 'Milano', cap: '20100',
    items: [],
  });
  assert.ok(!r.calledNext, 'empty cart should NOT call next()');
  assert.strictEqual(r.res.code, 400, 'empty cart -> 400');
  n++;
}
{
  const r = run(createOrderSchema, {
    nome: 'A', cognome: 'B', email: 'a@b.it', indirizzo: 'Via X 1', citta: 'Milano', cap: '20100',
    items: [{ product_id: 'p1', qty: 0 }],
  });
  assert.ok(!r.calledNext, 'qty=0 should NOT call next()');
  n++;
}
{
  // Extra/unexpected fields (e.g. a client-sent fake "price") must be silently stripped,
  // not passed through to the handler — this is what stops price-tampering payloads.
  const r = run(createOrderSchema, {
    nome: 'A', cognome: 'B', email: 'a@b.it', indirizzo: 'Via X 1', citta: 'Milano', cap: '20100',
    items: [{ product_id: 'p1', qty: 1, price: 0.01 }],
    total: 0.01,
  });
  assert.ok(r.calledNext, 'extra fields should not block a legitimate order');
  assert.strictEqual(r.req.body.total, undefined, 'unlisted top-level field (total) stripped');
  assert.strictEqual(r.req.body.items[0].price, undefined, 'unlisted item field (price) stripped');
  n++;
}
console.log(`  ✓ 4 createOrderSchema cases passed`);

// ── createDiscountSchema ──
{
  const r = run(createDiscountSchema, { code: 'SUMMER25', tipo: 'percentuale', valore: '25' });
  assert.ok(r.calledNext, 'valid discount should call next()');
  assert.strictEqual(r.req.body.valore, 25, 'valore coerced to number');
  n++;
}
{
  const r = run(createDiscountSchema, { code: 'X', tipo: 'not-a-real-type', valore: 10 });
  assert.ok(!r.calledNext, 'invalid tipo enum should NOT call next()');
  n++;
}
console.log(`  ✓ 2 createDiscountSchema cases passed`);

// ── createGiftcardSchema ──
{
  const r = run(createGiftcardSchema, { initial_amount: '50', recipient_email: 'x@y.it' });
  assert.ok(r.calledNext, 'valid giftcard should call next()');
  assert.strictEqual(r.req.body.initial_amount, 50, 'amount coerced to number');
  n++;
}
{
  const r = run(createGiftcardSchema, { initial_amount: 0 });
  assert.ok(!r.calledNext, 'zero amount should NOT call next()');
  n++;
}
{
  // Regression guard: the admin gift-card form serializes with FormData, so a blank
  // optional recipient arrives as "" (empty string), NOT undefined. Must not 400.
  const r = run(createGiftcardSchema, { initial_amount: '50', recipient_email: '', note: '' });
  assert.ok(r.calledNext, 'empty-string recipient_email (blank form field) must be accepted');
  assert.ok(r.req.body.recipient_email == null, 'empty recipient_email normalized to absent/null');
  n++;
}
console.log(`  ✓ 3 createGiftcardSchema cases passed`);

// ── createIntentSchema ──
{
  const r = run(createIntentSchema, { amount_cents: 5000 });
  assert.ok(r.calledNext, 'valid amount should call next()');
  n++;
}
{
  const r = run(createIntentSchema, { amount_cents: 10 });
  assert.ok(!r.calledNext, 'below-minimum amount should NOT call next()');
  n++;
}
console.log(`  ✓ 2 createIntentSchema cases passed`);

console.log(`\nALL ${n} validation-schema tests passed.`);
