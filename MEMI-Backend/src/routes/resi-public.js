'use strict';

/**
 * /api/resi  — Customer-facing return request
 *
 * POST /api/resi/request  Submit a return request by order number + email
 *                         No auth required — verified by order ownership (order_number + email match)
 */

const router              = require('express').Router();
const { pool }            = require('../db');
const { optionalCustomer } = require('../middleware/auth');

/* ── POST /api/resi/request ── */
router.post('/request', optionalCustomer, async (req, res) => {
  const { order_number, email, motivo, descrizione } = req.body;

  if (!order_number || !email || !motivo)
    return res.status(400).json({ error: 'Numero ordine, email e motivo obbligatori' });

  try {
    // Verify ownership: order_number + customer_email must match
    const [[order]] = await pool.execute(
      `SELECT id, order_number, customer_nome, customer_cognome, customer_email, order_status
       FROM orders WHERE order_number = ? AND customer_email = ?`,
      [order_number.trim(), email.trim().toLowerCase()]
    );
    if (!order)
      return res.status(404).json({ error: 'Ordine non trovato. Verifica il numero ordine e l\'indirizzo email.' });

    // Only allow returns for delivered orders
    if (order.order_status !== 'consegnato' && order.order_status !== 'spedito')
      return res.status(400).json({ error: 'Il reso può essere richiesto solo per ordini consegnati o spediti.' });

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

    await pool.execute(
      `INSERT INTO resi (rma_number, order_id, order_number, customer_nome, customer_email, motivo, descrizione)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [rmaNumber, order.id, order.order_number, customerNome, email.trim(), motivo, descrizione || null]
    );

    return res.status(201).json({
      ok:         true,
      rma_number: rmaNumber,
      message:    'Richiesta di reso ricevuta. Sarai contattata entro 2 giorni lavorativi.',
    });
  } catch (err) {
    console.error('customer reso request error', err);
    return res.status(500).json({ error: 'Errore server. Riprova tra poco.' });
  }
});

module.exports = router;
