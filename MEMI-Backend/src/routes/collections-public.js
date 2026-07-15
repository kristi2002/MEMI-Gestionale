'use strict';

/**
 * /api/collections — Public, read-only view of managed product collections.
 *
 * The admin CRUD lives at /api/admin/collections (auth-gated). This exposes only
 * the editorial metadata (name, description, hero image) of *published* (attiva)
 * collections, so storefront collection pages can render the admin-managed title
 * and hero instead of values hard-coded in the generated HTML.
 *
 * Collection *membership* is not here — it lives on products.collections (a JSON
 * array of slugs) and is served by GET /api/products?collection=<slug>.
 *
 * GET /api/collections        List published collections, ordered (sort_order, name).
 * GET /api/collections/:slug  One published collection's public metadata by slug.
 */

const router = require('express').Router();
const { pool } = require('../db');

const PUBLIC_COLS = 'slug, name, description, hero_image, sort_order';

/* ── GET /api/collections ── */
router.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT ${PUBLIC_COLS} FROM product_collections WHERE stato = 'attiva' ORDER BY sort_order ASC, name ASC`
    );
    return res.json(rows);
  } catch (err) {
    console.error('public collections list error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── GET /api/collections/:slug ── */
router.get('/:slug', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT ${PUBLIC_COLS} FROM product_collections WHERE slug = ? AND stato = 'attiva' LIMIT 1`,
      [req.params.slug]
    );
    if (!rows.length) return res.status(404).json({ error: 'Collezione non trovata' });
    return res.json(rows[0]);
  } catch (err) {
    console.error('public collection get error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

module.exports = router;
