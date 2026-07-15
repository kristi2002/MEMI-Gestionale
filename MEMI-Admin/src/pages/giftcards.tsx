import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Gift, Plus, Pencil } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { KpiCard } from '@/components/common/kpi-card';
import { DataTable } from '@/components/data-table/data-table';
import type { FilterDef } from '@/components/data-table/filters';
import { BulkDelete } from '@/components/data-table/bulk-delete';
import { StatusBadge } from '@/components/common/status-badge';
import { EmptyState } from '@/components/common/empty-state';
import type { FieldConfig, FormValues } from '@/components/common/entity-form-fields';
import { EntityFormPage } from '@/components/common/entity-form-page';
import { Button } from '@/components/ui/button';
import { useGiftcards, useDeleteMany, useSaveEntity } from '@/hooks/queries';
import { api } from '@/lib/api';
import { eur, date } from '@/lib/format';
import { statusLabel } from '@/lib/status';
import type { GiftCard } from '@/types';
import type { ExportColumn } from '@/lib/export';
import { toast } from 'sonner';

const exportColumns: ExportColumn<GiftCard>[] = [
  { header: 'Codice', accessor: (g) => g.code },
  { header: 'Valore iniziale', accessor: (g) => eur(g.initial_amount) },
  { header: 'Saldo', accessor: (g) => eur(g.balance) },
  { header: 'Destinatario', accessor: (g) => g.recipient_email || '' },
  { header: 'Stato', accessor: (g) => statusLabel(g.stato) },
  { header: 'Data', accessor: (g) => date(g.created_at) },
];

const CREATE_FIELDS: FieldConfig[] = [
  { name: 'initial_amount', label: 'Importo €', type: 'number', required: true, help: 'Il codice viene generato automaticamente.' },
  { name: 'recipient_email', label: 'Email destinatario', type: 'email', help: 'Facoltativa — per inviare la gift card.' },
  { name: 'note', label: 'Nota interna', type: 'textarea', side: true },
];
const EDIT_FIELDS: FieldConfig[] = [
  { name: 'balance', label: 'Saldo €', type: 'number', help: 'Saldo residuo utilizzabile.' },
  { name: 'note', label: 'Nota interna', type: 'textarea' },
  { name: 'stato', label: 'Stato', type: 'select', side: true, options: [
      { value: 'attiva', label: 'Attiva' }, { value: 'utilizzata', label: 'Utilizzata' }, { value: 'disattivata', label: 'Disattivata' },
    ] },
];

export function GiftcardsPage() {
  const query = useGiftcards();
  const del = useDeleteMany<number>((id) => api.giftcards.delete(id), 'giftcards');
  const navigate = useNavigate();
  const rows = query.data?.cards ?? [];

  const filters = useMemo<FilterDef<GiftCard>[]>(
    () => [
      { key: 'stato', type: 'select', label: 'Stato', accessor: (g) => g.stato,
        options: [{ value: 'attiva', label: 'Attiva' }, { value: 'utilizzata', label: 'Utilizzata' }, { value: 'disattivata', label: 'Disattivata' }] },
      { key: 'balance', type: 'numberRange', label: 'Saldo', unit: '€', accessor: (g) => Number(g.balance) },
      { key: 'created', type: 'dateRange', label: 'Emessa', accessor: (g) => g.created_at },
    ],
    [],
  );
  const s = query.data?.summary;

  const columns = useMemo<ColumnDef<GiftCard, unknown>[]>(
    () => [
      { accessorKey: 'code', header: 'Codice', cell: ({ getValue }) => <code className="rounded bg-muted px-2 py-1 text-sm font-semibold">{getValue() as string}</code> },
      { accessorKey: 'initial_amount', header: 'Valore', cell: ({ getValue }) => eur(getValue() as string) },
      { accessorKey: 'balance', header: 'Saldo', cell: ({ getValue }) => <span className="font-semibold">{eur(getValue() as string)}</span>, sortingFn: (a, b) => Number(a.original.balance) - Number(b.original.balance) },
      { accessorKey: 'recipient_email', header: 'Destinatario', cell: ({ getValue }) => <span className="text-muted-foreground">{(getValue() as string) || '—'}</span> },
      { accessorKey: 'created_at', header: 'Data', cell: ({ getValue }) => <span className="text-muted-foreground">{date(getValue() as string)}</span> },
      { accessorKey: 'stato', header: 'Stato', cell: ({ getValue }) => <StatusBadge code={getValue() as string} /> },
      {
        id: 'azioni', header: '', enableSorting: false,
        cell: ({ row }) => (
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/giftcards/${row.original.id}/edit`); }}>
            <Pencil /> Modifica
          </Button>
        ),
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Gift card"
        subtitle="Buoni regalo emessi e relativi saldi."
      />
      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Totale" value={s?.total ?? 0} icon={Gift} tone="primary" loading={query.isLoading} />
        <KpiCard label="Attive" value={s?.attive ?? 0} tone="success" loading={query.isLoading} />
        <KpiCard label="Emesso" value={eur(s?.emesso ?? 0)} tone="info" loading={query.isLoading} />
        <KpiCard label="Saldo residuo" value={eur(s?.balance ?? 0)} tone="warning" loading={query.isLoading} />
      </div>
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(g) => String(g.id)}
        searchValue={(g) => `${g.code} ${g.recipient_email ?? ''}`}
        searchPlaceholder="Cerca codice o destinatario…"
        exportName="giftcard"
        exportTitle="Gift card"
        exportColumns={exportColumns}
        primaryAction={<Button size="sm" onClick={() => navigate('/giftcards/new')}><Plus /> Nuova gift card</Button>}
        filters={filters}
        tableId="giftcards"
        isLoading={query.isLoading}
        emptyState={<EmptyState icon={Gift} title="Nessuna gift card" />}
        bulkActions={(selected, clear) => (
          <BulkDelete count={selected.length} noun="gift card" onDelete={() => del.mutateAsync(selected.map((g) => g.id))} onDone={clear} />
        )}
      />
    </div>
  );
}

/** Full-page create/edit form for a gift card. */
export function GiftcardFormPage() {
  const { id } = useParams<{ id: string }>();
  const editing = id != null;
  const query = useGiftcards();
  const saveMut = useSaveEntity(api.giftcards.create, api.giftcards.update, 'giftcards');
  const row = editing ? (query.data?.cards ?? []).find((g) => String(g.id) === id) : undefined;

  const initial = useMemo<FormValues>(() => {
    if (!editing) return { initial_amount: 25 };
    return row ? { balance: Number(row.balance), stato: row.stato, note: (row as GiftCard & { note?: string }).note ?? '' } : {};
  }, [editing, row]);

  return (
    <EntityFormPage
      title={editing ? `Modifica gift card${row ? `: ${row.code}` : ''}` : 'Nuova gift card'}
      backPath="/giftcards"
      backLabel="Gift card"
      mainTitle={editing ? 'Saldo' : 'Dettagli'}
      sideTitle={editing ? 'Stato' : 'Nota interna'}
      fields={editing ? EDIT_FIELDS : CREATE_FIELDS}
      initial={initial}
      loading={editing && !row && query.isLoading}
      submitLabel={editing ? 'Salva modifiche' : 'Emetti gift card'}
      onSubmit={async (v) => {
        if (editing) {
          await saveMut.mutateAsync({ id: Number(id), data: { balance: v.balance, stato: v.stato, note: v.note || null } });
          toast.success('Gift card aggiornata');
        } else {
          await saveMut.mutateAsync({ data: { initial_amount: v.initial_amount, recipient_email: v.recipient_email || null, note: v.note || null } });
          toast.success('Gift card emessa');
        }
      }}
    />
  );
}
