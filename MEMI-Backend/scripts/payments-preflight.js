#!/usr/bin/env node
'use strict';

/**
 * payments-preflight.js — "are we ACTUALLY taking real money?"
 * ────────────────────────────────────────────────────────────────────────────
 * Every payment provider here has a failure mode where a TEST/SANDBOX configuration looks
 * completely healthy from the outside: the checkout renders, the buyer "pays", the order lands
 * as `pagato`, an invoice is emitted — and not one cent moves. Prefix checks alone can't catch
 * it (SumUp's API key is identical for sandbox and live; a Stripe webhook secret is `whsec_` in
 * both modes), so this script asks each provider directly.
 *
 * Usage:
 *   node MEMI-Backend/scripts/payments-preflight.js            # reads the root .env, then process.env
 *   node MEMI-Backend/scripts/payments-preflight.js --no-probe # skip the SumUp probe checkout
 *   node MEMI-Backend/scripts/payments-preflight.js --env path/to/.env
 *
 * Exit code 0 = ready for real payments · 1 = at least one BLOCKER · 2 = script/network failure.
 * Read-only apart from one €1 SumUp checkout that is created and never paid (that response is
 * the ONLY place SumUp reveals sandbox vs live). Nothing is charged and no secret is printed.
 */

const fs = require('fs');
const path = require('path');

const ARGS = process.argv.slice(2);
const NO_PROBE = ARGS.includes('--no-probe');
const ENV_FLAG = ARGS.indexOf('--env');
const ENV_PATH = ENV_FLAG !== -1 ? ARGS[ENV_FLAG + 1] : path.join(__dirname, '..', '..', '.env');

/* ── env loading (no dotenv dependency: this must run from a bare checkout) ── */
function loadEnvFile(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (_) { return 0; }
  let n = 0;
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let val = m[2].trim().replace(/^(["'])(.*)\1$/, '$2');
    // Real process env always wins, so a Coolify/CI run isn't overridden by a stale local file.
    if (process.env[m[1]] === undefined) { process.env[m[1]] = val; n++; }
  }
  return n;
}

/* ── reporting ── */
const blockers = [];
const warnings = [];
let C = { r: '', g: '', y: '', b: '', d: '', x: '' };
if (process.stdout.isTTY) {
  C = { r: '\x1b[31m', g: '\x1b[32m', y: '\x1b[33m', b: '\x1b[1m', d: '\x1b[2m', x: '\x1b[0m' };
}
const sec  = (t) => console.log(`\n${C.b}══ ${t}${C.x}`);
const ok   = (t) => console.log(`  ${C.g}✓${C.x} ${t}`);
const info = (t) => console.log(`  ${C.d}·${C.x} ${t}`);
const warn = (t) => { warnings.push(t); console.log(`  ${C.y}⚠${C.x}  ${t}`); };
const bad  = (t) => { blockers.push(t); console.log(`  ${C.r}✗${C.x}  ${t}`); };

/* ── small fetch helper: never throws, always reports ── */
async function req(url, opts, timeoutMs) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs || 15000);
  try {
    const res = await fetch(url, Object.assign({ signal: ctl.signal }, opts || {}));
    const text = await res.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch (_) { body = { raw: text.slice(0, 300) }; }
    return { status: res.status, ok: res.ok, body };
  } catch (err) {
    return { status: 0, ok: false, body: null, err: err.name === 'AbortError' ? 'timeout' : err.message };
  } finally {
    clearTimeout(timer);
  }
}

const mask = (s) => (!s ? '(unset)' : s.length <= 12 ? s.slice(0, 4) + '…' : s.slice(0, 8) + '…' + s.slice(-4));
const host = (u) => { try { return new URL(u).host; } catch (_) { return null; } };

/* ══ Stripe — wallets (Apple Pay / Google Pay) and Klarna ride on it ══════════ */
async function checkStripe() {
  sec('Stripe  (Apple Pay · Google Pay · Klarna · card fallback)');
  const sk = process.env.STRIPE_SECRET_KEY || '';
  const pk = process.env.STRIPE_PUBLISHABLE_KEY || '';

  if (!sk && !pk) {
    warn('No Stripe keys set — Apple Pay, Google Pay and Klarna are all unavailable (card still works via SumUp).');
    return;
  }
  const skLive = sk.startsWith('sk_live_'), skTest = sk.startsWith('sk_test_');
  const pkLive = pk.startsWith('pk_live_'), pkTest = pk.startsWith('pk_test_');
  info(`secret key      ${mask(sk)}  → ${skLive ? 'LIVE' : skTest ? 'TEST' : 'unrecognised prefix'}`);
  info(`publishable key ${mask(pk)}  → ${pkLive ? 'LIVE' : pkTest ? 'TEST' : 'unrecognised prefix'}`);

  if (skTest) bad('STRIPE_SECRET_KEY is a TEST key — Apple Pay / Google Pay / Klarna take no real money.');
  if (pkTest) bad('STRIPE_PUBLISHABLE_KEY is a TEST key — the browser runs against Stripe TEST mode.');
  if (sk && pk && skLive !== pkLive && (skLive || skTest) && (pkLive || pkTest)) {
    bad('Stripe key MODE MISMATCH (one LIVE, one TEST) — card + wallet confirmation will fail outright.');
  }
  if (!sk || !pk) bad('Both STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY are required — one alone is not enough.');
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    bad('STRIPE_WEBHOOK_SECRET not set — /api/payments/webhook rejects every event (503), so an async ' +
        'Klarna/wallet settle is never reconciled to pagato.');
  } else {
    // whsec_ is identical in both modes, so this can only be verified by eye in the dashboard.
    ok(`STRIPE_WEBHOOK_SECRET set (${mask(process.env.STRIPE_WEBHOOK_SECRET)}) — it is mode-specific but ` +
       'indistinguishable by prefix: re-copy it from the LIVE-mode webhook endpoint.');
  }
  if (!sk) return;

  /* Does the key authenticate, and is the account able to charge? */
  const auth = { Authorization: 'Basic ' + Buffer.from(sk + ':').toString('base64') };
  const acct = await req('https://api.stripe.com/v1/account', { headers: auth });
  if (acct.status === 401) { bad('Stripe rejected the secret key (401) — it is revoked or mistyped.'); return; }
  if (!acct.ok)            { warn(`Stripe /v1/account returned ${acct.status || acct.err} — could not verify the account.`); return; }
  const a = acct.body || {};
  ok(`account ${a.id} · ${a.settings && a.settings.dashboard ? a.settings.dashboard.display_name : '(no display name)'} · ${a.country} · ${String(a.default_currency).toUpperCase()}`);
  if (a.charges_enabled === false)  bad('Stripe account has charges_enabled=false — it cannot accept payments yet (finish onboarding).');
  if (a.payouts_enabled === false)  warn('Stripe account has payouts_enabled=false — payments would be captured but not paid out.');
  if (a.default_currency && String(a.default_currency).toLowerCase() !== 'eur') {
    warn(`Stripe default currency is ${String(a.default_currency).toUpperCase()} but the checkout charges EUR — expect FX conversion.`);
  }

  /* Apple Pay / Google Pay: the domain registry is PER MODE. This is the check that silently
     breaks a go-live — test-mode registration does not carry over to live. */
  const shopHost = host(process.env.FRONTEND_URL || '');
  const dom = await req('https://api.stripe.com/v1/payment_method_domains', { headers: auth });
  if (!dom.ok) {
    warn(`Could not list payment method domains (${dom.status || dom.err}) — verify Apple Pay registration by hand.`);
  } else {
    const list = (dom.body && dom.body.data) || [];
    const mode = skLive ? 'LIVE' : 'TEST';
    if (!list.length) {
      bad(`No payment method domain registered in ${mode} mode — Apple Pay and Google Pay will NOT render. ` +
          'Add the shop domain: Stripe → Settings → Payments → Payment method domains.');
    }
    for (const d of list) {
      const flag = (k) => (d[k] && d[k].status) || 'n/a';
      const line = `${d.domain_name} [${d.livemode ? 'LIVE' : 'TEST'}] apple_pay=${flag('apple_pay')} google_pay=${flag('google_pay')} klarna=${flag('klarna')} enabled=${d.enabled}`;
      if (shopHost && d.domain_name === shopHost) {
        if (d.enabled && flag('apple_pay') === 'active') ok(line);
        else bad(`${line} — Apple Pay is not active on the shop domain.`);
      } else info(line);
    }
    if (shopHost && !list.some((d) => d.domain_name === shopHost)) {
      bad(`Shop domain ${shopHost} is NOT in the ${mode}-mode payment method domain list — Apple Pay / Google Pay will not appear.`);
    }
    if (shopHost && list.some((d) => d.domain_name === shopHost && flag2(d, 'klarna') !== 'active')) {
      warn(`Klarna is not active for ${shopHost} in ${mode} mode — the Klarna tab will show "non disponibile".`);
    }
  }

  /* The association file Apple fetches over HTTPS. nginx serves it from
     "Memi Abbigliamento/.well-known/" — confirm it is actually reachable in production. */
  if (process.env.FRONTEND_URL) {
    const url = process.env.FRONTEND_URL.replace(/\/$/, '') + '/.well-known/apple-developer-merchantid-domain-association';
    const r = await req(url, { redirect: 'follow' });
    if (r.status === 200) ok('Apple Pay domain association file is reachable at /.well-known/…');
    else if (r.status === 0) warn(`Could not reach ${url} (${r.err}) — check it once the site is deployed.`);
    else bad(`Apple Pay domain association file returns HTTP ${r.status} at ${url} — Apple domain verification will fail.`);
  }
}
function flag2(d, k) { return (d[k] && d[k].status) || 'n/a'; }

/* ══ SumUp — the PRIMARY card rail ═══════════════════════════════════════════ */
async function checkSumup() {
  sec('SumUp  (primary card method)');
  const key  = process.env.SUMUP_API_KEY || '';
  const code = process.env.SUMUP_MERCHANT_CODE || '';
  if (!key || !code) {
    bad('SUMUP_API_KEY / SUMUP_MERCHANT_CODE not set — the card tab falls back to Stripe Elements ' +
        'instead of SumUp (or 503s if Stripe is unset too).');
    return;
  }
  info(`api key ${mask(key)} · merchant code ${code}`);

  const me = await req('https://api.sumup.com/v0.1/me', { headers: { Authorization: 'Bearer ' + key } });
  if (me.status === 401) { bad('SumUp rejected the API key (401) — revoked or mistyped.'); return; }
  if (!me.ok)            { warn(`SumUp /v0.1/me returned ${me.status || me.err} — could not verify the account.`); return; }

  const mp = (me.body && me.body.merchant_profile) || {};
  ok(`account ${(me.body.account || {}).username || '?'} · default merchant ${mp.merchant_code} (${mp.company_name || '?'}) · ${mp.country} ${mp.default_currency || mp.currency || ''}`);
  if (me.body.details_submitted === false) bad('SumUp account has details_submitted=false — onboarding is incomplete, live payments will fail.');
  const reqs = me.body.requirements || [];
  if (reqs.length) warn(`SumUp account has ${reqs.length} outstanding requirement(s) — check me.sumup.com.`);
  if (mp.merchant_code && mp.merchant_code !== code) {
    warn(`SUMUP_MERCHANT_CODE (${code}) is NOT this key's default merchant profile (${mp.merchant_code}). ` +
         'That is legal — one key can address several profiles — but it is exactly how a sandbox ' +
         'merchant code ends up in a production deploy. Confirm which one is live.');
  }
  const cur = mp.default_currency || mp.currency;
  if (cur && String(cur).toUpperCase() !== 'EUR') {
    bad(`SumUp merchant currency is ${cur} but the checkout charges EUR — SumUp rejects a currency mismatch.`);
  }

  /* The definitive sandbox test. `merchant_sandbox` appears ONLY on a checkout response, so this
     creates one for €1 and never pays it (unpaid checkouts simply expire). */
  if (NO_PROBE) {
    warn('Skipped the SumUp probe checkout (--no-probe) — sandbox vs live is therefore UNVERIFIED.');
    return;
  }
  const probe = await req('https://api.sumup.com/v0.1/checkouts', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      checkout_reference: 'MEMI-PREFLIGHT-' + Date.now(),
      amount: 1.0, currency: 'EUR', merchant_code: code,
      description: 'MEMI preflight check (never paid)',
    }),
  });
  if (!probe.ok) {
    bad(`SumUp refused to create a checkout for merchant_code ${code} (HTTP ${probe.status || probe.err}` +
        `${probe.body && probe.body.message ? ': ' + probe.body.message : ''}) — the card tab would fail at checkout.`);
    return;
  }
  const b = probe.body || {};
  info(`probe checkout ${b.id} created (PENDING, never paid) · merchant_name=${b.merchant_name} · ${b.merchant_country}`);
  if (b.merchant_sandbox === true) {
    bad(`SumUp merchant ${code} is a SANDBOX account — card payments move NO real money. Real cards are ` +
        'declined, test cards succeed and the order is still marked pagato. Switch SUMUP_MERCHANT_CODE ' +
        'to the LIVE merchant code (me.sumup.com → Settings → Account).');
  } else {
    ok(`SumUp merchant ${code} is LIVE (no merchant_sandbox flag) — real cards will be charged.`);
  }
}

/* ══ PayPal ══════════════════════════════════════════════════════════════════ */
async function checkPaypal() {
  sec('PayPal');
  const id = process.env.PAYPAL_CLIENT_ID || '', secret = process.env.PAYPAL_SECRET || '';
  const env = process.env.PAYPAL_ENV === 'live' ? 'live' : 'sandbox';
  if (!id || !secret) {
    warn('PAYPAL_CLIENT_ID / PAYPAL_SECRET not set — the storefront hides the PayPal option (no dead end).');
    return;
  }
  info(`client id ${mask(id)} · PAYPAL_ENV=${env}`);
  if (env !== 'live') {
    bad("PAYPAL_ENV is not 'live' — PayPal orders are created against the sandbox API and move no real money.");
  }
  if (!process.env.PAYPAL_WEBHOOK_ID) {
    warn('PAYPAL_WEBHOOK_ID not set — /api/payments/paypal/webhook acknowledges events but refuses to ' +
         'reconcile any order to pagato (deliberate: a forged event must not mark an order paid).');
  }

  // Credentials belong to exactly ONE mode. Authenticate against both hosts: that identifies which
  // mode these credentials really are, independent of what PAYPAL_ENV claims.
  const authHeader = 'Basic ' + Buffer.from(id + ':' + secret).toString('base64');
  const body = 'grant_type=client_credentials';
  const hdrs = { Authorization: authHeader, 'Content-Type': 'application/x-www-form-urlencoded' };
  const [live, sand] = await Promise.all([
    req('https://api-m.paypal.com/v1/oauth2/token', { method: 'POST', headers: hdrs, body }),
    req('https://api-m.sandbox.paypal.com/v1/oauth2/token', { method: 'POST', headers: hdrs, body }),
  ]);
  const realMode = live.ok ? 'live' : sand.ok ? 'sandbox' : null;
  if (!realMode) {
    bad(`PayPal credentials authenticate against NEITHER host (live ${live.status || live.err}, ` +
        `sandbox ${sand.status || sand.err}) — client id/secret are wrong or the app is disabled.`);
    return;
  }
  ok(`credentials authenticate as ${realMode.toUpperCase()} app credentials.`);
  if (realMode !== env) {
    bad(`PAYPAL_ENV=${env} but these are ${realMode.toUpperCase()} credentials — every PayPal call hits the ` +
        'wrong API host and fails auth. Set PAYPAL_ENV=' + realMode + ', or swap in the ' + env + ' app credentials.');
  }
}

/* ══ Things that break payments without being a payment key ══════════════════ */
async function checkPlumbing() {
  sec('Checkout plumbing');
  const fe = process.env.FRONTEND_URL || '';
  if (!fe) {
    bad('FRONTEND_URL not set — the SumUp 3-D Secure return URL cannot be resolved, so a 3DS challenge ' +
        'has nowhere to come back to.');
  } else if (!/^https:/.test(fe)) {
    bad(`FRONTEND_URL is ${fe} — Apple Pay, Google Pay and 3-D Secure all require HTTPS.`);
  } else {
    ok(`FRONTEND_URL ${fe}`);
  }
  const origins = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (fe && origins.length && !origins.includes(fe.replace(/\/$/, ''))) {
    bad(`FRONTEND_URL (${fe}) is not in ALLOWED_ORIGINS — resolveReturnUrl() rejects it and the SumUp ` +
        '3DS redirect falls back to no return URL.');
  } else if (origins.length) {
    ok(`ALLOWED_ORIGINS covers the shop origin (${origins.length} entr${origins.length === 1 ? 'y' : 'ies'})`);
  }
  if (!process.env.SMTP_USER) {
    warn('SMTP_USER not set — order confirmation emails are silent no-ops. The buyer pays and hears nothing.');
  }
  const ap = process.env.ADMIN_PASSWORD || '';
  if (ap && ap.length < 12) warn(`ADMIN_PASSWORD is ${ap.length} chars — the admin panel is internet-facing.`);
  const dbp = process.env.DB_PASSWORD || '';
  if (dbp && dbp.length < 12) warn(`DB_PASSWORD is ${dbp.length} chars — rotate before handover.`);
  // KLARNA_* are vestigial: Klarna rides on Stripe and compose forwards no KLARNA_ var.
  if (process.env.KLARNA_USERNAME || process.env.KLARNA_PASSWORD || process.env.KLARNA_ENV) {
    info('KLARNA_* vars are present but unused — Klarna rides on Stripe and docker-compose forwards none of them. Safe to delete.');
  }
}

/* ══ main ════════════════════════════════════════════════════════════════════ */
(async () => {
  const n = loadEnvFile(ENV_PATH);
  console.log(`${C.b}MEMI payment preflight${C.x}`);
  console.log(`${C.d}env file: ${ENV_PATH}${n ? ` (${n} vars loaded)` : ' (not found / nothing new)'}${C.x}`);
  console.log(`${C.d}NODE_ENV=${process.env.NODE_ENV || '(unset)'}${C.x}`);

  try {
    await checkStripe();
    await checkSumup();
    await checkPaypal();
    await checkPlumbing();
  } catch (err) {
    console.error(`\n${C.r}Preflight crashed:${C.x} ${err && err.stack ? err.stack : err}`);
    process.exit(2);
  }

  console.log('');
  if (blockers.length) {
    console.log(`${C.r}${C.b}✗ NOT READY for real payments — ${blockers.length} blocker(s):${C.x}`);
    blockers.forEach((b, i) => console.log(`  ${i + 1}. ${b}`));
  } else {
    console.log(`${C.g}${C.b}✓ No blockers — the configuration can take real payments.${C.x}`);
  }
  if (warnings.length) {
    console.log(`\n${C.y}${warnings.length} warning(s):${C.x}`);
    warnings.forEach((w, i) => console.log(`  ${i + 1}. ${w}`));
  }
  process.exit(blockers.length ? 1 : 0);
})();
