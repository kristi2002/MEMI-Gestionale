import { useEffect, useMemo, useState } from 'react';
import { Save, Loader2, Search, TriangleAlert, CheckCircle2, Settings as SettingsIcon } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/common/empty-state';
import { useSettings } from '@/hooks/queries';
import { api } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { SETTING_GROUPS, KNOWN_KEYS, type SettingField } from '@/lib/settings-schema';
import type { StoreSettings } from '@/types';
import { toast } from 'sonner';

const FIELD_CLASS =
  'flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ' +
  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

/* Every control carries id={field.key} so the <Label htmlFor> above it actually
 * binds: clicking the label focuses the field and screen readers announce the pair.
 * Without it the label is decorative text. */
function SettingInput({ field, value, onChange }: {
  field: SettingField;
  value: string;
  onChange: (v: string) => void;
}) {
  if (field.type === 'boolean') {
    return (
      <select
        id={field.key}
        className={`${FIELD_CLASS} h-9`}
        value={value === '1' ? '1' : '0'}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="1">Attivo</option>
        <option value="0">Disattivo</option>
      </select>
    );
  }
  if (field.type === 'select') {
    return (
      <select
        id={field.key}
        className={`${FIELD_CLASS} h-9`}
        value={value || field.options?.[0]?.value || ''}
        onChange={(e) => onChange(e.target.value)}
      >
        {(field.options ?? []).map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    );
  }
  if (field.type === 'textarea') {
    return (
      <textarea
        id={field.key}
        className={`${FIELD_CLASS} min-h-[80px]`}
        value={value}
        placeholder={field.placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  return (
    <Input
      id={field.key}
      type={field.type === 'number' ? 'number' : field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : 'text'}
      value={value}
      placeholder={field.placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/**
 * Store settings — grouped and labelled, not a raw key/value dump.
 *
 * The "Dati aziendali e fiscali" group is the important one: those keys feed
 * GET /api/store-info, which the storefront footer and the legal pages read.
 * Until they are filled, the shop publishes a placeholder where its P. IVA
 * should be — which is why this page leads with a completeness banner.
 */
export function SettingsPage() {
  const query = useSettings();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<StoreSettings>({});
  const [filter, setFilter] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (query.data) setDraft(query.data);
  }, [query.data]);

  const value = (k: string) => String(draft[k] ?? '');
  const set = (k: string, v: string) => setDraft((p) => ({ ...p, [k]: v }));

  // A schema key with no DB row starts as '' — treat ''→absent as unchanged so an
  // untouched empty field is never written back as an empty string.
  const dirtyKeys = useMemo(() => {
    if (!query.data) return [];
    return Object.keys(draft).filter((k) => {
      const before = query.data![k];
      const after = draft[k];
      if (before == null && (after === '' || after == null)) return false;
      return before !== after;
    });
  }, [draft, query.data]);

  /* Keys present in the DB but absent from the schema — still editable, under "Avanzate". */
  const extraKeys = useMemo(
    () => Object.keys(query.data ?? {}).filter((k) => !KNOWN_KEYS.has(k)).sort(),
    [query.data],
  );

  const missingLegal = useMemo(
    () =>
      SETTING_GROUPS.flatMap((g) => g.fields)
        .filter((f) => f.legalRequired && !String(draft[f.key] ?? '').trim())
        .map((f) => f.label),
    [draft],
  );

  const matches = (f: SettingField) => {
    const q = filter.trim().toLowerCase();
    if (!q) return true;
    return f.label.toLowerCase().includes(q) || f.key.toLowerCase().includes(q);
  };

  const visibleExtras = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? extraKeys.filter((k) => k.toLowerCase().includes(q)) : extraKeys;
  }, [extraKeys, filter]);

  async function save() {
    if (!query.data) return;
    const changed: StoreSettings = {};
    for (const k of dirtyKeys) changed[k] = draft[k];
    if (!Object.keys(changed).length) return;
    setSaving(true);
    try {
      await api.settings.update(changed);
      toast.success(`${Object.keys(changed).length} impostazioni salvate`);
      qc.invalidateQueries({ queryKey: ['settings'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Salvataggio non riuscito');
    } finally {
      setSaving(false);
    }
  }

  const noMatches = SETTING_GROUPS.every((g) => !g.fields.filter(matches).length) && visibleExtras.length === 0;

  return (
    <div>
      <PageHeader
        title="Impostazioni"
        subtitle="Configurazione dello store, dati aziendali e parametri delle funzionalità."
        actions={
          <Button size="sm" onClick={save} disabled={!dirtyKeys.length || saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />}
            {dirtyKeys.length ? `Salva ${dirtyKeys.length} modifiche` : 'Salva modifiche'}
          </Button>
        }
      />

      {!query.isLoading &&
        (missingLegal.length > 0 ? (
          <div className="mb-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div>
              <p className="font-medium text-destructive">Dati aziendali incompleti — richiesti per la pubblicazione</p>
              <p className="mt-0.5 text-muted-foreground">
                Mancano: {missingLegal.join(', ')}. Finché non sono compilati, lo store mostra un avviso al posto
                dei dati legali nel footer e nelle pagine privacy, termini e cookie policy.
              </p>
            </div>
          </div>
        ) : (
          <div className="mb-4 flex items-start gap-2 rounded-md border border-success/40 bg-success/10 px-3 py-2.5 text-sm">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            <p className="text-muted-foreground">
              Dati aziendali completi: vengono pubblicati nel footer dello store e nelle pagine legali.
            </p>
          </div>
        ))}

      <div className="relative mb-4 max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtra impostazioni…" className="pl-8" />
      </div>

      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">Caricamento…</p>
      ) : noMatches ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState icon={SettingsIcon} title="Nessuna impostazione corrisponde al filtro" />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {SETTING_GROUPS.map((group) => {
            const fields = group.fields.filter(matches);
            if (!fields.length) return null;
            return (
              <Card key={group.id}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{group.title}</CardTitle>
                  {group.description && <CardDescription>{group.description}</CardDescription>}
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {fields.map((f) => (
                      <div key={f.key} className={f.type === 'textarea' ? 'space-y-1.5 sm:col-span-2' : 'space-y-1.5'}>
                        <Label htmlFor={f.key} className="flex items-center gap-2">
                          {f.label}
                          {f.legalRequired && <Badge variant="warning" className="text-[10px]">Obbligatorio</Badge>}
                        </Label>
                        <SettingInput field={f} value={value(f.key)} onChange={(v) => set(f.key, v)} />
                        {f.help && <p className="text-xs text-muted-foreground">{f.help}</p>}
                        <p className="font-mono text-[10px] text-muted-foreground/60">{f.key}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {visibleExtras.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Avanzate</CardTitle>
                <CardDescription>
                  Chiavi presenti nel database ma non ancora descritte in questa schermata. Modificale solo se sai cosa fanno.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2">
                  {visibleExtras.map((k) => (
                    <div key={k} className="space-y-1.5">
                      <Label htmlFor={k} className="font-mono text-xs">{k}</Label>
                      <Input id={k} value={value(k)} onChange={(e) => set(k, e.target.value)} />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
