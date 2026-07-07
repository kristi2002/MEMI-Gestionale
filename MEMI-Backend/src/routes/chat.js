'use strict';

/**
 * /api/admin/chat — admin side of customer chat (admin only).
 *
 * GET    /api/admin/chat            List conversations (name, last message, unread)
 * GET    /api/admin/chat/:id        Conversation + messages (marks admin-read)
 * POST   /api/admin/chat/:id/reply  Admin reply
 * PUT    /api/admin/chat/:id        Update status (aperta|chiusa)
 * DELETE /api/admin/chat/:id        Delete conversation + messages
 */

const router           = require('express').Router();
const { pool }         = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { logAdminAction } = require('../audit');

/* ── GET /api/admin/chat ── */
router.get('/', requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT c.id, c.status, c.unread_admin, c.last_message_at, c.created_at, c.customer_id,
             COALESCE(cu.nome, c.guest_name)   AS name,
             COALESCE(cu.email, c.guest_email) AS email,
             (SELECT m.body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_message
        FROM conversations c
        LEFT JOIN customers cu ON cu.id = c.customer_id
       ORDER BY c.last_message_at DESC, c.id DESC
       LIMIT 200`);
    const unread_total = rows.reduce((s, r) => s + (r.unread_admin || 0), 0);
    return res.json({ conversations: rows, unread_total });
  } catch (err) {
    console.error('chat list error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── GET /api/admin/chat/:id ── */
router.get('/:id', requireAdmin, async (req, res) => {
  try {
    const [[conv]] = await pool.execute(`
      SELECT c.*, COALESCE(cu.nome, c.guest_name) AS name, COALESCE(cu.email, c.guest_email) AS email,
             cu.total_orders, cu.total_spent
        FROM conversations c LEFT JOIN customers cu ON cu.id = c.customer_id
       WHERE c.id = ?`, [req.params.id]);
    if (!conv) return res.status(404).json({ error: 'Conversazione non trovata' });
    const [messages] = await pool.execute(
      'SELECT id, sender, body, created_at FROM messages WHERE conversation_id = ? ORDER BY id ASC LIMIT 500',
      [req.params.id]);
    if (conv.unread_admin > 0)
      pool.execute('UPDATE conversations SET unread_admin = 0 WHERE id = ?', [req.params.id]).catch(() => {});
    conv.unread_admin = 0;
    return res.json({ conversation: conv, messages });
  } catch (err) {
    console.error('chat detail error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── POST /api/admin/chat/:id/reply ── */
router.post('/:id/reply', requireAdmin, async (req, res) => {
  const body = ((req.body && req.body.body) || '').toString().trim();
  if (!body) return res.status(400).json({ error: 'Messaggio vuoto' });
  try {
    const [[conv]] = await pool.execute('SELECT id FROM conversations WHERE id = ?', [req.params.id]);
    if (!conv) return res.status(404).json({ error: 'Conversazione non trovata' });
    await pool.execute("INSERT INTO messages (conversation_id, sender, body) VALUES (?, 'admin', ?)", [req.params.id, body]);
    await pool.execute('UPDATE conversations SET last_message_at = NOW() WHERE id = ?', [req.params.id]);
    logAdminAction({ adminId: req.admin.id, adminEmail: req.admin.email, action: 'chat.reply',
      entityType: 'conversations', entityId: String(req.params.id), details: {} }).catch(() => {});
    return res.status(201).json({ ok: true });
  } catch (err) {
    console.error('chat reply error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── PUT /api/admin/chat/:id ── (status) */
router.put('/:id', requireAdmin, async (req, res) => {
  const status = (req.body && req.body.status);
  if (!['aperta', 'chiusa'].includes(status)) return res.status(400).json({ error: 'Stato non valido' });
  try {
    const [result] = await pool.execute('UPDATE conversations SET status = ? WHERE id = ?', [status, req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Conversazione non trovata' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('chat status error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── DELETE /api/admin/chat/:id ── */
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await pool.execute('DELETE FROM messages WHERE conversation_id = ?', [req.params.id]);
    const [result] = await pool.execute('DELETE FROM conversations WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Conversazione non trovata' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('chat delete error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

module.exports = router;
