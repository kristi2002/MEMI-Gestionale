import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { RotateCcw, Pencil, ArrowLeft, Loader2, Save } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { KpiCard } from '@/components/common/kpi-card';
import { DataTable } from '@/components/data-table/data-table';
import type { FilterDef } from '@/components/data-table/filters';
import { BulkDelete } from '@/components/data-table/bulk-delete';
import { StatusBadge } from '@/components/common/status-badge';
import { EmptyState } from '@/components/common/empty-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { useResi, useDeleteMany, useUpdateOne, useSettings } from '@/hooks/queries';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { eur, date } from '@/lib/format';
import { statusLabel } from '@/lib/status';
import type { Reso } from '@/types';
import type { ExportColumn } from '@/lib/export';
import { toast } from 'sonner';

const DEFAULT_REASONS = [
  'Taglia errata',
  'Non corrispondente alla descrizione',
  'Difetto di produzione',
  'Danneggiato alla consegna',
  'Non gradito',
  'Altro',
];

const inputCls =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const exportColumns: ExportColumn<Reso>[] = [
  { header: 'RMA', accessor: (r) => r.rma_number },
  { header: 'Ordine', accessor: (r) => r.order_number },
  { header: 'Cliente', accessor: (r) => r.customer_nome },
  { header: 'Email', accessor: (r) => r.customer_email },
  { header: 'Motivo', accessor: (r) => r.motivo },
  { header: 'Rimborso', accessor: (r) => (r.rimborso_amount ? eur(r.rimborso_amount) : '') },
  { header: 'Stato', accessor: (r) => statusLabel(r.stato) },
  { header: 'Data', accessor: (r) => date(r.created_at) },
];

/** Editable "Resi & Rimborsi conditions" — gates the customer-facing request form. */
function ReturnsConditionsCard() {
  const query = useSettings();
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState(true);
  const [windowDays, setWindowDays] = useState('30');
  const [reasons, setReasons] = useState('');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (query.data && !loaded) {
      const s = query.data;
      setEnabled(s.reso_enabled == null ? true : s.reso_enabled !== '0' && s.reso_enabled !== 'false');
      setWindowDays(s.reso_window_days ?? '30');
      let list = DEFAULT_REASONS;
      if (s.reso_reasons) {
        try {
          const a = JSON.parse(s.reso_reasons);
          if (Array.isArray(a) && a.length) list = a.map((x) => String(x));
        } catch { /* keep defaults */ }
      }
      setReasons(list.join('\n'));
      setLoaded(true);
    }
  }, [query.data, loaded]);

  async function save() {
    const list = reasons.split('\n').map((s) => s.trim()).filter(Boolean);
    setSaving(true);
    try {
      await api.settings.update({
        reso_enabled: enabled ? '1' : '0',
        reso_window_days: String(parseInt(windowDays, 10) || 30),
        reso_reasons: JSON.stringify(list.length ? list : DEFAULT_REASONS),
      });
      toast.success('Condizioni di reso salvate');
      qc.invalidateQueries({ queryKey: ['settings'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Salvataggio non riuscito');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mb-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Condizioni di reso</CardTitle>
        <p className="text-sm text-muted-foreground">
          Regole che governano quando un cliente può <strong>aprire</strong> una richiesta. L'approvazione e
          il rimborso restano sempre un'azione manuale dell'operatore.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex items-center gap-2">
          <Checkbox checked={enabled} onCheckedChange={(v) => setEnabled(v === true)} />
          <span className="text-sm">Abilita le richieste di reso dal sito</span>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="reso_window">Giorni per aprire un reso (dalla consegna)</Label>
            <Input
              id="reso_window"
              type="number"
              min={0}
              value={windowDays}
              onChange={(e) => setWindowDays(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reso_reasons">Motivi ammessi (uno per riga)</Label>
            <textarea
              id="reso_reasons"
              rows={5}
              value={reasons}
              onChange={(e) => setReasons(e.target.value)}
              className={inputCls + ' h-auto min-h-[110px] resize-y font-mono text-xs'}
            />
          </div>
        </div>
        <Button size="sm" onClick={save} disabled={saving || !loaded}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />} Salva condizioni
        </Button>
      </CardContent>
    </Card>
  );
}

export function ReturnsPage() {
  const query = useResi();
  const del = useDeleteMany<number>((id) => api.resi.delete(id), 'resi');
  const navigate = useNavigate();
  const rows = query.data?.resi ?? [];

  const filters = useMemo<FilterDef<Reso>[]>(
    () => [
      { key: 'stato', type: 'select', label: 'Stato', accessor: (r) => r.stato,
        options: [
          { value: 'aperto', label: 'Aperto' }, { value: 'in_analisi', label: 'In analisi' },
          { value: 'approvato', label: 'Approvato' }, { value: 'rifiutato', label: 'Rifiutato' },
          { value: 'rimborsato', label: 'Rimborsato' },
        ] },
    ],
    [],
  );

  const counts = useMemo(
    () => ({
      aperti: rows.filter((r) => r.stato === 'aperto').length,
      analisi: rows.filter((r) => r.stato === 'in_analisi').length,
      rimborsati: rows.filter((r) => r.stato === 'rimborsato').length,
    }),
    [rows],
  );

  const columns = useMemo<ColumnDef<Reso, unknown>[]>(
    () => [
      { accessorKey: 'rma_number', header: 'RMA', cell: ({ getValue }) => <span className="font-semibold">{getValue() as string}</span> },
      { accessorKey: 'order_number', header: 'Ordine', cell: ({ getValue }) => <span className="text-muted-foreground">{getValue() as string}</span> },
      {
        id: 'cliente',
        header: 'Cliente',
        accessorFn: (r) => r.customer_nome,
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="truncate font-medium">{row.original.customer_nome || '—'}</div>
            <div className="truncate text-xs text-muted-foreground">{row.original.customer_email}</div>
          </div>
        ),
      },
      { accessorKey: 'motivo', header: 'Motivo', cell: ({ getValue }) => <span className="line-clamp-1 max-w-[220px] text-muted-foreground">{(getValue() as string) || '—'}</span> },
      { accessorKey: 'rimborso_amount', header: 'Rimborso', cell: ({ getValue }) => (getValue() ? <span className="font-semibold">{eur(getValue() as string)}</span> : <span className="text-muted-foreground">—</span>) },
      { accessorKey: 'created_at', header: 'Data', cell: ({ getValue }) => <span className="text-muted-foreground">{date(getValue() as string)}</span> },
      { accessorKey: 'stato', header: 'Stato', cell: ({ getValue }) => <StatusBadge code={getValue() as string} /> },
      {
        id: 'azioni', header: '', enableSorting: false,
        cell: ({ row }) => (
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/returns/${row.original.id}/edit`); }}>
            <Pencil /> Gestisci
          </Button>
        ),
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader title="Resi" subtitle="Richieste di reso e rimborsi." />
      <ReturnsConditionsCard />
      <div className="mb-4 grid grid-cols-3 gap-4">
        <KpiCard label="Aperti" value={counts.aperti} tone="primary" loading={query.isLoading} />
        <KpiCard label="In analisi" value={counts.analisi} tone="warning" loading={query.isLoading} />
        <KpiCard label="Rimborsati" value={counts.rimborsati} tone="success" loading={query.isLoading} />
      </div>
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(r) => String(r.id)}
        searchValue={(r) => `${r.rma_number} ${r.order_number} ${r.customer_nome} ${r.customer_email}`}
        searchPlaceholder="Cerca RMA, ordine o cliente…"
        exportName="resi"
        exportTitle="Resi"
        exportColumns={exportColumns}
        filters={filters}
        tableId="returns"
        isLoading={query.isLoading}
        emptyState={<EmptyState icon={RotateCcw} title="Nessun reso registrato" />}
        bulkActions={(selected, clear) => (
          <BulkDelete count={selected.length} noun="resi" onDelete={() => del.mutateAsync(selected.map((r) => r.id))} onDone={clear} />
        )}
      />
    </div>
  );
}

const MANAGE_STATI: { value: Reso['stato']; label: string }[] = [
  { value: 'aperto', label: 'Aperto' },
  { value: 'in_analisi', label: 'In analisi' },
  { value: 'approvato', label: 'Approvato' },
  { value: 'rifiutato', label: 'Rifiutato' },
];

/** Full-page manager for a single return: status/amount + a confirmed manual refund. */
export function ReturnFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const query = useResi();
  const qc = useQueryClient();
  const updateMut = useUpdateOne<number>((rid, data) => api.resi.update(rid, data), 'resi');
  const row = (query.data?.resi ?? []).find((r) => String(r.id) === id);

  const [stato, setStato] = useState<Reso['stato']>('aperto');
  const [amount, setAmount] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAmount, setConfirmAmount] = useState('');
  const [refunding, setRefunding] = useState(false);
  const [savingStato, setSavingStato] = useState(false);

  useEffect(() => {
    if (row) {
      setStato(row.stato === 'rimborsato' ? 'aperto' : row.stato);
      setAmount(row.rimborso_amount == null ? '' : String(Number(row.rimborso_amount)));
    }
  }, [row]);

  const alreadyRefunded = row?.stato === 'rimborsato';

  async function saveStato() {
    setSavingStato(true);
    try {
      const amt = amount === '' ? null : Number(amount);
      await updateMut.mutateAsync({ id: Number(id), data: { stato, rimborso_amount: amt } });
      toast.success('Reso aggiornato');
      qc.invalidateQueries({ queryKey: ['resi'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Salvataggio non riuscito');
    } finally {
      setSavingStato(false);
    }
  }

  function openConfirm() {
    setConfirmAmount(amount || (row?.rimborso_amount != null ? String(Number(row.rimborso_amount)) : ''));
    setConfirmOpen(true);
  }

  async function doRefund() {
    const amt = confirmAmount === '' || confirmAmount == null ? undefined : Number(confirmAmount);
    setRefunding(true);
    try {
      try {
        await api.resi.refund(Number(id), amt != null ? { amount: amt } : {});
        toast.success('Rimborso emesso e reso aggiornato');
      } catch (e) {
        // No card payment on the order → fall back to a manual (offline) refund.
        if (e instanceof ApiError && e.status === 400) {
          await api.resi.refund(Number(id), { manual: true, ...(amt != null ? { amount: amt } : {}) });
          toast.success('Rimborso manuale registrato (nessun pagamento carta sull’ordine)');
        } else {
          throw e;
        }
      }
      qc.invalidateQueries({ queryKey: ['resi'] });
      setConfirmOpen(false);
      navigate('/returns');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Rimborso non riuscito');
    } finally {
      setRefunding(false);
    }
  }

  if (!row) {
    return (
      <div>
        <Button variant="ghost" size="sm" className="-ml-2 mb-2" onClick={() => navigate('/returns')}>
          <ArrowLeft /> Resi
        </Button>
        {query.isLoading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <EmptyState icon={RotateCcw} title="Reso non trovato" />
        )}
      </div>
    );
  }

  return (
    <div>
      <Button variant="ghost" size="sm" className="-ml-2 mb-2" onClick={() => navigate('/returns')}>
        <ArrowLeft /> Resi
      </Button>
      <PageHeader title={`Gestisci reso: ${row.rma_number}`} subtitle="Aggiorna lo stato e, dopo aver verificato la merce, emetti il rimborso." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Details */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Dettagli richiesta</CardTitle></CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                <div><dt className="text-muted-foreground">RMA</dt><dd className="font-semibold">{row.rma_number}</dd></div>
                <div><dt className="text-muted-foreground">Ordine</dt><dd>{row.order_number}</dd></div>
                <div><dt className="text-muted-foreground">Cliente</dt><dd>{row.customer_nome || '—'}</dd></div>
                <div><dt className="text-muted-foreground">Email</dt><dd className="truncate">{row.customer_email}</dd></div>
                <div><dt className="text-muted-foreground">Motivo</dt><dd>{row.motivo || '—'}</dd></div>
                <div><dt className="text-muted-foreground">Data</dt><dd>{date(row.created_at)}</dd></div>
                <div><dt className="text-muted-foreground">Stato attuale</dt><dd><StatusBadge code={row.stato} /></dd></div>
                <div><dt className="text-muted-foreground">Importo suggerito</dt><dd>{row.rimborso_amount != null ? eur(row.rimborso_amount) : '—'}</dd></div>
                {row.descrizione && (
                  <div className="sm:col-span-2"><dt className="text-muted-foreground">Descrizione</dt><dd className="whitespace-pre-wrap">{row.descrizione}</dd></div>
                )}
              </dl>
            </CardContent>
          </Card>
        </div>

        {/* Management rail */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Gestione</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="reso_stato">Stato richiesta</Label>
                <select
                  id="reso_stato"
                  className={inputCls}
                  value={stato}
                  disabled={alreadyRefunded}
                  onChange={(e) => setStato(e.target.value as Reso['stato'])}
                >
                  {MANAGE_STATI.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  {alreadyRefunded && <option value="rimborsato">Rimborsato</option>}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reso_amount">Importo rimborso €</Label>
                <Input id="reso_amount" type="number" step="0.01" min={0} value={amount}
                  disabled={alreadyRefunded}
                  onChange={(e) => setAmount(e.target.value)} />
                <p className="text-xs text-muted-foreground">Precompilato con il totale dell'ordine. Riducilo per un rimborso parziale.</p>
              </div>
              <Button size="sm" variant="outline" onClick={saveStato} disabled={savingStato || alreadyRefunded}>
                {savingStato ? <Loader2 className="animate-spin" /> : <Save />} Salva stato
              </Button>

              <div className="border-t pt-4">
                {alreadyRefunded ? (
                  <div className="flex items-center gap-2 text-sm">
                    <StatusBadge code="rimborsato" />
                    <span className="text-muted-foreground">{row.rimborso_amount != null ? eur(row.rimborso_amount) : ''}</span>
                  </div>
                ) : (
                  <>
                    <Button variant="destructive" className="w-full" onClick={openConfirm}>
                      Emetti rimborso
                    </Button>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Emetti il rimborso solo dopo aver verificato la merce restituita. L'azione invia il denaro
                      e ripristina magazzino, punti e gift card.
                    </p>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Styled confirmation before any money moves. */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Conferma rimborso</DialogTitle>
            <DialogDescription>
              Stai per emettere un rimborso per il reso <strong>{row.rma_number}</strong> (ordine {row.order_number},
              {' '}{row.customer_nome || row.customer_email}). Il denaro viene inviato al metodo di pagamento originale
              e non è reversibile.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="confirm_amount">Importo da rimborsare €</Label>
            <Input id="confirm_amount" type="number" step="0.01" min={0} value={confirmAmount}
              onChange={(e) => setConfirmAmount(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={refunding}>Annulla</Button>
            <Button variant="destructive" onClick={doRefund} disabled={refunding}>
              {refunding && <Loader2 className="animate-spin" />} Conferma ed emetti rimborso
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
