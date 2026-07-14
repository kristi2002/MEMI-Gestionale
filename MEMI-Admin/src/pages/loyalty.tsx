import { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Gem, Save, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { KpiCard } from '@/components/common/kpi-card';
import { DataTable } from '@/components/data-table/data-table';
import { EmptyState } from '@/components/common/empty-state';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useLoyaltyConfig, useLoyaltyCustomers } from '@/hooks/queries';
import { api } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { eur, initials, num } from '@/lib/format';
import type { LoyaltyConfig, LoyaltyCustomer } from '@/types';
import type { ExportColumn } from '@/lib/export';
import { toast } from 'sonner';

const exportColumns: ExportColumn<LoyaltyCustomer>[] = [
  { header: 'Cliente', accessor: (c) => `${c.nome} ${c.cognome}`.trim() },
  { header: 'Email', accessor: (c) => c.email },
  { header: 'Punti', accessor: (c) => c.points },
  { header: 'Ordini', accessor: (c) => c.total_orders },
  { header: 'Speso', accessor: (c) => eur(c.total_spent) },
];

function ConfigCard({ config, loading }: { config?: LoyaltyConfig; loading: boolean }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<LoyaltyConfig | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (config) setForm(config);
  }, [config]);

  const f = form;
  function set<K extends keyof LoyaltyConfig>(k: K, v: LoyaltyConfig[K]) {
    setForm((p) => (p ? { ...p, [k]: v } : p));
  }
  async function save() {
    if (!f) return;
    setSaving(true);
    try {
      await api.loyalty.updateConfig(f);
      toast.success('Configurazione fedeltà salvata');
      qc.invalidateQueries({ queryKey: ['loyalty', 'config'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Salvataggio non riuscito');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configurazione programma</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading || !f ? (
          <p className="text-sm text-muted-foreground">Caricamento…</p>
        ) : (
          <>
            <label className="flex cursor-pointer items-center gap-2">
              <Checkbox checked={f.enabled} onCheckedChange={(v) => set('enabled', !!v)} />
              <span className="text-sm font-medium">Programma fedeltà attivo</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Bonus iscrizione (punti)</Label>
                <Input type="number" value={f.signupBonus} onChange={(e) => set('signupBonus', Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label>Punti per € speso</Label>
                <Input type="number" step="any" value={f.pointsPerEuro} onChange={(e) => set('pointsPerEuro', Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label>Valore punto (€)</Label>
                <Input type="number" step="any" value={f.pointValueEur} onChange={(e) => set('pointValueEur', Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label>Riscatto minimo (punti)</Label>
                <Input type="number" value={f.minRedeem} onChange={(e) => set('minRedeem', Number(e.target.value))} />
              </div>
            </div>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : <Save />} Salva
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function LoyaltyPage() {
  const configQ = useLoyaltyConfig();
  const custQ = useLoyaltyCustomers();
  const rows = custQ.data?.customers ?? [];
  const summary = custQ.data?.summary;

  const columns = useMemo<ColumnDef<LoyaltyCustomer, unknown>[]>(
    () => [
      {
        id: 'cliente',
        header: 'Cliente',
        accessorFn: (c) => `${c.nome} ${c.cognome}`,
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-3">
            <Avatar className="h-8 w-8">
              <AvatarFallback>{initials(`${row.original.nome} ${row.original.cognome}` || row.original.email)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="truncate font-medium">{`${row.original.nome} ${row.original.cognome}`.trim() || '—'}</div>
              <div className="truncate text-xs text-muted-foreground">{row.original.email}</div>
            </div>
          </div>
        ),
      },
      { accessorKey: 'points', header: 'Punti', cell: ({ getValue }) => <span className="font-semibold text-primary">{(getValue() as number).toLocaleString('it-IT')}</span> },
      { accessorKey: 'total_orders', header: 'Ordini' },
      { accessorKey: 'total_spent', header: 'Speso', cell: ({ getValue }) => eur(getValue() as string), sortingFn: (a, b) => num(a.original.total_spent) - num(b.original.total_spent) },
    ],
    [],
  );

  return (
    <div>
      <PageHeader title="Fedeltà & Punti" subtitle="Programma fedeltà e classifica clienti." />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-1">
          <ConfigCard config={configQ.data} loading={configQ.isLoading} />
          <div className="grid grid-cols-2 gap-4">
            <KpiCard label="Membri" value={summary?.members ?? 0} icon={Gem} tone="primary" loading={custQ.isLoading} />
            <KpiCard label="Punti totali" value={num(summary?.total_points ?? 0).toLocaleString('it-IT')} tone="info" loading={custQ.isLoading} />
          </div>
        </div>
        <div className="lg:col-span-2">
          <DataTable
            columns={columns}
            data={rows}
            getRowId={(c) => String(c.id)}
            searchValue={(c) => `${c.nome} ${c.cognome} ${c.email}`}
            searchPlaceholder="Cerca cliente…"
            exportName="fedelta_punti"
            exportTitle="Classifica fedeltà"
            exportColumns={exportColumns}
            isLoading={custQ.isLoading}
            emptyState={<EmptyState icon={Gem} title="Nessun cliente con punti" />}
          />
        </div>
      </div>
    </div>
  );
}
