import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { BarChart3, CoinsIcon, ShoppingBag, TrendingUp, Printer, FileDown, ChevronDown } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { KpiCard } from '@/components/common/kpi-card';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { DataTable } from '@/components/data-table/data-table';
import { StatusBadge } from '@/components/common/status-badge';
import { EmptyState } from '@/components/common/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { useReports } from '@/hooks/queries';
import { eur, int, num } from '@/lib/format';
import { statusLabel } from '@/lib/status';
import { cn } from '@/lib/utils';
import type { ReportsData } from '@/types';
import type { ExportColumn } from '@/lib/export';
import { toast } from 'sonner';

type CatRow = ReportsData['top_categories'][number];
type MonthRow = ReportsData['sales_by_month'][number];

const catExport: ExportColumn<CatRow>[] = [
  { header: 'Categoria', accessor: (c) => c.categoria },
  { header: 'Fatturato', accessor: (c) => eur(c.revenue) },
  { header: 'Unità', accessor: (c) => c.units },
];

/* ── Chart helpers ─────────────────────────────────────────────────────────── */

const MONTHS_IT = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const MONTHS_IT_FULL = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

interface Bucket { key: string; short: string; monthIdx: number; year: number; revenue: number; orders: number }

/** Zero-fill the API's sparse month list into a full trailing 12-month window,
 *  so the axis always shows a year even when only one month has sales. */
function last12Months(data: MonthRow[]): Bucket[] {
  const map = new Map(data.map((d) => [d.month, d]));
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const out: Bucket[] = [];
  for (let i = 0; i < 12; i++) {
    const dt = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
    const found = map.get(key);
    out.push({
      key,
      short: MONTHS_IT[dt.getMonth()],
      monthIdx: dt.getMonth(),
      year: dt.getFullYear(),
      revenue: found ? num(found.revenue) : 0,
      orders: found ? num(found.orders) : 0,
    });
  }
  return out;
}

/** Round a max value up to a "nice" axis ceiling (1/2/2.5/5 × 10ⁿ). */
function niceCeil(v: number): number {
  if (v <= 0) return 100;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * pow;
}

/** Compact currency for axis ticks: €1,2k / €950 / €0. */
function compactEur(v: number): string {
  if (v >= 1000) {
    const k = v / 1000;
    return '€' + (Number.isInteger(k) ? k.toString() : k.toFixed(1).replace('.', ',')) + 'k';
  }
  return '€' + Math.round(v);
}

const CHART_H = 224;

/** Interactive 12-month revenue bar chart — Y-axis ticks, gridlines, and a
 *  hover/click tooltip showing exact revenue + order count per month. */
function MonthlyRevenueChart({ data }: { data: MonthRow[] }) {
  const [active, setActive] = useState<number | null>(null);
  const months = useMemo(() => last12Months(data), [data]);

  const maxRev = Math.max(...months.map((m) => m.revenue), 0);
  const axisMax = niceCeil(maxRev);
  // ticks top→bottom
  const ticks = [1, 0.75, 0.5, 0.25, 0].map((f) => axisMax * f);

  const totalRev = months.reduce((s, m) => s + m.revenue, 0);
  const totalOrders = months.reduce((s, m) => s + m.orders, 0);
  const best = months.reduce<Bucket | null>((b, m) => (m.revenue > (b?.revenue ?? -1) ? m : b), null);
  const hasData = totalRev > 0;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
        <span className="text-muted-foreground">Totale 12 mesi: <b className="text-foreground">{eur(totalRev)}</b></span>
        <span className="text-muted-foreground">Ordini: <b className="text-foreground">{int(totalOrders)}</b></span>
        {best && best.revenue > 0 && (
          <span className="text-muted-foreground">Mese migliore: <b className="text-foreground">{MONTHS_IT_FULL[best.monthIdx]} ({eur(best.revenue)})</b></span>
        )}
      </div>

      <div className="flex gap-2">
        {/* Y axis */}
        <div className="relative w-12 shrink-0" style={{ height: CHART_H }}>
          {ticks.map((t, i) => (
            <span
              key={i}
              className="absolute right-1 -translate-y-1/2 text-[10px] tabular-nums text-muted-foreground"
              style={{ top: `${(i / (ticks.length - 1)) * 100}%` }}
            >
              {compactEur(t)}
            </span>
          ))}
        </div>

        {/* Plot */}
        <div className="min-w-0 flex-1">
          <div className="relative" style={{ height: CHART_H }}>
            {/* gridlines */}
            {ticks.map((_, i) => (
              <div
                key={i}
                className={cn('absolute inset-x-0 border-t', i === ticks.length - 1 ? 'border-border' : 'border-border/50')}
                style={{ top: `${(i / (ticks.length - 1)) * 100}%` }}
              />
            ))}
            {/* bars */}
            <div className="absolute inset-0 flex items-end gap-1 sm:gap-1.5">
              {months.map((m, i) => {
                const h = axisMax > 0 ? (m.revenue / axisMax) * 100 : 0;
                const on = active === i;
                return (
                  <div
                    key={m.key}
                    className="relative flex h-full flex-1 cursor-pointer items-end justify-center"
                    onMouseEnter={() => setActive(i)}
                    onMouseLeave={() => setActive((a) => (a === i ? null : a))}
                    onClick={() => setActive((a) => (a === i ? null : i))}
                  >
                    {on && (
                      <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border bg-popover px-2.5 py-1.5 text-center shadow-md">
                        <div className="text-xs font-semibold text-foreground">{eur(m.revenue)}</div>
                        <div className="mt-0.5 text-[10px] text-muted-foreground">
                          {int(m.orders)} {m.orders === 1 ? 'ordine' : 'ordini'} · {MONTHS_IT_FULL[m.monthIdx]} {m.year}
                        </div>
                      </div>
                    )}
                    <div
                      className={cn(
                        'w-full max-w-[34px] rounded-t transition-colors',
                        on ? 'bg-primary' : 'bg-primary/60 hover:bg-primary/80',
                      )}
                      style={{ height: `${m.revenue > 0 ? Math.max(h, 1.5) : 0}%` }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
          {/* X axis labels */}
          <div className="mt-2 flex gap-1 sm:gap-1.5">
            {months.map((m, i) => (
              <div
                key={m.key}
                className={cn(
                  'flex-1 text-center text-[10px] tabular-nums',
                  active === i ? 'font-semibold text-foreground' : 'text-muted-foreground',
                )}
              >
                {m.short}
                {m.monthIdx === 0 && <span className="hidden text-muted-foreground/70 sm:inline"> ’{String(m.year).slice(2)}</span>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {!hasData && (
        <p className="mt-3 text-center text-xs text-muted-foreground">Nessun ordine pagato negli ultimi 12 mesi.</p>
      )}
    </div>
  );
}

/** Horizontal bars for "orders by status" — count + share of total per status. */
function StatusBars({ data }: { data: ReportsData['orders_by_status'] }) {
  if (!data.length) return <p className="py-4 text-center text-sm text-muted-foreground">Nessun ordine</p>;
  const total = data.reduce((s, r) => s + num(r.count), 0);
  const max = Math.max(...data.map((r) => num(r.count)), 1);
  return (
    <div className="space-y-3">
      {data.map((r) => {
        const c = num(r.count);
        const pct = total > 0 ? Math.round((c / total) * 100) : 0;
        return (
          <div key={r.stato} className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <StatusBadge code={r.stato} />
              <span className="text-sm font-semibold tabular-nums">
                {int(c)} <span className="font-normal text-muted-foreground">· {pct}%</span>
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary/70 transition-all" style={{ width: `${(c / max) * 100}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Report export (Stampa / Scarica PDF) ──────────────────────────────────── */

/** Open a print-friendly window with every report section, then trigger print. */
function openPrintView(d: ReportsData) {
  const esc = (s: unknown) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
  const section = (title: string, head: string[], rows: (string | number)[][]) => `
    <h2>${esc(title)}</h2>
    <table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.length ? rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${head.length}">Nessun dato</td></tr>`}</tbody></table>`;

  const today = new Date().toLocaleDateString('it-IT');
  const html = `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Report MEMI — ${esc(today)}</title>
    <style>body{font-family:Inter,system-ui,sans-serif;padding:28px;color:#171B22}
    h1{font-size:20px;margin:0 0 2px} .sub{color:#666;font-size:12px;margin:0 0 18px}
    h2{font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:#444;margin:20px 0 8px}
    table{border-collapse:collapse;width:100%;font-size:12px;margin-bottom:6px}
    th,td{border:1px solid #E7E9EE;padding:6px 9px;text-align:left}
    th{background:#EDECF6} td:last-child,th:last-child{text-align:right}
    @media print{body{padding:0}}</style></head><body>
    <h1>Report vendite &amp; performance</h1>
    <p class="sub">MEMI Abbigliamento · anno in corso · generato il ${esc(today)}</p>
    ${section('Riepilogo', ['Metrica', 'Valore'], [
      ['Fatturato YTD', eur(d.summary.revenue_ytd)],
      ['Ordini YTD', int(d.summary.orders_ytd)],
      ['Valore medio ordine', eur(d.summary.aov)],
    ])}
    ${section('Fatturato mensile (12 mesi)', ['Mese', 'Ordini', 'Fatturato'], d.sales_by_month.map((m) => [m.month, int(m.orders), eur(m.revenue)]))}
    ${section('Ordini per stato', ['Stato', 'Ordini'], d.orders_by_status.map((s) => [statusLabel(s.stato), int(s.count)]))}
    ${section('Categorie più redditizie', ['Categoria', 'Unità', 'Fatturato'], d.top_categories.map((c) => [c.categoria, int(c.units), eur(c.revenue)]))}
    </body></html>`;

  const w = window.open('', '_blank');
  if (!w) { toast.error('Popup bloccato dal browser — consenti i popup per stampare il report.'); return; }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => { try { w.print(); } catch { /* preview/headless: content is still viewable */ } }, 300);
}

/** Generate and download a real PDF file (jsPDF + autotable, loaded on demand). */
async function downloadReportPdf(d: ReportsData) {
  const jspdfMod = await import('jspdf').catch(() => null);
  const autoTableMod = await import('jspdf-autotable').catch(() => null);
  if (!jspdfMod || !autoTableMod) { toast.error("Modulo PDF non disponibile (esegui 'npm install')."); return; }
  const autoTable = (autoTableMod.default || autoTableMod) as (doc: unknown, opts: unknown) => void;
  const doc = new jspdfMod.jsPDF();
  const today = new Date().toLocaleDateString('it-IT');

  doc.setFontSize(16);
  doc.text('Report vendite & performance', 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(`MEMI Abbigliamento · anno in corso · generato il ${today}`, 14, 24);
  doc.setTextColor(23);

  let y = 32;
  const section = (title: string, head: string[], body: (string | number)[][]) => {
    doc.setFontSize(11);
    doc.text(title, 14, y);
    autoTable(doc, {
      head: [head],
      body: body.length ? body : [['Nessun dato']],
      startY: y + 3,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [107, 107, 163] },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = ((doc as any).lastAutoTable?.finalY ?? y + 10) + 10;
  };

  section('Riepilogo', ['Metrica', 'Valore'], [
    ['Fatturato YTD', eur(d.summary.revenue_ytd)],
    ['Ordini YTD', int(d.summary.orders_ytd)],
    ['Valore medio ordine', eur(d.summary.aov)],
  ]);
  section('Fatturato mensile (12 mesi)', ['Mese', 'Ordini', 'Fatturato'], d.sales_by_month.map((m) => [m.month, int(m.orders), eur(m.revenue)]));
  section('Ordini per stato', ['Stato', 'Ordini'], d.orders_by_status.map((s) => [statusLabel(s.stato), int(s.count)]));
  section('Categorie più redditizie', ['Categoria', 'Unità', 'Fatturato'], d.top_categories.map((c) => [c.categoria, int(c.units), eur(c.revenue)]));

  doc.save(`report_memi_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function ReportsPage() {
  const query = useReports();
  const d = query.data;

  const maxCatRev = useMemo(
    () => Math.max(...(d?.top_categories ?? []).map((c) => num(c.revenue)), 1),
    [d],
  );

  const catColumns = useMemo<ColumnDef<CatRow, unknown>[]>(
    () => [
      { accessorKey: 'categoria', header: 'Categoria', cell: ({ getValue }) => <span className="font-medium capitalize">{getValue() as string}</span> },
      { accessorKey: 'units', header: 'Unità', cell: ({ getValue }) => <span className="text-muted-foreground">{int(getValue())}</span> },
      {
        accessorKey: 'revenue',
        header: 'Fatturato',
        cell: ({ getValue }) => {
          const v = num(getValue());
          return (
            <div className="min-w-[120px] space-y-1">
              <span className="font-semibold">{eur(v)}</span>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary/70" style={{ width: `${(v / maxCatRev) * 100}%` }} />
              </div>
            </div>
          );
        },
      },
    ],
    [maxCatRev],
  );

  return (
    <div>
      <PageHeader
        title="Report"
        subtitle="Report di vendita e performance (anno in corso)."
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={!d || query.isLoading}>
                <Printer /> Stampa / PDF <ChevronDown className="opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => d && openPrintView(d)}>
                <Printer /> Stampa
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => { if (d) void downloadReportPdf(d); }}>
                <FileDown /> Scarica PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Fatturato YTD" value={eur(d?.summary.revenue_ytd ?? 0)} icon={CoinsIcon} tone="success" loading={query.isLoading} />
        <KpiCard label="Ordini YTD" value={int(d?.summary.orders_ytd ?? 0)} icon={ShoppingBag} tone="primary" loading={query.isLoading} />
        <KpiCard label="Valore medio ordine" value={eur(d?.summary.aov ?? 0)} icon={TrendingUp} tone="info" loading={query.isLoading} />
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Fatturato mensile (12 mesi)</CardTitle>
        </CardHeader>
        <CardContent>{query.isLoading ? <Skeleton className="h-64 w-full" /> : <MonthlyRevenueChart data={d?.sales_by_month ?? []} />}</CardContent>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Ordini per stato</CardTitle>
          </CardHeader>
          <CardContent>
            {query.isLoading ? (
              <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
            ) : (
              <StatusBars data={d?.orders_by_status ?? []} />
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Categorie più redditizie</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <DataTable
              columns={catColumns}
              data={d?.top_categories ?? []}
              getRowId={(c) => c.categoria}
              searchValue={(c) => c.categoria}
              searchPlaceholder="Cerca categoria…"
              exportName="report_categorie"
              exportTitle="Categorie per fatturato"
              exportColumns={catExport}
              isLoading={query.isLoading}
              pageSize={10}
              emptyState={<EmptyState icon={BarChart3} title="Nessun dato" />}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
