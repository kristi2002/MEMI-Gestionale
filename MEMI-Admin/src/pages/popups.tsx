import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { MessageSquareDashed, Plus, Pencil } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/data-table/data-table';
import { BulkDelete } from '@/components/data-table/bulk-delete';
import { EmptyState } from '@/components/common/empty-state';
import { EntityFormDialog, useEntityForm, type FieldConfig, type FormValues } from '@/components/common/entity-form-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { usePopups, useDeleteMany, useSaveEntity } from '@/hooks/queries';
import { api } from '@/lib/api';
import type { Popup } from '@/types';
import type { ExportColumn } from '@/lib/export';
import { toast } from 'sonner';

const POSIZIONI = [
  { value: 'center', label: 'Centro' },
  { value: 'bottom-right', label: 'In basso a destra' },
  { value: 'bar', label: 'Barra' },
];

const fields: FieldConfig[] = [
  { name: 'titolo', label: 'Titolo', required: true },
  { name: 'posizione', label: 'Posizione', type: 'select', options: POSIZIONI },
  { name: 'contenuto', label: 'Contenuto', type: 'textarea', wide: true },
  { name: 'cta_label', label: 'Testo pulsante (CTA)' },
  { name: 'cta_url', label: 'Link pulsante' },
  { name: 'attivo', label: 'Attivo', type: 'checkbox' },
];

const exportColumns: ExportColumn<Popup>[] = [
  { header: 'Titolo', accessor: (p) => p.titolo },
  { header: 'Posizione', accessor: (p) => p.posizione },
  { header: 'CTA', accessor: (p) => p.cta_label || '' },
  { header: 'Attivo', accessor: (p) => (p.attivo ? 'Sì' : 'No') },
];

export function PopupsPage() {
  const query = usePopups();
  const del = useDeleteMany<number>((id) => api.popups.delete(id), 'popups');
  const save = useSaveEntity(api.popups.create, api.popups.update, 'popups');
  const form = useEntityForm();
  const rows = query.data ?? [];

  const columns = useMemo<ColumnDef<Popup, unknown>[]>(
    () => [
      { accessorKey: 'titolo', header: 'Titolo', cell: ({ getValue }) => <span className="font-medium">{getValue() as string}</span> },
      { accessorKey: 'contenuto', header: 'Contenuto', cell: ({ getValue }) => <span className="line-clamp-1 max-w-[300px] text-muted-foreground">{(getValue() as string) || '—'}</span> },
      { accessorKey: 'posizione', header: 'Posizione', cell: ({ getValue }) => <Badge variant="neutral">{POSIZIONI.find((p) => p.value === getValue())?.label ?? (getValue() as string)}</Badge> },
      { accessorKey: 'attivo', header: 'Stato', cell: ({ getValue }) => (getValue() ? <Badge variant="success">Attivo</Badge> : <Badge variant="neutral">Off</Badge>) },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => form.openEdit(row.original as unknown as FormValues)}>
            <Pencil />
          </Button>
        ),
      },
    ],
    [form],
  );

  return (
    <div>
      <PageHeader
        title="Pop-up"
        subtitle="Messaggi promozionali mostrati nello store."
        actions={
          <Button size="sm" onClick={form.openCreate}>
            <Plus /> Nuovo pop-up
          </Button>
        }
      />
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(p) => String(p.id)}
        searchValue={(p) => `${p.titolo} ${p.contenuto ?? ''}`}
        searchPlaceholder="Cerca pop-up…"
        exportName="popup"
        exportTitle="Pop-up"
        exportColumns={exportColumns}
        isLoading={query.isLoading}
        emptyState={<EmptyState icon={MessageSquareDashed} title="Nessun pop-up" />}
        bulkActions={(selected, clear) => (
          <BulkDelete count={selected.length} noun="pop-up" onDelete={() => del.mutateAsync(selected.map((p) => p.id))} onDone={clear} />
        )}
      />
      <EntityFormDialog
        open={form.open}
        onOpenChange={form.setOpen}
        title={form.editing ? 'Modifica pop-up' : 'Nuovo pop-up'}
        fields={fields}
        initial={form.editing}
        onSubmit={async (values) => {
          await save.mutateAsync({ id: form.editing?.id as number | undefined, data: values });
          toast.success('Pop-up salvato');
        }}
      />
    </div>
  );
}
