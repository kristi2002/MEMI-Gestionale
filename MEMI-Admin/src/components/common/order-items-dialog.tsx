import { useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAllProducts } from '@/hooks/queries';
import { api } from '@/lib/api';
import { eur } from '@/lib/format';
import type { OrderDetail } from '@/types';
import { toast } from 'sonner';

const FIELD =
  'flex h-9 rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

interface Row {
  product_id: string;
  taglia: string;
  qty: number;
}

/**
 * Edit an order's line items.
 *
 * Only the ids/quantities are sent — the backend re-resolves name and price from the
 * catalogue and recomputes the totals, so the figures previewed here are indicative
 * and the server's answer is authoritative. The button that opens this is hidden for
 * orders the backend would refuse (paid, shipped, delivered, cancelled).
 */
export function OrderItemsDialog({ order, onSaved, trigger }: {
  order: OrderDetail;
  onSaved: () => void;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [shipping, setShipping] = useState('');

  const productsQ = useAllProducts();
  const products = productsQ.data?.items ?? [];
  const priceOf = (pid: string) => Number(products.find((p) => String(p.id) === String(pid))?.price ?? 0) || 0;

  function start(next: boolean) {
    if (next) {
      setRows(order.items.map((it) => ({
        product_id: String(it.product_id),
        taglia: it.taglia ?? '',
        qty: it.qty,
      })));
      setShipping(String(Number(order.shipping_cost) || 0));
    }
    setOpen(next);
  }

  const patchRow = (i: number, p: Partial<Row>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const addRow = () => setRows((r) => [...r, { product_id: '', taglia: '', qty: 1 }]);
  const removeRow = (i: number) => setRows((r) => r.filter((_, j) => j !== i));

  const subtotal = rows.reduce((n, r) => n + priceOf(r.product_id) * (Number(r.qty) || 0), 0);

  async function save() {
    const items = rows
      .filter((r) => r.product_id && (Number(r.qty) || 0) > 0)
      .map((r) => ({ product_id: r.product_id, taglia: r.taglia.trim() || null, qty: Number(r.qty) || 1 }));
    if (!items.length) {
      toast.error('Un ordine deve contenere almeno un articolo.');
      return;
    }
    setBusy(true);
    try {
      const res = await api.orders.updateItems(order.id, {
        items,
        shipping_cost: shipping.trim() === '' ? undefined : Number(shipping),
      });
      toast.success(`Ordine aggiornato — nuovo totale ${eur(res.total)}`);
      setOpen(false);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Modifica non riuscita');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <span onClick={() => start(true)}>{trigger}</span>
      <Dialog open={open} onOpenChange={start}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Modifica articoli — {order.order_number}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-2">
              {rows.map((r, i) => (
                <div key={i} className="flex flex-col gap-2 border-b pb-2 sm:flex-row sm:items-center sm:border-0 sm:pb-0">
                  <select
                    className={FIELD + ' flex-1'}
                    aria-label={`Prodotto riga ${i + 1}`}
                    value={r.product_id}
                    onChange={(e) => patchRow(i, { product_id: e.target.value })}
                  >
                    <option value="">Seleziona prodotto…</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <Input
                    className="w-20" placeholder="Taglia"
                    aria-label={`Taglia riga ${i + 1}`}
                    value={r.taglia}
                    onChange={(e) => patchRow(i, { taglia: e.target.value })}
                  />
                  <Input
                    type="number" min={1} className="w-16 text-right"
                    aria-label={`Quantità riga ${i + 1}`}
                    value={String(r.qty)}
                    onChange={(e) => patchRow(i, { qty: Math.max(0, Number(e.target.value) || 0) })}
                  />
                  <span className="w-24 text-right text-sm font-semibold">
                    {eur(priceOf(r.product_id) * (Number(r.qty) || 0))}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive"
                    aria-label={`Rimuovi riga ${i + 1}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addRow}>
                <Plus /> Aggiungi riga
              </Button>
            </div>

            <div className="flex items-center justify-between gap-3 border-t pt-3">
              <div className="flex items-center gap-2">
                <Label htmlFor="order-shipping" className="text-sm">Spedizione (€)</Label>
                <Input
                  id="order-shipping" type="number" min={0} step="0.01" className="w-28"
                  value={shipping} onChange={(e) => setShipping(e.target.value)}
                />
              </div>
              <div className="text-right text-sm">
                <div className="text-muted-foreground">Subtotale articoli</div>
                <div className="text-base font-semibold">{eur(subtotal)}</div>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Le scorte vengono aggiornate solo per la differenza tra le righe attuali e quelle nuove.
              Sconti e gift card già applicati restano invariati; il totale definitivo è ricalcolato dal server.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Annulla</Button>
            <Button type="button" onClick={save} disabled={busy || productsQ.isLoading}>
              {busy && <Loader2 className="animate-spin" />} Salva articoli
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
