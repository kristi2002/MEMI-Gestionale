import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Gem, Save, Loader2, Plus, Minus, Coins, Wallet, History, TimerReset, Ticket } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useLoyaltyConfig, useLoyaltyCustomers } from '@/hooks/queries';
import { api } from '@/lib/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { eur, initials, num, dateTime } from '@/lib/format';
import type { LoyaltyConfig, LoyaltyCustomer, LoyaltyTier } from '@/types';
import type { ExportColumn } from '@/lib/export';
import { toast } from 'sonner';

// Suggested starter tiers the owner can load then tweak (spend thresholds in €, points multiplier).
const DEFAULT_TIERS: LoyaltyTier[] = [
  { nome: 'Bronzo', min_spent: 0, multiplier: 1 },
  { nome: 'Argento', min_spent: 300, multiplier: 1.25 },
  { nome: 'Oro', min_spent: 800, multiplier: 1.5 },
];

const exportColumns: ExportColumn<LoyaltyCustomer>[] = [
  { header: 'Cliente', accessor: (c) => `${c.nome} ${c.cognome}`.trim() },
  { header: 'Email', accessor: (c) => c.email },
  { header: 'Punti', accessor: (c) => c.points },
  { header: 'Ordini', accessor: (c) => c.total_orders },
  { header: 'Speso', accessor: (c) => eur(c.total_spent) },
  { header: 'Livello', accessor: (c) => c.tier ?? '' },
];

function ConfigCard({ config, loading }: { config?: LoyaltyConfig; loading: boolean }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<LoyaltyConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [expiring, setExpiring] = useState(false);
  useEffect(() => {
    if (config) setForm(config);
  }, [config]);

  async function runExpiry() {
    // Expiry reads the SAVED setting server-side, so require an unmodified field first.
    if (form && form.expiryMonths !== config?.expiryMonths) {
      toast.info('Salva prima le impostazioni di scadenza.');
      return;
    }
    setExpiring(true);
    try {
      const preview = await api.loyalty.expire(true);
      if (preview.skipped) { toast.info('Scadenza non attiva — imposta i mesi (> 0) e salva.'); return; }
      if (preview.candidates === 0) { toast.info('Nessun cliente con punti da far scadere.'); return; }
      if (!window.confirm(`${preview.candidates} clienti perderanno ${preview.points.toLocaleString('it-IT')} punti totali (inattivi da oltre ${preview.months} mesi). Procedere?`)) return;
      const res = await api.loyalty.expire(false);
      toast.success(`Scaduti ${res.points.toLocaleString('it-IT')} punti per ${res.expired} clienti.`);
      qc.invalidateQueries({ queryKey: ['loyalty', 'customers'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Operazione non riuscita');
    } finally {
      setExpiring(false);
    }
  }

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
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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

            {/* Tiers — spend-based levels with a points multiplier */}
            <div className="space-y-2 border-t pt-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">Livelli fedeltà (per spesa totale)</p>
                  <p className="text-xs text-muted-foreground">Il cliente sale al livello più alto raggiunto; il moltiplicatore aumenta i punti guadagnati sugli acquisti.</p>
                </div>
                {(f.tiers ?? []).length === 0 && (
                  <Button type="button" variant="outline" size="sm" onClick={() => set('tiers', DEFAULT_TIERS)}>Carica preset</Button>
                )}
              </div>
              {(f.tiers ?? []).length > 0 && (
                <div className="space-y-2">
                  <div className="grid grid-cols-[1fr_7rem_7rem_2.25rem] gap-2 text-xs text-muted-foreground">
                    <span>Nome livello</span><span>Spesa min €</span><span>Moltiplic. ×</span><span />
                  </div>
                  {(f.tiers ?? []).map((t, i) => (
                    <div key={i} className="grid grid-cols-[1fr_7rem_7rem_2.25rem] items-center gap-2">
                      <Input value={t.nome} placeholder="Es. Oro" onChange={(e) => set('tiers', (f.tiers ?? []).map((x, idx) => idx === i ? { ...x, nome: e.target.value } : x))} />
                      <Input type="number" min="0" value={t.min_spent} onChange={(e) => set('tiers', (f.tiers ?? []).map((x, idx) => idx === i ? { ...x, min_spent: Number(e.target.value) } : x))} />
                      <Input type="number" min="1" step="0.05" value={t.multiplier} onChange={(e) => set('tiers', (f.tiers ?? []).map((x, idx) => idx === i ? { ...x, multiplier: Number(e.target.value) } : x))} />
                      <Button type="button" variant="ghost" size="icon" aria-label="Rimuovi livello" onClick={() => set('tiers', (f.tiers ?? []).filter((_, idx) => idx !== i))}><Minus /></Button>
                    </div>
                  ))}
                </div>
              )}
              <Button type="button" variant="outline" size="sm" onClick={() => set('tiers', [...(f.tiers ?? []), { nome: '', min_spent: 0, multiplier: 1 }])}>
                <Plus /> Aggiungi livello
              </Button>
            </div>

            {/* Point expiry (inactivity) */}
            <div className="space-y-2 border-t pt-4">
              <p className="text-sm font-medium">Scadenza punti</p>
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <Label>Scadenza per inattività (mesi)</Label>
                  <Input type="number" min="0" className="w-40" value={f.expiryMonths} onChange={(e) => set('expiryMonths', Number(e.target.value))} />
                </div>
                <Button type="button" variant="outline" disabled={expiring} onClick={runExpiry}>
                  {expiring ? <Loader2 className="animate-spin" /> : <TimerReset />} Esegui scadenza ora
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                0 = i punti non scadono mai. I clienti senza movimenti punti da oltre questo periodo perdono il saldo (registrato a ledger). Eseguito automaticamente ogni giorno; “Esegui ora” lo lancia subito, con anteprima e conferma.
              </p>
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
  const navigate = useNavigate();
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
        id: 'tier', header: 'Livello', accessorFn: (c) => c.tier ?? '',
        cell: ({ row }) => row.original.tier
          ? <Badge variant="info">{row.original.tier}</Badge>
          : <span className="text-muted-foreground">—</span>,
      },
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
      <PageHeader
        title="Fedeltà & Punti"
        subtitle="Programma fedeltà, saldo punti per cliente e rettifiche manuali."
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate('/loyalty/redemptions')}>
            <Ticket /> Codici riscattati
          </Button>
        }
      />

      {/* Cards on top: stat KPIs + program settings, full width */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Membri" value={summary?.members ?? 0} icon={Gem} tone="primary" loading={custQ.isLoading} />
        <KpiCard label="Punti totali" value={num(summary?.total_points ?? 0).toLocaleString('it-IT')} icon={Coins} tone="info" loading={custQ.isLoading} />
        <KpiCard label="Valore riscattabile" value={eur(redeemableValue)} icon={Wallet} tone="success" loading={custQ.isLoading || configQ.isLoading} />
      </div>
      <div className="mt-4">
        <ConfigCard config={configQ.data} loading={configQ.isLoading} />
      </div>

      {/* Classifica clienti — full width below the cards */}
      <div className="mt-4">
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

      <CustomerPointsDialog customer={selected} pointValueEur={pointValueEur} onClose={() => setSelected(null)} />
    </div>
  );
}
