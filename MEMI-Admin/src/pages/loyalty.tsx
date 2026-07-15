import { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Gem, Save, Loader2, Plus, Minus, Coins, Wallet, History } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { KpiCard } from '@/components/common/kpi-card';
import { DataTable } from '@/components/data-table/data-table';
import type { FilterDef } from '@/components/data-table/filters';
import { EmptyState } from '@/components/common/empty-state';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useLoyaltyConfig, useLoyaltyCustomers } from '@/hooks/queries';
import { api } from '@/lib/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { eur, initials, num, dateTime } from '@/lib/format';
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

/** Per-customer points manager: current balance, full ledger, and credit/charge. */
function CustomerPointsDialog({ customer, pointValueEur, onClose }: { customer: LoyaltyCustomer | null; pointValueEur: number; onClose: () => void }) {
  const qc = useQueryClient();
  const open = !!customer;
  const id = customer?.id;
  const detailQ = useQuery({
    queryKey: ['loyalty', 'customer', id],
    queryFn: () => api.loyalty.customer(id!),
    enabled: open,
  });
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) { setAmount(''); setReason(''); }
  }, [open, id]);

  const balance = detailQ.data?.points ?? customer?.points ?? 0;
  const tx = detailQ.data?.transactions ?? [];

  async function adjust(sign: 1 | -1) {
    const n = Math.abs(parseInt(amount, 10));
    if (!n) { toast.error('Indica un numero di punti'); return; }
    setBusy(true);
    try {
      const res = await api.loyalty.adjust(id!, { delta: sign * n, reason: reason.trim() || undefined });
      toast.success(`Saldo aggiornato: ${res.points.toLocaleString('it-IT')} punti`);
      setAmount('');
      setReason('');
      qc.invalidateQueries({ queryKey: ['loyalty', 'customer', id] });
      qc.invalidateQueries({ queryKey: ['loyalty', 'customers'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Rettifica non riuscita');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{customer ? `${customer.nome} ${customer.cognome}`.trim() || customer.email : ''}</DialogTitle>
          <DialogDescription>{customer?.email}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Coins className="h-3.5 w-3.5" /> Saldo punti</div>
            <div className="mt-1 text-2xl font-semibold text-primary">{balance.toLocaleString('it-IT')}</div>
          </div>
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Wallet className="h-3.5 w-3.5" /> Valore riscattabile</div>
            <div className="mt-1 text-2xl font-semibold">{eur(balance * pointValueEur)}</div>
          </div>
        </div>

        {/* Credit / charge */}
        <div className="rounded-lg border p-4">
          <p className="mb-2 text-sm font-medium">Accredita o addebita punti</p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Punti</Label>
              <Input type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="es. 100" className="w-28" />
            </div>
            <div className="min-w-[10rem] flex-1 space-y-1">
              <Label className="text-xs">Motivo (facoltativo)</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="es. omaggio compleanno" />
            </div>
            <Button type="button" variant="secondary" disabled={busy || !amount} onClick={() => adjust(1)}>
              {busy ? <Loader2 className="animate-spin" /> : <Plus />} Accredita
            </Button>
            <Button type="button" variant="outline" disabled={busy || !amount} onClick={() => adjust(-1)}>
              <Minus /> Addebita
            </Button>
          </div>
        </div>

        {/* Ledger */}
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-sm font-medium"><History className="h-4 w-4" /> Movimenti</p>
          <div className="max-h-64 overflow-auto rounded-lg border">
            {detailQ.isLoading ? (
              <p className="p-4 text-sm text-muted-foreground">Caricamento…</p>
            ) : tx.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Nessun movimento registrato.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {tx.map((t, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="whitespace-nowrap py-2 pl-3 pr-2 text-xs text-muted-foreground">{dateTime(t.created_at)}</td>
                      <td className="px-2 py-2">{t.reason || (t.order_id ? `Ordine #${t.order_id}` : '—')}</td>
                      <td className={`px-2 py-2 text-right font-semibold ${t.delta >= 0 ? 'text-success' : 'text-destructive'}`}>
                        {t.delta >= 0 ? '+' : ''}{t.delta.toLocaleString('it-IT')}
                      </td>
                      <td className="whitespace-nowrap py-2 pl-2 pr-3 text-right text-xs text-muted-foreground">saldo {t.balance_after.toLocaleString('it-IT')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function LoyaltyPage() {
  const configQ = useLoyaltyConfig();
  const custQ = useLoyaltyCustomers();
  const rows = custQ.data?.customers ?? [];
  const summary = custQ.data?.summary;
  const pointValueEur = configQ.data?.pointValueEur ?? 0;
  const [selected, setSelected] = useState<LoyaltyCustomer | null>(null);

  const redeemableValue = useMemo(() => num(summary?.total_points ?? 0) * pointValueEur, [summary, pointValueEur]);

  const filters = useMemo<FilterDef<LoyaltyCustomer>[]>(
    () => [
      { key: 'points', type: 'numberRange', label: 'Punti', accessor: (c) => c.points },
      { key: 'orders', type: 'numberRange', label: 'Ordini', accessor: (c) => c.total_orders },
      { key: 'spent', type: 'numberRange', label: 'Speso', unit: '€', accessor: (c) => num(c.total_spent) },
    ],
    [],
  );

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
      {
        id: 'valore',
        header: 'Valore',
        accessorFn: (c) => c.points * pointValueEur,
        cell: ({ row }) => <span className="text-muted-foreground">{eur(row.original.points * pointValueEur)}</span>,
      },
      { accessorKey: 'total_orders', header: 'Ordini' },
      { accessorKey: 'total_spent', header: 'Speso', cell: ({ getValue }) => eur(getValue() as string), sortingFn: (a, b) => num(a.original.total_spent) - num(b.original.total_spent) },
      {
        id: 'azioni',
        header: '',
        enableSorting: false,
        cell: ({ row }) => (
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setSelected(row.original); }}>
            <Coins /> Gestisci punti
          </Button>
        ),
      },
    ],
    [pointValueEur],
  );

  return (
    <div>
      <PageHeader title="Fedeltà & Punti" subtitle="Programma fedeltà, saldo punti per cliente e rettifiche manuali." />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-1">
          <ConfigCard config={configQ.data} loading={configQ.isLoading} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-1">
            <KpiCard label="Membri" value={summary?.members ?? 0} icon={Gem} tone="primary" loading={custQ.isLoading} />
            <KpiCard label="Punti totali" value={num(summary?.total_points ?? 0).toLocaleString('it-IT')} icon={Coins} tone="info" loading={custQ.isLoading} />
            <KpiCard label="Valore riscattabile" value={eur(redeemableValue)} icon={Wallet} tone="success" loading={custQ.isLoading || configQ.isLoading} />
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
            filters={filters}
            tableId="loyalty"
            isLoading={custQ.isLoading}
            onRowClick={(c) => setSelected(c)}
            emptyState={<EmptyState icon={Gem} title="Nessun cliente con punti" />}
          />
        </div>
      </div>

      <CustomerPointsDialog customer={selected} pointValueEur={pointValueEur} onClose={() => setSelected(null)} />
    </div>
  );
}
