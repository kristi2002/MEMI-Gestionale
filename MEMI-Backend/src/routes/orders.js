'use strict';

/**
 * /api/orders  — Order management
 *
 * PUBLIC / CUSTOMER:
 *   POST /api/orders                  Place a new order (guest or logged-in)
 *   GET  /api/orders/my               Customer's own orders (requires customer JWT)
 *   GET  /api/orders/my/:id           Single order detail (customer JWT)
 *
 * ADMIN only:
 *   GET  /api/admin/orders            List all orders (with filters)
 *   GET  /api/admin/orders/:id        Single order detail with items
 *   PUT  /api/admin/orders/:id/status Update order_status / payment_status
 *   PUT  /api/admin/orders/:id/ship   Assign courier + tracking number
 */

const router = require('express').Router();
const { pool }                           = require('../db');
const { requireCustomer, requireAdmin, optionalCustomer } = require('../middleware/auth');
const { sendOrderConfirmation, sendShippingConfirmation } = require('../email');

/* ── helpers ── */
async function nextOrderNumber(conn) {
  const [[row]] = await conn.execute(
    'SELECT MAX(CAST(SUBSTRING(order_number, 2) AS UNSIGNED)) AS max_n FROM orders'
  );
  const next = (row.max_n || 10254) + 1;
  return `#${next}`;
}

/* ═══════════════════════════════════════════════════════════════
   CUSTOMER-FACING ROUTES
   ═══════════════════════════════════════════════════════════════ */

/* ── POST /api/orders ── */
router.post('/', optionalCustomer, async (req, res) => {
  const {
    nome, cognome, email, telefono,
    indirizzo, citta, cap, paese = 'Italia',
    items,          // [{product_id, product_name, taglia, colore, price, qty}]
    discount_code,
    payment_method = 'carta',
    payment_intent_id,      // Stripe PaymentIntent ID (if card payment)
  } = req.body;

  if (!nome || !cognome || !email || !indirizzo || !citta || !cap)
    return res.status(400).json({ error: 'Dati di spedizione incompleti' });
  if (!items || !items.length)
    return res.status(400).json({ error: 'Il carrello è vuoto' });

  // Verify Stripe PaymentIntent if provided and secret key is configured
  if (payment_method === 'carta' && payment_intent_id && process.env.STRIPE_SECRET_KEY) {
    try {
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      const pi = await stripe.paymentIntents.retrieve(payment_intent_id);
      if (pi.status !== 'succeeded') {
        return res.status(402).json({ error: 'Pagamento non completato. Riprova.' });
      }
    } catch (stripeErr) {
      console.error('Stripe verify error:', stripeErr.message);
      return res.status(402).json({ error: 'Impossibile verificare il pagamento. Riprova.' });
    }
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Validate & apply discount code
    let discountAmount = 0;
    let discountCodeId = null;
    let shippingCost   = 5.90;
    const subtotal     = items.reduce((s, i) => s + i.price * i.qty, 0);

    if (discount_code) {
      const [[dc]] = await conn.execute(
        `SELECT * FROM discount_codes
         WHERE code = ? AND stato = 'attivo'
           AND (scadenza IS NULL OR scadenza >= CURDATE())
           AND (max_utilizzi IS NULL OR utilizzi < max_utilizzi)
           AND min_order <= ?`,
        [discount_code.toUpperCase(), subtotal]
      );
      if (!dc) return res.status(400).json({ error: 'Codice sconto non valido o scaduto' });
      discountCodeId = dc.id;
      if (dc.tipo === 'percentuale') discountAmount = subtotal * (dc.valore / 100);
      else if (dc.tipo === 'fisso')  discountAmount = Math.min(dc.valore, subtotal);
      else if (dc.tipo === 'spedizione') shippingCost = 0;
    }

    const total        = Math.max(0, subtotal - discountAmount + shippingCost);
    const orderNumber  = await nextOrderNumber(conn);
    const customerId   = req.customer?.id || null;

    // 2. Insert order
    const [result] = await conn.execute(
      `INSERT INTO orders
         (order_number, customer_id, customer_nome, customer_cognome, customer_email,
          customer_telefono, shipping_address, shipping_citta, shipping_cap, shipping_paese,
          subtotal, shipping_cost, discount_amount, total, discount_code, payment_method)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [orderNumber, customerId, nome, cognome, email, telefono || null,
       indirizzo, citta, cap, paese,
       subtotal, shippingCost, discountAmount, total,
       discount_code ? discount_code.toUpperCase() : null, payment_method]
    );
    const orderId = result.insertId;

    // 3. Insert order items & decrement stock
    for (const item of items) {
      await conn.execute(
        `INSERT INTO order_items (order_id, product_id, product_name, taglia, colore, price, qty)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [orderId, item.product_id, item.product_name, item.taglia || null,
         item.colore || null, item.price, item.qty]
      );

      // Decrement stock (allow negative — admin can resolve)
      if (item.taglia) {
        await conn.execute(
          `UPDATE product_sizes SET stock = GREATEST(0, stock - ?)
           WHERE product_id = ? AND taglia = ?`,
          [item.qty, item.product_id, item.taglia]
        );
      }
    }

    // 4. Increment discount code usage
    if (discountCodeId) {
      await conn.execute(
        'UPDATE discount_codes SET utilizzi = utilizzi + 1 WHERE id = ?',
        [discountCodeId]
      );
      await conn.execute(
        'INSERT INTO discount_usage (code_id, order_id, customer_email) VALUES (?, ?, ?)',
        [discountCodeId, orderId, email]
      );
    }

    // 5. Update customer totals
    if (customerId) {
      await conn.execute(
        'UPDATE customers SET total_orders = total_orders + 1, total_spent = total_spent + ? WHERE id = ?',
        [total, customerId]
      );
    }

    await conn.commit();

    // Send confirmation email (non-blocking — never fails the order response)
    sendOrderConfirmation({
      order_number: orderNumber,
      nome, cognome, email,
      items, total,
    }).catch(() => {}); // already logged inside sendOrderConfirmation

    return res.status(201).json({ ok: true, order_number: orderNumber, total });
  } catch (err) {
    await conn.rollback();
    console.error('place order error', err);
    return res.status(500).json({ error: 'Errore nel processare l\'ordine' });
  } finally {
    conn.release();
  }
});

/* ── GET /api/orders/my ── */
router.get('/my', requireCustomer, async (req, res) => {
  try {
    const [orders] = await pool.execute(
      `SELECT id, order_number, total, payment_status, order_status,
              tracking_number, courier_code, created_at
       FROM orders WHERE customer_id = ? ORDER BY created_at DESC`,
      [req.customer.id]
    );
    return res.json(orders);
  } catch (err) {
    console.error('my orders error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── GET /api/orders/my/:id ── */
router.get('/my/:id', requireCustomer, async (req, res) => {
  try {
    const [[order]] = await pool.execute(
      'SELECT * FROM orders WHERE id = ? AND customer_id = ?',
      [req.params.id, req.customer.id]
    );
    if (!order) return res.status(404).json({ error: 'Ordine non trovato' });

    const [items] = await pool.execute(
      'SELECT * FROM order_items WHERE order_id = ?',
      [order.id]
    );
    return res.json({ ...order, items });
  } catch (err) {
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ═══════════════════════════════════════════════════════════════
   ADMIN ROUTES
   ═══════════════════════════════════════════════════════════════ */

/* ── GET /api/admin/orders ── */
router.get('/admin/list', requireAdmin, async (req, res) => {
  try {
    const { stato, pagamento, q, limit = 50, offset = 0 } = req.query;
    let where = 'WHERE 1=1';
    const filterParams = [];

    if (stato)     { where += ' AND order_status = ?';   filterParams.push(stato); }
    if (pagamento) { where += ' AND payment_status = ?'; filterParams.push(pagamento); }
    if (q) {
      where += ' AND (customer_nome LIKE ? OR customer_cognome LIKE ? OR customer_email LIKE ? OR order_number LIKE ?)';
      const like = `%${q}%`;
      filterParams.push(like, like, like, like);
    }

    const safeLimit  = parseInt(limit)  || 50;
    const safeOffset = parseInt(offset) || 0;
    const [orders] = await pool.execute(
      `SELECT * FROM orders ${where} ORDER BY created_at DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`,
      filterParams
    );
    const [[{ total }]] = await pool.execute(`SELECT COUNT(*) as total FROM orders ${where}`, filterParams);
    return res.json({ orders, total });
  } catch (err) {
    console.error('admin orders error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── GET /api/admin/orders/:id ── */
router.get('/admin/:id', requireAdmin, async (req, res) => {
  try {
    const [[order]] = await pool.execute('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (!order) return res.status(404).json({ error: 'Ordine non trovato' });

    const [items] = await pool.execute('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
    const [[shipment]] = await pool.execute('SELECT * FROM shipments WHERE order_id = ?', [order.id]);
    return res.json({ ...order, items, shipment: shipment || null });
  } catch (err) {
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── PUT /api/admin/orders/:id/status ── */
router.put('/admin/:id/status', requireAdmin, async (req, res) => {
  const { order_status, payment_status } = req.body;
  try {
    const fields = [];
    const vals   = [];
    if (order_status)   { fields.push('order_status = ?');   vals.push(order_status); }
    if (payment_status) { fields.push('payment_status = ?'); vals.push(payment_status); }
    if (!fields.length) return res.status(400).json({ error: 'Nessun campo da aggiornare' });

    vals.push(req.params.id);
    await pool.execute(`UPDATE orders SET ${fields.join(', ')} WHERE id = ?`, vals);
    return res.json({ ok: true });
  } catch (err) {
    console.error('update order status error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── PUT /api/admin/orders/:id/ship ── */
router.put('/admin/:id/ship', requireAdmin, async (req, res) => {
  const { courier_code, tracking_number, eta, destinazione } = req.body;
  if (!courier_code || !tracking_number)
    return res.status(400).json({ error: 'Corriere e tracking obbligatori' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.execute(
      `UPDATE orders SET courier_code = ?, tracking_number = ?,
              order_status = 'spedito', payment_status = 'pagato'
       WHERE id = ?`,
      [courier_code, tracking_number, req.params.id]
    );

    // Upsert shipment record
    await conn.execute(
      `INSERT INTO shipments (tracking_number, order_id, courier_code, destinazione, stato, eta)
       VALUES (?, ?, ?, ?, 'in_transito', ?)
       ON DUPLICATE KEY UPDATE stato='in_transito', eta=VALUES(eta)`,
      [tracking_number, req.params.id, courier_code, destinazione || null, eta || null]
    );

    await conn.commit();

    // Fetch order for email (non-blocking)
    pool.execute('SELECT order_number, customer_nome AS nome, customer_email AS email FROM orders WHERE id = ?', [req.params.id])
      .then(([[o]]) => {
        if (o) sendShippingConfirmation({
          order_number: o.order_number,
          nome: o.nome,
          email: o.email,
          courier_code, tracking_number, eta,
        }).catch(() => {});
      }).catch(() => {});

    return res.json({ ok: true });
  } catch (err) {
    await conn.rollback();
    console.error('ship order error', err);
    return res.status(500).json({ error: 'Errore server' });
  } finally {
    conn.release();
  }
});

/* ── DELETE /api/orders/admin/:id ── */
router.delete('/admin/:id', requireAdmin, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // Delete child records first (FK constraints)
    await conn.execute('DELETE FROM order_items WHERE order_id = ?', [req.params.id]);
    await conn.execute('DELETE FROM shipments WHERE order_id = ?', [req.params.id]);
    await conn.execute('DELETE FROM discount_usage WHERE order_id = ?', [req.params.id]);
    // Delete from resi and invoices if those tables exist
    await conn.execute('DELETE FROM resi WHERE order_id = ?', [req.params.id]).catch(() => {});
    await conn.execute('DELETE FROM invoices WHERE order_id = ?', [req.params.id]).catch(() => {});
    const [result] = await conn.execute('DELETE FROM orders WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Ordine non trovato' });
    }
    await conn.commit();
    return res.json({ ok: true, message: 'Ordine eliminato' });
  } catch (err) {
    await conn.rollback();
    console.error('delete order error', err);
    return res.status(500).json({ error: 'Errore server' });
  } finally {
    conn.release();
  }
});

/* ── POST /api/orders/validate-discount ── */
router.post('/validate-discount', async (req, res) => {
  const { code, subtotal = 0 } = req.body;
  if (!code) return res.status(400).json({ error: 'Codice mancante' });

  try {
    const [[dc]] = await pool.execute(
      `SELECT id, code, tipo, valore, stato, scadenza, max_utilizzi, utilizzi, min_order
       FROM discount_codes
       WHERE code = ? AND stato = 'attivo'
         AND (scadenza IS NULL OR scadenza >= CURDATE())
         AND (max_utilizzi IS NULL OR utilizzi < max_utilizzi)`,
      [code.toUpperCase()]
    );

    if (!dc) return res.status(404).json({ error: 'Codice non valido o scaduto' });
    if (dc.min_order > 0 && subtotal < dc.min_order)
      return res.status(400).json({ error: `Ordine minimo EUR${dc.min_order.toFixed(2)} per questo codice` });

    let discountAmount = 0;
    let freeShipping   = false;
    if (dc.tipo === 'percentuale')  discountAmount = subtotal * (dc.valore / 100);
    else if (dc.tipo === 'fisso')   discountAmount = Math.min(dc.valore, subtotal);
    else if (dc.tipo === 'spedizione') freeShipping = true;

    return res.json({
      ok: true,
      code: dc.code,
      tipo: dc.tipo,
      valore: dc.valore,
      discount_amount: discountAmount,
      free_shipping: freeShipping,
      label: dc.tipo === 'percentuale'
        ? `${dc.valore}% di sconto`
        : dc.tipo === 'fisso'
          ? `EUR ${dc.valore.toFixed(2)} di sconto`
          : 'Spedizione gratuita',
    });
  } catch (err) {
    console.error('validate discount error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

module.exports = router;
