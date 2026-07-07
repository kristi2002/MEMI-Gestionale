'use strict';

/**
 * invoicing.js — automatic invoice emission.
 * ──────────────────────────────────────────
 * The moment an order's payment becomes 'pagato' an invoice must exist —
 * otherwise revenue is recorded with no fiscal document behind it. Called from:
 *   • POST /api/orders            (checkout verified via Stripe / fully gift-card paid)
 *   • POST /api/orders/admin      (admin creates an already-paid order)
 *   • PUT  /api/orders/admin/:id/status  (payment_status → pagato)
 *   • Stripe webhook payment_intent.succeeded (late reconciliation)
 *
 * Opt-out: store_settings key `auto_invoice` = '0' (default on).
 * VAT model mirrors POST /api/admin/invoices: prices are IVA-inclusive (22%),
 * imponibile = totale / 1.22, IVA extracted from the gross.
 * Idempotent: skips if the order already has an invoice; retries once on a
 * concurrent numbering collision.
 */

async function ensureInvoiceForOrder(db, orderId) {
  try {
    try {
      const [rows] = await db.execute(
        "SELECT `value` FROM store_settings WHERE `key` = 'auto_invoice'"
      );
      if (rows.length && String(rows[0].value) === '0') return null;
    } catch (_) { /* settings table missing → default ON */ }

    const [[order]] = await db.execute('SELECT * FROM orders WHERE id = ?', [orderId]);
    if (!order || order.payment_status !== 'pagato') return null;

    const [[existing]] = await db.execute(
      'SELECT id FROM invoices WHERE order_id = ? LIMIT 1', [orderId]
    );
    if (existing) return null;

    const grossTotal = parseFloat(order.total) || 0;
    const rate       = 22;
    const imponibile = +(grossTotal / (1 + rate / 100)).toFixed(2);
    const tax_amount = +(grossTotal - imponibile).toFixed(2);
    const indirizzo  = `${order.shipping_address}, ${order.shipping_citta} ${order.shipping_cap}, ${order.shipping_paese}`;

    for (let attempt = 0; attempt < 2; attempt++) {
      const year = new Date().getFullYear();
      const [[{ last_n }]] = await db.execute(
        `SELECT MAX(CAST(SUBSTRING_INDEX(invoice_number, '-', -1) AS UNSIGNED)) AS last_n
           FROM invoices WHERE invoice_number LIKE ?`,
        [`F-${year}-%`]
      );
      const invoice_number = `F-${year}-${String((last_n || 0) + 1).padStart(4, '0')}`;
      try {
        await db.execute(
          `INSERT INTO invoices
             (invoice_number, order_id, customer_nome, customer_cognome, customer_email,
              indirizzo, subtotal, tax_rate, tax_amount, total, stato, note)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'emessa', ?)`,
          [invoice_number, orderId, order.customer_nome, order.customer_cognome,
           order.customer_email, indirizzo, imponibile, rate, tax_amount, grossTotal,
           'Emessa automaticamente al pagamento']
        );
        return invoice_number;
      } catch (err) {
        if (err && err.code === 'ER_DUP_ENTRY' && attempt === 0) continue; // number race → retry once
        if (err && err.code === 'ER_DUP_ENTRY') return null;               // order already invoiced
        throw err;
      }
    }
    return null;
  } catch (err) {
    console.error(`[invoicing] auto-invoice failed for order ${orderId}:`, err.message);
    return null; // an invoice problem must never break payment/order flows
  }
}

module.exports = { ensureInvoiceForOrder };
