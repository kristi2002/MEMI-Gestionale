'use strict';

/**
 * /api/giftcards  — public gift-card lookup (customer-facing, no auth)
 *
 * GET /api/giftcards/validate/:code
 *   Returns: { valid: true, code, balance } or { valid: false, error }
 *
 * Redemption itself happens inside POST /api/orders (see routes/orders.js) — this
 * endpoint is only a pre-checkout preview so the storefront can show "this covers
 * €X of your order" before the customer submits.
 */

const router = require('express').Router();
const { pool } = require('../db');

router.get('/validate/:code', async (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ valid: false, error: 'Codice mancante' });

  try {
    const [[card]] = await pool.execute(
      'SELECT code, balance, stato FROM gift_cards WHERE code = ?', [code]
    );
    if (!card) return res.status(404).json({ valid: false, error: 'Gift card non trovata' });
    if (card.stato !== 'attiva') return res.status(400).json({ valid: false, error: 'Gift card non attiva' });
    if (Number(card.balance) <= 0) return res.status(400).json({ valid: false, error: 'Gift card esaurita' });

    return res.json({ valid: true, code: card.code, balance: Number(card.balance) });
  } catch (err) {
    console.error('giftcard validate error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

module.exports = router;
