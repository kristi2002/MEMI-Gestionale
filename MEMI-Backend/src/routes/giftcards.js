'use strict';

/**
 * /api/admin/giftcards  — Gift card management (admin only)
 *
 * GET    /api/admin/giftcards        List all gift cards (+ summary)
 * POST   /api/admin/giftcards        Issue a new gift card
 * PUT    /api/admin/giftcards/:id    Update balance / status
 * DELETE /api/admin/giftcards/:id    Delete a gift card
 */

const router = require('express').Router();
const { pool }         = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { sendGiftCardDelivery } = require('../email');

function genCode() {
  // e.g. MEMI-7F3A-9K2C
  const part = () => Math.random().toString(36).slice(2, 6).toUpperCase();
  return `MEMI-${part()}-${part()}`;
}

/* ── GET /api/admin/giftcards ── */
router.get('/', requireAdmin, async (req, res) => {
  try {
    const [cards] = await pool.execute('SELECT * FROM gift_cards ORDER BY created_at DESC');
    const summary = {
      total:    cards.length,
      attive:   cards.filter(c => c.stato === 'attiva').length,
      balance:  cards.reduce((s, c) => s + Number(c.balance || 0), 0),
      emesso:   cards.reduce((s, c) => s + Number(c.initial_amount || 0), 0),
    };
    return res.json({ cards, summary });
  } catch (err) {
    console.error('giftcards list error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── POST /api/admin/giftcards ── */
router.post('/', requireAdmin, async (req, res) => {
  const { initial_amount, recipient_email, note } = req.body;
  const amount = Number(initial_amount);
  if (!amount || amount <= 0)
    return res.status(400).json({ error: 'Importo non valido' });

  try {
    // Retry a few times in the (very unlikely) event of a code collision
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = genCode();
      try {
        const [result] = await pool.execute(
          `INSERT INTO gift_cards (code, initial_amount, balance, recipient_email, note)
           VALUES (?, ?, ?, ?, ?)`,
          [code, amount, amount, recipient_email || null, note || null]
        );
        if (recipient_email) {
          sendGiftCardDelivery({ code, initial_amount: amount, recipient_email, note }).catch(() => {});
        }
        return res.status(201).json({ ok: true, id: result.insertId, code });
      } catch (e) {
        if (e.code === 'ER_DUP_ENTRY') continue;
        throw e;
      }
    }
    return res.status(500).json({ error: 'Impossibile generare un codice univoco' });
  } catch (err) {
    console.error('create giftcard error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── PUT /api/admin/giftcards/:id ── */
router.put('/:id', requireAdmin, async (req, res) => {
  const { balance, stato, recipient_email } = req.body;
  try {
    const fields = [];
    const vals   = [];
    const add = (col, val) => { if (val !== undefined) { fields.push(`${col} = ?`); vals.push(val); } };
    add('balance', balance);
    add('stato', stato);
    add('recipient_email', recipient_email);
    if (!fields.length) return res.status(400).json({ error: 'Nessun campo da aggiornare' });
    vals.push(req.params.id);
    const [result] = await pool.execute(`UPDATE gift_cards SET ${fields.join(', ')} WHERE id = ?`, vals);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Gift card non trovata' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('update giftcard error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── DELETE /api/admin/giftcards/:id ── */
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const [result] = await pool.execute('DELETE FROM gift_cards WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Gift card non trovata' });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Errore server' });
  }
});

module.exports = router;
