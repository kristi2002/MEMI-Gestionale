'use strict';

/**
 * /api/admin/apps — external apps registry (Marketing · App esterne).
 *
 * Persisted as a JSON blob in store_settings['apps_registry'] — no schema change,
 * so it works on any existing DB (the store_settings table already exists and is
 * used for loyalty/lifecycle config). Each app:
 *   { key, nome, categoria, descrizione, icona, enabled, config }
 * Seeded once with the built-in catalog, then fully editable: add / edit / delete
 * and enable / disable, all persisted. Replaces the old hardcoded read-only list.
 */

const router = require('express').Router();
const { pool } = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { logAdminAction } = require('../audit');

const SETTING_KEY = 'apps_registry';

// Built-in default catalog, seeded on first access. `enabled` seeds from the live
// env/feature state so the initial view reflects reality, then becomes editable.
function defaults() {
  const hasStripe = !!process.env.STRIPE_SECRET_KEY;
  const hasSmtp   = !!process.env.SMTP_USER;
  return [
    { key: 'stripe',    nome: 'Stripe Payments',                 categoria: 'Pagamenti',      icona: '💳', descrizione: 'Accetta pagamenti con carta in modo sicuro.', enabled: hasStripe, config: {} },
    { key: 'email',     nome: 'Email transazionali & marketing', categoria: 'Marketing',      icona: '✉️', descrizione: 'Conferme ordine, tracking e newsletter.',    enabled: hasSmtp,   config: {} },
    { key: 'feed',      nome: 'Feed Meta / Google Shopping',     categoria: 'Canali',         icona: '🛍️', descrizione: 'Sincronizza il catalogo con i social.',       enabled: true,      config: {} },
    { key: 'reviews',   nome: 'Recensioni prodotti',             categoria: 'Fidelizzazione', icona: '⭐', descrizione: 'Raccogli e modera recensioni verificate.',    enabled: true,      config: {} },
    { key: 'loyalty',   nome: 'Programma fedeltà',               categoria: 'Fidelizzazione', icona: '🎁', descrizione: 'Punti, premi e livelli per i clienti.',       enabled: true,      config: {} },
    { key: 'lifecycle', nome: 'Email automatiche (lifecycle)',   categoria: 'Marketing',      icona: '🔁', descrizione: 'Compleanno, win-back, promemoria punti.',     enabled: hasSmtp,   config: {} },
  ];
}

async function writeRegistry(apps) {
  await pool.execute(
    'INSERT INTO store_settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)',
    [SETTING_KEY, JSON.stringify(apps)]
  );
}

async function readRegistry() {
  const [[row]] = await pool.execute('SELECT `value` FROM store_settings WHERE `key` = ?', [SETTING_KEY]);
  if (row && row.value) {
    try {
      const parsed = JSON.parse(row.value);
      if (Array.isArray(parsed)) return parsed;
    } catch (_) { /* corrupt → reseed below */ }
  }
  const seed = defaults();
  await writeRegistry(seed);
  return seed;
}

const slugify = (s) => String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const clean = (a) => ({
  key: String(a.key),
  nome: String(a.nome || ''),
  categoria: String(a.categoria || 'Altro'),
  descrizione: String(a.descrizione || ''),
  icona: String(a.icona || '🧩'),
  enabled: !!a.enabled,
  config: (a.config && typeof a.config === 'object') ? a.config : {},
});

/* ── GET / — full registry ── */
router.get('/', requireAdmin, async (req, res) => {
  try {
    const apps = (await readRegistry()).map(clean);
    return res.json({ apps });
  } catch (err) {
    console.error('apps list error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── POST / — add an app ── */
router.post('/', requireAdmin, async (req, res) => {
  const { nome } = req.body || {};
  if (!nome || !String(nome).trim()) return res.status(400).json({ error: 'Nome obbligatorio' });
  try {
    const apps = await readRegistry();
    let key = slugify(req.body.key || nome) || ('app-' + Date.now());
    if (apps.some((a) => a.key === key)) return res.status(409).json({ error: 'Esiste già un\'app con questa chiave' });
    const app = clean({ ...req.body, key, nome });
    apps.push(app);
    await writeRegistry(apps);
    logAdminAction({ adminId: req.admin.id, adminEmail: req.admin.email, action: 'app.create', entityType: 'apps', entityId: key, details: { nome: app.nome } }).catch(() => {});
    return res.status(201).json({ ok: true, key });
  } catch (err) {
    console.error('app create error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── PUT /:key — edit fields / enable-disable / config ── */
router.put('/:key', requireAdmin, async (req, res) => {
  try {
    const apps = await readRegistry();
    const app = apps.find((a) => a.key === req.params.key);
    if (!app) return res.status(404).json({ error: 'App non trovata' });
    const b = req.body || {};
    if (b.nome        !== undefined) app.nome = String(b.nome).trim();
    if (b.categoria   !== undefined) app.categoria = b.categoria || 'Altro';
    if (b.descrizione !== undefined) app.descrizione = b.descrizione || '';
    if (b.icona       !== undefined) app.icona = b.icona || '🧩';
    if (b.enabled     !== undefined) app.enabled = !!b.enabled;
    if (b.config      !== undefined) app.config = (b.config && typeof b.config === 'object') ? b.config : {};
    await writeRegistry(apps.map(clean));
    logAdminAction({ adminId: req.admin.id, adminEmail: req.admin.email, action: 'app.update', entityType: 'apps', entityId: req.params.key, details: { enabled: !!app.enabled } }).catch(() => {});
    return res.json({ ok: true });
  } catch (err) {
    console.error('app update error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── DELETE /:key ── */
router.delete('/:key', requireAdmin, async (req, res) => {
  try {
    const apps = await readRegistry();
    const next = apps.filter((a) => a.key !== req.params.key);
    if (next.length === apps.length) return res.status(404).json({ error: 'App non trovata' });
    await writeRegistry(next);
    logAdminAction({ adminId: req.admin.id, adminEmail: req.admin.email, action: 'app.delete', entityType: 'apps', entityId: req.params.key, details: {} }).catch(() => {});
    return res.json({ ok: true });
  } catch (err) {
    console.error('app delete error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

module.exports = router;
