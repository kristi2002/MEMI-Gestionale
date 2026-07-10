'use strict';

/**
 * order-compensation.js — undo an order's side effects.
 * ──────────────────────────────────────────────────────
 * An order, when created, moves four things besides its own rows:
 *   stock (product_sizes), gift-card balance, discount-code usage,
 *   loyalty points, and the customer's denormalized totals.
 * Cancelling, deleting or refunding the order must move them back —
 * otherwise inventory leaks and codes/cards lose value permanently.
 *
 * Used by: PUT /orders/admin/:id/status (annullato), DELETE /orders/admin/:id,
 *          PUT /admin/resi/:id (stato→rimborsato), POST /admin/resi/:id/refund.
 *
 * All functions expect an OPEN TRANSACTION connection; callers commit/rollback.
 * Callers must guard against double-compensation with a status-transition check
 * (an order already 'annullato' or 'rimborsato' has been compensated already).
 */

const { reverseOrderPoints } = require('./loyalty');

/** Put every ordered size back in stock (mirrors the decrement at creation,
 *  which only happens for lines with a taglia). Returns #items examined. */
async function restockItems(conn, orderId) {
  const [items] = await conn.execute(
    'SELECT product_id, taglia, qty FROM order_items WHERE order_id = ?', [orderId]
  );
  for (const it of items) {
    if (!it.taglia) continue;
    await conn.execute(
      'UPDATE product_sizes SET stock = stock + ? WHERE product_id = ? AND taglia = ?',
      [it.qty, it.product_id, it.taglia]
    );
  }
  return items.length;
}

/** Refund the gift-card portion back onto the card, re-activating a card that
 *  was fully depleted by this order. (MySQL evaluates SET left→right, so the
 *  IF sees the NEW balance.) */
async function restoreGiftCard(conn, order) {
  const amount = Number(order.gift_card_amount) || 0;
  if (!order.gift_card_code || amount <= 0) return false;
  await conn.execute(
    `UPDATE gift_cards
        SET balance = balance + ?,
            stato   = IF(stato = 'utilizzata' AND balance > 0, 'attiva', stato)
      WHERE code = ?`,
    [amount, order.gift_card_code]
  );
  return true;
}

/** Free the discount-code redemption: global counter AND the per-email row
 *  (so the customer can legitimately use the code on a replacement order). */
async function releaseDiscount(conn, order) {
  if (!order.discount_code) return false;
  const [[dc]] = await conn.execute(
    'SELECT id FROM discount_codes WHERE code = ?', [order.discount_code]
  );
  if (!dc) return false;
  await conn.execute(
    'UPDATE discount_codes SET utilizzi = GREATEST(0, utilizzi - 1) WHERE id = ?', [dc.id]
  );
  await conn.execute(
    'DELETE FROM discount_usage WHERE code_id = ? AND order_id = ?', [dc.id, order.id]
  );
  return true;
}

/** Roll back the customer's denormalized counters.
 *  mode 'full'  → cancel: the order never happened (-1 ordini, -total speso)
 *  mode 'spent' → refund: the order stands, the money went back (-total speso) */
async function rollbackCustomerTotals(conn, order, mode) {
  if (!order.customer_id) return false;
  if (mode === 'full') {
    await conn.execute(
      `UPDATE customers SET total_orders = GREATEST(0, total_orders - 1),
                            total_spent  = GREATEST(0, total_spent - ?)
        WHERE id = ?`,
      [Number(order.total) || 0, order.customer_id]
    );
  } else {
    await conn.execute(
      'UPDATE customers SET total_spent = GREATEST(0, total_spent - ?) WHERE id = ?',
      [Number(order.total) || 0, order.customer_id]
    );
  }
  return true;
}

/**
 * Undo an order's side effects inside an open transaction.
 *   kind 'cancel' — order never fulfilled: restock + gift card + FREE the
 *                   discount + reverse points + (-1 ordini, -speso)
 *   kind 'refund' — goods returned after fulfilment: restock + gift card +
 *                   reverse points + (-speso); the discount stays consumed.
 * Loyalty reversal is ledger-based (nets to zero on a repeat call); the other
 * steps rely on the caller's status-transition guard for idempotence.
 * NOTE: this performs a FULL reversal — call it only for full refunds/cancels.
 * PARTIAL refunds are handled by the caller (resi.js), which skips this and only
 * reduces the customer's total speso by the refunded amount (we can't know which
 * items came back), leaving inventory for the admin to adjust manually.
 */
async function compensateOrder(conn, order, kind) {
  const restocked = await restockItems(conn, order.id);
  await restoreGiftCard(conn, order);
  if (kind === 'cancel') await releaseDiscount(conn, order);
  try {
    await reverseOrderPoints(conn, order.id, kind === 'cancel' ? 'storno annullamento' : 'storno rimborso');
  } catch (_) { /* loyalty tables may not exist on very old volumes — never block the flow */ }
  await rollbackCustomerTotals(conn, order, kind === 'cancel' ? 'full' : 'spent');
  return { restocked };
}

module.exports = { compensateOrder, restockItems, restoreGiftCard, releaseDiscount, rollbackCustomerTotals };
