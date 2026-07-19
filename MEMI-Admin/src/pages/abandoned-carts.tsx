import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ShoppingCart, Send, Loader2, BadgePercent, Package, Bell, Tag } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { KpiCard } from '@/components/common/kpi-card';
import { DataTable } from '@/components/data-table/data-table';
import { BulkDelete } from '@/components/data-table/bulk-delete';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/common/empty-state';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useCarts, useDeleteMany } from '@/hooks/queries';
import { api } from '@/lib/api';
import { eur, ago } from '@/lib/format';
import type { AbandonedCart, CartLineItem } from '@/types';
import type { ExportColumn } from '@/lib/export';
import { toast } from 'sonner';

const exportColumns: ExportColumn<AbandonedCart>[] = [
  { header: 'Cliente', accessor: (c) => c.customer_nome || 'Ospite' },
  { header: 'Email', accessor: (c) => c.email || '' },
  { header: 'Prodotti', accessor: (c) => c.items?.length ?? 0 },
  { header: 'Articoli', accessor: (c) => c.item_count },
  { header: 'Totale', accessor: (c) => eur(c.total) },
  { header: 'Recuperabile', accessor: (c) => (c.recoverable ? 'Sì' : 'No') },
];

export function AbandonedCartsPage() {
  const query = useCarts();
  const del = useDeleteMany<number>((id) => api.carts.delete(id), 'carts');
  const rows = query.data?.carts ?? [];
  const s = query.data?.summary;
  const [detail, setDetail] = useState<AbandonedCart | null>(null);

  const columns = useMemo<ColumnDef<AbandonedCart, unknown>[]>(
    () => [
      {
        id: 'cliente',
        header: 'Cliente / Email',
        accessorFn: (c) => c.customer_nome || c.email,
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="truncate font-medium">{row.original.customer_nome || 'Ospite anonimo'}</div>
            <div className="truncate text-xs text-muted-foreground">{row.original.email || '—'}</div>
          </div>
        ),
      },
      {
        id: 'prodotti',
        header: 'Prodotti',
        accessorFn: (c) => c.items?.length ?? 0,
        cell: ({ row }) => {
          const cart = row.original;
          const nProd = cart.items?.length ?? 0;
          const nArt = cart.item_count;
          if (!nProd) return <span className="text-muted-foreground">{nArt} art.</span>;
          return (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setDetail(cart);
              }}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-medium text-primary underline-offset-2 hover:bg-primary/10 hover:underline focus:outline-none focus:ring-2 focus:ring-ring"
              title="Vedi i prodotti e invia un promemoria"
            >
              <Package className="h-3.5 w-3.5" />
              {nProd} {nProd === 1 ? 'prodotto' : 'prodotti'}
              {nArt !== nProd ? <span className="text-xs font-normal text-muted-foreground">· {nArt} art.</span> : null}
            </button>
          );
        },
      },
      { accessorKey: 'total', header: 'Totale', cell: ({ getValue }) => <span className="font-semibold">{eur(getValue() as number)}</span>, sortingFn: (a, b) => Number(a.original.total) - Number(b.original.total) },
      { accessorKey: 'updated_at', header: 'Ultima attività', cell: ({ getValue }) => <span className="text-muted-foreground">{ago(getValue() as string)}</span> },
      { accessorKey: 'recoverable', header: '', cell: ({ getValue }) => (getValue() ? <Badge variant="success">Recuperabile</Badge> : null) },
    ],
    [],
  );

  async function recover(carts: AbandonedCart[], clear: () => void) {
    const targets = carts.filter((c) => c.recoverable);
    if (!targets.length) {
      toast.info('Nessun carrello selezionato ha un’email per il recupero');
      return;
    }
    await Promise.allSettled(targets.map((c) => api.carts.recover(c.id)));
    toast.success(`Promemoria inviato a ${targets.length} carrelli`);
    clear();
  }

  return (
    <div>
      <PageHeader title="Carrelli abbandonati" subtitle="Carrelli con articoli, inattivi da oltre 30 minuti." />
      <div className="mb-4 grid grid-cols-3 gap-4">
        <KpiCard label="Abbandonati" value={s?.count ?? 0} icon={ShoppingCart} tone="warning" loading={query.isLoading} />
        <KpiCard label="Valore potenziale" value={eur(s?.potential_value ?? 0)} tone="primary" loading={query.isLoading} />
        <KpiCard label="Recuperabili" value={s?.recoverable ?? 0} tone="success" loading={query.isLoading} />
      </div>
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(c) => String(c.id)}
        searchValue={(c) => `${c.customer_nome ?? ''} ${c.email ?? ''}`}
        searchPlaceholder="Cerca cliente o email…"
        exportName="carrelli_abbandonati"
        exportTitle="Carrelli abbandonati"
        exportColumns={exportColumns}
        isLoading={query.isLoading}
        emptyState={<EmptyState icon={ShoppingCart} title="Nessun carrello abbandonato 🎉" />}
        bulkActions={(selected, clear) => (
          <>
            <Button variant="secondary" size="sm" onClick={() => recover(selected, clear)}>
              <Send /> Invia promemoria
            </Button>
            <BulkDelete count={selected.length} noun="carrelli" onDelete={() => del.mutateAsync(selected.map((c) => c.id))} onDone={clear} />
          </>
        )}
      />

      {detail && (
        <CartRecoveryDialog cart={detail} onClose={() => setDetail(null)} onSent={() => query.refetch()} />
      )}
    </div>
  );
}

type Mode = 'reminder' | 'items' | 'discount_items' | 'discount_category';

const MODES: { key: Mode; icon: typeof Bell; label: string; hint: string }[] = [
  { key: 'reminder', icon: Bell, label: 'Promemoria carrello', hint: 'Ricorda l’intero carrello' },
  { key: 'items', icon: Package, label: 'Promemoria prodotti', hint: 'Solo i prodotti scelti' },
  { key: 'discount_items', icon: BadgePercent, label: 'Sconto sui prodotti', hint: 'Codice sui prodotti scelti' },
  { key: 'discount_category', icon: Tag, label: 'Sconto categoria', hint: 'Codice su una categoria' },
];

/**
 * Cart recovery modal: lists the abandoned products and lets the admin send one of
 * four things — a plain whole-cart reminder, a reminder featuring only the chosen
 * products, a discount code scoped to the chosen products, or a discount code scoped
 * to a whole category present in the cart. Clicking outside closes it (Radix default).
 */
function CartRecoveryDialog({
  cart,
  onClose,
  onSent,
}: {
  cart: AbandonedCart;
  onClose: () => void;
  onSent: () => void;
}) {
  const items: CartLineItem[] = cart.items ?? [];
  const [mode, setMode] = useState<Mode>('reminder');
  const [tipo, setTipo] = useState<'percentuale' | 'fisso'>('percentuale');
  const [valore, setValore] = useState('10');
  const [selected, setSelected] = useState<Set<string>>(() => new Set(items.map((it) => String(it.id))));
  const [category, setCategory] = useState('');
  const [busy, setBusy] = useState(false);

  const picksItems = mode === 'items' || mode === 'discount_items';
  const needsDiscount = mode === 'discount_items' || mode === 'discount_category';

  // Categories present in this cart — fetched lazily only when the category mode is on.
  const catQ = useQuery({
    queryKey: ['cart-categories', cart.id],
    queryFn: () => api.carts.categories(cart.id),
    enabled: mode === 'discount_category',
  });
  const categories = catQ.data?.categories ?? [];

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const allSelected = selected.size === items.length && items.length > 0;

  async function send() {
    if (!cart.recoverable) {
      toast.error('Questo carrello non ha un’email per il recupero');
      return;
    }
    if (picksItems && selected.size === 0) {
      toast.error('Seleziona almeno un prodotto');
      return;
    }
    if (mode === 'discount_category' && !category) {
      toast.error('Scegli una categoria');
      return;
    }
    const val = Number(valore);
    if (needsDiscount && (!(val > 0) || (tipo === 'percentuale' && val > 100))) {
      toast.error('Inserisci un valore sconto valido');
      return;
    }

    let payload: Parameters<typeof api.carts.recover>[1];
    if (mode === 'reminder') payload = undefined;
    else if (mode === 'items') payload = { item_ids: [...selected] };
    else if (mode === 'discount_items') payload = { discount: { tipo, valore: val }, item_ids: [...selected] };
    else payload = { discount: { tipo, valore: val }, category };

    setBusy(true);
    try {
      const r = await api.carts.recover(cart.id, payload);
      toast.success(
        r.discount_code
          ? `Inviato a ${r.sent_to} · codice ${r.discount_code}`
          : `Promemoria inviato a ${r.sent_to}`,
      );
      onSent();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Invio non riuscito');
    } finally {
      setBusy(false);
    }
  }

  const sendLabel =
    mode === 'reminder'
      ? 'Invia promemoria'
      : mode === 'items'
        ? 'Invia promemoria prodotti'
        : 'Invia con sconto';

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-muted-foreground" />
            Recupera il carrello di {cart.customer_nome || 'Ospite anonimo'}
          </DialogTitle>
          <DialogDescription>
            {cart.email || 'Nessuna email'} · {items.length} prodotti · {cart.item_count} articoli · ultima attività {ago(cart.updated_at)}
          </DialogDescription>
        </DialogHeader>

        {/* Product list */}
        <div className="max-h-64 divide-y overflow-y-auto rounded-lg border">
          {picksItems && (
            <div className="flex items-center justify-between bg-muted/40 px-3 py-1.5 text-xs">
              <span className="text-muted-foreground">{selected.size} di {items.length} selezionati</span>
              <button
                type="button"
                className="font-medium text-primary hover:underline"
                onClick={() => setSelected(allSelected ? new Set() : new Set(items.map((it) => String(it.id))))}
              >
                {allSelected ? 'Deseleziona tutti' : 'Seleziona tutti'}
              </button>
            </div>
          )}
          {items.map((it, i) => {
            const id = String(it.id);
            const covered = mode === 'discount_category' && !!category && it.categoria === category;
            const dimmed = mode === 'discount_category' && !!category && it.categoria !== category;
            return (
              <label
                key={`${id}-${i}`}
                className={`flex items-center gap-3 p-3 ${picksItems ? 'cursor-pointer hover:bg-muted/40' : ''} ${dimmed ? 'opacity-40' : ''}`}
              >
                {picksItems && (
                  <input
                    type="checkbox"
                    checked={selected.has(id)}
                    onChange={() => toggle(id)}
                    className="h-4 w-4 accent-[hsl(var(--primary))]"
                  />
                )}
                <div className="flex h-9 w-9 flex-none items-center justify-center rounded-md bg-muted text-sm font-semibold text-muted-foreground">
                  {it.qty}×
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{it.name || 'Prodotto'}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    {it.categoria ? (
                      <span className={`rounded px-1.5 py-0.5 ${covered ? 'bg-primary/15 font-medium text-primary' : 'bg-muted'}`}>
                        {it.categoria}
                      </span>
                    ) : null}
                    {it.taglia ? <span>Taglia: {it.taglia}</span> : null}
                  </div>
                </div>
                <div className="flex-none text-right text-sm">
                  <div className="font-semibold">{eur(it.price * it.qty)}</div>
                  {it.qty > 1 ? <div className="text-xs text-muted-foreground">{eur(it.price)} cad.</div> : null}
                </div>
              </label>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t pt-3 text-sm">
          <span className="text-muted-foreground">Totale carrello</span>
          <span className="text-base font-semibold">{eur(cart.total)}</span>
        </div>

        {/* Mode selector */}
        <div className="grid grid-cols-2 gap-2">
          {MODES.map((m) => {
            const Icon = m.icon;
            const active = mode === m.key;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => setMode(m.key)}
                className={`flex items-start gap-2 rounded-lg border p-2.5 text-left transition-colors ${
                  active ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/40'
                }`}
              >
                <Icon className={`mt-0.5 h-4 w-4 flex-none ${active ? 'text-primary' : 'text-muted-foreground'}`} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium leading-tight">{m.label}</span>
                  <span className="block text-xs text-muted-foreground">{m.hint}</span>
                </span>
              </button>
            );
          })}
        </div>

        {/* Category picker (category-discount mode) */}
        {mode === 'discount_category' && (
          <div className="space-y-1.5">
            <span className="text-xs text-muted-foreground">Categoria del carrello</span>
            {catQ.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Carico le categorie…
              </div>
            ) : categories.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessuna categoria riconosciuta per i prodotti di questo carrello.</p>
            ) : (
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">Scegli una categoria…</option>
                {categories.map((c) => (
                  <option key={c.categoria} value={c.categoria}>
                    {c.categoria} — {c.cart_items} nel carrello · sconto su {c.catalog_products} prodotti
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* Discount fields (discount modes) */}
        {needsDiscount && (
          <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/30 p-3">
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Tipo</span>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as 'percentuale' | 'fisso')}
                className="flex h-9 w-36 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="percentuale">Percentuale (%)</option>
                <option value="fisso">Fisso (€)</option>
              </select>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Valore</span>
              <Input type="number" min={1} value={valore} onChange={(e) => setValore(e.target.value)} className="h-9 w-28" />
            </div>
            <p className="flex-1 text-xs text-muted-foreground">
              Codice sconto monouso (valido 14 giorni), incluso nell’email e valido{' '}
              <strong>
                {mode === 'discount_category'
                  ? 'solo per i prodotti della categoria scelta'
                  : 'solo per i prodotti selezionati'}
              </strong>{' '}
              al checkout.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Chiudi
          </Button>
          <Button onClick={send} disabled={busy || !cart.recoverable}>
            {busy ? <Loader2 className="animate-spin" /> : <Send />}
            {sendLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
