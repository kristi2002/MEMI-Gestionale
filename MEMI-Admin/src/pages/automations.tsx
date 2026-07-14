import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Zap, Power } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/data-table/data-table';
import { BulkDelete } from '@/components/data-table/bulk-delete';
import { EmptyState } from '@/components/common/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAutomations, useDeleteMany, useUpdateOne } from '@/hooks/queries';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/format';
import type { Automation } from '@/types';
import type { ExportColumn } from '@/lib/export';

const exportColumns: ExportColumn<Automation>[] = [
  { header: 'Nome', accessor: (a) => a.nome },
  { header: 'Trigger', accessor: (a) => a.trigger_event },
  { header: 'Azione', accessor: (a) => a.azione },
  { header: 'Attivo', accessor: (a) => (a.attivo ? 'Sì' : 'No') },
  { header: 'Esecuzioni', accessor: (a) => a.run_count },
  { header: 'Ultima', accessor: (a) => (a.last_run ? dateTime(a.last_run) : '') },
];

export function AutomationsPage() {
  const query = useAutomations();
  const del = useDeleteMany<number>((id) => api.automations.delete(id), 'automations');
  const update = useUpdateOne<number>((id, data) => api.automations.update(id, data), 'automations');
  const rows = query.data?.automations ?? [];

  const columns = useMemo<ColumnDef<Automation, unknown>[]>(
    () => [
      { accessorKey: 'nome', header: 'Automazione', cell: ({ getValue }) => <span className="font-medium">{getValue() as string}</span> },
      { accessorKey: 'trigger_event', header: 'Quando', cell: ({ getValue }) => <Badge variant="neutral">{(getValue() as string).replace(/_/g, ' ')}</Badge> },
      { accessorKey: 'azione', header: 'Fa', cell: ({ getValue }) => <span className="text-muted-foreground">{(getValue() as string).replace(/_/g, ' ')}</span> },
      { accessorKey: 'run_count', header: 'Eseguita', cell: ({ getValue }) => <span className="text-muted-foreground">{getValue() as number}×</span> },
      { accessorKey: 'last_run', header: 'Ultima', cell: ({ getValue }) => <span className="text-muted-foreground">{getValue() ? dateTime(getValue() as string) : '—'}</span> },
      {
        accessorKey: 'attivo',
        header: 'Stato',
        cell: ({ row }) => (
          <Button
            variant={row.original.attivo ? 'secondary' : 'outline'}
            size="sm"
            className="h-7"
            onClick={() => update.mutate({ id: row.original.id, data: { attivo: row.original.attivo ? 0 : 1 } })}
          >
            <Power className={row.original.attivo ? 'text-success' : 'text-muted-foreground'} />
            {row.original.attivo ? 'Attiva' : 'Off'}
          </Button>
        ),
      },
    ],
    [update],
  );

  return (
    <div>
      <PageHeader title="Automazioni" subtitle="Azioni automatiche attivate da eventi dello store." />
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(a) => String(a.id)}
        searchValue={(a) => `${a.nome} ${a.trigger_event} ${a.azione}`}
        searchPlaceholder="Cerca automazione…"
        exportName="automazioni"
        exportTitle="Automazioni"
        exportColumns={exportColumns}
        isLoading={query.isLoading}
        emptyState={<EmptyState icon={Zap} title="Nessuna automazione" />}
        bulkActions={(selected, clear) => (
          <BulkDelete count={selected.length} noun="automazioni" onDelete={() => del.mutateAsync(selected.map((a) => a.id))} onDone={clear} />
        )}
      />
    </div>
  );
}
