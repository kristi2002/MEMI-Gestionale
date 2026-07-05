'use strict';

/**
 * Seed demo products into the local database.
 *
 * Usage (inside the backend container or with a reachable MySQL):
 *   node scripts/seed-products.js            → inserts only missing products
 *   node scripts/seed-products.js --reset    → deletes ALL products first (local dev only!)
 *
 * Idempotent: products are keyed by id; existing ids are skipped.
 */

const { pool } = require('../src/db');

const U = (id, w) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w || 800}&q=80`;

const PRODUCTS = [
  {
    id: 'abito-lino-siena', name: 'Abito in Lino Siena', categoria: 'vestiti',
    colore: 'sabbia', color_label: 'Sabbia naturale', price: 89.00,
    is_new: 1, icon: 'dress', popularity: 92,
    description: 'Abito midi in puro lino, taglio morbido e scollo quadrato. Perfetto per le giornate estive.',
    images: [U('photo-1515886657613-9f3515b0c78f'), U('photo-1496747611176-843222e1e57c')],
    taglie: [['xs', 8], ['s', 14], ['m', 16], ['l', 10]],
  },
  {
    id: 'camicia-seta-noto', name: 'Camicia in Seta Noto', categoria: 'top',
    colore: 'avorio', color_label: 'Avorio', price: 75.00,
    is_new: 1, icon: 'dress', popularity: 85,
    description: 'Camicia fluida in seta con bottoni madreperla e vestibilità rilassata.',
    images: [U('photo-1485968579580-b6d095142e6e'), U('photo-1564257631407-4deb1f99d992')],
    taglie: [['s', 12], ['m', 18], ['l', 9]],
  },
  {
    id: 'gonna-plisse-capri', name: 'Gonna Plissé Capri', categoria: 'vestiti',
    colore: 'salvia', color_label: 'Verde salvia', price: 62.00,
    original_price: 78.00, discount_pct: 20, icon: 'dress', popularity: 78,
    description: 'Gonna midi plissettata dal movimento leggero, vita alta con elastico comfort.',
    images: [U('photo-1583496661160-fb5886a13d44'), U('photo-1551163943-3f6a855d1153')],
    taglie: [['xs', 6], ['s', 11], ['m', 13]],
  },
  {
    id: 'blazer-cotone-milano', name: 'Blazer in Cotone Milano', categoria: 'blazer',
    colore: 'panna', color_label: 'Panna', price: 129.00,
    is_new: 1, icon: 'dress', popularity: 88,
    description: 'Blazer destrutturato in cotone stretch, revers classico e tasche a filetto.',
    images: [U('photo-1591369822096-ffd140ec948f'), U('photo-1548624313-0396c75e4b1a')],
    taglie: [['s', 7], ['m', 12], ['l', 8], ['xl', 4]],
  },
  {
    id: 'top-crochet-amalfi', name: 'Top Crochet Amalfi', categoria: 'top',
    colore: 'bianco', color_label: 'Bianco latte', price: 45.00,
    is_new: 1, icon: 'dress', popularity: 90,
    description: 'Top crochet lavorato a mano, orlo smerlato e spalline regolabili.',
    images: [U('photo-1564584217132-2271feaeb3c5'), U('photo-1515372039744-b8f02a3ae446')],
    taglie: [['s', 15], ['m', 15], ['l', 6]],
  },
  {
    id: 'pantalone-palazzo-roma', name: 'Pantalone Palazzo Roma', categoria: 'pantaloni',
    colore: 'terracotta', color_label: 'Terracotta', price: 69.00,
    icon: 'dress', popularity: 74,
    description: 'Pantalone palazzo a vita alta in viscosa fluida, gamba ampia fino a terra.',
    images: [U('photo-1509551388413-e18d0ac5d495'), U('photo-1594633312681-425c7b97ccd1')],
    taglie: [['xs', 5], ['s', 10], ['m', 14], ['l', 7]],
  },
  {
    id: 'borsa-paglia-positano', name: 'Borsa in Paglia Positano', categoria: 'borse',
    colore: 'naturale', color_label: 'Paglia naturale', price: 55.00,
    is_new: 1, icon: 'bag', popularity: 95,
    description: 'Borsa a mano in paglia intrecciata con manici in cuoio e fodera interna.',
    images: [U('photo-1590874103328-eac38a683ce7'), U('photo-1566150905458-1bf1fc113f0d')],
    taglie: [['unica', 20]],
  },
  {
    id: 'sandalo-cuoio-taormina', name: 'Sandalo in Cuoio Taormina', categoria: 'scarpe',
    colore: 'cuoio', color_label: 'Cuoio', price: 84.00,
    original_price: 105.00, discount_pct: 20, icon: 'shoe', popularity: 81,
    description: 'Sandalo flat in cuoio conciato al vegetale, doppia fascia e suola in gomma.',
    images: [U('photo-1543163521-1bf539c55dd2'), U('photo-1560343090-f0409e92791a')],
    taglie: [['36', 4], ['37', 8], ['38', 9], ['39', 6], ['40', 3]],
  },
  {
    id: 'collana-perle-venezia', name: 'Collana di Perle Venezia', categoria: 'gioielli',
    colore: 'oro', color_label: 'Oro e perle', price: 38.00,
    icon: 'ring', popularity: 70,
    description: 'Collana girocollo con perle di fiume e chiusura placcata oro 18k.',
    images: [U('photo-1515562141207-7a88fb7ce338'), U('photo-1599643478518-a784e5dc4c8f')],
    taglie: [['unica', 25]],
  },
  {
    id: 'vestito-fiori-portofino', name: 'Vestito a Fiori Portofino', categoria: 'vestiti',
    colore: 'multicolor', color_label: 'Stampa floreale', price: 95.00,
    is_new: 1, icon: 'dress', popularity: 87,
    description: 'Abito lungo con stampa floreale acquerello, spacco laterale e schiena scoperta.',
    images: [U('photo-1572804013309-59a88b7e92f1'), U('photo-1595777457583-95e059d581b8')],
    taglie: [['xs', 6], ['s', 9], ['m', 12], ['l', 5]],
  },
  {
    id: 'cintura-intreccio-firenze', name: 'Cintura Intreccio Firenze', categoria: 'accessori',
    colore: 'cognac', color_label: 'Cognac', price: 32.00,
    icon: 'belt', popularity: 65,
    description: 'Cintura in pelle intrecciata a mano con fibbia ovale satinata.',
    images: [U('photo-1553062407-98eeb64c6a62'), U('photo-1624222247344-550fb60583dc')],
    taglie: [['s', 10], ['m', 12], ['l', 8]],
  },
  {
    id: 'foulard-seta-ischia', name: 'Foulard in Seta Ischia', categoria: 'accessori',
    colore: 'azzurro', color_label: 'Azzurro mare', price: 42.00,
    status: 'esaurito', icon: 'dress', popularity: 60,
    description: 'Foulard quadrato in twill di seta con stampa esclusiva mediterranea.',
    images: [U('photo-1601924994987-69e26d50dc26'), U('photo-1584030373081-f37b7bb4fa8e')],
    taglie: [['unica', 0]],
  },
];

async function main() {
  const reset = process.argv.includes('--reset');

  if (reset) {
    console.log('⚠️   --reset: deleting all existing products …');
    await pool.query('DELETE FROM products');
  }

  let inserted = 0, skipped = 0;
  for (const p of PRODUCTS) {
    const [exists] = await pool.query('SELECT id FROM products WHERE id = ?', [p.id]);
    if (exists.length) { skipped++; continue; }

    await pool.query(
      `INSERT INTO products
         (id, name, categoria, colore, color_label, price, original_price, discount_pct,
          is_new, icon, popularity, description, images, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        p.id, p.name, p.categoria, p.colore || null, p.color_label || null,
        p.price, p.original_price || null, p.discount_pct || 0,
        p.is_new ? 1 : 0, p.icon || 'dress', p.popularity || 0,
        p.description || null, JSON.stringify(p.images || []), p.status || 'attivo',
      ]
    );
    for (const [taglia, stock] of p.taglie || []) {
      await pool.query(
        'INSERT INTO product_sizes (product_id, taglia, stock) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE stock = VALUES(stock)',
        [p.id, taglia, stock]
      );
    }
    inserted++;
  }

  console.log(`✅  Seed complete: ${inserted} inserted, ${skipped} already present.`);
  await pool.end();
}

main().catch((err) => {
  console.error('❌  Seed failed:', err.message);
  process.exit(1);
});
