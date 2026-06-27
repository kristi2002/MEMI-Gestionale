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
const { pool }                     = require('../db');
const { requireAdmin, requireRole } = require('../middleware/auth');

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
      revenue:  { value: `€ ${Number(curr.revenue).toFixed(2)}`,  delta: pctChange(Number(curr.revenue), Number(prev.revenue)),  up: Number(curr.revenue) >= Number(prev.revenue) },
      orders:   { value: `${curr.orders}`,                         delta: pctChange(Number(curr.orders), Number(prev.orders)),    up: Number(curr.orders) >= Number(prev.orders) },
      visitors: { value: `${visitors.total}`,                      delta: '',                                     up: true },
      aov:      { value: `€ ${Number(curr.aov).toFixed(2)}`,      delta: pctChange(Number(curr.aov), Number(prev.aov)),          up: Number(curr.aov) >= Number(prev.aov) },
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

/* ── GET /api/admin/dashboard/finance ── real financial overview from orders ── */
router.get('/finance', requireAdmin, requireRole('admin'), async (req, res) => {
  try {
    const [[totals]] = await pool.execute(`
      SELECT
        COALESCE(SUM(CASE WHEN payment_status='pagato'     THEN total END),0)         AS revenue_total,
        COALESCE(SUM(CASE WHEN payment_status='in_attesa'  THEN total END),0)         AS pending_amount,
        COALESCE(SUM(CASE WHEN payment_status='rimborsato' THEN total END),0)         AS refunded_amount,
        COALESCE(SUM(CASE WHEN payment_status='pagato'     THEN shipping_cost END),0) AS shipping_collected,
        COUNT(CASE WHEN payment_status='pagato' THEN 1 END)                           AS paid_count,
        COALESCE(AVG(CASE WHEN payment_status='pagato' THEN total END),0)             AS aov
      FROM orders
    `);
    const [[mtd]] = await pool.execute(
      "SELECT COALESCE(SUM(total),0) AS revenue_month FROM orders WHERE payment_status='pagato' AND created_at >= DATE_FORMAT(NOW(),'%Y-%m-01')"
    );
    const [[today]] = await pool.execute(
      "SELECT COALESCE(SUM(total),0) AS revenue_today FROM orders WHERE payment_status='pagato' AND DATE(created_at)=CURDATE()"
    );
    const [byMethod] = await pool.execute(
      "SELECT COALESCE(payment_method,'—') AS method, COUNT(*) AS cnt, COALESCE(SUM(total),0) AS total FROM orders WHERE payment_status='pagato' GROUP BY payment_method ORDER BY total DESC"
    );
    const [recent] = await pool.execute(`
      SELECT order_number, customer_nome, customer_cognome, total, payment_method, payment_status, created_at
      FROM orders ORDER BY created_at DESC LIMIT 15
    `);
    return res.json({
      summary: {
        revenue_total:      Number(totals.revenue_total),
        revenue_month:      Number(mtd.revenue_month),
        revenue_today:      Number(today.revenue_today),
        pending_amount:     Number(totals.pending_amount),
        refunded_amount:    Number(totals.refunded_amount),
        shipping_collected: Number(totals.shipping_collected),
        paid_count:         Number(totals.paid_count),
        aov:                Number(totals.aov),
      },
      by_method: byMethod.map(m => ({ method: m.method, count: Number(m.cnt), total: Number(m.total) })),
      recent: recent.map(r => ({
        order_number:   r.order_number,
        customer:       ((r.customer_nome || '') + ' ' + (r.customer_cognome || '')).trim() || '—',
        total:          Number(r.total),
        method:         r.payment_method || '—',
        payment_status: r.payment_status,
        created_at:     r.created_at,
      })),
    });
  } catch (err) {
    console.error('finance summary error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

module.exports = router;
