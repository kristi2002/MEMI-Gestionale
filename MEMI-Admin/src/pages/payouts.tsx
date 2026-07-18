import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Wallet, CalendarDays, TrendingUp, Hash, Info } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { KpiCard } from '@/components/common/kpi-card';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { DataTable } from '@/components/data-table/data-table';
import { EmptyState } from '@/components/common/empty-state';
import { Badge } from '@/components/ui/badge';
import { usePayouts } from '@/hooks/queries';
import { eur, date, num } from '@/lib/format';
import type { PayoutsData } from '@/types';
import type { ExportColumn } from '@/lib/export';

type Payment = PayoutsData['payments'][number];

const exportColumns: ExportColumn<Payment>[] = [
  { header: 'Ordine', accessor: (p) => p.order_number },
  { header: 'Cliente', accessor: (p) => p.customer },
  { header: 'Metodo', accessor: (p) => p.method },
  { header: 'Riferimento', accessor: (p) => p.reference || '' },
  { header: 'Importo', accessor: (p) => eur(p.total) },
  { header: 'Data', accessor: (p) => date(p.created_at) },
];

/**
 * "Pagamenti ricevuti" — a real payments-received ledger (was a duplicate of
 * FinancePage). Lists confirmed incoming payments (paid orders) with per-method
 * totals. Provider-level settlement (fees / net / arrival date) is honestly
 * flagged as pending a payout-API connection rather than faked.
 */
export function PayoutsPage() {
  const query = usePayouts();
  const s = query.data?.summary;
  const byMethod = query.data?.by_method ?? [];
  const payments = query.data?.payments ?? [];
  const methodMax = Math.max(1, ...byMethod.map((m) => num(m.total)));

  const columns = useMemo<ColumnDef<Payment, unknown>[]>(
    () => [
      { accessorKey: 'order_number', header: 'Ordine', cell: ({ getValue }) => <span className="font-semibold">{getValue() as string}</span> },
      { accessorKey: 'customer', header: 'Cliente', cell: ({ getValue }) => <span>{(getValue() as string) || '—'}</span> },
      { accessorKey: 'method', header: 'Metodo', cell: ({ getValue }) => <Badge variant="neutral" className="capitalize">{(getValue() as string) || '—'}</Badge> },
      { accessorKey: 'reference', header: 'Riferimento', cell: ({ getValue }) => <span className="font-mono text-xs text-muted-foreground">{(getValue() as string) || '—'}</span> },
      { accessorKey: 'created_at', header: 'Data', cell: ({ getValue }) => <span className="text-muted-foreground">{date(getValue() as string)}</span> },
      { accessorKey: 'total', header: 'Importo', cell: ({ getValue }) => <span className="font-semibold">{eur(getValue() as number)}</span>, sortingFn: (a, b) => num(a.original.total) - num(b.original.total) },
    ],
    [],
  );

  return (
    <div>
      <PageHeader title="Pagamenti ricevuti" subtitle="Incassi confermati dai clienti, per metodo e transazione." />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Totale incassato" value={eur(s?.received_total ?? 0)} icon={Wallet} tone="success" loading={query.isLoading} />
        <KpiCard label="Pagamenti" value={s?.received_count ?? 0} icon={Hash} tone="primary" loading={query.isLoading} />
        <KpiCard label="Questo mese" value={eur(s?.received_month ?? 0)} icon={CalendarDays} tone="info" loading={query.isLoading} />
        <KpiCard label="Oggi" value={eur(s?.received_today ?? 0)} icon={TrendingUp} tone="primary" loading={query.isLoading} />
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-md border border-dashed bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Elenco degli incassi confermati (ordini pagati). La riconciliazione a livello di provider —
          commissioni, importo netto e data di accredito sul conto — sarà disponibile collegando le API di
          payout di Stripe / SumUp / PayPal.
        </span>
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
            <CardTitle>Incassi</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <DataTable
              columns={columns}
              data={payments}
              getRowId={(p) => p.order_number}
              searchValue={(p) => `${p.order_number} ${p.customer} ${p.method} ${p.reference ?? ''}`}
              searchPlaceholder="Cerca incasso…"
              exportName="pagamenti_ricevuti"
              exportTitle="Pagamenti ricevuti"
              exportColumns={exportColumns}
              isLoading={query.isLoading}
              pageSize={12}
              emptyState={<EmptyState icon={Wallet} title="Nessun pagamento ricevuto" />}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
