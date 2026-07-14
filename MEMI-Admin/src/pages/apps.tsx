import { AppWindow, CheckCircle2, Plus } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/common/empty-state';
import { useApps } from '@/hooks/queries';

export function AppsPage() {
  const query = useApps();
  const apps = query.data?.apps ?? [];
  const installed = apps.filter((a) => a.installed).length;

  return (
    <div>
      <PageHeader title="App esterne" subtitle={`Estensioni per il tuo store — ${installed} attive.`} />

      {query.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : apps.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState icon={AppWindow} title="Nessuna app disponibile" />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {apps.map((a) => (
            <Card key={a.key}>
              <CardContent className="flex h-full flex-col pt-5">
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-2xl">{a.icona}</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{a.nome}</div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">{a.categoria}</div>
                  </div>
                </div>
                <p className="mt-3 flex-1 text-sm text-muted-foreground">{a.descrizione}</p>
                <div className="mt-3">
                  {a.installed ? (
                    <Badge variant="success">
                      <CheckCircle2 className="mr-1 h-3 w-3" /> Attiva
                    </Badge>
                  ) : (
                    <Button variant="outline" size="sm" disabled>
                      <Plus /> Non configurata
                    </Button>
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
