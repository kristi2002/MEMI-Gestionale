import { useMemo, useRef, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { UserCog, Plus, Pencil } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/data-table/data-table';
import { BulkDelete } from '@/components/data-table/bulk-delete';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { EmptyState } from '@/components/common/empty-state';
import { EntityFormDialog, type FieldConfig, type FormValues } from '@/components/common/entity-form-dialog';
import { Button } from '@/components/ui/button';
import { useStaff, useDeleteMany, useSaveEntity } from '@/hooks/queries';
import { useAuth } from '@/hooks/use-auth';
import { api } from '@/lib/api';
import { date, initials } from '@/lib/format';
import type { StaffMember } from '@/types';
import type { ExportColumn } from '@/lib/export';
import { toast } from 'sonner';

const exportColumns: ExportColumn<StaffMember>[] = [
  { header: 'Nome', accessor: (m) => m.nome || '' },
  { header: 'Email', accessor: (m) => m.email },
  { header: 'Ruolo', accessor: (m) => m.role },
  { header: 'Permessi', accessor: (m) => (m.permissions ? m.permissions.join(' | ') : 'tutti (da ruolo)') },
  { header: 'Creato il', accessor: (m) => date(m.created_at) },
];

const ROLE_OPTS = [
  { value: 'admin', label: 'Admin (accesso completo)' },
  { value: 'staff', label: 'Staff (permessi limitati)' },
];

export function StaffPage() {
  const query = useStaff();
  const { me } = useAuth();
  const del = useDeleteMany<number>((id) => api.staff.delete(id), 'staff');
  const saveMut = useSaveEntity(api.staff.create, api.staff.update, 'staff');
  const rows = query.data?.staff ?? [];

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [initial, setInitial] = useState<FormValues>({});

  function openCreate() {
    setEditing(null);
    setInitial({ role: 'staff' });
    setFormOpen(true);
  }
  function openEdit(m: StaffMember) {
    setEditing(m);
    setInitial({ nome: m.nome ?? '', email: m.email, role: m.role, password: '' });
    setFormOpen(true);
  }
  const openEditRef = useRef(openEdit);
  openEditRef.current = openEdit;

  const fields = useMemo<FieldConfig[]>(() => {
    if (editing) {
      return [
        { name: 'nome', label: 'Nome', required: true },
        { name: 'role', label: 'Ruolo', type: 'select', options: ROLE_OPTS },
        { name: 'password', label: 'Nuova password', type: 'text', help: 'Lascia vuoto per non modificarla. Minimo 8 caratteri.' },
      ];
    }
    return [
      { name: 'nome', label: 'Nome', required: true },
      { name: 'email', label: 'Email', type: 'email', required: true },
      { name: 'password', label: 'Password', type: 'text', required: true, help: 'Minimo 8 caratteri.' },
      { name: 'role', label: 'Ruolo', type: 'select', options: ROLE_OPTS },
    ];
  }, [editing]);

  async function onSubmit(v: FormValues) {
    if (editing) {
      const data: Record<string, unknown> = { nome: v.nome, role: v.role };
      if (v.password) data.password = v.password;
      await saveMut.mutateAsync({ id: editing.id, data });
      toast.success('Membro aggiornato');
    } else {
      await saveMut.mutateAsync({ data: { nome: v.nome, email: v.email, password: v.password, role: v.role || 'staff' } });
      toast.success('Membro aggiunto');
    }
  }

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
      {
        id: 'azioni', header: '', enableSorting: false,
        cell: ({ row }) => (
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openEditRef.current(row.original); }}>
            <Pencil /> Modifica
          </Button>
        ),
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Staff & Permessi"
        subtitle="Utenti amministratori e relativi permessi."
        actions={<Button size="sm" onClick={openCreate}><Plus /> Nuovo membro</Button>}
      />
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
      <EntityFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title={editing ? `Modifica membro: ${editing.nome || editing.email}` : 'Nuovo membro dello staff'}
        fields={fields}
        initial={initial}
        submitLabel={editing ? 'Salva modifiche' : 'Aggiungi membro'}
        onSubmit={onSubmit}
      />
    </div>
  );
}
