import { Plug, CheckCircle2, XCircle } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/common/empty-state';
import { useIntegrations } from '@/hooks/queries';

export function IntegrationsPage() {
  const query = useIntegrations();
  const rows = query.data?.integrations ?? [];

  return (
    <div>
      <PageHeader title="Integrazioni" subtitle="Servizi collegati al gestionale." />

      {query.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState icon={Plug} title="Nessuna integrazione" />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((it) => (
            <Card key={it.key}>
              <CardContent className="flex items-start gap-4 pt-5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-2xl">
                  {it.icona || '🔌'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{it.nome}</span>
                    {it.connesso ? (
                      <Badge variant="success">
                        <CheckCircle2 className="mr-1 h-3 w-3" /> Connesso
                      </Badge>
                    ) : (
                      <Badge variant="neutral">
                        <XCircle className="mr-1 h-3 w-3" /> Non connesso
                      </Badge>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs uppercase tracking-wide text-muted-foreground">{it.categoria}</div>
                  <p className="mt-2 text-sm text-muted-foreground">{it.dettaglio}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
