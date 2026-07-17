import { useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
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
import { Label } from '@/components/ui/label';
import { useCouriers } from '@/hooks/queries';
import { api } from '@/lib/api';
import type { OrderRow } from '@/types';
import { toast } from 'sonner';

/**
 * Assign a courier + tracking number to an order (#4). Calls
 * PUT /orders/admin/:id/ship, which flips the order to 'spedito', upserts the
 * shipment row (so the Spedizioni page is populated) and emails the customer.
 */
export function ShipOrderDialog({ order, trigger }: { order: OrderRow; trigger: ReactNode }) {
  const qc = useQueryClient();
  const couriersQ = useCouriers();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [courier, setCourier] = useState(order.courier_code ?? '');
  const [tracking, setTracking] = useState(order.tracking_number ?? '');
  const [eta, setEta] = useState('');

  const couriers = (couriersQ.data ?? []).filter((c) => c.attivo);

  async function submit() {
    if (!courier || !tracking.trim()) {
      toast.error('Seleziona un corriere e inserisci il tracking');
      return;
    }
    setBusy(true);
    try {
      await api.orders.ship(order.id, { courier_code: courier, tracking_number: tracking.trim(), eta: eta || undefined });
      toast.success(`Ordine ${order.order_number} segnato come spedito`);
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['shipments'] });
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Spedizione non riuscita');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Spedisci ordine {order.order_number}</DialogTitle>
            <DialogDescription>
              Assegna corriere e tracking. Il cliente riceve l'email di spedizione e l'ordine passa a "spedito".
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ship-courier">Corriere</Label>
              <select
                id="ship-courier"
                value={courier}
                onChange={(e) => setCourier(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Seleziona corriere…</option>
                {couriers.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.nome}
                  </option>
                ))}
              </select>
              {couriersQ.isLoading && <p className="text-xs text-muted-foreground">Caricamento corrieri…</p>}
              {!couriersQ.isLoading && couriers.length === 0 && (
                <p className="text-xs text-muted-foreground">Nessun corriere attivo — creane uno in Spedizioni → Corrieri.</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ship-tracking">Numero di tracking</Label>
              <Input id="ship-tracking" value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="es. 1Z999…" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ship-eta">Consegna stimata (facoltativa)</Label>
              <Input id="ship-eta" type="date" value={eta} onChange={(e) => setEta(e.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Annulla
            </Button>
            <Button onClick={submit} disabled={busy}>
              {busy && <Loader2 className="animate-spin" />} Conferma spedizione
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
