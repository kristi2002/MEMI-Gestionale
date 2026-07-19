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
function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Build the house-style recovery email (HTML + plain text).
 *
 * Mirrors the transactional templates in email.js: cream canvas, white card, brown
 * header wordmark, Georgia serif headings, brown CTA button. Content adapts to the
 * four recovery modes:
 *   • no featured items          → lists the whole cart under "Nel tuo carrello"
 *   • featured items / category  → lists only those under a "…ti aspettano" heading
 *   • discount                   → adds a highlighted gift card with the code
 *
 * @param {{ cartItems:Array, featured:Array, category:?string,
 *           discount:?{tipo,valore,code,scadenza,scoped,category}, total:string, link:string }} d
 * @returns {{ html:string, text:string }}
 */
function buildRecoveryEmail(d) {
  const { cartItems, featured, category, discount, total, link } = d;
  const hasFeature   = featured.length > 0;
  const displayItems = hasFeature ? featured : cartItems;

  // Discount copy — computed once so the HTML and the text bodies stay in sync.
  let desc = '', onScope = '';
  if (discount) {
    desc = discount.tipo === 'percentuale' ? `${discount.valore}% di sconto` : `€ ${euro(discount.valore)} di sconto`;
    onScope = discount.category
      ? ` su tutta la categoria ${discount.category}`
      : (discount.scoped ? ' sugli articoli qui sopra' : '');
  }

  const listHeading = hasFeature
    ? (category ? `Dalla categoria <strong>${esc(category)}</strong> ti aspettano:` : 'In particolare ti aspettano:')
    : 'Nel tuo carrello:';

  const itemRows = displayItems.map((it) => {
    const bits = [];
    if (it.taglia) bits.push('Taglia ' + esc(it.taglia));
    if ((Number(it.qty) || 1) > 1) bits.push('Quantità ' + (Number(it.qty) || 1));
    const meta = bits.length ? `<div style="font-size:12px;color:#a89090;margin-top:2px;">${bits.join(' · ')}</div>` : '';
    return `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #efe7e0;">
          <div style="font-size:14px;color:#3B2B2B;font-weight:600;">${esc(it.name || 'Prodotto')}</div>${meta}
        </td>
        <td style="padding:12px 0;border-bottom:1px solid #efe7e0;text-align:right;font-size:14px;color:#3B2B2B;white-space:nowrap;vertical-align:top;">€ ${euro(it.price)}</td>
      </tr>`;
  }).join('');

  const itemsCard = `
    <div style="background:#faf7f4;border-radius:10px;padding:8px 20px 4px;margin:0 0 24px;">
      <p style="font-size:12px;text-transform:uppercase;letter-spacing:.09em;color:#a89090;margin:12px 0 4px;">${listHeading}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        ${itemRows}
        <tr>
          <td style="padding:14px 0 8px;font-size:13px;color:#7a6060;">Totale carrello</td>
          <td style="padding:14px 0 8px;text-align:right;font-size:16px;font-weight:700;color:#3B2B2B;">€ ${total}</td>
        </tr>
      </table>
    </div>`;

  const discountCard = discount ? `
    <div style="background:#fbf3ef;border:1px dashed #d8b3a6;border-radius:10px;padding:20px 22px;margin:0 0 26px;text-align:center;">
      <p style="font-size:13px;color:#8a5a4a;margin:0 0 6px;">🎁 Solo per te — <strong>${esc(desc)}${esc(onScope)}</strong></p>
      <div style="display:inline-block;background:#fff;border:1px solid #e6d3ca;border-radius:8px;padding:10px 22px;margin:6px 0 8px;">
        <span style="font-family:'Courier New',monospace;font-size:20px;font-weight:700;letter-spacing:3px;color:#3B2B2B;">${esc(discount.code)}</span>
      </div>
      <p style="font-size:12px;color:#a89090;margin:6px 0 0;">Valido fino al ${esc(discount.scadenza)}</p>
    </div>` : '';

  const title = discount ? 'Un regalo per il tuo carrello' : 'Hai dimenticato qualcosa?';
  const lead  = discount
    ? 'Abbiamo tenuto da parte i capi del tuo carrello — e questa volta con un piccolo pensiero per te.'
    : 'Alcuni capi sono ancora nel tuo carrello. Li abbiamo messi da parte, sono qui quando vuoi.';

  const html = `
<!DOCTYPE html>
<html lang="it">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#faf7f4;font-family:'Helvetica Neue',Arial,sans-serif;color:#3B2B2B;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,.06);">
    <div style="background:#3B2B2B;padding:32px 40px;text-align:center;">
      <h1 style="color:#fff;font-size:28px;font-weight:300;letter-spacing:.12em;margin:0;">Memi<span style="color:#c9897a;">.</span></h1>
    </div>
    <div style="padding:36px 40px;">
      <p style="font-size:22px;font-weight:300;font-family:Georgia,serif;margin:0 0 12px;">${esc(title)}</p>
      <p style="color:#7a6060;font-size:15px;line-height:1.7;margin:0 0 24px;">Ciao 👋 ${esc(lead)}</p>
      ${itemsCard}
      ${discountCard}
      <div style="text-align:center;margin:4px 0 8px;">
        <a href="${esc(link)}" style="display:inline-block;padding:15px 40px;background:#3B2B2B;color:#fff;text-decoration:none;font-size:13px;letter-spacing:.1em;text-transform:uppercase;border-radius:6px;">Riprendi il tuo carrello</a>
      </div>
      <p style="color:#a89090;font-size:12px;line-height:1.6;text-align:center;margin:18px 0 0;">Spedizione gratuita da € 100 · Reso facile entro 30 giorni</p>
    </div>
    <div style="background:#faf7f4;padding:20px 40px;text-align:center;font-size:12px;color:#a89090;">
      © 2026 Memi Abbigliamento · Milano, Italia
    </div>
  </div>
</body>
</html>`;

  const textLines = [
    `Ciao!`, '',
    discount ? title + '.' : 'Hai ancora degli articoli nel carrello.',
    `Totale carrello: € ${total}`, '',
  ];
  for (const it of displayItems) {
    textLines.push(`- ${it.name || 'Prodotto'}${it.taglia ? ' (Taglia ' + it.taglia + ')' : ''} — € ${euro(it.price)}`);
  }
  if (discount) {
    textLines.push('', `Codice sconto: ${discount.code} — ${desc}${onScope}, valido fino al ${discount.scadenza}.`);
  }
  textLines.push('', `Riprendi il tuo carrello: ${link}`, '', 'Memi Abbigliamento');

  return { html, text: textLines.join('\n') };
}

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

    const { html, text } = buildRecoveryEmail({
      cartItems, featured, category, discount, total: euro(cart.total), link,
    });

    const subject = discount
      ? 'Un regalo per il tuo carrello 🎁 — Memi'
      : 'Hai lasciato qualcosa nel carrello — Memi';

    await sendGenericEmail({ to: cart.email, subject, html, text });
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
