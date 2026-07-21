import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAllProducts } from '@/hooks/queries';
import { api } from '@/lib/api';
import { eur } from '@/lib/format';
import { toast } from 'sonner';

interface ItemRow {
  product_id: string; // must match products.id — name & price are resolved server-side
  taglia: string;
  qty: number;
}

/** Shared class for native <select>/<textarea> so they match the shadcn <Input>. */
const FIELD =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

const newRow = (): ItemRow => ({ product_id: '', taglia: '', qty: 1 });

/**
 * Create a manual order from the admin panel → POST /api/admin/orders.
 *
 * The admin only picks product_id + qty (+ optional taglia); the backend re-resolves
 * name and price from the catalog, so line prices can't be faked. If payment_status is
 * set to "pagato", the backend auto-emits an invoice (see invoicing.js).
 */
export function OrderFormPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const productsQ = useAllProducts();
  const products = productsQ.data?.items ?? [];
  const priceOf = (pid: string) => Number(products.find((p) => String(p.id) === String(pid))?.price ?? 0) || 0;

  const [nome, setNome] = useState('');
  const [cognome, setCognome] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [indirizzo, setIndirizzo] = useState('');
  const [citta, setCitta] = useState('');
  const [cap, setCap] = useState('');
  const [paese, setPaese] = useState('Italia');
  const [shippingCost, setShippingCost] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('carta');
  const [paymentStatus, setPaymentStatus] = useState('in_attesa');
  const [items, setItems] = useState<ItemRow[]>([newRow()]);
  const [busy, setBusy] = useState(false);

  const subtotal = items.reduce((n, it) => n + priceOf(it.product_id) * (Number(it.qty) || 0), 0);
  const total = Math.max(0, subtotal + (Number(shippingCost) || 0));

  const patchItem = (i: number, patch: Partial<ItemRow>) =>
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const addRow = () => setItems((prev) => [...prev, newRow()]);
  const removeRow = (i: number) => setItems((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim() || !email.trim()) {
      toast.error('Nome ed email sono obbligatori');
      return;
    }
    const rows = items
      .filter((it) => it.product_id && (Number(it.qty) || 0) > 0)
      .map((it) => ({ product_id: it.product_id, taglia: it.taglia.trim() || null, qty: Number(it.qty) || 1 }));
    if (!rows.length) {
      toast.error('Aggiungi almeno un prodotto dal catalogo');
      return;
    }
    setBusy(true);
    try {
      const res = await api.orders.create({
        nome: nome.trim(),
        cognome: cognome.trim(),
        email: email.trim(),
        telefono: telefono.trim() || undefined,
        indirizzo: indirizzo.trim() || undefined,
        citta: citta.trim() || undefined,
        cap: cap.trim() || undefined,
        paese: paese.trim() || 'Italia',
        items: rows,
        shipping_cost: Number(shippingCost) || 0,
        payment_method: paymentMethod,
        payment_status: paymentStatus,
      });
      toast.success(`Ordine ${res.order_number} creato`);
      qc.invalidateQueries({ queryKey: ['orders'] });
      navigate('/orders');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Creazione ordine non riuscita');
      setBusy(false);
    }
  }

  return (
    <div>
      <Button variant="ghost" size="sm" className="-ml-2 mb-2" onClick={() => navigate('/orders')}>
        <ArrowLeft /> Ordini
      </Button>
      <PageHeader title="Nuovo ordine" subtitle="Crea manualmente un ordine (es. vendita telefonica o in negozio)." />

      <form onSubmit={submit}>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Main: line items */}
          <div className="space-y-6 lg:col-span-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Righe prodotto</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="hidden gap-2 border-b px-1 pb-2 text-xs font-medium text-muted-foreground sm:flex">
                  <span className="flex-1">Prodotto</span>
                  <span className="w-20">Taglia</span>
                  <span className="w-16 text-right">Qtà</span>
                  <span className="w-24 text-right">Prezzo</span>
                  <span className="w-24 text-right">Subtot.</span>
                  <span className="w-8" />
                </div>
                <div className="space-y-2 pt-2">
                  {items.map((it, i) => (
                    <div
                      key={i}
                      className="flex flex-col gap-2 border-b pb-2 sm:flex-row sm:items-center sm:border-0 sm:pb-0"
                    >
                      <select
                        className={FIELD + ' flex-1'}
                        value={it.product_id}
                        onChange={(e) => patchItem(i, { product_id: e.target.value })}
                      >
                        <option value="">Seleziona prodotto…</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <Input
                        className="w-20"
                        placeholder="opz."
                        value={it.taglia}
                        onChange={(e) => patchItem(i, { taglia: e.target.value })}
                      />
                      <Input
                        type="number"
                        min={1}
                        className="w-16 text-right"
                        value={String(it.qty)}
                        onChange={(e) => patchItem(i, { qty: Math.max(0, Number(e.target.value) || 0) })}
                      />
                      <span className="w-24 text-right text-sm text-muted-foreground">{eur(priceOf(it.product_id))}</span>
                      <span className="w-24 text-right text-sm font-semibold">
                        {eur(priceOf(it.product_id) * (Number(it.qty) || 0))}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeRow(i)}
                        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive"
                        aria-label="Rimuovi riga"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <Button type="button" variant="outline" size="sm" className="mt-3" onClick={addRow}>
                  <Plus /> Aggiungi riga
                </Button>
                <div className="mt-4 space-y-1 border-t pt-3 text-sm">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Subtotale</span>
                    <span>{eur(subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Spedizione</span>
                    <span>{eur(Number(shippingCost) || 0)}</span>
                  </div>
                  <div className="flex items-center justify-between pt-1 text-base font-semibold text-foreground">
                    <span>Totale</span>
                    <span>{eur(total)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Side: customer + shipping + payment */}
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Cliente</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Nome *</Label>
                    <Input value={nome} onChange={(e) => setNome(e.target.value)} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Cognome</Label>
                    <Input value={cognome} onChange={(e) => setCognome(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Email *</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label>Telefono</Label>
                  <Input value={telefono} onChange={(e) => setTelefono(e.target.value)} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Spedizione</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Indirizzo</Label>
                  <Input value={indirizzo} onChange={(e) => setIndirizzo(e.target.value)} placeholder="Via Roma, 12" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Città</Label>
                    <Input value={citta} onChange={(e) => setCitta(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>CAP</Label>
                    <Input value={cap} onChange={(e) => setCap(e.target.value)} inputMode="numeric" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Paese</Label>
                    <Input value={paese} onChange={(e) => setPaese(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Spedizione €</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={String(shippingCost)}
                      onChange={(e) => setShippingCost(Math.max(0, Number(e.target.value) || 0))}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Pagamento</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Metodo</Label>
                  <select className={FIELD} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                    <option value="carta">Carta</option>
                    <option value="paypal">PayPal</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Stato pagamento</Label>
                  <select className={FIELD} value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}>
                    <option value="in_attesa">Non pagato</option>
                    <option value="pagato">Pagato (emette fattura)</option>
                  </select>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-2">
          <Button type="submit" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />} Crea ordine
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate('/orders')} disabled={busy}>
            Annulla
          </Button>
        </div>
      </form>
    </div>
  );
}
