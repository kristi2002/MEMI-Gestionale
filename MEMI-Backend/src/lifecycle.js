'use strict';

/**
 * lifecycle.js — automated customer lifecycle / marketing emails
 * ──────────────────────────────────────────────────────────────
 * The kind of "moment-based" emails big retailers send automatically:
 *
 *   birthday          Customer's birthday today            → personal % code
 *   winback           Ordered before, but not in a while   → "we miss you" + code
 *   points_reminder   Has redeemable loyalty points, idle  → reminder of their € value
 *   anniversary       1+ year since they registered        → thank-you + small code
 *   new_season        Admin broadcast (new collection/sale) → to all consented customers
 *
 * Three invariants hold for EVERY send in this module:
 *   • GDPR-gated  — only customers with marketing_consent = 1 are ever targeted
 *                   (season broadcast can also include opted-in newsletter subscribers).
 *   • Idempotent  — a row is claimed in `email_events (type, dedup_key, email)` BEFORE
 *                   sending. The UNIQUE key means a duplicate claim = "already sent this
 *                   period", so a re-run (or a second app instance) never double-emails.
 *                   The claim happens before any discount code is minted, so a duplicate
 *                   never leaves an orphan code behind.
 *   • Best-effort — a failing send never throws out of the batch; SMTP unset makes
 *                   sendGenericEmail a silent no-op (same convention as the whole app),
 *                   so these run harmlessly with nothing delivered until SMTP is set.
 *
 * The `deps.send` seam lets tests inject a recording sender instead of real SMTP.
 */

const { sendGenericEmail } = require('./email');
const loyalty = require('./loyalty');

const BASE_URL = () => (process.env.FRONTEND_URL || 'https://memiabbigliamento.it').replace(/\/+$/, '');

/* ── tunables (store_settings, key LIKE 'lifecycle_%') ── */
const SETTINGS_DEFAULTS = {
  lifecycle_enabled:          '1',
  lifecycle_birthday_pct:     '15',   // % off in the birthday code
  lifecycle_birthday_days:    '30',   // birthday code validity (days)
  lifecycle_winback_days:     '120',  // "dormant" threshold since last order
  lifecycle_winback_pct:      '10',
  lifecycle_anniversary_pct:  '12',
  lifecycle_points_idle_days: '45',   // no order/redeem in N days → nudge unused points
};

/* ── small date/number helpers (plain Date is fine in app runtime) ── */
const pad2  = (n) => String(n).padStart(2, '0');
const ymd   = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const mmdd  = (d) => `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const isLeap  = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const quarter = (d) => Math.floor(d.getMonth() / 3) + 1;
const intOr   = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
const clampPct = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.max(1, Math.min(90, n)) : d; };

async function getSettings(pool) {
  const cfg = { ...SETTINGS_DEFAULTS };
  try {
    const [rows] = await pool.execute(
      "SELECT `key`, `value` FROM store_settings WHERE `key` LIKE 'lifecycle\\_%'"
    );
    rows.forEach((r) => { cfg[r.key] = r.value; });
  } catch (_) { /* settings table may not exist yet */ }
  return cfg;
}

function isEnabled(cfg) {
  return cfg.lifecycle_enabled !== '0' && cfg.lifecycle_enabled !== 'false';
}

/** Claim a per-period send slot. Returns true if THIS call won the slot (should send),
 *  false if it was already taken (duplicate → skip). Throws only on real DB errors. */
async function claimEvent(pool, { type, dedupKey, email, customerId, detail }) {
  try {
    await pool.execute(
      `INSERT INTO email_events (email, customer_id, type, dedup_key, detail) VALUES (?, ?, ?, ?, ?)`,
      [email, customerId || null, type, dedupKey, detail || null]
    );
    return true;
  } catch (e) {
    if (e && e.code === 'ER_DUP_ENTRY') return false;
    throw e;
  }
}

/** Mint a unique single-use discount code in `discount_codes`, expiring in `days`. */
async function issueCode(pool, { prefix, tipo, valore, min_order = 0, max_utilizzi = 1, days = 30, today }) {
  const scad = ymd(addDays(today, days));
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = `${prefix}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    try {
      await pool.execute(
        `INSERT INTO discount_codes (code, tipo, valore, max_utilizzi, scadenza, stato, min_order)
         VALUES (?, ?, ?, ?, ?, 'attivo', ?)`,
        [code, tipo, valore, max_utilizzi, scad, min_order]
      );
      return { code, scadenza: scad };
    } catch (e) {
      if (e && e.code === 'ER_DUP_ENTRY') continue;
      throw e;
    }
  }
  return null;
}

/** Run async fn over items with bounded concurrency (never rejects; per-item errors captured). */
async function mapLimit(items, limit, fn) {
  const results = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      try { results[idx] = await fn(items[idx], idx); }
      catch (e) { results[idx] = { error: e.message }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length || 1) }, worker));
  return results;
}

/* ═══════════════════ EMAIL TEMPLATES ═══════════════════ */
/* Shared branded shell — mirrors the dark-header style already in email.js. */
function brand({ title, heading, bodyHtml, code, codeNote, ctaLabel, ctaUrl }) {
  const codeBlock = code ? `
      <div style="margin:22px 0;text-align:center;">
        <div style="display:inline-block;border:1px dashed #c9897a;border-radius:8px;padding:14px 26px;">
          <span style="font-size:12px;letter-spacing:.14em;color:#a89090;display:block;margin-bottom:4px;text-transform:uppercase;">Il tuo codice</span>
          <span style="font-size:24px;font-weight:600;letter-spacing:.14em;color:#3B2B2B;">${code}</span>
        </div>
        ${codeNote ? `<p style="color:#a89090;font-size:12px;margin:10px 0 0;">${codeNote}</p>` : ''}
      </div>` : '';
  const cta = ctaUrl ? `
      <a href="${ctaUrl}" style="display:inline-block;padding:14px 32px;background:#3B2B2B;color:#fff;text-decoration:none;font-size:13px;letter-spacing:.1em;text-transform:uppercase;border-radius:4px;margin:8px 0 24px;">${ctaLabel || 'Scopri'}</a>` : '';
  return `
<!DOCTYPE html>
<html lang="it">
<head><meta charset="UTF-8"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#faf7f4;font-family:'Helvetica Neue',Arial,sans-serif;color:#3B2B2B;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,.06);">
    <div style="background:#3B2B2B;padding:32px 40px;text-align:center;">
      <h1 style="color:#fff;font-size:28px;font-weight:300;letter-spacing:.12em;margin:0;">Memi<span style="color:#c9897a;">.</span></h1>
    </div>
    <div style="padding:36px 40px;">
      <p style="font-size:22px;font-weight:300;font-family:Georgia,serif;margin:0 0 16px;">${heading}</p>
      ${bodyHtml}
      ${codeBlock}
      ${cta}
    </div>
    <div style="background:#faf7f4;padding:20px 40px;text-align:center;font-size:12px;color:#a89090;">
      Ricevi questa email perché hai un account Memi e hai autorizzato l'invio di comunicazioni.<br>
      © 2026 Memi Abbigliamento · Milano, Italia
    </div>
  </div>
</body>
</html>`;
}

function tplBirthday({ nome, pct, code, days }) {
  const name = nome || 'da parte nostra';
  return {
    subject: `Buon compleanno${nome ? ', ' + nome : ''}! Un regalo da Memi 🎁`,
    html: brand({
      title: 'Buon compleanno da Memi',
      heading: `Tanti auguri, ${name}!`,
      bodyHtml: `<p style="color:#7a6060;font-size:15px;line-height:1.7;margin:0;">Festeggiamo con te: usa il codice qui sotto per <strong>${pct}% di sconto</strong> su tutto, valido ${days} giorni.</p>`,
      code, codeNote: `Valido ${days} giorni · un solo utilizzo`,
      ctaLabel: 'Scegli il tuo regalo', ctaUrl: `${BASE_URL()}/shop`,
    }),
    text: `Tanti auguri, ${name}! Usa il codice ${code || ''} per ${pct}% di sconto su tutto (valido ${days} giorni). ${BASE_URL()}/shop`,
  };
}

function tplWinback({ nome, pct, code }) {
  const name = nome || '';
  return {
    subject: 'Ci manchi — un pensiero per te da Memi',
    html: brand({
      title: 'Ci manchi', heading: `Ci manchi${name ? ', ' + name : ''}.`,
      bodyHtml: `<p style="color:#7a6060;font-size:15px;line-height:1.7;margin:0;">È passato un po'. Abbiamo nuovi arrivi che potrebbero piacerti — e un <strong>${pct}% di sconto</strong> per darti il bentornato.</p>`,
      code, codeNote: 'Valido 30 giorni · un solo utilizzo',
      ctaLabel: 'Torna a trovarci', ctaUrl: `${BASE_URL()}/shop`,
    }),
    text: `Ci manchi${name ? ', ' + name : ''}. Bentornato con ${pct}% di sconto: codice ${code || ''} (valido 30 giorni). ${BASE_URL()}/shop`,
  };
}

function tplPoints({ nome, points, value, minRedeem }) {
  const name = nome || '';
  return {
    subject: `Hai ${points} punti Memi da usare`,
    html: brand({
      title: 'I tuoi punti fedeltà', heading: `${name ? name + ', hai' : 'Hai'} ${points} punti.`,
      bodyHtml: `<p style="color:#7a6060;font-size:15px;line-height:1.7;margin:0;">I tuoi punti fedeltà valgono circa <strong>€${value.toFixed(2)}</strong> di sconto. Ti bastano ${minRedeem} punti per iniziare a riscattare — non lasciarli inutilizzati!</p>`,
      ctaLabel: 'Riscatta i punti', ctaUrl: `${BASE_URL()}/account`,
    }),
    text: `${name ? name + ', hai' : 'Hai'} ${points} punti Memi (circa €${value.toFixed(2)}). Riscattali dalla tua Area Personale: ${BASE_URL()}/account`,
  };
}

function tplAnniversary({ nome, years, pct, code }) {
  const name = nome || '';
  const span = years >= 1 ? `${years} ${years === 1 ? 'anno' : 'anni'}` : 'un anno';
  return {
    subject: `${span} insieme — grazie da Memi`,
    html: brand({
      title: 'Anniversario Memi', heading: `Grazie${name ? ', ' + name : ''}.`,
      bodyHtml: `<p style="color:#7a6060;font-size:15px;line-height:1.7;margin:0;">Sono passati ${span} da quando ti sei unita a Memi. Per festeggiare, ecco un <strong>${pct}% di sconto</strong> con la nostra gratitudine.</p>`,
      code, codeNote: 'Valido 21 giorni · un solo utilizzo',
      ctaLabel: 'Festeggia con noi', ctaUrl: `${BASE_URL()}/shop`,
    }),
    text: `Grazie${name ? ', ' + name : ''} — ${span} insieme. Codice ${code || ''} per ${pct}% di sconto (valido 21 giorni). ${BASE_URL()}/shop`,
  };
}

function tplSeason({ nome, headline, message, ctaUrl, ctaLabel, season }) {
  const name = nome || '';
  const body = message
    ? message.split(/\n{2,}/).map((p) => `<p style="color:#7a6060;font-size:15px;line-height:1.7;margin:0 0 14px;">${String(p).replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>`).join('')
    : `<p style="color:#7a6060;font-size:15px;line-height:1.7;margin:0;">La nuova collezione ${season} è arrivata. Scoprila in anteprima.</p>`;
  return {
    subject: headline || `Nuova collezione ${season} — Memi`,
    html: brand({
      title: headline || `Nuova collezione ${season}`,
      heading: headline || `${season} è arrivata${name ? ', ' + name : ''}.`,
      bodyHtml: body,
      ctaLabel: ctaLabel || 'Scopri la collezione', ctaUrl: ctaUrl || `${BASE_URL()}/shop`,
    }),
    text: `${headline || `Nuova collezione ${season}`}\n\n${message || `La nuova collezione ${season} è arrivata.`}\n\n${ctaUrl || `${BASE_URL()}/shop`}`,
  };
}

/* ═══════════════════ SCHEDULED CAMPAIGNS ═══════════════════ */

async function runBirthday(pool, { today, dryRun, cfg, deps }) {
  const send = (deps && deps.send) || sendGenericEmail;
  const pct  = clampPct(cfg.lifecycle_birthday_pct, 15);
  const days = intOr(cfg.lifecycle_birthday_days, 30);
  const md   = mmdd(today);
  // Feb-29 birthdays: in a non-leap year, celebrate them on Feb 28 so they aren't skipped.
  const extra = (md === '02-28' && !isLeap(today.getFullYear())) ? '02-29' : null;
  const [rows] = await pool.execute(
    `SELECT id, email, nome FROM customers
      WHERE marketing_consent = 1 AND birthday IS NOT NULL
        AND (DATE_FORMAT(birthday, '%m-%d') = ?${extra ? " OR DATE_FORMAT(birthday, '%m-%d') = ?" : ''})`,
    extra ? [md, extra] : [md]
  );
  const dedupKey = `y${today.getFullYear()}`;
  let sent = 0, skipped = 0;
  for (const c of rows) {
    if (!c.email) { skipped++; continue; }
    if (dryRun) continue;
    const claimed = await claimEvent(pool, { type: 'birthday', dedupKey, email: c.email, customerId: c.id });
    if (!claimed) { skipped++; continue; }
    const code = await issueCode(pool, { prefix: 'BDAY', tipo: 'percentuale', valore: pct, days, today });
    const msg = tplBirthday({ nome: c.nome, pct, code: code && code.code, days });
    try { await send({ to: c.email, subject: msg.subject, html: msg.html, text: msg.text }); } catch (_) {}
    sent++;
  }
  return { candidates: rows.length, sent, skipped };
}
runBirthday.campaign = 'birthday';

async function runWinback(pool, { today, dryRun, cfg, deps }) {
  const send    = (deps && deps.send) || sendGenericEmail;
  const winDays = intOr(cfg.lifecycle_winback_days, 120);
  const pct     = clampPct(cfg.lifecycle_winback_pct, 10);
  const cutoff  = ymd(addDays(today, -winDays)) + ' 00:00:00';
  const [rows] = await pool.execute(
    `SELECT c.id, c.email, c.nome, DATE(MAX(o.created_at)) AS last_order
       FROM customers c
       JOIN orders o ON o.customer_id = c.id
      WHERE c.marketing_consent = 1
      GROUP BY c.id, c.email, c.nome
     HAVING MAX(o.created_at) < ?`,
    [cutoff]
  );
  let sent = 0, skipped = 0;
  for (const c of rows) {
    if (!c.email) { skipped++; continue; }
    if (dryRun) continue;
    // One win-back per dormancy episode: keyed to their last-order date, so a still-dormant
    // customer isn't re-emailed next run — only after they order again (new last_order).
    const dedupKey = `last${String(c.last_order).slice(0, 10)}`;
    const claimed = await claimEvent(pool, { type: 'winback', dedupKey, email: c.email, customerId: c.id });
    if (!claimed) { skipped++; continue; }
    const code = await issueCode(pool, { prefix: 'RITORNO', tipo: 'percentuale', valore: pct, days: 30, today });
    const msg = tplWinback({ nome: c.nome, pct, code: code && code.code });
    try { await send({ to: c.email, subject: msg.subject, html: msg.html, text: msg.text }); } catch (_) {}
    sent++;
  }
  return { candidates: rows.length, sent, skipped };
}
runWinback.campaign = 'winback';

async function runPointsReminder(pool, { today, dryRun, cfg, deps }) {
  const send = (deps && deps.send) || sendGenericEmail;
  const idle = intOr(cfg.lifecycle_points_idle_days, 45);
  const loyaltyCfg = await loyalty.getConfig(pool);
  if (!loyaltyCfg.enabled) return { candidates: 0, sent: 0, skipped: 0, note: 'loyalty disabled' };
  const minRedeem  = loyaltyCfg.minRedeem || 100;
  const idleCutoff = ymd(addDays(today, -idle)) + ' 00:00:00';
  const [rows] = await pool.execute(
    `SELECT c.id, c.email, c.nome, COALESCE(c.points,0) AS points
       FROM customers c
      WHERE c.marketing_consent = 1
        AND COALESCE(c.points,0) >= ?
        AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id AND o.created_at >= ?)
        AND NOT EXISTS (SELECT 1 FROM loyalty_transactions lt WHERE lt.customer_id = c.id AND lt.reason = 'riscatto' AND lt.created_at >= ?)`,
    [minRedeem, idleCutoff, idleCutoff]
  );
  const dedupKey = `pts${today.getFullYear()}Q${quarter(today)}`;   // at most once per quarter
  let sent = 0, skipped = 0;
  for (const c of rows) {
    if (!c.email) { skipped++; continue; }
    if (dryRun) continue;
    const claimed = await claimEvent(pool, { type: 'points_reminder', dedupKey, email: c.email, customerId: c.id });
    if (!claimed) { skipped++; continue; }
    const value = +((Number(c.points) || 0) * loyaltyCfg.pointValueEur).toFixed(2);
    const msg = tplPoints({ nome: c.nome, points: c.points, value, minRedeem });
    try { await send({ to: c.email, subject: msg.subject, html: msg.html, text: msg.text }); } catch (_) {}
    sent++;
  }
  return { candidates: rows.length, sent, skipped };
}
runPointsReminder.campaign = 'points_reminder';

async function runAnniversary(pool, { today, dryRun, cfg, deps }) {
  const send = (deps && deps.send) || sendGenericEmail;
  const pct  = clampPct(cfg.lifecycle_anniversary_pct, 12);
  const md   = mmdd(today);
  const [rows] = await pool.execute(
    `SELECT id, email, nome, YEAR(created_at) AS since FROM customers
      WHERE marketing_consent = 1 AND created_at IS NOT NULL
        AND DATE_FORMAT(created_at, '%m-%d') = ? AND YEAR(created_at) < ?`,
    [md, today.getFullYear()]
  );
  const dedupKey = `y${today.getFullYear()}`;
  let sent = 0, skipped = 0;
  for (const c of rows) {
    if (!c.email) { skipped++; continue; }
    if (dryRun) continue;
    const claimed = await claimEvent(pool, { type: 'anniversary', dedupKey, email: c.email, customerId: c.id });
    if (!claimed) { skipped++; continue; }
    const years = today.getFullYear() - Number(c.since);
    const code = await issueCode(pool, { prefix: 'GRAZIE', tipo: 'percentuale', valore: pct, days: 21, today });
    const msg = tplAnniversary({ nome: c.nome, years, pct, code: code && code.code });
    try { await send({ to: c.email, subject: msg.subject, html: msg.html, text: msg.text }); } catch (_) {}
    sent++;
  }
  return { candidates: rows.length, sent, skipped };
}
runAnniversary.campaign = 'anniversary';

const SCHEDULED = [runBirthday, runWinback, runPointsReminder, runAnniversary];
const CAMPAIGNS = [
  { type: 'birthday',        label: 'Compleanno',        scheduled: true,  description: 'Codice sconto personale nel giorno del compleanno.' },
  { type: 'winback',         label: 'Ti riconquistiamo', scheduled: true,  description: 'Cliente dormiente (nessun ordine da tempo) → bentornato + codice.' },
  { type: 'points_reminder', label: 'Punti inutilizzati',scheduled: true,  description: 'Ha punti fedeltà riscattabili ma è inattivo → promemoria.' },
  { type: 'anniversary',     label: 'Anniversario',      scheduled: true,  description: 'Anniversario di registrazione → grazie + codice.' },
  { type: 'new_season',      label: 'Nuova stagione',    scheduled: false, description: 'Broadcast manuale (nuova collezione / saldi) a tutti i clienti consenzienti.' },
];

/** Run every scheduled campaign once. Returns a per-campaign summary. Never throws. */
async function runDailyLifecycle(pool, opts = {}) {
  const today  = opts.today ? new Date(opts.today) : new Date();
  const dryRun = !!opts.dryRun;
  const cfg = await getSettings(pool);
  const summary = { enabled: isEnabled(cfg), dryRun, ran_at: ymd(today) };
  if (!isEnabled(cfg)) return { ...summary, skipped: 'lifecycle disabled' };
  for (const job of SCHEDULED) {
    try { summary[job.campaign] = await job(pool, { today, dryRun, cfg, deps: opts.deps }); }
    catch (e) { summary[job.campaign] = { error: e.message }; }
  }
  return summary;
}

/** Run a single named scheduled campaign (admin preview / manual fire). */
async function runCampaign(pool, type, opts = {}) {
  const job = SCHEDULED.find((j) => j.campaign === type);
  if (!job) throw new Error('Campagna non valida');
  const today = opts.today ? new Date(opts.today) : new Date();
  const cfg = await getSettings(pool);
  return job(pool, { today, dryRun: !!opts.dryRun, cfg, deps: opts.deps });
}

/* ═══════════════════ ADMIN BROADCAST — NEW SEASON ═══════════════════ */

async function sendSeasonBroadcast(pool, opts = {}) {
  const send   = (opts.deps && opts.deps.send) || sendGenericEmail;
  const today  = opts.today ? new Date(opts.today) : new Date();
  const season = (opts.season || '').trim();
  if (!season) throw new Error('Nome stagione/collezione obbligatorio');
  const headline = (opts.headline || '').trim();
  const message  = (opts.message || '').trim();
  const ctaUrl   = opts.cta_url ? String(opts.cta_url).trim() : null;
  const ctaLabel = (opts.cta_label || '').trim() || null;
  const audience = ['consented', 'subscribers', 'both'].includes(opts.audience) ? opts.audience : 'consented';
  const dryRun   = !!opts.dryRun;

  // Collect recipients, de-duplicated by email. Consented account holders get a personalised
  // greeting; newsletter-only subscribers get the same email without a name.
  const map = new Map();
  if (audience === 'consented' || audience === 'both') {
    const [rows] = await pool.execute(
      `SELECT id, email, nome FROM customers WHERE marketing_consent = 1 AND email IS NOT NULL`
    );
    rows.forEach((r) => { if (r.email && !map.has(r.email)) map.set(r.email, { email: r.email, nome: r.nome, customerId: r.id }); });
  }
  if (audience === 'subscribers' || audience === 'both') {
    const [rows] = await pool.execute(
      `SELECT email FROM newsletter_subscribers WHERE unsubscribed = 0 AND email IS NOT NULL`
    );
    rows.forEach((r) => { if (r.email && !map.has(r.email)) map.set(r.email, { email: r.email, nome: null, customerId: null }); });
  }
  const recipients = [...map.values()];
  const slug = season.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'stagione';
  const dedupKey = `season:${slug}`;

  if (dryRun) return { recipients: recipients.length, sent: 0, skipped: 0, dedupKey, dryRun: true };

  let sent = 0, skipped = 0;
  await mapLimit(recipients, 5, async (c) => {
    const claimed = await claimEvent(pool, { type: 'new_season', dedupKey, email: c.email, customerId: c.customerId, detail: season });
    if (!claimed) { skipped++; return; }
    const msg = tplSeason({ nome: c.nome, headline, message, ctaUrl, ctaLabel, season });
    try { await send({ to: c.email, subject: msg.subject, html: msg.html, text: msg.text }); } catch (_) {}
    sent++;
  });
  return { recipients: recipients.length, sent, skipped, dedupKey };
}

/** Recent activity counts per campaign type (admin dashboard). */
async function recentStats(pool, days = 30) {
  try {
    const [rows] = await pool.execute(
      `SELECT type, COUNT(*) AS sent, MAX(created_at) AS last_sent
         FROM email_events
        WHERE created_at >= (NOW() - INTERVAL ? DAY)
        GROUP BY type`,
      [days]
    );
    return rows;
  } catch (_) { return []; }
}

module.exports = {
  SETTINGS_DEFAULTS, CAMPAIGNS,
  getSettings, isEnabled, claimEvent, issueCode, mapLimit,
  runDailyLifecycle, runCampaign, sendSeasonBroadcast, recentStats,
  runBirthday, runWinback, runPointsReminder, runAnniversary,
  // template exports (handy for tests / previews)
  tplBirthday, tplWinback, tplPoints, tplAnniversary, tplSeason,
};
