import { Radio, Eye, CalendarDays } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { KpiCard } from '@/components/common/kpi-card';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/common/empty-state';
import { Badge } from '@/components/ui/badge';
import { useLiveview } from '@/hooks/queries';
import { int, ago } from '@/lib/format';

export function LiveviewPage() {
  const query = useLiveview();
  const d = query.data;
  const maxViews = Math.max(1, ...(d?.top_paths ?? []).map((p) => p.views));

  return (
    <div>
      <PageHeader
        title="Live view"
        subtitle="Attività in tempo reale sullo store (aggiorna ogni 15s)."
        actions={
          <span className="inline-flex items-center gap-2 rounded-full bg-success/10 px-3 py-1 text-sm font-medium text-success">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
            </span>
            {int(d?.online ?? 0)} online ora
          </span>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Online adesso" value={int(d?.online ?? 0)} icon={Radio} tone="success" loading={query.isLoading} />
        <KpiCard label="Visite (30 min)" value={int(d?.views_30m ?? 0)} icon={Eye} tone="primary" loading={query.isLoading} />
        <KpiCard label="Visite oggi" value={int(d?.views_today ?? 0)} icon={CalendarDays} tone="info" loading={query.isLoading} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Pagine più viste</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {(d?.top_paths?.length ?? 0) === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Nessuna visita registrata</p>
            ) : (
              d!.top_paths.map((p) => (
                <div key={p.path} className="flex items-center gap-3">
                  <code className="w-40 shrink-0 truncate text-xs">{p.path || '/'}</code>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${(p.views / maxViews) * 100}%` }} />
                  </div>
                  <span className="w-10 text-right text-xs font-semibold">{p.views}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Attività recente</CardTitle>
          </CardHeader>
          <CardContent>
            {(d?.recent?.length ?? 0) === 0 ? (
              <EmptyState icon={Radio} title="Nessuna attività recente" />
            ) : (
              <div className="space-y-2">
                {d!.recent.map((e, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 text-sm">
                    <code className="truncate text-xs">{e.path || '/'}</code>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="neutral" className="font-mono text-[10px]">{(e.session_id || 'anon').slice(0, 6)}</Badge>
                      <span className="text-xs text-muted-foreground">{ago(e.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
