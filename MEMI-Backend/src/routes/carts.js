'use strict';

/**
 * /api/admin/carts — abandoned carts (Ordini · Carrelli abbandonati), admin only.
 *
 * GET    /api/admin/carts?minutes=30      Abandoned carts + summary
 * GET    /api/admin/carts/:id/categories  Categories present in a cart (for category discounts)
 * DELETE /api/admin/carts/:id             Remove a cart record
 * POST   /api/admin/carts/:id/recover     Send a recovery email (reminder / featured items / discount)
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

    // Resolve each product's category once (one batched query) so every cart item can
    // carry its `categoria` inline — the recovery modal uses it to show borse vs cinture
    // at a glance and to preview which items a category discount would cover.
    const parsed = rows.map((r) => ({ row: r, items: parseItems(r.items) }));
    const allIds = [...new Set(parsed.flatMap((p) => p.items.map((it) => String(it && it.id)).filter((x) => x && x !== 'undefined')))];
    let catOf = new Map();
    if (allIds.length) {
      const [prodRows] = await pool.query('SELECT id, categoria FROM products WHERE id IN (?)', [allIds]);
      catOf = new Map(prodRows.map((r) => [String(r.id), r.categoria]));
    }

    const carts = parsed.map(({ row: r, items }) => ({
      id: r.id, token: r.token, email: r.email, customer_nome: r.customer_nome || null,
      item_count: r.item_count, total: Number(r.total) || 0,
      items: items.map((it) => ({ ...it, categoria: (it && catOf.get(String(it.id))) || null })),
      updated_at: r.updated_at, created_at: r.created_at,
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

/* ── GET /api/admin/carts/:id/categories ──
 * The categories present among this cart's products — powers the "discount on a whole
 * category" option in the recovery modal. Each entry:
 *   { categoria, cart_items, catalog_products }
 *   cart_items       = how many of THIS cart's line items fall in the category
 *   catalog_products = how many live products the resulting discount would cover
 * (that is the size of the product-id snapshot the code is scoped to). */
router.get('/:id/categories', requireAdmin, async (req, res) => {
  try {
    const [[cart]] = await pool.execute('SELECT items FROM carts WHERE id = ?', [req.params.id]);
    if (!cart) return res.status(404).json({ error: 'Carrello non trovato' });

    const items = parseItems(cart.items);
    const ids = [...new Set(items.map((it) => String(it && it.id)).filter((x) => x && x !== 'undefined'))];
    if (!ids.length) return res.json({ categories: [] });

    // product id → categoria for the cart's products
    const [prodRows] = await pool.query('SELECT id, categoria FROM products WHERE id IN (?)', [ids]);
    const catOf = new Map(prodRows.map((r) => [String(r.id), r.categoria]));

    // count this cart's line items per category
    const cartCount = {};
    for (const it of items) {
      const cat = catOf.get(String(it && it.id));
      if (cat) cartCount[cat] = (cartCount[cat] || 0) + 1;
    }
    const cats = Object.keys(cartCount);
    if (!cats.length) return res.json({ categories: [] });

    // catalog size per category = the discount scope the code will cover
    const [countRows] = await pool.query(
      "SELECT categoria, COUNT(*) AS n FROM products WHERE categoria IN (?) AND status <> 'bozza' GROUP BY categoria",
      [cats]
    );
    const catalogOf = new Map(countRows.map((r) => [r.categoria, Number(r.n)]));

    const categories = cats
      .map((c) => ({ categoria: c, cart_items: cartCount[c], catalog_products: catalogOf.get(c) || 0 }))
      .sort((a, b) => b.cart_items - a.cart_items || String(a.categoria).localeCompare(String(b.categoria)));
    return res.json({ categories });
  } catch (err) {
    console.error('cart categories error', err);
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
 * Body (all optional — plain whole-cart reminder when omitted):
 *   item_ids   string[]                                   cart item ids to feature in the email
 *   category   string                                     scope a discount to a whole category
 *   discount   { tipo:'percentuale'|'fisso', valore }     mints a single-use code
 *
 * Four modes the admin UI drives:
 *   1. {}                              → plain whole-cart reminder
 *   2. { item_ids }                    → reminder featuring only those products (no discount)
 *   3. { item_ids, discount }          → discount scoped to those products
 *   4. { category, discount }          → discount scoped to every live product in the category */
router.post('/:id/recover', requireAdmin, async (req, res) => {
  try {
    const [[cart]] = await pool.execute(
      'SELECT id, email, total, items FROM carts WHERE id = ?', [req.params.id]
    );
    if (!cart) return res.status(404).json({ error: 'Carrello non trovato' });
    if (!cart.email) return res.status(400).json({ error: 'Nessuna email associata a questo carrello' });

    const b = req.body || {};
    const cartItems = parseItems(cart.items);
    const category = (typeof b.category === 'string' && b.category.trim()) ? b.category.trim() : null;

    // Resolve which cart items to feature in the email, and which product ids a
    // discount (if any) is scoped to.
    let featured = [];
    let scopeIds = null; // null → whole-order discount
    if (category) {
      // Category mode: snapshot every live product in the category as the discount
      // scope, and feature the cart items that belong to it.
      const [catProds] = await pool.execute(
        "SELECT id FROM products WHERE categoria = ? AND status <> 'bozza'", [category]
      );
      scopeIds = catProds.map((r) => String(r.id));
      if (!scopeIds.length) return res.status(400).json({ error: 'Nessun prodotto disponibile in questa categoria' });
      const inCat = new Set(scopeIds);
      featured = cartItems.filter((it) => inCat.has(String(it && it.id)));
    } else {
      // Item mode: feature the explicitly chosen cart items (with or without a discount).
      const wantIds = Array.isArray(b.item_ids) ? b.item_ids.map(String) : [];
      featured = wantIds.length ? cartItems.filter((it) => wantIds.includes(String(it && it.id))) : [];
    }

    // Optional discount: validate + mint a single-use code.
    let discount = null;
    if (b.discount && b.discount.valore != null) {
      const tipo = b.discount.tipo === 'fisso' ? 'fisso' : 'percentuale';
      const valore = Number(b.discount.valore);
      if (!(valore > 0) || (tipo === 'percentuale' && valore > 100)) {
        return res.status(400).json({ error: 'Valore sconto non valido' });
      }
      // Scope: the category snapshot, else the featured item ids, else whole order.
      const codeScope = category ? scopeIds : (featured.length ? featured.map((it) => it.id) : null);
      discount = await mintCartDiscount(tipo, valore, 14, codeScope);
      if (!discount) return res.status(500).json({ error: 'Impossibile generare il codice sconto' });
      discount.tipo = tipo;
      discount.valore = valore;
      discount.category = category;
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
      const intro = category ? `Dalla categoria <strong>${category}</strong> ti aspettano:` : 'In particolare ti aspettano:';
      html += `<p>${intro}</p><ul>${rows}</ul>`;
    }
    if (discount) {
      const desc = discount.tipo === 'percentuale' ? `${discount.valore}% di sconto` : `€ ${euro(discount.valore)} di sconto`;
      const onScope = discount.category
        ? ` su tutta la categoria ${discount.category}`
        : (discount.scoped ? ' sugli articoli qui sopra' : '');
      html += `<p style="font-size:16px">🎁 Solo per te: <strong>${desc}${onScope}</strong> con il codice ` +
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
      details: { email: cart.email, discount_code: discount ? discount.code : null, featured: featured.length, category } }).catch(() => {});
    return res.json({ ok: true, sent_to: cart.email, discount_code: discount ? discount.code : null });
  } catch (err) {
    console.error('cart recover error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

module.exports = router;
