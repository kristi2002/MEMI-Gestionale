'use strict';

/**
 * /api/products/:id/variants — parent/child product variants (admin only).
 * Mounted at /api/products; only handles the /:id/variants* paths (the flat
 * products router owns /:id).
 *
 * GET    /api/products/:id/variants        List variants of a product
 * POST   /api/products/:id/variants        Create a variant
 * PUT    /api/products/:id/variants/:vid   Update a variant
 * DELETE /api/products/:id/variants/:vid   Delete a variant
 */

const router = require('express').Router();
const { pool }         = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { logAdminAction } = require('../audit');

function parseOptions(v) {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v;
  if (typeof v === 'string') { try { const o = JSON.parse(v); return (o && typeof o === 'object') ? o : {}; } catch (_) { return {}; } }
  return {};
}

/* ── GET /api/products/:id/variants ── (public read is fine for the storefront) */
router.get('/:id/variants', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, product_id, sku, options, price, stock, image_url, attivo FROM product_variants WHERE product_id = ? ORDER BY id ASC',
      [req.params.id]);
    return res.json(rows.map(r => ({ ...r, options: parseOptions(r.options), attivo: !!r.attivo })));
  } catch (err) {
    console.error('variants list error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── POST /api/products/:id/variants ── */
router.post('/:id/variants', requireAdmin, async (req, res) => {
  const b = req.body || {};
  const options = (b.options && typeof b.options === 'object') ? b.options : {};
  if (!Object.keys(options).length) return res.status(400).json({ error: 'Specifica almeno un attributo (es. colore/taglia)' });
  const price = (b.price === '' || b.price == null) ? null : Number(b.price);
  if (price !== null && (!isFinite(price) || price < 0)) return res.status(400).json({ error: 'Prezzo non valido' });
  const stock = parseInt(b.stock, 10) || 0;
  try {
    const [[p]] = await pool.execute('SELECT id FROM products WHERE id = ?', [req.params.id]);
    if (!p) return res.status(404).json({ error: 'Prodotto non trovato' });
    const [result] = await pool.execute(
      'INSERT INTO product_variants (product_id, sku, options, price, stock, image_url, attivo) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.params.id, b.sku || null, JSON.stringify(options), price, stock, b.image_url || null, b.attivo === false ? 0 : 1]);
    logAdminAction({ adminId: req.admin.id, adminEmail: req.admin.email, action: 'variant.create',
      entityType: 'product', entityId: req.params.id, details: { variant: result.insertId } }).catch(() => {});
    return res.status(201).json({ ok: true, id: result.insertId });
  } catch (err) {
    console.error('create variant error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── PUT /api/products/:id/variants/:vid ── */
router.put('/:id/variants/:vid', requireAdmin, async (req, res) => {
  const b = req.body || {};
  try {
    const fields = [], vals = [];
    const add = (col, val) => { if (val !== undefined) { fields.push(`${col} = ?`); vals.push(val); } };
    add('sku', b.sku);
    if (b.options !== undefined) { fields.push('options = ?'); vals.push(JSON.stringify((b.options && typeof b.options === 'object') ? b.options : {})); }
    if (b.price !== undefined) { fields.push('price = ?'); vals.push((b.price === '' || b.price == null) ? null : Number(b.price)); }
    if (b.stock !== undefined) { fields.push('stock = ?'); vals.push(parseInt(b.stock, 10) || 0); }
    add('image_url', b.image_url);
    if (b.attivo !== undefined) { fields.push('attivo = ?'); vals.push(b.attivo ? 1 : 0); }
    if (!fields.length) return res.status(400).json({ error: 'Nessun campo da aggiornare' });
    vals.push(req.params.vid, req.params.id);
    const [result] = await pool.execute(`UPDATE product_variants SET ${fields.join(', ')} WHERE id = ? AND product_id = ?`, vals);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Variante non trovata' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('update variant error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── DELETE /api/products/:id/variants/:vid ── */
router.delete('/:id/variants/:vid', requireAdmin, async (req, res) => {
  try {
    const [result] = await pool.execute('DELETE FROM product_variants WHERE id = ? AND product_id = ?', [req.params.vid, req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Variante non trovata' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('delete variant error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

module.exports = router;
