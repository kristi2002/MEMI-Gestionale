import { Store, Globe, Package, FileText, ShoppingCart, Share2, ExternalLink, MonitorSmartphone, CheckCircle2, XCircle } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { KpiCard } from '@/components/common/kpi-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/common/status-badge';
import { EmptyState } from '@/components/common/empty-state';
import { useOnlineStore, useSocial, usePos } from '@/hooks/queries';
import { eur, int } from '@/lib/format';

export function OnlineStorePage() {
  const query = useOnlineStore();
  const d = query.data;
  return (
    <div>
      <PageHeader
        title="Negozio online"
        subtitle="Stato e panoramica del canale e-commerce."
        actions={
          d?.domain ? (
            <Button variant="outline" size="sm" asChild>
              <a href={d.domain} target="_blank" rel="noreferrer">
                <ExternalLink /> Visita il sito
              </a>
            </Button>
          ) : undefined
        }
      />
      <div className="mb-4 flex items-center gap-3">
        <StatusBadge code={d?.status === 'online' ? 'attivo' : d?.status} />
        <span className="text-sm text-muted-foreground">{d?.name}</span>
        {d?.domain && <span className="text-sm text-muted-foreground">· {d.domain}</span>}
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Prodotti totali" value={int(d?.products.total ?? 0)} icon={Package} tone="primary" loading={query.isLoading} />
        <KpiCard label="Prodotti attivi" value={int(d?.products.active ?? 0)} icon={CheckCircle2} tone="success" loading={query.isLoading} />
        <KpiCard label="Pagine pubblicate" value={int(d?.pages_published ?? 0)} icon={FileText} tone="info" loading={query.isLoading} />
        <KpiCard label="Ordini oggi" value={int(d?.orders_today ?? 0)} icon={ShoppingCart} tone="primary" loading={query.isLoading} />
      </div>
    </div>
  );
}

export function SocialPage() {
  const query = useSocial();
  const channels = query.data?.channels ?? [];
  return (
    <div>
      <PageHeader title="Social & Marketplace" subtitle="Canali di vendita e feed prodotti." />
      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">Caricamento…</p>
      ) : channels.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState icon={Share2} title="Nessun canale" />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {channels.map((c) => (
            <Card key={c.key}>
              <CardContent className="flex items-start gap-4 pt-5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-2xl">{c.icona}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{c.nome}</span>
                    {c.connesso ? <Badge variant="success">Attivo</Badge> : <Badge variant="neutral">Off</Badge>}
                  </div>
                  <div className="mt-0.5 text-xs uppercase tracking-wide text-muted-foreground">{c.categoria}</div>
                  <p className="mt-2 text-sm text-muted-foreground">{c.dettaglio}</p>
                  {c.url && (
                    <a href={c.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                      Apri feed <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export function PosPage() {
  const query = usePos();
  const d = query.data;
  return (
    <div>
      <PageHeader title="Punto vendita" subtitle="Vendite in negozio (POS)." />
      <div className="mb-4 flex items-center gap-3">
        {d?.enabled ? (
          <Badge variant="success">
            <CheckCircle2 className="mr-1 h-3 w-3" /> POS attivo
          </Badge>
        ) : (
          <Badge variant="neutral">
            <XCircle className="mr-1 h-3 w-3" /> POS non attivo
          </Badge>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <KpiCard label="Ordini oggi" value={int(d?.today.orders ?? 0)} icon={ShoppingCart} tone="primary" loading={query.isLoading} />
        <KpiCard label="Incasso oggi" value={eur(d?.today.revenue ?? 0)} icon={Store} tone="success" loading={query.isLoading} />
      </div>
      {!query.isLoading && !d?.enabled && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Attiva il punto vendita</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Il canale POS non è attivo. Impostalo da <span className="font-medium text-foreground">Impostazioni</span> (chiave{' '}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">pos_enabled</code>) per registrare le vendite in negozio.
            </p>
            <div className="mt-3 flex items-center gap-2 text-muted-foreground">
              <MonitorSmartphone className="h-5 w-5" />
              <Globe className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
