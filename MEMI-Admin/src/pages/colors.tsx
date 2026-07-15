import { useMemo, useRef, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Palette, Plus, Pencil, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/data-table/data-table';
import { EmptyState } from '@/components/common/empty-state';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { EntityFormDialog, type FieldConfig, type FormValues } from '@/components/common/entity-form-dialog';
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

export function ColorsPage() {
  const query = useColors();
  const rows = query.data ?? [];
  const saveMut = useSaveEntity(api.colors.create, api.colors.update, 'colors');
  const deleteMut = useDeleteMany<number>((id) => api.colors.delete(id), 'colors');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProductColor | null>(null);
  const [initial, setInitial] = useState<FormValues>({});

  const fields = useMemo<FieldConfig[]>(() => {
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
  }, [editing]);

  function openCreate() {
    setEditing(null);
    setInitial({ hex: '#cccccc', sort_order: 0 });
    setFormOpen(true);
  }
  function openEdit(r: ProductColor) {
    setEditing(r);
    setInitial({ name: r.name, hex: r.hex ?? '', sort_order: r.sort_order ?? 0 });
    setFormOpen(true);
  }
  const openEditRef = useRef(openEdit);
  openEditRef.current = openEdit;

  async function onSubmit(v: FormValues) {
    const data: Record<string, unknown> = {
      name: v.name,
      hex: v.hex || null,
      sort_order: v.sort_order || 0,
    };
    if (!editing && v.slug) data.slug = v.slug;
    await saveMut.mutateAsync({ id: editing ? editing.id : undefined, data });
    toast.success(editing ? 'Colore salvato' : 'Colore creato');
  }

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
            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openEditRef.current(row.original); }}>
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
    [query],
  );

  return (
    <div>
      <PageHeader
        title="Colori"
        subtitle="La palette dei colori referenziata dai prodotti."
        actions={
          <Button size="sm" onClick={openCreate}>
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

      <EntityFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title={editing ? `Modifica colore: ${editing.name}` : 'Nuovo colore'}
        fields={fields}
        initial={initial}
        submitLabel={editing ? 'Salva modifiche' : 'Crea colore'}
        onSubmit={onSubmit}
      />
    </div>
  );
}
