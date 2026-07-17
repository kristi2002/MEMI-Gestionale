'use strict';

/**
 * /api/resi  — Customer-facing returns (resi)
 *
 * GET  /api/resi/config    Public return policy (enabled, window days, allowed reasons)
 * POST /api/resi/request   Submit a return request by order number + email (no auth —
 *                          verified by order ownership: order_number + email match)
 * GET  /api/resi/my        The logged-in customer's own return requests (requireCustomer)
 *
 * Opening a request is gated by the reso conditions (reso-config.js). Approval and
 * the actual refund always stay a MANUAL admin action — see routes/resi.js.
 */

const router               = require('express').Router();
const { pool }             = require('../db');
const { optionalCustomer, requireCustomer } = require('../middleware/auth');
const { loadResoConfig }   = require('../reso-config');
const { sendReturnRequestReceived } = require('../email');

/* ── GET /api/resi/config ── public policy for the storefront request form ── */
router.get('/config', async (req, res) => {
  try {
    const cfg = await loadResoConfig();
    return res.json(cfg);
  } catch (err) {
    console.error('reso config error', err);
    // Never break the storefront form — fall back to permissive defaults.
    return res.json({ enabled: true, windowDays: 30, reasons: [] });
  }
});

/* ── POST /api/resi/request ── */
router.post('/request', optionalCustomer, async (req, res) => {
  const { order_number, email, motivo, descrizione } = req.body;

  if (!order_number || !email || !motivo)
    return res.status(400).json({ error: 'Numero ordine, email e motivo obbligatori' });

  try {
    const cfg = await loadResoConfig();
    if (!cfg.enabled)
      return res.status(403).json({ error: 'Il servizio di reso online non è al momento disponibile. Contatta l\'assistenza.' });

    // Motivo must be one of the configured reasons (defends against tampered payloads).
    if (cfg.reasons.length && !cfg.reasons.includes(String(motivo)))
      return res.status(400).json({ error: 'Motivo del reso non valido.' });

    // Verify ownership: order_number + customer_email must match
    const [[order]] = await pool.execute(
      `SELECT id, order_number, customer_nome, customer_cognome, customer_email,
              order_status, total, delivered_at, created_at
       FROM orders WHERE order_number = ? AND customer_email = ?`,
      [order_number.trim(), email.trim().toLowerCase()]
    );
    if (!order)
      return res.status(404).json({ error: 'Ordine non trovato. Verifica il numero ordine e l\'indirizzo email.' });

    // Only allow returns for delivered / shipped orders
    if (order.order_status !== 'consegnato' && order.order_status !== 'spedito')
      return res.status(400).json({ error: 'Il reso può essere richiesto solo per ordini consegnati o spediti.' });

    // Return window: N days after delivery (fall back to the order date when the
    // delivery timestamp is unknown, e.g. orders shipped but not yet marked delivered).
    if (cfg.windowDays > 0) {
      const startDate = order.delivered_at ? new Date(order.delivered_at) : new Date(order.created_at);
      const deadline  = new Date(startDate.getTime() + cfg.windowDays * 86400000);
      if (Number.isFinite(deadline.getTime()) && Date.now() > deadline.getTime())
        return res.status(400).json({
          error: `Il periodo per richiedere un reso (${cfg.windowDays} giorni) è scaduto per questo ordine.`,
        });
    }

    // Check no active reso already exists for this order
    const [[existing]] = await pool.execute(
      `SELECT id FROM resi WHERE order_id = ? AND stato NOT IN ('rifiutato','rimborsato')`,
      [order.id]
    );
    if (existing)
      return res.status(409).json({ error: 'Esiste già una richiesta di reso aperta per questo ordine.' });

    // Generate unique RMA number
    const rmaNumber = 'R-' + Date.now().toString(36).toUpperCase().slice(-6)
                    + Math.random().toString(36).substring(2, 4).toUpperCase();

    const customerNome = ((order.customer_nome || '') + ' ' + (order.customer_cognome || '')).trim();
    // Pre-fill the refund amount with the full order total — the admin only adjusts
    // it down for a partial refund; they never have to look it up by hand.
    const defaultAmount = Number(order.total) || null;

    await pool.execute(
      `INSERT INTO resi (rma_number, order_id, order_number, customer_nome, customer_email, motivo, descrizione, rimborso_amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [rmaNumber, order.id, order.order_number, customerNome, email.trim(), motivo, descrizione || null, defaultAmount]
    );

    // Acknowledge the request by email (best-effort; no-op without SMTP).
    sendReturnRequestReceived({
      rma_number: rmaNumber, order_number: order.order_number,
      nome: order.customer_nome, email: email.trim(), motivo,
    }).catch(() => {});

    return res.status(201).json({
      ok:         true,
      rma_number: rmaNumber,
      message:    'Richiesta di reso ricevuta. Un operatore verificherà la richiesta e le condizioni del prodotto; sarai contattata entro 2 giorni lavorativi.',
    });
  } catch (err) {
    console.error('customer reso request error', err);
    return res.status(500).json({ error: 'Errore server. Riprova tra poco.' });
  }
});

/* ── GET /api/resi/my ── the logged-in customer's return requests ── */
router.get('/my', requireCustomer, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT r.id, r.rma_number, r.order_id, r.order_number, r.motivo, r.descrizione,
              r.stato, r.rimborso_amount, r.created_at, r.updated_at,
              o.order_status, o.total AS order_total
         FROM resi r
         JOIN orders o ON o.id = r.order_id
        WHERE o.customer_id = ? OR LOWER(r.customer_email) = LOWER(?)
        ORDER BY r.created_at DESC`,
      [req.customer.id, req.customer.email || '']
    );
    return res.json({ resi: rows });
  } catch (err) {
    console.error('my resi error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

module.exports = router;
