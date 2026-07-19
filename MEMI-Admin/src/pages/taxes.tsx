import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Landmark, Globe, TriangleAlert, CheckCircle2, Coins, Receipt, Scale } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { KpiCard } from '@/components/common/kpi-card';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useTaxStats } from '@/hooks/queries';
import { api } from '@/lib/api';
import { eur, num } from '@/lib/format';
import { toast } from 'sonner';

const IVA_RATES = [0, 4, 5, 10, 22];

export function TaxesPage() {
  const query = useTaxStats();
  const qc = useQueryClient();
  const d = query.data;
  const pct = d ? Math.min(100, (num(d.oss_ytd) / (d.threshold || 10000)) * 100) : 0;
  const iva = d?.iva;
  const saldo = iva?.saldo ?? 0;
  const daVersare = saldo > 0.005; // >0 ⇒ owed to the tax office; ≤0 ⇒ VAT credit

  // Persist the estimated sales VAT rate to store_settings, then refetch so IVA a debito recomputes.
  const saveRate = useMutation({
    mutationFn: (rate: string) => api.settings.update({ iva_sales_rate: rate }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tax-stats'] }); toast.success('Aliquota IVA vendite aggiornata'); },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Salvataggio non riuscito'),
  });

  return (
    <div>
      <PageHeader title="Tasse" subtitle="Liquidazione IVA e soglia OSS UE." />

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">IVA · liquidazione stimata (anno in corso)</h2>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Aliquota IVA vendite
          <select
            className="h-8 rounded-md border border-input bg-card px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            value={String(iva?.sales_rate ?? 22)}
            disabled={saveRate.isPending || query.isLoading}
            onChange={(e) => saveRate.mutate(e.target.value)}
          >
            {IVA_RATES.map((r) => <option key={r} value={String(r)}>{r}%</option>)}
          </select>
        </label>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <KpiCard label="IVA a debito (vendite)" value={eur(iva?.debito ?? 0)} icon={Coins} tone="info" loading={query.isLoading} />
        <KpiCard label="IVA a credito (spese)" value={eur(iva?.credito ?? 0)} icon={Receipt} tone="success" loading={query.isLoading} />
        <KpiCard
          label={daVersare ? 'IVA da versare' : 'IVA a credito (saldo)'}
          value={eur(Math.abs(saldo))}
          icon={Scale}
          tone={daVersare ? 'warning' : 'success'}
          loading={query.isLoading}
        />
      </div>
      <p className="m-0 mt-2 mb-4 text-xs text-muted-foreground">
        IVA a debito <strong>stimata</strong> sulle vendite incassate ({num(iva?.sales_rate ?? 22)}% su {eur(iva?.revenue_ytd ?? 0)}, prezzi IVA inclusa);
        IVA a credito calcolata sulle spese registrate. Valore indicativo — la liquidazione ufficiale spetta al commercialista.
      </p>

      <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-muted-foreground">OSS · vendite a distanza intra-UE</h2>

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

      {(d?.by_country?.length ?? 0) > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Vendite per paese (estero, YTD)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-md border">
              <div className="flex items-center gap-3 border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
                <span className="flex-1">Paese</span>
                <span className="w-20 text-right">Ordini</span>
                <span className="w-28 text-right">Fatturato</span>
              </div>
              {d!.by_country!.map((c) => (
                <div key={c.paese} className="flex items-center gap-3 border-b px-3 py-2 last:border-b-0">
                  <span className="flex-1 font-medium capitalize">{c.paese}</span>
                  <span className="w-20 text-right text-muted-foreground">{c.orders}</span>
                  <span className="w-28 text-right font-semibold">{eur(c.revenue)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
