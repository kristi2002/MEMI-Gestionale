'use strict';

/**
 * /api/admin/apps  — external apps catalog with real install status.
 * "installed" reflects live env / feature state (no schema changes).
 */

const router = require('express').Router();
const { requireAdmin } = require('../middleware/auth');

router.get('/', requireAdmin, async (req, res) => {
  const hasStripe = !!process.env.STRIPE_SECRET_KEY;
  const hasSmtp = !!process.env.SMTP_USER;

  const apps = [
    { key: 'stripe', nome: 'Stripe Payments', categoria: 'Pagamenti', icona: '💳', descrizione: 'Accetta pagamenti con carta in modo sicuro.', installed: hasStripe },
    { key: 'email', nome: 'Email transazionali & marketing', categoria: 'Marketing', icona: '✉️', descrizione: 'Conferme ordine, tracking e newsletter.', installed: hasSmtp },
    { key: 'feed', nome: 'Feed Meta / Google Shopping', categoria: 'Canali', icona: '🛍️', descrizione: 'Sincronizza il catalogo con i social.', installed: true },
    { key: 'reviews', nome: 'Recensioni prodotti', categoria: 'Fidelizzazione', icona: '⭐', descrizione: 'Raccogli e modera recensioni verificate.', installed: true },
    { key: 'loyalty', nome: 'Programma fedeltà', categoria: 'Fidelizzazione', icona: '🎁', descrizione: 'Punti, premi e livelli per i clienti.', installed: true },
    { key: 'lifecycle', nome: 'Email automatiche (lifecycle)', categoria: 'Marketing', icona: '🔁', descrizione: 'Compleanno, win-back, promemoria punti.', installed: hasSmtp },
  ];

  return res.json({ apps });
});

module.exports = router;
