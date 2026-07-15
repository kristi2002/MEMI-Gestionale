import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Factory, Plus, Pencil } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/data-table/data-table';
import { BulkDelete } from '@/components/data-table/bulk-delete';
import { EmptyState } from '@/components/common/empty-state';
import type { FieldConfig, FormValues } from '@/components/common/entity-form-dialog';
import { EntityFormPage } from '@/components/common/entity-form-page';
import { Button } from '@/components/ui/button';
import { useSuppliers, useDeleteMany, useSaveEntity } from '@/hooks/queries';
import { api } from '@/lib/api';
import { date } from '@/lib/format';
import type { Supplier } from '@/types';
import type { ExportColumn } from '@/lib/export';
import { toast } from 'sonner';

const exportColumns: ExportColumn<Supplier>[] = [
  { header: 'Nome', accessor: (s) => s.nome },
  { header: 'Email', accessor: (s) => s.email || '' },
  { header: 'Telefono', accessor: (s) => s.telefono || '' },
  { header: 'Note', accessor: (s) => s.note || '' },
  { header: 'Creato il', accessor: (s) => date(s.created_at) },
];

const FIELDS: FieldConfig[] = [
  { name: 'nome', label: 'Nome fornitore', required: true, wide: true },
  { name: 'email', label: 'Email', type: 'email' },
  { name: 'telefono', label: 'Telefono' },
  { name: 'note', label: 'Note', type: 'textarea' },
];

export function SuppliersPage() {
  const query = useSuppliers();
  const del = useDeleteMany<number>((id) => api.suppliers.delete(id), 'suppliers');
  const navigate = useNavigate();
  const rows = query.data ?? [];

  const columns = useMemo<ColumnDef<Supplier, unknown>[]>(
    () => [
      { accessorKey: 'nome', header: 'Fornitore', cell: ({ getValue }) => <span className="font-medium">{getValue() as string}</span> },
      { accessorKey: 'email', header: 'Email', cell: ({ getValue }) => <span className="text-muted-foreground">{(getValue() as string) || '—'}</span> },
      { accessorKey: 'telefono', header: 'Telefono', cell: ({ getValue }) => <span className="text-muted-foreground">{(getValue() as string) || '—'}</span> },
      { accessorKey: 'note', header: 'Note', cell: ({ getValue }) => <span className="line-clamp-1 max-w-[280px] text-muted-foreground">{(getValue() as string) || '—'}</span> },
      { accessorKey: 'created_at', header: 'Creato il', cell: ({ getValue }) => <span className="text-muted-foreground">{date(getValue() as string)}</span> },
      {
        id: 'azioni', header: '', enableSorting: false,
        cell: ({ row }) => (
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/suppliers/${row.original.id}/edit`); }}>
            <Pencil /> Modifica
          </Button>
        ),
      },
    ],
    [navigate],
  );

  return (
    <div>
      <PageHeader
        title="Fornitori"
        subtitle="Anagrafica fornitori per gli ordini di acquisto."
        actions={<Button size="sm" onClick={() => navigate('/suppliers/new')}><Plus /> Nuovo fornitore</Button>}
      />
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(s) => String(s.id)}
        searchValue={(s) => `${s.nome} ${s.email ?? ''} ${s.telefono ?? ''}`}
        searchPlaceholder="Cerca fornitore…"
        exportName="fornitori"
        exportTitle="Fornitori"
        exportColumns={exportColumns}
        isLoading={query.isLoading}
        emptyState={<EmptyState icon={Factory} title="Nessun fornitore" />}
        bulkActions={(selected, clear) => (
          <BulkDelete count={selected.length} noun="fornitori" onDelete={() => del.mutateAsync(selected.map((s) => s.id))} onDone={clear} />
        )}
      />
    </div>
  );
}

/** Full-page create/edit form for a supplier. */
export function SupplierFormPage() {
  const { id } = useParams<{ id: string }>();
  const editing = id != null;
  const query = useSuppliers();
  const saveMut = useSaveEntity(api.suppliers.create, api.suppliers.update, 'suppliers');
  const row = editing ? (query.data ?? []).find((s) => String(s.id) === id) : undefined;

  const initial = useMemo<FormValues>(
    () => (row ? { nome: row.nome, email: row.email ?? '', telefono: row.telefono ?? '', note: row.note ?? '' } : {}),
    [row],
  );

  return (
    <EntityFormPage
      title={editing ? 'Modifica fornitore' : 'Nuovo fornitore'}
      backPath="/suppliers"
      backLabel="Fornitori"
      fields={FIELDS}
      initial={initial}
      loading={editing && !row && query.isLoading}
      submitLabel={editing ? 'Salva modifiche' : 'Aggiungi fornitore'}
      onSubmit={async (v) => {
        await saveMut.mutateAsync({
          id: editing ? Number(id) : undefined,
          data: { nome: v.nome, email: v.email || null, telefono: v.telefono || null, note: v.note || null },
        });
        toast.success(editing ? 'Fornitore aggiornato' : 'Fornitore aggiunto');
      }}
    />
  );
}
