'use strict';

/**
 * /api/products  — Product catalog
 *
 * PUBLIC (no auth):
 *   GET  /api/products               List products (with filters: categoria, colore, saldi, novita, q)
 *   GET  /api/products/:id           Single product with sizes + stock
 *   GET  /api/products/:id/stock     Stock per size (used at checkout)
 *
 * ADMIN only:
 *   POST   /api/products             Create product
 *   PUT    /api/products/:id         Update product
 *   DELETE /api/products/:id         Delete product
 *   PUT    /api/products/:id/stock   Update stock for one size
 */

const router = require('express').Router();
const multer = require('multer');
const { pool }         = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { processAndStore, deleteVariants } = require('../images');
const { validateBody, createProductSchema, updateProductSchema } = require('../validation');
const { logAdminAction } = require('../audit');

/* mysql2 returns JSON columns already parsed (object/array). Older rows or
   non-JSON storage may return a string. This handles both safely. */
function parseJSON(v, fallback) {
  if (v == null) return fallback;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch (_) { return fallback; }
}

/* Multipart upload — images held in memory, then processed by sharp. */
const MAX_MB = parseInt(process.env.MAX_UPLOAD_MB, 10) || 8;
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: MAX_MB * 1024 * 1024, files: 10 },
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(Object.assign(new Error('Solo file immagine sono ammessi'), { statusCode: 415 }), false);
  },
});
function uploadImages(req, res, next) {
  upload.array('images', 10)(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? `File troppo grande (max ${MAX_MB} MB)` : (err.message || 'Upload non valido');
      return res.status(400).json({ error: msg });
    }
    next();
  });
}

/* ── GET /api/products ── */
router.get('/', async (req, res) => {
  try {
    const { categoria, colore, saldi, novita, q, collection, status, limit = 100, offset = 0 } = req.query;

    let sql    = 'SELECT p.*, GROUP_CONCAT(ps.taglia ORDER BY ps.taglia SEPARATOR ",") AS taglie_str, COALESCE(SUM(ps.stock), 0) AS stock_total FROM products p LEFT JOIN product_sizes ps ON ps.product_id = p.id WHERE 1=1';
    const params = [];

    if (categoria) { sql += ' AND p.categoria = ?'; params.push(categoria); }
    if (colore)    { sql += ' AND p.colore = ?';    params.push(colore); }
    if (saldi === '1') { sql += ' AND p.discount_pct > 0'; }
    if (novita === '1') { sql += ' AND p.is_new = TRUE'; }
    if (q)  { sql += ' AND (p.name LIKE ? OR p.categoria LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
    if (collection) { sql += ' AND JSON_CONTAINS(p.collections, ?)'; params.push(JSON.stringify(collection)); }

    // status=all → no filter (admin view); specific value → filter by it; default → "attivo" only
    if (status === 'all') { /* no filter */ }
    else if (status && status !== 'attivo') { sql += ' AND p.status = ?'; params.push(status); }
    else { sql += ' AND p.status = "attivo"'; }
    sql += ' GROUP BY p.id';
    sql += ' ORDER BY p.popularity DESC';
    const safeLimit  = parseInt(limit)  || 100;
    const safeOffset = parseInt(offset) || 0;
    sql += ` LIMIT ${safeLimit} OFFSET ${safeOffset}`;

    const [rows] = await pool.execute(sql, params);

    // Parse JSON fields and split taglie
    const products = rows.map(r => ({
      ...r,
      collections: parseJSON(r.collections, []),
      images:      parseJSON(r.images, []),
      taglie:      r.taglie_str  ? r.taglie_str.split(',')   : [],
      stock_total: Number(r.stock_total) || 0,   // total units across all sizes (for admin inventory)
      is_new:      !!r.is_new,
    }));

    return res.json(products);
  } catch (err) {
    console.error('products list error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── GET /api/products/:id ── */
router.get('/:id', async (req, res) => {
  try {
    const [[product]] = await pool.execute(
      'SELECT * FROM products WHERE id = ?',
      [req.params.id]
    );
    if (!product) return res.status(404).json({ error: 'Prodotto non trovato' });

    const [sizes] = await pool.execute(
      'SELECT taglia, stock FROM product_sizes WHERE product_id = ? ORDER BY taglia',
      [req.params.id]
    );

    return res.json({
      ...product,
      collections: parseJSON(product.collections, []),
      images:      parseJSON(product.images, []),
      is_new:      !!product.is_new,
      taglie:      sizes,
    });
  } catch (err) {
    console.error('product detail error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── GET /api/products/:id/stock ── */
router.get('/:id/stock', async (req, res) => {
  try {
    const [sizes] = await pool.execute(
      'SELECT taglia, stock FROM product_sizes WHERE product_id = ?',
      [req.params.id]
    );
    return res.json(sizes);
  } catch (err) {
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ══════════════════════════════════════════════════════════════
   ADMIN routes below — all require admin JWT
   ══════════════════════════════════════════════════════════════ */

/* ── POST /api/products ── */
router.post('/', requireAdmin, validateBody(createProductSchema), async (req, res) => {
  const {
    id, name, categoria, colore = null, color_label = null, price, original_price = null,
    discount_pct = 0, is_new = false, icon = 'dress', alt_color = null,
    popularity = 0, collections = [], description = null, images = [], status = 'attivo',
    taglie = [],  // array of {taglia, stock}
  } = req.body;

  if (!id || !name || !categoria || !price)
    return res.status(400).json({ error: 'id, name, categoria e price obbligatori' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(
      `INSERT INTO products (id, name, categoria, colore, color_label, price, original_price,
        discount_pct, is_new, icon, alt_color, popularity, collections, description, images, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, name, categoria, colore, color_label, price, original_price,
       discount_pct, is_new, icon, alt_color, popularity,
       JSON.stringify(collections), description, JSON.stringify(images), status]
    );

    for (const { taglia, stock } of taglie) {
      if (taglia == null) continue;
      await conn.execute(
        'INSERT INTO product_sizes (product_id, taglia, stock) VALUES (?, ?, ?)',
        [id, taglia, stock || 0]
      );
    }

    await conn.commit();
    logAdminAction({ adminId: req.admin.id, adminEmail: req.admin.email, action: 'product.create', entityType: 'product', entityId: id, details: { name } }).catch(() => {});
    return res.status(201).json({ ok: true, id });
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ error: 'Prodotto con questo ID già esistente' });
    console.error('product create error', err);
    return res.status(500).json({ error: 'Errore server' });
  } finally {
    conn.release();
  }
});

/* ── PUT /api/products/:id ── */
router.put('/:id', requireAdmin, validateBody(updateProductSchema), async (req, res) => {
  const {
    name, categoria, colore, color_label, price, original_price,
    discount_pct, is_new, icon, alt_color, popularity,
    collections, description, images, status,
    taglie,  // optional: array of {taglia, stock}
  } = req.body;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Build dynamic SET clause
    const fields = [];
    const vals   = [];
    const add = (col, val) => { if (val !== undefined) { fields.push(`${col} = ?`); vals.push(val); } };
    add('name', name);
    add('categoria', categoria);
    add('colore', colore);
    add('color_label', color_label);
    add('price', price);
    add('original_price', original_price);
    add('discount_pct', discount_pct);
    add('is_new', is_new);
    add('icon', icon);
    add('alt_color', alt_color);
    add('popularity', popularity);
    if (collections !== undefined) { fields.push('collections = ?'); vals.push(JSON.stringify(collections)); }
    add('description', description);
    if (images !== undefined) { fields.push('images = ?'); vals.push(JSON.stringify(images)); }
    add('status', status);

    if (fields.length) {
      vals.push(req.params.id);
      await conn.execute(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`, vals);
    }

    // Upsert sizes if provided
    if (taglie && Array.isArray(taglie)) {
      for (const { taglia, stock } of taglie) {
        if (taglia == null) continue;
        await conn.execute(
          `INSERT INTO product_sizes (product_id, taglia, stock) VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE stock = ?`,
          [req.params.id, taglia, stock || 0, stock || 0]
        );
      }
    }

    await conn.commit();
    logAdminAction({ adminId: req.admin.id, adminEmail: req.admin.email, action: 'product.update', entityType: 'product', entityId: req.params.id, details: {} }).catch(() => {});
    return res.json({ ok: true });
  } catch (err) {
    await conn.rollback();
    console.error('product update error', err);
    return res.status(500).json({ error: 'Errore server' });
  } finally {
    conn.release();
  }
});

/* ── DELETE /api/products/:id ── */
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const [result] = await pool.execute('DELETE FROM products WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0)
      return res.status(404).json({ error: 'Prodotto non trovato' });
    logAdminAction({ adminId: req.admin.id, adminEmail: req.admin.email, action: 'product.delete', entityType: 'product', entityId: req.params.id, details: {} }).catch(() => {});
    return res.json({ ok: true });
  } catch (err) {
    console.error('product delete error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── PUT /api/products/:id/stock ── */
router.put('/:id/stock', requireAdmin, async (req, res) => {
  const { taglia, stock } = req.body;
  if (!taglia || stock === undefined)
    return res.status(400).json({ error: 'taglia e stock obbligatori' });
  try {
    await pool.execute(
      `INSERT INTO product_sizes (product_id, taglia, stock) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE stock = ?`,
      [req.params.id, taglia, stock, stock]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error('stock update error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── POST /api/products/:id/images ── upload + process into WebP variants ── */
router.post('/:id/images', requireAdmin, uploadImages, async (req, res) => {
  try {
    const [[product]] = await pool.execute('SELECT id, images FROM products WHERE id = ?', [req.params.id]);
    if (!product) return res.status(404).json({ error: 'Prodotto non trovato' });
    if (!req.files || !req.files.length) return res.status(400).json({ error: 'Nessun file ricevuto' });

    let images = parseJSON(product.images, []);
    if (!Array.isArray(images)) images = [];
    images = images.map(x => (typeof x === 'string' ? { full: x, card: x, thumb: x } : x));

    for (const file of req.files) {
      const variants = await processAndStore(file.buffer);
      images.push(variants);
    }
    await pool.execute('UPDATE products SET images = ? WHERE id = ?', [JSON.stringify(images), req.params.id]);
    return res.status(201).json({ ok: true, images });
  } catch (err) {
    console.error('image upload error', err);
    const code = err.statusCode || 500;
    return res.status(code).json({ error: code === 500 ? 'Errore elaborazione immagine' : err.message });
  }
});

/* ── DELETE /api/products/:id/images ── remove one image (by url) + its files ── */
router.delete('/:id/images', requireAdmin, async (req, res) => {
  const target = req.body && (req.body.url || req.body.full);
  if (!target) return res.status(400).json({ error: 'URL immagine mancante' });
  try {
    const [[product]] = await pool.execute('SELECT id, images FROM products WHERE id = ?', [req.params.id]);
    if (!product) return res.status(404).json({ error: 'Prodotto non trovato' });

    let images = parseJSON(product.images, []);
    if (!Array.isArray(images)) images = [];
    const keep = []; let removed = null;
    images.forEach(img => {
      const full = typeof img === 'string' ? img : (img.full || img.card || img.thumb);
      if (!removed && full === target) removed = img; else keep.push(img);
    });
    if (!removed) return res.status(404).json({ error: 'Immagine non trovata' });

    await pool.execute('UPDATE products SET images = ? WHERE id = ?', [JSON.stringify(keep), req.params.id]);
    await deleteVariants(removed);   // reference-counted: only unlinks if no product still references this hash
    return res.json({ ok: true, images: keep });
  } catch (err) {
    console.error('image delete error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

module.exports = router;
