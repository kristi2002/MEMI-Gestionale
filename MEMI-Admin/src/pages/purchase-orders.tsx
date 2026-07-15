import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { ClipboardList, PackageCheck } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/data-table/data-table';
import type { FilterDef } from '@/components/data-table/filters';
import { BulkDelete } from '@/components/data-table/bulk-delete';
import { StatusBadge } from '@/components/common/status-badge';
import { EmptyState } from '@/components/common/empty-state';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { Button } from '@/components/ui/button';
import { usePurchaseOrders, useDeleteMany } from '@/hooks/queries';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { eur, date } from '@/lib/format';
import type { PurchaseOrder } from '@/types';
import type { ExportColumn } from '@/lib/export';
import { toast } from 'sonner';

const exportColumns: ExportColumn<PurchaseOrder>[] = [
  { header: 'Numero', accessor: (p) => p.numero || String(p.id) },
  { header: 'Fornitore', accessor: (p) => p.supplier_nome || '' },
  { header: 'Articoli', accessor: (p) => p.items_qty },
  { header: 'Totale', accessor: (p) => eur(p.totale) },
  { header: 'Stato', accessor: (p) => p.stato },
  { header: 'Data', accessor: (p) => date(p.created_at) },
];

export function PurchaseOrdersPage() {
  const query = usePurchaseOrders();
  const qc = useQueryClient();
  const del = useDeleteMany<number>((id) => api.purchaseOrders.delete(id), 'purchase-orders');
  const rows = query.data ?? [];

  const filters = useMemo<FilterDef<PurchaseOrder>[]>(() => {
    const stati = [...new Set(rows.map((p) => p.stato).filter(Boolean))].sort();
    return [
      { key: 'stato', type: 'select', label: 'Stato', accessor: (p) => p.stato, options: stati.map((s) => ({ value: s, label: s })) },
      { key: 'totale', type: 'numberRange', label: 'Totale', unit: '€', accessor: (p) => Number(p.totale) },
      { key: 'created', type: 'dateRange', label: 'Data', accessor: (p) => p.created_at },
    ];
  }, [rows]);

  async function receive(po: PurchaseOrder) {
    await api.purchaseOrders.receive(po.id);
    toast.success(`Ordine ${po.numero ?? po.id} ricevuto — stock aggiornato`);
    qc.invalidateQueries({ queryKey: ['purchase-orders'] });
  }

  const columns = useMemo<ColumnDef<PurchaseOrder, unknown>[]>(
    () => [
      { accessorKey: 'numero', header: 'Numero', cell: ({ row }) => <span className="font-semibold">{row.original.numero ?? `PO-${row.original.id}`}</span> },
      { accessorKey: 'supplier_nome', header: 'Fornitore', cell: ({ getValue }) => <span>{(getValue() as string) || '—'}</span> },
      { accessorKey: 'items_qty', header: 'Articoli', cell: ({ getValue }) => <span className="text-muted-foreground">{getValue() as number} pz</span> },
      { accessorKey: 'totale', header: 'Totale', cell: ({ getValue }) => <span className="font-semibold">{eur(getValue() as string)}</span>, sortingFn: (a, b) => Number(a.original.totale) - Number(b.original.totale) },
      { accessorKey: 'created_at', header: 'Data', cell: ({ getValue }) => <span className="text-muted-foreground">{date(getValue() as string)}</span> },
      { accessorKey: 'stato', header: 'Stato', cell: ({ getValue }) => <StatusBadge code={getValue() as string} /> },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) =>
          row.original.stato !== 'ricevuto' && row.original.stato !== 'annullato' ? (
            <ConfirmDialog
              title="Segnare come ricevuto?"
              description="Lo stock dei prodotti verrà incrementato con le quantità dell'ordine."
              confirmLabel="Ricevi"
              onConfirm={() => receive(row.original)}
              trigger={
                <Button variant="ghost" size="sm" className="h-8">
                  <PackageCheck /> Ricevi
                </Button>
              }
            />
          ) : null,
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader title="Ordini fornitori" subtitle="Ordini di acquisto verso i fornitori." />
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(p) => String(p.id)}
        searchValue={(p) => `${p.numero ?? ''} ${p.supplier_nome ?? ''}`}
        searchPlaceholder="Cerca ordine o fornitore…"
        exportName="ordini_fornitori"
        exportTitle="Ordini fornitori"
        exportColumns={exportColumns}
        filters={filters}
        tableId="purchase-orders"
        isLoading={query.isLoading}
        emptyState={<EmptyState icon={ClipboardList} title="Nessun ordine fornitore" />}
        bulkActions={(selected, clear) => (
          <BulkDelete count={selected.length} noun="ordini" onDelete={() => del.mutateAsync(selected.map((p) => p.id))} onDone={clear} />
        )}
      />
    </div>
  );
}
