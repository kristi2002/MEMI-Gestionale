import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Mail, MailX, CalendarClock, Loader2, Gift, Cake, RotateCcw, Star, Sparkles,
  Pencil, Plus, Trash2, Zap, Power,
} from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import type { FieldConfig, FormValues } from '@/components/common/entity-form-fields';
import { EntityFormPage } from '@/components/common/entity-form-page';
import { useLifecycle, useAutomations, useDeleteMany, useUpdateOne } from '@/hooks/queries';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { toast } from 'sonner';

const ICONS: Record<string, typeof Gift> = {
  birthday: Cake,
  winback: RotateCcw,
  points_reminder: Star,
  anniversary: Gift,
  new_season: Sparkles,
};

/**
 * Per-campaign tunable settings (subset of the lifecycle_* store_settings keys),
 * grouped by campaign so each has its own editor instead of one raw key dump.
 */
const CAMPAIGN_SETTINGS: Record<string, { key: string; label: string; help?: string }[]> = {
  birthday: [
    { key: 'lifecycle_birthday_pct', label: 'Sconto compleanno (%)', help: 'Percentuale del codice regalo.' },
    { key: 'lifecycle_birthday_days', label: 'Validità codice (giorni)' },
  ],
  winback: [
    { key: 'lifecycle_winback_days', label: 'Giorni di inattività per “dormiente”', help: 'Nessun ordine da tanti giorni → email.' },
    { key: 'lifecycle_winback_pct', label: 'Sconto win-back (%)' },
  ],
  anniversary: [
    { key: 'lifecycle_anniversary_pct', label: 'Sconto anniversario (%)' },
  ],
  points_reminder: [
    { key: 'lifecycle_points_idle_days', label: 'Giorni di inattività prima del promemoria' },
  ],
};

export function LifecyclePage() {
  const query = useLifecycle();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [running, setRunning] = useState(false);

  const automationsQ = useAutomations();
  const customEmails = automationsQ.data?.automations ?? [];
  const delAutomation = useDeleteMany<number>((id) => api.automations.delete(id), 'automations');
  const toggleAutomation = useUpdateOne<number>((id, data) => api.automations.update(id, data), 'automations');

  const data = query.data;
  const sentByType = new Map((data?.recent ?? []).map((r) => [r.type, r]));

  async function runNow() {
    setRunning(true);
    try {
      await api.lifecycle.run({ dryRun: true });
      toast.success('Simulazione (dry-run) completata');
      qc.invalidateQueries({ queryKey: ['lifecycle'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Esecuzione non riuscita');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Email automatiche"
        subtitle="Campagne lifecycle programmate ed email automatiche personalizzate."
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

      {/* Built-in scheduled campaigns */}
      <h2 className="mb-2 mt-2 text-sm font-semibold text-muted-foreground">Campagne programmate</h2>
      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        {query.isLoading ? (
          <p className="text-sm text-muted-foreground">Caricamento…</p>
        ) : (
          (data?.campaigns ?? []).map((c) => {
            const Icon = ICONS[c.type] ?? Mail;
            const recent = sentByType.get(c.type);
            const editable = !!CAMPAIGN_SETTINGS[c.type];
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
                    {recent && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {recent.sent} inviate · {dateTime(recent.last_sent)}
                      </p>
                    )}
                  </div>
                  {editable ? (
                    <Button variant="ghost" size="sm" onClick={() => navigate(`/lifecycle/${c.type}/edit`)}>
                      <Pencil /> Modifica
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">Broadcast manuale</span>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Custom automated emails (full CRUD) */}
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">Email personalizzate</h2>
        <Button size="sm" onClick={() => navigate('/automations/new')}>
          <Plus /> Nuova email automatica
        </Button>
      </div>
      <Card>
        <CardContent className="p-0">
          {automationsQ.isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Caricamento…</p>
          ) : customEmails.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Zap className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Nessuna email automatica personalizzata.</p>
            </div>
          ) : (
            <ul className="divide-y">
              {customEmails.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{a.nome}</span>
                      {a.attivo ? <Badge variant="success">Attiva</Badge> : <Badge variant="neutral">Off</Badge>}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      Quando <b>{a.trigger_event.replace(/_/g, ' ')}</b> → {a.azione.replace(/_/g, ' ')}
                      {a.run_count ? ` · ${a.run_count}× eseguita` : ''}
                    </p>
                  </div>
                  <Button
                    variant={a.attivo ? 'secondary' : 'outline'}
                    size="sm"
                    className="h-8"
                    onClick={() => toggleAutomation.mutate({ id: a.id, data: { attivo: a.attivo ? 0 : 1 } })}
                  >
                    <Power className={a.attivo ? 'text-success' : 'text-muted-foreground'} />
                    {a.attivo ? 'Attiva' : 'Off'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => navigate(`/automations/${a.id}/edit`)}>
                    <Pencil /> Modifica
                  </Button>
                  <ConfirmDialog
                    title={`Eliminare "${a.nome}"?`}
                    description="L’email automatica verrà rimossa."
                    confirmLabel="Elimina"
                    destructive
                    onConfirm={async () => {
                      await delAutomation.mutateAsync([a.id]);
                      toast.success('Eliminata');
                    }}
                    trigger={
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" aria-label="Elimina">
                        <Trash2 />
                      </Button>
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Per-campaign settings editor (birthday / winback / anniversary / points_reminder). */
export function LifecycleCampaignFormPage() {
  const { type } = useParams<{ type: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const query = useLifecycle();
  const settingDefs = (type && CAMPAIGN_SETTINGS[type]) || [];
  const campaign = (query.data?.campaigns ?? []).find((c) => c.type === type);

  const fields = useMemo<FieldConfig[]>(
    () => settingDefs.map((s) => ({ name: s.key, label: s.label, type: 'number', help: s.help, wide: true })),
    [settingDefs],
  );

  const initial = useMemo<FormValues>(() => {
    const s = query.data?.settings ?? {};
    const v: FormValues = {};
    settingDefs.forEach((d) => { v[d.key] = s[d.key] != null ? Number(s[d.key]) : ''; });
    return v;
  }, [query.data, settingDefs]);

  // Unknown campaign type → back to the list.
  const unknownType = !!type && !CAMPAIGN_SETTINGS[type];
  useEffect(() => {
    if (unknownType) navigate('/lifecycle', { replace: true });
  }, [unknownType, navigate]);

  return (
    <EntityFormPage
      title={`Modifica campagna${campaign ? `: ${campaign.label}` : ''}`}
      subtitle={campaign?.description}
      backPath="/lifecycle"
      backLabel="Email automatiche"
      mainTitle="Impostazioni campagna"
      fields={fields}
      initial={initial}
      loading={query.isLoading}
      submitLabel="Salva impostazioni"
      onSubmit={async (v) => {
        const payload: Record<string, string> = {};
        settingDefs.forEach((d) => {
          if (v[d.key] !== '' && v[d.key] != null) payload[d.key] = String(v[d.key]);
        });
        await api.lifecycle.settings(payload);
        qc.invalidateQueries({ queryKey: ['lifecycle'] });
        toast.success('Impostazioni salvate');
      }}
    />
  );
}
