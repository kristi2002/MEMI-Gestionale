'use strict';

/**
 * /api/admin/pos  — point-of-sale channel status (derived, read-only)
 * POS is opt-in via store_settings.pos_enabled; today's figures come from orders.
 */

const router = require('express').Router();
const { pool } = require('../db');
const { requireAdmin } = require('../middleware/auth');

router.get('/', requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.execute("SELECT `value` FROM store_settings WHERE `key` = 'pos_enabled'");
    const raw = rows.length ? String(rows[0].value) : '';
    const enabled = raw === '1' || raw.toLowerCase() === 'true';

    const [[today]] = await pool.execute(`
      SELECT COUNT(*) AS orders, COALESCE(SUM(total), 0) AS revenue
      FROM orders
      WHERE payment_status = 'pagato' AND DATE(created_at) = CURDATE()
    `);

    return res.json({
      enabled,
      today: { orders: Number(today.orders), revenue: Number(today.revenue) },
    });
  } catch (err) {
    console.error('pos error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

module.exports = router;
