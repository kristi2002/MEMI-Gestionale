import { useMemo, useRef, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Layers, FolderTree, Plus, Pencil, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/data-table/data-table';
import { StatusBadge } from '@/components/common/status-badge';
import { EmptyState } from '@/components/common/empty-state';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { EntityFormDialog, type FieldConfig, type FormValues } from '@/components/common/entity-form-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCategories, useCollections, useSaveEntity, useDeleteMany } from '@/hooks/queries';
import { api } from '@/lib/api';
import type { Taxonomy } from '@/types';
import type { ExportColumn } from '@/lib/export';
import { toast } from 'sonner';

interface TaxonomyApi {
  create: (data: unknown) => Promise<unknown>;
  update: (id: number, data: unknown) => Promise<unknown>;
  delete: (id: number) => Promise<unknown>;
  uploadHero: (file: File) => Promise<{ url: string }>;
}

const exportColumns: ExportColumn<Taxonomy>[] = [
  { header: 'Nome', accessor: (r) => r.name },
  { header: 'Slug', accessor: (r) => r.slug },
  { header: 'Prodotti', accessor: (r) => r.product_count ?? 0 },
  { header: 'Stato', accessor: (r) => r.stato },
  { header: 'Ordine', accessor: (r) => r.sort_order },
];

function TaxonomyManager({
  title,
  subtitle,
  icon,
  singular,
  entityApi,
  query,
  invalidateKey,
  exportName,
}: {
  title: string;
  subtitle: string;
  icon: typeof Layers;
  singular: string; // e.g. "categoria" / "collezione"
  entityApi: TaxonomyApi;
  query: ReturnType<typeof useCategories>;
  invalidateKey: string;
  exportName: string;
}) {
  const rows = query.data ?? [];
  const saveMut = useSaveEntity(entityApi.create, entityApi.update, invalidateKey);
  const deleteMut = useDeleteMany<number>((id) => entityApi.delete(id), invalidateKey);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Taxonomy | null>(null);
  const [initial, setInitial] = useState<FormValues>({});

  const fields = useMemo<FieldConfig[]>(() => {
    const base: FieldConfig[] = [
      { name: 'name', label: 'Nome', required: true, placeholder: `es. ${singular === 'categoria' ? 'Scarpe' : 'Estate 2025'}` },
      { name: 'stato', label: 'Stato', type: 'select', options: [
          { value: 'attiva', label: 'Attiva' }, { value: 'bozza', label: 'Bozza' },
        ] },
      { name: 'sort_order', label: 'Ordine', type: 'number', help: 'Posizione in elenco (crescente).' },
      { name: 'description', label: 'Descrizione', type: 'textarea' },
      { name: 'hero_image', label: 'Immagine hero', type: 'image', upload: async (file) => (await entityApi.uploadHero(file)).url },
    ];
    // Slug is editable only on create — after that it's the key products reference.
    if (editing) return base;
    return [
      base[0],
      { name: 'slug', label: 'Slug (URL)', placeholder: 'auto dal nome se vuoto', help: 'Identificativo univoco. Immutabile dopo la creazione.' },
      ...base.slice(1),
    ];
  }, [editing, singular, entityApi]);

  function openCreate() {
    setEditing(null);
    setInitial({ stato: 'attiva', sort_order: 0 });
    setFormOpen(true);
  }
  function openEdit(r: Taxonomy) {
    setEditing(r);
    setInitial({
      name: r.name,
      stato: r.stato,
      sort_order: r.sort_order ?? 0,
      description: r.description ?? '',
      hero_image: r.hero_image ?? '',
    });
    setFormOpen(true);
  }
  const openEditRef = useRef(openEdit);
  openEditRef.current = openEdit;

  async function onSubmit(v: FormValues) {
    const data: Record<string, unknown> = {
      name: v.name,
      stato: v.stato || 'attiva',
      sort_order: v.sort_order || 0,
      description: v.description || null,
      hero_image: v.hero_image || null,
    };
    if (!editing && v.slug) data.slug = v.slug;
    await saveMut.mutateAsync({ id: editing ? editing.id : undefined, data });
    toast.success(editing ? 'Salvato' : 'Creato');
  }

  const columns = useMemo<ColumnDef<Taxonomy, unknown>[]>(
    () => [
      {
        id: 'nome',
        header: 'Nome',
        accessorFn: (r) => r.name,
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                {r.hero_image ? <img src={r.hero_image} alt="" className="h-full w-full object-cover" /> : null}
              </div>
              <div className="min-w-0">
                <div className="truncate font-medium capitalize">{r.name}</div>
                <div className="truncate text-xs text-muted-foreground">{r.slug}</div>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: 'product_count',
        header: 'Prodotti',
        cell: ({ getValue }) => <Badge variant="default">{(getValue() as number) ?? 0}</Badge>,
      },
      { accessorKey: 'sort_order', header: 'Ordine', cell: ({ getValue }) => <span className="text-muted-foreground">{getValue() as number}</span> },
      { accessorKey: 'stato', header: 'Stato', cell: ({ getValue }) => <StatusBadge code={getValue() as string} /> },
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
              description={`Il record ${singular} verrà rimosso. I prodotti mantengono comunque il loro slug.`}
              confirmLabel="Elimina"
              destructive
              onConfirm={async () => {
                await deleteMut.mutateAsync([row.original.id]);
                toast.success('Eliminato');
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
    [deleteMut, singular],
  );

  const Icon = icon;
  return (
    <div>
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus /> Nuova {singular}
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={rows}
        getRowId={(r) => String(r.id)}
        searchValue={(r) => `${r.name} ${r.slug}`}
        searchPlaceholder={`Cerca ${singular}…`}
        exportName={exportName}
        exportTitle={title}
        exportColumns={exportColumns}
        isLoading={query.isLoading}
        emptyState={<EmptyState icon={Icon} title={`Nessuna ${singular}`} description="Creane una con il pulsante in alto a destra." />}
      />

      <EntityFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title={editing ? `Modifica: ${editing.name}` : `Nuova ${singular}`}
        fields={fields}
        initial={initial}
        submitLabel={editing ? 'Salva modifiche' : 'Crea'}
        onSubmit={onSubmit}
      />
    </div>
  );
}

export function CategoriesPage() {
  const query = useCategories();
  return (
    <TaxonomyManager
      title="Categorie"
      subtitle="La struttura del catalogo: ogni prodotto appartiene a una categoria."
      icon={FolderTree}
      singular="categoria"
      entityApi={api.categories}
      query={query}
      invalidateKey="categories"
      exportName="categorie"
    />
  );
}

export function CollectionsPage() {
  const query = useCollections();
  return (
    <TaxonomyManager
      title="Collezioni"
      subtitle="Raggruppamenti editoriali e stagionali che attraversano le categorie."
      icon={Layers}
      singular="collezione"
      entityApi={api.collections}
      query={query}
      invalidateKey="collections"
      exportName="collezioni"
    />
  );
}
