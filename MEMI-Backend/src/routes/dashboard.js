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

    // Real visitors = distinct tracked sessions (page_views beacon), today vs
    // yesterday. Falls back to 0 if the tracking table isn't present yet.
    let visitorsToday = 0, visitorsYest = 0;
    try {
      const [[vt]] = await pool.execute(
        "SELECT COUNT(DISTINCT session_id) AS n FROM page_views WHERE DATE(created_at) = CURDATE()");
      visitorsToday = vt.n || 0;
      const [[vy]] = await pool.execute(
        "SELECT COUNT(DISTINCT session_id) AS n FROM page_views WHERE DATE(created_at) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)");
      visitorsYest = vy.n || 0;
    } catch (_) { /* page_views may not exist yet on an older DB */ }

    const pctChange = (curr, prev) => {
      if (!prev) return curr > 0 ? '+100%' : '0%';
      const d = ((curr - prev) / prev) * 100;
      return `${d >= 0 ? '+' : ''}${d.toFixed(1)}%`;
    };

    return res.json({
      revenue:  { value: `€ ${Number(curr.revenue).toFixed(2)}`,  delta: pctChange(Number(curr.revenue), Number(prev.revenue)),  up: Number(curr.revenue) >= Number(prev.revenue) },
      orders:   { value: `${curr.orders}`,                         delta: pctChange(Number(curr.orders), Number(prev.orders)),    up: Number(curr.orders) >= Number(prev.orders) },
      visitors: { value: `${visitorsToday}`,                       delta: pctChange(visitorsToday, visitorsYest),  up: visitorsToday >= visitorsYest },
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
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 365);  // validated int → injection-safe
    const [rows] = await pool.execute(`
      SELECT DATE(created_at) AS day, SUM(total) AS revenue, COUNT(*) AS orders
      FROM orders
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL ${days} DAY)
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
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 365);  // validated int → injection-safe
    const [rows] = await pool.execute(`
      SELECT oi.product_id, oi.product_name,
             SUM(oi.qty)           AS units_sold,
             SUM(oi.qty * oi.price) AS revenue
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.payment_status = 'pagato'
        AND o.created_at >= DATE_SUB(NOW(), INTERVAL ${days} DAY)
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
    // Store expenses → net profit (revenue minus tracked expenses).
    const [[exp]] = await pool.execute(`
      SELECT
        COALESCE(SUM(importo),0) AS expenses_total,
        COALESCE(SUM(CASE WHEN YEAR(COALESCE(data_spesa,created_at))=YEAR(CURDATE())
                           AND MONTH(COALESCE(data_spesa,created_at))=MONTH(CURDATE()) THEN importo ELSE 0 END),0) AS expenses_month
      FROM store_expenses
    `);
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
        expenses_total:     Number(exp.expenses_total),
        expenses_month:     Number(exp.expenses_month),
        net_total:          Number(totals.revenue_total) - Number(exp.expenses_total),
        net_month:          Number(mtd.revenue_month) - Number(exp.expenses_month),
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

/* ── GET /api/admin/dashboard/payouts ── payments-received ledger (paid orders) ──
   Distinct from /finance (which is a gross overview): a full list of confirmed
   incoming payments + per-method totals. Provider-level settlement (fees, net,
   arrival date) is intentionally NOT faked here — it needs the payout APIs. */
router.get('/payouts', requireAdmin, requireRole('admin'), async (req, res) => {
  try {
    const [[totals]] = await pool.execute(`
      SELECT
        COALESCE(SUM(total),0)         AS received_total,
        COUNT(*)                        AS received_count,
        COALESCE(SUM(shipping_cost),0) AS shipping_collected,
        COALESCE(SUM(CASE WHEN created_at >= DATE_FORMAT(NOW(),'%Y-%m-01') THEN total END),0) AS received_month,
        COALESCE(SUM(CASE WHEN DATE(created_at)=CURDATE() THEN total END),0)                  AS received_today
      FROM orders WHERE payment_status='pagato'
    `);
    const [byMethod] = await pool.execute(
      "SELECT COALESCE(payment_method,'—') AS method, COUNT(*) AS cnt, COALESCE(SUM(total),0) AS total FROM orders WHERE payment_status='pagato' GROUP BY payment_method ORDER BY total DESC"
    );
    const [payments] = await pool.execute(`
      SELECT order_number, customer_nome, customer_cognome, total, shipping_cost, payment_method, payment_intent_id, created_at
      FROM orders WHERE payment_status='pagato' ORDER BY created_at DESC LIMIT 200
    `);
    return res.json({
      summary: {
        received_total:     Number(totals.received_total),
        received_count:     Number(totals.received_count),
        received_month:     Number(totals.received_month),
        received_today:     Number(totals.received_today),
        shipping_collected: Number(totals.shipping_collected),
      },
      by_method: byMethod.map(m => ({ method: m.method, count: Number(m.cnt), total: Number(m.total) })),
      payments: payments.map(p => ({
        order_number: p.order_number,
        customer:     ((p.customer_nome || '') + ' ' + (p.customer_cognome || '')).trim() || '—',
        total:        Number(p.total),
        shipping:     Number(p.shipping_cost || 0),
        method:       p.payment_method || '—',
        reference:    p.payment_intent_id || null,
        created_at:   p.created_at,
      })),
    });
  } catch (err) {
    console.error('payouts error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── GET /api/admin/dashboard/catalog-kpis ──
   Catalog health for the cockpit dashboard: active products, low stock,
   out of stock, today's paid sales/orders. */
router.get('/catalog-kpis', requireAdmin, async (req, res) => {
  try {
    const [[prod]] = await pool.execute(`
      SELECT
        SUM(CASE WHEN status = 'attivo' THEN 1 ELSE 0 END) AS active_products,
        COUNT(*)                                           AS total_products
      FROM products
    `);
    const [[stock]] = await pool.execute(`
      SELECT
        SUM(CASE WHEN p.status = 'esaurito' OR COALESCE(s.tot, 0) = 0 THEN 1 ELSE 0 END) AS out_of_stock,
        SUM(CASE WHEN p.status <> 'esaurito' AND COALESCE(s.tot, 0) BETWEEN 1 AND 3 THEN 1 ELSE 0 END) AS low_stock
      FROM products p
      LEFT JOIN (SELECT product_id, SUM(stock) AS tot FROM product_sizes GROUP BY product_id) s
        ON s.product_id = p.id
    `);
    const [[today]] = await pool.execute(`
      SELECT COALESCE(SUM(total), 0) AS sales_today, COUNT(*) AS orders_today
      FROM orders
      WHERE payment_status = 'pagato' AND DATE(created_at) = CURDATE()
    `);
    return res.json({
      active_products: Number(prod.active_products) || 0,
      total_products:  Number(prod.total_products)  || 0,
      low_stock:       Number(stock.low_stock)      || 0,
      out_of_stock:    Number(stock.out_of_stock)   || 0,
      sales_today:     Number(today.sales_today)    || 0,
      orders_today:    Number(today.orders_today)   || 0,
    });
  } catch (err) {
    (req.log || console).error({ err }, 'catalog-kpis error');
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── GET /api/admin/dashboard/tax-stats ──
   EU OSS relevance: value of paid orders this year shipped OUTSIDE Italy
   (cross-border) vs the €10.000/yr OSS registration threshold. */
router.get('/tax-stats', requireAdmin, async (req, res) => {
  try {
    const [[oss]] = await pool.execute(`
      SELECT COALESCE(SUM(total),0) AS ytd, COUNT(*) AS orders
        FROM orders
       WHERE payment_status = 'pagato'
         AND YEAR(created_at) = YEAR(CURDATE())
         AND LOWER(COALESCE(shipping_paese,'italia')) NOT IN ('italia','italy','it')`);
    const [byCountry] = await pool.execute(`
      SELECT COALESCE(shipping_paese,'—') AS paese, COUNT(*) AS orders, COALESCE(SUM(total),0) AS revenue
        FROM orders
       WHERE payment_status = 'pagato'
         AND YEAR(created_at) = YEAR(CURDATE())
         AND LOWER(COALESCE(shipping_paese,'italia')) NOT IN ('italia','italy','it')
       GROUP BY shipping_paese ORDER BY revenue DESC LIMIT 20`);
    const threshold = 10000;
    const ytd = Number(oss.ytd) || 0;
    return res.json({
      oss_ytd: ytd, foreign_orders: Number(oss.orders) || 0, threshold, over: ytd >= threshold,
      by_country: byCountry.map((r) => ({ paese: r.paese, orders: Number(r.orders), revenue: Number(r.revenue) })),
    });
  } catch (err) {
    console.error('tax-stats error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

module.exports = router;
