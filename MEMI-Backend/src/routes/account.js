'use strict';

/**
 * /api/auth  — Customer "Area Personale" resources (mounted alongside auth.js)
 *
 *  Wishlist
 *    GET    /api/auth/wishlist            Return the saved wishlist array
 *    PUT    /api/auth/wishlist            Replace the wishlist array
 *
 *  Addresses
 *    GET    /api/auth/addresses           List saved shipping addresses
 *    POST   /api/auth/addresses           Create a new address
 *    PUT    /api/auth/addresses/:id       Update an address
 *    DELETE /api/auth/addresses/:id       Delete an address
 *    PUT    /api/auth/addresses/:id/default   Make an address the default
 *
 *  Newsletter (per logged-in customer)
 *    GET    /api/auth/newsletter          Subscription status + settings
 *    PUT    /api/auth/newsletter          Subscribe/unsubscribe + frequenza/topics
 *
 * All routes require a valid customer JWT (requireCustomer).
 * Profile scalars + sizes/preferences/lang live on /api/auth/me (see auth.js);
 * this router covers the relational + JSON-list resources.
 */

const router = require('express').Router();
const { pool }            = require('../db');
const { requireCustomer } = require('../middleware/auth');

const FREQ = ['weekly', 'biweekly', 'monthly'];

/* ═══════════════════ WISHLIST ═══════════════════ */

router.get('/wishlist', requireCustomer, async (req, res) => {
  try {
    const [[row]] = await pool.execute('SELECT wishlist FROM customers WHERE id = ?', [req.customer.id]);
    return res.json({ items: (row && row.wishlist) || [] });
  } catch (err) {
    console.error('wishlist get error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

router.put('/wishlist', requireCustomer, async (req, res) => {
  const items = req.body && req.body.items;
  if (!Array.isArray(items))
    return res.status(400).json({ error: 'items deve essere un array' });
  // Cap to a sane size so a malformed client can't bloat the row.
  const safe = items.slice(0, 500);
  try {
    await pool.execute('UPDATE customers SET wishlist = ? WHERE id = ?', [JSON.stringify(safe), req.customer.id]);
    return res.json({ ok: true, count: safe.length });
  } catch (err) {
    console.error('wishlist put error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ═══════════════════ CART ═══════════════════ */
/* Same shape as the wishlist: a JSON array of line items on customers.cart.
   Lets the basket survive logout→login and follow the customer across devices. */

router.get('/cart', requireCustomer, async (req, res) => {
  try {
    const [[row]] = await pool.execute('SELECT cart FROM customers WHERE id = ?', [req.customer.id]);
    return res.json({ items: (row && row.cart) || [] });
  } catch (err) {
    console.error('cart get error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

router.put('/cart', requireCustomer, async (req, res) => {
  const items = req.body && req.body.items;
  if (!Array.isArray(items))
    return res.status(400).json({ error: 'items deve essere un array' });
  const safe = items.slice(0, 200);
  try {
    await pool.execute('UPDATE customers SET cart = ? WHERE id = ?', [JSON.stringify(safe), req.customer.id]);
    return res.json({ ok: true, count: safe.length });
  } catch (err) {
    console.error('cart put error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ═══════════════════ ADDRESSES ═══════════════════ */

function cleanAddr(b) {
  // Trim, coerce to string|null, AND bound the length (defense in depth: these are
  // customer-supplied and land in the DB — cap them so an oversized payload can't
  // bloat a row or trip a column limit). 120 chars is well beyond any real address field.
  const s = (v) => {
    const t = (typeof v === 'string' ? v.trim() : '');
    return t ? t.slice(0, 120) : null;
  };
  return {
    label:           s(b.label),
    indirizzo:       s(b.indirizzo),        // via / street
    numero_civico:   s(b.numero_civico),
    piano:           s(b.piano),
    nome_campanello: s(b.nome_campanello),
    citta:           s(b.citta),
    cap:             s(b.cap),
    paese:           s(b.paese) || 'Italia',
    telefono:        s(b.telefono),
  };
}

router.get('/addresses', requireCustomer, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, label, indirizzo, numero_civico, piano, nome_campanello,
              citta, cap, paese, telefono, is_default
       FROM customer_addresses WHERE customer_id = ?
       ORDER BY is_default DESC, id ASC`,
      [req.customer.id]
    );
    return res.json({ addresses: rows });
  } catch (err) {
    console.error('addresses list error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

router.post('/addresses', requireCustomer, async (req, res) => {
  const a = cleanAddr(req.body || {});
  const wantDefault = !!(req.body && req.body.is_default);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // First address for this customer is always the default.
    const [[{ cnt }]] = await conn.execute(
      'SELECT COUNT(*) AS cnt FROM customer_addresses WHERE customer_id = ?', [req.customer.id]
    );
    const makeDefault = wantDefault || cnt === 0;
    if (makeDefault) {
      await conn.execute('UPDATE customer_addresses SET is_default = 0 WHERE customer_id = ?', [req.customer.id]);
    }
    const [result] = await conn.execute(
      `INSERT INTO customer_addresses (customer_id, label, indirizzo, numero_civico, piano, nome_campanello, citta, cap, paese, telefono, is_default)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.customer.id, a.label, a.indirizzo, a.numero_civico, a.piano, a.nome_campanello, a.citta, a.cap, a.paese, a.telefono, makeDefault ? 1 : 0]
    );
    if (makeDefault) await syncDefaultToProfile(conn, req.customer.id, a);
    await conn.commit();
    return res.status(201).json({ ok: true, id: result.insertId });
  } catch (err) {
    await conn.rollback();
    console.error('address create error', err);
    return res.status(500).json({ error: 'Errore server' });
  } finally {
    conn.release();
  }
});

router.put('/addresses/:id', requireCustomer, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'ID non valido' });
  const a = cleanAddr(req.body || {});
  try {
    const [result] = await pool.execute(
      `UPDATE customer_addresses
       SET label = ?, indirizzo = ?, numero_civico = ?, piano = ?, nome_campanello = ?,
           citta = ?, cap = ?, paese = ?, telefono = ?
       WHERE id = ? AND customer_id = ?`,
      [a.label, a.indirizzo, a.numero_civico, a.piano, a.nome_campanello, a.citta, a.cap, a.paese, a.telefono, id, req.customer.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Indirizzo non trovato' });
    // Keep the profile's single address mirror in sync if this is the default one.
    const [[row]] = await pool.execute(
      'SELECT is_default FROM customer_addresses WHERE id = ? AND customer_id = ?', [id, req.customer.id]
    );
    if (row && row.is_default) await syncDefaultToProfile(pool, req.customer.id, a);
    return res.json({ ok: true });
  } catch (err) {
    console.error('address update error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

router.delete('/addresses/:id', requireCustomer, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'ID non valido' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[row]] = await conn.execute(
      'SELECT is_default FROM customer_addresses WHERE id = ? AND customer_id = ?', [id, req.customer.id]
    );
    if (!row) { await conn.rollback(); return res.status(404).json({ error: 'Indirizzo non trovato' }); }
    await conn.execute('DELETE FROM customer_addresses WHERE id = ? AND customer_id = ?', [id, req.customer.id]);
    // If we removed the default, promote the next-oldest address to default.
    if (row.is_default) {
      const [[next]] = await conn.execute(
        'SELECT id FROM customer_addresses WHERE customer_id = ? ORDER BY id ASC LIMIT 1', [req.customer.id]
      );
      if (next) await conn.execute('UPDATE customer_addresses SET is_default = 1 WHERE id = ?', [next.id]);
    }
    await conn.commit();
    return res.json({ ok: true });
  } catch (err) {
    await conn.rollback();
    console.error('address delete error', err);
    return res.status(500).json({ error: 'Errore server' });
  } finally {
    conn.release();
  }
});

router.put('/addresses/:id/default', requireCustomer, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'ID non valido' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[row]] = await conn.execute(
      'SELECT id, label, indirizzo, numero_civico, citta, cap, paese, telefono FROM customer_addresses WHERE id = ? AND customer_id = ?',
      [id, req.customer.id]
    );
    if (!row) { await conn.rollback(); return res.status(404).json({ error: 'Indirizzo non trovato' }); }
    await conn.execute('UPDATE customer_addresses SET is_default = 0 WHERE customer_id = ?', [req.customer.id]);
    await conn.execute('UPDATE customer_addresses SET is_default = 1 WHERE id = ? AND customer_id = ?', [id, req.customer.id]);
    await syncDefaultToProfile(conn, req.customer.id, row);
    await conn.commit();
    return res.json({ ok: true });
  } catch (err) {
    await conn.rollback();
    console.error('address default error', err);
    return res.status(500).json({ error: 'Errore server' });
  } finally {
    conn.release();
  }
});

// Mirror the default address onto customers.* so checkout pre-fill keeps working.
async function syncDefaultToProfile(execer, customerId, a) {
  try {
    // Combine "via" + civic number into the profile's single address line so
    // checkout pre-fill (which reads customers.indirizzo) gets a complete address.
    const street = [a.indirizzo, a.numero_civico].filter(Boolean).join(', ') || a.indirizzo || null;
    await execer.execute(
      'UPDATE customers SET indirizzo = ?, citta = ?, cap = ?, paese = ? WHERE id = ?',
      [street, a.citta || null, a.cap || null, a.paese || 'Italia', customerId]
    );
  } catch (_) { /* non-fatal mirror */ }
}

/* ═══════════════════ NEWSLETTER ═══════════════════ */

async function customerEmail(id) {
  const [[row]] = await pool.execute('SELECT email FROM customers WHERE id = ?', [id]);
  return row ? row.email : null;
}

router.get('/newsletter', requireCustomer, async (req, res) => {
  try {
    const email = await customerEmail(req.customer.id);
    if (!email) return res.status(404).json({ error: 'Utente non trovato' });
    const [[row]] = await pool.execute(
      'SELECT frequenza, topics, unsubscribed FROM newsletter_subscribers WHERE email = ?', [email]
    );
    return res.json({
      subscribed: !!(row && row.unsubscribed === 0),
      frequenza:  (row && row.frequenza) || 'biweekly',
      topics:     (row && row.topics)    || [],
    });
  } catch (err) {
    console.error('newsletter get error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

router.put('/newsletter', requireCustomer, async (req, res) => {
  const b = req.body || {};
  const subscribed = b.subscribed !== false; // default true
  const frequenza  = FREQ.includes(b.frequenza) ? b.frequenza : 'biweekly';
  const topics     = Array.isArray(b.topics) ? b.topics.slice(0, 20) : [];
  try {
    const email = await customerEmail(req.customer.id);
    if (!email) return res.status(404).json({ error: 'Utente non trovato' });
    await pool.execute(
      `INSERT INTO newsletter_subscribers (email, fonte, customer_id, frequenza, topics, unsubscribed)
       VALUES (?, 'account', ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         customer_id = VALUES(customer_id),
         frequenza   = VALUES(frequenza),
         topics      = VALUES(topics),
         unsubscribed = VALUES(unsubscribed)`,
      [email, req.customer.id, frequenza, JSON.stringify(topics), subscribed ? 0 : 1]
    );
    return res.json({ ok: true, subscribed, frequenza, topics });
  } catch (err) {
    console.error('newsletter put error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

module.exports = router;
