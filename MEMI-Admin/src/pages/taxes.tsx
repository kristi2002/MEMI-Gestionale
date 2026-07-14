import { Landmark, Globe, TriangleAlert, CheckCircle2 } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { KpiCard } from '@/components/common/kpi-card';
import { Card, CardContent } from '@/components/ui/card';
import { useTaxStats } from '@/hooks/queries';
import { eur, num } from '@/lib/format';

export function TaxesPage() {
  const query = useTaxStats();
  const d = query.data;
  const pct = d ? Math.min(100, (num(d.oss_ytd) / (d.threshold || 10000)) * 100) : 0;

  return (
    <div>
      <PageHeader title="Tasse" subtitle="Soglia OSS UE e vendite verso l'estero." />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <KpiCard label="Vendite UE (YTD)" value={eur(d?.oss_ytd ?? 0)} icon={Landmark} tone="primary" loading={query.isLoading} />
        <KpiCard label="Ordini esteri" value={d?.foreign_orders ?? 0} icon={Globe} tone="info" loading={query.isLoading} />
        <KpiCard
          label="Stato soglia OSS"
          value={d?.over ? 'Superata' : 'Sotto soglia'}
          icon={d?.over ? TriangleAlert : CheckCircle2}
          tone={d?.over ? 'danger' : 'success'}
          loading={query.isLoading}
        />
      </div>

      <Card className="mt-4">
        <CardContent className="pt-5">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium">Soglia OSS annuale</span>
            <span className="text-muted-foreground">
              {eur(d?.oss_ytd ?? 0)} / {eur(d?.threshold ?? 10000)}
            </span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full ${d?.over ? 'bg-destructive' : pct > 80 ? 'bg-warning' : 'bg-success'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            {d?.over
              ? 'Hai superato la soglia OSS di € 10.000 per le vendite a distanza intra-UE: devi applicare l’IVA del paese di destinazione e dichiarare tramite il regime OSS.'
              : 'Sei sotto la soglia OSS di € 10.000 per le vendite a distanza intra-UE. Puoi continuare ad applicare l’IVA italiana finché non la superi.'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
