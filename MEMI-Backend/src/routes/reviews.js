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
const fs    = require('fs');
const path  = require('path');
const mysql = require('mysql2/promise');
const { pool }                     = require('../db');
const { requireAdmin, optionalCustomer } = require('../middleware/auth');
const { logAdminAction } = require('../audit');

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

    // Count query mirrors the same filters so pagination totals are correct
    let countSql    = 'SELECT COUNT(*) as total FROM reviews WHERE 1=1';
    const countParams = [];
    if (stato)      { countSql += ' AND stato = ?';      countParams.push(stato); }
    if (product_id) { countSql += ' AND product_id = ?'; countParams.push(product_id); }
    if (q) {
      countSql += ' AND (customer_nome LIKE ? OR customer_email LIKE ? OR product_name LIKE ? OR testo LIKE ?)';
      const like2 = `%${q}%`;
      countParams.push(like2, like2, like2, like2);
    }
    const [[{ total }]]   = await pool.execute(countSql, countParams);
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
    // Fire 'recensione' automations (best-effort, never blocks).
    try { require('../automations').runSimpleTrigger(pool, 'recensione', { nome: customerNome, email: customerEmail }); } catch (_) {}
    return res.status(201).json({ ok: true, id: result.insertId, message: 'Recensione inviata, in attesa di approvazione' });
  } catch (err) {
    console.error('submit review error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── PUT /api/admin/reviews/:id ── */
router.put('/admin/:id', requireAdmin, async (req, res) => {
  const { stato, risposta_admin } = req.body;
  if (!stato && risposta_admin === undefined)
    return res.status(400).json({ error: 'stato o risposta_admin obbligatori' });
  try {
    const fields = [];
    const vals   = [];
    if (stato !== undefined)           { fields.push('stato = ?');           vals.push(stato); }
    if (risposta_admin !== undefined)  { fields.push('risposta_admin = ?');  vals.push(risposta_admin || null); }
    vals.push(req.params.id);
    const [result] = await pool.execute(`UPDATE reviews SET ${fields.join(', ')} WHERE id = ?`, vals);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Recensione non trovata' });
    const [[review]] = await pool.execute('SELECT * FROM reviews WHERE id = ?', [req.params.id]);
    logAdminAction({ adminId: req.admin.id, adminEmail: req.admin.email, action: 'review.moderate', entityType: 'review', entityId: req.params.id, details: { stato: req.body && req.body.stato } }).catch(() => {});
    return res.json({ review });
  } catch (err) {
    console.error('update review error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── POST /api/reviews/admin/seed-demo ── esegue db/seed-reviews.sql ──
   Inserisce le 20 recensioni demo (stato pubblicata, date originali).
   Idempotente: il file SQL cancella prima le righe @demo.memi.it.
   Il pool condiviso non ha multipleStatements, quindi si apre una
   connessione dedicata solo per questa esecuzione. */
router.post('/admin/seed-demo', requireAdmin, async (req, res) => {
  let conn;
  try {
    let sql = fs.readFileSync(path.join(__dirname, '../db/seed-reviews.sql'), 'utf8');
    // Il database arriva dall'env (in prod può non chiamarsi memi_db)
    sql = sql.replace(/^USE\s+[^;]+;\s*$/m, '');

    conn = await mysql.createConnection({
      host:     process.env.DB_HOST     || 'localhost',
      port:     parseInt(process.env.DB_PORT || '3306', 10),
      user:     process.env.DB_USER     || 'memi_user',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME     || 'memi_db',
      charset:  'utf8mb4',
      multipleStatements: true,
    });

    const [results] = await conn.query(sql);
    const sets     = Array.isArray(results) ? results : [results];
    const deleted  = (sets[0] && sets[0].affectedRows) || 0;
    const inserted = (sets[sets.length - 1] && sets[sets.length - 1].affectedRows) || 0;

    logAdminAction({ adminId: req.admin.id, adminEmail: req.admin.email, action: 'review.seed_demo', entityType: 'review', entityId: 'seed-demo', details: { deleted, inserted } }).catch(() => {});
    return res.json({ ok: true, deleted, inserted, message: `Seed completato: ${inserted} recensioni demo inserite (${deleted} precedenti rimosse)` });
  } catch (err) {
    console.error('seed demo reviews error', err);
    if (err && err.errno === 1452) // FK products fallita
      return res.status(409).json({ error: 'Prodotti del catalogo demo mancanti: importa prima memi-products-seed.csv (Prodotti → Importa CSV), poi riesegui il seed.' });
    return res.status(500).json({ error: 'Errore durante il seed: ' + err.message });
  } finally {
    if (conn) await conn.end().catch(() => {});
  }
});

/* ── DELETE /api/admin/reviews/:id ── */
router.delete('/admin/:id', requireAdmin, async (req, res) => {
  try {
    const [result] = await pool.execute('DELETE FROM reviews WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Recensione non trovata' });
    logAdminAction({ adminId: req.admin.id, adminEmail: req.admin.email, action: 'review.delete', entityType: 'review', entityId: req.params.id, details: {} }).catch(() => {});
    return res.json({ ok: true, message: 'Recensione eliminata' });
  } catch (err) {
    return res.status(500).json({ error: 'Errore server' });
  }
});

module.exports = router;
