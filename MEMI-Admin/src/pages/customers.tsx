import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Trash2, Users, Plus, Pencil } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/data-table/data-table';
import type { FilterDef } from '@/components/data-table/filters';
import { EmptyState } from '@/components/common/empty-state';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import type { FieldConfig, FormValues } from '@/components/common/entity-form-dialog';
import { EntityFormPage } from '@/components/common/entity-form-page';
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

const CREATE_FIELDS: FieldConfig[] = [
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

export function CustomersPage() {
  const query = useCustomers();
  const deleteMut = useDeleteCustomers();
  const navigate = useNavigate();
  const rows = useMemo(() => flattenCustomers(query.data?.pages), [query.data]);

  const filters = useMemo<FilterDef<CustomerRow>[]>(() => {
    const paesi = [...new Set(rows.map((c) => c.paese).filter(Boolean))].sort();
    return [
      { key: 'paese', type: 'select', label: 'Paese', accessor: (c) => c.paese, options: paesi.map((p) => ({ value: p, label: p })) },
      { key: 'orders', type: 'numberRange', label: 'Ordini', accessor: (c) => c.total_orders },
      { key: 'spent', type: 'numberRange', label: 'Speso', unit: '€', accessor: (c) => num(c.total_spent) },
      { key: 'created', type: 'dateRange', label: 'Iscritto', accessor: (c) => c.created_at },
    ];
  }, [rows]);

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
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/customers/${row.original.id}/edit`); }}>
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
        actions={<Button size="sm" onClick={() => navigate('/customers/new')}><Plus /> Nuovo cliente</Button>}
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
        filters={filters}
        tableId="customers"
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

    </div>
  );
}

/** Full-page create/edit form for a customer. Edit loads full detail. */
export function CustomerFormPage() {
  const { id } = useParams<{ id: string }>();
  const editing = id != null;
  const saveMut = useSaveEntity(api.customers.create, api.customers.update, 'customers');
  const detailQ = useQuery({
    queryKey: ['customers', 'detail', id],
    queryFn: () => api.customers.get(Number(id)),
    enabled: editing,
  });
  const d = detailQ.data as Record<string, unknown> | undefined;

  const initial = useMemo<FormValues>(() => {
    if (!editing) return { paese: 'Italia' };
    return d
      ? {
          nome: (d.nome as string) ?? '', cognome: (d.cognome as string) ?? '', telefono: (d.telefono as string) ?? '',
          indirizzo: (d.indirizzo as string) ?? '', citta: (d.citta as string) ?? '', cap: (d.cap as string) ?? '',
          paese: (d.paese as string) ?? 'Italia',
        }
      : {};
  }, [editing, d]);

  return (
    <EntityFormPage
      title={editing ? 'Modifica cliente' : 'Nuovo cliente'}
      backPath="/customers"
      backLabel="Clienti"
      fields={editing ? ADDRESS_FIELDS : CREATE_FIELDS}
      initial={initial}
      loading={editing && detailQ.isLoading}
      submitLabel={editing ? 'Salva modifiche' : 'Crea cliente'}
      onSubmit={async (v) => {
        if (editing) {
          await saveMut.mutateAsync({
            id: Number(id),
            data: { nome: v.nome, cognome: v.cognome || '', telefono: v.telefono || null, indirizzo: v.indirizzo || null, citta: v.citta || null, cap: v.cap || null, paese: v.paese || 'Italia' },
          });
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
      }}
    />
  );
}
