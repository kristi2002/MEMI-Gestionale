'use strict';
/**
 * fattura-xml.test.cjs — FatturaPA XML generator (src/fattura-xml.js).
 *
 * The XML is a legal document: SDI rejects the whole file over a malformed CAP or a
 * riepilogo that is one cent off the lines. These are exactly the failures you cannot
 * see by eyeballing the output, so they are asserted here:
 *   1. B2B invoice → IdFiscaleIVA + the customer's 7-char CodiceDestinatario
 *   2. B2C invoice → CodiceDestinatario 0000000, CodiceFiscale when known
 *   3. Imponibile + Imposta === ImportoTotaleDocumento, and the lines sum to Imponibile
 *   4. Shipping becomes its own line (otherwise the totals cannot reconcile)
 *   5. CAP/Provincia/Nazione are normalised to what the schema allows
 *   6. XML special characters in a product name are escaped
 *   7. Missing company P. IVA fails loudly instead of emitting an invalid invoice
 * DB mocked via Module._load, same approach as invoice-pdf.test.cjs.
 */
const assert = require('assert');
const Module = require('module');

let pass = 0;
const ok = (label) => { console.log('  ✓ ' + label); pass++; };

/* ── DB mock ──────────────────────────────────────────────────────── */

const COMPANY_ROWS = [
  { setting_key: 'company_legal_name', setting_value: 'Memi Abbigliamento S.r.l.' },
  { setting_key: 'company_vat',        setting_value: 'IT01234567890' },
  { setting_key: 'company_address',    setting_value: 'Via della Moda 12' },
  { setting_key: 'company_cap',        setting_value: '62012' },
  { setting_key: 'company_city',       setting_value: 'Civitanova Marche' },
  { setting_key: 'company_province',   setting_value: 'mc' },
  { setting_key: 'company_country',    setting_value: 'Italia' },
  { setting_key: 'company_regime_fiscale', setting_value: 'RF01' },
];

function mockDb({ settings = COMPANY_ROWS, order = null } = {}) {
  const pool = {
    query: async () => [settings],
    execute: async () => [order ? [order] : []],
  };
  const orig = Module._load;
  Module._load = function (req) { if (req === './db') return { pool }; return orig.apply(this, arguments); };
  return () => { Module._load = orig; };
}

function fresh() {
  delete require.cache[require.resolve('../src/fattura-xml.js')];
  return require('../src/fattura-xml.js');
}

/** Minimal single-tag extractor — enough to assert on, no XML dep. */
function tag(xml, name) {
  const m = xml.match(new RegExp('<' + name + '>([\\s\\S]*?)</' + name + '>'));
  return m ? m[1].trim() : null;
}
function allTags(xml, name) {
  const re = new RegExp('<' + name + '>([\\s\\S]*?)</' + name + '>', 'g');
  const out = [];
  let m;
  while ((m = re.exec(xml)) !== null) out.push(m[1].trim());
  return out;
}

const INVOICE = {
  id: 7, order_id: 42, invoice_number: 'F-2026-0007',
  customer_nome: 'Studio Rossi SRL', customer_email: 'studio@rossi.it',
  tax_rate: 22, total: 129.80, stato: 'pagata', created_at: '2026-08-11 09:30:00',
  indirizzo: 'Via Verdi 3',
};
const ITEMS = [
  { product_name: 'Borsa Aurora', taglia: null, colore: 'Cognac', price: 61.95, qty: 2 },
];

/* ── 1 + 4 + 3. B2B, shipping line, arithmetic ────────────────────── */
(async () => {
  const restore = mockDb({
    order: {
      shipping_cost: 5.90, payment_status: 'pagato',
      billing_nome: 'Studio Rossi SRL', billing_address: 'Via Verdi 3', billing_citta: 'Milano',
      billing_cap: '20100', billing_provincia: 'MI', billing_paese: 'Italia',
      billing_piva: 'IT09876543210', billing_cf: '', billing_sdi: 'ABCDEF1', billing_pec: '',
    },
  });
  const { generateFatturaXml } = fresh();
  const { xml, filename } = await generateFatturaXml(INVOICE, ITEMS);
  restore();

  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), 'XML declaration');
  assert.ok(xml.includes('versione="FPR12"'), 'FPR12 header');
  ok('B2B: well-formed FPR12 envelope');

  assert.strictEqual(tag(xml, 'CodiceDestinatario'), 'ABCDEF1');
  assert.ok(xml.includes('<IdCodice>09876543210</IdCodice>'), 'buyer VAT without country prefix');
  ok('B2B: IdFiscaleIVA + 7-char CodiceDestinatario');

  const lines = allTags(xml, 'PrezzoTotale').map(Number);
  assert.ok(xml.includes('<Descrizione>Spese di spedizione</Descrizione>'), 'shipping line present');
  assert.ok(allTags(xml, 'Descrizione').some((d) => /Borsa Aurora/.test(d)), 'goods line present');
  ok('shipping is emitted as its own line');

  const imponibile = Number(tag(xml, 'ImponibileImporto'));
  const imposta    = Number(tag(xml, 'Imposta'));
  const total      = Number(tag(xml, 'ImportoTotaleDocumento'));
  const lineSum    = +lines.reduce((a, b) => a + b, 0).toFixed(2);

  assert.strictEqual(imponibile, lineSum, `imponibile ${imponibile} must equal line sum ${lineSum}`);
  assert.strictEqual(+(imponibile + imposta).toFixed(2), total, 'imponibile + imposta === totale');
  // The charged amount is authoritative: the document must declare exactly it.
  assert.strictEqual(total, 129.80, 'document total === invoice.total, not a re-derived figure');
  ok(`riepilogo reconciles (${imponibile} + ${imposta} = ${total})`);

  assert.strictEqual(filename, 'IT01234567890_F20260007.xml');
  ok('SDI filename convention');

  assert.ok(xml.includes('<ModalitaPagamento>MP08</ModalitaPagamento>'), 'paid → DatiPagamento');
  ok('paid invoice declares its settlement');
})()

/* ── 2 + 5. B2C defaults and field normalisation ──────────────────── */
  .then(async () => {
    const restore = mockDb({
      order: {
        shipping_cost: 0, payment_status: 'in_attesa',
        billing_nome: 'Maria Bianchi', billing_address: 'Corso Italia 9', billing_citta: 'Roma',
        billing_cap: '1 2 3', billing_provincia: 'roma', billing_paese: 'France',
        billing_piva: '', billing_cf: 'BNCMRA80A41H501Z', billing_sdi: '', billing_pec: '',
      },
    });
    const { generateFatturaXml } = fresh();
    const { xml } = await generateFatturaXml({ ...INVOICE, stato: 'emessa', customer_piva: null }, ITEMS);
    restore();

    assert.strictEqual(tag(xml, 'CodiceDestinatario'), '0000000');
    assert.ok(!xml.includes('<IdFiscaleIVA>\n          <IdPaese>FR</IdPaese>'), 'no buyer VAT block for B2C');
    assert.ok(xml.includes('<CodiceFiscale>BNCMRA80A41H501Z</CodiceFiscale>'), 'buyer CF present');
    ok('B2C: CodiceDestinatario 0000000 + CodiceFiscale');

    // '1 2 3' is not 5 digits → documented placeholder rather than a schema violation.
    assert.ok(xml.includes('<CAP>00000</CAP>'), 'invalid CAP falls back to 00000');
    assert.ok(xml.includes('<Provincia>RO</Provincia>'), 'province upper-cased and capped at 2');
    assert.ok(xml.includes('<Nazione>FR</Nazione>'), 'country name mapped to ISO code');
    ok('CAP / Provincia / Nazione normalised to schema constraints');

    assert.ok(!xml.includes('<DatiPagamento>'), 'unpaid invoice omits DatiPagamento');
    ok('unpaid invoice omits the payment block');
  })

/* ── 6. Escaping ──────────────────────────────────────────────────── */
  .then(async () => {
    const restore = mockDb({ order: null });
    const { generateFatturaXml } = fresh();
    const { xml } = await generateFatturaXml(INVOICE, [
      { product_name: 'Gonna "Bloom" & Co. <special>', taglia: 'M', colore: null, price: 100, qty: 1 },
    ]);
    restore();

    assert.ok(xml.includes('&amp;'), 'ampersand escaped');
    assert.ok(xml.includes('&quot;') || xml.includes('&lt;'), 'quotes/angles escaped');
    assert.ok(!/<special>/.test(xml), 'raw angle brackets never leak into the document');
    ok('special characters escaped (no XML injection from a product name)');
  })

/* ── 7. Refuses to emit an invoice with no seller VAT ─────────────── */
  .then(async () => {
    const restore = mockDb({ settings: [{ setting_key: 'company_name', setting_value: 'Memi' }] });
    const { generateFatturaXml } = fresh();
    let threw = null;
    try { await generateFatturaXml(INVOICE, ITEMS); } catch (e) { threw = e; }
    restore();

    assert.ok(threw, 'must throw when the company P. IVA is missing');
    assert.strictEqual(threw.code, 'COMPANY_NOT_CONFIGURED');
    ok('missing P. IVA fails loudly instead of emitting an invalid invoice');
  })

  .then(() => {
    console.log(`\nALL ${pass} FatturaPA XML checks passed.`);
  })
  .catch((e) => {
    console.error('\nFAIL:', e && e.message);
    process.exit(1);
  });
