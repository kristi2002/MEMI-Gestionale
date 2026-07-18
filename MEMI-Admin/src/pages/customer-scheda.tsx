import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Pencil } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { eur, date, num } from '@/lib/format';

type OrderLite = { order_number: string; total: number | string; payment_status: string; order_status: string; created_at: string };
type AddressLite = { id: number; label?: string | null; indirizzo?: string | null; citta?: string | null; cap?: string | null; paese?: string | null; telefono?: string | null; is_default?: number | boolean };
type CustomerDetail = {
  id: number;
  email?: string;
  nome?: string;
  cognome?: string;
  telefono?: string | null;
  indirizzo?: string | null;
  citta?: string | null;
  cap?: string | null;
  paese?: string | null;
  points?: number;
  total_orders?: number;
  total_spent?: number | string;
  created_at?: string;
  last_login?: string | null;
  wishlist?: unknown[];
  sizes?: Record<string, unknown>;
  lang?: string;
  orders?: OrderLite[];
  addresses?: AddressLite[];
  newsletter?: { subscribed: boolean; frequenza?: string; topics?: string[] } | null;
};

/** A labelled read-only field — the display twin of an input row. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm">{children ?? <span className="text-muted-foreground">—</span>}</div>
    </div>
  );
}

/**
 * Read-only "scheda cliente" — surfaces the full customer record the detail
 * endpoint already returns (order history, saved addresses, loyalty points,
 * newsletter status) that the edit form discards. A Modifica button jumps to
 * the editable form.
 */
export function CustomerSchedaPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ['customers', 'detail', id],
    queryFn: () => api.customers.get(Number(id)) as Promise<CustomerDetail>,
    enabled: id != null,
  });
  const c = q.data;
  const fullName = `${c?.nome ?? ''} ${c?.cognome ?? ''}`.trim();
  const orders = c?.orders ?? [];
  const addresses = c?.addresses ?? [];
  const addressLine = [c?.indirizzo, [c?.cap, c?.citta].filter(Boolean).join(' '), c?.paese].filter(Boolean).join(', ');

  return (
    <div>
      <Button variant="ghost" size="sm" className="-ml-2 mb-2" onClick={() => navigate('/customers')}>
        <ArrowLeft /> Clienti
      </Button>
      <PageHeader
        title={q.isLoading ? 'Scheda cliente' : fullName || c?.email || 'Scheda cliente'}
        subtitle="Scheda cliente — sola lettura. Usa Modifica per cambiare i dati."
        actions={
          <Button size="sm" onClick={() => navigate(`/customers/${id}/edit`)}>
            <Pencil /> Modifica
          </Button>
        }
      />

      {q.isLoading || !c ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Main column */}
          <div className="space-y-6 lg:col-span-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Anagrafica</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Nome">{c.nome}</Field>
                  <Field label="Cognome">{c.cognome}</Field>
                  <Field label="Email">{c.email}</Field>
                  <Field label="Telefono">{c.telefono}</Field>
                  <Field label="Indirizzo (predefinito)">{addressLine || null}</Field>
                  <Field label="Lingua">{c.lang}</Field>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Ordini ({orders.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {orders.length > 0 ? (
                  <div className="overflow-hidden rounded-md border">
                    <div className="flex items-center gap-3 border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
                      <span className="flex-1">Ordine</span>
                      <span className="w-28">Data</span>
                      <span className="w-24">Stato</span>
                      <span className="w-24 text-right">Totale</span>
                    </div>
                    {orders.map((o) => (
                      <div key={o.order_number} className="flex items-center gap-3 border-b px-3 py-2 last:border-b-0">
                        <span className="flex-1 font-medium">{o.order_number}</span>
                        <span className="w-28 text-muted-foreground">{date(o.created_at)}</span>
                        <span className="w-24"><StatusBadge code={o.order_status} /></span>
                        <span className="w-24 text-right font-semibold">{eur(o.total)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Nessun ordine.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Indirizzi salvati ({addresses.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {addresses.length > 0 ? (
                  <div className="space-y-2">
                    {addresses.map((a) => (
                      <div key={a.id} className="rounded-md border px-3 py-2 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{a.label || 'Indirizzo'}</span>
                          {(a.is_default === 1 || a.is_default === true) && <Badge variant="secondary">Predefinito</Badge>}
                        </div>
                        <div className="text-muted-foreground">
                          {[a.indirizzo, [a.cap, a.citta].filter(Boolean).join(' '), a.paese].filter(Boolean).join(', ') || '—'}
                          {a.telefono ? ` · ${a.telefono}` : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Nessun indirizzo salvato nell'Area Personale.</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Side column */}
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Statistiche</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Field label="Ordini totali">{c.total_orders ?? 0}</Field>
                <Field label="Totale speso">
                  <span className="font-semibold">{eur(num(c.total_spent))}</span>
                  {num(c.total_spent) > 300 && <Badge variant="warning" className="ml-2">VIP</Badge>}
                </Field>
                <Field label="Punti fedeltà">{c.points ?? 0}</Field>
                <Field label="Ultimo accesso">{c.last_login ? date(c.last_login) : null}</Field>
                <Field label="Registrato il">{c.created_at ? date(c.created_at) : null}</Field>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Newsletter</CardTitle>
              </CardHeader>
              <CardContent>
                {c.newsletter ? (
                  <div className="space-y-2">
                    <Badge variant={c.newsletter.subscribed ? 'success' : 'neutral'}>
                      {c.newsletter.subscribed ? 'Iscritto' : 'Disiscritto'}
                    </Badge>
                    {c.newsletter.frequenza && <div className="text-xs text-muted-foreground">Frequenza: {c.newsletter.frequenza}</div>}
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">Non iscritto</span>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Preferenze</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Field label="Wishlist">{(c.wishlist?.length ?? 0) + ' articoli'}</Field>
                <Field label="Taglie salvate">
                  {c.sizes && Object.keys(c.sizes).length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(c.sizes).map(([k, v]) => (
                        <Badge key={k} variant="secondary">{k}: {String(v)}</Badge>
                      ))}
                    </div>
                  ) : null}
                </Field>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
