'use strict';

/**
 * /api/admin/resi  — Returns (resi) management
 *
 * GET    /api/admin/resi          List all return requests
 * GET    /api/admin/resi/:id      Single return detail
 * POST   /api/admin/resi          Create a new return request
 * PUT    /api/admin/resi/:id      Update stato / rimborso_amount
 * DELETE /api/admin/resi/:id      Delete return record
 */

const router = require('express').Router();
const { pool }         = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { logAdminAction } = require('../audit');
const { compensateOrder } = require('../order-compensation');
const { sendRefundNotification } = require('../email');

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  return require('stripe')(process.env.STRIPE_SECRET_KEY);
}

/* ── GET /api/admin/resi ── */
router.get('/', requireAdmin, async (req, res) => {
  try {
    const { stato, q, limit = 50, offset = 0 } = req.query;
    let sql = 'SELECT * FROM resi WHERE 1=1';
    const params = [];

    if (stato) { sql += ' AND stato = ?'; params.push(stato); }
    if (q) {
      sql += ' AND (rma_number LIKE ? OR customer_email LIKE ? OR customer_nome LIKE ? OR order_number LIKE ?)';
      const like = `%${q}%`;
      params.push(like, like, like, like);
    }

    const safeLimit  = parseInt(limit)  || 50;
    const safeOffset = parseInt(offset) || 0;
    sql += ` ORDER BY created_at DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`;

    const [resi]          = await pool.execute(sql, params);

    // Count query mirrors the same filters so pagination totals are correct
    let countSql    = 'SELECT COUNT(*) as total FROM resi WHERE 1=1';
    const countParams = [];
    if (stato) { countSql += ' AND stato = ?'; countParams.push(stato); }
    if (q) {
      countSql += ' AND (rma_number LIKE ? OR customer_email LIKE ? OR customer_nome LIKE ? OR order_number LIKE ?)';
      const like2 = `%${q}%`;
      countParams.push(like2, like2, like2, like2);
    }
    const [[{ total }]]   = await pool.execute(countSql, countParams);
    return res.json({ resi, total });
  } catch (err) {
    console.error('resi list error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── GET /api/admin/resi/:id ── */
router.get('/:id', requireAdmin, async (req, res) => {
  try {
    const [[reso]] = await pool.execute(
      `SELECT r.*, o.customer_nome, o.customer_email, o.total as order_total,
              o.payment_intent_id, o.payment_status
       FROM resi r LEFT JOIN orders o ON o.id = r.order_id WHERE r.id = ?`,
      [req.params.id]
    );
    if (!reso) return res.status(404).json({ error: 'Reso non trovato' });

    const [items] = await pool.execute(
      'SELECT * FROM order_items WHERE order_id = ?',
      [reso.order_id]
    );
    return res.json({ ...reso, items });
  } catch (err) {
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── POST /api/admin/resi ── */
router.post('/', requireAdmin, async (req, res) => {
  const { order_id, motivo, descrizione } = req.body;
  if (!order_id || !motivo) return res.status(400).json({ error: 'order_id e motivo obbligatori' });

  try {
    const [[order]] = await pool.execute(
      'SELECT order_number, customer_nome, customer_cognome, customer_email FROM orders WHERE id = ?',
      [order_id]
    );
    if (!order) return res.status(404).json({ error: 'Ordine non trovato' });

    const rma_number = `R-${Date.now().toString().slice(-6)}`;
    const customer_nome = `${order.customer_nome} ${order.customer_cognome}`.trim();

    const [result] = await pool.execute(
      `INSERT INTO resi (rma_number, order_id, order_number, customer_nome, customer_email, motivo, descrizione)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [rma_number, order_id, order.order_number, customer_nome, order.customer_email, motivo, descrizione || null]
    );
    const [[reso]] = await pool.execute('SELECT * FROM resi WHERE id = ?', [result.insertId]);
    return res.status(201).json({ reso });
  } catch (err) {
    console.error('create reso error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── PUT /api/admin/resi/:id ── */
router.put('/:id', requireAdmin, async (req, res) => {
  const { stato, rimborso_amount } = req.body;
  const fields = [];
  const vals   = [];
  if (stato !== undefined)           { fields.push('stato = ?');           vals.push(stato); }
  if (rimborso_amount !== undefined) { fields.push('rimborso_amount = ?'); vals.push(rimborso_amount || null); }
  if (!fields.length) return res.status(400).json({ error: 'Nessun campo da aggiornare' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[current]] = await conn.execute(
      'SELECT * FROM resi WHERE id = ? FOR UPDATE', [req.params.id]
    );
    if (!current) { await conn.rollback(); return res.status(404).json({ error: 'Reso non trovato' }); }

    // FIRST transition into 'rimborsato' (manual path — money returned outside
    // Stripe): mark the order refunded AND put the goods back in stock, restore
    // the gift-card portion, reverse loyalty points, subtract from total speso.
    if (stato === 'rimborsato' && current.stato !== 'rimborsato') {
      const [[order]] = await conn.execute(
        'SELECT * FROM orders WHERE id = ? FOR UPDATE', [current.order_id]
      );
      if (order) {
        await conn.execute("UPDATE orders SET payment_status = 'rimborsato' WHERE id = ?", [order.id]);
        if (order.order_status !== 'annullato') await compensateOrder(conn, order, 'refund');
        sendRefundNotification({
          order_number: order.order_number, nome: order.customer_nome,
          email: order.customer_email,
          amount: rimborso_amount != null ? rimborso_amount : (current.rimborso_amount != null ? current.rimborso_amount : order.total),
          manual: true,
        }).catch(() => {});
      }
    }

    vals.push(req.params.id);
    await conn.execute(`UPDATE resi SET ${fields.join(', ')} WHERE id = ?`, vals);
    await conn.commit();
    const [[reso]] = await pool.execute('SELECT * FROM resi WHERE id = ?', [req.params.id]);
    return res.json({ reso });
  } catch (err) {
    await conn.rollback();
    console.error('update reso error', err);
    return res.status(500).json({ error: 'Errore server' });
  } finally {
    conn.release();
  }
});

/* ── POST /api/admin/resi/:id/refund ── issue a REAL Stripe refund for a return ──
   Amount priority: body.amount > stored rimborso_amount > full order total (capped at total).
   On success: marks the return 'rimborsato' and the order payment_status 'rimborsato'. */
router.post('/:id/refund', requireAdmin, async (req, res) => {
  // { manual: true } = the money was returned OUTSIDE Stripe (PayPal / Klarna /
  // bonifico): skip the Stripe call but run the exact same bookkeeping.
  const manual = !!(req.body && req.body.manual === true);
  const stripe = getStripe();
  if (!stripe && !manual) return res.status(503).json({ error: 'Stripe non configurato sul server.' });

  try {
    const [[row]] = await pool.execute(
      `SELECT r.id, r.stato, r.rimborso_amount, r.order_id,
              o.payment_intent_id, o.total
       FROM resi r LEFT JOIN orders o ON o.id = r.order_id WHERE r.id = ?`,
      [req.params.id]
    );
    if (!row) return res.status(404).json({ error: 'Reso non trovato' });
    if (row.stato === 'rimborsato') return res.status(409).json({ error: 'Reso già rimborsato' });
    if (!row.payment_intent_id && !manual)
      return res.status(400).json({ error: 'Ordine senza pagamento Stripe: usa il rimborso manuale (bottone "Rimborso manuale") dopo aver restituito l\'importo al cliente.' });

    const orderTotal = Number(row.total) || 0;
    let amount = (req.body && req.body.amount !== undefined) ? Number(req.body.amount)
               : (row.rimborso_amount != null ? Number(row.rimborso_amount) : orderTotal);
    if (!Number.isFinite(amount) || amount <= 0) amount = orderTotal;
    amount = Math.min(amount, orderTotal);
    const amountCents = Math.round(amount * 100);
    if (amountCents < 1) return res.status(400).json({ error: 'Importo rimborso non valido' });

    let refund = null;
    if (!manual) {
      try {
        refund = await stripe.refunds.create({ payment_intent: row.payment_intent_id, amount: amountCents });
      } catch (stripeErr) {
        (req.log || console).error({ err: stripeErr, resiId: req.params.id, orderId: row.order_id }, '[Stripe] refund error');
        return res.status(502).json({ error: 'Errore Stripe: ' + (stripeErr.message || 'sconosciuto') });
      }
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [[orderRow]] = await conn.execute(
        'SELECT * FROM orders WHERE id = ? FOR UPDATE', [row.order_id]
      );
      await conn.execute("UPDATE resi SET stato = 'rimborsato', rimborso_amount = ? WHERE id = ?", [amount, req.params.id]);
      await conn.execute("UPDATE orders SET payment_status = 'rimborsato' WHERE id = ?", [row.order_id]);
      // Goods come back: restock every item, restore the gift-card portion,
      // reverse loyalty points, subtract from the customer's total speso.
      // (Skipped when the order was annullato — the cancel already did it.)
      if (orderRow && orderRow.order_status !== 'annullato') {
        await compensateOrder(conn, orderRow, 'refund');
      }
      await conn.commit();

      if (orderRow) {
        sendRefundNotification({
          order_number: orderRow.order_number, nome: orderRow.customer_nome,
          email: orderRow.customer_email, amount, manual,
        }).catch(() => {});
      }
    } catch (dbErr) {
      await conn.rollback();
      // Money-moved-but-DB-failed is the single most important thing to log loudly and
      // completely in this whole codebase — an operator must be able to find this line.
      if (manual) {
        // No money moved through us — safe to fail loudly and let the admin retry.
        return res.status(500).json({ error: 'Aggiornamento DB fallito — riprova il rimborso manuale.' });
      }
      (req.log || console).error(
        { err: dbErr, resiId: req.params.id, orderId: row.order_id, stripeRefundId: refund ? refund.id : null, amount },
        'CRITICAL: Stripe refund succeeded but DB update failed — manual reconciliation required'
      );
      return res.status(200).json({ ok: true, refund_id: refund ? refund.id : null, amount,
        warning: 'Rimborso Stripe eseguito ma aggiornamento DB fallito — verifica lo stato manualmente.' });
    } finally {
      conn.release();
    }

    logAdminAction({
      adminId: req.admin.id, adminEmail: req.admin.email, action: 'resi.refund',
      entityType: 'resi', entityId: req.params.id,
      details: { refund_id: refund ? refund.id : null, manual, amount, order_id: row.order_id },
    }).catch(() => {});

    const [[reso]] = await pool.execute('SELECT * FROM resi WHERE id = ?', [req.params.id]);
    return res.json({ ok: true, refund_id: refund ? refund.id : null, manual, amount, reso });
  } catch (err) {
    console.error('refund reso error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── DELETE /api/admin/resi/:id ── */
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const [result] = await pool.execute('DELETE FROM resi WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Reso non trovato' });
    return res.json({ ok: true, message: 'Reso eliminato' });
  } catch (err) {
    return res.status(500).json({ error: 'Errore server' });
  }
});

module.exports = router;
