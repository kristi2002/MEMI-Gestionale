import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Trash2, Tag, FileDown, Rss, Plus, Pencil } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/data-table/data-table';
import type { FilterDef } from '@/components/data-table/filters';
import { StatusBadge } from '@/components/common/status-badge';
import { EmptyState } from '@/components/common/empty-state';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useProducts, flattenProducts, useDeleteProducts, useCategories } from '@/hooks/queries';
import { api } from '@/lib/api';
import { eur } from '@/lib/format';
import type { ProductImage, ProductRow } from '@/types';
import type { ExportColumn } from '@/lib/export';
import { toast } from 'sonner';

function thumbUrl(p: ProductRow): string | null {
  const first = p.images?.[0];
  if (!first) return null;
  if (typeof first === 'string') return first;
  const img = first as ProductImage;
  return img.thumb || img.card || img.full || null;
}

const exportColumns: ExportColumn<ProductRow>[] = [
  { header: 'ID', accessor: (p) => p.id },
  { header: 'Nome', accessor: (p) => p.name },
  { header: 'Categoria', accessor: (p) => p.categoria },
  { header: 'Colore', accessor: (p) => p.color_label || p.colore || '' },
  { header: 'Prezzo', accessor: (p) => eur(p.price) },
  { header: 'Stock', accessor: (p) => p.stock_total },
  { header: 'Taglie', accessor: (p) => (p.taglie || []).join(' | ') },
  { header: 'Stato', accessor: (p) => p.status },
];

export function ProductsPage() {
  const query = useProducts();
  const deleteMut = useDeleteProducts();
  const navigate = useNavigate();

  const all = useMemo(() => flattenProducts(query.data?.pages), [query.data]);
  const categoriesQuery = useCategories();
  // Prefer the managed Categorie list (complete regardless of pagination); fall
  // back to / merge with categories derived from whatever products are loaded so
  // a legacy product with an unmanaged slug is still filterable.
  const categories = useMemo(() => {
    const managed = (categoriesQuery.data ?? []).map((c) => c.slug);
    const derived = all.map((p) => p.categoria).filter(Boolean);
    return [...new Set([...managed, ...derived])].sort();
  }, [categoriesQuery.data, all]);

  const filters = useMemo<FilterDef<ProductRow>[]>(
    () => [
      { key: 'categoria', type: 'select', label: 'Categoria', accessor: (p) => p.categoria, options: categories.map((c) => ({ value: c, label: c })) },
      { key: 'status', type: 'select', label: 'Stato', accessor: (p) => p.status, options: [
          { value: 'attivo', label: 'Attivo' }, { value: 'bozza', label: 'Bozza' }, { value: 'esaurito', label: 'Esaurito' },
        ] },
      { key: 'price', type: 'numberRange', label: 'Prezzo', unit: '€', accessor: (p) => Number(p.price) },
      { key: 'stock', type: 'numberRange', label: 'Stock', accessor: (p) => p.stock_total },
    ],
    [categories],
  );

  const columns = useMemo<ColumnDef<ProductRow, unknown>[]>(
    () => [
      {
        id: 'prodotto',
        header: 'Prodotto',
        accessorFn: (p) => p.name,
        cell: ({ row }) => {
          const p = row.original;
          const t = thumbUrl(p);
          return (
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-lg">
                {t ? <img src={t} alt="" className="h-full w-full object-cover" /> : (p.icon || '👗')}
              </div>
              <div className="min-w-0">
                <div className="truncate font-medium">{p.name}</div>
                <div className="truncate text-xs text-muted-foreground">{p.id}</div>
              </div>
            </div>
          );
        },
      },
      { accessorKey: 'categoria', header: 'Categoria', cell: ({ getValue }) => <span className="capitalize text-muted-foreground">{getValue() as string}</span> },
      {
        accessorKey: 'price',
        header: 'Prezzo',
        cell: ({ row }) => (
          <div>
            <span className="font-semibold">{eur(row.original.price)}</span>
            {row.original.discount_pct > 0 && (
              <Badge variant="danger" className="ml-2">
                -{row.original.discount_pct}%
              </Badge>
            )}
          </div>
        ),
        sortingFn: (a, b) => Number(a.original.price) - Number(b.original.price),
      },
      {
        accessorKey: 'stock_total',
        header: 'Stock',
        cell: ({ getValue }) => {
          const s = Number(getValue());
          return <span className={s === 0 ? 'font-semibold text-destructive' : s < 5 ? 'font-semibold text-warning' : ''}>{s}</span>;
        },
      },
      { accessorKey: 'status', header: 'Stato', cell: ({ getValue }) => <StatusBadge code={getValue() as string} /> },
      {
        id: 'azioni',
        header: '',
        enableSorting: false,
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => { e.stopPropagation(); navigate(`/products/${encodeURIComponent(row.original.id)}/edit`); }}
            aria-label={`Modifica ${row.original.name}`}
          >
            <Pencil /> Modifica
          </Button>
        ),
      },
    ],
    [navigate],
  );

  async function onImport(file: File) {
    try {
      await api.products.importCsv(file);
      toast.success('Import CSV completato');
      query.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Import non riuscito');
    }
  }

  return (
    <div>
      <PageHeader
        title="Prodotti"
        subtitle="Gestisci catalogo, varianti, prezzi e magazzino."
      />

      <DataTable
        columns={columns}
        data={all}
        getRowId={(p) => p.id}
        searchValue={(p) => `${p.name} ${p.id} ${p.categoria}`}
        searchPlaceholder="Cerca prodotto…"
        exportName="prodotti"
        exportTitle="Catalogo prodotti"
        exportColumns={exportColumns}
        primaryAction={
          <>
            <Button size="sm" onClick={() => navigate('/products/new')}>
              <Plus /> Nuovo prodotto
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={api.products.importTemplateUrl()} target="_blank" rel="noreferrer">
                <FileDown /> Template CSV
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={api.products.feedUrl()} target="_blank" rel="noreferrer">
                <Rss /> Feed Meta/Google
              </a>
            </Button>
            <Button variant="secondary" size="sm" asChild>
              <label className="cursor-pointer">
                Importa CSV
                <input
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])}
                />
              </label>
            </Button>
          </>
        }
        filters={filters}
        tableId="products"
        isLoading={query.isLoading}
        hasMore={query.hasNextPage}
        onLoadMore={() => query.fetchNextPage()}
        loadingMore={query.isFetchingNextPage}
        emptyState={<EmptyState icon={Tag} title="Nessun prodotto" description="Il catalogo è vuoto o nessun prodotto corrisponde ai filtri." />}
        bulkActions={(selected, clear) => {
          const ids = selected.map((p) => p.id);
          return (
            <ConfirmDialog
              title={`Eliminare ${ids.length} prodotti?`}
              description="Operazione irreversibile. I prodotti verranno rimossi dal catalogo."
              confirmLabel="Elimina"
              destructive
              onConfirm={async () => {
                await deleteMut.mutateAsync(ids);
                toast.success(`${ids.length} prodotti eliminati`);
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
