import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { ShoppingCart, Send } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { KpiCard } from '@/components/common/kpi-card';
import { DataTable } from '@/components/data-table/data-table';
import { BulkDelete } from '@/components/data-table/bulk-delete';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/common/empty-state';
import { useCarts, useDeleteMany } from '@/hooks/queries';
import { api } from '@/lib/api';
import { eur, ago } from '@/lib/format';
import type { AbandonedCart } from '@/types';
import type { ExportColumn } from '@/lib/export';
import { toast } from 'sonner';

const exportColumns: ExportColumn<AbandonedCart>[] = [
  { header: 'Cliente', accessor: (c) => c.customer_nome || 'Ospite' },
  { header: 'Email', accessor: (c) => c.email || '' },
  { header: 'Articoli', accessor: (c) => c.item_count },
  { header: 'Totale', accessor: (c) => eur(c.total) },
  { header: 'Recuperabile', accessor: (c) => (c.recoverable ? 'Sì' : 'No') },
];

export function AbandonedCartsPage() {
  const query = useCarts();
  const del = useDeleteMany<number>((id) => api.carts.delete(id), 'carts');
  const rows = query.data?.carts ?? [];
  const s = query.data?.summary;

  const columns = useMemo<ColumnDef<AbandonedCart, unknown>[]>(
    () => [
      {
        id: 'cliente',
        header: 'Cliente / Email',
        accessorFn: (c) => c.customer_nome || c.email,
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="truncate font-medium">{row.original.customer_nome || 'Ospite anonimo'}</div>
            <div className="truncate text-xs text-muted-foreground">{row.original.email || '—'}</div>
          </div>
        ),
      },
      { accessorKey: 'item_count', header: 'Articoli', cell: ({ getValue }) => `${getValue()} art.` },
      { accessorKey: 'total', header: 'Totale', cell: ({ getValue }) => <span className="font-semibold">{eur(getValue() as number)}</span>, sortingFn: (a, b) => Number(a.original.total) - Number(b.original.total) },
      { accessorKey: 'updated_at', header: 'Ultima attività', cell: ({ getValue }) => <span className="text-muted-foreground">{ago(getValue() as string)}</span> },
      { accessorKey: 'recoverable', header: '', cell: ({ getValue }) => (getValue() ? <Badge variant="success">Recuperabile</Badge> : null) },
    ],
    [],
  );

  async function recover(carts: AbandonedCart[], clear: () => void) {
    const targets = carts.filter((c) => c.recoverable);
    if (!targets.length) {
      toast.info('Nessun carrello selezionato ha un’email per il recupero');
      return;
    }
    await Promise.allSettled(targets.map((c) => api.carts.recover(c.id)));
    toast.success(`Promemoria inviato a ${targets.length} carrelli`);
    clear();
  }

  return (
    <div>
      <PageHeader title="Carrelli abbandonati" subtitle="Carrelli con articoli, inattivi da oltre 30 minuti." />
      <div className="mb-4 grid grid-cols-3 gap-4">
        <KpiCard label="Abbandonati" value={s?.count ?? 0} icon={ShoppingCart} tone="warning" loading={query.isLoading} />
        <KpiCard label="Valore potenziale" value={eur(s?.potential_value ?? 0)} tone="primary" loading={query.isLoading} />
        <KpiCard label="Recuperabili" value={s?.recoverable ?? 0} tone="success" loading={query.isLoading} />
      </div>
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(c) => String(c.id)}
        searchValue={(c) => `${c.customer_nome ?? ''} ${c.email ?? ''}`}
        searchPlaceholder="Cerca cliente o email…"
        exportName="carrelli_abbandonati"
        exportTitle="Carrelli abbandonati"
        exportColumns={exportColumns}
        isLoading={query.isLoading}
        emptyState={<EmptyState icon={ShoppingCart} title="Nessun carrello abbandonato 🎉" />}
        bulkActions={(selected, clear) => (
          <>
            <Button variant="secondary" size="sm" onClick={() => recover(selected, clear)}>
              <Send /> Invia promemoria
            </Button>
            <BulkDelete count={selected.length} noun="carrelli" onDelete={() => del.mutateAsync(selected.map((c) => c.id))} onDone={clear} />
          </>
        )}
      />
    </div>
  );
}
