import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Printer, Trash2, Ban, CheckCircle2, Truck, MapPin, PackageCheck,
  Loader2, FileDown, FileText, StickyNote, CreditCard, User, Package,
} from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/common/status-badge';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { OrderTrackingDialog } from '@/components/order-tracking-dialog';
import { api } from '@/lib/api';
import { eur, num, date, dateTime } from '@/lib/format';
import { statusLabel } from '@/lib/status';
import { toast } from 'sonner';

/** Label + value row used throughout the side panel. */
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-right font-medium">{value ?? '—'}</span>
    </div>
  );
}

function AddressBlock({ lines }: { lines: (string | null | undefined)[] }) {
  const clean = lines.map((l) => (l ?? '').trim()).filter(Boolean);
  if (!clean.length) return <p className="text-sm text-muted-foreground">—</p>;
  return (
    <address className="space-y-0.5 text-sm not-italic">
      {clean.map((l, i) => <div key={i}>{l}</div>)}
    </address>
  );
}

/**
 * Order detail ("scheda ordine") — the operational page for a single order.
 *
 * Reads GET /orders/admin/:id, which already returns items, shipment, pickup point
 * and the persisted tracking timeline; the list view only ever showed the summary row.
 * Fulfilment reuses the same OrderTrackingDialog as the list so ship / tracking /
 * delivered behaviour stays in exactly one place.
 */
export function OrderSchedaPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [noteDirty, setNoteDirty] = useState(false);

  const q = useQuery({
    queryKey: ['order-detail', Number(id)],
    queryFn: () => api.orders.get(Number(id)),
    enabled: id != null,
  });
  const o = q.data;

  // The invoice (if any) lives in a separate table keyed by order_id — surface its
  // PDF here so fulfilment doesn't require a detour through the Fatture view.
  const invoicesQ = useQuery({ queryKey: ['invoices'], queryFn: () => api.invoices.list() });
  const invoice = invoicesQ.data?.invoices?.find((i) => Number(i.order_id) === Number(id));

  useEffect(() => {
    if (o && !noteDirty) setNote(o.notes ?? '');
  }, [o, noteDirty]);

  useEffect(() => {
    if (q.isError) {
      toast.error('Ordine non trovato');
      navigate('/orders', { replace: true });
    }
  }, [q.isError, navigate]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['order-detail', Number(id)] });
    qc.invalidateQueries({ queryKey: ['orders'] });
    qc.invalidateQueries({ queryKey: ['shipments'] });
  };

  async function setStatus(data: { order_status?: string; payment_status?: string }, okMsg: string) {
    setBusy(true);
    try {
      await api.orders.updateStatus(Number(id), data);
      toast.success(okMsg);
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Aggiornamento non riuscito');
    } finally {
      setBusy(false);
    }
  }

  async function saveNote() {
    setBusy(true);
    try {
      await api.orders.updateNotes(Number(id), note.trim() || null);
      toast.success('Nota salvata');
      setNoteDirty(false);
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Salvataggio non riuscito');
    } finally {
      setBusy(false);
    }
  }

  async function issueInvoice() {
    setBusy(true);
    try {
      const res = await api.invoices.create({ order_id: Number(id) });
      toast.success(`Fattura ${res.invoice.invoice_number} emessa`);
      qc.invalidateQueries({ queryKey: ['invoices'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Emissione non riuscita');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api.orders.delete(Number(id));
      toast.success('Ordine eliminato');
      qc.invalidateQueries({ queryKey: ['orders'] });
      navigate('/orders', { replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Eliminazione non riuscita');
      setBusy(false);
    }
  }

  if (q.isLoading || !o) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const itemsTotal = o.items.reduce((n, it) => n + num(it.price) * it.qty, 0);
  const billingSeparate = o.billing_same_as_shipping === 0;
  const shipPhase =
    o.order_status === 'spedito' ? { icon: <MapPin />, label: 'Tracking' } :
    o.order_status === 'consegnato' ? { icon: <PackageCheck />, label: 'Consegnato' } :
    o.order_status === 'annullato' ? { icon: <Ban />, label: 'Annullato' } :
    { icon: <Truck />, label: 'Spedisci' };

  return (
    <div>
      {/* print:hidden keeps navigation and buttons off the packing slip */}
      <div className="print:hidden">
        <Button variant="ghost" size="sm" className="-ml-2 mb-2" onClick={() => navigate('/orders')}>
          <ArrowLeft /> Ordini
        </Button>
      </div>

      <PageHeader
        title={`Ordine ${o.order_number}`}
        subtitle={`Ricevuto il ${dateTime(o.created_at)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <OrderTrackingDialog
              order={o}
              trigger={<Button variant="outline" size="sm">{shipPhase.icon} {shipPhase.label}</Button>}
            />
            {o.payment_status !== 'pagato' && o.order_status !== 'annullato' && (
              <Button variant="outline" size="sm" disabled={busy} onClick={() => setStatus({ payment_status: 'pagato' }, 'Ordine segnato come pagato')}>
                <CheckCircle2 /> Segna pagato
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer /> Stampa
            </Button>
            {invoice ? (
              <Button variant="outline" size="sm" asChild>
                <a href={api.invoices.pdfUrl(invoice.id)} target="_blank" rel="noreferrer">
                  <FileDown /> Fattura
                </a>
              </Button>
            ) : (
              // Invoicing is normally automatic on the first transition to 'pagato'
              // (see src/invoicing.js). This covers the cases it can't: auto_invoice
              // turned off, an order paid before the feature existed, or a manual order.
              !invoicesQ.isLoading && (
                <Button variant="outline" size="sm" disabled={busy} onClick={issueInvoice}>
                  <FileText /> Emetti fattura
                </Button>
              )
            )}
            {o.order_status !== 'annullato' && (
              <ConfirmDialog
                title="Annullare questo ordine?"
                description="Stock, gift card, sconto e punti fedeltà vengono ripristinati. Se l'ordine era pagato con carta, il rimborso parte automaticamente. L'operazione non è reversibile."
                confirmLabel="Annulla ordine"
                destructive
                onConfirm={() => setStatus({ order_status: 'annullato' }, 'Ordine annullato')}
                trigger={<Button variant="outline" size="sm"><Ban /> Annulla</Button>}
              />
            )}
            <ConfirmDialog
              title="Eliminare questo ordine?"
              description="L'ordine sparisce dal gestionale. Operazione irreversibile."
              confirmLabel="Elimina"
              destructive
              onConfirm={remove}
              trigger={<Button variant="destructive" size="sm"><Trash2 /> Elimina</Button>}
            />
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge code={o.order_status} />
        <StatusBadge code={o.payment_status} />
        {o.courier_code && <Badge variant="neutral">{o.courier_code.toUpperCase()}</Badge>}
        {o.tracking_number && <Badge variant="info" className="font-mono">{o.tracking_number}</Badge>}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ── Main column ───────────────────────────────── */}
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Package className="h-4 w-4" /> Articoli ({o.items.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="pb-2 font-medium">Prodotto</th>
                      <th className="pb-2 font-medium">Taglia</th>
                      <th className="pb-2 font-medium">Colore</th>
                      <th className="pb-2 text-right font-medium">Prezzo</th>
                      <th className="pb-2 text-right font-medium">Qtà</th>
                      <th className="pb-2 text-right font-medium">Totale</th>
                    </tr>
                  </thead>
                  <tbody>
                    {o.items.length === 0 ? (
                      <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">Nessun articolo</td></tr>
                    ) : o.items.map((it) => (
                      <tr key={it.id} className="border-b last:border-b-0">
                        <td className="py-2 pr-3">
                          <button
                            type="button"
                            className="text-left font-medium underline-offset-2 hover:underline print:no-underline"
                            onClick={() => navigate(`/products/${encodeURIComponent(it.product_id)}/scheda`)}
                          >
                            {it.product_name}
                          </button>
                          <div className="font-mono text-xs text-muted-foreground">{it.product_id}</div>
                        </td>
                        <td className="py-2 pr-3">{it.taglia || '—'}</td>
                        <td className="py-2 pr-3 capitalize">{it.colore || '—'}</td>
                        <td className="py-2 pr-3 text-right">{eur(it.price)}</td>
                        <td className="py-2 pr-3 text-right">{it.qty}</td>
                        <td className="py-2 text-right font-semibold">{eur(num(it.price) * it.qty)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 space-y-1 border-t pt-3">
                <Row label="Subtotale articoli" value={eur(o.subtotal ?? itemsTotal)} />
                {num(o.discount_amount) > 0 && (
                  <Row
                    label={`Sconto${o.discount_code ? ` (${o.discount_code})` : ''}`}
                    value={<span className="text-success">− {eur(o.discount_amount)}</span>}
                  />
                )}
                {o.gift_card_code && num(o.gift_card_amount) > 0 && (
                  <Row label={`Gift card (${o.gift_card_code})`} value={<span className="text-success">− {eur(o.gift_card_amount)}</span>} />
                )}
                <Row label="Spedizione" value={num(o.shipping_cost) === 0 ? 'Gratuita' : eur(o.shipping_cost)} />
                <div className="flex items-baseline justify-between gap-3 border-t pt-2 text-base">
                  <span className="font-semibold">Totale</span>
                  <span className="font-bold">{eur(o.total)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {(o.tracking_events?.length ?? 0) > 0 && (
            <Card className="print:hidden">
              <CardHeader><CardTitle>Tracking</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-hidden rounded-md border">
                  {o.tracking_events!.map((ev, i) => (
                    <div key={i} className="flex items-center justify-between border-b px-3 py-2 text-sm last:border-b-0">
                      <span>{ev.label}</span>
                      <span className="text-muted-foreground">{ev.event_at ? dateTime(ev.event_at) : '—'}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="print:hidden">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><StickyNote className="h-4 w-4" /> Nota interna</CardTitle>
            </CardHeader>
            <CardContent>
              <textarea
                className="flex min-h-[90px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={note}
                placeholder="Visibile solo allo staff — non viene inviata al cliente."
                onChange={(e) => { setNote(e.target.value); setNoteDirty(true); }}
              />
              <div className="mt-2 flex justify-end gap-2">
                {noteDirty && (
                  <Button variant="ghost" size="sm" onClick={() => { setNote(o.notes ?? ''); setNoteDirty(false); }}>
                    Ripristina
                  </Button>
                )}
                <Button size="sm" disabled={!noteDirty || busy} onClick={saveNote}>Salva nota</Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Side column ───────────────────────────────── */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><User className="h-4 w-4" /> Cliente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <p className="text-sm font-semibold">{`${o.customer_nome} ${o.customer_cognome}`.trim() || '—'}</p>
              <p className="break-all text-sm text-muted-foreground">{o.customer_email}</p>
              {o.customer_telefono && <p className="text-sm text-muted-foreground">{o.customer_telefono}</p>}
              {o.customer_id ? (
                <Button variant="outline" size="sm" className="mt-2 print:hidden" onClick={() => navigate(`/customers/${o.customer_id}`)}>
                  Apri scheda cliente
                </Button>
              ) : (
                <Badge variant="neutral" className="mt-2">Ordine da ospite</Badge>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Spedizione</CardTitle></CardHeader>
            <CardContent>
              {o.pickup_point ? (
                <div className="space-y-1">
                  <Badge variant="info">Ritiro in negozio</Badge>
                  <p className="text-sm font-medium">{o.pickup_point.nome}</p>
                  <p className="text-sm text-muted-foreground">{o.pickup_point.indirizzo}</p>
                  {o.pickup_point.orari && <p className="text-xs text-muted-foreground">{o.pickup_point.orari}</p>}
                </div>
              ) : (
                <AddressBlock
                  lines={[
                    `${o.customer_nome} ${o.customer_cognome}`.trim(),
                    o.shipping_address,
                    `${o.shipping_cap} ${o.shipping_citta}`.trim(),
                    o.shipping_paese,
                  ]}
                />
              )}
              {o.shipment?.eta && <p className="mt-2 text-xs text-muted-foreground">Consegna stimata: {date(o.shipment.eta)}</p>}
              {o.delivered_at && <p className="mt-1 text-xs text-muted-foreground">Consegnato il {dateTime(o.delivered_at)}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Fatturazione</CardTitle></CardHeader>
            <CardContent>
              {billingSeparate ? (
                <AddressBlock
                  lines={[
                    o.billing_nome,
                    o.billing_address,
                    `${o.billing_cap ?? ''} ${o.billing_citta ?? ''} ${o.billing_provincia ?? ''}`.trim(),
                    o.billing_paese,
                  ]}
                />
              ) : (
                <p className="text-sm text-muted-foreground">Uguale all'indirizzo di spedizione.</p>
              )}
              {(o.billing_piva || o.billing_cf || o.billing_sdi || o.billing_pec) && (
                <div className="mt-3 space-y-0.5 border-t pt-2">
                  {o.billing_piva && <Row label="P. IVA" value={o.billing_piva} />}
                  {o.billing_cf && <Row label="Cod. fiscale" value={o.billing_cf} />}
                  {o.billing_sdi && <Row label="Cod. SDI" value={o.billing_sdi} />}
                  {o.billing_pec && <Row label="PEC" value={o.billing_pec} />}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><CreditCard className="h-4 w-4" /> Pagamento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-0.5">
              <Row label="Metodo" value={<span className="capitalize">{o.payment_method || '—'}</span>} />
              <Row label="Stato" value={statusLabel(o.payment_status)} />
              {o.payment_intent_id && (
                <Row label="Riferimento" value={<span className="font-mono text-xs">{o.payment_intent_id}</span>} />
              )}
              <Row label="Totale" value={eur(o.total)} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
