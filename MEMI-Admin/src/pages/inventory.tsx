import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Boxes, AlertTriangle, CircleX, PackageCheck } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { KpiCard } from '@/components/common/kpi-card';
import { DataTable } from '@/components/data-table/data-table';
import { StatusBadge } from '@/components/common/status-badge';
import { EmptyState } from '@/components/common/empty-state';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useProducts, flattenProducts } from '@/hooks/queries';
import { int } from '@/lib/format';
import type { ProductRow } from '@/types';
import type { ExportColumn } from '@/lib/export';

const LOW = 5;

const exportColumns: ExportColumn<ProductRow>[] = [
  { header: 'ID', accessor: (p) => p.id },
  { header: 'Nome', accessor: (p) => p.name },
  { header: 'Categoria', accessor: (p) => p.categoria },
  { header: 'Taglie', accessor: (p) => (p.taglie || []).join(' | ') },
  { header: 'Stock totale', accessor: (p) => p.stock_total },
  { header: 'Stato', accessor: (p) => p.status },
];

export function InventoryPage() {
  const query = useProducts();
  const [filter, setFilter] = useState<'all' | 'low' | 'out'>('all');
  const all = useMemo(() => flattenProducts(query.data?.pages), [query.data]);

  const stats = useMemo(() => {
    const out = all.filter((p) => p.stock_total === 0).length;
    const low = all.filter((p) => p.stock_total > 0 && p.stock_total < LOW).length;
    const ok = all.length - out - low;
    return { out, low, ok };
  }, [all]);

  const rows = useMemo(
    () =>
      all.filter((p) =>
        filter === 'out' ? p.stock_total === 0 : filter === 'low' ? p.stock_total > 0 && p.stock_total < LOW : true,
      ),
    [all, filter],
  );

  const columns = useMemo<ColumnDef<ProductRow, unknown>[]>(
    () => [
      {
        id: 'prodotto',
        header: 'Prodotto',
        accessorFn: (p) => p.name,
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="truncate font-medium">{row.original.name}</div>
            <div className="truncate text-xs text-muted-foreground">{row.original.id}</div>
          </div>
        ),
      },
      { accessorKey: 'categoria', header: 'Categoria', cell: ({ getValue }) => <span className="capitalize text-muted-foreground">{getValue() as string}</span> },
      {
        id: 'taglie',
        header: 'Taglie',
        accessorFn: (p) => (p.taglie || []).length,
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {(row.original.taglie || []).slice(0, 6).map((t) => (
              <Badge key={t} variant="neutral">
                {t}
              </Badge>
            ))}
            {(row.original.taglie || []).length === 0 && <span className="text-muted-foreground">—</span>}
          </div>
        ),
      },
      {
        accessorKey: 'stock_total',
        header: 'Stock',
        cell: ({ getValue }) => {
          const s = Number(getValue());
          return (
            <span className={s === 0 ? 'font-semibold text-destructive' : s < LOW ? 'font-semibold text-warning' : 'font-semibold'}>
              {s}
            </span>
          );
        },
      },
      { accessorKey: 'status', header: 'Stato', cell: ({ getValue }) => <StatusBadge code={getValue() as string} /> },
    ],
    [],
  );

  return (
    <div>
      <PageHeader title="Magazzino" subtitle="Livelli di stock del catalogo. Le scorte per singola taglia si gestiscono dal prodotto." />

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Prodotti" value={int(all.length)} icon={Boxes} tone="primary" loading={query.isLoading} />
        <KpiCard label="Scorta OK" value={int(stats.ok)} icon={PackageCheck} tone="success" loading={query.isLoading} />
        <KpiCard label="Scorte basse" value={int(stats.low)} icon={AlertTriangle} tone="warning" loading={query.isLoading} />
        <KpiCard label="Esauriti" value={int(stats.out)} icon={CircleX} tone="danger" loading={query.isLoading} />
      </div>

      <DataTable
        columns={columns}
        data={rows}
        getRowId={(p) => p.id}
        searchValue={(p) => `${p.name} ${p.id} ${p.categoria}`}
        searchPlaceholder="Cerca prodotto…"
        exportName="magazzino"
        exportTitle="Magazzino"
        exportColumns={exportColumns}
        isLoading={query.isLoading}
        hasMore={query.hasNextPage}
        onLoadMore={() => query.fetchNextPage()}
        loadingMore={query.isFetchingNextPage}
        emptyState={<EmptyState icon={Boxes} title="Nessun prodotto" />}
        toolbar={
          <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <SelectTrigger className="h-9 w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutte le scorte</SelectItem>
              <SelectItem value="low">Solo scorte basse</SelectItem>
              <SelectItem value="out">Solo esauriti</SelectItem>
            </SelectContent>
          </Select>
        }
      />
    </div>
  );
}
