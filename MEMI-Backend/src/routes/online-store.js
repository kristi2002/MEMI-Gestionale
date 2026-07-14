'use strict';

/**
 * /api/admin/online-store  — online store channel snapshot (derived, read-only)
 */

const router = require('express').Router();
const { pool } = require('../db');
const { requireAdmin } = require('../middleware/auth');

router.get('/', requireAdmin, async (req, res) => {
  try {
    const [settingsRows] = await pool.execute(
      "SELECT `key`, `value` FROM store_settings WHERE `key` IN ('store_name','store_url','store_status','store_country')"
    );
    const s = {};
    settingsRows.forEach(r => { s[r.key] = r.value; });

    const [[prod]] = await pool.execute(`
      SELECT COUNT(*) AS total,
             SUM(status = 'attivo')   AS active,
             SUM(status = 'esaurito') AS out_of_stock
      FROM products
    `);
    const [[pages]] = await pool.execute("SELECT COUNT(*) AS published FROM cms_pages WHERE stato = 'pubblicata'");
    const [[ordersToday]] = await pool.execute("SELECT COUNT(*) AS today FROM orders WHERE DATE(created_at) = CURDATE()");

    return res.json({
      status: s.store_status || 'online',
      name: s.store_name || 'MEMI Abbigliamento',
      domain: s.store_url || process.env.FRONTEND_URL || '',
      country: s.store_country || 'Italia',
      products: {
        total: Number(prod.total),
        active: Number(prod.active || 0),
        out_of_stock: Number(prod.out_of_stock || 0),
      },
      pages_published: Number(pages.published),
      orders_today: Number(ordersToday.today),
    });
  } catch (err) {
    console.error('online-store error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

module.exports = router;
