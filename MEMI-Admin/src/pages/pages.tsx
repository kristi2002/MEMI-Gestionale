import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { FileText, Plus, Pencil } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/data-table/data-table';
import { BulkDelete } from '@/components/data-table/bulk-delete';
import { StatusBadge } from '@/components/common/status-badge';
import { EmptyState } from '@/components/common/empty-state';
import { EntityFormDialog, useEntityForm, type FieldConfig, type FormValues } from '@/components/common/entity-form-dialog';
import { Button } from '@/components/ui/button';
import { usePages, useDeleteMany, useSaveEntity } from '@/hooks/queries';
import { api } from '@/lib/api';
import { date } from '@/lib/format';
import type { CmsPage } from '@/types';
import type { ExportColumn } from '@/lib/export';
import { toast } from 'sonner';

const fields: FieldConfig[] = [
  { name: 'titolo', label: 'Titolo', required: true },
  { name: 'slug', label: 'Slug (URL)', required: true, placeholder: 'chi-siamo' },
  { name: 'stato', label: 'Stato', type: 'select', options: [{ value: 'bozza', label: 'Bozza' }, { value: 'pubblicata', label: 'Pubblicata' }] },
  { name: 'contenuto', label: 'Contenuto', type: 'textarea', wide: true },
];

const exportColumns: ExportColumn<CmsPage>[] = [
  { header: 'Titolo', accessor: (p) => p.titolo },
  { header: 'Slug', accessor: (p) => p.slug },
  { header: 'Stato', accessor: (p) => p.stato },
  { header: 'Aggiornata', accessor: (p) => date(p.updated_at) },
];

export function PagesPage() {
  const query = usePages();
  const del = useDeleteMany<number>((id) => api.pages.delete(id), 'pages');
  const save = useSaveEntity(api.pages.create, api.pages.update, 'pages');
  const form = useEntityForm();
  const rows = query.data ?? [];

  const columns = useMemo<ColumnDef<CmsPage, unknown>[]>(
    () => [
      { accessorKey: 'titolo', header: 'Titolo', cell: ({ getValue }) => <span className="font-medium">{getValue() as string}</span> },
      { accessorKey: 'slug', header: 'Slug', cell: ({ getValue }) => <code className="rounded bg-muted px-1.5 py-0.5 text-xs">/{getValue() as string}</code> },
      { accessorKey: 'updated_at', header: 'Aggiornata', cell: ({ getValue }) => <span className="text-muted-foreground">{date(getValue() as string)}</span> },
      { accessorKey: 'stato', header: 'Stato', cell: ({ getValue }) => <StatusBadge code={getValue() as string} /> },
      { id: 'actions', header: '', cell: ({ row }) => <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => form.openEdit(row.original as unknown as FormValues)}><Pencil /></Button> },
    ],
    [form],
  );

  return (
    <div>
      <PageHeader title="Pagine" subtitle="Pagine di contenuto del sito." actions={<Button size="sm" onClick={form.openCreate}><Plus /> Nuova pagina</Button>} />
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(p) => String(p.id)}
        searchValue={(p) => `${p.titolo} ${p.slug}`}
        searchPlaceholder="Cerca pagina…"
        exportName="pagine"
        exportTitle="Pagine"
        exportColumns={exportColumns}
        isLoading={query.isLoading}
        emptyState={<EmptyState icon={FileText} title="Nessuna pagina" />}
        bulkActions={(selected, clear) => (
          <BulkDelete count={selected.length} noun="pagine" onDelete={() => del.mutateAsync(selected.map((p) => p.id))} onDone={clear} />
        )}
      />
      <EntityFormDialog
        open={form.open}
        onOpenChange={form.setOpen}
        title={form.editing ? 'Modifica pagina' : 'Nuova pagina'}
        fields={fields}
        initial={form.editing}
        size="xl"
        onSubmit={async (values) => {
          await save.mutateAsync({ id: form.editing?.id as number | undefined, data: values });
          toast.success('Pagina salvata');
        }}
      />
    </div>
  );
}
