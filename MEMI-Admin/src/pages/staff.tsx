import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { UserCog } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/data-table/data-table';
import { BulkDelete } from '@/components/data-table/bulk-delete';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { EmptyState } from '@/components/common/empty-state';
import { useStaff, useDeleteMany } from '@/hooks/queries';
import { useAuth } from '@/hooks/use-auth';
import { api } from '@/lib/api';
import { date, initials } from '@/lib/format';
import type { StaffMember } from '@/types';
import type { ExportColumn } from '@/lib/export';

const exportColumns: ExportColumn<StaffMember>[] = [
  { header: 'Nome', accessor: (m) => m.nome || '' },
  { header: 'Email', accessor: (m) => m.email },
  { header: 'Ruolo', accessor: (m) => m.role },
  { header: 'Permessi', accessor: (m) => (m.permissions ? m.permissions.join(' | ') : 'tutti (da ruolo)') },
  { header: 'Creato il', accessor: (m) => date(m.created_at) },
];

export function StaffPage() {
  const query = useStaff();
  const { me } = useAuth();
  const del = useDeleteMany<number>((id) => api.staff.delete(id), 'staff');
  const rows = query.data?.staff ?? [];

  const columns = useMemo<ColumnDef<StaffMember, unknown>[]>(
    () => [
      {
        id: 'membro',
        header: 'Membro',
        accessorFn: (m) => m.nome || m.email,
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-3">
            <Avatar className="h-8 w-8">
              <AvatarFallback>{initials(row.original.nome || row.original.email)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="truncate font-medium">{row.original.nome || '—'}</div>
              <div className="truncate text-xs text-muted-foreground">{row.original.email}</div>
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'role',
        header: 'Ruolo',
        cell: ({ getValue }) => (getValue() === 'admin' ? <Badge variant="default">Admin</Badge> : <Badge variant="neutral">Staff</Badge>),
      },
      {
        accessorKey: 'permissions',
        header: 'Permessi',
        cell: ({ row }) => {
          const p = row.original.permissions;
          if (!p) return <span className="text-xs text-muted-foreground">tutti (da ruolo)</span>;
          return (
            <div className="flex max-w-[320px] flex-wrap gap-1">
              {p.slice(0, 4).map((x) => (
                <Badge key={x} variant="neutral">
                  {x}
                </Badge>
              ))}
              {p.length > 4 && <span className="text-xs text-muted-foreground">+{p.length - 4}</span>}
            </div>
          );
        },
      },
      { accessorKey: 'created_at', header: 'Creato il', cell: ({ getValue }) => <span className="text-muted-foreground">{date(getValue() as string)}</span> },
    ],
    [],
  );

  return (
    <div>
      <PageHeader title="Staff & Permessi" subtitle="Utenti amministratori e relativi permessi." />
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(m) => String(m.id)}
        searchValue={(m) => `${m.nome ?? ''} ${m.email} ${m.role}`}
        searchPlaceholder="Cerca membro…"
        exportName="staff"
        exportTitle="Staff & Permessi"
        exportColumns={exportColumns}
        isLoading={query.isLoading}
        emptyState={<EmptyState icon={UserCog} title="Nessun membro dello staff" />}
        bulkActions={(selected, clear) => {
          // Never allow deleting your own account from a bulk action.
          const ids = selected.map((m) => m.id).filter((id) => id !== me?.id);
          if (ids.length === 0) return <span className="px-2 text-xs text-muted-foreground">Non puoi eliminare il tuo account</span>;
          return (
            <BulkDelete
              count={ids.length}
              noun="membri"
              description="I membri selezionati perderanno l'accesso al gestionale."
              onDelete={() => del.mutateAsync(ids)}
              onDone={clear}
            />
          );
        }}
      />
    </div>
  );
}
