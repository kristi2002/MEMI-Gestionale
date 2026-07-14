import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Gift } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { KpiCard } from '@/components/common/kpi-card';
import { DataTable } from '@/components/data-table/data-table';
import { BulkDelete } from '@/components/data-table/bulk-delete';
import { StatusBadge } from '@/components/common/status-badge';
import { EmptyState } from '@/components/common/empty-state';
import { useGiftcards, useDeleteMany } from '@/hooks/queries';
import { api } from '@/lib/api';
import { eur, date } from '@/lib/format';
import { statusLabel } from '@/lib/status';
import type { GiftCard } from '@/types';
import type { ExportColumn } from '@/lib/export';

const exportColumns: ExportColumn<GiftCard>[] = [
  { header: 'Codice', accessor: (g) => g.code },
  { header: 'Valore iniziale', accessor: (g) => eur(g.initial_amount) },
  { header: 'Saldo', accessor: (g) => eur(g.balance) },
  { header: 'Destinatario', accessor: (g) => g.recipient_email || '' },
  { header: 'Stato', accessor: (g) => statusLabel(g.stato) },
  { header: 'Data', accessor: (g) => date(g.created_at) },
];

export function GiftcardsPage() {
  const query = useGiftcards();
  const del = useDeleteMany<number>((id) => api.giftcards.delete(id), 'giftcards');
  const rows = query.data?.cards ?? [];
  const s = query.data?.summary;

  const columns = useMemo<ColumnDef<GiftCard, unknown>[]>(
    () => [
      { accessorKey: 'code', header: 'Codice', cell: ({ getValue }) => <code className="rounded bg-muted px-2 py-1 text-sm font-semibold">{getValue() as string}</code> },
      { accessorKey: 'initial_amount', header: 'Valore', cell: ({ getValue }) => eur(getValue() as string) },
      { accessorKey: 'balance', header: 'Saldo', cell: ({ getValue }) => <span className="font-semibold">{eur(getValue() as string)}</span>, sortingFn: (a, b) => Number(a.original.balance) - Number(b.original.balance) },
      { accessorKey: 'recipient_email', header: 'Destinatario', cell: ({ getValue }) => <span className="text-muted-foreground">{(getValue() as string) || '—'}</span> },
      { accessorKey: 'created_at', header: 'Data', cell: ({ getValue }) => <span className="text-muted-foreground">{date(getValue() as string)}</span> },
      { accessorKey: 'stato', header: 'Stato', cell: ({ getValue }) => <StatusBadge code={getValue() as string} /> },
    ],
    [],
  );

  return (
    <div>
      <PageHeader title="Gift card" subtitle="Buoni regalo emessi e relativi saldi." />
      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Totale" value={s?.total ?? 0} icon={Gift} tone="primary" loading={query.isLoading} />
        <KpiCard label="Attive" value={s?.attive ?? 0} tone="success" loading={query.isLoading} />
        <KpiCard label="Emesso" value={eur(s?.emesso ?? 0)} tone="info" loading={query.isLoading} />
        <KpiCard label="Saldo residuo" value={eur(s?.balance ?? 0)} tone="warning" loading={query.isLoading} />
      </div>
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(g) => String(g.id)}
        searchValue={(g) => `${g.code} ${g.recipient_email ?? ''}`}
        searchPlaceholder="Cerca codice o destinatario…"
        exportName="giftcard"
        exportTitle="Gift card"
        exportColumns={exportColumns}
        isLoading={query.isLoading}
        emptyState={<EmptyState icon={Gift} title="Nessuna gift card" />}
        bulkActions={(selected, clear) => (
          <BulkDelete count={selected.length} noun="gift card" onDelete={() => del.mutateAsync(selected.map((g) => g.id))} onDone={clear} />
        )}
      />
    </div>
  );
}
