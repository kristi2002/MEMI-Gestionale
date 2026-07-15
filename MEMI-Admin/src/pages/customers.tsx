import { useMemo, useRef, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Trash2, Users, Plus, Pencil } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/data-table/data-table';
import { EmptyState } from '@/components/common/empty-state';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { EntityFormDialog, type FieldConfig, type FormValues } from '@/components/common/entity-form-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useCustomers, flattenCustomers, useDeleteCustomers, useSaveEntity } from '@/hooks/queries';
import { api } from '@/lib/api';
import { eur, date, initials, num } from '@/lib/format';
import type { CustomerRow } from '@/types';
import type { ExportColumn } from '@/lib/export';
import { toast } from 'sonner';

const fullName = (c: CustomerRow) => `${c.nome ?? ''} ${c.cognome ?? ''}`.trim();

const exportColumns: ExportColumn<CustomerRow>[] = [
  { header: 'ID', accessor: (c) => c.id },
  { header: 'Nome', accessor: (c) => fullName(c) },
  { header: 'Email', accessor: (c) => c.email },
  { header: 'Telefono', accessor: (c) => c.telefono || '' },
  { header: 'Città', accessor: (c) => c.citta || '' },
  { header: 'Ordini', accessor: (c) => c.total_orders },
  { header: 'Totale speso', accessor: (c) => eur(c.total_spent) },
  { header: 'Ultimo accesso', accessor: (c) => date(c.last_login) },
];

const ADDRESS_FIELDS: FieldConfig[] = [
  { name: 'nome', label: 'Nome', required: true },
  { name: 'cognome', label: 'Cognome' },
  { name: 'telefono', label: 'Telefono' },
  { name: 'indirizzo', label: 'Indirizzo', wide: true },
  { name: 'citta', label: 'Città' },
  { name: 'cap', label: 'CAP' },
  { name: 'paese', label: 'Paese' },
];

export function CustomersPage() {
  const query = useCustomers();
  const deleteMut = useDeleteCustomers();
  const saveMut = useSaveEntity(api.customers.create, api.customers.update, 'customers');
  const rows = useMemo(() => flattenCustomers(query.data?.pages), [query.data]);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerRow | null>(null);
  const [initial, setInitial] = useState<FormValues>({});

  function openCreate() {
    setEditing(null);
    setInitial({ paese: 'Italia' });
    setFormOpen(true);
  }
  async function openEdit(c: CustomerRow) {
    setEditing(c);
    // Prefill from full detail so we never blank a field the list view omits.
    let d: Record<string, unknown> = { ...c };
    try { d = (await api.customers.get(c.id)) as Record<string, unknown>; } catch { /* fall back to row */ }
    setInitial({
      nome: (d.nome as string) ?? '', cognome: (d.cognome as string) ?? '', telefono: (d.telefono as string) ?? '',
      indirizzo: (d.indirizzo as string) ?? '', citta: (d.citta as string) ?? '', cap: (d.cap as string) ?? '',
      paese: (d.paese as string) ?? 'Italia',
    });
    setFormOpen(true);
  }
  const openEditRef = useRef(openEdit);
  openEditRef.current = openEdit;

  const fields = useMemo<FieldConfig[]>(() => {
    if (editing) return ADDRESS_FIELDS;
    return [
      { name: 'nome', label: 'Nome', required: true },
      { name: 'cognome', label: 'Cognome' },
      { name: 'email', label: 'Email', type: 'email', required: true },
      { name: 'telefono', label: 'Telefono' },
      { name: 'indirizzo', label: 'Indirizzo', wide: true },
      { name: 'citta', label: 'Città' },
      { name: 'cap', label: 'CAP' },
      { name: 'paese', label: 'Paese' },
      { name: 'password', label: 'Password (facoltativa)', type: 'text', help: 'Solo se vuoi che il cliente possa accedere. Min. 8 caratteri.' },
    ];
  }, [editing]);

  async function onSubmit(v: FormValues) {
    if (editing) {
      const data = {
        nome: v.nome, cognome: v.cognome || '', telefono: v.telefono || null,
        indirizzo: v.indirizzo || null, citta: v.citta || null, cap: v.cap || null, paese: v.paese || 'Italia',
      };
      await saveMut.mutateAsync({ id: editing.id, data });
      toast.success('Cliente aggiornato');
    } else {
      const data: Record<string, unknown> = {
        nome: v.nome, cognome: v.cognome || '', email: v.email, telefono: v.telefono || null,
        indirizzo: v.indirizzo || null, citta: v.citta || null, cap: v.cap || null, paese: v.paese || 'Italia',
      };
      if (v.password) data.password = v.password;
      await saveMut.mutateAsync({ data });
      toast.success('Cliente creato');
    }
  }

  const columns = useMemo<ColumnDef<CustomerRow, unknown>[]>(
    () => [
      {
        id: 'cliente',
        header: 'Cliente',
        accessorFn: (c) => fullName(c),
        cell: ({ row }) => {
          const c = row.original;
          const vip = num(c.total_spent) > 300;
          return (
            <div className="flex min-w-0 items-center gap-3">
              <Avatar className="h-9 w-9">
                <AvatarFallback>{initials(fullName(c) || c.email)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{fullName(c) || '—'}</span>
                  {vip && <Badge variant="warning">VIP</Badge>}
                </div>
                <div className="truncate text-xs text-muted-foreground">{c.email}</div>
              </div>
            </div>
          );
        },
      },
      { accessorKey: 'citta', header: 'Città', cell: ({ getValue }) => <span className="text-muted-foreground">{(getValue() as string) || '—'}</span> },
      { accessorKey: 'total_orders', header: 'Ordini' },
      {
        accessorKey: 'total_spent',
        header: 'Totale speso',
        cell: ({ getValue }) => <span className="font-semibold">{eur(getValue() as string)}</span>,
        sortingFn: (a, b) => num(a.original.total_spent) - num(b.original.total_spent),
      },
      { accessorKey: 'last_login', header: 'Ultimo accesso', cell: ({ getValue }) => <span className="text-muted-foreground">{date(getValue() as string)}</span> },
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
        title="Clienti"
        subtitle="Anagrafica clienti, spesa e attività."
        actions={<Button size="sm" onClick={openCreate}><Plus /> Nuovo cliente</Button>}
      />

      <DataTable
        columns={columns}
        data={rows}
        getRowId={(c) => String(c.id)}
        searchValue={(c) => `${fullName(c)} ${c.email} ${c.citta ?? ''}`}
        searchPlaceholder="Cerca cliente o email…"
        exportName="clienti"
        exportTitle="Clienti"
        exportColumns={exportColumns}
        isLoading={query.isLoading}
        hasMore={query.hasNextPage}
        onLoadMore={() => query.fetchNextPage()}
        loadingMore={query.isFetchingNextPage}
        emptyState={<EmptyState icon={Users} title="Nessun cliente" />}
        bulkActions={(selected, clear) => {
          const ids = selected.map((c) => c.id);
          return (
            <ConfirmDialog
              title={`Eliminare ${ids.length} clienti?`}
              description="Operazione irreversibile."
              confirmLabel="Elimina"
              destructive
              onConfirm={async () => {
                await deleteMut.mutateAsync(ids);
                toast.success(`${ids.length} clienti eliminati`);
                clear();
              }}
              trigger={
                <Button variant="destructive" size="sm">
                  <Trash2 /> Elimina
                </Button>
              }
            />
          );
        }}
      />

      <EntityFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title={editing ? `Modifica cliente: ${fullName(editing) || editing.email}` : 'Nuovo cliente'}
        fields={fields}
        initial={initial}
        submitLabel={editing ? 'Salva modifiche' : 'Crea cliente'}
        onSubmit={onSubmit}
      />
    </div>
  );
}
