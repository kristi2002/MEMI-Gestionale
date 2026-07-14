'use strict';
/* Go-live hardening tests (2026-07-10) — no DB/network needed.
   Covers the changes from the go-live pass (docs/GO-LIVE-PLAN-2026-07.md):
     - server-side RBAC: requirePermission() allow/deny matrix
     - PayPal config detection (unconfigured vs configured)
     - boot-time JWT secret validation (placeholder / short / identical are refused)
     - the payments router returns 503 for provider endpoints when unconfigured,
       and GET /api/payments/config advertises provider availability.
   Run: (cd MEMI-Backend && node test/hardening-golive.test.cjs)                */

const assert  = require('assert');
const http    = require('http');
const express = require('express');

// Deterministic: strip any provider/Stripe creds that might leak in from the shell.
['PAYPAL_CLIENT_ID', 'PAYPAL_SECRET', 'PAYPAL_ENV',
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

// ── PayPal config detection ─────────────────────────────
assert.strictEqual(providers.paypalConfigured(), false, 'paypal unconfigured by default');
process.env.PAYPAL_CLIENT_ID = 'test-id'; process.env.PAYPAL_SECRET = 'test-secret';
assert.strictEqual(providers.paypalConfigured(), true, 'paypal configured when both env vars set');
assert.strictEqual(providers.paypalEnv(), 'sandbox', 'paypal env defaults to sandbox');
process.env.PAYPAL_ENV = 'live';
assert.strictEqual(providers.paypalEnv(), 'live', 'paypal env honours live');
delete process.env.PAYPAL_CLIENT_ID; delete process.env.PAYPAL_SECRET; delete process.env.PAYPAL_ENV;
assert.strictEqual(providers.paypalConfigured(), false, 'paypal back to unconfigured after unset');
n += 5;

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
  assert.strictEqual(cfg.json.providers.stripe, false, 'providers.stripe false when unconfigured');
  assert.strictEqual(cfg.json.paypal, null, 'no paypal client-id leaked when unconfigured');
  n += 5;

  let r;
  r = await post('/paypal/create-order', { amount_cents: 5000 });
  assert.strictEqual(r.status, 503, 'paypal/create-order → 503 unconfigured');
  r = await post('/paypal/capture', { paypal_order_id: 'ABC' });
  assert.strictEqual(r.status, 503, 'paypal/capture → 503 unconfigured');
  n += 2;

  await new Promise(r2 => server.close(r2));
  // Drain the lazily-created mysql2 pool so nothing keeps the loop alive / races exit.
  try { await require('../src/db').pool.end(); } catch (_) {}
}

// ── Boot-time JWT secret validation ──────────────────────────────
// server.js validates JWT secrets at module top level and exits before anything
// listens, so each refusal is fast and needs no DB. Spawning a real child process
// is the only honest way to test a process.exit() guard.
const { spawnSync } = require('child_process');
const path = require('path');
const SERVER_JS = path.join(__dirname, '..', 'src', 'server.js');
const STRONG_A  = 'a1'.repeat(32);   // 64 chars, not a placeholder
const STRONG_B  = 'b2'.repeat(32);

function boot(env, timeout) {
  const r = spawnSync(process.execPath, ['-e', 'require(' + JSON.stringify(SERVER_JS) + ')'], {
    env: Object.assign({}, process.env, { NODE_ENV: 'production', DB_HOST: '127.0.0.1' }, env),
    encoding: 'utf8',
    timeout: timeout || 8000,
  });
  return { code: r.status, out: (r.stderr || '') + (r.stdout || '') };
}

function refusesBoot(env, why) {
  const { code, out } = boot(env);
  assert.strictEqual(code, 1, 'should exit 1: ' + why);
  assert.ok(/Refusing to start/.test(out), 'should explain refusal: ' + why);
  n++;
}

function bootChecks() {
  // The exact placeholder defaults docker-compose.yml ships.
  refusesBoot({ JWT_SECRET: 'replace_me_64_char_secret', JWT_ADMIN_SECRET: 'replace_me_admin_secret' }, 'placeholder defaults');
  refusesBoot({ JWT_SECRET: '', JWT_ADMIN_SECRET: STRONG_B }, 'unset secret');
  refusesBoot({ JWT_SECRET: 'tooshort', JWT_ADMIN_SECRET: STRONG_B }, 'short secret');
  refusesBoot({ JWT_SECRET: STRONG_A, JWT_ADMIN_SECRET: STRONG_A }, 'identical secrets');

  // Strong, distinct secrets must NOT be refused. The child then blocks on the
  // (absent) DB and is killed by the timeout — that it got past the guard is the point.
  const ok = boot({ JWT_SECRET: STRONG_A, JWT_ADMIN_SECRET: STRONG_B }, 8000);
  assert.ok(!/Refusing to start/.test(ok.out), 'strong distinct secrets must boot past the guard');
  n++;
}

serverTests().then(() => {
  bootChecks();
  console.log('  ✓ requirePermission allow/deny matrix (5)');
  console.log('  ✓ PayPal config detection (5)');
  console.log('  ✓ payments router 503 gating + /config shape (7)');
  console.log('  ✓ boot-time JWT secret validation (5)');
  console.log('\nALL ' + n + ' go-live hardening tests passed.');
  process.exitCode = 0;   // natural exit — no forced process.exit (avoids the Windows libuv assert)
}).catch(err => {
  console.error('  ✗ ' + (err && err.stack || err));
  process.exitCode = 1;
});
