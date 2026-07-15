import { useMemo, useRef } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Factory, Plus, Pencil } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/data-table/data-table';
import { BulkDelete } from '@/components/data-table/bulk-delete';
import { EmptyState } from '@/components/common/empty-state';
import { EntityFormDialog, useEntityForm, type FieldConfig, type FormValues } from '@/components/common/entity-form-dialog';
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
  const saveMut = useSaveEntity(api.suppliers.create, api.suppliers.update, 'suppliers');
  const form = useEntityForm();
  const rows = query.data ?? [];

  const openEditRef = useRef(form.openEdit);
  openEditRef.current = form.openEdit;

  async function onSubmit(v: FormValues) {
    const id = form.editing?.id as number | undefined;
    const data = { nome: v.nome, email: v.email || null, telefono: v.telefono || null, note: v.note || null };
    await saveMut.mutateAsync({ id, data });
    toast.success(id ? 'Fornitore aggiornato' : 'Fornitore aggiunto');
  }

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
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openEditRef.current(row.original as unknown as FormValues); }}>
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
        title="Fornitori"
        subtitle="Anagrafica fornitori per gli ordini di acquisto."
        actions={<Button size="sm" onClick={form.openCreate}><Plus /> Nuovo fornitore</Button>}
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
      <EntityFormDialog
        open={form.open}
        onOpenChange={form.setOpen}
        title={form.editing ? `Modifica fornitore` : 'Nuovo fornitore'}
        fields={FIELDS}
        initial={form.editing}
        submitLabel={form.editing ? 'Salva modifiche' : 'Aggiungi fornitore'}
        onSubmit={onSubmit}
      />
    </div>
  );
}
