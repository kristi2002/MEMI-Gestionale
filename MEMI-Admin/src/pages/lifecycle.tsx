import { useEffect, useState } from 'react';
import { Mail, MailX, CalendarClock, Save, Loader2, Gift, Cake, RotateCcw, Star, Sparkles } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useLifecycle } from '@/hooks/queries';
import { api } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { dateTime } from '@/lib/format';
import { toast } from 'sonner';

const ICONS: Record<string, typeof Gift> = {
  birthday: Cake,
  winback: RotateCcw,
  points_reminder: Star,
  anniversary: Gift,
  new_season: Sparkles,
};

export function LifecyclePage() {
  const query = useLifecycle();
  const qc = useQueryClient();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (query.data?.settings) setSettings(query.data.settings);
  }, [query.data]);

  const data = query.data;

  async function saveSettings() {
    setSaving(true);
    try {
      await api.lifecycle.settings(settings);
      toast.success('Impostazioni salvate');
      qc.invalidateQueries({ queryKey: ['lifecycle'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Salvataggio non riuscito');
    } finally {
      setSaving(false);
    }
  }
  async function runNow() {
    setRunning(true);
    try {
      await api.lifecycle.run({ dryRun: true });
      toast.success('Simulazione (dry-run) completata');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Esecuzione non riuscita');
    } finally {
      setRunning(false);
    }
  }

  const sentByType = new Map((data?.recent ?? []).map((r) => [r.type, r]));

  return (
    <div>
      <PageHeader
        title="Email automatiche"
        subtitle="Campagne lifecycle: compleanno, win-back, punti, anniversario."
        actions={
          <Button size="sm" variant="secondary" onClick={runNow} disabled={running}>
            {running ? <Loader2 className="animate-spin" /> : <CalendarClock />} Esegui ora (dry-run)
          </Button>
        }
      />

      {data && (
        <div
          className={`mb-4 flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm ${
            data.smtp ? 'border-success/30 bg-success/10 text-success' : 'border-warning/30 bg-warning/10 text-warning'
          }`}
        >
          {data.smtp ? <Mail className="h-4 w-4" /> : <MailX className="h-4 w-4" />}
          {data.smtp
            ? 'SMTP configurato — le email vengono inviate.'
            : 'SMTP non configurato — le email sono disattivate (no-op).'}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {query.isLoading ? (
            <p className="text-sm text-muted-foreground">Caricamento…</p>
          ) : (
            (data?.campaigns ?? []).map((c) => {
              const Icon = ICONS[c.type] ?? Mail;
              const recent = sentByType.get(c.type);
              return (
                <Card key={c.type}>
                  <CardContent className="flex items-center gap-4 py-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{c.label}</span>
                        {c.scheduled ? <Badge variant="success">Automatica</Badge> : <Badge variant="neutral">Manuale</Badge>}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{c.description}</p>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      {recent ? (
                        <>
                          <div className="font-semibold text-foreground">{recent.sent} inviate</div>
                          <div>{dateTime(recent.last_sent)}</div>
                        </>
                      ) : (
                        <span>30 gg: nessuna</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Impostazioni</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.keys(settings).length === 0 ? (
              <p className="text-sm text-muted-foreground">Caricamento…</p>
            ) : (
              <>
                {Object.entries(settings).map(([k, v]) => (
                  <div key={k} className="space-y-1">
                    <Label htmlFor={k} className="font-mono text-[11px]">{k.replace('lifecycle_', '')}</Label>
                    <Input id={k} value={v} onChange={(e) => setSettings((p) => ({ ...p, [k]: e.target.value }))} />
                  </div>
                ))}
                <Button onClick={saveSettings} disabled={saving} className="w-full">
                  {saving ? <Loader2 className="animate-spin" /> : <Save />} Salva
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
