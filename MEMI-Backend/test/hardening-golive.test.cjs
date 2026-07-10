'use strict';
/* Go-live hardening tests (2026-07-10) — no DB/network needed.
   Covers the changes from the go-live pass (docs/GO-LIVE-PLAN-2026-07.md):
     - server-side RBAC: requirePermission() allow/deny matrix
     - PayPal/Klarna config detection (unconfigured vs configured)
     - the payments router returns 503 for provider endpoints when unconfigured,
       and GET /api/payments/config advertises provider availability.
   Run: (cd MEMI-Backend && node test/hardening-golive.test.cjs)                */

const assert  = require('assert');
const http    = require('http');
const express = require('express');

// Deterministic: strip any provider/Stripe creds that might leak in from the shell.
['PAYPAL_CLIENT_ID', 'PAYPAL_SECRET', 'PAYPAL_ENV', 'KLARNA_USERNAME', 'KLARNA_PASSWORD',
 'STRIPE_SECRET_KEY', 'STRIPE_PUBLISHABLE_KEY'].forEach(k => { delete process.env[k]; });

const { requirePermission } = require('../src/middleware/auth');
const providers = require('../src/payment-providers');

let n = 0;

// ── requirePermission allow/deny matrix ──────────────────────────
function runPerm(admin, views) {
  let status = 200, body = null, nexted = false;
  const req = { admin };
  const res = { status(s) { status = s; return this; }, json(b) { body = b; return this; } };
  requirePermission(...views)(req, res, () => { nexted = true; });
  return { nexted, status, body };
}
assert.ok(runPerm({ role: 'admin', permissions: null }, ['returns']).nexted, 'full admin allowed everywhere');
assert.ok(runPerm({ role: 'staff', permissions: ['dashboard', 'returns'] }, ['returns']).nexted, 'staff WITH the view allowed');
{
  const r = runPerm({ role: 'staff', permissions: ['dashboard', 'marketing'] }, ['returns']);
  assert.ok(!r.nexted && r.status === 403, 'staff WITHOUT the view → 403 (the refund-escalation fix)');
}
assert.ok(runPerm({ role: 'staff', permissions: null }, ['returns']).nexted, 'default staff has returns (STAFF_VIEWS)');
{
  const r = runPerm({ role: 'staff', permissions: null }, ['audit-log']);
  assert.ok(!r.nexted && r.status === 403, 'default staff blocked from admin-only audit-log');
}
n += 5;

// ── PayPal / Klarna config detection ─────────────────────────────
assert.strictEqual(providers.paypalConfigured(), false, 'paypal unconfigured by default');
assert.strictEqual(providers.klarnaConfigured(), false, 'klarna unconfigured by default');
process.env.PAYPAL_CLIENT_ID = 'test-id'; process.env.PAYPAL_SECRET = 'test-secret';
assert.strictEqual(providers.paypalConfigured(), true, 'paypal configured when both env vars set');
assert.strictEqual(providers.paypalEnv(), 'sandbox', 'paypal env defaults to sandbox');
process.env.PAYPAL_ENV = 'live';
assert.strictEqual(providers.paypalEnv(), 'live', 'paypal env honours live');
delete process.env.PAYPAL_CLIENT_ID; delete process.env.PAYPAL_SECRET; delete process.env.PAYPAL_ENV;
assert.strictEqual(providers.paypalConfigured(), false, 'paypal back to unconfigured after unset');
n += 6;

// ── payments router: 503 gating + /config providers shape ────────
async function serverTests() {
  const paymentsRouter = require('../src/routes/payments');   // lazy DB pool; 503 paths never query
  const app = express();
  app.use(express.json());
  app.use('/api/payments', paymentsRouter);
  const server = http.createServer(app);
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  // Raw http.request with Connection: close (not fetch/undici) so there are no lingering
  // keep-alive sockets to race process.exit — that triggers a libuv assertion on Windows.
  function httpReq(method, path, bodyObj) {
    return new Promise((resolve, reject) => {
      const data = bodyObj ? JSON.stringify(bodyObj) : null;
      const headers = { Connection: 'close' };
      if (data) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(data); }
      const req = http.request({ hostname: '127.0.0.1', port, path: '/api/payments' + path, method, headers }, res => {
        let chunks = '';
        res.on('data', c => { chunks += c; });
        res.on('end', () => { let j = null; try { j = chunks ? JSON.parse(chunks) : null; } catch (_) {} resolve({ status: res.statusCode, json: j }); });
      });
      req.on('error', reject);
      if (data) req.write(data);
      req.end();
    });
  }
  const post = (p, b) => httpReq('POST', p, b);
  const get  = (p)    => httpReq('GET', p, null);

  const cfg = await get('/config');
  assert.strictEqual(cfg.status, 200, 'GET /config → 200');
  assert.ok(cfg.json && cfg.json.providers, '/config exposes providers');
  assert.strictEqual(cfg.json.providers.paypal, false, 'providers.paypal false when unconfigured');
  assert.strictEqual(cfg.json.providers.klarna, false, 'providers.klarna false when unconfigured');
  assert.strictEqual(cfg.json.providers.stripe, false, 'providers.stripe false when unconfigured');
  assert.strictEqual(cfg.json.paypal, null, 'no paypal client-id leaked when unconfigured');
  n += 6;

  let r;
  r = await post('/paypal/create-order', { amount_cents: 5000 });
  assert.strictEqual(r.status, 503, 'paypal/create-order → 503 unconfigured');
  r = await post('/paypal/capture', { paypal_order_id: 'ABC' });
  assert.strictEqual(r.status, 503, 'paypal/capture → 503 unconfigured');
  r = await post('/klarna/create-session', { amount_cents: 5000 });
  assert.strictEqual(r.status, 503, 'klarna/create-session → 503 unconfigured');
  r = await post('/klarna/create-order', { authorization_token: 't', amount_cents: 5000 });
  assert.strictEqual(r.status, 503, 'klarna/create-order → 503 unconfigured');
  n += 4;

  await new Promise(r2 => server.close(r2));
  // Drain the lazily-created mysql2 pool so nothing keeps the loop alive / races exit.
  try { await require('../src/db').pool.end(); } catch (_) {}
}

serverTests().then(() => {
  console.log('  ✓ requirePermission allow/deny matrix (5)');
  console.log('  ✓ PayPal/Klarna config detection (6)');
  console.log('  ✓ payments router 503 gating + /config shape (10)');
  console.log('\nALL ' + n + ' go-live hardening tests passed.');
  process.exitCode = 0;   // natural exit — no forced process.exit (avoids the Windows libuv assert)
}).catch(err => {
  console.error('  ✗ ' + (err && err.stack || err));
  process.exitCode = 1;
});
