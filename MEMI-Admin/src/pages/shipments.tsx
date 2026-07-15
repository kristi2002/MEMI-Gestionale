import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Truck, RefreshCw, Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/data-table/data-table';
import { StatusBadge } from '@/components/common/status-badge';
import { EmptyState } from '@/components/common/empty-state';
import { Button } from '@/components/ui/button';
import { useShipments } from '@/hooks/queries';
import { api } from '@/lib/api';
import { date } from '@/lib/format';
import { statusLabel } from '@/lib/status';
import type { Shipment2 } from '@/types';
import type { ExportColumn } from '@/lib/export';

const exportColumns: ExportColumn<Shipment2>[] = [
  { header: 'Tracking', accessor: (s) => s.tracking_number },
  { header: 'Ordine', accessor: (s) => s.order_number },
  { header: 'Cliente', accessor: (s) => `${s.customer_nome ?? ''} ${s.customer_cognome ?? ''}`.trim() },
  { header: 'Corriere', accessor: (s) => (s.courier_code || '').toUpperCase() },
  { header: 'Destinazione', accessor: (s) => s.destinazione || '' },
  { header: 'Stato', accessor: (s) => statusLabel(s.stato) },
  { header: 'ETA', accessor: (s) => (s.eta ? date(s.eta) : '') },
];

/** Shared table for both "Spedizioni in corso" and "Tracking". */
export function ShipmentsPage({ title = 'Spedizioni in corso' }: { title?: string }) {
  const query = useShipments();
  const qc = useQueryClient();
  const [refreshingId, setRefreshingId] = useState<number | null>(null);
  const rows = query.data ?? [];

  // Pull the live status from the courier for one shipment and refresh the table.
  // Backed by POST /orders/admin/:id/refresh-tracking — config-gated: a 503 when
  // no courier adapter/credentials are set surfaces as a friendly toast.
  async function refreshFromCourier(s: Shipment2) {
    setRefreshingId(s.id);
    try {
      const res = await api.orders.refreshTracking(s.order_id);
      toast.success(`Stato aggiornato dal corriere: ${statusLabel(res.status)}${res.simulated ? ' (simulato)' : ''}`);
      qc.invalidateQueries({ queryKey: ['shipments'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Aggiornamento dal corriere non riuscito');
    } finally {
      setRefreshingId(null);
    }
  }

  const columns = useMemo<ColumnDef<Shipment2, unknown>[]>(
    () => [
      { accessorKey: 'tracking_number', header: 'Tracking', cell: ({ getValue }) => <span className="font-semibold">{getValue() as string}</span> },
      { accessorKey: 'order_number', header: 'Ordine', cell: ({ getValue }) => <span className="text-muted-foreground">{getValue() as string}</span> },
      { id: 'cliente', header: 'Cliente', accessorFn: (s) => `${s.customer_nome ?? ''} ${s.customer_cognome ?? ''}`, cell: ({ row }) => <span className="truncate">{`${row.original.customer_nome ?? ''} ${row.original.customer_cognome ?? ''}`.trim() || '—'}</span> },
      { accessorKey: 'courier_code', header: 'Corriere', cell: ({ getValue }) => <span className="font-medium uppercase">{(getValue() as string) || '—'}</span> },
      { accessorKey: 'destinazione', header: 'Destinazione', cell: ({ getValue }) => <span className="text-muted-foreground">{(getValue() as string) || '—'}</span> },
      { accessorKey: 'eta', header: 'ETA', cell: ({ getValue }) => <span className="text-muted-foreground">{getValue() ? date(getValue() as string) : '—'}</span> },
      { accessorKey: 'stato', header: 'Stato', cell: ({ getValue }) => <StatusBadge code={getValue() as string} /> },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) => (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => refreshFromCourier(row.original)}
            disabled={refreshingId === row.original.id}
            title="Aggiorna stato dal corriere"
          >
            {refreshingId === row.original.id ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            <span className="hidden sm:inline">Aggiorna</span>
          </Button>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [refreshingId],
  );

  return (
    <div>
      <PageHeader title={title} subtitle="Spedizioni tracciate presso i corrieri." />
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(s) => String(s.id)}
        searchValue={(s) => `${s.tracking_number} ${s.order_number} ${s.customer_nome ?? ''} ${s.destinazione ?? ''}`}
        searchPlaceholder="Cerca tracking, ordine o cliente…"
        exportName="spedizioni"
        exportTitle={title}
        exportColumns={exportColumns}
        isLoading={query.isLoading}
        emptyState={<EmptyState icon={Truck} title="Nessuna spedizione attiva" />}
      />
    </div>
  );
}
