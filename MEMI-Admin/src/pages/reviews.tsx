import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Star, MessageSquare, Check, X } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { KpiCard } from '@/components/common/kpi-card';
import { DataTable } from '@/components/data-table/data-table';
import type { FilterDef } from '@/components/data-table/filters';
import { BulkDelete } from '@/components/data-table/bulk-delete';
import { StatusBadge } from '@/components/common/status-badge';
import { EmptyState } from '@/components/common/empty-state';
import { Button } from '@/components/ui/button';
import { useReviews, useDeleteMany, useUpdateOne } from '@/hooks/queries';
import { api } from '@/lib/api';
import { date } from '@/lib/format';
import { statusLabel } from '@/lib/status';
import type { Review } from '@/types';
import type { ExportColumn } from '@/lib/export';
import { toast } from 'sonner';

function Stars({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" title={`${n}/5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={i < n ? 'h-3.5 w-3.5 fill-warning text-warning' : 'h-3.5 w-3.5 text-muted-foreground/40'} />
      ))}
    </span>
  );
}

const exportColumns: ExportColumn<Review>[] = [
  { header: 'Prodotto', accessor: (r) => r.product_name },
  { header: 'Cliente', accessor: (r) => r.customer_nome },
  { header: 'Voto', accessor: (r) => r.rating },
  { header: 'Titolo', accessor: (r) => r.titolo || '' },
  { header: 'Testo', accessor: (r) => r.testo || '' },
  { header: 'Stato', accessor: (r) => statusLabel(r.stato) },
  { header: 'Data', accessor: (r) => date(r.created_at) },
];

export function ReviewsPage() {
  const query = useReviews();
  const del = useDeleteMany<number>((id) => api.reviews.delete(id), 'reviews');
  const update = useUpdateOne<number>((id, data) => api.reviews.update(id, data), 'reviews');
  const rows = query.data?.reviews ?? [];

  const filters = useMemo<FilterDef<Review>[]>(
    () => [
      { key: 'stato', type: 'select', label: 'Stato', accessor: (r) => r.stato,
        options: [{ value: 'in_attesa', label: 'In attesa' }, { value: 'pubblicata', label: 'Pubblicata' }, { value: 'rifiutata', label: 'Rifiutata' }] },
      { key: 'rating', type: 'multiselect', label: 'Valutazione', accessor: (r) => String(r.rating),
        options: [5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n} ★` })) },
      { key: 'created', type: 'dateRange', label: 'Data', accessor: (r) => r.created_at },
    ],
    [],
  );

  const columns = useMemo<ColumnDef<Review, unknown>[]>(
    () => [
      { accessorKey: 'product_name', header: 'Prodotto', cell: ({ getValue }) => <span className="font-medium">{getValue() as string}</span> },
      { accessorKey: 'customer_nome', header: 'Cliente', cell: ({ getValue }) => <span className="text-muted-foreground">{(getValue() as string) || '—'}</span> },
      { accessorKey: 'rating', header: 'Voto', cell: ({ getValue }) => <Stars n={Number(getValue())} /> },
      {
        id: 'recensione',
        header: 'Recensione',
        accessorFn: (r) => r.testo,
        cell: ({ row }) => (
          <div className="max-w-[280px]">
            {row.original.titolo && <div className="truncate text-sm font-medium">{row.original.titolo}</div>}
            <div className="line-clamp-1 text-xs text-muted-foreground">{row.original.testo || '—'}</div>
          </div>
        ),
      },
      { accessorKey: 'created_at', header: 'Data', cell: ({ getValue }) => <span className="text-muted-foreground">{date(getValue() as string)}</span> },
      { accessorKey: 'stato', header: 'Stato', cell: ({ getValue }) => <StatusBadge code={getValue() as string} /> },
    ],
    [],
  );

  async function moderate(ids: number[], stato: 'pubblicata' | 'rifiutata', clear: () => void) {
    await Promise.all(ids.map((id) => update.mutateAsync({ id, data: { stato } })));
    toast.success(`${ids.length} recensioni ${stato === 'pubblicata' ? 'pubblicate' : 'rifiutate'}`);
    clear();
  }

  return (
    <div>
      <PageHeader title="Recensioni" subtitle="Modera le recensioni dei clienti." />
      <div className="mb-4 grid grid-cols-2 gap-4">
        <KpiCard label="Totale recensioni" value={query.data?.total ?? 0} tone="primary" loading={query.isLoading} />
        <KpiCard label="In attesa di moderazione" value={query.data?.pending ?? 0} tone="warning" loading={query.isLoading} />
      </div>
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(r) => String(r.id)}
        searchValue={(r) => `${r.product_name} ${r.customer_nome} ${r.titolo ?? ''} ${r.testo ?? ''}`}
        searchPlaceholder="Cerca recensione…"
        exportName="recensioni"
        exportTitle="Recensioni"
        exportColumns={exportColumns}
        filters={filters}
        tableId="reviews"
        isLoading={query.isLoading}
        emptyState={<EmptyState icon={MessageSquare} title="Nessuna recensione" />}
        bulkActions={(selected, clear) => {
          const ids = selected.map((r) => r.id);
          return (
            <>
              <Button variant="secondary" size="sm" onClick={() => moderate(ids, 'pubblicata', clear)}>
                <Check /> Pubblica
              </Button>
              <Button variant="secondary" size="sm" onClick={() => moderate(ids, 'rifiutata', clear)}>
                <X /> Rifiuta
              </Button>
              <BulkDelete count={ids.length} noun="recensioni" onDelete={() => del.mutateAsync(ids)} onDone={clear} />
            </>
          );
        }}
      />
    </div>
  );
}
