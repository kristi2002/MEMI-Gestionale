import { useEffect, useMemo, useState } from 'react';
import { Save, Loader2, Search } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/common/empty-state';
import { Settings as SettingsIcon } from 'lucide-react';
import { useSettings } from '@/hooks/queries';
import { api } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import type { StoreSettings } from '@/types';
import { toast } from 'sonner';

/** Group keys by their prefix before the first underscore (loyalty_*, lifecycle_*, …). */
function groupKeys(keys: string[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  for (const k of keys.sort()) {
    const g = k.includes('_') ? k.slice(0, k.indexOf('_')) : 'generale';
    (groups[g] ??= []).push(k);
  }
  return groups;
}

export function SettingsPage() {
  const query = useSettings();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<StoreSettings>({});
  const [filter, setFilter] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (query.data) setDraft(query.data);
  }, [query.data]);

  const dirty = useMemo(() => {
    if (!query.data) return false;
    return Object.keys(draft).some((k) => draft[k] !== query.data![k]);
  }, [draft, query.data]);

  const groups = useMemo(() => {
    const keys = Object.keys(draft).filter((k) => k.toLowerCase().includes(filter.toLowerCase()));
    return groupKeys(keys);
  }, [draft, filter]);

  async function save() {
    if (!query.data) return;
    const changed: StoreSettings = {};
    for (const k of Object.keys(draft)) if (draft[k] !== query.data[k]) changed[k] = draft[k];
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

  const hasKeys = Object.keys(draft).length > 0;

  return (
    <div>
      <PageHeader
        title="Impostazioni"
        subtitle="Configurazione dello store (store_settings)."
        actions={
          <Button size="sm" onClick={save} disabled={!dirty || saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />} Salva modifiche
          </Button>
        }
      />

      <div className="relative mb-4 max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtra impostazioni…" className="pl-8" />
      </div>

      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">Caricamento…</p>
      ) : !hasKeys ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState icon={SettingsIcon} title="Nessuna impostazione" />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {Object.entries(groups).map(([group, keys]) => (
            <Card key={group}>
              <CardContent className="pt-5">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group}</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {keys.map((k) => (
                    <div key={k} className="space-y-1.5">
                      <Label htmlFor={k} className="font-mono text-xs">{k}</Label>
                      <Input
                        id={k}
                        value={draft[k] ?? ''}
                        onChange={(e) => setDraft((p) => ({ ...p, [k]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
