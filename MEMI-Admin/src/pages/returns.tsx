import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { RotateCcw, Pencil } from 'lucide-react';
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
import { useResi, useDeleteMany, useUpdateOne } from '@/hooks/queries';
import { api } from '@/lib/api';
import { eur, date } from '@/lib/format';
import { statusLabel } from '@/lib/status';
import type { Reso } from '@/types';
import type { ExportColumn } from '@/lib/export';
import { toast } from 'sonner';

const STATO_FIELDS: FieldConfig[] = [
  { name: 'stato', label: 'Stato', type: 'select', wide: true, options: [
      { value: 'aperto', label: 'Aperto' },
      { value: 'in_analisi', label: 'In analisi' },
      { value: 'approvato', label: 'Approvato' },
      { value: 'rifiutato', label: 'Rifiutato' },
      { value: 'rimborsato', label: 'Rimborsato (ripristina stock + storna)' },
    ] },
  { name: 'rimborso_amount', label: 'Importo rimborso €', type: 'number', side: true, help: 'Impostando lo stato su "Rimborsato" il magazzino e i punti vengono ripristinati automaticamente.' },
];

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

/** Full-page editor for a return's status + refund amount. */
export function ReturnFormPage() {
  const { id } = useParams<{ id: string }>();
  const query = useResi();
  const updateMut = useUpdateOne<number>((rid, data) => api.resi.update(rid, data), 'resi');
  const row = (query.data?.resi ?? []).find((r) => String(r.id) === id);

  const initial = useMemo<FormValues>(
    () => (row ? { stato: row.stato, rimborso_amount: row.rimborso_amount == null ? '' : Number(row.rimborso_amount) } : {}),
    [row],
  );

  return (
    <EntityFormPage
      title={`Gestisci reso${row ? `: ${row.rma_number}` : ''}`}
      subtitle="Aggiorna lo stato della richiesta e l'importo del rimborso."
      backPath="/returns"
      backLabel="Resi"
      mainTitle="Stato richiesta"
      sideTitle="Rimborso"
      fields={STATO_FIELDS}
      initial={initial}
      loading={!row && query.isLoading}
      submitLabel="Salva"
      onSubmit={async (v) => {
        await updateMut.mutateAsync({
          id: Number(id),
          data: { stato: v.stato, rimborso_amount: v.rimborso_amount === '' || v.rimborso_amount == null ? null : v.rimborso_amount },
        });
        toast.success('Reso aggiornato');
      }}
    />
  );
}
