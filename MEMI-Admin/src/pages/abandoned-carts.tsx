import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { ShoppingCart, Send, Loader2, BadgePercent } from 'lucide-react';
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
        accessorKey: 'item_count',
        header: 'Articoli',
        cell: ({ row, getValue }) => {
          const cart = row.original;
          const n = getValue() as number;
          const label = `${n} art.`;
          if (!cart.items?.length) return <span className="text-muted-foreground">{label}</span>;
          return (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setDetail(cart);
              }}
              className="rounded-md px-2 py-0.5 font-medium text-primary underline-offset-2 hover:bg-primary/10 hover:underline focus:outline-none focus:ring-2 focus:ring-ring"
              title="Vedi i prodotti nel carrello"
            >
              {label}
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
        <CartReminderDialog cart={detail} onClose={() => setDetail(null)} onSent={() => query.refetch()} />
      )}
    </div>
  );
}

/**
 * Cart detail modal (#1): lists the abandoned products and lets the admin send a
 * promemoria — either a plain reminder, or one carrying a freshly-minted discount
 * code featuring specific selected items. Clicking outside closes it (Radix default).
 */
function CartReminderDialog({
  cart,
  onClose,
  onSent,
}: {
  cart: AbandonedCart;
  onClose: () => void;
  onSent: () => void;
}) {
  const items: CartLineItem[] = cart.items ?? [];
  const [withDiscount, setWithDiscount] = useState(false);
  const [tipo, setTipo] = useState<'percentuale' | 'fisso'>('percentuale');
  const [valore, setValore] = useState('10');
  // Featured items for the discount — default all selected.
  const [selected, setSelected] = useState<Set<string>>(() => new Set(items.map((it) => String(it.id))));
  const [busy, setBusy] = useState(false);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function send() {
    if (!cart.recoverable) {
      toast.error('Questo carrello non ha un’email per il recupero');
      return;
    }
    const val = Number(valore);
    if (withDiscount && (!(val > 0) || (tipo === 'percentuale' && val > 100))) {
      toast.error('Inserisci un valore sconto valido');
      return;
    }
    setBusy(true);
    try {
      const payload = withDiscount
        ? { discount: { tipo, valore: val }, item_ids: [...selected] }
        : undefined;
      const r = await api.carts.recover(cart.id, payload);
      toast.success(
        r.discount_code
          ? `Promemoria con codice ${r.discount_code} inviato a ${r.sent_to}`
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

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-muted-foreground" />
            Carrello di {cart.customer_nome || 'Ospite anonimo'}
          </DialogTitle>
          <DialogDescription>
            {cart.email || 'Nessuna email'} · {cart.item_count} articoli · ultima attività {ago(cart.updated_at)}
          </DialogDescription>
        </DialogHeader>

        <div className="divide-y rounded-lg border">
          {items.map((it, i) => {
            const id = String(it.id);
            return (
              <label key={`${id}-${i}`} className="flex cursor-pointer items-center gap-3 p-3 hover:bg-muted/40">
                {withDiscount && (
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
                  {it.taglia ? <div className="text-xs text-muted-foreground">Taglia: {it.taglia}</div> : null}
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

        {/* Promemoria options */}
        <div className="rounded-lg border bg-muted/30 p-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={withDiscount}
              onChange={(e) => setWithDiscount(e.target.checked)}
              className="h-4 w-4 accent-[hsl(var(--primary))]"
            />
            <BadgePercent className="h-4 w-4 text-muted-foreground" />
            Aggiungi uno sconto per gli articoli selezionati
          </label>
          {withDiscount && (
            <div className="mt-3 flex flex-wrap items-end gap-3">
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
                <Input
                  type="number"
                  min={1}
                  value={valore}
                  onChange={(e) => setValore(e.target.value)}
                  className="h-9 w-28"
                />
              </div>
              <p className="flex-1 text-xs text-muted-foreground">
                Verrà generato un codice sconto monouso (valido 14 giorni), incluso nell’email e valido
                <strong> solo per gli articoli selezionati</strong> al checkout.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Chiudi
          </Button>
          <Button onClick={send} disabled={busy || !cart.recoverable}>
            {busy ? <Loader2 className="animate-spin" /> : <Send />}
            {withDiscount ? 'Invia promemoria con sconto' : 'Invia promemoria'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
