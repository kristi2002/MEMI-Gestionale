import { CoinsIcon, ShoppingBag, Eye, TrendingUp, Tag, AlertTriangle, CircleX, ShoppingCart } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { KpiCard, type KpiTone } from '@/components/common/kpi-card';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/common/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useDashboard } from '@/hooks/queries';
import { eur, int, num } from '@/lib/format';
import type { ChartPoint } from '@/types';

function SalesChart({ data }: { data: ChartPoint[] }) {
  const W = 640;
  const H = 220;
  const PX = 8;
  const PY = 16;
  if (!data || data.length < 2) {
    return <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">Nessun dato di vendita nel periodo</div>;
  }
  const revenues = data.map((d) => num(d.revenue));
  const maxRev = Math.max(...revenues, 1);
  const n = data.length;
  const pts = revenues.map((v, i) => {
    const x = PX + (i / (n - 1)) * (W - 2 * PX);
    const y = H - PY - (v / maxRev) * (H - 2 * PY);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p).join(' ');
  const area = `${line} L${W - PX},${H - PY} L${PX},${H - PY} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[220px] w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="rev" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.28" />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 1, 2, 3].map((g) => {
        const gy = PY + g * ((H - 2 * PY) / 3);
        return <line key={g} x1={PX} x2={W - PX} y1={gy} y2={gy} stroke="hsl(var(--border))" strokeWidth={1} />;
      })}
      <path d={area} fill="url(#rev)" />
      <path d={line} fill="none" stroke="hsl(var(--primary))" strokeWidth={2.5} strokeLinejoin="round" />
    </svg>
  );
}

export function DashboardPage() {
  const { kpis, catalog, chart, recent, top } = useDashboard();
  const k = kpis.data;
  const c = catalog.data;

  const revenueKpis: { label: string; value: string; delta?: string; up?: boolean; icon: typeof CoinsIcon; tone: KpiTone }[] = [
    { label: 'Fatturato (oggi)', value: k?.revenue.value ?? '…', delta: k?.revenue.delta, up: k?.revenue.up, icon: CoinsIcon, tone: 'success' },
    { label: 'Ordini', value: k?.orders.value ?? '…', delta: k?.orders.delta, up: k?.orders.up, icon: ShoppingBag, tone: 'primary' },
    { label: 'Visitatori', value: k?.visitors.value ?? '…', delta: k?.visitors.delta, up: k?.visitors.up, icon: Eye, tone: 'info' },
    { label: 'AOV', value: k?.aov.value ?? '…', delta: k?.aov.delta, up: k?.aov.up, icon: TrendingUp, tone: 'success' },
  ];
  const catalogKpis: { label: string; value: string; icon: typeof Tag; tone: KpiTone }[] = [
    { label: 'Prodotti attivi', value: int(c?.active_products), icon: Tag, tone: 'primary' },
    { label: 'Scorte basse', value: int(c?.low_stock), icon: AlertTriangle, tone: 'warning' },
    { label: 'Esauriti', value: int(c?.out_of_stock), icon: CircleX, tone: 'danger' },
    { label: 'Ordini oggi', value: int(c?.orders_today), icon: ShoppingCart, tone: 'info' },
  ];

  return (
    <div>
      <PageHeader title="Buongiorno, Admin 👋" subtitle="Ecco cosa è successo oggi nel tuo store." />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {revenueKpis.map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} loading={kpis.isLoading} />
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {catalogKpis.map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} loading={catalog.isLoading} />
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Andamento vendite</CardTitle>
          </CardHeader>
          <CardContent>
            {chart.isLoading ? <Skeleton className="h-[220px] w-full" /> : <SalesChart data={chart.data ?? []} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ordini recenti</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recent.isLoading ? (
              Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)
            ) : (recent.data?.length ?? 0) === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nessun ordine recente</p>
            ) : (
              recent.data!.slice(0, 6).map((o) => (
                <div key={o.id} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{o.order_number}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {[o.customer_nome, o.customer_cognome].filter(Boolean).join(' ') || '—'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold">{eur(o.total)}</div>
                    <StatusBadge code={o.order_status} />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle>Top prodotti</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {top.isLoading ? (
              Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)
            ) : (top.data?.length ?? 0) === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nessun dato di vendita</p>
            ) : (
              top.data!.map((p, i) => (
                <div key={p.product_id} className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">
                      {i + 1}
                    </span>
                    <span className="truncate text-sm font-medium">{p.product_name}</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-muted-foreground">{int(p.units_sold)} pz</span>
                    <span className="font-semibold">{eur(p.revenue)}</span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
