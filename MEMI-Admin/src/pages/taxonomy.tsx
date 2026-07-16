import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { useQueryClient } from '@tanstack/react-query';
import { Layers, FolderTree, Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/data-table/data-table';
import { StatusBadge } from '@/components/common/status-badge';
import { EmptyState } from '@/components/common/empty-state';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import type { FieldConfig, FormValues } from '@/components/common/entity-form-fields';
import { EntityFormPage } from '@/components/common/entity-form-page';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useCategories, useCollections, useAllProducts, useSaveEntity, useDeleteMany } from '@/hooks/queries';
import { api } from '@/lib/api';
import type { ProductRow, Taxonomy } from '@/types';
import type { ExportColumn } from '@/lib/export';
import { toast } from 'sonner';

interface TaxonomyApi {
  create: (data: unknown) => Promise<unknown>;
  update: (id: number, data: unknown) => Promise<unknown>;
  delete: (id: number) => Promise<unknown>;
  uploadHero: (file: File) => Promise<{ url: string }>;
}

function taxonomyFields(singular: string, editing: boolean, entityApi: TaxonomyApi): FieldConfig[] {
  const base: FieldConfig[] = [
    { name: 'name', label: 'Nome', required: true, placeholder: `es. ${singular === 'categoria' ? 'Scarpe' : 'Estate 2025'}` },
    { name: 'description', label: 'Descrizione', type: 'textarea' },
    { name: 'hero_image', label: 'Immagine hero', type: 'image', upload: async (file) => (await entityApi.uploadHero(file)).url },
    { name: 'stato', label: 'Stato', type: 'select', side: true, options: [
        { value: 'attiva', label: 'Attiva' }, { value: 'bozza', label: 'Bozza' },
      ] },
    { name: 'sort_order', label: 'Ordine', type: 'number', side: true, help: 'Posizione in elenco (crescente).' },
  ];
  if (editing) return base;
  return [
    base[0],
    { name: 'slug', label: 'Slug (URL)', placeholder: 'auto dal nome se vuoto', help: 'Identificativo univoco. Immutabile dopo la creazione.' },
    ...base.slice(1),
  ];
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
  basePath,
  entityApi,
  query,
  invalidateKey,
  exportName,
  rowFilter,
}: {
  title: string;
  subtitle: string;
  icon: typeof Layers;
  singular: string; // e.g. "categoria" / "collezione"
  basePath: string; // e.g. "/categories"
  entityApi: TaxonomyApi;
  query: ReturnType<typeof useCategories>;
  invalidateKey: string;
  exportName: string;
  /** Optional row filter (e.g. hide category-slug rows from the Collezioni list). */
  rowFilter?: (r: Taxonomy) => boolean;
}) {
  const all = query.data ?? [];
  const rows = rowFilter ? all.filter(rowFilter) : all;
  const deleteMut = useDeleteMany<number>((id) => entityApi.delete(id), invalidateKey);
  const navigate = useNavigate();

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
            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); navigate(`${basePath}/${row.original.id}/edit`); }}>
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
    [deleteMut, singular, navigate, basePath],
  );

  const Icon = icon;
  return (
    <div>
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <Button size="sm" onClick={() => navigate(`${basePath}/new`)}>
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
    </div>
  );
}

/** Generic full-page create/edit form for a taxonomy entity (category/collection). */
function TaxonomyFormPage({
  singular,
  backPath,
  backLabel,
  entityApi,
  query,
  invalidateKey,
}: {
  singular: string;
  backPath: string;
  backLabel: string;
  entityApi: TaxonomyApi;
  query: ReturnType<typeof useCategories>;
  invalidateKey: string;
}) {
  const { id } = useParams<{ id: string }>();
  const editing = id != null;
  const saveMut = useSaveEntity(entityApi.create, entityApi.update, invalidateKey);
  const row = editing ? (query.data ?? []).find((r) => String(r.id) === id) : undefined;

  const initial = useMemo<FormValues>(() => {
    if (!editing) return { stato: 'attiva', sort_order: 0 };
    return row
      ? { name: row.name, stato: row.stato, sort_order: row.sort_order ?? 0, description: row.description ?? '', hero_image: row.hero_image ?? '' }
      : {};
  }, [editing, row]);

  return (
    <EntityFormPage
      title={editing ? `Modifica${row ? `: ${row.name}` : ''}` : `Nuova ${singular}`}
      backPath={backPath}
      backLabel={backLabel}
      sideTitle="Pubblicazione"
      fields={taxonomyFields(singular, editing, entityApi)}
      initial={initial}
      loading={editing && !row && query.isLoading}
      submitLabel={editing ? 'Salva modifiche' : 'Crea'}
      onSubmit={async (v) => {
        const data: Record<string, unknown> = {
          name: v.name, stato: v.stato || 'attiva', sort_order: v.sort_order || 0,
          description: v.description || null, hero_image: v.hero_image || null,
        };
        if (!editing && v.slug) data.slug = v.slug;
        await saveMut.mutateAsync({ id: editing ? Number(id) : undefined, data });
        toast.success(editing ? 'Salvato' : 'Creato');
      }}
    />
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
      basePath="/categories"
      entityApi={api.categories}
      query={query}
      invalidateKey="categories"
      exportName="categorie"
    />
  );
}
export function CategoryFormPage() {
  return <TaxonomyFormPage singular="categoria" backPath="/categories" backLabel="Categorie" entityApi={api.categories} query={useCategories()} invalidateKey="categories" />;
}

/** Legacy technical tags that must never appear in the Collezioni list. */
const HIDDEN_COLLECTION_SLUGS = new Set(['shop-all', 'accessori']);

export function CollectionsPage() {
  const query = useCollections();
  const categoriesQuery = useCategories();
  // Collections are editorial groupings: rows that are really categories (same
  // slug as a managed category) and the technical shop-all tag are hidden from
  // this list. Nothing is deleted — the rows stay in the DB and any legacy
  // storefront page they power keeps working.
  const categorySlugs = useMemo(
    () => new Set((categoriesQuery.data ?? []).map((c) => c.slug)),
    [categoriesQuery.data],
  );
  return (
    <TaxonomyManager
      title="Collezioni"
      subtitle="Raggruppamenti editoriali e stagionali che attraversano le categorie."
      icon={Layers}
      singular="collezione"
      basePath="/collections"
      entityApi={api.collections}
      query={query}
      invalidateKey="collections"
      exportName="collezioni"
      rowFilter={(r) => !categorySlugs.has(r.slug) && !HIDDEN_COLLECTION_SLUGS.has(r.slug)}
    />
  );
}
/** Products belonging to one collection: full list (name + category) with add/remove.
 *  Membership lives on the product (products.collections), so each change is a
 *  partial product update; list + counters refresh via query invalidation. */
function CollectionProductsCard({ slug }: { slug: string }) {
  const qc = useQueryClient();
  const productsQuery = useAllProducts();
  const all = productsQuery.data?.items ?? [];
  const isIn = (p: ProductRow) => Array.isArray(p.collections) && p.collections.includes(slug);
  const inCollection = all.filter(isIn);
  const available = all.filter((p) => !isIn(p));
  const [selected, setSelected] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  async function saveCollections(p: ProductRow, next: string[]) {
    setBusyId(p.id);
    try {
      await api.products.update(p.id, { collections: next });
      await qc.invalidateQueries({ queryKey: ['products'] });
      await qc.invalidateQueries({ queryKey: ['collections'] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Operazione non riuscita');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card className="mt-6">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Prodotti nella collezione ({inCollection.length})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-80 max-w-full">
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger>
                <SelectValue placeholder={available.length ? 'Aggiungi un prodotto…' : 'Tutti i prodotti sono già inclusi'} />
              </SelectTrigger>
              <SelectContent>
                {available.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} — {p.categoria}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            size="sm"
            disabled={!selected || busyId != null}
            onClick={async () => {
              const p = available.find((x) => x.id === selected);
              if (!p) return;
              await saveCollections(p, [...(Array.isArray(p.collections) ? p.collections : []), slug]);
              setSelected('');
              toast.success('Prodotto aggiunto alla collezione');
            }}
          >
            <Plus /> Aggiungi
          </Button>
        </div>

        {productsQuery.isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Caricamento…</div>
        ) : inCollection.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Nessun prodotto in questa collezione.</div>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left">
                  <th className="px-3 py-2 font-medium">Prodotto</th>
                  <th className="px-3 py-2 font-medium">Categoria</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {inCollection.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="px-3 py-2">
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground">{p.id}</div>
                    </td>
                    <td className="px-3 py-2 capitalize">{p.categoria}</td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        disabled={busyId != null}
                        onClick={async () => {
                          await saveCollections(p, (Array.isArray(p.collections) ? p.collections : []).filter((s) => s !== slug));
                          toast.success('Prodotto rimosso dalla collezione');
                        }}
                      >
                        {busyId === p.id ? <Loader2 className="animate-spin" /> : <Trash2 />} Rimuovi
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function CollectionFormPage() {
  const query = useCollections();
  const { id } = useParams<{ id: string }>();
  const row = (query.data ?? []).find((r) => String(r.id) === id);
  return (
    <>
      <TaxonomyFormPage singular="collezione" backPath="/collections" backLabel="Collezioni" entityApi={api.collections} query={query} invalidateKey="collections" />
      {row && <CollectionProductsCard slug={row.slug} />}
    </>
  );
}
