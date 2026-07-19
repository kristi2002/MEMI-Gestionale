'use strict';
/**
 * invoice-pdf.test.cjs — fattura PDF renderer (src/invoice-pdf.js).
 *
 * The renderer embeds a product photo (WebP on disk → JPEG via sharp, since pdfkit
 * can't embed WebP) and enriches each line with order/payment/billing detail pulled
 * best-effort from the DB. This test proves:
 *   1. a full invoice renders to a valid PDF that actually embeds the image (DCTDecode)
 *   2. a DB failure degrades gracefully (still a valid PDF, no throw)
 *   3. an invoice with no line items still renders
 * Self-contained: real WebP fixture in a temp UPLOADS_DIR, DB mocked via Module._load.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const sharp = require('sharp');

// UPLOADS_DIR must be set before src/invoice-pdf.js requires ./images.
const UP = fs.mkdtempSync(path.join(os.tmpdir(), 'inv-pdf-test-'));
process.env.UPLOADS_DIR = UP;

const WEBP = 'aabbccddeeff0011-thumb.webp';

const ORDER = {
  payment_method: 'carta', payment_status: 'pagato', created_at: '2026-07-18 10:00:00',
  subtotal: 100, shipping_cost: 5.90, billing_same_as_shipping: 0,
  billing_nome: 'Studio Rossi SRL', billing_address: 'Via Verdi 3', billing_citta: 'Milano',
  billing_cap: '20100', billing_provincia: 'MI', billing_paese: 'Italia',
  billing_piva: 'IT09876543210', billing_cf: '', billing_sdi: 'ABCDEF1', billing_pec: 'studio@pec.it',
};
const PRODUCTS = [{ id: 'p1', images: JSON.stringify([{ thumb: '/api/uploads/' + WEBP }]), categoria: 'borse', colore: 'Cognac' }];

function mockDb(pool) {
  const orig = Module._load;
  Module._load = function (req) { if (req === './db') return { pool }; return orig.apply(this, arguments); };
  return () => { Module._load = orig; };
}
function freshRenderer() {
  delete require.cache[require.resolve('../src/invoice-pdf.js')];
  return require('../src/invoice-pdf.js').generateInvoicePdf;
}
const isPdf = (b) => Buffer.isBuffer(b) && b.slice(0, 5).toString('latin1') === '%PDF-';
const hasImage = (b) => b.toString('latin1').includes('/DCTDecode');

const INVOICE = {
  invoice_number: 'F-2026-0007', order_id: 42, order_number: 'MEMI-1042',
  customer_nome: 'Clara', customer_cognome: 'Bianchi', customer_email: 'clara@example.it',
  customer_cf: 'BNCCLR90A01F205X', customer_piva: '', indirizzo: 'Via Roma 1, Milano',
  subtotal: 108.11, tax_rate: 22, tax_amount: 23.79, total: 131.90,
  stato: 'emessa', note: 'Grazie per il tuo acquisto.', created_at: '2026-07-18 10:05:00', due_date: null,
};
const ITEMS = [
  { product_id: 'p1', product_name: 'Borsa a tracolla in pelle', taglia: '', colore: '', price: 65.00, qty: 1 },
  { product_id: 'p2', product_name: 'Cintura intrecciata', taglia: 'M', colore: 'Nero', price: 28.00, qty: 2 },
];

let n = 0;
const ok = (m) => { console.log('  ✓ ' + m); n++; };

(async () => {
  // real WebP fixture
  await sharp({ create: { width: 200, height: 200, channels: 3, background: { r: 190, g: 140, b: 122 } } })
    .webp().toFile(path.join(UP, WEBP));

  /* 1) full invoice — image embedded + order enrichment */
  {
    const restore = mockDb({
      execute: async (s) => (/FROM orders/i.test(s) ? [[ORDER]] : [[]]),
      query:   async (s) => (/FROM products/i.test(s) ? [PRODUCTS] : [[]]),
    });
    const pdf = await freshRenderer()(INVOICE, ITEMS);
    restore();
    assert.ok(isPdf(pdf), 'valid PDF header');
    assert.ok(pdf.length > 3000, 'non-trivial size (' + pdf.length + ')');
    assert.ok(hasImage(pdf), 'product photo embedded (DCTDecode present)');
    ok('full invoice renders a valid PDF with an embedded product photo');
  }

  /* 2) DB failure — graceful degradation */
  {
    const restore = mockDb({ execute: async () => { throw new Error('no db'); }, query: async () => { throw new Error('no db'); } });
    const pdf = await freshRenderer()(INVOICE, ITEMS);
    restore();
    assert.ok(isPdf(pdf), 'still a valid PDF when the DB is unavailable');
    ok('DB failure degrades to a leaner but valid PDF (never throws)');
  }

  /* 3) no line items — fallback row */
  {
    const restore = mockDb({ execute: async () => [[]], query: async () => [[]] });
    const pdf = await freshRenderer()({ ...INVOICE, note: 'Ordine forfettario' }, []);
    restore();
    assert.ok(isPdf(pdf), 'renders with no order items');
    ok('empty-items invoice still renders a valid PDF');
  }

  console.log('\nALL ' + n + ' invoice-pdf tests passed.');
})().catch((e) => { console.error('FAILED:', e.stack || e.message); process.exit(1); });
