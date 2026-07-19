import { useState } from 'react';
import { CoinsIcon, ShoppingBag, Eye, TrendingUp, Percent } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { KpiCard } from '@/components/common/kpi-card';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useDashboard, useRangeKpis } from '@/hooks/queries';
import { eur, int, num } from '@/lib/format';
import type { ChartPoint } from '@/types';

const fmtDay = (s: string) => {
  const d = new Date(s);
  return Number.isNaN(+d) ? s : d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
};

function DualChart({ data }: { data: ChartPoint[] }) {
  const W = 800;
  const H = 260;
  const PX = 10;
  const PY = 20;
  const [hover, setHover] = useState<number | null>(null);
  if (!data || data.length < 2) {
    return <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">Nessun dato nel periodo</div>;
  }
  const rev = data.map((d) => num(d.revenue));
  const ord = data.map((d) => Number(d.orders) || 0);
  const maxRev = Math.max(...rev, 1);
  const maxOrd = Math.max(...ord, 1);
  const n = data.length;
  const xAt = (i: number) => PX + (i / (n - 1)) * (W - 2 * PX);
  const yAt = (v: number, maxV: number) => H - PY - (v / maxV) * (H - 2 * PY);
  const toPts = (vals: number[], maxV: number) => vals.map((v, i) => `${xAt(i).toFixed(1)},${yAt(v, maxV).toFixed(1)}`);
  const revLine = toPts(rev, maxRev).map((p, i) => (i === 0 ? 'M' : 'L') + p).join(' ');
  const revArea = `${revLine} L${W - PX},${H - PY} L${PX},${H - PY} Z`;
  const ordLine = toPts(ord, maxOrd).map((p, i) => (i === 0 ? 'M' : 'L') + p).join(' ');

  // Percent helpers so HTML overlays (dots, tooltip) line up with the stretched SVG.
  const xPct = (i: number) => (xAt(i) / W) * 100;
  const yPct = (v: number, maxV: number) => (yAt(v, maxV) / H) * 100;

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const i = Math.min(n - 1, Math.max(0, Math.round(((frac * W - PX) / (W - 2 * PX)) * (n - 1))));
    setHover(i);
  }

  const hi = hover;
  const tipAlign = hi == null ? undefined : xPct(hi) < 15 ? 'translateX(0)' : xPct(hi) > 85 ? 'translateX(-100%)' : 'translateX(-50%)';

  return (
    <div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-[260px] w-full" preserveAspectRatio="none">
          <defs>
            <linearGradient id="rev2" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.25" />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0, 1, 2, 3].map((g) => {
            const gy = PY + g * ((H - 2 * PY) / 3);
            return <line key={g} x1={PX} x2={W - PX} y1={gy} y2={gy} stroke="hsl(var(--border))" strokeWidth={1} />;
          })}
          <path d={revArea} fill="url(#rev2)" />
          <path d={revLine} fill="none" stroke="hsl(var(--primary))" strokeWidth={2.5} strokeLinejoin="round" />
          <path d={ordLine} fill="none" stroke="hsl(var(--info))" strokeWidth={2} strokeDasharray="5 3" strokeLinejoin="round" />
          {hi != null && (
            <line x1={xAt(hi)} x2={xAt(hi)} y1={PY} y2={H - PY} stroke="hsl(var(--muted-foreground))" strokeWidth={1} strokeDasharray="3 3" opacity={0.6} />
          )}
        </svg>

        {/* Top-left max-revenue reference so the y-axis has a scale. */}
        <span className="pointer-events-none absolute left-1 top-0 text-[10px] text-muted-foreground">{eur(maxRev)}</span>

        {/* Hover point markers — HTML dots (SVG circles distort under preserveAspectRatio=none). */}
        {hi != null && (
          <>
            <span className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-primary" style={{ left: `${xPct(hi)}%`, top: `${yPct(rev[hi], maxRev)}%` }} />
            <span className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-info" style={{ left: `${xPct(hi)}%`, top: `${yPct(ord[hi], maxOrd)}%` }} />
            <div className="pointer-events-none absolute z-10 min-w-[128px] rounded-md border bg-popover p-2 text-xs shadow-md" style={{ left: `${xPct(hi)}%`, top: 4, transform: tipAlign }}>
              <div className="mb-1 font-medium">{fmtDay(data[hi].day)}</div>
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 text-muted-foreground"><span className="h-2 w-2 rounded-full bg-primary" /> Fatturato</span>
                <span className="font-semibold">{eur(rev[hi])}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 text-muted-foreground"><span className="h-2 w-2 rounded-full bg-info" /> Ordini</span>
                <span className="font-semibold">{int(ord[hi])}</span>
              </div>
            </div>
          </>
        )}

        {/* Transparent hit layer captures the mouse across the full plot. */}
        <div className="absolute inset-0 cursor-crosshair" onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
      </div>

      {/* X axis — first / middle / last data point. */}
      <div className="mt-1.5 flex justify-between px-1 text-[10px] text-muted-foreground">
        <span>{fmtDay(data[0].day)}</span>
        <span>{fmtDay(data[Math.floor((n - 1) / 2)].day)}</span>
        <span>{fmtDay(data[n - 1].day)}</span>
      </div>
    </div>
  );
}

const PERIODS = [
  { d: 7, l: '7 giorni' },
  { d: 30, l: '30 giorni' },
  { d: 90, l: '90 giorni' },
  { d: 365, l: '12 mesi' },
];

export function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const { chart, top } = useDashboard(days);
  const kpis = useRangeKpis(days); // period-aware KPIs (last N days vs the N before) — respects the selector
  const k = kpis.data;
  const periodLabel = PERIODS.find((p) => p.d === days)?.l ?? `${days} giorni`;

  return (
    <div>
      <PageHeader
        title="Statistiche"
        subtitle="Panoramica delle performance dello store."
        actions={
          <div className="inline-flex rounded-md border p-0.5">
            {PERIODS.map((p) => (
              <button
                key={p.d}
                type="button"
                onClick={() => setDays(p.d)}
                className={
                  'rounded px-2.5 py-1 text-xs font-medium transition-colors ' +
                  (days === p.d ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')
                }
              >
                {p.l}
              </button>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <KpiCard label="Fatturato" value={k?.revenue.value ?? '…'} delta={k?.revenue.delta} up={k?.revenue.up} icon={CoinsIcon} tone="success" loading={kpis.isLoading} />
        <KpiCard label="Ordini" value={k?.orders.value ?? '…'} delta={k?.orders.delta} up={k?.orders.up} icon={ShoppingBag} tone="primary" loading={kpis.isLoading} />
        <KpiCard label="Visitatori" value={k?.visitors.value ?? '…'} delta={k?.visitors.delta} up={k?.visitors.up} icon={Eye} tone="info" loading={kpis.isLoading} />
        <KpiCard label="Conversione" value={k?.conversion?.value ?? '…'} delta={k?.conversion?.delta} up={k?.conversion?.up} icon={Percent} tone="warning" loading={kpis.isLoading} />
        <KpiCard label="AOV" value={k?.aov.value ?? '…'} delta={k?.aov.delta} up={k?.aov.up} icon={TrendingUp} tone="success" loading={kpis.isLoading} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        KPI riferiti agli <strong>ultimi {periodLabel}</strong>, con variazione rispetto al periodo precedente. Conversione = ordini ÷ visitatori.
      </p>

      <Card className="mt-4">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Vendite & ordini ({periodLabel})</CardTitle>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-3 rounded bg-primary" /> Fatturato</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-3 rounded bg-info" /> Ordini</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {chart.isLoading ? <Skeleton className="h-[260px] w-full" /> : <DualChart data={chart.data ?? []} />}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Prodotti più venduti</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {top.isLoading ? (
            Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)
          ) : (top.data?.length ?? 0) === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nessun dato di vendita</p>
          ) : (
            top.data!.map((p, i) => {
              const maxRev = Math.max(1, ...top.data!.map((x) => num(x.revenue)));
              return (
                <div key={p.product_id} className="flex items-center gap-3">
                  <span className="w-5 text-xs font-semibold text-muted-foreground">{i + 1}</span>
                  <span className="w-48 shrink-0 truncate text-sm font-medium">{p.product_name}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${(num(p.revenue) / maxRev) * 100}%` }} />
                  </div>
                  <span className="w-16 text-right text-xs text-muted-foreground">{int(p.units_sold)} pz</span>
                  <span className="w-24 text-right text-sm font-semibold">{eur(p.revenue)}</span>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
