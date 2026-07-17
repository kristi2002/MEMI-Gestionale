import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Trash2, CheckCircle2, Ban, ShoppingBag, Truck } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/data-table/data-table';
import { ShipOrderDialog } from '@/components/ship-order-dialog';
import { useDebouncedValue } from '@/lib/utils';
import { StatusBadge } from '@/components/common/status-badge';
import { EmptyState } from '@/components/common/empty-state';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useOrders,
  flattenOrders,
  useOrderStatusMutation,
  useDeleteOrders,
} from '@/hooks/queries';
import { eur, date } from '@/lib/format';
import { statusLabel } from '@/lib/status';
import type { OrderRow } from '@/types';
import type { ExportColumn } from '@/lib/export';
import { toast } from 'sonner';

const TABS = [
  { key: 'all', label: 'Tutti' },
  { key: 'unpaid', label: 'Non pagati' },
  { key: 'toship', label: 'Da spedire' },
  { key: 'shipped', label: 'Spediti' },
  { key: 'cancelled', label: 'Annullati' },
] as const;

const exportColumns: ExportColumn<OrderRow>[] = [
  { header: 'Ordine', accessor: (o) => o.order_number },
  { header: 'Cliente', accessor: (o) => `${o.customer_nome} ${o.customer_cognome}`.trim() },
  { header: 'Email', accessor: (o) => o.customer_email },
  { header: 'Data', accessor: (o) => date(o.created_at) },
  { header: 'Totale', accessor: (o) => eur(o.total) },
  { header: 'Pagamento', accessor: (o) => statusLabel(o.payment_status) },
  { header: 'Stato', accessor: (o) => statusLabel(o.order_status) },
  { header: 'Corriere', accessor: (o) => (o.courier_code || '—').toUpperCase() },
  { header: 'Tracking', accessor: (o) => o.tracking_number || '—' },
];

export function OrdersPage({ initialTab = 'all', title = 'Ordini', subtitle = 'Gestisci tutti gli ordini ricevuti dallo store.' }: { initialTab?: (typeof TABS)[number]['key']; title?: string; subtitle?: string } = {}) {
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>(initialTab);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  // Tabs map to SERVER-side filters so tabs + search cover the whole dataset, not
  // just the rows already loaded. `stato`/`pagamento` accept comma lists (SQL IN).
  const serverFilters = useMemo<{ stato?: string; pagamento?: string }>(() => {
    switch (tab) {
      case 'unpaid':    return { pagamento: 'in_attesa,fallito' };
      case 'toship':    return { stato: 'in_attesa,in_preparazione' };
      case 'shipped':   return { stato: 'spedito,consegnato' };
      case 'cancelled': return { stato: 'annullato' };
      default:          return {};
    }
  }, [tab]);
  const query = useOrders({ ...serverFilters, q: debouncedSearch || undefined });
  const statusMut = useOrderStatusMutation();
  const deleteMut = useDeleteOrders();

  const rows = useMemo(() => flattenOrders(query.data?.pages), [query.data]);

  const columns = useMemo<ColumnDef<OrderRow, unknown>[]>(
    () => [
      {
        accessorKey: 'order_number',
        header: 'Ordine',
        cell: ({ row }) => <span className="font-semibold">{row.original.order_number}</span>,
      },
      {
        id: 'cliente',
        header: 'Cliente',
        accessorFn: (o) => `${o.customer_nome} ${o.customer_cognome}`,
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="truncate font-medium">
              {`${row.original.customer_nome} ${row.original.customer_cognome}`.trim() || '—'}
            </div>
            <div className="truncate text-xs text-muted-foreground">{row.original.customer_email}</div>
          </div>
        ),
      },
      { accessorKey: 'created_at', header: 'Data', cell: ({ getValue }) => <span className="text-muted-foreground">{date(getValue() as string)}</span> },
      {
        accessorKey: 'total',
        header: 'Totale',
        cell: ({ getValue }) => <span className="font-semibold">{eur(getValue() as string)}</span>,
        sortingFn: (a, b) => Number(a.original.total) - Number(b.original.total),
      },
      { accessorKey: 'payment_status', header: 'Pagamento', cell: ({ getValue }) => <StatusBadge code={getValue() as string} /> },
      { accessorKey: 'order_status', header: 'Stato', cell: ({ getValue }) => <StatusBadge code={getValue() as string} /> },
      {
        accessorKey: 'courier_code',
        header: 'Corriere',
        cell: ({ getValue }) => <span className="text-muted-foreground">{((getValue() as string) || '—').toUpperCase()}</span>,
      },
      {
        id: 'azioni', header: '', enableSorting: false,
        cell: ({ row }) =>
          row.original.order_status === 'annullato' ? null : (
            <ShipOrderDialog
              order={row.original}
              trigger={
                <Button variant="ghost" size="sm">
                  <Truck /> {row.original.tracking_number ? 'Tracking' : 'Spedisci'}
                </Button>
              }
            />
          ),
      },
    ],
    [],
  );

  async function bulkStatus(ids: number[], data: { order_status?: string; payment_status?: string }, clear: () => void) {
    await Promise.all(ids.map((id) => statusMut.mutateAsync({ id, data })));
    toast.success(`${ids.length} ordini aggiornati`);
    clear();
  }

  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} />

      <div className="mb-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t.key} value={t.key}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        getRowId={(o) => String(o.id)}
        externalSearch={{ value: search, onChange: setSearch }}
        searchPlaceholder="Cerca ordine o cliente…"
        exportName="ordini"
        exportTitle="Ordini"
        exportColumns={exportColumns}
        tableId="orders"
        isLoading={query.isLoading}
        hasMore={query.hasNextPage}
        onLoadMore={() => query.fetchNextPage()}
        loadingMore={query.isFetchingNextPage}
        emptyState={<EmptyState icon={ShoppingBag} title="Nessun ordine in questa vista" />}
        bulkActions={(selected, clear) => {
          const ids = selected.map((o) => o.id);
          return (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => bulkStatus(ids, { payment_status: 'pagato' }, clear)}
              >
                <CheckCircle2 /> Segna pagato
              </Button>
              <ConfirmDialog
                title={`Annullare ${ids.length} ordini?`}
                description="Lo stock e le compensazioni verranno ripristinati dal backend."
                confirmLabel="Annulla ordini"
                destructive
                onConfirm={() => bulkStatus(ids, { order_status: 'annullato' }, clear)}
                trigger={
                  <Button variant="secondary" size="sm">
                    <Ban /> Annulla
                  </Button>
                }
              />
              <ConfirmDialog
                title={`Eliminare ${ids.length} ordini?`}
                description="Operazione irreversibile."
                confirmLabel="Elimina"
                destructive
                onConfirm={async () => {
                  await deleteMut.mutateAsync(ids);
                  toast.success(`${ids.length} ordini eliminati`);
                  clear();
                }}
                trigger={
                  <Button variant="destructive" size="sm">
                    <Trash2 /> Elimina
                  </Button>
                }
              />
            </>
          );
        }}
      />
    </div>
  );
}
