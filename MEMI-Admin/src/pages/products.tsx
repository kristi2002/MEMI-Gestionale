import { useMemo, useRef, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, Tag, FileDown, Rss, Plus, Pencil } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/data-table/data-table';
import { StatusBadge } from '@/components/common/status-badge';
import { EmptyState } from '@/components/common/empty-state';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { EntityFormDialog, type FieldConfig, type FormValues } from '@/components/common/entity-form-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useProducts, flattenProducts, useDeleteProducts } from '@/hooks/queries';
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

/** "S:10, M:5, Unica:20" → [{taglia:'S',stock:10}, …]. Bare labels default to stock 0. */
function parseSizes(s: string): { taglia: string; stock: number }[] {
  return String(s || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .map((seg) => {
      const [t, st] = seg.split(':').map((y) => y.trim());
      return { taglia: t, stock: st != null && st !== '' ? Number(st) || 0 : 0 };
    })
    .filter((x) => x.taglia);
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
  const qc = useQueryClient();
  const [cat, setCat] = useState('all');
  const [status, setStatus] = useState('all');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [initial, setInitial] = useState<FormValues>({});

  const all = useMemo(() => flattenProducts(query.data?.pages), [query.data]);
  const categories = useMemo(
    () => [...new Set(all.map((p) => p.categoria).filter(Boolean))].sort(),
    [all],
  );
  const rows = useMemo(
    () =>
      all.filter(
        (p) => (cat === 'all' || p.categoria === cat) && (status === 'all' || p.status === status),
      ),
    [all, cat, status],
  );

  const saveMut = useMutation({
    mutationFn: ({ id, data }: { id?: string; data: unknown }) =>
      id != null ? api.products.update(id, data) : api.products.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Salvataggio non riuscito'),
  });

  function openCreate() {
    setEditing(null);
    setInitial({ status: 'attivo', discount_pct: 0 });
    setFormOpen(true);
  }

  async function openEdit(p: ProductRow) {
    setEditing(p);
    let sizes = (p.taglie || []).join(', ');
    try {
      const detail = (await api.products.get(p.id)) as unknown as {
        taglie?: (string | { taglia: string; stock?: number })[];
        colore?: string | null;
        original_price?: number | string | null;
        description?: string | null;
      };
      if (Array.isArray(detail.taglie)) {
        sizes = detail.taglie
          .map((s) => (typeof s === 'string' ? s : `${s.taglia}:${s.stock ?? 0}`))
          .join(', ');
      }
      setInitial({
        name: p.name,
        categoria: p.categoria,
        colore: detail.colore ?? p.colore ?? '',
        color_label: p.color_label ?? '',
        price: Number(p.price),
        original_price: detail.original_price == null ? '' : Number(detail.original_price),
        discount_pct: p.discount_pct || 0,
        status: p.status,
        description: detail.description ?? '',
        sizes,
      });
    } catch {
      setInitial({
        name: p.name, categoria: p.categoria, colore: p.colore ?? '', color_label: p.color_label ?? '',
        price: Number(p.price), discount_pct: p.discount_pct || 0, status: p.status, sizes,
      });
    }
    setFormOpen(true);
  }

  // Stable handle so the memoized column cell always calls the latest openEdit.
  const openEditRef = useRef(openEdit);
  openEditRef.current = openEdit;

  async function onSubmit(v: FormValues) {
    const data: Record<string, unknown> = {
      name: v.name,
      categoria: v.categoria,
      colore: v.colore || null,
      color_label: v.color_label || null,
      price: v.price,
      original_price: v.original_price === '' || v.original_price == null ? null : v.original_price,
      discount_pct: v.discount_pct || 0,
      status: v.status || 'attivo',
      description: v.description || null,
    };
    const sizes = parseSizes(v.sizes as string);
    if (sizes.length) data.taglie = sizes;

    if (editing) {
      await saveMut.mutateAsync({ id: editing.id, data });
      toast.success('Prodotto aggiornato');
    } else {
      data.id = v.id;
      await saveMut.mutateAsync({ data });
      toast.success('Prodotto creato');
    }
  }

  const fields = useMemo<FieldConfig[]>(() => {
    const base: FieldConfig[] = [
      { name: 'name', label: 'Nome', required: true, wide: true },
      { name: 'categoria', label: 'Categoria', required: true, help: 'es. vestiti, top, pantaloni, gonne, blazer, set, scarpe, borse, gioielli, cinture' },
      { name: 'status', label: 'Stato', type: 'select', options: [
          { value: 'attivo', label: 'Attivo' }, { value: 'bozza', label: 'Bozza' }, { value: 'esaurito', label: 'Esaurito' },
        ] },
      { name: 'colore', label: 'Colore (chiave)', placeholder: 'blush' },
      { name: 'color_label', label: 'Colore (etichetta)', placeholder: 'Rosa cipria' },
      { name: 'price', label: 'Prezzo €', type: 'number', required: true },
      { name: 'original_price', label: 'Prezzo originale €', type: 'number', help: 'Vuoto se non in saldo.' },
      { name: 'discount_pct', label: 'Sconto %', type: 'number' },
      { name: 'sizes', label: 'Taglie e stock', wide: true, placeholder: 'S:10, M:5, L:0', help: 'Coppie taglia:quantità separate da virgola. Taglia unica → "Unica:20". Le immagini si caricano via importazione CSV.' },
      { name: 'description', label: 'Descrizione', type: 'textarea', wide: true },
    ];
    if (editing) return base;
    return [
      { name: 'id', label: 'ID (slug)', required: true, placeholder: 'es. blazer-lino-avorio', help: 'Identificativo univoco minuscolo, usato nell’URL del prodotto.' },
      ...base,
    ];
  }, [editing]);

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
            onClick={(e) => { e.stopPropagation(); openEditRef.current(row.original); }}
            aria-label={`Modifica ${row.original.name}`}
          >
            <Pencil /> Modifica
          </Button>
        ),
      },
    ],
    [],
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
        actions={
          <>
            <Button size="sm" onClick={openCreate}>
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
      />

      <DataTable
        columns={columns}
        data={rows}
        getRowId={(p) => p.id}
        searchValue={(p) => `${p.name} ${p.id} ${p.categoria}`}
        searchPlaceholder="Cerca prodotto…"
        exportName="prodotti"
        exportTitle="Catalogo prodotti"
        exportColumns={exportColumns}
        isLoading={query.isLoading}
        hasMore={query.hasNextPage}
        onLoadMore={() => query.fetchNextPage()}
        loadingMore={query.isFetchingNextPage}
        emptyState={<EmptyState icon={Tag} title="Nessun prodotto" description="Il catalogo è vuoto o nessun prodotto corrisponde ai filtri." />}
        toolbar={
          <>
            <Select value={cat} onValueChange={setCat}>
              <SelectTrigger className="h-9 w-[170px]">
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutte le categorie</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c} className="capitalize">
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-9 w-[150px]">
                <SelectValue placeholder="Stato" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti gli stati</SelectItem>
                <SelectItem value="attivo">Attivo</SelectItem>
                <SelectItem value="bozza">Bozza</SelectItem>
                <SelectItem value="esaurito">Esaurito</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
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

      <EntityFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title={editing ? `Modifica: ${editing.name}` : 'Nuovo prodotto'}
        description={editing ? 'Aggiorna i dettagli, i prezzi e lo stock per taglia.' : 'Crea un prodotto nel catalogo. Le immagini si caricano dopo, via importazione CSV.'}
        fields={fields}
        initial={initial}
        submitLabel={editing ? 'Salva modifiche' : 'Crea prodotto'}
        size="lg"
        onSubmit={onSubmit}
      />
    </div>
  );
}
