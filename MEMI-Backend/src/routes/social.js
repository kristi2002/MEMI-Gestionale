'use strict';

/**
 * /api/admin/social  — social & marketplace channels (derived, read-only)
 * Reflects the real product-feed + newsletter state; no schema changes.
 */

const router = require('express').Router();
const { pool } = require('../db');
const { requireAdmin } = require('../middleware/auth');

router.get('/', requireAdmin, async (req, res) => {
  try {
    const [[prod]] = await pool.execute(
      "SELECT COUNT(*) AS n FROM products WHERE status IN ('attivo','esaurito')"
    );
    const [[subs]] = await pool.execute(
      "SELECT COUNT(*) AS n FROM newsletter_subscribers WHERE unsubscribed = 0"
    );
    const feedCount = Number(prod.n);
    const subCount = Number(subs.n);

    return res.json({
      channels: [
        {
          key: 'meta',
          nome: 'Meta — Instagram & Facebook Shop',
          categoria: 'Feed prodotti',
          icona: '📸',
          connesso: feedCount > 0,
          dettaglio: `${feedCount} prodotti nel feed`,
          url: '/api/feed/meta.csv',
        },
        {
          key: 'google',
          nome: 'Google Shopping',
          categoria: 'Feed prodotti',
          icona: '🛍️',
          connesso: feedCount > 0,
          dettaglio: `${feedCount} prodotti nel feed`,
          url: '/api/feed/meta.csv',
        },
        {
          key: 'newsletter',
          nome: 'Newsletter email',
          categoria: 'Email marketing',
          icona: '✉️',
          connesso: subCount > 0,
          dettaglio: `${subCount} iscritti attivi`,
          url: '',
        },
      ],
    });
  } catch (err) {
    console.error('social error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

module.exports = router;
