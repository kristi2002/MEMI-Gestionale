import { CoinsIcon, ShoppingBag, Eye, TrendingUp } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { KpiCard } from '@/components/common/kpi-card';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useDashboard } from '@/hooks/queries';
import { eur, int, num } from '@/lib/format';
import type { ChartPoint } from '@/types';

function DualChart({ data }: { data: ChartPoint[] }) {
  const W = 800;
  const H = 260;
  const PX = 10;
  const PY = 20;
  if (!data || data.length < 2) {
    return <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">Nessun dato nel periodo</div>;
  }
  const rev = data.map((d) => num(d.revenue));
  const ord = data.map((d) => Number(d.orders) || 0);
  const maxRev = Math.max(...rev, 1);
  const maxOrd = Math.max(...ord, 1);
  const n = data.length;
  const toPts = (vals: number[], maxV: number) =>
    vals.map((v, i) => {
      const x = PX + (i / (n - 1)) * (W - 2 * PX);
      const y = H - PY - (v / maxV) * (H - 2 * PY);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
  const revLine = toPts(rev, maxRev).map((p, i) => (i === 0 ? 'M' : 'L') + p).join(' ');
  const revArea = `${revLine} L${W - PX},${H - PY} L${PX},${H - PY} Z`;
  const ordLine = toPts(ord, maxOrd).map((p, i) => (i === 0 ? 'M' : 'L') + p).join(' ');
  return (
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
    </svg>
  );
}

export function AnalyticsPage() {
  const { kpis, chart, top } = useDashboard();
  const k = kpis.data;

  return (
    <div>
      <PageHeader title="Statistiche" subtitle="Panoramica delle performance dello store." />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Fatturato (oggi)" value={k?.revenue.value ?? '…'} delta={k?.revenue.delta} up={k?.revenue.up} icon={CoinsIcon} tone="success" loading={kpis.isLoading} />
        <KpiCard label="Ordini" value={k?.orders.value ?? '…'} delta={k?.orders.delta} up={k?.orders.up} icon={ShoppingBag} tone="primary" loading={kpis.isLoading} />
        <KpiCard label="Visitatori" value={k?.visitors.value ?? '…'} delta={k?.visitors.delta} up={k?.visitors.up} icon={Eye} tone="info" loading={kpis.isLoading} />
        <KpiCard label="AOV" value={k?.aov.value ?? '…'} delta={k?.aov.delta} up={k?.aov.up} icon={TrendingUp} tone="success" loading={kpis.isLoading} />
      </div>

      <Card className="mt-4">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Vendite & ordini (30 giorni)</CardTitle>
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
