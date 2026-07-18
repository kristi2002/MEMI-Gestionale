'use strict';

/**
 * /api/admin/reports  — aggregate business reports (derived, read-only)
 *
 * GET /api/admin/reports   Sales by month, orders by status, top categories, YTD summary.
 * No schema changes — everything is computed from orders / order_items / products.
 */

const router = require('express').Router();
const { pool } = require('../db');
const { requireAdmin } = require('../middleware/auth');

router.get('/', requireAdmin, async (req, res) => {
  try {
    const [byMonth] = await pool.execute(`
      SELECT DATE_FORMAT(created_at, '%Y-%m') AS month,
             COALESCE(SUM(total), 0) AS revenue,
             COUNT(*)               AS orders
      FROM orders
      WHERE payment_status = 'pagato'
        AND created_at >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 11 MONTH)
      GROUP BY month
      ORDER BY month
    `);

    const [byStatus] = await pool.execute(`
      SELECT order_status AS stato, COUNT(*) AS count
      FROM orders
      WHERE YEAR(created_at) = YEAR(CURDATE())
      GROUP BY order_status
    `);

    const [byCategory] = await pool.execute(`
      SELECT p.categoria AS categoria,
             COALESCE(SUM(oi.price * oi.qty), 0) AS revenue,
             COALESCE(SUM(oi.qty), 0)            AS units
      FROM order_items oi
      JOIN orders   o ON o.id = oi.order_id AND o.payment_status = 'pagato'
      JOIN products p ON p.id = oi.product_id
      GROUP BY p.categoria
      ORDER BY revenue DESC
      LIMIT 12
    `);

    const [[summary]] = await pool.execute(`
      SELECT COALESCE(SUM(total), 0) AS revenue_ytd,
             COUNT(*)                AS orders_ytd,
             COALESCE(AVG(total), 0) AS aov
      FROM orders
      WHERE payment_status = 'pagato' AND YEAR(created_at) = YEAR(CURDATE())
    `);

    return res.json({
      summary: {
        revenue_ytd: Number(summary.revenue_ytd),
        orders_ytd: Number(summary.orders_ytd),
        aov: Number(summary.aov),
      },
      sales_by_month: byMonth.map(r => ({ month: r.month, revenue: Number(r.revenue), orders: Number(r.orders) })),
      orders_by_status: byStatus.map(r => ({ stato: r.stato, count: Number(r.count) })),
      top_categories: byCategory.map(r => ({ categoria: r.categoria, revenue: Number(r.revenue), units: Number(r.units) })),
    });
  } catch (err) {
    console.error('reports error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

module.exports = router;
