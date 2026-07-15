import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Palette, Plus, Pencil, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/data-table/data-table';
import { EmptyState } from '@/components/common/empty-state';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import type { FieldConfig, FormValues } from '@/components/common/entity-form-dialog';
import { EntityFormPage } from '@/components/common/entity-form-page';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useColors, useSaveEntity, useDeleteMany } from '@/hooks/queries';
import { api } from '@/lib/api';
import type { ProductColor } from '@/types';
import type { ExportColumn } from '@/lib/export';
import { toast } from 'sonner';

const exportColumns: ExportColumn<ProductColor>[] = [
  { header: 'Nome', accessor: (r) => r.name },
  { header: 'Slug', accessor: (r) => r.slug },
  { header: 'Hex', accessor: (r) => r.hex ?? '' },
  { header: 'Prodotti', accessor: (r) => r.product_count ?? 0 },
  { header: 'Ordine', accessor: (r) => r.sort_order },
];

function colorFields(editing: boolean): FieldConfig[] {
  const base: FieldConfig[] = [
    { name: 'name', label: 'Nome', required: true, placeholder: 'es. Rosa cipria' },
    { name: 'hex', label: 'Colore', type: 'color', placeholder: '#E8B4B8' },
    { name: 'sort_order', label: 'Ordine', type: 'number', help: 'Posizione nella palette (crescente).' },
  ];
  if (editing) return base;
  return [
    base[0],
    { name: 'slug', label: 'Slug', placeholder: 'auto dal nome se vuoto', help: 'Chiave univoca referenziata dai prodotti (immutabile).' },
    ...base.slice(1),
  ];
}

export function ColorsPage() {
  const query = useColors();
  const rows = query.data ?? [];
  const deleteMut = useDeleteMany<number>((id) => api.colors.delete(id), 'colors');
  const navigate = useNavigate();

  const columns = useMemo<ColumnDef<ProductColor, unknown>[]>(
    () => [
      {
        id: 'colore',
        header: 'Colore',
        accessorFn: (r) => r.name,
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="flex min-w-0 items-center gap-3">
              <span
                className="h-7 w-7 shrink-0 rounded-full border shadow-inner"
                style={{ backgroundColor: r.hex || 'transparent' }}
                title={r.hex || 'nessun hex'}
              />
              <div className="min-w-0">
                <div className="truncate font-medium capitalize">{r.name}</div>
                <div className="truncate font-mono text-xs text-muted-foreground">{r.hex || r.slug}</div>
              </div>
            </div>
          );
        },
      },
      { accessorKey: 'slug', header: 'Slug', cell: ({ getValue }) => <span className="font-mono text-xs text-muted-foreground">{getValue() as string}</span> },
      { accessorKey: 'product_count', header: 'Prodotti', cell: ({ getValue }) => <Badge variant="default">{(getValue() as number) ?? 0}</Badge> },
      { accessorKey: 'sort_order', header: 'Ordine', cell: ({ getValue }) => <span className="text-muted-foreground">{getValue() as number}</span> },
      {
        id: 'azioni',
        header: '',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/colors/${row.original.id}/edit`); }}>
              <Pencil /> Modifica
            </Button>
            <ConfirmDialog
              title={`Eliminare "${row.original.name}"?`}
              description={row.original.product_count ? `Attenzione: ${row.original.product_count} prodotti usano questo colore (l’eliminazione verrà rifiutata finché è in uso).` : 'Il colore verrà rimosso dalla palette.'}
              confirmLabel="Elimina"
              destructive
              onConfirm={async () => {
                try {
                  await api.colors.delete(row.original.id);
                  query.refetch();
                  toast.success('Colore eliminato');
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : 'Eliminazione non riuscita');
                }
              }}
              trigger={
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" aria-label="Elimina">
                  <Trash2 />
                </Button>
              }
            />
          </div>
        ),
      },
    ],
    [query, navigate],
  );

  return (
    <div>
      <PageHeader
        title="Colori"
        subtitle="La palette dei colori referenziata dai prodotti."
        actions={
          <Button size="sm" onClick={() => navigate('/colors/new')}>
            <Plus /> Nuovo colore
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={rows}
        getRowId={(r) => String(r.id)}
        searchValue={(r) => `${r.name} ${r.slug} ${r.hex ?? ''}`}
        searchPlaceholder="Cerca colore…"
        exportName="colori"
        exportTitle="Palette colori"
        exportColumns={exportColumns}
        isLoading={query.isLoading}
        emptyState={<EmptyState icon={Palette} title="Nessun colore" description="Crea il primo colore con il pulsante in alto a destra." />}
        bulkActions={(selected, clear) => {
          const ids = selected.map((c) => c.id);
          return (
            <ConfirmDialog
              title={`Eliminare ${ids.length} colori?`}
              description="I colori in uso da prodotti verranno saltati."
              confirmLabel="Elimina"
              destructive
              onConfirm={async () => {
                await deleteMut.mutateAsync(ids);
                toast.success('Operazione completata');
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

/** Full-page create/edit form for a colour. */
export function ColorFormPage() {
  const { id } = useParams<{ id: string }>();
  const editing = id != null;
  const query = useColors();
  const saveMut = useSaveEntity(api.colors.create, api.colors.update, 'colors');
  const row = editing ? (query.data ?? []).find((c) => String(c.id) === id) : undefined;

  const initial = useMemo<FormValues>(() => {
    if (!editing) return { hex: '#cccccc', sort_order: 0 };
    return row ? { name: row.name, hex: row.hex ?? '', sort_order: row.sort_order ?? 0 } : {};
  }, [editing, row]);

  return (
    <EntityFormPage
      title={editing ? `Modifica colore${row ? `: ${row.name}` : ''}` : 'Nuovo colore'}
      backPath="/colors"
      backLabel="Colori"
      fields={colorFields(editing)}
      initial={initial}
      loading={editing && !row && query.isLoading}
      submitLabel={editing ? 'Salva modifiche' : 'Crea colore'}
      onSubmit={async (v) => {
        const data: Record<string, unknown> = { name: v.name, hex: v.hex || null, sort_order: v.sort_order || 0 };
        if (!editing && v.slug) data.slug = v.slug;
        await saveMut.mutateAsync({ id: editing ? Number(id) : undefined, data });
        toast.success(editing ? 'Colore salvato' : 'Colore creato');
      }}
    />
  );
}
