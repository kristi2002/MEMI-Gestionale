'use strict';
/* Lifecycle-email simulation — stateful mock DB, no live MySQL needed.
   Verifies the automated campaigns pick the right customers, respect GDPR
   marketing_consent, mint the right discount codes, and NEVER double-send
   (idempotency ledger), plus dry-run and the season broadcast.
   Run: node test/lifecycle-logic.test.cjs                                   */
const assert = require('assert');

const lifecycle = require('../src/lifecycle');

/* ── helpers ── */
const mmdd = (ymd) => ymd.slice(5, 7) + '-' + ymd.slice(8, 10);
const year = (ymd) => Number(ymd.slice(0, 4));

/* ── stateful mock DB ── */
let db, sends;
function resetDB() {
  sends = [];
  db = {
    // A: birthday today, consented → birthday only
    // B: birthday today, NOT consented → excluded everywhere
    // C: birthday not today, consented
    // D: dormant (last order > 120d), consented → winback
    // E: recent order, consented → no winback
    // F: 300 points, idle, consented → points reminder
    // G: signup anniversary today (2024), consented → anniversary
    // H: 500 points, NOT consented → excluded
    customers: [
      { id: 1, email: 'a@x.it', nome: 'Anna',  birthday: '1990-07-14', created_at: '2026-01-01', marketing_consent: 1, points: 0 },
      { id: 2, email: 'b@x.it', nome: 'Bea',   birthday: '1985-07-14', created_at: '2026-01-01', marketing_consent: 0, points: 0 },
      { id: 3, email: 'c@x.it', nome: 'Carla', birthday: '1992-01-01', created_at: '2026-01-01', marketing_consent: 1, points: 0 },
      { id: 4, email: 'd@x.it', nome: 'Dora',  birthday: null,         created_at: '2025-06-01', marketing_consent: 1, points: 0 },
      { id: 5, email: 'e@x.it', nome: 'Elsa',  birthday: null,         created_at: '2025-06-01', marketing_consent: 1, points: 0 },
      { id: 6, email: 'f@x.it', nome: 'Fede',  birthday: null,         created_at: '2026-02-02', marketing_consent: 1, points: 300 },
      { id: 7, email: 'g@x.it', nome: 'Gaia',  birthday: null,         created_at: '2024-07-14', marketing_consent: 1, points: 0 },
      { id: 8, email: 'h@x.it', nome: 'Ines',  birthday: null,         created_at: '2026-01-01', marketing_consent: 0, points: 500 },
    ],
    lastOrders: { 4: '2025-01-01 10:00:00', 5: '2026-07-01 10:00:00' }, // D dormant, E recent
    recentOrder: new Set([5]),   // E ordered recently
    recentRedeem: new Set(),
    subscribers: ['sub1@x.it', 'a@x.it'], // one new, one overlapping a consented customer
    events: new Set(),
    eventRows: [],
    codes: new Set(),
    codeRows: [],
  };
}

async function execute(sql, params = []) {
  const S = sql.replace(/\s+/g, ' ').trim();

  if (/FROM store_settings WHERE .* LIKE/i.test(S)) return [[]]; // defaults

  if (/^INSERT INTO email_events/i.test(S)) {
    const [email, customer_id, type, dedup_key, detail] = params;
    const key = `${type}|${dedup_key}|${email}`;
    if (db.events.has(key)) { const e = new Error('dup'); e.code = 'ER_DUP_ENTRY'; throw e; }
    db.events.add(key); db.eventRows.push({ email, customer_id, type, dedup_key, detail });
    return [{ insertId: db.eventRows.length }];
  }

  if (/^INSERT INTO discount_codes/i.test(S)) {
    const code = params[0];
    if (db.codes.has(code)) { const e = new Error('dup'); e.code = 'ER_DUP_ENTRY'; throw e; }
    db.codes.add(code); db.codeRows.push({ code, tipo: params[1], valore: params[2] });
    return [{ insertId: db.codeRows.length }];
  }

  // birthday
  if (/FROM customers WHERE marketing_consent = 1 AND birthday IS NOT NULL/i.test(S)) {
    const rows = db.customers.filter(c => c.marketing_consent === 1 && c.birthday && params.includes(mmdd(c.birthday)));
    return [rows.map(c => ({ id: c.id, email: c.email, nome: c.nome }))];
  }

  // anniversary
  if (/YEAR\(created_at\) AS since FROM customers/i.test(S)) {
    const [md, yr] = params;
    const rows = db.customers.filter(c => c.marketing_consent === 1 && c.created_at && mmdd(c.created_at) === md && year(c.created_at) < yr);
    return [rows.map(c => ({ id: c.id, email: c.email, nome: c.nome, since: year(c.created_at) }))];
  }

  // winback
  if (/JOIN orders o ON o\.customer_id = c\.id/i.test(S)) {
    const cutoff = params[0];
    const rows = db.customers.filter(c => c.marketing_consent === 1 && db.lastOrders[c.id] && db.lastOrders[c.id] < cutoff);
    return [rows.map(c => ({ id: c.id, email: c.email, nome: c.nome, last_order: db.lastOrders[c.id].slice(0, 10) }))];
  }

  // points reminder
  if (/COALESCE\(c\.points,0\) AS points FROM customers c/i.test(S)) {
    const minRedeem = params[0];
    const rows = db.customers.filter(c => c.marketing_consent === 1 && (c.points || 0) >= minRedeem && !db.recentOrder.has(c.id) && !db.recentRedeem.has(c.id));
    return [rows.map(c => ({ id: c.id, email: c.email, nome: c.nome, points: c.points || 0 }))];
  }

  // season: consented customers
  if (/SELECT id, email, nome FROM customers WHERE marketing_consent = 1 AND email IS NOT NULL/i.test(S)) {
    const rows = db.customers.filter(c => c.marketing_consent === 1 && c.email);
    return [rows.map(c => ({ id: c.id, email: c.email, nome: c.nome }))];
  }

  // season: subscribers
  if (/FROM newsletter_subscribers WHERE unsubscribed = 0/i.test(S)) {
    return [db.subscribers.map(e => ({ email: e }))];
  }

  throw new Error('unhandled SQL: ' + S);
}

const pool = { execute };
const recordingSend = async (opts) => { sends.push(opts); };
const TODAY = '2026-07-14';

let passed = 0;
const ok = (name) => { console.log('  ✓ ' + name); passed++; };

(async () => {
  /* ── 1. Full daily batch targets the right people, respects consent ── */
  resetDB();
  const s1 = await lifecycle.runDailyLifecycle(pool, { today: TODAY, deps: { send: recordingSend } });
  assert.strictEqual(s1.birthday.sent, 1, 'one birthday email (A); B excluded by consent, C not today');
  assert.strictEqual(s1.winback.sent, 1, 'one winback email (D dormant); E is recent');
  assert.strictEqual(s1.points_reminder.sent, 1, 'one points reminder (F); H excluded by consent');
  assert.strictEqual(s1.anniversary.sent, 1, 'one anniversary email (G)');
  assert.strictEqual(sends.length, 4, 'exactly 4 emails delivered in the batch');
  const recips = sends.map(s => s.to).sort();
  assert.deepStrictEqual(recips, ['a@x.it', 'd@x.it', 'f@x.it', 'g@x.it'], 'correct recipients');
  assert.ok(!recips.includes('b@x.it') && !recips.includes('h@x.it'), 'non-consenting customers never emailed');
  ok('daily batch: correct GDPR-gated targeting (4 sends)');

  /* ── 2. Personalised discount codes minted (birthday/winback/anniversary, NOT points) ── */
  const prefixes = db.codeRows.map(c => c.code.split('-')[0]).sort();
  assert.deepStrictEqual(prefixes, ['BDAY', 'GRAZIE', 'RITORNO'], 'three codes minted, one per code-bearing campaign');
  ok('daily batch: mints one single-use code per code-bearing campaign');

  /* ── 3. Idempotency — a second run the same day sends nothing more ── */
  const sendsAfterFirst = sends.length;
  const codesAfterFirst = db.codeRows.length;
  const s2 = await lifecycle.runDailyLifecycle(pool, { today: TODAY, deps: { send: recordingSend } });
  assert.strictEqual(s2.birthday.sent + s2.winback.sent + s2.points_reminder.sent + s2.anniversary.sent, 0, 're-run sends 0');
  assert.strictEqual(sends.length, sendsAfterFirst, 'no extra emails on re-run');
  assert.strictEqual(db.codeRows.length, codesAfterFirst, 'no extra codes on re-run (claim-before-mint)');
  ok('idempotency: same-day re-run is a no-op (no double emails, no orphan codes)');

  /* ── 4. Dry-run reports candidates but sends nothing and records no events ── */
  resetDB();
  const dry = await lifecycle.runDailyLifecycle(pool, { today: TODAY, dryRun: true, deps: { send: recordingSend } });
  assert.strictEqual(dry.birthday.candidates, 1, 'dry-run still counts the birthday candidate');
  assert.strictEqual(sends.length, 0, 'dry-run delivers no email');
  assert.strictEqual(db.eventRows.length, 0, 'dry-run writes no ledger rows');
  assert.strictEqual(db.codeRows.length, 0, 'dry-run mints no codes');
  ok('dry-run: counts candidates, sends nothing, mutates nothing');

  /* ── 5. Season broadcast: consented audience, de-duped, idempotent by season ── */
  resetDB();
  const b1 = await lifecycle.sendSeasonBroadcast(pool, {
    season: 'Autunno 2026', headline: 'È arrivato l\'autunno', message: 'Nuova collezione.',
    audience: 'consented', deps: { send: recordingSend },
  });
  assert.strictEqual(b1.sent, 6, 'all 6 consented customers (A,C,D,E,F,G) emailed; B,H excluded');
  const b2 = await lifecycle.sendSeasonBroadcast(pool, { season: 'Autunno 2026', audience: 'consented', deps: { send: recordingSend } });
  assert.strictEqual(b2.sent, 0, 're-sending the same season is a no-op');
  assert.strictEqual(b2.skipped, 6, 'all 6 recognised as already-sent');
  ok('season broadcast: consented-only, idempotent per season name');

  /* ── 6. Season 'both' includes newsletter subscribers, de-duped against customers ── */
  resetDB();
  const b3 = await lifecycle.sendSeasonBroadcast(pool, {
    season: 'Saldi', audience: 'both', deps: { send: recordingSend },
  });
  // 6 consented customers + subscribers ['sub1@x.it','a@x.it']; a@x.it already counted → +1 unique
  assert.strictEqual(b3.recipients, 7, 'consented (6) + one unique new subscriber (sub1)');
  ok('season broadcast: audience "both" de-dupes subscribers against customers');

  console.log(`\nALL ${passed} lifecycle-email checks passed.`);
})().catch((e) => { console.error('✗ FAILED:', e.message); process.exit(1); });
