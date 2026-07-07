'use strict';

/**
 * /api/chat — public customer/guest chat (storefront widget).
 *
 * POST /api/chat/message   { token?, name?, email?, body }  → append (create if no token)
 * GET  /api/chat/messages?token=...                          → messages + status
 *
 * A conversation is identified by an opaque token handed back on first message
 * and kept in the visitor's localStorage. Logged-in customers are linked too.
 */

const crypto = require('crypto');
const router = require('express').Router();
const { pool } = require('../db');
const { optionalCustomer } = require('../middleware/auth');

function newToken() { return crypto.randomBytes(24).toString('hex'); }

/* ── POST /api/chat/message ── */
router.post('/message', optionalCustomer, async (req, res) => {
  const b = req.body || {};
  const body = (b.body || '').toString().trim();
  if (!body) return res.status(400).json({ error: 'Messaggio vuoto' });
  if (body.length > 4000) return res.status(400).json({ error: 'Messaggio troppo lungo' });

  const customerId = (req.customer && req.customer.id) || null;
  const name  = (b.name  || (req.customer && req.customer.nome)  || 'Cliente').toString().slice(0, 120);
  const email = (b.email || (req.customer && req.customer.email) || null);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let convId, token = (b.token || '').toString().slice(0, 64) || null;
    let conv = null;
    if (token) {
      const [[row]] = await conn.execute('SELECT id FROM conversations WHERE token = ? LIMIT 1', [token]);
      conv = row || null;
    }
    if (conv) {
      convId = conv.id;
      await conn.execute(
        "UPDATE conversations SET status='aperta', unread_admin = unread_admin + 1, last_message_at = NOW() WHERE id = ?",
        [convId]);
    } else {
      token = newToken();
      const [ins] = await conn.execute(
        `INSERT INTO conversations (customer_id, guest_name, guest_email, token, unread_admin, last_message_at)
         VALUES (?, ?, ?, ?, 1, NOW())`,
        [customerId, name, email, token]);
      convId = ins.insertId;
    }
    await conn.execute(
      "INSERT INTO messages (conversation_id, sender, body) VALUES (?, 'customer', ?)",
      [convId, body]);
    await conn.commit();
    return res.status(201).json({ ok: true, token, conversation_id: convId });
  } catch (err) {
    await conn.rollback();
    console.error('chat message error', err);
    return res.status(500).json({ error: 'Errore server' });
  } finally {
    conn.release();
  }
});

/* ── GET /api/chat/messages?token=... ── */
router.get('/messages', async (req, res) => {
  const token = (req.query.token || '').toString().slice(0, 64);
  if (!token) return res.status(400).json({ error: 'token richiesto' });
  try {
    const [[conv]] = await pool.execute('SELECT id, status FROM conversations WHERE token = ? LIMIT 1', [token]);
    if (!conv) return res.json({ status: 'nuova', messages: [] });
    const [msgs] = await pool.execute(
      'SELECT sender, body, created_at FROM messages WHERE conversation_id = ? ORDER BY id ASC LIMIT 200',
      [conv.id]);
    return res.json({ status: conv.status, messages: msgs });
  } catch (err) {
    console.error('chat poll error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

module.exports = router;
