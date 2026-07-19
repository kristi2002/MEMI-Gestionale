'use strict';

/**
 * invoice-pdf.js — render an invoice (fattura) to a PDF Buffer.
 *
 * pdfkit (built-in Helvetica, no font files) + sharp for product thumbnails.
 * The renderer does BEST-EFFORT DB enrichment: from the invoice's order_id and
 * the order_items' product_ids it pulls order-level fields (payment method/status,
 * order date, billing snapshot) and each product's first image + category/colour,
 * so every line shows a picture and its details. Every DB / image / file step is
 * wrapped: a missing product, an unreadable file, or no DB simply renders a leaner
 * PDF — generation never throws because enrichment failed.
 *
 * Used by:
 *   • GET /api/admin/invoices/:id/pdf   (download button on the Fatture table)
 *   • the shipping-confirmation email    (attached as F-YYYY-NNNN.pdf)
 *
 * VAT model matches invoicing.js: prices are IVA-inclusive, imponibile + IVA = totale.
 * NOTE: pdfkit's built-in Helvetica is WinAnsi-encoded — keep all copy to latin-1
 * (€ · à are fine; ✓ and emoji are NOT and must never appear in the PDF).
 */

const path        = require('path');
const fs          = require('fs');
const PDFDocument = require('pdfkit');

// sharp + the uploads dir are needed to embed product images (WebP → JPEG for
// pdfkit). Loaded defensively so the renderer still works if either is absent.
let sharp = null;
try { sharp = require('sharp'); } catch (_) { sharp = null; }
let UPLOADS_DIR = null;
try { ({ UPLOADS_DIR } = require('./images')); } catch (_) { UPLOADS_DIR = null; }

/* ── palette (house style) ─────────────────────────────────────────── */
const INK = '#3B2B2B', ACCENT = '#c9897a', MUTED = '#8a7a7a',
      FAINT = '#b3a6a6', LINE = '#e7ded7', CREAM = '#faf7f4', ZEBRA = '#fbf9f7';

const PAYMENT_LABEL = { carta: 'Carta di credito', paypal: 'PayPal', klarna: 'Klarna' };
const PAYSTATUS = {
  pagato:     { label: 'PAGATA',     bg: '#e9f6ee', fg: '#2d7a4f' },
  in_attesa:  { label: 'IN ATTESA',  bg: '#fbf1dd', fg: '#a9791f' },
  rimborsato: { label: 'RIMBORSATA', bg: '#f2ecef', fg: '#8a5a6a' },
  fallito:    { label: 'NON RIUSCITO', bg: '#fbe9e9', fg: '#b23b3b' },
};

function eur(n)  { return '€ ' + (Number(n) || 0).toFixed(2).replace('.', ','); }
function s(v)    { return (v == null ? '' : String(v)).trim(); }
function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('it-IT');
}

function company() {
  return {
    name:  process.env.COMPANY_NAME    || 'Memi Abbigliamento',
    addr:  process.env.COMPANY_ADDRESS || 'Via della Moda 12, 20121 Milano (MI), Italia',
    vat:   process.env.COMPANY_VAT     || 'IT01234567890',
    email: process.env.COMPANY_EMAIL   || 'amministrazione@memi.testdemo.it',
    site:  process.env.COMPANY_SITE    || 'memi.testdemo.it',
  };
}

/* ── enrichment (all best-effort) ──────────────────────────────────── */

// Resolve a product's stored images JSON to a square JPEG buffer pdfkit can embed.
async function thumbFor(imagesJson) {
  if (!sharp || !UPLOADS_DIR) return null;
  let arr;
  try { arr = typeof imagesJson === 'string' ? JSON.parse(imagesJson || '[]') : (imagesJson || []); }
  catch (_) { return null; }
  if (!Array.isArray(arr) || !arr.length) return null;
  const first = arr[0];
  const url = typeof first === 'string' ? first : (first && (first.thumb || first.card || first.full));
  if (!url) return null;
  const base = String(url).split('/').pop();
  if (!base || base.indexOf('..') !== -1) return null;            // no traversal
  const fp = path.join(UPLOADS_DIR, base);
  if (!fp.startsWith(UPLOADS_DIR) || !fs.existsSync(fp)) return null; // local files only
  try { return await sharp(fp).resize(160, 160, { fit: 'cover' }).jpeg({ quality: 82 }).toBuffer(); }
  catch (_) { return null; }
}

// Pull order-level detail + per-item product image/category/colour.
async function enrich(invoice, items) {
  const out = { order: null, thumbs: new Map(), cats: new Map(), colors: new Map() };
  let pool = null;
  try { ({ pool } = require('./db')); } catch (_) { return out; }
  if (!pool) return out;

  if (invoice && invoice.order_id) {
    try {
      const [[o]] = await pool.execute(
        `SELECT payment_method, payment_status, created_at, subtotal, shipping_cost,
                billing_same_as_shipping, billing_nome, billing_address, billing_citta,
                billing_cap, billing_provincia, billing_paese, billing_piva, billing_cf,
                billing_sdi, billing_pec
           FROM orders WHERE id = ?`, [invoice.order_id]);
      if (o) out.order = o;
    } catch (_) { /* leaner PDF */ }
  }

  const ids = [...new Set((items || []).map((it) => s(it.product_id)).filter(Boolean))];
  if (ids.length) {
    let rows = [];
    try { [rows] = await pool.query('SELECT id, images, categoria, colore FROM products WHERE id IN (?)', [ids]); }
    catch (_) { rows = []; }
    const byId = new Map(rows.map((r) => [String(r.id), r]));
    for (const id of ids) {
      const r = byId.get(id);
      if (!r) continue;
      if (r.categoria) out.cats.set(id, r.categoria);
      if (r.colore)    out.colors.set(id, r.colore);
      const buf = await thumbFor(r.images);
      if (buf) out.thumbs.set(id, buf);
    }
  }
  return out;
}

/* ── render ────────────────────────────────────────────────────────── */

function renderPdf(invoice, items, enriched) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const co    = company();
      const order = enriched && enriched.order;
      const left  = doc.page.margins.left;
      const right = doc.page.width - doc.page.margins.right;
      const width = right - left;

      // Column geometry for the items table.
      const colTot   = right - 62,  wTot   = 62;
      const colPrice = right - 140, wPrice = 60;
      const colQty   = right - 210, wQty   = 44;
      const imgX = left, imgS = 44;
      const descX = left + imgS + 12;
      const descW = colQty - 12 - descX;

      /* ── Header: wordmark + company (left), meta box (right) ── */
      doc.fillColor(INK).font('Helvetica-Bold').fontSize(26)
        .text('Memi', left, 50, { continued: true });
      doc.fillColor(ACCENT).text('.');
      doc.fillColor(MUTED).font('Helvetica').fontSize(8.5)
        .text(co.addr,           left, 84, { width: width * 0.55 })
        .text('P.IVA ' + co.vat, left, 96)
        .text(co.email + '  ·  ' + co.site, left, 108);

      // Meta box (rounded, cream) on the right.
      const boxW = 200, boxX = right - boxW, boxY = 46;
      const metaLines = [
        ['Emessa il', fmtDate(invoice.created_at || invoice.issued_at)],
        ['Ordine',    s(invoice.order_number) || '—'],
      ];
      if (invoice.due_date) metaLines.push(['Scadenza', fmtDate(invoice.due_date)]);
      const boxH = 40 + metaLines.length * 14 + 10;
      doc.roundedRect(boxX, boxY, boxW, boxH, 7).fill(CREAM);
      doc.roundedRect(boxX, boxY, boxW, boxH, 7).lineWidth(0.8).stroke(LINE);
      const bpad = 14;
      doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(8.5)
        .text('F A T T U R A', boxX + bpad, boxY + 12, { characterSpacing: 0.5 });
      doc.fillColor(INK).font('Helvetica-Bold').fontSize(15)
        .text(s(invoice.invoice_number) || '—', boxX + bpad, boxY + 24);
      let my = boxY + 46;
      doc.font('Helvetica').fontSize(9);
      for (const [k, v] of metaLines) {
        doc.fillColor(MUTED).text(k, boxX + bpad, my, { width: 60 });
        doc.fillColor(INK).text(v, boxX + bpad + 60, my, { width: boxW - bpad * 2 - 60, align: 'right' });
        my += 14;
      }

      /* ── Bill-to + payment (two headed columns) ── */
      let y = Math.max(128, boxY + boxH + 22);
      const colGap = 30;
      const halfW  = (width - colGap) / 2;
      const rightColX = left + halfW + colGap;

      const sectionHead = (label, x) => {
        doc.fillColor(FAINT).font('Helvetica-Bold').fontSize(8.5)
          .text(label.toUpperCase(), x, y, { characterSpacing: 0.4 });
        doc.moveTo(x, y + 13).lineTo(x + 34, y + 13).lineWidth(1.4).strokeColor(ACCENT).stroke();
      };
      sectionHead('Fatturato a', left);
      sectionHead('Pagamento & ordine', rightColX);

      // Left column — customer / billing party.
      const fullName = (s(invoice.customer_nome) + ' ' + s(invoice.customer_cognome)).trim() || '—';
      let bt;
      if (order && Number(order.billing_same_as_shipping) === 0) {
        const cityLine = [s(order.billing_cap), s(order.billing_citta),
          order.billing_provincia ? '(' + s(order.billing_provincia) + ')' : ''].filter(Boolean).join(' ');
        bt = {
          name: s(order.billing_nome) || fullName,
          addr: [s(order.billing_address), cityLine, s(order.billing_paese)].filter(Boolean).join(', '),
          cf:   s(order.billing_cf)   || s(invoice.customer_cf),
          piva: s(order.billing_piva) || s(invoice.customer_piva),
          sdi:  s(order.billing_sdi),
          pec:  s(order.billing_pec),
        };
      } else {
        bt = { name: fullName, addr: s(invoice.indirizzo),
               cf: s(invoice.customer_cf), piva: s(invoice.customer_piva), sdi: '', pec: '' };
      }
      let ly = y + 22;
      doc.fillColor(INK).font('Helvetica-Bold').fontSize(11).text(bt.name, left, ly, { width: halfW });
      ly = doc.y + 2;
      doc.font('Helvetica').fontSize(9.5).fillColor(MUTED);
      const lline = (t) => { if (!t) return; doc.text(t, left, ly, { width: halfW }); ly = doc.y + 1; };
      lline(s(invoice.customer_email));
      lline(bt.addr);
      if (bt.cf)   lline('C.F. '   + bt.cf);
      if (bt.piva) lline('P.IVA '  + bt.piva);
      if (bt.sdi)  lline('SDI '    + bt.sdi);
      if (bt.pec)  lline('PEC '    + bt.pec);

      // Right column — payment method / status / order date.
      let ry = y + 22;
      const rrow = (k, v) => {
        doc.fillColor(MUTED).font('Helvetica').fontSize(9.5).text(k, rightColX, ry, { width: 90 });
        doc.fillColor(INK).font('Helvetica-Bold').fontSize(9.5)
          .text(v, rightColX + 92, ry, { width: halfW - 92, align: 'right' });
        ry += 16;
      };
      if (order) {
        rrow('Metodo', PAYMENT_LABEL[order.payment_method] || s(order.payment_method) || '—');
        rrow('Data ordine', fmtDate(order.created_at));
      }
      // Payment-status pill.
      const ps = order && PAYSTATUS[order.payment_status];
      if (ps) {
        doc.fillColor(MUTED).font('Helvetica').fontSize(9.5).text('Stato', rightColX, ry, { width: 90 });
        const pillW = doc.widthOfString(ps.label, { fontSize: 8.5 }) + 18;
        const pillX = rightColX + halfW - pillW;
        doc.roundedRect(pillX, ry - 2, pillW, 16, 8).fill(ps.bg);
        doc.fillColor(ps.fg).font('Helvetica-Bold').fontSize(8.5)
          .text(ps.label, pillX, ry + 2, { width: pillW, align: 'center', characterSpacing: 0.3 });
        ry += 18;
      }
      doc.fillColor(MUTED).font('Helvetica').fontSize(9.5).text('Totale', rightColX, ry, { width: 90 });
      doc.fillColor(INK).font('Helvetica-Bold').fontSize(11)
        .text(eur(invoice.total), rightColX + 92, ry - 1, { width: halfW - 92, align: 'right' });
      ry += 18;

      /* ── Items table ── */
      y = Math.max(ly, ry) + 26;

      const drawTableHead = (yy) => {
        doc.roundedRect(left, yy, width, 22, 4).fill(INK);
        doc.fillColor('#fff').font('Helvetica-Bold').fontSize(8.5);
        doc.text('ARTICOLO', descX, yy + 7, { width: descW, characterSpacing: 0.3 });
        doc.text('Q.TÀ', colQty, yy + 7, { width: wQty, align: 'right' });
        doc.text('PREZZO',  colPrice, yy + 7, { width: wPrice, align: 'right' });
        doc.text('TOTALE',  colTot, yy + 7, { width: wTot, align: 'right' });
        return yy + 22 + 6;
      };
      y = drawTableHead(y);

      const rows = items && items.length
        ? items
        : [{ product_name: invoice.note || 'Ordine', qty: 1, price: invoice.total }];

      let zebra = false;
      for (const it of rows) {
        const qty   = Number(it.qty) || 1;
        const price = Number(it.price) || 0;
        const pid   = s(it.product_id);
        const name  = s(it.product_name) || 'Prodotto';

        // Detail sub-line: category · size · colour · code.
        const cat    = enriched.cats.get(pid);
        const colore = s(it.colore) || enriched.colors.get(pid);
        const detail = [
          cat ? String(cat) : '',
          it.taglia ? 'Taglia ' + s(it.taglia) : '',
          colore ? String(colore) : '',
          pid ? 'Cod. ' + pid : '',
        ].filter(Boolean).join('   ·   ');

        const nameH   = doc.font('Helvetica-Bold').fontSize(10).heightOfString(name, { width: descW });
        const detailH = detail ? doc.font('Helvetica').fontSize(8.5).heightOfString(detail, { width: descW }) : 0;
        const rowH    = Math.max(imgS + 10, nameH + detailH + 14);

        // Page break — repeat the table header on the new page.
        if (y + rowH > doc.page.height - 150) {
          doc.addPage();
          y = 60;
          y = drawTableHead(y);
          zebra = false;
        }

        if (zebra) doc.rect(left, y - 3, width, rowH).fill(ZEBRA);
        zebra = !zebra;

        // Thumbnail (or a soft placeholder).
        const buf = enriched.thumbs.get(pid);
        const iy = y + (rowH - imgS) / 2 - 3;
        if (buf) {
          try { doc.image(buf, imgX, iy, { width: imgS, height: imgS }); }
          catch (_) { doc.roundedRect(imgX, iy, imgS, imgS, 4).fill(CREAM); }
        } else {
          doc.roundedRect(imgX, iy, imgS, imgS, 4).fill(CREAM);
          doc.fillColor(FAINT).font('Helvetica-Bold').fontSize(13)
            .text((name[0] || '—').toUpperCase(), imgX, iy + imgS / 2 - 8, { width: imgS, align: 'center' });
        }
        doc.roundedRect(imgX, iy, imgS, imgS, 4).lineWidth(0.6).stroke(LINE);

        // Name + detail + numbers.
        const ty = y + (rowH - (nameH + detailH + 2)) / 2 - 1;
        doc.fillColor(INK).font('Helvetica-Bold').fontSize(10).text(name, descX, ty, { width: descW });
        if (detail) doc.fillColor(MUTED).font('Helvetica').fontSize(8.5).text(detail, descX, ty + nameH + 2, { width: descW });

        const numY = y + rowH / 2 - 6;
        doc.fillColor(INK).font('Helvetica').fontSize(10);
        doc.text(String(qty),        colQty,   numY, { width: wQty,   align: 'right' });
        doc.text(eur(price),         colPrice, numY, { width: wPrice, align: 'right' });
        doc.font('Helvetica-Bold').text(eur(price * qty), colTot, numY, { width: wTot, align: 'right' });

        y += rowH;
        doc.moveTo(left, y).lineTo(right, y).lineWidth(0.5).strokeColor(LINE).stroke();
        y += 4;
      }

      /* ── Totals ── */
      y += 14;
      if (y > doc.page.height - 170) { doc.addPage(); y = 60; }
      const rate      = Number(invoice.tax_rate) || 0;
      const panelX    = right - 250, panelW = 250;
      const labelX    = panelX, labelW = 150;
      const valX      = panelX + 150, valW = 100;
      const totRow = (label, value, opts = {}) => {
        doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.bold ? 12 : 10)
          .fillColor(opts.bold ? INK : MUTED)
          .text(label, labelX, y, { width: labelW - 8, align: 'right' });
        doc.fillColor(INK).font(opts.bold ? 'Helvetica-Bold' : 'Helvetica')
          .text(value, valX, y, { width: valW, align: 'right' });
        y += opts.bold ? 22 : 17;
      };
      totRow('Imponibile', eur(invoice.subtotal));
      totRow('IVA (' + rate + '%)', eur(invoice.tax_amount));
      // Emphasis band behind the grand total.
      doc.roundedRect(panelX - 6, y - 4, panelW + 6, 26, 5).fill(CREAM);
      totRow('Totale', eur(invoice.total), { bold: true });
      if (order && Number(order.shipping_cost) > 0) {
        doc.fillColor(FAINT).font('Helvetica').fontSize(8)
          .text('Spedizione inclusa: ' + eur(order.shipping_cost), labelX, y + 2, { width: labelW + valW - 8, align: 'right' });
      }

      /* ── Note ── */
      if (invoice.note) {
        y += 26;
        if (y > doc.page.height - 150) { doc.addPage(); y = 60; }
        doc.fillColor(FAINT).font('Helvetica-Bold').fontSize(8.5).text('NOTE', left, y, { characterSpacing: 0.4 });
        doc.fillColor(MUTED).font('Helvetica').fontSize(9.5).text(s(invoice.note), left, y + 14, { width: width * 0.7 });
      }

      /* ── Footer on every page ── */
      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(range.start + i);
        const fy = doc.page.height - 62;
        doc.moveTo(left, fy).lineTo(right, fy).lineWidth(0.5).strokeColor(LINE).stroke();
        doc.fillColor(FAINT).font('Helvetica').fontSize(8)
          .text(co.name + '  ·  P.IVA ' + co.vat + '  ·  Documento generato automaticamente. Prezzi comprensivi di IVA.',
            left, fy + 8, { width: width * 0.8 });
        doc.text('Pagina ' + (i + 1) + ' di ' + range.count, right - 120, fy + 8, { width: 120, align: 'right' });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * @param {object} invoice  row from `invoices` (+ order_number)
 * @param {Array}  items    rows from `order_items` for the invoice's order
 * @returns {Promise<Buffer>}
 */
async function generateInvoicePdf(invoice, items = []) {
  const enriched = await enrich(invoice, items).catch(() => ({
    order: null, thumbs: new Map(), cats: new Map(), colors: new Map(),
  }));
  return renderPdf(invoice, items, enriched);
}

module.exports = { generateInvoicePdf };
