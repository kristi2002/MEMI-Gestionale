'use strict';

/**
 * /api/admin/categories  — Managed product categories (admin only)
 *
 * Categories are the structural taxonomy: every product carries exactly one
 * `categoria` slug. This table adds the editorial metadata (display name,
 * description, hero image, publish state, ordering) on top of that slug.
 *
 * GET    /api/admin/categories        List all, with live product counts
 * POST   /api/admin/categories        Create (slug derived from name if omitted)
 * PUT    /api/admin/categories/:id    Update (slug is immutable — it's the key
 *                                     products reference)
 * DELETE /api/admin/categories/:id    Delete the metadata record (products keep
 *                                     their `categoria` slug regardless)
 * POST   /api/admin/categories/hero   multipart image → WebP variants → { url }
 */

const router = require('express').Router();
const multer = require('multer');
const { pool }         = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { processAndStore } = require('../images');
const { logAdminAction } = require('../audit');

const ALLOWED_STATI = ['attiva', 'bozza'];

/** Normalize a name/slug into a URL-safe, accent-free lowercase slug. */
function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

/* Single-image hero upload — held in memory, then processed by sharp. */
const MAX_MB = parseInt(process.env.MAX_UPLOAD_MB, 10) || 8;
const heroUpload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: MAX_MB * 1024 * 1024, files: 1 },
});

/* ── GET /api/admin/categories ── */
router.get('/', requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM product_categories ORDER BY sort_order ASC, name ASC');
    const out = [];
    for (const r of rows) {
      const [[cnt]] = await pool.execute('SELECT COUNT(*) AS c FROM products WHERE categoria = ?', [r.slug]);
      out.push({ ...r, product_count: Number(cnt.c) || 0 });
    }
    return res.json(out);
  } catch (err) {
    console.error('categories list error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── POST /api/admin/categories/hero ── (before /:id-less routes; no id needed) */
router.post('/hero', requireAdmin, (req, res) => {
  heroUpload.single('image')(req, res, async (err) => {
    if (err) {
      const tooBig = err.code === 'LIMIT_FILE_SIZE';
      return res.status(400).json({ error: tooBig ? `File troppo grande (max ${MAX_MB} MB)` : (err.message || 'Upload non valido') });
    }
    try {
      if (!req.file) return res.status(400).json({ error: 'Nessun file ricevuto' });
      const v = await processAndStore(req.file.buffer);   // throws 415 on non-images
      return res.status(201).json({ ok: true, url: v.full || v.card || v.thumb });
    } catch (e) {
      console.error('category hero upload error', e);
      return res.status(e.statusCode || 500).json({ error: e.message || 'Errore server' });
    }
  });
});

/* ── POST /api/admin/categories ── */
router.post('/', requireAdmin, async (req, res) => {
  const { name, slug, description = null, hero_image = null, stato = 'attiva', sort_order = 0 } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Nome obbligatorio' });
  if (!ALLOWED_STATI.includes(stato)) return res.status(400).json({ error: 'Stato non valido' });
  const finalSlug = slugify(slug || name);
  if (!finalSlug) return res.status(400).json({ error: 'Slug non valido' });

  try {
    const [result] = await pool.execute(
      `INSERT INTO product_categories (slug, name, description, hero_image, stato, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [finalSlug, String(name).trim(), description || null, hero_image || null, stato, parseInt(sort_order, 10) || 0]
    );
    logAdminAction({ adminId: req.admin.id, adminEmail: req.admin.email, action: 'category.create', entityType: 'category', entityId: finalSlug, details: { name } }).catch(() => {});
    return res.status(201).json({ ok: true, id: result.insertId, slug: finalSlug });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Categoria con questo slug già esistente' });
    console.error('create category error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── PUT /api/admin/categories/:id ── (slug intentionally not updatable) */
router.put('/:id', requireAdmin, async (req, res) => {
  const { name, description, hero_image, stato, sort_order } = req.body;
  if (stato !== undefined && !ALLOWED_STATI.includes(stato)) return res.status(400).json({ error: 'Stato non valido' });
  try {
    const fields = [];
    const vals   = [];
    const add = (col, val) => { if (val !== undefined) { fields.push(`${col} = ?`); vals.push(val); } };
    add('name', name && String(name).trim());
    add('description', description);
    add('hero_image', hero_image);
    add('stato', stato);
    if (sort_order !== undefined) { fields.push('sort_order = ?'); vals.push(parseInt(sort_order, 10) || 0); }
    if (!fields.length) return res.status(400).json({ error: 'Nessun campo da aggiornare' });
    vals.push(req.params.id);
    const [result] = await pool.execute(`UPDATE product_categories SET ${fields.join(', ')} WHERE id = ?`, vals);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Categoria non trovata' });
    logAdminAction({ adminId: req.admin.id, adminEmail: req.admin.email, action: 'category.update', entityType: 'category', entityId: req.params.id, details: {} }).catch(() => {});
    return res.json({ ok: true });
  } catch (err) {
    console.error('update category error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── DELETE /api/admin/categories/:id ── */
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const [result] = await pool.execute('DELETE FROM product_categories WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Categoria non trovata' });
    logAdminAction({ adminId: req.admin.id, adminEmail: req.admin.email, action: 'category.delete', entityType: 'category', entityId: req.params.id, details: {} }).catch(() => {});
    return res.json({ ok: true });
  } catch (err) {
    console.error('delete category error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

module.exports = router;
