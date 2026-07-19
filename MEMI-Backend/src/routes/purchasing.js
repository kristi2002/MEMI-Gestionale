'use strict';

/**
 * Purchasing (Acquisti) — suppliers + purchase orders. Mounted at /api/admin.
 *
 * Suppliers:       GET/POST /suppliers · PUT/DELETE /suppliers/:id
 * Purchase orders: GET /purchase-orders · GET /purchase-orders/:id (with items)
 *                  POST /purchase-orders (with items) · PUT /purchase-orders/:id
 *                  DELETE /purchase-orders/:id
 *                  POST /purchase-orders/:id/receive  → adds items to stock
 */

const router = require('express').Router();
const { pool }         = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { logAdminAction } = require('../audit');

const PO_STATI = ['bozza', 'inviato', 'ricevuto', 'annullato'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ═══════════════ SUPPLIERS ═══════════════ */
router.get('/suppliers', requireAdmin, async (req, res) => {
  try { const [rows] = await pool.execute('SELECT * FROM suppliers ORDER BY nome ASC'); return res.json(rows); }
  catch (err) { console.error('suppliers list', err); return res.status(500).json({ error: 'Errore server' }); }
});
router.post('/suppliers', requireAdmin, async (req, res) => {
  const { nome, email, telefono, note } = req.body || {};
  if (!nome || !String(nome).trim()) return res.status(400).json({ error: 'Nome obbligatorio' });
  if (email && !EMAIL_RE.test(String(email).trim())) return res.status(400).json({ error: 'Email non valida' });
  try {
    const [r] = await pool.execute('INSERT INTO suppliers (nome, email, telefono, note) VALUES (?, ?, ?, ?)',
      [String(nome).trim(), email || null, telefono || null, note || null]);
    logAdminAction({ adminId: req.admin.id, adminEmail: req.admin.email, action: 'supplier.create', entityType: 'supplier', entityId: String(r.insertId), details: { nome: String(nome).trim() } }).catch(() => {});
    return res.status(201).json({ ok: true, id: r.insertId });
  } catch (err) { console.error('supplier create', err); return res.status(500).json({ error: 'Errore server' }); }
});
router.put('/suppliers/:id', requireAdmin, async (req, res) => {
  const { nome, email, telefono, note } = req.body || {};
  if (email && !EMAIL_RE.test(String(email).trim())) return res.status(400).json({ error: 'Email non valida' });
  try {
    const fields = [], vals = [];
    const add = (c, v) => { if (v !== undefined) { fields.push(`${c} = ?`); vals.push(v); } };
    add('nome', nome !== undefined ? String(nome).trim() : undefined); add('email', email); add('telefono', telefono); add('note', note);
    if (!fields.length) return res.status(400).json({ error: 'Nessun campo da aggiornare' });
    vals.push(req.params.id);
    const [r] = await pool.execute(`UPDATE suppliers SET ${fields.join(', ')} WHERE id = ?`, vals);
    if (!r.affectedRows) return res.status(404).json({ error: 'Fornitore non trovato' });
    logAdminAction({ adminId: req.admin.id, adminEmail: req.admin.email, action: 'supplier.update', entityType: 'supplier', entityId: String(req.params.id), details: {} }).catch(() => {});
    return res.json({ ok: true });
  } catch (err) { console.error('supplier update', err); return res.status(500).json({ error: 'Errore server' }); }
});
router.delete('/suppliers/:id', requireAdmin, async (req, res) => {
  try {
    const [r] = await pool.execute('DELETE FROM suppliers WHERE id = ?', [req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Fornitore non trovato' });
    logAdminAction({ adminId: req.admin.id, adminEmail: req.admin.email, action: 'supplier.delete', entityType: 'supplier', entityId: String(req.params.id), details: {} }).catch(() => {});
    return res.json({ ok: true });
  } catch (err) { return res.status(500).json({ error: 'Errore server' }); }
});

/* ═══════════════ PURCHASE ORDERS ═══════════════ */
router.get('/purchase-orders', requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT po.*, s.nome AS supplier_nome,
             (SELECT COALESCE(SUM(quantita),0) FROM po_items pi WHERE pi.po_id = po.id) AS items_qty
        FROM purchase_orders po LEFT JOIN suppliers s ON s.id = po.supplier_id
       ORDER BY po.created_at DESC LIMIT 300`);
    return res.json(rows);
  } catch (err) { console.error('po list', err); return res.status(500).json({ error: 'Errore server' }); }
});
router.get('/purchase-orders/:id', requireAdmin, async (req, res) => {
  try {
    const [[po]] = await pool.execute(
      'SELECT po.*, s.nome AS supplier_nome FROM purchase_orders po LEFT JOIN suppliers s ON s.id = po.supplier_id WHERE po.id = ?', [req.params.id]);
    if (!po) return res.status(404).json({ error: 'Ordine fornitore non trovato' });
    const [items] = await pool.execute('SELECT * FROM po_items WHERE po_id = ? ORDER BY id ASC', [req.params.id]);
    return res.json({ purchase_order: po, items });
  } catch (err) { console.error('po detail', err); return res.status(500).json({ error: 'Errore server' }); }
});
router.post('/purchase-orders', requireAdmin, async (req, res) => {
  const { supplier_id, note, items = [] } = req.body || {};
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'Aggiungi almeno una riga prodotto' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let totale = 0;
    items.forEach(it => { totale += (parseInt(it.quantita, 10) || 0) * (Number(it.costo_unitario) || 0); });
    const numero = 'PO-' + new Date().getFullYear() + '-' + Math.floor(1000 + (Date.now() % 9000));
    const [r] = await conn.execute(
      'INSERT INTO purchase_orders (numero, supplier_id, stato, note, totale) VALUES (?, ?, ?, ?, ?)',
      [numero, supplier_id || null, 'bozza', note || null, totale]);
    for (const it of items) {
      if (!it.prodotto) continue;
      await conn.execute('INSERT INTO po_items (po_id, prodotto, taglia, quantita, costo_unitario) VALUES (?, ?, ?, ?, ?)',
        [r.insertId, String(it.prodotto), it.taglia || null, parseInt(it.quantita, 10) || 0, Number(it.costo_unitario) || 0]);
    }
    await conn.commit();
    logAdminAction({ adminId: req.admin.id, adminEmail: req.admin.email, action: 'po.create',
      entityType: 'purchase_order', entityId: String(r.insertId), details: { numero, totale } }).catch(() => {});
    return res.status(201).json({ ok: true, id: r.insertId, numero });
  } catch (err) { await conn.rollback(); console.error('po create', err); return res.status(500).json({ error: 'Errore server' }); }
  finally { conn.release(); }
});
router.put('/purchase-orders/:id', requireAdmin, async (req, res) => {
  const { stato, note } = req.body || {};
  if (stato !== undefined && !PO_STATI.includes(stato)) return res.status(400).json({ error: 'Stato non valido' });
  try {
    const fields = [], vals = [];
    if (stato !== undefined) { fields.push('stato = ?'); vals.push(stato); }
    if (note  !== undefined) { fields.push('note = ?');  vals.push(note); }
    if (!fields.length) return res.status(400).json({ error: 'Nessun campo da aggiornare' });
    vals.push(req.params.id);
    const [r] = await pool.execute(`UPDATE purchase_orders SET ${fields.join(', ')} WHERE id = ?`, vals);
    if (!r.affectedRows) return res.status(404).json({ error: 'Ordine fornitore non trovato' });
    logAdminAction({ adminId: req.admin.id, adminEmail: req.admin.email, action: 'po.update', entityType: 'purchase_order', entityId: String(req.params.id), details: { stato, note } }).catch(() => {});
    return res.json({ ok: true });
  } catch (err) { console.error('po update', err); return res.status(500).json({ error: 'Errore server' }); }
});
router.delete('/purchase-orders/:id', requireAdmin, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute('DELETE FROM po_items WHERE po_id = ?', [req.params.id]);
    const [r] = await conn.execute('DELETE FROM purchase_orders WHERE id = ?', [req.params.id]);
    await conn.commit();
    if (!r.affectedRows) return res.status(404).json({ error: 'Ordine fornitore non trovato' });
    logAdminAction({ adminId: req.admin.id, adminEmail: req.admin.email, action: 'po.delete', entityType: 'purchase_order', entityId: String(req.params.id), details: {} }).catch(() => {});
    return res.json({ ok: true });
  } catch (err) { await conn.rollback(); return res.status(500).json({ error: 'Errore server' }); }
  finally { conn.release(); }
});

/* ── POST /purchase-orders/:id/receive ── add each item's qty to stock ── */
router.post('/purchase-orders/:id/receive', requireAdmin, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[po]] = await conn.execute('SELECT * FROM purchase_orders WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!po) { await conn.rollback(); return res.status(404).json({ error: 'Ordine fornitore non trovato' }); }
    if (po.stato === 'ricevuto') { await conn.rollback(); return res.status(409).json({ error: 'Ordine già ricevuto' }); }
    if (po.stato === 'annullato') { await conn.rollback(); return res.status(409).json({ error: 'Ordine annullato' }); }

    const [items] = await conn.execute('SELECT * FROM po_items WHERE po_id = ?', [req.params.id]);
    let added = 0;
    for (const it of items) {
      const taglia = it.taglia || 'UNI';
      const qty = parseInt(it.quantita, 10) || 0;
      if (qty <= 0) continue;
      // Lock then increment stock (mirrors the Phase-1 concurrency pattern).
      await conn.execute('SELECT stock FROM product_sizes WHERE product_id = ? AND taglia = ? FOR UPDATE', [it.prodotto, taglia]);
      await conn.execute(
        `INSERT INTO product_sizes (product_id, taglia, stock) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE stock = stock + VALUES(stock)`,
        [it.prodotto, taglia, qty]);
      added += qty;
    }
    await conn.execute("UPDATE purchase_orders SET stato = 'ricevuto', received_at = NOW() WHERE id = ?", [req.params.id]);
    await conn.commit();
    logAdminAction({ adminId: req.admin.id, adminEmail: req.admin.email, action: 'po.receive',
      entityType: 'purchase_order', entityId: String(req.params.id), details: { added } }).catch(() => {});
    return res.json({ ok: true, added });
  } catch (err) { await conn.rollback(); console.error('po receive', err); return res.status(500).json({ error: 'Errore server' }); }
  finally { conn.release(); }
});

module.exports = router;
