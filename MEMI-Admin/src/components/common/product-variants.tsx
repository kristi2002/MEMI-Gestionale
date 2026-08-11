import { useEffect, useState } from 'react';
import { Plus, Loader2, Trash2, Pencil, Layers } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { EmptyState } from '@/components/common/empty-state';
import { api } from '@/lib/api';
import type { ProductVariant } from '@/types';
import { eur } from '@/lib/format';
import { toast } from 'sonner';

/** `options` is a free-form attribute bag ({colore:'Rosso', taglia:'M'}); render it as chips. */
function describe(options: Record<string, string>): string {
  const parts = Object.entries(options).map(([k, v]) => `${k}: ${v}`);
  return parts.length ? parts.join(' · ') : '—';
}

interface Draft {
  id?: number;
  sku: string;
  price: string;
  stock: string;
  attivo: boolean;
  /** Edited as rows so an operator can add arbitrary attributes without JSON. */
  attrs: { key: string; value: string }[];
}

const emptyDraft = (): Draft => ({
  sku: '', price: '', stock: '0', attivo: true,
  attrs: [{ key: 'colore', value: '' }],
});

const toDraft = (v: ProductVariant): Draft => ({
  id: v.id,
  sku: v.sku ?? '',
  price: v.price == null ? '' : String(v.price),
  stock: String(v.stock ?? 0),
  attivo: v.attivo,
  attrs: Object.keys(v.options || {}).length
    ? Object.entries(v.options).map(([key, value]) => ({ key, value: String(value) }))
    : [{ key: 'colore', value: '' }],
});

/**
 * Product variant manager — colour/size (or any attribute) combinations that carry
 * their own SKU, price override and stock.
 *
 * Distinct from "Taglie e magazzino": that editor tracks stock per size on the parent
 * product, which is all a single-colourway garment needs. Variants exist for the case
 * where the same product ships in several colourways that must be stocked and priced
 * separately. A product with no variants behaves exactly as before.
 */
export function ProductVariantsCard({ productId }: { productId: string }) {
  const [rows, setRows] = useState<ProductVariant[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);

  async function load() {
    setLoading(true);
    try {
      setRows(await api.products.variants.list(productId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Caricamento varianti non riuscito');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [productId]);

  function openNew() { setDraft(emptyDraft()); setOpen(true); }
  function openEdit(v: ProductVariant) { setDraft(toDraft(v)); setOpen(true); }

  function setAttr(i: number, patch: Partial<{ key: string; value: string }>) {
    setDraft((d) => ({ ...d, attrs: d.attrs.map((a, j) => (j === i ? { ...a, ...patch } : a)) }));
  }

  async function save() {
    const options: Record<string, string> = {};
    for (const { key, value } of draft.attrs) {
      const k = key.trim();
      const v = value.trim();
      if (k && v) options[k] = v;
    }
    if (!Object.keys(options).length) {
      toast.error('Specifica almeno un attributo (es. colore: Rosso).');
      return;
    }
    const payload = {
      sku: draft.sku.trim() || null,
      options,
      price: draft.price.trim() === '' ? null : Number(draft.price),
      stock: parseInt(draft.stock, 10) || 0,
      attivo: draft.attivo,
    };
    if (payload.price !== null && !isFinite(payload.price)) {
      toast.error('Prezzo non valido.');
      return;
    }
    setBusy(true);
    try {
      if (draft.id) await api.products.variants.update(productId, draft.id, payload);
      else await api.products.variants.create(productId, payload);
      toast.success(draft.id ? 'Variante aggiornata' : 'Variante creata');
      setOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Salvataggio non riuscito');
    } finally {
      setBusy(false);
    }
  }

  async function remove(v: ProductVariant) {
    setBusy(true);
    try {
      await api.products.variants.delete(productId, v.id);
      toast.success('Variante eliminata');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Eliminazione non riuscita');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Varianti</CardTitle>
        <CardDescription>
          Combinazioni con SKU, prezzo e scorte proprie (es. lo stesso capo in più colori).
          Se il prodotto esiste in un solo colorway lascia vuoto: bastano le taglie qui sopra.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Caricamento…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-md border border-dashed">
            <EmptyState icon={Layers} title="Nessuna variante" />
            <div className="flex justify-center pb-4">
              <Button type="button" size="sm" onClick={openNew}><Plus /> Aggiungi variante</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-md border">
              <div className="flex items-center gap-3 border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
                <span className="flex-1">Attributi</span>
                <span className="w-28">SKU</span>
                <span className="w-20 text-right">Prezzo</span>
                <span className="w-16 text-right">Scorte</span>
                <span className="w-24" />
              </div>
              {rows.map((v) => (
                <div key={v.id} className="flex items-center gap-3 border-b px-3 py-2 text-sm last:border-b-0">
                  <span className="flex-1 min-w-0 truncate">
                    {describe(v.options)}
                    {!v.attivo && <Badge variant="neutral" className="ml-2">Non attiva</Badge>}
                  </span>
                  <span className="w-28 truncate text-muted-foreground">{v.sku || '—'}</span>
                  <span className="w-20 text-right">{v.price == null ? '—' : eur(v.price)}</span>
                  <span className={`w-16 text-right font-medium ${v.stock === 0 ? 'text-destructive' : ''}`}>{v.stock}</span>
                  <span className="flex w-24 justify-end gap-0.5">
                    <Button
                      type="button" variant="ghost" size="icon" className="h-7 w-7"
                      disabled={busy} onClick={() => openEdit(v)} aria-label="Modifica variante"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <ConfirmDialog
                      title="Eliminare questa variante?"
                      description={describe(v.options)}
                      confirmLabel="Elimina"
                      destructive
                      onConfirm={() => remove(v)}
                      trigger={
                        <Button
                          type="button" variant="ghost" size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          disabled={busy} aria-label="Elimina variante"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      }
                    />
                  </span>
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={openNew}>
              <Plus /> Aggiungi variante
            </Button>
          </>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft.id ? 'Modifica variante' : 'Nuova variante'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Attributi</Label>
              {draft.attrs.map((a, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    aria-label={`Nome attributo ${i + 1}`}
                    placeholder="colore"
                    value={a.key}
                    onChange={(e) => setAttr(i, { key: e.target.value })}
                    className="w-1/3"
                  />
                  <Input
                    aria-label={`Valore attributo ${i + 1}`}
                    placeholder="Rosso"
                    value={a.value}
                    onChange={(e) => setAttr(i, { value: e.target.value })}
                    className="flex-1"
                  />
                  <Button
                    type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0"
                    aria-label="Rimuovi attributo"
                    disabled={draft.attrs.length === 1}
                    onClick={() => setDraft((d) => ({ ...d, attrs: d.attrs.filter((_, j) => j !== i) }))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <Button
                type="button" variant="outline" size="sm"
                onClick={() => setDraft((d) => ({ ...d, attrs: [...d.attrs, { key: '', value: '' }] }))}
              >
                <Plus /> Aggiungi attributo
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="variant-sku">SKU</Label>
                <Input
                  id="variant-sku" placeholder="es. ABC-ROSSO-M"
                  value={draft.sku} onChange={(e) => setDraft((d) => ({ ...d, sku: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="variant-stock">Scorte</Label>
                <Input
                  id="variant-stock" type="number" min={0}
                  value={draft.stock} onChange={(e) => setDraft((d) => ({ ...d, stock: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="variant-price">Prezzo (€)</Label>
                <Input
                  id="variant-price" type="number" min={0} step="0.01" placeholder="Come il prodotto"
                  value={draft.price} onChange={(e) => setDraft((d) => ({ ...d, price: e.target.value }))}
                />
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox" className="h-4 w-4"
                    checked={draft.attivo}
                    onChange={(e) => setDraft((d) => ({ ...d, attivo: e.target.checked }))}
                  />
                  Variante attiva
                </label>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Lascia il prezzo vuoto per usare quello del prodotto.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Annulla</Button>
            <Button type="button" onClick={save} disabled={busy}>
              {busy && <Loader2 className="animate-spin" />} Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
