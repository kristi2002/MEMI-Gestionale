'use strict';

/**
 * Colours — managed product colour palette.
 *
 * PUBLIC:
 *   GET  /api/colors                 List the palette (storefront swatches)
 *
 * ADMIN (mounted at /api/admin/colors, requireAdmin + requirePermission):
 *   GET    /api/admin/colors                 List with live product counts
 *   POST   /api/admin/colors                 Create (slug from name if omitted)
 *   PUT    /api/admin/colors/:id             Update (slug immutable)
 *   DELETE /api/admin/colors/:id             Delete — 409 if a product uses it
 *   POST   /api/admin/colors/suggest-from-image  multipart → dominant hex
 *
 * Products reference a colour by `products.colore` = `product_colors.slug`;
 * the product detail endpoint joins in `color_hex` from here.
 */

const express = require('express');
const multer  = require('multer');
const sharp   = require('sharp');
const { pool } = require('../db');
const { logAdminAction } = require('../audit');

const publicRouter = express.Router();
const adminRouter  = express.Router();

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function normHex(v) {
  if (v == null || v === '') return null;
  let h = String(v).trim();
  if (!h.startsWith('#')) h = '#' + h;
  // Preserve the case the caller provided (only normalize the leading '#').
  return HEX_RE.test(h) ? h : undefined; // undefined = invalid
}

/* ── PUBLIC: GET /api/colors ── */
publicRouter.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, slug, name, hex, sort_order FROM product_colors ORDER BY sort_order ASC, name ASC');
    return res.json(rows);
  } catch (err) {
    console.error('colors list error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── ADMIN: GET /api/admin/colors ── */
adminRouter.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM product_colors ORDER BY sort_order ASC, name ASC');
    const out = [];
    for (const r of rows) {
      const [[cnt]] = await pool.execute('SELECT COUNT(*) AS c FROM products WHERE colore = ?', [r.slug]);
      out.push({ ...r, product_count: Number(cnt.c) || 0 });
    }
    return res.json(out);
  } catch (err) {
    console.error('admin colors list error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── ADMIN: POST /api/admin/colors/suggest-from-image ── */
const suggestUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 } });
adminRouter.post('/suggest-from-image', (req, res) => {
  suggestUpload.single('image')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload non valido' });
    try {
      if (!req.file) return res.status(400).json({ error: 'Nessun file ricevuto' });
      const { dominant } = await sharp(req.file.buffer).stats();
      const toHex = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
      const hex = `#${toHex(dominant.r)}${toHex(dominant.g)}${toHex(dominant.b)}`;
      return res.json({ ok: true, hex });
    } catch (e) {
      console.error('color suggest error', e);
      return res.status(422).json({ error: 'Immagine non analizzabile' });
    }
  });
});

/* ── ADMIN: POST /api/admin/colors ── */
adminRouter.post('/', async (req, res) => {
  const { name, slug, hex, sort_order = 0 } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Nome obbligatorio' });
  const finalSlug = slugify(slug || name);
  if (!finalSlug) return res.status(400).json({ error: 'Slug non valido' });
  const h = normHex(hex);
  if (h === undefined) return res.status(400).json({ error: 'Colore hex non valido (usa #RRGGBB)' });

  try {
    const [result] = await pool.execute(
      'INSERT INTO product_colors (slug, name, hex, sort_order) VALUES (?, ?, ?, ?)',
      [finalSlug, String(name).trim(), h, parseInt(sort_order, 10) || 0]
    );
    logAdminAction({ adminId: req.admin.id, adminEmail: req.admin.email, action: 'color.create', entityType: 'color', entityId: finalSlug, details: { name } }).catch(() => {});
    return res.status(201).json({ ok: true, id: result.insertId, slug: finalSlug });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Colore con questo slug già esistente' });
    console.error('create color error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── ADMIN: PUT /api/admin/colors/:id ── (slug immutable) */
adminRouter.put('/:id', async (req, res) => {
  const { name, hex, sort_order } = req.body;
  const fields = [];
  const vals   = [];
  if (name !== undefined) { fields.push('name = ?'); vals.push(String(name).trim()); }
  if (hex !== undefined) {
    const h = normHex(hex);
    if (h === undefined) return res.status(400).json({ error: 'Colore hex non valido (usa #RRGGBB)' });
    fields.push('hex = ?'); vals.push(h);
  }
  if (sort_order !== undefined) { fields.push('sort_order = ?'); vals.push(parseInt(sort_order, 10) || 0); }
  if (!fields.length) return res.status(400).json({ error: 'Nessun campo da aggiornare' });
  try {
    vals.push(req.params.id);
    const [result] = await pool.execute(`UPDATE product_colors SET ${fields.join(', ')} WHERE id = ?`, vals);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Colore non trovato' });
    logAdminAction({ adminId: req.admin.id, adminEmail: req.admin.email, action: 'color.update', entityType: 'color', entityId: req.params.id, details: {} }).catch(() => {});
    return res.json({ ok: true });
  } catch (err) {
    console.error('update color error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── ADMIN: DELETE /api/admin/colors/:id ── (409 if in use by a product) */
adminRouter.delete('/:id', async (req, res) => {
  try {
    const [[row]] = await pool.execute('SELECT slug FROM product_colors WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Colore non trovato' });
    const [[used]] = await pool.execute('SELECT COUNT(*) AS c FROM products WHERE colore = ?', [row.slug]);
    if (Number(used.c) > 0) {
      return res.status(409).json({ error: `Colore in uso da ${used.c} prodotti — riassegnali prima di eliminarlo` });
    }
    await pool.execute('DELETE FROM product_colors WHERE id = ?', [req.params.id]);
    logAdminAction({ adminId: req.admin.id, adminEmail: req.admin.email, action: 'color.delete', entityType: 'color', entityId: req.params.id, details: {} }).catch(() => {});
    return res.json({ ok: true });
  } catch (err) {
    console.error('delete color error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

module.exports = { publicRouter, adminRouter };
