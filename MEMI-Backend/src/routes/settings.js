'use strict';

/**
 * /api/admin/settings  — Store configuration (key/value)
 *
 * GET  /api/admin/settings        Returns all settings as flat object
 * PUT  /api/admin/settings        Upserts one or more key/value pairs
 */

const router       = require('express').Router();
const { pool }     = require('../db');
const { requireAdmin, requireRole } = require('../middleware/auth');
const { logAdminAction } = require('../audit');

/* ── GET /api/admin/settings ── */
router.get('/', requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT `key`, `value` FROM store_settings');
    const settings = {};
    rows.forEach(r => { settings[r.key] = r.value; });
    return res.json(settings);
  } catch (err) {
    console.error('get settings error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── PUT /api/admin/settings ── */
router.put('/', requireAdmin, requireRole('admin'), async (req, res) => {
  const updates = req.body;
  if (!updates || typeof updates !== 'object' || Array.isArray(updates))
    return res.status(400).json({ error: 'Body deve essere un oggetto chiave/valore' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const [key, value] of Object.entries(updates)) {
      await conn.execute(
        'INSERT INTO store_settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)',
        [key, String(value ?? '')]
      );
    }
    await conn.commit();

    logAdminAction({
      adminId: req.admin.id, adminEmail: req.admin.email, action: 'settings.update',
      entityType: 'store_settings', entityId: 'store', details: { keys: Object.keys(updates) },
    }).catch(() => {});

    const [rows] = await pool.execute('SELECT `key`, `value` FROM store_settings');
    const settings = {};
    rows.forEach(r => { settings[r.key] = r.value; });
    return res.json(settings);
  } catch (err) {
    await conn.rollback();
    console.error('put settings error', err);
    return res.status(500).json({ error: 'Errore server' });
  } finally {
    conn.release();
  }
});

/* ── GET /api/admin/settings/integrations ──
   Connection status for external services. Returns booleans + safe details
   only — never the secret values themselves. */
router.get('/integrations', requireAdmin, requireRole('admin'), async (req, res) => {
  const { paypalConfigured, paypalEnv, sumupConfigured } = require('../payment-providers');
  const stripeKey = process.env.STRIPE_SECRET_KEY || '';
  const paypalOn  = paypalConfigured();
  const sumupOn   = sumupConfigured();
  const brtOn     = Boolean(process.env.BRT_USER_ID && process.env.BRT_PASSWORD);
  const simTrack  = process.env.COURIER_TRACKING_SIMULATE === '1';
  const integrations = [
    {
      key: 'stripe', nome: 'Stripe', categoria: 'Pagamenti', icona: '💳',
      connesso: !!stripeKey,
      dettaglio: stripeKey
        ? (stripeKey.startsWith('sk_live') ? 'Modalità LIVE attiva' : 'Modalità TEST attiva')
        : 'Chiave non configurata — checkout Stripe disattivato',
    },
    {
      key: 'sumup', nome: 'SumUp', categoria: 'Pagamenti', icona: '💠',
      connesso: sumupOn,
      dettaglio: sumupOn
        ? ('Merchant ' + (process.env.SUMUP_MERCHANT_CODE || '—'))
        : 'Non configurato — SUMUP_API_KEY / SUMUP_MERCHANT_CODE mancanti',
    },
    {
      key: 'paypal', nome: 'PayPal', categoria: 'Pagamenti', icona: '🅿️',
      connesso: paypalOn,
      dettaglio: paypalOn
        ? ('Ambiente ' + paypalEnv().toUpperCase() + (process.env.PAYPAL_WEBHOOK_ID ? ' · webhook verificato' : ' · webhook non impostato'))
        : 'Non configurato — PAYPAL_CLIENT_ID / PAYPAL_SECRET mancanti',
    },
    {
      key: 'klarna', nome: 'Klarna (Paga in 3 rate)', categoria: 'Pagamenti', icona: '📆',
      connesso: !!stripeKey,
      dettaglio: stripeKey
        ? 'Via Stripe — abilita Klarna in Stripe Dashboard → Payment methods per offrirlo al checkout'
        : 'Richiede Stripe configurato (Klarna passa da Stripe)',
    },
    {
      key: 'smtp', nome: 'Email transazionali (SMTP)', categoria: 'Notifiche', icona: '✉️',
      connesso: !!process.env.SMTP_USER,
      dettaglio: process.env.SMTP_USER
        ? ('Host: ' + (process.env.SMTP_HOST || '—'))
        : 'SMTP non configurato — le email non vengono inviate',
    },
    {
      key: 'courier', nome: 'Tracking corriere (BRT)', categoria: 'Spedizioni', icona: '🚚',
      connesso: brtOn,
      dettaglio: simTrack
        ? 'Modalità simulata (COURIER_TRACKING_SIMULATE=1) — tracking demo'
        : (brtOn ? 'Credenziali BRT configurate' : 'Non configurato — tracking reale non disponibile'),
    },
    {
      key: 'uploads', nome: 'Storage immagini', categoria: 'Media', icona: '🖼️',
      connesso: true,
      dettaglio: 'Volume: ' + (process.env.UPLOADS_DIR || './uploads'),
    },
  ];
  let dbOk = false;
  try { await pool.query('SELECT 1'); dbOk = true; } catch (_) {}
  integrations.push({
    key: 'database', nome: 'Database MySQL', categoria: 'Infrastruttura', icona: '🗄️',
    connesso: dbOk, dettaglio: dbOk ? 'Connesso' : 'Errore di connessione',
  });
  return res.json({ integrations });
});

/* ── Media library — REAL uploads (sharp → WebP variants, uploads volume) ─────
   POST   /api/admin/settings/media   multipart (any file field) → process each
                                      image and append to the media library.
   DELETE /api/admin/settings/media   body { url } → remove the library entry.

   The library itself is a JSON list persisted in store_settings['media_library']
   (so the existing admin File view keeps reading it). Each entry is
   { nome, url, thumb, full, created_at }. Reuses the exact product-image
   pipeline via processAndStore, so uploads land in the same uploads_data volume
   and are served at /api/uploads/<hash>-<variant>.webp through the nginx proxy. */
const multer = require('multer');
const { processAndStore, deleteVariants } = require('../images');
const MEDIA_MAX_MB = parseInt(process.env.MAX_UPLOAD_MB, 10) || 8;
const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: MEDIA_MAX_MB * 1024 * 1024, files: 10 },
});

async function readMediaLibrary() {
  const [rows] = await pool.execute(
    "SELECT `value` FROM store_settings WHERE `key` = 'media_library' LIMIT 1"
  );
  let list = [];
  if (rows.length) { try { list = JSON.parse(rows[0].value || '[]'); } catch (_) { list = []; } }
  return Array.isArray(list) ? list : [];
}
async function saveMediaLibrary(list) {
  await pool.execute(
    "INSERT INTO store_settings (`key`, `value`) VALUES ('media_library', ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)",
    [JSON.stringify(list)]
  );
}

router.post('/media', requireAdmin, (req, res) => {
  mediaUpload.any()(req, res, async (err) => {
    if (err) {
      const tooBig = err.code === 'LIMIT_FILE_SIZE';
      return res.status(tooBig ? 413 : 400).json({
        error: tooBig ? ('File troppo grande (max ' + MEDIA_MAX_MB + ' MB)') : 'Upload non valido',
      });
    }
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ error: 'Nessun file caricato' });
    try {
      const list = await readMediaLibrary();
      const added = [];
      for (const f of files) {
        const v = await processAndStore(f.buffer);       // throws 415 on non-images
        const entry = {
          nome: f.originalname || ('file-' + Date.now()),
          url: v.card || v.full, thumb: v.thumb || v.card, full: v.full,
          created_at: new Date().toISOString(),
        };
        list.unshift(entry);
        added.push(entry);
      }
      await saveMediaLibrary(list);
      logAdminAction({
        adminId: req.admin.id, adminEmail: req.admin.email, action: 'media.upload',
        entityType: 'store_settings', entityId: 'media_library', details: { count: added.length },
      }).catch(() => {});
      return res.json({ added, media: list });
    } catch (e) {
      console.error('media upload error', e);
      return res.status(e.statusCode || 500).json({ error: e.message || 'Errore server' });
    }
  });
});

router.delete('/media', requireAdmin, async (req, res) => {
  const url = req.body && req.body.url;
  if (!url) return res.status(400).json({ error: 'url richiesto' });
  try {
    let list = await readMediaLibrary();
    const before = list.length;
    list = list.filter(m => !m || m.url !== url);
    await saveMediaLibrary(list);
    // Best-effort file cleanup. deleteVariants() keeps files still referenced by
    // a product (reference-counted by content hash), so removing a library entry
    // never 404s a live product image.
    try { await deleteVariants({ thumb: url, card: url, full: url }); } catch (_) {}
    logAdminAction({
      adminId: req.admin.id, adminEmail: req.admin.email, action: 'media.delete',
      entityType: 'store_settings', entityId: 'media_library', details: { url },
    }).catch(() => {});
    return res.json({ removed: before - list.length, media: list });
  } catch (e) {
    console.error('media delete error', e);
    return res.status(500).json({ error: 'Errore server' });
  }
});

module.exports = router;
