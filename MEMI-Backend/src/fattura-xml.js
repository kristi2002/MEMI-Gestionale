'use strict';

/**
 * FatturaPA XML (FPR12 — privati, versione 1.2.2) generator.
 *
 * WHAT THIS IS
 *   Produces the electronic-invoice document the Sistema di Interscambio expects,
 *   from an `invoices` row + its `order_items` + the company identity stored in
 *   `store_settings`. The file it returns is what you upload to the Agenzia delle
 *   Entrate portal ("Fatture e Corrispettivi") or hand to an accredited intermediary.
 *
 * WHAT THIS IS NOT
 *   It does NOT transmit to SDI and it does NOT sign the file. Transmission requires
 *   either an accredited intermediary (Aruba, Fatture in Cloud, TeamSystem, …) or a
 *   direct SDICoop/SDIFTP channel with a qualified certificate — neither of which can
 *   live in application code alone. The generated XML is deliberately valid on its
 *   own so it can be uploaded manually from day one, and wired to a provider later
 *   without changing this module.
 *
 * VAT MODEL
 *   Matches invoicing.js and invoice-pdf.js: catalogue prices are IVA-inclusive, so
 *   the taxable base is extracted from the gross (imponibile = totale / (1 + rate)).
 *   Per-line unit prices are therefore emitted net of VAT, and DatiRiepilogo carries
 *   the single rate the invoice was issued at.
 *
 * NUMERIC FORMAT
 *   SDI validates decimals strictly: 2 decimals for money, 2 for the rate, 8 allowed
 *   for quantities. Everything goes through dec()/qty() — never raw toString().
 */

const { pool } = require('./db');

/* ── helpers ──────────────────────────────────────────────────────── */

const s = (v) => (v == null ? '' : String(v)).trim();

/** XML text escape. Ampersand first, or it double-escapes the entities below. */
function esc(v) {
  return s(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const dec = (n) => (Number(n) || 0).toFixed(2);
const qty = (n) => (Number(n) || 0).toFixed(2);

/** SDI wants a plain ISO date (YYYY-MM-DD), never a timestamp. */
function isoDate(v) {
  const d = v ? new Date(v) : new Date();
  const use = Number.isNaN(d.getTime()) ? new Date() : d;
  return use.toISOString().slice(0, 10);
}

/** Alphanumeric-only, upper-cased, length-capped — used for codes SDI restricts. */
function code(v, max) {
  return s(v).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, max);
}

/** A CAP must be exactly 5 digits; SDI rejects anything else. '00000' is the
 *  documented placeholder for a missing/foreign postcode. */
function cap(v) {
  const digits = s(v).replace(/\D/g, '');
  return digits.length === 5 ? digits : '00000';
}

/** ISO-3166 alpha-2. The catalogue stores free text ('Italia'), so map the common ones. */
const COUNTRY = {
  italia: 'IT', italy: 'IT', it: 'IT',
  francia: 'FR', france: 'FR', fr: 'FR',
  germania: 'DE', germany: 'DE', de: 'DE',
  spagna: 'ES', spain: 'ES', es: 'ES',
  svizzera: 'CH', switzerland: 'CH', ch: 'CH',
  austria: 'AT', at: 'AT',
  belgio: 'BE', belgium: 'BE', be: 'BE',
  'paesi bassi': 'NL', olanda: 'NL', netherlands: 'NL', nl: 'NL',
  portogallo: 'PT', portugal: 'PT', pt: 'PT',
};
function countryCode(v) {
  const k = s(v).toLowerCase();
  if (!k) return 'IT';
  if (COUNTRY[k]) return COUNTRY[k];
  return /^[A-Za-z]{2}$/.test(k) ? k.toUpperCase() : 'IT';
}

/* ── company identity (store_settings, env as fallback) ───────────── */

const COMPANY_KEYS = [
  'company_legal_name', 'company_name', 'company_vat', 'company_fiscal_code',
  'company_address', 'company_cap', 'company_city', 'company_province',
  'company_country', 'company_email', 'company_regime_fiscale',
];

async function loadCompany() {
  const out = {};
  try {
    const [rows] = await pool.query(
      'SELECT `key`, `value` FROM store_settings WHERE `key` IN (?)',
      [COMPANY_KEYS]
    );
    for (const r of rows) out[r.key] = s(r.value);
  } catch (err) {
    // Falling back to env is a legitimate degradation, but a silent fall-through
    // once hid a wrong column name here — never let it be invisible again.
    console.error('fattura-xml: store_settings read failed, falling back to env —', err && err.message);
  }

  const vat = out.company_vat || s(process.env.COMPANY_VAT);
  return {
    name:     out.company_legal_name || out.company_name || s(process.env.COMPANY_NAME),
    vat,
    cf:       out.company_fiscal_code || '',
    address:  out.company_address || '',
    cap:      out.company_cap || '',
    city:     out.company_city || '',
    province: out.company_province || '',
    country:  out.company_country || 'Italia',
    email:    out.company_email || s(process.env.COMPANY_EMAIL),
    // RF01 = regime ordinario. Override in Impostazioni for forfettario (RF19) etc.
    regime:   out.company_regime_fiscale || 'RF01',
  };
}

/* ── recipient ────────────────────────────────────────────────────── */

/**
 * Resolve the CessionarioCommittente block.
 *
 * B2B (customer supplied a P.IVA) → IdFiscaleIVA + their CodiceDestinatario/PEC.
 * B2C (private individual)        → CodiceFiscale if known, CodiceDestinatario
 *                                   '0000000' (the documented value meaning "no
 *                                   channel"; the customer reads it in their
 *                                   Cassetto fiscale).
 */
function resolveRecipient(invoice, order) {
  const piva = s(invoice.customer_piva) || s(order && order.billing_piva);
  const cf   = s(invoice.customer_cf)   || s(order && order.billing_cf);
  const sdi  = code(order && order.billing_sdi, 7);
  const pec  = s(order && order.billing_pec);

  const isB2B = Boolean(piva);
  return {
    isB2B,
    piva,
    cf,
    name: s(invoice.customer_nome) || s(order && order.billing_nome) || 'Cliente',
    /* Preference order per field: billing snapshot → shipping columns → the
       pre-joined invoice.indirizzo. Never mix: a CAP from shipping with a street
       from billing would be a plausible-looking wrong address. */
    address:  s(order && order.billing_address)  || s(order && order.shipping_address) || s(invoice.indirizzo) || '-',
    cap:      cap(s(order && order.billing_cap)  || s(order && order.shipping_cap)),
    city:     s(order && order.billing_citta)    || s(order && order.shipping_citta)   || '-',
    province: code(order && order.billing_provincia, 2),
    country:  countryCode(s(order && order.billing_paese) || s(order && order.shipping_paese)),
    // A 7-char code wins; otherwise PEC routing ('0000000' + PECDestinatario);
    // otherwise the no-channel default.
    destCode: sdi.length === 7 ? sdi : '0000000',
    destPec:  sdi.length === 7 ? '' : pec,
  };
}

/* ── builder ──────────────────────────────────────────────────────── */

/**
 * Build the FatturaPA XML string.
 * @param {object} invoice  row from `invoices`
 * @param {Array}  items    rows from `order_items`
 * @param {object} order    row from `orders` (billing snapshot) — optional
 * @param {object} company  resolved company identity
 */
function buildXml(invoice, items, order, company) {
  const rate       = Number(invoice.tax_rate) || 22;
  const divisor    = 1 + rate / 100;
  const grossTotal = Number(invoice.total) || 0;

  const to = resolveRecipient(invoice, order);
  const progressivo = code(invoice.invoice_number, 10) || String(invoice.id);

  /* Lines: order items net of VAT, plus shipping as its own line so the sum of
     the lines reconciles with ImportoTotaleDocumento (SDI checks this). */
  const lines = [];
  let netLines = 0;

  (items || []).forEach((it, i) => {
    const grossUnit = Number(it.price) || 0;
    const quantity  = Number(it.qty) || 1;
    const netUnit   = +(grossUnit / divisor).toFixed(2);
    const netTotal  = +(netUnit * quantity).toFixed(2);
    netLines = +(netLines + netTotal).toFixed(2);

    const desc = [s(it.product_name) || 'Articolo', it.taglia ? `Taglia ${s(it.taglia)}` : '', it.colore ? s(it.colore) : '']
      .filter(Boolean).join(' — ');

    lines.push(
      `      <DettaglioLinee>
        <NumeroLinea>${i + 1}</NumeroLinea>
        <Descrizione>${esc(desc).slice(0, 1000)}</Descrizione>
        <Quantita>${qty(quantity)}</Quantita>
        <PrezzoUnitario>${dec(netUnit)}</PrezzoUnitario>
        <PrezzoTotale>${dec(netTotal)}</PrezzoTotale>
        <AliquotaIVA>${dec(rate)}</AliquotaIVA>
      </DettaglioLinee>`
    );
  });

  const grossShipping = Number(order && order.shipping_cost) || 0;
  if (grossShipping > 0) {
    const netShipping = +(grossShipping / divisor).toFixed(2);
    netLines = +(netLines + netShipping).toFixed(2);
    lines.push(
      `      <DettaglioLinee>
        <NumeroLinea>${lines.length + 1}</NumeroLinea>
        <Descrizione>Spese di spedizione</Descrizione>
        <Quantita>1.00</Quantita>
        <PrezzoUnitario>${dec(netShipping)}</PrezzoUnitario>
        <PrezzoTotale>${dec(netShipping)}</PrezzoTotale>
        <AliquotaIVA>${dec(rate)}</AliquotaIVA>
      </DettaglioLinee>`
    );
  }

  /* The document total is what the customer was actually charged — never a figure
     re-derived from list prices, which would ignore discounts and gift cards. The
     taxable base is extracted from it, and the tax is the remainder, so
     Imponibile + Imposta === ImportoTotaleDocumento by construction. */
  const documentTotal = +(Number(invoice.total) || 0).toFixed(2);
  const imponibile    = +(documentTotal / divisor).toFixed(2);
  const imposta       = +(documentTotal - imponibile).toFixed(2);

  /* SDI also checks that the lines add up to the base. Anything the priced lines do
     not account for — a discount code, a redeemed gift card, a rounding cent — is
     emitted as one explicit adjustment line rather than silently absorbed. */
  const balance = +(imponibile - netLines).toFixed(2);
  if (balance !== 0) {
    const discountCode = s(order && order.discount_code);
    const label = discountCode
      ? `Sconto ${discountCode}`
      : (Number(order && order.gift_card_amount) > 0
          ? 'Gift card'
          : (balance < 0 ? 'Sconto' : 'Arrotondamento'));
    lines.push(
      `      <DettaglioLinee>
        <NumeroLinea>${lines.length + 1}</NumeroLinea>
        <Descrizione>${esc(label)}</Descrizione>
        <Quantita>1.00</Quantita>
        <PrezzoUnitario>${dec(balance)}</PrezzoUnitario>
        <PrezzoTotale>${dec(balance)}</PrezzoTotale>
        <AliquotaIVA>${dec(rate)}</AliquotaIVA>
      </DettaglioLinee>`
    );
  }

  const sellerCf = company.cf && company.cf !== company.vat
    ? `        <CodiceFiscale>${esc(company.cf)}</CodiceFiscale>\n` : '';

  const buyerFiscal = to.isB2B
    ? `        <IdFiscaleIVA>
          <IdPaese>${to.country}</IdPaese>
          <IdCodice>${esc(to.piva.replace(/^[A-Za-z]{2}/, ''))}</IdCodice>
        </IdFiscaleIVA>
${to.cf ? `        <CodiceFiscale>${esc(to.cf)}</CodiceFiscale>\n` : ''}`
    : (to.cf ? `        <CodiceFiscale>${esc(to.cf)}</CodiceFiscale>\n` : '');

  const buyerName = to.isB2B
    ? `        <Anagrafica>
          <Denominazione>${esc(to.name).slice(0, 80)}</Denominazione>
        </Anagrafica>`
    : `        <Anagrafica>
          <Denominazione>${esc(to.name).slice(0, 80)}</Denominazione>
        </Anagrafica>`;

  const pecLine = to.destPec
    ? `    <PECDestinatario>${esc(to.destPec)}</PECDestinatario>\n` : '';

  // Paid invoices declare the settlement so the recipient's books reconcile.
  const paid = s(invoice.stato) === 'pagata' || s(order && order.payment_status) === 'pagato';
  const payment = paid
    ? `    <DatiPagamento>
      <CondizioniPagamento>TP02</CondizioniPagamento>
      <DettaglioPagamento>
        <ModalitaPagamento>MP08</ModalitaPagamento>
        <ImportoPagamento>${dec(documentTotal)}</ImportoPagamento>
      </DettaglioPagamento>
    </DatiPagamento>\n`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica versione="FPR12" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2 http://www.fatturapa.gov.it/export/fatturazione/sdi/fatturapa/v1.2.2/Schema_del_file_xml_FatturaPA_v1.2.2.xsd">
  <FatturaElettronicaHeader>
    <DatiTrasmissione>
      <IdTrasmittente>
        <IdPaese>IT</IdPaese>
        <IdCodice>${esc(company.vat.replace(/^[A-Za-z]{2}/, ''))}</IdCodice>
      </IdTrasmittente>
      <ProgressivoInvio>${esc(progressivo)}</ProgressivoInvio>
      <FormatoTrasmissione>FPR12</FormatoTrasmissione>
      <CodiceDestinatario>${to.destCode}</CodiceDestinatario>
${pecLine}    </DatiTrasmissione>
    <CedentePrestatore>
      <DatiAnagrafici>
        <IdFiscaleIVA>
          <IdPaese>IT</IdPaese>
          <IdCodice>${esc(company.vat.replace(/^[A-Za-z]{2}/, ''))}</IdCodice>
        </IdFiscaleIVA>
${sellerCf}        <Anagrafica>
          <Denominazione>${esc(company.name).slice(0, 80)}</Denominazione>
        </Anagrafica>
        <RegimeFiscale>${esc(company.regime)}</RegimeFiscale>
      </DatiAnagrafici>
      <Sede>
        <Indirizzo>${esc(company.address) || '-'}</Indirizzo>
        <CAP>${cap(company.cap)}</CAP>
        <Comune>${esc(company.city) || '-'}</Comune>
${company.province ? `        <Provincia>${code(company.province, 2)}</Provincia>\n` : ''}        <Nazione>${countryCode(company.country)}</Nazione>
      </Sede>
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici>
${buyerFiscal}${buyerName}
      </DatiAnagrafici>
      <Sede>
        <Indirizzo>${esc(to.address)}</Indirizzo>
        <CAP>${to.cap}</CAP>
        <Comune>${esc(to.city)}</Comune>
${to.province ? `        <Provincia>${to.province}</Provincia>\n` : ''}        <Nazione>${to.country}</Nazione>
      </Sede>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>TD01</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>${isoDate(invoice.created_at)}</Data>
        <Numero>${esc(invoice.invoice_number || invoice.id)}</Numero>
        <ImportoTotaleDocumento>${dec(documentTotal)}</ImportoTotaleDocumento>
      </DatiGeneraliDocumento>
    </DatiGenerali>
    <DatiBeniServizi>
${lines.join('\n')}
      <DatiRiepilogo>
        <AliquotaIVA>${dec(rate)}</AliquotaIVA>
        <ImponibileImporto>${dec(imponibile)}</ImponibileImporto>
        <Imposta>${dec(imposta)}</Imposta>
        <EsigibilitaIVA>I</EsigibilitaIVA>
      </DatiRiepilogo>
    </DatiBeniServizi>
${payment}  </FatturaElettronicaBody>
</p:FatturaElettronica>
`;
}

/**
 * SDI filename convention: IT<vat>_<progressivo base36>.xml — must be unique per
 * transmitter, which the invoice number already guarantees.
 */
function xmlFilename(invoice, company) {
  const vat = code(company.vat, 16) || 'IT00000000000';
  const prog = code(invoice.invoice_number, 10) || String(invoice.id);
  return `IT${vat.replace(/^IT/, '')}_${prog}.xml`;
}

/**
 * Generate the FatturaPA XML for an invoice.
 * Throws when the company VAT is missing — emitting an invoice without the seller's
 * P. IVA would produce a file SDI rejects and that is not a legal document.
 */
async function generateFatturaXml(invoice, items) {
  const company = await loadCompany();
  if (!company.vat || !company.name) {
    const e = new Error(
      'Dati aziendali incompleti: compila ragione sociale e Partita IVA in Impostazioni → Dati aziendali e fiscali.'
    );
    e.code = 'COMPANY_NOT_CONFIGURED';
    throw e;
  }

  let order = null;
  if (invoice.order_id) {
    try {
      const [[o]] = await pool.execute(
        `SELECT shipping_cost, payment_status, discount_code, discount_amount,
                gift_card_code, gift_card_amount,
                shipping_address, shipping_citta, shipping_cap, shipping_paese,
                billing_nome, billing_address, billing_citta,
                billing_cap, billing_provincia, billing_paese, billing_piva, billing_cf,
                billing_sdi, billing_pec
           FROM orders WHERE id = ?`,
        [invoice.order_id]
      );
      order = o || null;
    } catch (_) { order = null; }
  }

  return {
    xml: buildXml(invoice, items, order, company),
    filename: xmlFilename(invoice, company),
  };
}

module.exports = { generateFatturaXml, buildXml, loadCompany, countryCode, cap, code, esc };
