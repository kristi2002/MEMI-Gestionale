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
const { awardPurchasePoints } = require('../loyalty');
const { compensateOrder } = require('../order-compensation');
const { ensureInvoiceForOrder } = require('../invoicing');
const { validateBody, createOrderSchema } = require('../validation');
const { logAdminAction } = require('../audit');
const providers = require('../payment-providers');   // PayPal / Klarna (config-gated)

/* ── enum whitelists (mirror schema.sql ENUM definitions) ── */
const PAYMENT_STATUSES = ['in_attesa', 'pagato', 'rimborsato', 'fallito'];
const ORDER_STATUSES   = ['in_attesa', 'in_preparazione', 'spedito', 'consegnato', 'annullato'];
const PAYMENT_METHODS  = ['carta', 'paypal', 'klarna'];

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

/* ── POST /api/orders ──
   Security model:
   - Line prices/names are ALWAYS re-resolved from the products table; the client-sent
     price/name are ignored, so a customer can't fake prices.
   - When Stripe is configured, we verify the PaymentIntent succeeded AND that its amount
     (and currency) match the server-computed total, then mark the order 'pagato'.
   - The PaymentIntent id is stored UNIQUE, so it can't be replayed across orders.        */
router.post('/', validateBody(createOrderSchema), optionalCustomer, async (req, res) => {
  const {
    nome, cognome, email, telefono,
    indirizzo, citta, cap, paese = 'Italia',
    items,          // [{product_id, taglia, colore, qty}] — price/name resolved server-side
    discount_code,
    gift_card_code, // optional — redeemed against the total, see step 2b below
    payment_method = 'carta',
    payment_intent_id,      // Stripe PaymentIntent ID (if card payment)
    payment_reference,      // PayPal order id / Klarna order id (non-Stripe providers)
  } = req.body;

  if (!nome || !cognome || !email || !indirizzo || !citta || !cap)
    return res.status(400).json({ error: 'Dati di spedizione incompleti' });
  if (!Array.isArray(items) || !items.length)
    return res.status(400).json({ error: 'Il carrello è vuoto' });
  if (!PAYMENT_METHODS.includes(payment_method))
    return res.status(400).json({ error: 'Metodo di pagamento non valido' });

  // Validate item shape up front (→ 400, not 500)
  for (const it of items) {
    if (!it || !it.product_id)
      return res.status(400).json({ error: 'Articolo non valido nel carrello' });
    const q = parseInt(it.qty, 10);
    if (!Number.isFinite(q) || q < 1)
      return res.status(400).json({ error: 'Quantità non valida nel carrello' });
  }

  try {
    /* 1. Re-resolve every line item from the catalog (prices are authoritative from the DB) */
    const resolved = [];
    for (const it of items) {
      const [[prod]] = await pool.execute(
        'SELECT id, name, price, status FROM products WHERE id = ?', [it.product_id]
      );
      if (!prod || prod.status === 'bozza')
        return res.status(400).json({ error: `Prodotto non disponibile: ${it.product_id}` });

      const qty = parseInt(it.qty, 10);

      /* 1a. Stock check — reject if insufficient stock for the requested size */
      if (it.taglia) {
        const [[sizeRow]] = await pool.execute(
          'SELECT stock FROM product_sizes WHERE product_id = ? AND taglia = ?',
          [it.product_id, it.taglia]
        );
        if (!sizeRow || Number(sizeRow.stock) < qty) {
          const available = sizeRow ? Number(sizeRow.stock) : 0;
          return res.status(400).json({
            error: `Taglia ${it.taglia} di "${prod.name}" non disponibile (disponibili: ${available}).`,
          });
        }
      }

      resolved.push({
        product_id:   prod.id,
        product_name: prod.name,
        price:        Number(prod.price) || 0,
        qty,
        taglia:       it.taglia || null,
        colore:       it.colore || null,
      });
    }
    const subtotal = resolved.reduce((s, i) => s + i.price * i.qty, 0);

    /* 2. Validate & compute discount (read-only here; usage incremented in the txn below) */
    let discountAmount = 0;
    let discountCode   = null;
    let shippingCost   = 5.90;
    if (discount_code) {
      const [[dc]] = await pool.execute(
        `SELECT * FROM discount_codes
         WHERE code = ? AND stato = 'attivo'
           AND (scadenza IS NULL OR scadenza >= CURDATE())
           AND (max_utilizzi IS NULL OR utilizzi < max_utilizzi)
           AND min_order <= ?`,
        [discount_code.toUpperCase(), subtotal]
      );
      if (!dc) return res.status(400).json({ error: 'Codice sconto non valido o scaduto' });

      // Per-customer-email limit: one redemption of a given code per email, on top of
      // the code's own global max_utilizzi. Closes the "register with 10 emails, reuse
      // the same code 10x" gap — max_utilizzi alone doesn't stop repeat use by one email.
      const [[alreadyUsed]] = await pool.execute(
        'SELECT id FROM discount_usage WHERE code_id = ? AND customer_email = ? LIMIT 1',
        [dc.id, email]
      );
      if (alreadyUsed)
        return res.status(400).json({ error: 'Hai già utilizzato questo codice sconto' });

      discountCode = dc;
      const dcValore = Number(dc.valore);
      if (dc.tipo === 'percentuale')      discountAmount = subtotal * (dcValore / 100);
      else if (dc.tipo === 'fisso')       discountAmount = Math.min(dcValore, subtotal);
      else if (dc.tipo === 'spedizione')  shippingCost = 0;
    }

    const preGiftTotal = Math.round(Math.max(0, subtotal - discountAmount + shippingCost) * 100) / 100;

    /* 2b. Gift card — read-only check here (mirrors the discount-code pattern above); the
       actual balance deduction happens transactionally in step 4, with a conditional UPDATE
       (`WHERE balance >= ?`) so a race between two concurrent orders can't overdraw it. */
    let giftCard       = null;
    let giftCardAmount = 0;
    if (gift_card_code) {
      const [[gc]] = await pool.execute(
        "SELECT * FROM gift_cards WHERE code = ? AND stato = 'attiva'",
        [String(gift_card_code).trim().toUpperCase()]
      );
      if (!gc || Number(gc.balance) <= 0)
        return res.status(400).json({ error: 'Gift card non valida o esaurita' });
      giftCard = gc;
      giftCardAmount = Math.round(Math.min(Number(gc.balance), preGiftTotal) * 100) / 100;
    }

    const total = Math.round(Math.max(0, preGiftTotal - giftCardAmount) * 100) / 100;

    /* 3. Verify payment BEFORE writing anything. The provider transaction must match the
       server-computed total. Skipped entirely when the gift card already covers the full total.
       `paymentRef` is the generic transaction reference persisted in orders.payment_intent_id
       (UNIQUE → cross-provider replay protection). A provider selected but not configured is
       refused (503) rather than creating a silent unpaid order. */
    const expectedCents = Math.round(total * 100);
    let paymentStatus = 'in_attesa';
    let paymentRef = payment_intent_id || null;
    let paypalCaptureAfterCommit = false;   // PayPal: capture only after the order is persisted
    if (total === 0 && (giftCard || discountCode)) {
      paymentStatus = 'pagato';
    } else if (payment_method === 'carta' && process.env.STRIPE_SECRET_KEY) {
      if (!payment_intent_id)
        return res.status(402).json({ error: 'Dati di pagamento mancanti. Riprova.' });
      try {
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        const pi = await stripe.paymentIntents.retrieve(payment_intent_id);
        if (pi.status !== 'succeeded')
          return res.status(402).json({ error: 'Pagamento non completato. Riprova.' });
        if (pi.currency !== 'eur' || Number(pi.amount) !== expectedCents) {
          (req.log || console).error(
            { paymentIntentId: payment_intent_id, piAmount: pi.amount, piCurrency: pi.currency, expectedCents },
            'Stripe amount mismatch — possible tampering attempt'
          );
          return res.status(402).json({ error: 'Importo del pagamento non corrisponde. Riprova.' });
        }
        paymentStatus = 'pagato';
      } catch (stripeErr) {
        (req.log || console).error({ err: stripeErr, paymentIntentId: payment_intent_id }, 'Stripe verify error');
        return res.status(402).json({ error: 'Impossibile verificare il pagamento. Riprova.' });
      }
    } else if (payment_method === 'paypal') {
      if (!providers.paypalConfigured())
        return res.status(503).json({ error: 'PayPal non disponibile al momento.' });
      if (!payment_reference)
        return res.status(402).json({ error: 'Dati di pagamento PayPal mancanti. Riprova.' });
      try {
        // Verify the buyer approved the correct amount, but DON'T capture yet — the capture
        // happens AFTER the order (and its atomic stock decrement) commits, so a concurrent
        // oversell 409 can't leave a buyer charged with no order (reviewer finding #2).
        const info = await providers.inspectPaypalOrder(String(payment_reference));
        if (info.status !== 'APPROVED' && info.status !== 'COMPLETED')
          throw new Error('PayPal order not payable (status ' + info.status + ')');
        if (info.currency !== 'EUR' || Number(info.amountCents) !== expectedCents)
          throw new Error('PayPal amount/currency mismatch');
        paymentRef = String(payment_reference);
        if (info.status === 'COMPLETED') paymentStatus = 'pagato';   // already captured (idempotent retry)
        else paypalCaptureAfterCommit = true;                        // APPROVED → capture post-commit
      } catch (ppErr) {
        (req.log || console).error({ err: ppErr, ref: payment_reference }, 'PayPal verify error');
        return res.status(402).json({ error: 'Impossibile verificare il pagamento PayPal. Riprova.' });
      }
    } else if (payment_method === 'klarna') {
      if (!providers.klarnaConfigured())
        return res.status(503).json({ error: 'Klarna non disponibile al momento.' });
      if (!payment_reference)
        return res.status(402).json({ error: 'Dati di pagamento Klarna mancanti. Riprova.' });
      try {
        await providers.verifyKlarnaOrder(String(payment_reference), expectedCents);
        paymentStatus = 'pagato';
        paymentRef = String(payment_reference);
      } catch (klErr) {
        (req.log || console).error({ err: klErr, ref: payment_reference }, 'Klarna verify error');
        return res.status(402).json({ error: 'Impossibile verificare il pagamento Klarna. Riprova.' });
      }
    }

    /* 4. Persist everything in one transaction */
    const customerId = req.customer?.id || null;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Deduct the gift card balance first — if a concurrent order already spent it below
      // what we planned to use, this conditional UPDATE's WHERE clause makes affectedRows=0
      // and we roll back cleanly before writing anything else.
      if (giftCard && giftCardAmount > 0) {
        const [gcResult] = await conn.execute(
          `UPDATE gift_cards SET balance = balance - ?, stato = IF(balance - ? <= 0, 'utilizzata', stato)
           WHERE code = ? AND balance >= ?`,
          [giftCardAmount, giftCardAmount, giftCard.code, giftCardAmount]
        );
        if (gcResult.affectedRows === 0) {
          await conn.rollback();
          return res.status(409).json({ error: 'Gift card non più disponibile, riprova.' });
        }
      }

      const orderNumber = await nextOrderNumber(conn);

      const [result] = await conn.execute(
        `INSERT INTO orders
           (order_number, customer_id, customer_nome, customer_cognome, customer_email,
            customer_telefono, shipping_address, shipping_citta, shipping_cap, shipping_paese,
            subtotal, shipping_cost, discount_amount, total, discount_code, gift_card_code,
            gift_card_amount, payment_method, payment_status, payment_intent_id, privacy_consent_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [orderNumber, customerId, nome, cognome, email, telefono || null,
         indirizzo, citta, cap, paese,
         subtotal, shippingCost, discountAmount, total,
         discountCode ? discountCode.code : null, giftCard ? giftCard.code : null,
         giftCardAmount, payment_method,
         paymentStatus, paymentRef,
         req.body.privacy_consent ? new Date() : null]
      );
      const orderId = result.insertId;

      for (const item of resolved) {
        await conn.execute(
          `INSERT INTO order_items (order_id, product_id, product_name, taglia, colore, price, qty)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [orderId, item.product_id, item.product_name, item.taglia, item.colore, item.price, item.qty]
        );
        if (item.taglia) {
          // Conditional decrement: if a concurrent order consumed the stock after
          // the pre-check, affectedRows is 0 and we roll back instead of overselling.
          const [stockRes] = await conn.execute(
            `UPDATE product_sizes SET stock = stock - ?
             WHERE product_id = ? AND taglia = ? AND stock >= ?`,
            [item.qty, item.product_id, item.taglia, item.qty]
          );
          if (stockRes.affectedRows === 0) {
            await conn.rollback();
            return res.status(409).json({
              error: `Taglia ${item.taglia} di "${item.product_name}" esaurita un attimo fa — aggiorna il carrello.`,
            });
          }
        }
      }

      if (discountCode) {
        await conn.execute('UPDATE discount_codes SET utilizzi = utilizzi + 1 WHERE id = ?', [discountCode.id]);
        await conn.execute(
          'INSERT INTO discount_usage (code_id, order_id, customer_email) VALUES (?, ?, ?)',
          [discountCode.id, orderId, email]
        );
      }

      if (customerId) {
        await conn.execute(
          'UPDATE customers SET total_orders = total_orders + 1, total_spent = total_spent + ? WHERE id = ?',
          [total, customerId]
        );
      }

      try { await awardPurchasePoints(conn, email, total, orderId); } catch (_) {}

      await conn.commit();

      // PayPal: capture NOW that the order + its atomic stock decrement are safely committed.
      // If capture fails, the order stays 'in_attesa' (buyer NOT charged) for admin/webhook
      // follow-up — the buyer is never charged without an order. On success, promote to 'pagato'
      // so the invoice fires below.
      if (paypalCaptureAfterCommit) {
        try {
          const cap = await providers.capturePaypalOrder(paymentRef);
          if (cap.status === 'COMPLETED' && cap.currency === 'EUR' && Number(cap.amountCents) === expectedCents) {
            await pool.execute("UPDATE orders SET payment_status = 'pagato' WHERE id = ?", [orderId]);
            paymentStatus = 'pagato';
          } else {
            (req.log || console).error({ orderId, cap }, 'PayPal capture after order returned an unexpected result — order left in_attesa');
          }
        } catch (capErr) {
          (req.log || console).error({ err: capErr, orderId, ref: paymentRef },
            'CRITICAL: PayPal order persisted but capture failed — order in_attesa, follow up manually');
        }
      }

      // Fiscal document must follow the payment (fire-and-forget; never blocks the order)
      if (paymentStatus === 'pagato') ensureInvoiceForOrder(pool, orderId).catch(() => {});

      sendOrderConfirmation({
        order_number: orderNumber, nome, cognome, email, items: resolved, total,
      }).catch(() => {});

      // Autorizzazione uso email dal checkout (casella facoltativa) — best-effort
      if (req.body.newsletter_optin) {
        pool.execute(
          `INSERT INTO newsletter_subscribers (email, fonte) VALUES (?, 'checkout')
           ON DUPLICATE KEY UPDATE unsubscribed = 0, subscribed_at = CURRENT_TIMESTAMP`,
          [email]
        ).catch(() => {});
      }

      return res.status(201).json({ ok: true, order_number: orderNumber, total });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    if (err && err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ error: 'Pagamento già registrato per un altro ordine.' });
    (req.log || console).error({ err }, 'place order error');
    return res.status(500).json({ error: 'Errore nel processare l\'ordine' });
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

/* ── GET /api/orders/track ── guest order lookup (no auth required) ──
   Public endpoint so customers can track without an account.
   Requires BOTH order_number and email to avoid enumeration attacks.    */
router.get('/track', async (req, res) => {
  const { number, email } = req.query;
  if (!number || !email)
    return res.status(400).json({ error: 'Inserisci numero ordine ed email.' });

  try {
    const [[order]] = await pool.execute(
      `SELECT order_number, order_status, payment_status,
              tracking_number, courier_code, shipping_citta, shipping_paese,
              subtotal, shipping_cost, discount_amount, total,
              created_at, updated_at
       FROM orders
       WHERE order_number = ? AND LOWER(customer_email) = LOWER(?)`,
      [number.trim(), email.trim()]
    );

    if (!order) return res.status(404).json({ error: 'Ordine non trovato. Verifica numero ordine e indirizzo email.' });

    /* Build courier tracking URL if available */
    let tracking_url = null;
    if (order.courier_code && order.tracking_number) {
      const [[courier]] = await pool.execute(
        'SELECT tracking_url_template FROM couriers WHERE code = ?',
        [order.courier_code]
      );
      if (courier && courier.tracking_url_template) {
        tracking_url = courier.tracking_url_template.replace(
          /\{tracking\}/gi, encodeURIComponent(order.tracking_number)
        );
      }
    }

    return res.json({ ...order, tracking_url });
  } catch (err) {
    console.error('track order error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ══════════════════════════════════════════════════════════════
   ADMIN ROUTES
   ══════════════════════════════════════════════════════════════ */

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

/* ── POST /api/admin/orders ── create a manual order from the admin panel ── */
router.post('/admin', requireAdmin, async (req, res) => {
  const {
    nome, cognome = '', email,
    telefono, indirizzo = '-', citta = '-', cap = '-', paese = 'Italia',
    items = [], shipping_cost = 0, payment_status = 'in_attesa', payment_method = 'carta',
  } = req.body;

  if (!nome || !email) return res.status(400).json({ error: 'Nome ed email obbligatori' });
  if (!Array.isArray(items) || items.length === 0)
    return res.status(400).json({ error: 'Aggiungi almeno un prodotto dal catalogo' });
  if (!PAYMENT_STATUSES.includes(payment_status))
    return res.status(400).json({ error: 'Stato pagamento non valido' });
  if (!PAYMENT_METHODS.includes(payment_method))
    return res.status(400).json({ error: 'Metodo di pagamento non valido' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Resolve every line item against the REAL catalog. The admin only chooses
    // product_id + qty (+ optional taglia); name and price are taken from the DB,
    // so they can't be faked and must reference an existing product.
    const resolved = [];
    for (const it of items) {
      if (!it || !it.product_id) {
        await conn.rollback();
        return res.status(400).json({ error: 'Ogni articolo deve essere un prodotto del catalogo' });
      }
      const [[prod]] = await conn.execute(
        'SELECT id, name, price FROM products WHERE id = ?', [it.product_id]
      );
      if (!prod) {
        await conn.rollback();
        return res.status(400).json({ error: `Prodotto non trovato in catalogo: ${it.product_id}` });
      }
      resolved.push({
        product_id:   prod.id,
        product_name: prod.name,
        price:        Number(prod.price) || 0,
        qty:          parseInt(it.qty) || 1,
        taglia:       it.taglia || null,
        colore:       it.colore || null,
      });
    }

    const subtotal = resolved.reduce((s, i) => s + i.price * i.qty, 0);
    const ship     = Number(shipping_cost) || 0;
    const total    = Math.max(0, subtotal + ship);
    const orderNumber = await nextOrderNumber(conn);

    const [result] = await conn.execute(
      `INSERT INTO orders
         (order_number, customer_id, customer_nome, customer_cognome, customer_email,
          customer_telefono, shipping_address, shipping_citta, shipping_cap, shipping_paese,
          subtotal, shipping_cost, discount_amount, total, payment_method, payment_status, order_status)
       VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 'in_preparazione')`,
      [orderNumber, nome, cognome, email, telefono || null,
       indirizzo, citta, cap, paese, subtotal, ship, total, payment_method, payment_status]
    );
    const orderId = result.insertId;

    for (const item of resolved) {
      await conn.execute(
        `INSERT INTO order_items (order_id, product_id, product_name, taglia, colore, price, qty)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [orderId, item.product_id, item.product_name, item.taglia, item.colore, item.price, item.qty]
      );
      // Decrement stock when a size is specified (allow it to floor at 0)
      if (item.taglia) {
        await conn.execute(
          'UPDATE product_sizes SET stock = GREATEST(0, stock - ?) WHERE product_id = ? AND taglia = ?',
          [item.qty, item.product_id, item.taglia]
        );
      }
    }

    // Award loyalty points for the purchase (if the email matches a customer).
    // Pass orderId so the ledger row is tied to this order and reverseOrderPoints() can
    // undo it on cancel/refund (previously omitted here → admin-order points were unreversible).
    try { await awardPurchasePoints(conn, email, total, orderId); } catch (_) {}

    await conn.commit();

    if (payment_status === 'pagato') ensureInvoiceForOrder(pool, orderId).catch(() => {});

    return res.status(201).json({ ok: true, id: orderId, order_number: orderNumber, total });
  } catch (err) {
    await conn.rollback();
    (req.log || console).error({ err }, 'admin create order error');
    return res.status(500).json({ error: 'Errore nella creazione ordine' });
  } finally {
    conn.release();
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
  if (order_status && !ORDER_STATUSES.includes(order_status))
    return res.status(400).json({ error: 'Stato ordine non valido' });
  if (payment_status && !PAYMENT_STATUSES.includes(payment_status))
    return res.status(400).json({ error: 'Stato pagamento non valido' });
  if (!order_status && !payment_status)
    return res.status(400).json({ error: 'Nessun campo da aggiornare' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[order]] = await conn.execute(
      'SELECT * FROM orders WHERE id = ? FOR UPDATE', [req.params.id]
    );
    if (!order) { await conn.rollback(); return res.status(404).json({ error: 'Ordine non trovato' }); }

    // Business rule: an annulled order stays annulled — its stock, gift card and
    // discount were already given back; re-activating would corrupt the inventory.
    if (order.order_status === 'annullato' && order_status && order_status !== 'annullato') {
      await conn.rollback();
      return res.status(409).json({ error: 'Ordine annullato: non può essere riattivato. Crea un nuovo ordine.' });
    }

    const cancelling = order_status === 'annullato' && order.order_status !== 'annullato';
    if (cancelling && order.payment_status !== 'rimborsato') {
      // Put everything back: stock, gift-card balance, discount redemption,
      // loyalty points and the customer's totals. (Skipped when a refund via
      // Resi already compensated this order.)
      await compensateOrder(conn, order, 'cancel');
    }

    const fields = [];
    const vals   = [];
    if (order_status)   { fields.push('order_status = ?');   vals.push(order_status); }
    if (payment_status) { fields.push('payment_status = ?'); vals.push(payment_status); }
    vals.push(req.params.id);
    await conn.execute(`UPDATE orders SET ${fields.join(', ')} WHERE id = ?`, vals);
    await conn.commit();

    if (payment_status === 'pagato' && order.payment_status !== 'pagato')
      ensureInvoiceForOrder(pool, order.id).catch(() => {});

    logAdminAction({
      adminId: req.admin.id, adminEmail: req.admin.email,
      action: cancelling ? 'order.cancel' : 'order.status_update',
      entityType: 'order', entityId: req.params.id, details: { order_status, payment_status },
    }).catch(() => {});
    // Fire marketing automations for this transition (best-effort, never blocks).
    try { require('../automations').runOrderStatusAutomations(pool, order.id, { order_status, payment_status }); } catch (_) {}
    return res.json({ ok: true, cancelled: !!cancelling });
  } catch (err) {
    await conn.rollback();
    (req.log || console).error({ err }, 'update order status error');
    return res.status(500).json({ error: 'Errore server' });
  } finally {
    conn.release();
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
              order_status = 'spedito'
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

    logAdminAction({
      adminId: req.admin.id, adminEmail: req.admin.email, action: 'order.ship',
      entityType: 'order', entityId: req.params.id, details: { courier_code, tracking_number, eta, destinazione },
    }).catch(() => {});
    // Order just became 'spedito' → fire automations (best-effort, never blocks).
    try { require('../automations').runOrderStatusAutomations(pool, req.params.id, { order_status: 'spedito' }); } catch (_) {}

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
    (req.log || console).error({ err }, 'ship order error');
    return res.status(500).json({ error: 'Errore server' });
  } finally {
    conn.release();
  }
});

/* ── POST /api/orders/admin/:id/send-tracking ──
   Re-send the shipping/tracking email to the customer (admin action). */
router.post('/admin/:id/send-tracking', requireAdmin, async (req, res) => {
  try {
    const [[o]] = await pool.execute(
      `SELECT o.order_number, o.customer_nome AS nome, o.customer_email AS email,
              o.courier_code, o.tracking_number, s.eta, c.tracking_url_template
         FROM orders o
         LEFT JOIN shipments s ON s.order_id = o.id
         LEFT JOIN couriers  c ON c.code = o.courier_code
        WHERE o.id = ?`,
      [req.params.id]
    );
    if (!o) return res.status(404).json({ error: 'Ordine non trovato' });
    if (!o.tracking_number)
      return res.status(400).json({ error: "Ordine senza tracking: spedisci prima l'ordine" });

    const tracking_url = o.tracking_url_template
      ? o.tracking_url_template.replace('{tracking}', encodeURIComponent(o.tracking_number))
      : null;

    await sendShippingConfirmation({
      order_number: o.order_number, nome: o.nome, email: o.email,
      courier_code: o.courier_code, tracking_number: o.tracking_number,
      eta: o.eta, tracking_url,
    });

    logAdminAction({
      adminId: req.admin.id, adminEmail: req.admin.email, action: 'order.send_tracking',
      entityType: 'order', entityId: req.params.id, details: { tracking_number: o.tracking_number },
    }).catch(() => {});

    return res.json({ ok: true, sent_to: o.email });
  } catch (err) {
    (req.log || console).error({ err }, 'send-tracking error');
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── DELETE /api/orders/admin/:id ── */
router.delete('/admin/:id', requireAdmin, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[order]] = await conn.execute(
      'SELECT * FROM orders WHERE id = ? FOR UPDATE', [req.params.id]
    );
    if (!order) { await conn.rollback(); return res.status(404).json({ error: 'Ordine non trovato' }); }

    // Give stock / gift card / discount / points back UNLESS a cancel or a
    // refund already did (those flows compensate when they run).
    let compensated = false;
    if (order.order_status !== 'annullato' && order.payment_status !== 'rimborsato') {
      await compensateOrder(conn, order, 'cancel');
      compensated = true;
    }

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
    logAdminAction({
      adminId: req.admin.id, adminEmail: req.admin.email, action: 'order.delete',
      entityType: 'order', entityId: req.params.id,
      details: { order_number: order.order_number, compensated },
    }).catch(() => {});
    return res.json({ ok: true, message: 'Ordine eliminato' });
  } catch (err) {
    await conn.rollback();
    (req.log || console).error({ err }, 'delete order error');
    return res.status(500).json({ error: 'Errore server' });
  } finally {
    conn.release();
  }
});

/* ── POST /api/orders/validate-discount ── */
router.post('/validate-discount', async (req, res) => {
  const { code, subtotal = 0, email } = req.body;
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

    // Optional: if the caller already knows the customer's email at preview time, give
    // an accurate preview of the per-email limit enforced for real in POST /api/orders.
    if (email) {
      const [[alreadyUsed]] = await pool.execute(
        'SELECT id FROM discount_usage WHERE code_id = ? AND customer_email = ? LIMIT 1',
        [dc.id, String(email).toLowerCase().trim()]
      );
      if (alreadyUsed) return res.status(400).json({ error: 'Hai già utilizzato questo codice sconto' });
    }

    const dcValore   = Number(dc.valore);
    const dcMinOrder = Number(dc.min_order) || 0;
    const sub        = Number(subtotal) || 0;
    if (dcMinOrder > 0 && sub < dcMinOrder)
      return res.status(400).json({ error: `Ordine minimo EUR${dcMinOrder.toFixed(2)} per questo codice` });

    let discountAmount = 0;
    let freeShipping   = false;
    if (dc.tipo === 'percentuale')  discountAmount = sub * (dcValore / 100);
    else if (dc.tipo === 'fisso')   discountAmount = Math.min(dcValore, sub);
    else if (dc.tipo === 'spedizione') freeShipping = true;

    return res.json({
      ok: true,
      code: dc.code,
      tipo: dc.tipo,
      valore: dcValore,
      discount_amount: discountAmount,
      free_shipping: freeShipping,
      label: dc.tipo === 'percentuale'
        ? `${dcValore}% di sconto`
        : dc.tipo === 'fisso'
          ? `EUR ${dcValore.toFixed(2)} di sconto`
          : 'Spedizione gratuita',
    });
  } catch (err) {
    console.error('validate discount error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

module.exports = router;
