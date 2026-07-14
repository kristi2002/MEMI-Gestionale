import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { BarChart3, CoinsIcon, ShoppingBag, TrendingUp } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { KpiCard } from '@/components/common/kpi-card';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { DataTable } from '@/components/data-table/data-table';
import { StatusBadge } from '@/components/common/status-badge';
import { EmptyState } from '@/components/common/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useReports } from '@/hooks/queries';
import { eur, int } from '@/lib/format';
import type { ReportsData } from '@/types';
import type { ExportColumn } from '@/lib/export';

type CatRow = ReportsData['top_categories'][number];

const catExport: ExportColumn<CatRow>[] = [
  { header: 'Categoria', accessor: (c) => c.categoria },
  { header: 'Fatturato', accessor: (c) => eur(c.revenue) },
  { header: 'Unità', accessor: (c) => c.units },
];

function MonthlyBars({ data }: { data: ReportsData['sales_by_month'] }) {
  const max = Math.max(1, ...data.map((d) => d.revenue));
  if (data.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">Nessun dato di vendita</p>;
  return (
    <div className="flex h-56 items-end gap-2">
      {data.map((d) => (
        <div key={d.month} className="flex flex-1 flex-col items-center gap-1" title={`${d.month}: ${eur(d.revenue)}`}>
          <div className="flex w-full items-end justify-center" style={{ height: '180px' }}>
            <div className="w-full max-w-[36px] rounded-t bg-primary/80 transition-all hover:bg-primary" style={{ height: `${(d.revenue / max) * 100}%` }} />
          </div>
          <span className="text-[10px] text-muted-foreground">{d.month.slice(5)}</span>
        </div>
      ))}
    </div>
  );
}

export function ReportsPage() {
  const query = useReports();
  const d = query.data;

  const catColumns = useMemo<ColumnDef<CatRow, unknown>[]>(
    () => [
      { accessorKey: 'categoria', header: 'Categoria', cell: ({ getValue }) => <span className="font-medium capitalize">{getValue() as string}</span> },
      { accessorKey: 'units', header: 'Unità', cell: ({ getValue }) => <span className="text-muted-foreground">{int(getValue())}</span> },
      { accessorKey: 'revenue', header: 'Fatturato', cell: ({ getValue }) => <span className="font-semibold">{eur(getValue() as number)}</span> },
    ],
    [],
  );

  return (
    <div>
      <PageHeader title="Report" subtitle="Report di vendita e performance (anno in corso)." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Fatturato YTD" value={eur(d?.summary.revenue_ytd ?? 0)} icon={CoinsIcon} tone="success" loading={query.isLoading} />
        <KpiCard label="Ordini YTD" value={int(d?.summary.orders_ytd ?? 0)} icon={ShoppingBag} tone="primary" loading={query.isLoading} />
        <KpiCard label="Valore medio ordine" value={eur(d?.summary.aov ?? 0)} icon={TrendingUp} tone="info" loading={query.isLoading} />
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Fatturato mensile (12 mesi)</CardTitle>
        </CardHeader>
        <CardContent>{query.isLoading ? <Skeleton className="h-56 w-full" /> : <MonthlyBars data={d?.sales_by_month ?? []} />}</CardContent>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Ordini per stato</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(d?.orders_by_status?.length ?? 0) === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Nessun ordine</p>
            ) : (
              d!.orders_by_status.map((r) => (
                <div key={r.stato} className="flex items-center justify-between">
                  <StatusBadge code={r.stato} />
                  <span className="text-sm font-semibold">{int(r.count)}</span>
                </div>
              ))
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
