'use strict';

/**
 * /api/admin/carts — abandoned carts (Ordini · Carrelli abbandonati), admin only.
 *
 * GET    /api/admin/carts?minutes=30   Abandoned carts + summary
 * DELETE /api/admin/carts/:id          Remove a cart record
 * POST   /api/admin/carts/:id/recover  Send a recovery email (if the cart has one)
 */

const router           = require('express').Router();
const { pool }         = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { logAdminAction } = require('../audit');
const { sendGenericEmail } = require('../email');

function parseItems(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') { try { return JSON.parse(v || '[]'); } catch (_) { return []; } }
  return [];
}

/* ── GET /api/admin/carts ── */
router.get('/', requireAdmin, async (req, res) => {
  const minutes = Math.min(Math.max(parseInt(req.query.minutes) || 30, 5), 1440);
  try {
    const [rows] = await pool.execute(`
      SELECT c.id, c.token, c.customer_id, c.email, c.items, c.item_count, c.total,
             c.updated_at, c.created_at, COALESCE(cu.nome, '') AS customer_nome
        FROM carts c
        LEFT JOIN customers cu ON cu.id = c.customer_id
       WHERE c.status = 'attivo' AND c.item_count > 0
         AND c.updated_at < NOW() - INTERVAL ? MINUTE
       ORDER BY c.updated_at DESC
       LIMIT 300`, [minutes]);
    const carts = rows.map(r => ({
      id: r.id, token: r.token, email: r.email, customer_nome: r.customer_nome || null,
      item_count: r.item_count, total: Number(r.total) || 0,
      items: parseItems(r.items), updated_at: r.updated_at, created_at: r.created_at,
      recoverable: !!r.email,
    }));
    const summary = {
      count: carts.length,
      potential_value: carts.reduce((s, c) => s + c.total, 0),
      recoverable: carts.filter(c => c.recoverable).length,
    };
    return res.json({ carts, summary, threshold_minutes: minutes });
  } catch (err) {
    console.error('carts list error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── DELETE /api/admin/carts/:id ── */
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const [result] = await pool.execute('DELETE FROM carts WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Carrello non trovato' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('cart delete error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── POST /api/admin/carts/:id/recover ── */
router.post('/:id/recover', requireAdmin, async (req, res) => {
  try {
    const [[cart]] = await pool.execute('SELECT id, email, total FROM carts WHERE id = ?', [req.params.id]);
    if (!cart) return res.status(404).json({ error: 'Carrello non trovato' });
    if (!cart.email) return res.status(400).json({ error: 'Nessuna email associata a questo carrello' });

    const shop = (process.env.FRONTEND_URL || '').replace(/\/+$/, '');
    const link = shop ? (shop + '/cart') : '/cart';
    const total = (Number(cart.total) || 0).toFixed(2).replace('.', ',');
    await sendGenericEmail({
      to: cart.email,
      subject: 'Hai lasciato qualcosa nel carrello — Memi',
      html: `<p>Ciao! 👋</p><p>Hai ancora degli articoli nel carrello (totale € ${total}). ` +
            `Completa l'ordine quando vuoi:</p><p><a href="${link}">Riprendi il tuo carrello</a></p>`,
    });
    await pool.execute("UPDATE carts SET status = 'recuperato', recovered_at = NOW() WHERE id = ?", [req.params.id]);
    logAdminAction({ adminId: req.admin.id, adminEmail: req.admin.email, action: 'cart.recover',
      entityType: 'carts', entityId: String(req.params.id), details: { email: cart.email } }).catch(() => {});
    return res.json({ ok: true, sent_to: cart.email });
  } catch (err) {
    console.error('cart recover error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

module.exports = router;
