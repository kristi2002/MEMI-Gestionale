'use strict';

/**
 * /api/admin/supplier-invoices — Fatture fornitori (incoming supplier invoices), admin only.
 *
 * GET    /                    List + summary (totals, da pagare / pagate, scadute)
 * POST   /                    Create an invoice
 * PUT    /:id                 Update an invoice
 * DELETE /:id                 Delete an invoice
 * POST   /attachment          Upload the invoice PDF/image → { url } (shared secure uploader)
 */

const router           = require('express').Router();
const { pool }         = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { logAdminAction } = require('../audit');
const { cleanAttachmentUrl, uploadHandler } = require('../attachments');

const ALLOWED_STATO = ['da_pagare', 'pagata'];
const money = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; };

/* ── GET /api/admin/supplier-invoices ── */
router.get('/', requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT si.*, s.nome AS supplier_nome,
             (si.stato = 'da_pagare' AND si.scadenza IS NOT NULL AND si.scadenza < CURDATE()) AS scaduta
        FROM supplier_invoices si
        LEFT JOIN suppliers s ON s.id = si.supplier_id
        ORDER BY COALESCE(si.data_fattura, si.created_at) DESC, si.id DESC`);
    const [[summary]] = await pool.execute(`
      SELECT
        COUNT(*) AS total,
        COALESCE(SUM(totale),0) AS total_amount,
        COALESCE(SUM(CASE WHEN stato='da_pagare' THEN 1 ELSE 0 END),0) AS da_pagare_count,
        COALESCE(SUM(CASE WHEN stato='da_pagare' THEN totale ELSE 0 END),0) AS da_pagare_amount,
        COALESCE(SUM(CASE WHEN stato='da_pagare' AND scadenza IS NOT NULL AND scadenza < CURDATE() THEN totale ELSE 0 END),0) AS scadute_amount,
        COALESCE(SUM(iva),0) AS iva_total
      FROM supplier_invoices`);
    return res.json({ invoices: rows, summary });
  } catch (err) {
    console.error('supplier invoices list error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── POST /api/admin/supplier-invoices/attachment ── */
router.post('/attachment', requireAdmin, uploadHandler((req, kind) => {
  logAdminAction({ adminId: req.admin.id, adminEmail: req.admin.email, action: 'supplier_invoice.attachment_upload',
    entityType: 'supplier_invoices', entityId: null, details: { kind } }).catch(() => {});
}));

/* ── POST /api/admin/supplier-invoices ── */
router.post('/', requireAdmin, async (req, res) => {
  const b = req.body || {};
  if (!b.numero || !String(b.numero).trim()) return res.status(400).json({ error: 'Numero fattura obbligatorio' });
  const stato = ALLOWED_STATO.includes(b.stato) ? b.stato : 'da_pagare';
  const imponibile = money(b.imponibile), iva = money(b.iva);
  const totale = b.totale !== undefined && b.totale !== '' ? money(b.totale) : imponibile + iva;
  const att = cleanAttachmentUrl(b.attachment_url) ?? null;
  try {
    const [r] = await pool.execute(
      `INSERT INTO supplier_invoices (supplier_id, numero, data_fattura, scadenza, imponibile, iva, totale, stato, attachment_url, note, purchase_order_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [b.supplier_id || null, String(b.numero).trim(), b.data_fattura || null, b.scadenza || null,
       imponibile, iva, totale, stato, att, b.note || null, b.purchase_order_id || null]
    );
    logAdminAction({ adminId: req.admin.id, adminEmail: req.admin.email, action: 'supplier_invoice.create',
      entityType: 'supplier_invoices', entityId: String(r.insertId), details: { numero: String(b.numero).trim(), totale } }).catch(() => {});
    return res.status(201).json({ ok: true, id: r.insertId });
  } catch (err) {
    console.error('supplier invoice create error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── PUT /api/admin/supplier-invoices/:id ── */
router.put('/:id', requireAdmin, async (req, res) => {
  const b = req.body || {};
  if (b.stato !== undefined && !ALLOWED_STATO.includes(b.stato)) return res.status(400).json({ error: 'Stato non valido' });
  try {
    const fields = [], vals = [];
    const add = (col, val) => { if (val !== undefined) { fields.push(`${col} = ?`); vals.push(val); } };
    add('supplier_id', b.supplier_id === undefined ? undefined : (b.supplier_id || null));
    add('numero', b.numero !== undefined ? String(b.numero).trim() : undefined);
    add('data_fattura', b.data_fattura);
    add('scadenza', b.scadenza);
    add('imponibile', b.imponibile !== undefined ? money(b.imponibile) : undefined);
    add('iva', b.iva !== undefined ? money(b.iva) : undefined);
    add('totale', b.totale !== undefined ? money(b.totale) : undefined);
    add('stato', b.stato);
    add('attachment_url', cleanAttachmentUrl(b.attachment_url));
    add('note', b.note);
    add('purchase_order_id', b.purchase_order_id === undefined ? undefined : (b.purchase_order_id || null));
    if (!fields.length) return res.status(400).json({ error: 'Nessun campo da aggiornare' });
    vals.push(req.params.id);
    const [r] = await pool.execute(`UPDATE supplier_invoices SET ${fields.join(', ')} WHERE id = ?`, vals);
    if (!r.affectedRows) return res.status(404).json({ error: 'Fattura non trovata' });
    logAdminAction({ adminId: req.admin.id, adminEmail: req.admin.email, action: 'supplier_invoice.update',
      entityType: 'supplier_invoices', entityId: String(req.params.id), details: {} }).catch(() => {});
    return res.json({ ok: true });
  } catch (err) {
    console.error('supplier invoice update error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── DELETE /api/admin/supplier-invoices/:id ── */
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const [r] = await pool.execute('DELETE FROM supplier_invoices WHERE id = ?', [req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Fattura non trovata' });
    logAdminAction({ adminId: req.admin.id, adminEmail: req.admin.email, action: 'supplier_invoice.delete',
      entityType: 'supplier_invoices', entityId: String(req.params.id), details: {} }).catch(() => {});
    return res.json({ ok: true });
  } catch (err) {
    console.error('supplier invoice delete error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

module.exports = router;
