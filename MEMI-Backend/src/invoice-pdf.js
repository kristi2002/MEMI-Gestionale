'use strict';

/**
 * invoice-pdf.js — render an invoice (fattura) to a PDF Buffer.
 *
 * Pure pdfkit (built-in Helvetica, no font files, no native deps). Used by:
 *   • GET /api/admin/invoices/:id/pdf   (download button on the Fatture table)
 *   • the shipping-confirmation email    (attached as F-YYYY-NNNN.pdf)
 *
 * VAT model matches invoicing.js: prices are IVA-inclusive, imponibile + IVA = totale.
 */

const PDFDocument = require('pdfkit');

function eur(n) {
  return '€ ' + (Number(n) || 0).toFixed(2).replace('.', ',');
}
function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('it-IT');
}

/**
 * @param {object} invoice  row from `invoices` (+ order_number)
 * @param {Array}  items    rows from `order_items` for the invoice's order
 * @returns {Promise<Buffer>}
 */
function generateInvoicePdf(invoice, items = []) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const INK = '#3B2B2B';
      const MUTED = '#8a7a7a';
      const LINE = '#e5ddd6';
      const left = doc.page.margins.left;
      const right = doc.page.width - doc.page.margins.right;
      const width = right - left;

      // ── Header ──
      doc.fillColor(INK).font('Helvetica-Bold').fontSize(24).text('Memi', left, 50, { continued: true });
      doc.fillColor('#c9897a').text('.');
      doc.fillColor(MUTED).font('Helvetica').fontSize(9)
        .text('Memi Abbigliamento · Milano, Italia', left, 80);

      doc.fillColor(INK).font('Helvetica-Bold').fontSize(18)
        .text('FATTURA', left, 50, { width, align: 'right' });
      doc.fillColor(MUTED).font('Helvetica').fontSize(10)
        .text(invoice.invoice_number || '', left, 74, { width, align: 'right' })
        .text('Data: ' + fmtDate(invoice.created_at), left, 88, { width, align: 'right' });
      if (invoice.order_number) {
        doc.text('Ordine: ' + invoice.order_number, left, 102, { width, align: 'right' });
      }

      doc.moveTo(left, 125).lineTo(right, 125).strokeColor(LINE).stroke();

      // ── Bill-to ──
      let y = 145;
      doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(9).text('INTESTATARIO', left, y);
      y += 15;
      const fullName = `${invoice.customer_nome || ''} ${invoice.customer_cognome || ''}`.trim() || '—';
      doc.fillColor(INK).font('Helvetica').fontSize(11).text(fullName, left, y);
      y += 15;
      if (invoice.customer_email) { doc.fillColor(MUTED).fontSize(10).text(invoice.customer_email, left, y); y += 14; }
      if (invoice.indirizzo)      { doc.fillColor(MUTED).fontSize(10).text(invoice.indirizzo, left, y, { width: width * 0.6 }); y += 14; }
      if (invoice.customer_cf)    { doc.fillColor(MUTED).fontSize(10).text('C.F.: ' + invoice.customer_cf, left, y); y += 14; }
      if (invoice.customer_piva)  { doc.fillColor(MUTED).fontSize(10).text('P.IVA: ' + invoice.customer_piva, left, y); y += 14; }

      // ── Items table ──
      y = Math.max(y + 20, 250);
      const colQty = right - 190;
      const colPrice = right - 130;
      const colTot = right - 60;

      doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(9);
      doc.text('DESCRIZIONE', left, y);
      doc.text('Q.TÀ', colQty, y, { width: 50, align: 'right' });
      doc.text('PREZZO', colPrice, y, { width: 60, align: 'right' });
      doc.text('TOTALE', colTot, y, { width: 60, align: 'right' });
      y += 14;
      doc.moveTo(left, y).lineTo(right, y).strokeColor(LINE).stroke();
      y += 8;

      doc.font('Helvetica').fontSize(10).fillColor(INK);
      const rows = items.length
        ? items
        : [{ product_name: invoice.note || 'Ordine', qty: 1, price: invoice.total }];
      for (const it of rows) {
        if (y > doc.page.height - 160) { doc.addPage(); y = 60; }
        const qty = Number(it.qty) || 1;
        const price = Number(it.price) || 0;
        const nameParts = [it.product_name || 'Prodotto'];
        if (it.taglia) nameParts.push('Taglia ' + it.taglia);
        if (it.colore) nameParts.push(it.colore);
        doc.fillColor(INK).text(nameParts.join(' · '), left, y, { width: colQty - left - 10 });
        doc.text(String(qty), colQty, y, { width: 50, align: 'right' });
        doc.text(eur(price), colPrice, y, { width: 60, align: 'right' });
        doc.text(eur(price * qty), colTot, y, { width: 60, align: 'right' });
        y += Math.max(18, doc.heightOfString(nameParts.join(' · '), { width: colQty - left - 10 }));
      }

      // ── Totals ──
      y += 10;
      doc.moveTo(colPrice - 20, y).lineTo(right, y).strokeColor(LINE).stroke();
      y += 12;
      const totLabelX = colPrice - 60;
      const totLabelW = 100;
      const rate = Number(invoice.tax_rate) || 0;
      const line = (label, value, bold) => {
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 12 : 10).fillColor(bold ? INK : MUTED);
        doc.text(label, totLabelX, y, { width: totLabelW, align: 'right' });
        doc.fillColor(INK).text(value, colTot, y, { width: 60, align: 'right' });
        y += bold ? 20 : 16;
      };
      line('Imponibile', eur(invoice.subtotal));
      line(`IVA (${rate}%)`, eur(invoice.tax_amount));
      line('Totale', eur(invoice.total), true);

      // ── Footer ──
      const footY = doc.page.height - 90;
      doc.moveTo(left, footY).lineTo(right, footY).strokeColor(LINE).stroke();
      doc.fillColor(MUTED).font('Helvetica').fontSize(8)
        .text('Documento generato automaticamente da Memi Abbigliamento. Prezzi comprensivi di IVA.', left, footY + 10, { width, align: 'center' });
      if (invoice.note) {
        doc.text(invoice.note, left, footY + 26, { width, align: 'center' });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { generateInvoicePdf };
