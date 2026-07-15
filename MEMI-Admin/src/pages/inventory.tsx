import { useEffect, useMemo, useRef, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Boxes, AlertTriangle, CircleX, PackageCheck, SlidersHorizontal, Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/page-header';
import { KpiCard } from '@/components/common/kpi-card';
import { DataTable } from '@/components/data-table/data-table';
import { StatusBadge } from '@/components/common/status-badge';
import { EmptyState } from '@/components/common/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useProducts, flattenProducts } from '@/hooks/queries';
import { api } from '@/lib/api';
import { int } from '@/lib/format';
import type { ProductRow } from '@/types';
import type { ExportColumn } from '@/lib/export';
import { toast } from 'sonner';

const LOW = 5;

/** Adjust per-size stock for one product. Fetches sizes on open, writes each changed size. */
function StockAdjustDialog({ product, onClose }: { product: ProductRow | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [sizes, setSizes] = useState<{ taglia: string; stock: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const original = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!product) return;
    setLoading(true);
    api.products
      .get(product.id)
      .then((d) => {
        const raw = (d as unknown as { taglie?: (string | { taglia: string; stock?: number })[] }).taglie ?? [];
        const parsed = raw.map((s) => (typeof s === 'string' ? { taglia: s, stock: 0 } : { taglia: s.taglia, stock: s.stock ?? 0 }));
        original.current = Object.fromEntries(parsed.map((s) => [s.taglia, s.stock]));
        setSizes(parsed);
      })
      .catch(() => toast.error('Impossibile caricare le taglie'))
      .finally(() => setLoading(false));
  }, [product]);

  async function save() {
    if (!product) return;
    setBusy(true);
    try {
      const changed = sizes.filter((s) => original.current[s.taglia] !== s.stock);
      for (const s of changed) await api.products.updateStock(product.id, s.taglia, Number(s.stock) || 0);
      await qc.invalidateQueries({ queryKey: ['products'] });
      toast.success(changed.length ? `Aggiornate ${changed.length} taglie` : 'Nessuna modifica');
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Salvataggio non riuscito');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rettifica scorte — {product?.name}</DialogTitle>
          <DialogDescription>Aggiorna la quantità disponibile per ogni taglia.</DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground"><Loader2 className="mr-2 animate-spin" /> Caricamento…</div>
        ) : sizes.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">Questo prodotto non ha taglie con scorta gestibile.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {sizes.map((s, i) => (
              <div key={s.taglia} className="space-y-1.5">
                <Label htmlFor={`sz-${s.taglia}`}>{s.taglia.toUpperCase()}</Label>
                <Input
                  id={`sz-${s.taglia}`}
                  type="number"
                  min={0}
                  value={s.stock}
                  onChange={(e) => setSizes((prev) => prev.map((x, j) => (j === i ? { ...x, stock: e.target.value === '' ? 0 : Number(e.target.value) } : x)))}
                />
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Annulla</Button>
          <Button onClick={save} disabled={busy || loading || sizes.length === 0}>{busy && <Loader2 className="animate-spin" />} Salva scorte</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const exportColumns: ExportColumn<ProductRow>[] = [
  { header: 'ID', accessor: (p) => p.id },
  { header: 'Nome', accessor: (p) => p.name },
  { header: 'Categoria', accessor: (p) => p.categoria },
  { header: 'Taglie', accessor: (p) => (p.taglie || []).join(' | ') },
  { header: 'Stock totale', accessor: (p) => p.stock_total },
  { header: 'Stato', accessor: (p) => p.status },
];

export function InventoryPage() {
  const query = useProducts();
  const [filter, setFilter] = useState<'all' | 'low' | 'out'>('all');
  const [stockTarget, setStockTarget] = useState<ProductRow | null>(null);
  const all = useMemo(() => flattenProducts(query.data?.pages), [query.data]);

  const openStockRef = useRef(setStockTarget);
  openStockRef.current = setStockTarget;

  const stats = useMemo(() => {
    const out = all.filter((p) => p.stock_total === 0).length;
    const low = all.filter((p) => p.stock_total > 0 && p.stock_total < LOW).length;
    const ok = all.length - out - low;
    return { out, low, ok };
  }, [all]);

  const rows = useMemo(
    () =>
      all.filter((p) =>
        filter === 'out' ? p.stock_total === 0 : filter === 'low' ? p.stock_total > 0 && p.stock_total < LOW : true,
      ),
    [all, filter],
  );

  const columns = useMemo<ColumnDef<ProductRow, unknown>[]>(
    () => [
      {
        id: 'prodotto',
        header: 'Prodotto',
        accessorFn: (p) => p.name,
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="truncate font-medium">{row.original.name}</div>
            <div className="truncate text-xs text-muted-foreground">{row.original.id}</div>
          </div>
        ),
      },
      { accessorKey: 'categoria', header: 'Categoria', cell: ({ getValue }) => <span className="capitalize text-muted-foreground">{getValue() as string}</span> },
      {
        id: 'taglie',
        header: 'Taglie',
        accessorFn: (p) => (p.taglie || []).length,
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {(row.original.taglie || []).slice(0, 6).map((t) => (
              <Badge key={t} variant="neutral">
                {t}
              </Badge>
            ))}
            {(row.original.taglie || []).length === 0 && <span className="text-muted-foreground">—</span>}
          </div>
        ),
      },
      {
        accessorKey: 'stock_total',
        header: 'Stock',
        cell: ({ getValue }) => {
          const s = Number(getValue());
          return (
            <span className={s === 0 ? 'font-semibold text-destructive' : s < LOW ? 'font-semibold text-warning' : 'font-semibold'}>
              {s}
            </span>
          );
        },
      },
      { accessorKey: 'status', header: 'Stato', cell: ({ getValue }) => <StatusBadge code={getValue() as string} /> },
      {
        id: 'azioni', header: '', enableSorting: false,
        cell: ({ row }) => (
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openStockRef.current(row.original); }}>
            <SlidersHorizontal /> Rettifica
          </Button>
        ),
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader title="Magazzino" subtitle="Livelli di stock del catalogo. Usa «Rettifica» per aggiornare le scorte per singola taglia." />

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Prodotti" value={int(all.length)} icon={Boxes} tone="primary" loading={query.isLoading} />
        <KpiCard label="Scorta OK" value={int(stats.ok)} icon={PackageCheck} tone="success" loading={query.isLoading} />
        <KpiCard label="Scorte basse" value={int(stats.low)} icon={AlertTriangle} tone="warning" loading={query.isLoading} />
        <KpiCard label="Esauriti" value={int(stats.out)} icon={CircleX} tone="danger" loading={query.isLoading} />
      </div>

      <DataTable
        columns={columns}
        data={rows}
        getRowId={(p) => p.id}
        searchValue={(p) => `${p.name} ${p.id} ${p.categoria}`}
        searchPlaceholder="Cerca prodotto…"
        exportName="magazzino"
        exportTitle="Magazzino"
        exportColumns={exportColumns}
        isLoading={query.isLoading}
        hasMore={query.hasNextPage}
        onLoadMore={() => query.fetchNextPage()}
        loadingMore={query.isFetchingNextPage}
        emptyState={<EmptyState icon={Boxes} title="Nessun prodotto" />}
        toolbar={
          <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <SelectTrigger className="h-9 w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutte le scorte</SelectItem>
              <SelectItem value="low">Solo scorte basse</SelectItem>
              <SelectItem value="out">Solo esauriti</SelectItem>
            </SelectContent>
          </Select>
        }
      />
      <StockAdjustDialog product={stockTarget} onClose={() => setStockTarget(null)} />
    </div>
  );
}
