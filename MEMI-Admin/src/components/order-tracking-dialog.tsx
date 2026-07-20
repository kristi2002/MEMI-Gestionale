import { useState, type ReactNode } from 'react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { Loader2, Truck, MapPin, CheckCircle2, Ban, RefreshCw, Mail, PackageCheck } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/common/status-badge';
import { useCouriers } from '@/hooks/queries';
import { api } from '@/lib/api';
import { statusLabel } from '@/lib/status';
import { dateTime } from '@/lib/format';
import type { OrderRow } from '@/types';
import { toast } from 'sonner';

type TrackEvent = { label: string; at: string | null };

/** Which modal a given order state gets. */
type Phase = 'prepare' | 'shipped' | 'delivered' | 'cancelled';
function phaseFor(status: string): Phase {
  if (status === 'spedito') return 'shipped';
  if (status === 'consegnato') return 'delivered';
  if (status === 'annullato') return 'cancelled';
  return 'prepare'; // in_attesa, in_preparazione
}

/**
 * Order tracking modal — a different dialog per order state (#2):
 *  • prepare (in_attesa / in_preparazione) → assign courier + tracking, ship.
 *  • shipped (spedito) → live tracking: refresh events, resend email, mark delivered.
 *  • delivered (consegnato) → read-only recap + resend confirmation.
 *  • cancelled (annullato) → read-only cancelled notice.
 */
export function OrderTrackingDialog({ order, trigger }: { order: OrderRow; trigger: ReactNode }) {
  const qc = useQueryClient();
  const phase = phaseFor(order.order_status);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // prepare-phase form
  const couriersQ = useCouriers();
  const couriers = (couriersQ.data ?? []).filter((c) => c.attivo);
  const [courier, setCourier] = useState(order.courier_code ?? '');
  const [tracking, setTracking] = useState(order.tracking_number ?? '');
  const [eta, setEta] = useState('');

  // shipped-phase tracking events
  const [events, setEvents] = useState<TrackEvent[] | null>(null);

  // Full detail (lazy — only when the dialog opens) surfaces the chosen pickup point.
  const detailQ = useQuery({ queryKey: ['order-detail', order.id], queryFn: () => api.orders.get(order.id), enabled: open });
  const pickup = detailQ.data?.pickup_point ?? null;
  const pickupBanner = pickup ? (
    <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div>
        <div className="font-medium">Ritiro in negozio: {pickup.nome}</div>
        <div className="text-xs text-muted-foreground">{pickup.indirizzo}{pickup.orari ? ` · ${pickup.orari}` : ''}</div>
      </div>
    </div>
  ) : null;

  // Timeline: the persisted event history shows on open; a live "Aggiorna" overrides it.
  const persistedEvents = (detailQ.data?.tracking_events ?? []).map((e) => ({ label: e.label, at: e.event_at }));
  const timeline: TrackEvent[] = events ?? persistedEvents;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['orders'] });
    qc.invalidateQueries({ queryKey: ['shipments'] });
  };

  async function ship() {
    if (!courier || !tracking.trim()) {
      toast.error('Seleziona un corriere e inserisci il tracking');
      return;
    }
    setBusy(true);
    try {
      await api.orders.ship(order.id, { courier_code: courier, tracking_number: tracking.trim(), eta: eta || undefined });
      toast.success(`Ordine ${order.order_number} segnato come spedito`);
      invalidate();
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Spedizione non riuscita');
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    setBusy(true);
    try {
      const r = await api.orders.refreshTracking(order.id);
      setEvents(r.events || []);
      toast.success(`Stato aggiornato: ${statusLabel(r.status)}${r.simulated ? ' (simulato)' : ''}`);
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Aggiornamento non riuscito');
    } finally {
      setBusy(false);
    }
  }

  async function resendEmail() {
    setBusy(true);
    try {
      const r = await api.orders.sendTracking(order.id);
      toast.success(`Email tracking inviata a ${r.sent_to}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Invio non riuscito');
    } finally {
      setBusy(false);
    }
  }

  async function markDelivered() {
    setBusy(true);
    try {
      await api.orders.updateStatus(order.id, { order_status: 'consegnato' });
      toast.success(`Ordine ${order.order_number} segnato come consegnato`);
      invalidate();
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Aggiornamento non riuscito');
    } finally {
      setBusy(false);
    }
  }

  const shipInfo = (
    <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
      <div className="flex items-center justify-between py-0.5">
        <span className="text-muted-foreground">Corriere</span>
        <span className="font-medium">{(order.courier_code || '—').toUpperCase()}</span>
      </div>
      <div className="flex items-center justify-between py-0.5">
        <span className="text-muted-foreground">Tracking</span>
        <span className="font-mono text-xs">{order.tracking_number || '—'}</span>
      </div>
      <div className="flex items-center justify-between py-0.5">
        <span className="text-muted-foreground">Destinazione</span>
        <span className="font-medium">{order.shipping_citta} ({order.shipping_cap})</span>
      </div>
    </div>
  );

  return (
    <>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          {/* ── PREPARE ── */}
          {phase === 'prepare' && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {pickup ? <MapPin className="h-5 w-5 text-muted-foreground" /> : <Truck className="h-5 w-5 text-muted-foreground" />}
                  {pickup ? 'Ritiro in negozio' : 'Prepara spedizione'} — {order.order_number}
                </DialogTitle>
                <DialogDescription>
                  Stato attuale: <StatusBadge code={order.order_status} />.{' '}
                  {pickup
                    ? 'Nessuna spedizione: il cliente ritira in sede. Segnalo come ritirato quando lo ritira.'
                    : 'Assegna corriere e tracking; il cliente riceve l’email e l’ordine passa a "spedito".'}
                </DialogDescription>
              </DialogHeader>
              {pickup ? (
                <>
                  <div className="space-y-3">
                    {pickupBanner}
                    <p className="text-sm text-muted-foreground">Ordine con ritiro in negozio — non serve assegnare un corriere.</p>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Chiudi</Button>
                    <Button onClick={markDelivered} disabled={busy}>
                      {busy ? <Loader2 className="animate-spin" /> : <PackageCheck />} Segna ritirato
                    </Button>
                  </DialogFooter>
                </>
              ) : (
                <>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="track-courier">Corriere</Label>
                      <select
                        id="track-courier"
                        value={courier}
                        onChange={(e) => setCourier(e.target.value)}
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        <option value="">Seleziona corriere…</option>
                        {couriers.map((c) => (
                          <option key={c.code} value={c.code}>{c.nome}</option>
                        ))}
                      </select>
                      {!couriersQ.isLoading && couriers.length === 0 && (
                        <p className="text-xs text-muted-foreground">Nessun corriere attivo — creane uno in Spedizioni → Corrieri.</p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="track-number">Numero di tracking</Label>
                      <Input id="track-number" value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="es. 1Z999…" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="track-eta">Consegna stimata (facoltativa)</Label>
                      <DatePicker id="track-eta" value={eta} onChange={setEta} />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Annulla</Button>
                    <Button onClick={ship} disabled={busy}>
                      {busy && <Loader2 className="animate-spin" />} Conferma spedizione
                    </Button>
                  </DialogFooter>
                </>
              )}
            </>
          )}

          {/* ── SHIPPED ── */}
          {phase === 'shipped' && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-muted-foreground" /> Tracciamento — {order.order_number}
                </DialogTitle>
                <DialogDescription>
                  Ordine spedito. Aggiorna lo stato dal corriere, reinvia l'email o segna come consegnato.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                {pickupBanner}
                {shipInfo}
                {timeline.length > 0 && (
                  <div className="rounded-md border">
                    {timeline.map((ev, i) => (
                      <div key={i} className="flex items-center justify-between border-b px-3 py-2 text-sm last:border-b-0">
                        <span className="font-medium">{ev.label}</span>
                        <span className="text-xs text-muted-foreground">{ev.at ? dateTime(ev.at) : '—'}</span>
                      </div>
                    ))}
                  </div>
                )}
                {events && events.length === 0 && (
                  <p className="rounded-md border px-3 py-3 text-sm text-muted-foreground">Nessun evento di tracciamento disponibile.</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={refresh} disabled={busy}>
                    <RefreshCw /> Aggiorna tracking
                  </Button>
                  <Button variant="outline" size="sm" onClick={resendEmail} disabled={busy}>
                    <Mail /> Reinvia email
                  </Button>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Chiudi</Button>
                <Button onClick={markDelivered} disabled={busy}>
                  {busy ? <Loader2 className="animate-spin" /> : <PackageCheck />} Segna consegnato
                </Button>
              </DialogFooter>
            </>
          )}

          {/* ── DELIVERED ── */}
          {phase === 'delivered' && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-success" /> Ordine consegnato — {order.order_number}
                </DialogTitle>
                <DialogDescription>
                  Consegna completata. Puoi reinviare al cliente l'email di conferma con il tracking.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">{pickupBanner}{shipInfo}</div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Chiudi</Button>
                <Button variant="secondary" onClick={resendEmail} disabled={busy}>
                  {busy ? <Loader2 className="animate-spin" /> : <Mail />} Reinvia email
                </Button>
              </DialogFooter>
            </>
          )}

          {/* ── CANCELLED ── */}
          {phase === 'cancelled' && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Ban className="h-5 w-5 text-destructive" /> Ordine annullato — {order.order_number}
                </DialogTitle>
                <DialogDescription>
                  Questo ordine è stato annullato. Stock, gift card e punti fedeltà sono stati ripristinati dal backend. Nessuna spedizione è possibile.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">{pickupBanner}{shipInfo}</div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Chiudi</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
