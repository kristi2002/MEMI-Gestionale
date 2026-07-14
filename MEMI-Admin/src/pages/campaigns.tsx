import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Megaphone } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/data-table/data-table';
import { BulkDelete } from '@/components/data-table/bulk-delete';
import { StatusBadge } from '@/components/common/status-badge';
import { EmptyState } from '@/components/common/empty-state';
import { Badge } from '@/components/ui/badge';
import { useCampaigns, useDeleteMany } from '@/hooks/queries';
import { api } from '@/lib/api';
import { eur, num } from '@/lib/format';
import type { Campaign } from '@/types';
import type { ExportColumn } from '@/lib/export';

const exportColumns: ExportColumn<Campaign>[] = [
  { header: 'Nome', accessor: (c) => c.nome },
  { header: 'Tipo', accessor: (c) => c.tipo },
  { header: 'Budget', accessor: (c) => eur(c.budget) },
  { header: 'Destinatari', accessor: (c) => c.destinatari },
  { header: 'Open rate', accessor: (c) => `${num(c.open_rate).toFixed(1)}%` },
  { header: 'Click rate', accessor: (c) => `${num(c.click_rate).toFixed(1)}%` },
  { header: 'Revenue', accessor: (c) => eur(c.revenue) },
  { header: 'Stato', accessor: (c) => c.stato },
];

export function CampaignsPage() {
  const query = useCampaigns();
  const del = useDeleteMany<number>((id) => api.campaigns.delete(id), 'campaigns');
  const rows = query.data ?? [];

  const columns = useMemo<ColumnDef<Campaign, unknown>[]>(
    () => [
      { accessorKey: 'nome', header: 'Campagna', cell: ({ getValue }) => <span className="font-medium">{getValue() as string}</span> },
      { accessorKey: 'tipo', header: 'Tipo', cell: ({ getValue }) => <Badge variant="neutral">{getValue() as string}</Badge> },
      { accessorKey: 'destinatari', header: 'Destinatari', cell: ({ getValue }) => <span className="text-muted-foreground">{(getValue() as number).toLocaleString('it-IT')}</span> },
      { accessorKey: 'open_rate', header: 'Open', cell: ({ getValue }) => `${num(getValue()).toFixed(1)}%` },
      { accessorKey: 'click_rate', header: 'Click', cell: ({ getValue }) => `${num(getValue()).toFixed(1)}%` },
      { accessorKey: 'revenue', header: 'Revenue', cell: ({ getValue }) => <span className="font-semibold">{eur(getValue() as string)}</span>, sortingFn: (a, b) => num(a.original.revenue) - num(b.original.revenue) },
      { accessorKey: 'stato', header: 'Stato', cell: ({ getValue }) => <StatusBadge code={getValue() as string} /> },
    ],
    [],
  );

  return (
    <div>
      <PageHeader title="Campagne" subtitle="Campagne marketing e relative performance." />
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(c) => String(c.id)}
        searchValue={(c) => `${c.nome} ${c.tipo}`}
        searchPlaceholder="Cerca campagna…"
        exportName="campagne"
        exportTitle="Campagne"
        exportColumns={exportColumns}
        isLoading={query.isLoading}
        emptyState={<EmptyState icon={Megaphone} title="Nessuna campagna" />}
        bulkActions={(selected, clear) => (
          <BulkDelete count={selected.length} noun="campagne" onDelete={() => del.mutateAsync(selected.map((c) => c.id))} onDone={clear} />
        )}
      />
    </div>
  );
}
