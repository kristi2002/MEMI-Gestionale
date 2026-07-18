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

/** Mint a unique single-use discount code, expiring in `days`. When `productIds` is a
 *  non-empty array the code is product-scoped (discounts only those items at checkout). */
async function mintCartDiscount(tipo, valore, days = 14, productIds = null) {
  const scad = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  const scope = Array.isArray(productIds) && productIds.length ? JSON.stringify(productIds.map(String)) : null;
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = `CART-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    try {
      await pool.execute(
        `INSERT INTO discount_codes (code, tipo, valore, max_utilizzi, scadenza, stato, min_order, product_ids)
         VALUES (?, ?, ?, 1, ?, 'attivo', 0, ?)`,
        [code, tipo, valore, scad, scope]
      );
      return { code, scadenza: scad, scoped: !!scope };
    } catch (e) {
      if (e && e.code === 'ER_DUP_ENTRY') continue;
      throw e;
    }
  }
  return null;
}

function euro(n) { return (Number(n) || 0).toFixed(2).replace('.', ','); }

/* ── POST /api/admin/carts/:id/recover ──
 * Body (all optional — plain reminder when omitted):
 *   discount   { tipo:'percentuale'|'fisso', valore:number }  → mints a code, featured in the email
 *   item_ids   string[]  → cart item ids to feature as the incentive
 */
router.post('/:id/recover', requireAdmin, async (req, res) => {
  try {
    const [[cart]] = await pool.execute(
      'SELECT id, email, total, items FROM carts WHERE id = ?', [req.params.id]
    );
    if (!cart) return res.status(404).json({ error: 'Carrello non trovato' });
    if (!cart.email) return res.status(400).json({ error: 'Nessuna email associata a questo carrello' });

    const b = req.body || {};
    const cartItems = parseItems(cart.items);
    const wantIds = Array.isArray(b.item_ids) ? b.item_ids.map(String) : [];
    const featured = wantIds.length
      ? cartItems.filter((it) => wantIds.includes(String(it && it.id)))
      : [];

    // Optional discount: validate + mint a single-use code.
    let discount = null;
    if (b.discount && b.discount.valore != null) {
      const tipo = b.discount.tipo === 'fisso' ? 'fisso' : 'percentuale';
      const valore = Number(b.discount.valore);
      if (!(valore > 0) || (tipo === 'percentuale' && valore > 100)) {
        return res.status(400).json({ error: 'Valore sconto non valido' });
      }
      // Scope the code to the featured items when the admin selected specific ones;
      // otherwise it's a whole-order code.
      const scopeIds = featured.length ? featured.map((it) => it.id) : null;
      discount = await mintCartDiscount(tipo, valore, 14, scopeIds);
      if (!discount) return res.status(500).json({ error: 'Impossibile generare il codice sconto' });
      discount.tipo = tipo;
      discount.valore = valore;
    }

    const shop = (process.env.FRONTEND_URL || '').replace(/\/+$/, '');
    const link = shop ? (shop + '/cart') : '/cart';
    const total = euro(cart.total);

    // Build the email body.
    let html = `<p>Ciao! 👋</p><p>Hai ancora degli articoli nel carrello (totale € ${total}).</p>`;
    if (featured.length) {
      const rows = featured.map((it) =>
        `<li><strong>${(it.name || 'Prodotto')}</strong>${it.taglia ? ' — Taglia ' + it.taglia : ''} — € ${euro(it.price)}</li>`
      ).join('');
      html += `<p>In particolare ti aspettano:</p><ul>${rows}</ul>`;
    }
    if (discount) {
      const desc = discount.tipo === 'percentuale' ? `${discount.valore}% di sconto` : `€ ${euro(discount.valore)} di sconto`;
      const onItems = discount.scoped ? ' sugli articoli qui sopra' : '';
      html += `<p style="font-size:16px">🎁 Solo per te: <strong>${desc}${onItems}</strong> con il codice ` +
              `<strong style="letter-spacing:1px">${discount.code}</strong> (valido fino al ${discount.scadenza}).</p>`;
    }
    html += `<p><a href="${link}">Riprendi il tuo carrello</a></p>`;

    const subject = discount
      ? 'Un regalo per il tuo carrello 🎁 — Memi'
      : 'Hai lasciato qualcosa nel carrello — Memi';

    await sendGenericEmail({ to: cart.email, subject, html });
    await pool.execute("UPDATE carts SET status = 'recuperato', recovered_at = NOW() WHERE id = ?", [req.params.id]);
    logAdminAction({ adminId: req.admin.id, adminEmail: req.admin.email, action: 'cart.recover',
      entityType: 'carts', entityId: String(req.params.id),
      details: { email: cart.email, discount_code: discount ? discount.code : null, featured: featured.length } }).catch(() => {});
    return res.json({ ok: true, sent_to: cart.email, discount_code: discount ? discount.code : null });
  } catch (err) {
    console.error('cart recover error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

module.exports = router;
