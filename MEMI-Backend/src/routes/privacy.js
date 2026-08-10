'use strict';

/**
 * /api/auth — GDPR data-subject rights for the logged-in customer.
 *
 *   GET    /api/auth/me/export   Art. 15 + 20 — access & portability (JSON download)
 *   DELETE /api/auth/me          Art. 17 — erasure ("right to be forgotten")
 *
 * ── Why erasure is not a plain DELETE of everything ──────────────────────────
 * Art. 17(3)(b) GDPR carves out processing required to comply with a legal
 * obligation. In Italy, sales documents must be retained for ten years
 * (art. 2220 c.c.; DPR 633/72 for VAT). So an order — and its fiscal name/address
 * snapshot — cannot be destroyed on request.
 *
 * What this endpoint therefore does:
 *   • deletes the ACCOUNT and everything that is purely account data
 *     (profile, saved addresses, wishlist/cart, chat, abandoned carts, loyalty
 *     ledger, newsletter subscription, marketing idempotency rows);
 *   • pseudonymises the customer's public reviews (they stay, the identity goes);
 *   • LEAVES orders and invoices in place, detached from the account
 *     (orders.customer_id is ON DELETE SET NULL), which is the lawful minimum.
 *
 * The customer is told exactly this before confirming, and the privacy policy
 * says the same — an erasure request that silently kept more than it admitted
 * would be worse than not offering one.
 */

const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const { pool } = require('../db');
const { requireCustomer } = require('../middleware/auth');

/** Tables that may not exist on an older deployment — a missing one must not 500. */
async function tryExec(conn, sql, params = []) {
  try {
    const [r] = await conn.execute(sql, params);
    return r;
  } catch (err) {
    if (err.code === 'ER_NO_SUCH_TABLE' || err.code === 'ER_BAD_FIELD_ERROR') return null;
    throw err;
  }
}
async function tryQuery(sql, params = []) {
  try {
    const [rows] = await pool.execute(sql, params);
    return rows;
  } catch (err) {
    if (err.code === 'ER_NO_SUCH_TABLE' || err.code === 'ER_BAD_FIELD_ERROR') return [];
    throw err;
  }
}

/* ── GET /api/auth/me/export ──────────────────────────────────────────────────
 * Everything the shop holds about this person, in one machine-readable file
 * (art. 20 requires a "structured, commonly used, machine-readable format").
 * Served as an attachment so the browser downloads rather than renders it. */
router.get('/me/export', requireCustomer, async (req, res) => {
  const id = req.customer.id;
  try {
    // SELECT * rather than a column list: marketing_consent / birthday are added by
    // migrations, so an explicit list would 500 on a deployment that hasn't run them.
    const [[row]] = await pool.execute('SELECT * FROM customers WHERE id = ?', [id]);
    if (!row) return res.status(404).json({ error: 'Account non trovato' });
    const { password_hash: _pw, ...customer } = row;   // never export the hash

    const addresses = await tryQuery('SELECT * FROM customer_addresses WHERE customer_id = ?', [id]);

    const orders = await tryQuery(
      'SELECT * FROM orders WHERE customer_id = ? OR customer_email = ? ORDER BY created_at DESC',
      [id, customer.email]);
    for (const o of orders) {
      o.items = await tryQuery('SELECT product_id, product_name, taglia, colore, price, qty FROM order_items WHERE order_id = ?', [o.id]);
    }

    const reviews  = await tryQuery('SELECT id, product_id, rating, titolo, testo, stato, created_at FROM reviews WHERE customer_id = ? OR customer_email = ?', [id, customer.email]);
    const resi     = await tryQuery('SELECT * FROM resi WHERE customer_email = ?', [customer.email]);
    const loyalty  = await tryQuery('SELECT * FROM loyalty_transactions WHERE customer_id = ?', [id]);
    const news     = await tryQuery('SELECT email, fonte, frequenza, topics, subscribed_at, unsubscribed FROM newsletter_subscribers WHERE email = ?', [customer.email]);
    const chats    = await tryQuery('SELECT id, subject, status, created_at FROM conversations WHERE customer_id = ? OR guest_email = ?', [id, customer.email]);
    for (const c of chats) {
      c.messages = await tryQuery('SELECT sender, body, created_at FROM messages WHERE conversation_id = ? ORDER BY id ASC', [c.id]);
    }
    const emails   = await tryQuery('SELECT type, dedup_key, created_at FROM email_events WHERE customer_id = ? OR email = ?', [id, customer.email]);

    const payload = {
      _meta: {
        generato_il: new Date().toISOString(),
        descrizione: 'Esportazione dei dati personali ai sensi degli artt. 15 e 20 del Regolamento (UE) 2016/679 (GDPR).',
        titolare: process.env.COMPANY_NAME || 'Memi Abbigliamento',
      },
      profilo: customer,
      indirizzi: addresses,
      ordini: orders,
      recensioni: reviews,
      resi,
      punti_fedelta: loyalty,
      newsletter: news,
      conversazioni: chats,
      email_inviate: emails,
    };

    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="memi-dati-${id}-${stamp}.json"`);
    return res.send(JSON.stringify(payload, null, 2));
  } catch (err) {
    (req.log || console).error({ err }, 'gdpr export');
    return res.status(500).json({ error: 'Errore durante l’esportazione dei dati' });
  }
});

/* ── DELETE /api/auth/me ──────────────────────────────────────────────────────
 * Password re-confirmation is required: a stolen/borrowed session must not be
 * able to destroy an account, and this is irreversible. */
router.delete('/me', requireCustomer, async (req, res) => {
  const id = req.customer.id;
  const password = (req.body && req.body.password) || '';
  if (!password) return res.status(400).json({ error: 'Password richiesta per confermare l’eliminazione' });

  try {
    const [[customer]] = await pool.execute('SELECT id, email, password_hash FROM customers WHERE id = ?', [id]);
    if (!customer) return res.status(404).json({ error: 'Account non trovato' });

    const ok = await bcrypt.compare(String(password), customer.password_hash);
    if (!ok) return res.status(401).json({ error: 'Password non corretta' });

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Public content stays, identity does not.
      await tryExec(conn,
        "UPDATE reviews SET customer_id = NULL, customer_nome = 'Utente eliminato', customer_email = NULL WHERE customer_id = ? OR customer_email = ?",
        [id, customer.email]);

      // Pure account/marketing data — removed outright.
      await tryExec(conn, 'DELETE FROM customer_addresses WHERE customer_id = ?', [id]);
      await tryExec(conn, 'DELETE FROM loyalty_transactions WHERE customer_id = ?', [id]);
      await tryExec(conn, 'DELETE FROM newsletter_subscribers WHERE email = ?', [customer.email]);
      await tryExec(conn, 'DELETE FROM email_events WHERE customer_id = ? OR email = ?', [id, customer.email]);
      await tryExec(conn, 'DELETE FROM carts WHERE customer_id = ? OR email = ?', [id, customer.email]);

      // Chat: messages first (no FK cascade defined on that table).
      const convs = await tryQuery('SELECT id FROM conversations WHERE customer_id = ? OR guest_email = ?', [id, customer.email]);
      for (const c of convs) await tryExec(conn, 'DELETE FROM messages WHERE conversation_id = ?', [c.id]);
      await tryExec(conn, 'DELETE FROM conversations WHERE customer_id = ? OR guest_email = ?', [id, customer.email]);

      // Orders are deliberately NOT deleted (see header). The FK on orders.customer_id
      // is ON DELETE SET NULL, so removing the account detaches them automatically.
      await conn.execute('DELETE FROM customers WHERE id = ?', [id]);

      await conn.commit();
    } catch (txErr) {
      await conn.rollback();
      throw txErr;
    } finally {
      conn.release();
    }

    (req.log || console).info({ customerId: id }, '[gdpr] account erased');
    return res.json({
      ok: true,
      message: 'Account eliminato. Gli ordini già emessi restano registrati in forma anonima per obblighi fiscali (10 anni).',
    });
  } catch (err) {
    (req.log || console).error({ err }, 'gdpr erase');
    return res.status(500).json({ error: 'Errore durante l’eliminazione dell’account' });
  }
});

module.exports = router;
