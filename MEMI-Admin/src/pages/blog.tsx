import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Newspaper, Plus, Pencil } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/data-table/data-table';
import { BulkDelete } from '@/components/data-table/bulk-delete';
import { StatusBadge } from '@/components/common/status-badge';
import { EmptyState } from '@/components/common/empty-state';
import { EntityFormDialog, useEntityForm, type FieldConfig, type FormValues } from '@/components/common/entity-form-dialog';
import { Button } from '@/components/ui/button';
import { useBlog, useDeleteMany, useSaveEntity } from '@/hooks/queries';
import { api } from '@/lib/api';
import { date } from '@/lib/format';
import type { BlogPost } from '@/types';
import type { ExportColumn } from '@/lib/export';
import { toast } from 'sonner';

const fields: FieldConfig[] = [
  { name: 'titolo', label: 'Titolo', required: true },
  { name: 'slug', label: 'Slug (URL)', required: true },
  { name: 'stato', label: 'Stato', type: 'select', options: [{ value: 'bozza', label: 'Bozza' }, { value: 'pubblicato', label: 'Pubblicato' }] },
  { name: 'estratto', label: 'Estratto', type: 'textarea', wide: true },
  { name: 'contenuto', label: 'Contenuto', type: 'textarea', wide: true },
];

const exportColumns: ExportColumn<BlogPost>[] = [
  { header: 'Titolo', accessor: (p) => p.titolo },
  { header: 'Slug', accessor: (p) => p.slug },
  { header: 'Stato', accessor: (p) => p.stato },
  { header: 'Pubblicato', accessor: (p) => (p.published_at ? date(p.published_at) : '') },
];

export function BlogPage() {
  const query = useBlog();
  const del = useDeleteMany<number>((id) => api.blog.delete(id), 'blog');
  const save = useSaveEntity(api.blog.create, api.blog.update, 'blog');
  const form = useEntityForm();
  const rows = query.data ?? [];

  const columns = useMemo<ColumnDef<BlogPost, unknown>[]>(
    () => [
      { accessorKey: 'titolo', header: 'Articolo', cell: ({ getValue }) => <span className="font-medium">{getValue() as string}</span> },
      { accessorKey: 'estratto', header: 'Estratto', cell: ({ getValue }) => <span className="line-clamp-1 max-w-[300px] text-muted-foreground">{(getValue() as string) || '—'}</span> },
      { accessorKey: 'published_at', header: 'Pubblicato', cell: ({ getValue }) => <span className="text-muted-foreground">{getValue() ? date(getValue() as string) : '—'}</span> },
      { accessorKey: 'stato', header: 'Stato', cell: ({ getValue }) => <StatusBadge code={getValue() as string} /> },
      { id: 'actions', header: '', cell: ({ row }) => <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => form.openEdit(row.original as unknown as FormValues)}><Pencil /></Button> },
    ],
    [form],
  );

  return (
    <div>
      <PageHeader title="Blog" subtitle="Articoli del magazine." actions={<Button size="sm" onClick={form.openCreate}><Plus /> Nuovo articolo</Button>} />
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(p) => String(p.id)}
        searchValue={(p) => `${p.titolo} ${p.slug} ${p.estratto ?? ''}`}
        searchPlaceholder="Cerca articolo…"
        exportName="blog"
        exportTitle="Blog"
        exportColumns={exportColumns}
        isLoading={query.isLoading}
        emptyState={<EmptyState icon={Newspaper} title="Nessun articolo" />}
        bulkActions={(selected, clear) => (
          <BulkDelete count={selected.length} noun="articoli" onDelete={() => del.mutateAsync(selected.map((p) => p.id))} onDone={clear} />
        )}
      />
      <EntityFormDialog
        open={form.open}
        onOpenChange={form.setOpen}
        title={form.editing ? 'Modifica articolo' : 'Nuovo articolo'}
        fields={fields}
        initial={form.editing}
        size="xl"
        onSubmit={async (values) => {
          await save.mutateAsync({ id: form.editing?.id as number | undefined, data: values });
          toast.success('Articolo salvato');
        }}
      />
    </div>
  );
}
