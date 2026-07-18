import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Wallet, CalendarDays, Clock, RotateCcw, Truck, TrendingUp, TrendingDown, Receipt } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { KpiCard } from '@/components/common/kpi-card';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { DataTable } from '@/components/data-table/data-table';
import { StatusBadge } from '@/components/common/status-badge';
import { EmptyState } from '@/components/common/empty-state';
import { Badge } from '@/components/ui/badge';
import { useFinance } from '@/hooks/queries';
import { eur, date, num } from '@/lib/format';
import type { FinanceData } from '@/types';
import type { ExportColumn } from '@/lib/export';

type Txn = FinanceData['recent'][number];

const exportColumns: ExportColumn<Txn>[] = [
  { header: 'Ordine', accessor: (t) => t.order_number },
  { header: 'Cliente', accessor: (t) => t.customer },
  { header: 'Metodo', accessor: (t) => t.method },
  { header: 'Totale', accessor: (t) => eur(t.total) },
  { header: 'Stato', accessor: (t) => t.payment_status },
  { header: 'Data', accessor: (t) => date(t.created_at) },
];

export function FinancePage() {
  const query = useFinance();
  const s = query.data?.summary;
  const byMethod = query.data?.by_method ?? [];
  const recent = query.data?.recent ?? [];
  const methodMax = Math.max(1, ...byMethod.map((m) => num(m.total)));

  const columns = useMemo<ColumnDef<Txn, unknown>[]>(
    () => [
      { accessorKey: 'order_number', header: 'Ordine', cell: ({ getValue }) => <span className="font-semibold">{getValue() as string}</span> },
      { accessorKey: 'customer', header: 'Cliente', cell: ({ getValue }) => <span>{(getValue() as string) || '—'}</span> },
      { accessorKey: 'method', header: 'Metodo', cell: ({ getValue }) => <Badge variant="neutral">{(getValue() as string) || '—'}</Badge> },
      { accessorKey: 'created_at', header: 'Data', cell: ({ getValue }) => <span className="text-muted-foreground">{date(getValue() as string)}</span> },
      { accessorKey: 'total', header: 'Totale', cell: ({ getValue }) => <span className="font-semibold">{eur(getValue() as number)}</span>, sortingFn: (a, b) => num(a.original.total) - num(b.original.total) },
      { accessorKey: 'payment_status', header: 'Stato', cell: ({ getValue }) => <StatusBadge code={getValue() as string} /> },
    ],
    [],
  );

  return (
    <div>
      <PageHeader title="Finanza" subtitle="Incassi, spese, utile netto e transazioni recenti." />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Fatturato totale" value={eur(s?.revenue_total ?? 0)} icon={Wallet} tone="success" loading={query.isLoading} />
        <KpiCard label="Questo mese" value={eur(s?.revenue_month ?? 0)} icon={CalendarDays} tone="primary" loading={query.isLoading} />
        <KpiCard label="Oggi" value={eur(s?.revenue_today ?? 0)} icon={TrendingUp} tone="info" loading={query.isLoading} />
        <KpiCard label="AOV" value={eur(s?.aov ?? 0)} icon={TrendingUp} tone="primary" loading={query.isLoading} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="In attesa" value={eur(s?.pending_amount ?? 0)} icon={Clock} tone="warning" loading={query.isLoading} />
        <KpiCard label="Rimborsato" value={eur(s?.refunded_amount ?? 0)} icon={RotateCcw} tone="danger" loading={query.isLoading} />
        <KpiCard label="Spedizioni incassate" value={eur(s?.shipping_collected ?? 0)} icon={Truck} tone="muted" loading={query.isLoading} />
        <KpiCard label="Ordini pagati" value={s?.paid_count ?? 0} icon={Wallet} tone="success" loading={query.isLoading} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Spese totali" value={eur(s?.expenses_total ?? 0)} icon={Receipt} tone="warning" loading={query.isLoading} />
        <KpiCard label="Spese questo mese" value={eur(s?.expenses_month ?? 0)} icon={Receipt} tone="muted" loading={query.isLoading} />
        <KpiCard label="Utile netto" value={eur(s?.net_total ?? 0)} icon={(s?.net_total ?? 0) >= 0 ? TrendingUp : TrendingDown} tone={(s?.net_total ?? 0) >= 0 ? 'success' : 'danger'} loading={query.isLoading} />
        <KpiCard label="Utile questo mese" value={eur(s?.net_month ?? 0)} icon={(s?.net_month ?? 0) >= 0 ? TrendingUp : TrendingDown} tone={(s?.net_month ?? 0) >= 0 ? 'success' : 'danger'} loading={query.isLoading} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Per metodo di pagamento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {byMethod.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Nessun dato</p>
            ) : (
              byMethod.map((m) => (
                <div key={m.method}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium capitalize">{m.method || '—'}</span>
                    <span className="text-muted-foreground">
                      {eur(m.total)} · {m.count}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${(num(m.total) / methodMax) * 100}%` }} />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Transazioni recenti</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <DataTable
              columns={columns}
              data={recent}
              getRowId={(t) => t.order_number}
              searchValue={(t) => `${t.order_number} ${t.customer} ${t.method}`}
              searchPlaceholder="Cerca transazione…"
              exportName="transazioni"
              exportTitle="Transazioni"
              exportColumns={exportColumns}
              isLoading={query.isLoading}
              pageSize={10}
              emptyState={<EmptyState icon={Wallet} title="Nessuna transazione" />}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
