/**
 * export.ts — bulk export in multiple formats, framework-agnostic.
 *
 * Given a set of columns (header + accessor) and rows, exports to:
 *   CSV · Excel (XLSX) · PDF · JSON · Print · Copy-to-clipboard
 *
 * xlsx + jspdf are OPTIONAL deps loaded on demand, so the core bundle stays
 * lean and the app still runs if they fail to install — those two formats just
 * report a friendly error instead.
 */

export type ExportFormat = 'csv' | 'xlsx' | 'pdf' | 'json' | 'print' | 'copy';

export interface ExportColumn<T> {
  header: string;
  accessor: (row: T) => string | number | null | undefined;
}

export interface ExportOptions<T> {
  rows: T[];
  columns: ExportColumn<T>[];
  filename: string; // without extension
  title?: string; // for PDF / print
}

function stamp(name: string): string {
  return `${name}_${new Date().toISOString().slice(0, 10)}`;
}

function cell<T>(col: ExportColumn<T>, row: T): string {
  const v = col.accessor(row);
  return v === null || v === undefined ? '' : String(v);
}

function toMatrix<T>(opts: ExportOptions<T>): { head: string[]; body: string[][] } {
  return {
    head: opts.columns.map((c) => c.header),
    body: opts.rows.map((r) => opts.columns.map((c) => cell(c, r))),
  };
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ── CSV ─────────────────────────────────────────────── */
function exportCsv<T>(opts: ExportOptions<T>) {
  const { head, body } = toMatrix(opts);
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const csv = [head, ...body].map((r) => r.map(esc).join(',')).join('\r\n');
  // BOM so Excel opens UTF-8 correctly.
  download(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), stamp(opts.filename) + '.csv');
}

/* ── JSON ────────────────────────────────────────────── */
function exportJson<T>(opts: ExportOptions<T>) {
  const data = opts.rows.map((r) => {
    const obj: Record<string, string> = {};
    for (const c of opts.columns) obj[c.header] = cell(c, r);
    return obj;
  });
  download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), stamp(opts.filename) + '.json');
}

/* ── XLSX (SheetJS, optional) ────────────────────────── */
async function exportXlsx<T>(opts: ExportOptions<T>) {
  const XLSX = await import('xlsx').catch(() => null);
  if (!XLSX) throw new Error("Modulo Excel non disponibile (esegui 'npm install').");
  const { head, body } = toMatrix(opts);
  const ws = XLSX.utils.aoa_to_sheet([head, ...body]);
  ws['!cols'] = head.map((h, i) => ({
    wch: Math.min(48, Math.max(h.length, ...body.map((r) => (r[i] || '').length)) + 2),
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Export');
  XLSX.writeFile(wb, stamp(opts.filename) + '.xlsx');
}

/* ── PDF (jsPDF + autotable, optional) ───────────────── */
async function exportPdf<T>(opts: ExportOptions<T>) {
  const jspdfMod = await import('jspdf').catch(() => null);
  const autoTableMod = await import('jspdf-autotable').catch(() => null);
  if (!jspdfMod || !autoTableMod) throw new Error("Modulo PDF non disponibile (esegui 'npm install').");
  const { head, body } = toMatrix(opts);
  const doc = new jspdfMod.jsPDF({ orientation: head.length > 5 ? 'landscape' : 'portrait' });
  const autoTable = (autoTableMod.default || autoTableMod) as (d: unknown, o: unknown) => void;
  doc.setFontSize(14);
  doc.text(opts.title || opts.filename, 14, 16);
  autoTable(doc, {
    head: [head],
    body,
    startY: 22,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [107, 107, 163] },
  });
  doc.save(stamp(opts.filename) + '.pdf');
}

/* ── Print ───────────────────────────────────────────── */
function exportPrint<T>(opts: ExportOptions<T>) {
  const { head, body } = toMatrix(opts);
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(opts.title || opts.filename)}</title>
    <style>body{font-family:Inter,system-ui,sans-serif;padding:24px;color:#171B22}
    h1{font-size:18px;margin:0 0 16px}
    table{border-collapse:collapse;width:100%;font-size:12px}
    th,td{border:1px solid #E7E9EE;padding:6px 8px;text-align:left}
    th{background:#EDECF6}</style></head><body>
    <h1>${esc(opts.title || opts.filename)}</h1>
    <table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>
    </body></html>`;
  const w = window.open('', '_blank');
  if (!w) throw new Error('Popup bloccato dal browser.');
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 250);
}

/* ── Copy (TSV to clipboard, pastes into Excel/Sheets) ─ */
async function exportCopy<T>(opts: ExportOptions<T>) {
  const { head, body } = toMatrix(opts);
  const tsv = [head, ...body].map((r) => r.join('\t')).join('\n');
  await navigator.clipboard.writeText(tsv);
}

export const EXPORT_LABELS: Record<ExportFormat, string> = {
  csv: 'CSV',
  xlsx: 'Excel (XLSX)',
  pdf: 'PDF',
  json: 'JSON',
  print: 'Stampa',
  copy: 'Copia negli appunti',
};

export async function exportData<T>(format: ExportFormat, opts: ExportOptions<T>): Promise<void> {
  switch (format) {
    case 'csv':
      return exportCsv(opts);
    case 'json':
      return exportJson(opts);
    case 'xlsx':
      return exportXlsx(opts);
    case 'pdf':
      return exportPdf(opts);
    case 'print':
      return exportPrint(opts);
    case 'copy':
      return exportCopy(opts);
  }
}
