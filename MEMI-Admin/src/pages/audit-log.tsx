import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { History } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/data-table/data-table';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/common/empty-state';
import { useAuditLog } from '@/hooks/queries';
import { dateTime } from '@/lib/format';
import type { AuditEntry } from '@/types';
import type { ExportColumn } from '@/lib/export';

const exportColumns: ExportColumn<AuditEntry>[] = [
  { header: 'Data', accessor: (a) => dateTime(a.created_at) },
  { header: 'Admin', accessor: (a) => a.admin_email || String(a.admin_id ?? '') },
  { header: 'Azione', accessor: (a) => a.action },
  { header: 'Entità', accessor: (a) => `${a.entity_type}#${a.entity_id}` },
  { header: 'Dettagli', accessor: (a) => (a.details ? JSON.stringify(a.details) : '') },
];

export function AuditLogPage() {
  const query = useAuditLog();
  const rows = useMemo(() => (query.data?.pages ?? []).flatMap((p) => p.items), [query.data]);

  const columns = useMemo<ColumnDef<AuditEntry, unknown>[]>(
    () => [
      { accessorKey: 'created_at', header: 'Data', cell: ({ getValue }) => <span className="whitespace-nowrap text-muted-foreground">{dateTime(getValue() as string)}</span> },
      { accessorKey: 'admin_email', header: 'Admin', cell: ({ row }) => <span className="text-sm">{row.original.admin_email || `#${row.original.admin_id ?? '—'}`}</span> },
      { accessorKey: 'action', header: 'Azione', cell: ({ getValue }) => <Badge variant="neutral">{getValue() as string}</Badge> },
      {
        id: 'entita',
        header: 'Entità',
        accessorFn: (a) => a.entity_type,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.entity_type}
            <span className="text-foreground">#{row.original.entity_id}</span>
          </span>
        ),
      },
      {
        id: 'dettagli',
        header: 'Dettagli',
        accessorFn: (a) => (a.details ? JSON.stringify(a.details) : ''),
        cell: ({ getValue }) => <code className="line-clamp-1 block max-w-[320px] text-xs text-muted-foreground">{(getValue() as string) || '—'}</code>,
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader title="Registro attività" subtitle="Traccia delle azioni degli amministratori." />
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(a) => String(a.id)}
        searchValue={(a) => `${a.admin_email ?? ''} ${a.action} ${a.entity_type} ${a.entity_id}`}
        searchPlaceholder="Cerca azione, admin o entità…"
        exportName="registro_attivita"
        exportTitle="Registro attività"
        exportColumns={exportColumns}
        isLoading={query.isLoading}
        pageSize={50}
        hasMore={query.hasNextPage}
        onLoadMore={() => query.fetchNextPage()}
        loadingMore={query.isFetchingNextPage}
        emptyState={<EmptyState icon={History} title="Nessuna attività registrata" />}
      />
    </div>
  );
}
