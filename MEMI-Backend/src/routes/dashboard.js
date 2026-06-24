'use strict';

/**
 * /api/admin/dashboard  — KPI + analytics for the admin panel
 *
 * GET /api/admin/dashboard/kpis       Revenue, orders, customers, AOV
 * GET /api/admin/dashboard/chart      Revenue by day (last 30 days)
 * GET /api/admin/dashboard/top-products  Best-selling products
 * GET /api/admin/dashboard/recent-orders Last 10 orders
 */

const router = require('express').Router();
const { pool }         = require('../db');
const { requireAdmin } = require('../middleware/auth');

/* ── GET /api/admin/dashboard/kpis ── */
router.get('/kpis', requireAdmin, async (req, res) => {
  try {
    // Current month vs previous month
    const [[curr]] = await pool.execute(`
      SELECT
        COALESCE(SUM(total), 0)     AS revenue,
        COUNT(*)                    AS orders,
        COALESCE(AVG(total), 0)     AS aov
      FROM orders
      WHERE payment_status = 'pagato'
        AND MONTH(created_at) = MONTH(NOW())
        AND YEAR(created_at) = YEAR(NOW())
    `);

    const [[prev]] = await pool.execute(`
      SELECT
        COALESCE(SUM(total), 0)     AS revenue,
        COUNT(*)                    AS orders,
        COALESCE(AVG(total), 0)     AS aov
      FROM orders
      WHERE payment_status = 'pagato'
        AND MONTH(created_at) = MONTH(DATE_SUB(NOW(), INTERVAL 1 MONTH))
        AND YEAR(created_at)  = YEAR(DATE_SUB(NOW(), INTERVAL 1 MONTH))
    `);

    const [[visitors]] = await pool.execute(`
      SELECT COUNT(*) AS total FROM customers
      WHERE MONTH(created_at) = MONTH(NOW()) AND YEAR(created_at) = YEAR(NOW())
    `);

    const pctChange = (curr, prev) => {
      if (!prev) return curr > 0 ? '+100%' : '0%';
      const d = ((curr - prev) / prev) * 100;
      return `${d >= 0 ? '+' : ''}${d.toFixed(1)}%`;
    };

    return res.json({
      revenue:  { value: `€ ${Number(curr.revenue).toFixed(2)}`,  delta: pctChange(curr.revenue, prev.revenue),  up: curr.revenue >= prev.revenue },
      orders:   { value: `${curr.orders}`,                         delta: pctChange(curr.orders, prev.orders),    up: curr.orders >= prev.orders },
      visitors: { value: `${visitors.total}`,                      delta: '',                                     up: true },
      aov:      { value: `€ ${Number(curr.aov).toFixed(2)}`,      delta: pctChange(curr.aov, prev.aov),          up: curr.aov >= prev.aov },
    });
  } catch (err) {
    console.error('kpis error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── GET /api/admin/dashboard/chart ── */
router.get('/chart', requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT DATE(created_at) AS day, SUM(total) AS revenue, COUNT(*) AS orders
      FROM orders
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        AND payment_status = 'pagato'
      GROUP BY DATE(created_at)
      ORDER BY day ASC
    `);
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── GET /api/admin/dashboard/top-products ── */
router.get('/top-products', requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT oi.product_id, oi.product_name,
             SUM(oi.qty)           AS units_sold,
             SUM(oi.qty * oi.price) AS revenue
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.payment_status = 'pagato'
        AND o.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY oi.product_id, oi.product_name
      ORDER BY units_sold DESC
      LIMIT 10
    `);
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── GET /api/admin/dashboard/recent-orders ── */
router.get('/recent-orders', requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT id, order_number, customer_nome, customer_cognome, total,
             payment_status, order_status, created_at,
             tracking_number, courier_code
      FROM orders
      ORDER BY created_at DESC
      LIMIT 10
    `);
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: 'Errore server' });
  }
});

module.exports = router;
