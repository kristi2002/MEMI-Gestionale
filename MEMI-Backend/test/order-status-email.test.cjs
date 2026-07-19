'use strict';
/**
 * order-status-email.test.cjs — guards the transactional per-status customer email
 * (src/email.js → sendOrderStatusUpdate) wired into PUT /orders/admin/:id/status and
 * the courier refresh-tracking delivery promotion.
 *
 * Regression it locks down: a delivered order must send a "consegnato" message and
 * must NOT leave "il tuo pacco è in viaggio" as the customer's last email.
 *
 * Self-contained: intercepts nodemailer so no SMTP/network is touched.
 */
const assert = require('assert');
const path = require('path');

// Capture every sendMail() call instead of talking to a real SMTP server.
const sent = [];
const nm = require('nodemailer');
nm.createTransport = () => ({ sendMail: async (m) => { sent.push(m); return { messageId: 'x' }; } });

// getTransporter() only builds when both creds are present.
process.env.SMTP_USER = 'test@memi.it';
process.env.SMTP_PASS = 'dummy';

const { sendOrderStatusUpdate } = require(path.join(__dirname, '..', 'src', 'email.js'));

let n = 0;
const ok = (m) => { console.log('  ✓ ' + m); n++; };

(async () => {
  // ── consegnato: the reported bug ───────────────────────────────
  sent.length = 0;
  await sendOrderStatusUpdate({ order_number: 'MEMI-1001', nome: 'Giulia', email: 'g@x.it',
    status: 'consegnato', tracking_number: 'TRK9', courier_code: 'BRT' });
  assert.strictEqual(sent.length, 1, 'consegnato sends exactly one email');
  const cons = sent[0];
  assert.ok(/consegnato/i.test(cons.subject), 'consegnato subject says consegnato');
  assert.ok(/è stato consegnato/i.test(cons.html), 'consegnato body says delivered');
  assert.ok(!/in viaggio/i.test(cons.subject + cons.html + cons.text),
    'consegnato email MUST NOT contain "in viaggio" anywhere');
  assert.ok(cons.html.includes('TRK9') && cons.html.includes('BRT'), 'consegnato shows tracking recap');
  ok('consegnato → delivered wording, never "in viaggio", tracking recap present');

  // ── spedito ────────────────────────────────────────────────────
  sent.length = 0;
  await sendOrderStatusUpdate({ order_number: 'MEMI-1002', nome: 'Luca', email: 'l@x.it',
    status: 'spedito', tracking_number: 'TRK2', courier_code: 'SDA' });
  assert.strictEqual(sent.length, 1, 'spedito sends one email');
  assert.ok(/in viaggio/i.test(sent[0].subject), 'spedito subject says in viaggio');
  assert.ok(sent[0].html.includes('TRK2'), 'spedito shows tracking');
  ok('spedito → "in viaggio" wording with tracking');

  // ── in_preparazione (no tracking code) ─────────────────────────
  sent.length = 0;
  await sendOrderStatusUpdate({ order_number: 'MEMI-1003', nome: 'Mara', email: 'm@x.it',
    status: 'in_preparazione' });
  assert.strictEqual(sent.length, 1, 'in_preparazione sends one email');
  assert.ok(/preparazione/i.test(sent[0].subject), 'prep subject says preparazione');
  assert.ok(!/Courier New/.test(sent[0].html), 'prep has no styled tracking block');
  ok('in_preparazione → preparazione wording, no tracking block');

  // ── in_attesa & annullato: no transactional status email here ──
  sent.length = 0;
  await sendOrderStatusUpdate({ order_number: 'MEMI-1004', nome: 'Ivan', email: 'i@x.it', status: 'in_attesa' });
  await sendOrderStatusUpdate({ order_number: 'MEMI-1005', nome: 'Sara', email: 's@x.it', status: 'annullato' });
  assert.strictEqual(sent.length, 0, 'in_attesa + annullato are suppressed (annullato has its own cancellation email)');
  ok('in_attesa & annullato suppressed (no double-send vs cancellation email)');

  // ── guards: no email address, no SMTP ──────────────────────────
  sent.length = 0;
  await sendOrderStatusUpdate({ order_number: 'MEMI-1006', nome: 'X', status: 'consegnato' }); // no email
  assert.strictEqual(sent.length, 0, 'missing email → no send');
  ok('missing recipient email → no send');

  console.log('\nALL ' + n + ' order-status-email tests passed.');
})().catch((e) => { console.error('FAILED:', e.stack || e.message); process.exit(1); });
