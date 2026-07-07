'use strict';

/**
 * /api/cart — public cart snapshot beacon (storefront).
 *
 * POST /api/cart  { token, email?, items:[...], total }
 *   Upserts the visitor's cart (keyed by their anonymous token). Empty items →
 *   status 'svuotato' (cleared / checked out), so it no longer counts as
 *   abandoned. Fire-and-forget from the storefront; never returns anything the
 *   page needs.
 */

const router = require('express').Router();
const { pool } = require('../db');
const { optionalCustomer } = require('../middleware/auth');

router.post('/', optionalCustomer, async (req, res) => {
  try {
    const b = req.body || {};
    const token = (b.token || '').toString().slice(0, 64);
    if (!token) return res.status(400).json({ error: 'token richiesto' });

    let items = Array.isArray(b.items) ? b.items : [];
    if (items.length > 200) items = items.slice(0, 200);
    const itemCount = items.reduce((s, it) => s + (parseInt(it && (it.qty || it.quantita)) || 1), 0);
    const total = Number(b.total) || 0;
    const status = items.length ? 'attivo' : 'svuotato';
    const customerId = (req.customer && req.customer.id) || null;
    const email = (b.email || (req.customer && req.customer.email) || null);

    await pool.execute(
      `INSERT INTO carts (token, customer_id, email, items, item_count, total, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         customer_id = COALESCE(VALUES(customer_id), customer_id),
         email       = COALESCE(VALUES(email), email),
         items       = VALUES(items),
         item_count  = VALUES(item_count),
         total       = VALUES(total),
         status      = VALUES(status)`,
      [token, customerId, email, JSON.stringify(items), itemCount, total, status]
    );
    return res.status(204).end();
  } catch (err) {
    // Never let the storefront care about tracking failures.
    return res.status(204).end();
  }
});

module.exports = router;
