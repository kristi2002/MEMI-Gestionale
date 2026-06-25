'use strict';

/**
 * /api/admin/reviews  — Product review management
 *
 * GET    /api/admin/reviews          List all reviews (admin)
 * POST   /api/reviews                Submit a review (public, customer-facing)
 * GET    /api/reviews/:product_id    Get published reviews for a product (public)
 * PUT    /api/admin/reviews/:id      Update stato (approve/reject)
 * DELETE /api/admin/reviews/:id      Delete review
 */

const router = require('express').Router();
const { pool }                     = require('../db');
const { requireAdmin, optionalCustomer } = require('../middleware/auth');

/* ── GET /api/admin/reviews ── */
router.get('/admin', requireAdmin, async (req, res) => {
  try {
    const { stato, product_id, q, limit = 50, offset = 0 } = req.query;
    let sql = 'SELECT * FROM reviews WHERE 1=1';
    const params = [];

    if (stato)      { sql += ' AND stato = ?';      params.push(stato); }
    if (product_id) { sql += ' AND product_id = ?'; params.push(product_id); }
    if (q) {
      sql += ' AND (customer_nome LIKE ? OR customer_email LIKE ? OR product_name LIKE ? OR testo LIKE ?)';
      const like = `%${q}%`;
      params.push(like, like, like, like);
    }

    const safeLimit  = parseInt(limit)  || 50;
    const safeOffset = parseInt(offset) || 0;
    sql += ` ORDER BY created_at DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`;

    const [reviews]       = await pool.execute(sql, params);
    const [[{ total }]]   = await pool.execute('SELECT COUNT(*) as total FROM reviews');
    const [[{ pending }]] = await pool.execute("SELECT COUNT(*) as pending FROM reviews WHERE stato = 'in_attesa'");
    return res.json({ reviews, total, pending });
  } catch (err) {
    console.error('reviews list error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── GET /api/reviews/:product_id ── public: published reviews for a product ── */
router.get('/product/:product_id', async (req, res) => {
  try {
    const [reviews] = await pool.execute(
      "SELECT id, customer_nome, rating, titolo, testo, created_at FROM reviews WHERE product_id = ? AND stato = 'pubblicata' ORDER BY created_at DESC",
      [req.params.product_id]
    );
    return res.json(reviews);
  } catch (err) {
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── POST /api/reviews ── public: submit a review ── */
router.post('/', optionalCustomer, async (req, res) => {
  const { product_id, rating, titolo, testo, customer_nome, customer_email } = req.body;
  if (!product_id || !rating) return res.status(400).json({ error: 'product_id e rating obbligatori' });
  if (rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating deve essere tra 1 e 5' });

  try {
    const [[product]] = await pool.execute('SELECT name FROM products WHERE id = ?', [product_id]);
    if (!product) return res.status(404).json({ error: 'Prodotto non trovato' });

    const customerId   = req.customer?.id || null;
    const customerNome = req.customer ? `${req.customer.nome || ''} ${req.customer.cognome || ''}`.trim() : (customer_nome || 'Anonimo');
    const customerEmail = req.customer?.email || customer_email || null;

    const [result] = await pool.execute(
      `INSERT INTO reviews (product_id, product_name, customer_id, customer_nome, customer_email, rating, titolo, testo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [product_id, product.name, customerId, customerNome, customerEmail, rating, titolo || null, testo || null]
    );
    return res.status(201).json({ ok: true, id: result.insertId, message: 'Recensione inviata, in attesa di approvazione' });
  } catch (err) {
    console.error('submit review error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── PUT /api/admin/reviews/:id ── */
router.put('/admin/:id', requireAdmin, async (req, res) => {
  const { stato } = req.body;
  if (!stato) return res.status(400).json({ error: 'stato obbligatorio' });
  try {
    await pool.execute('UPDATE reviews SET stato = ? WHERE id = ?', [stato, req.params.id]);
    const [[review]] = await pool.execute('SELECT * FROM reviews WHERE id = ?', [req.params.id]);
    return res.json({ review });
  } catch (err) {
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── DELETE /api/admin/reviews/:id ── */
router.delete('/admin/:id', requireAdmin, async (req, res) => {
  try {
    const [result] = await pool.execute('DELETE FROM reviews WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Recensione non trovata' });
    return res.json({ ok: true, message: 'Recensione eliminata' });
  } catch (err) {
    return res.status(500).json({ error: 'Errore server' });
  }
});

module.exports = router;
