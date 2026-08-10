import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSuppliers, useAllProducts } from '@/hooks/queries';
import { api } from '@/lib/api';
import { eur } from '@/lib/format';
import type { PurchaseOrder } from '@/types';
import { toast } from 'sonner';

interface ItemRow {
  prodotto: string; // product id — must match products.id so "receive" credits the right stock row
  taglia: string;
  quantita: number;
  costo_unitario: number;
}

interface PoDetail {
  purchase_order: PurchaseOrder;
  items: { prodotto: string; taglia: string | null; quantita: number; costo_unitario: string | number }[];
}

/** Shared class for native <select>/<textarea> so they match the shadcn <Input>. */
const FIELD =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

const newRow = (): ItemRow => ({ prodotto: '', taglia: '', quantita: 1, costo_unitario: 0 });

/**
 * Create / edit a purchase order.
 *
 * Create: pick a supplier + add product line-items (product, size, qty, unit cost)
 *         → POST /admin/purchase-orders (auto-numbered PO-YYYY-NNNN, stato 'bozza').
 * Edit:   supplier, line-items, stato and note are all editable while the order is
 *         still open. Once it is 'ricevuto' the quantities are already in stock, so the
 *         lines lock (the backend enforces the same rule with a 409) — same for
 *         'annullato'. Editing a received order would silently desync the warehouse.
 */
export function PurchaseOrderFormPage() {
  const { id } = useParams<{ id: string }>();
  const editing = id != null;
  const navigate = useNavigate();
  const qc = useQueryClient();

  const suppliersQ = useSuppliers();
  const productsQ = useAllProducts();
  const suppliers = suppliersQ.data ?? [];
  const products = productsQ.data?.items ?? [];

  const detailQ = useQuery({
    queryKey: ['purchase-orders', 'detail', id],
    queryFn: () => api.purchaseOrders.get(Number(id)) as Promise<PoDetail>,
    enabled: editing,
  });

  const [supplierId, setSupplierId] = useState('');
  const [note, setNote] = useState('');
  const [stato, setStato] = useState<PurchaseOrder['stato']>('bozza');
  const [items, setItems] = useState<ItemRow[]>([newRow()]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (editing && detailQ.data) {
      const po = detailQ.data.purchase_order;
      setSupplierId(po.supplier_id != null ? String(po.supplier_id) : '');
      setNote(po.note ?? '');
      setStato(po.stato);
      const rows = (detailQ.data.items ?? []).map((it) => ({
        prodotto: String(it.prodotto),
        taglia: it.taglia ?? '',
        quantita: Number(it.quantita) || 0,
        costo_unitario: Number(it.costo_unitario) || 0,
      }));
      setItems(rows.length ? rows : [newRow()]);
    }
  }, [editing, detailQ.data]);

  const received = editing && stato === 'ricevuto';
  // Lines are frozen once the PO leaves the open states — mirrors the backend guard.
  const locked = editing && (detailQ.data?.purchase_order.stato === 'ricevuto' || detailQ.data?.purchase_order.stato === 'annullato');
  const total = items.reduce((n, it) => n + (Number(it.quantita) || 0) * (Number(it.costo_unitario) || 0), 0);
  const productName = (pid: string) => products.find((p) => String(p.id) === String(pid))?.name ?? pid;

  const patchItem = (i: number, patch: Partial<ItemRow>) =>
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const addRow = () => setItems((prev) => [...prev, newRow()]);
  const removeRow = (i: number) => setItems((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (editing) {
        const payload: Record<string, unknown> = { stato, note: note || null };
        if (!locked) {
          payload.supplier_id = supplierId ? Number(supplierId) : null;
          payload.items = items
            .filter((it) => it.prodotto && (Number(it.quantita) || 0) > 0)
            .map((it) => ({
              prodotto: it.prodotto,
              taglia: it.taglia.trim() || null,
              quantita: Number(it.quantita) || 0,
              costo_unitario: Number(it.costo_unitario) || 0,
            }));
          if (!(payload.items as unknown[]).length) {
            toast.error('Aggiungi almeno una riga con prodotto e quantità');
            setBusy(false);
            return;
          }
        }
        await api.purchaseOrders.update(Number(id), payload);
        toast.success('Ordine fornitore aggiornato');
      } else {
        const rows = items
          .filter((it) => it.prodotto && (Number(it.quantita) || 0) > 0)
          .map((it) => ({
            prodotto: it.prodotto,
            taglia: it.taglia.trim() || null,
            quantita: Number(it.quantita) || 0,
            costo_unitario: Number(it.costo_unitario) || 0,
          }));
        if (!rows.length) {
          toast.error('Aggiungi almeno una riga con prodotto e quantità');
          setBusy(false);
          return;
        }
        await api.purchaseOrders.create({
          supplier_id: supplierId ? Number(supplierId) : null,
          note: note || null,
          items: rows,
        });
        toast.success('Ordine fornitore creato');
      }
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      navigate('/purchase-orders');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Salvataggio non riuscito');
      setBusy(false);
    }
  }

  return (
    <div>
      <Button variant="ghost" size="sm" className="-ml-2 mb-2" onClick={() => navigate('/purchase-orders')}>
        <ArrowLeft /> Ordini fornitori
      </Button>
      <PageHeader
        title={editing ? `Ordine ${detailQ.data?.purchase_order.numero ?? ''}`.trim() : 'Nuovo ordine fornitore'}
        subtitle={
          editing
            ? locked
              ? 'Ordine chiuso: righe e dettagli sono in sola lettura.'
              : 'Aggiorna fornitore, righe, stato e note.'
            : 'Seleziona il fornitore e aggiungi le righe prodotto.'
        }
      />

      {editing && detailQ.isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <form onSubmit={submit}>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Main: line items */}
            <div className="space-y-6 lg:col-span-2">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Righe prodotto</CardTitle>
                </CardHeader>
                <CardContent>
                  {locked && (
                    <p className="mb-3 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                      {received
                        ? 'Ordine già ricevuto: le quantità sono state sommate allo stock, quindi le righe non sono più modificabili.'
                        : 'Ordine annullato: le righe non sono più modificabili.'}
                    </p>
                  )}
                  <div className="hidden gap-2 border-b px-1 pb-2 text-xs font-medium text-muted-foreground sm:flex">
                    <span className="flex-1">Prodotto</span>
                    <span className="w-20">Taglia</span>
                    <span className="w-16 text-right">Qtà</span>
                    <span className="w-24 text-right">Costo €</span>
                    <span className="w-24 text-right">Subtot.</span>
                    <span className="w-8" />
                  </div>
                  <div className="space-y-2 pt-2">
                    {items.map((it, i) => (
                      <div
                        key={i}
                        className="flex flex-col gap-2 border-b pb-2 sm:flex-row sm:items-center sm:border-0 sm:pb-0"
                      >
                        {locked ? (
                          <span className="flex-1 text-sm font-medium">{productName(it.prodotto)}</span>
                        ) : (
                          <select
                            className={FIELD + ' flex-1'}
                            value={it.prodotto}
                            onChange={(e) => patchItem(i, { prodotto: e.target.value })}
                          >
                            <option value="">Seleziona prodotto…</option>
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        )}
                        {locked ? (
                          <span className="w-20 text-sm text-muted-foreground">{it.taglia || '—'}</span>
                        ) : (
                          <Input
                            className="w-20"
                            placeholder="opz."
                            value={it.taglia}
                            onChange={(e) => patchItem(i, { taglia: e.target.value })}
                          />
                        )}
                        {locked ? (
                          <span className="w-16 text-right text-sm">{it.quantita}</span>
                        ) : (
                          <Input
                            type="number"
                            min={1}
                            className="w-16 text-right"
                            value={String(it.quantita)}
                            onChange={(e) => patchItem(i, { quantita: Math.max(0, Number(e.target.value) || 0) })}
                          />
                        )}
                        {locked ? (
                          <span className="w-24 text-right text-sm">{eur(it.costo_unitario)}</span>
                        ) : (
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            className="w-24 text-right"
                            value={String(it.costo_unitario)}
                            onChange={(e) => patchItem(i, { costo_unitario: Math.max(0, Number(e.target.value) || 0) })}
                          />
                        )}
                        <span className="w-24 text-right text-sm font-semibold">
                          {eur((Number(it.quantita) || 0) * (Number(it.costo_unitario) || 0))}
                        </span>
                        {locked ? (
                          <span className="w-8" />
                        ) : (
                          <button
                            type="button"
                            onClick={() => removeRow(i)}
                            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive"
                            aria-label="Rimuovi riga"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {!locked && (
                    <Button type="button" variant="outline" size="sm" className="mt-3" onClick={addRow}>
                      <Plus /> Aggiungi riga
                    </Button>
                  )}
                  <div className="mt-4 flex items-center justify-between border-t pt-3">
                    <span className="text-sm text-muted-foreground">Totale ordine</span>
                    <span className="text-lg font-semibold">{eur(total)}</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Side: supplier + stato + note */}
            <div className="space-y-6">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Dettagli</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Fornitore</Label>
                    <select
                      className={FIELD}
                      value={supplierId}
                      disabled={locked}
                      onChange={(e) => setSupplierId(e.target.value)}
                    >
                      <option value="">— Nessuno —</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nome}
                        </option>
                      ))}
                    </select>
                  </div>

                  {editing && (
                    <div className="space-y-1.5">
                      <Label>Stato</Label>
                      <select
                        className={FIELD}
                        value={stato}
                        disabled={received}
                        onChange={(e) => setStato(e.target.value as PurchaseOrder['stato'])}
                      >
                        <option value="bozza">Bozza</option>
                        <option value="inviato">Inviato</option>
                        <option value="annullato">Annullato</option>
                        {received && <option value="ricevuto">Ricevuto</option>}
                      </select>
                      {received && (
                        <p className="text-xs text-muted-foreground">Ordine già ricevuto: stato in sola lettura.</p>
                      )}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label>Note</Label>
                    <textarea
                      className={FIELD + ' min-h-[80px] py-2'}
                      value={note}
                      disabled={received}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Note interne (opzionale)…"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="mt-6 flex items-center gap-2">
            <Button type="submit" disabled={busy || received}>
              {busy && <Loader2 className="animate-spin" />} {editing ? 'Salva modifiche' : 'Crea ordine'}
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate('/purchase-orders')} disabled={busy}>
              Annulla
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
