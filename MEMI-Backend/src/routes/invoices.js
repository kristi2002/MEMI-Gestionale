'use strict';

/**
 * /api/admin/invoices  — Invoice (fatture) management
 *
 * GET    /api/admin/invoices          List all invoices
 * GET    /api/admin/invoices/:id      Single invoice detail with order items
 * POST   /api/admin/invoices          Create invoice from order
 * PUT    /api/admin/invoices/:id      Update invoice (stato, note, due_date)
 * DELETE /api/admin/invoices/:id      Delete invoice
 */

const router = require('express').Router();
const { pool }         = require('../db');
const { requireAdmin } = require('../middleware/auth');

/* ── GET /api/admin/invoices ── */
router.get('/', requireAdmin, async (req, res) => {
  try {
    const { stato, q, limit = 50, offset = 0 } = req.query;
    let sql = `
      SELECT i.*, o.order_number
      FROM invoices i
      LEFT JOIN orders o ON o.id = i.order_id
      WHERE 1=1`;
    const params = [];

    if (stato) { sql += ' AND i.stato = ?'; params.push(stato); }
    if (q) {
      sql += ' AND (i.invoice_number LIKE ? OR i.customer_email LIKE ? OR i.customer_nome LIKE ? OR o.order_number LIKE ?)';
      const like = `%${q}%`;
      params.push(like, like, like, like);
    }

    const safeLimit  = parseInt(limit)  || 50;
    const safeOffset = parseInt(offset) || 0;
    sql += ` ORDER BY i.created_at DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`;

    const [invoices] = await pool.execute(sql, params);
    // Count with same filters applied
    const countSql = `SELECT COUNT(*) as total FROM invoices i LEFT JOIN orders o ON o.id = i.order_id WHERE 1=1` +
      (stato ? ' AND i.stato = ?' : '') +
      (q     ? ' AND (i.invoice_number LIKE ? OR i.customer_email LIKE ? OR i.customer_nome LIKE ? OR o.order_number LIKE ?)' : '');
    const [[{ total }]] = await pool.execute(countSql, params);
    return res.json({ invoices, total });
  } catch (err) {
    console.error('invoices list error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── GET /api/admin/invoices/:id ── */
router.get('/:id', requireAdmin, async (req, res) => {
  try {
    const [[invoice]] = await pool.execute(
      `SELECT i.*, o.order_number, o.shipping_address, o.shipping_citta, o.shipping_cap, o.shipping_paese
       FROM invoices i LEFT JOIN orders o ON o.id = i.order_id WHERE i.id = ?`,
      [req.params.id]
    );
    if (!invoice) return res.status(404).json({ error: 'Fattura non trovata' });

    const [items] = await pool.execute(
      'SELECT * FROM order_items WHERE order_id = ?',
      [invoice.order_id]
    );
    return res.json({ ...invoice, items });
  } catch (err) {
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── POST /api/admin/invoices ── create from order ── */
router.post('/', requireAdmin, async (req, res) => {
  const { order_id, note, due_date, customer_cf, customer_piva, tax_rate = 22 } = req.body;
  if (!order_id) return res.status(400).json({ error: 'order_id obbligatorio' });

  try {
    const [[order]] = await pool.execute('SELECT * FROM orders WHERE id = ?', [order_id]);
    if (!order) return res.status(404).json({ error: 'Ordine non trovato' });

    // Generate sequential invoice number: F-YYYY-NNNN
    const year = new Date().getFullYear();
    const [[{ last_n }]] = await pool.execute(
      `SELECT MAX(CAST(SUBSTRING_INDEX(invoice_number, '-', -1) AS UNSIGNED)) AS last_n
       FROM invoices WHERE invoice_number LIKE ?`,
      [`F-${year}-%`]
    );
    const nextN = (last_n || 0) + 1;
    const invoice_number = `F-${year}-${String(nextN).padStart(4, '0')}`;

    const tax_amount = parseFloat(order.total) * (parseFloat(tax_rate) / 100);
    const indirizzo  = `${order.shipping_address}, ${order.shipping_citta} ${order.shipping_cap}, ${order.shipping_paese}`;

    const [result] = await pool.execute(
      `INSERT INTO invoices
         (invoice_number, order_id, customer_nome, customer_cognome, customer_email,
          customer_cf, customer_piva, indirizzo, subtotal, tax_rate, tax_amount, total, stato, note, due_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'emessa', ?, ?)`,
      [invoice_number, order_id, order.customer_nome, order.customer_cognome, order.customer_email,
       customer_cf || null, customer_piva || null, indirizzo,
       order.subtotal, tax_rate, tax_amount, order.total,
       note || null, due_date || null]
    );

    const [[invoice]] = await pool.execute('SELECT * FROM invoices WHERE id = ?', [result.insertId]);
    return res.status(201).json({ invoice });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Fattura già emessa per questo ordine' });
    console.error('create invoice error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── PUT /api/admin/invoices/:id ── */
router.put('/:id', requireAdmin, async (req, res) => {
  const { stato, note, due_date } = req.body;
  try {
    const fields = [];
    const vals   = [];
    if (stato)    { fields.push('stato = ?');    vals.push(stato); }
    if (note !== undefined) { fields.push('note = ?'); vals.push(note); }
    if (due_date !== undefined) { fields.push('due_date = ?'); vals.push(due_date || null); }
    if (!fields.length) return res.status(400).json({ error: 'Nessun campo da aggiornare' });

    vals.push(req.params.id);
    await pool.execute(`UPDATE invoices SET ${fields.join(', ')} WHERE id = ?`, vals);
    const [[invoice]] = await pool.execute('SELECT * FROM invoices WHERE id = ?', [req.params.id]);
    return res.json({ invoice });
  } catch (err) {
    console.error('update invoice error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── DELETE /api/admin/invoices/:id ── */
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const [result] = await pool.execute('DELETE FROM invoices WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Fattura non trovata' });
    return res.json({ ok: true, message: 'Fattura eliminata' });
  } catch (err) {
    return res.status(500).json({ error: 'Errore server' });
  }
});

module.exports = router;
