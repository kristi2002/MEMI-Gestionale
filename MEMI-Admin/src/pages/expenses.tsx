import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Receipt, Plus, Pencil } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { KpiCard } from '@/components/common/kpi-card';
import { DataTable } from '@/components/data-table/data-table';
import type { FilterDef } from '@/components/data-table/filters';
import { BulkDelete } from '@/components/data-table/bulk-delete';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/common/empty-state';
import type { FieldConfig, FormValues } from '@/components/common/entity-form-fields';
import { EntityFormPage } from '@/components/common/entity-form-page';
import { Button } from '@/components/ui/button';
import { useExpenses, useDeleteMany, useSaveEntity } from '@/hooks/queries';
import { api } from '@/lib/api';
import { eur, date } from '@/lib/format';
import type { Expense } from '@/types';
import type { ExportColumn } from '@/lib/export';
import { toast } from 'sonner';

const FIELDS: FieldConfig[] = [
  { name: 'descrizione', label: 'Descrizione', required: true, wide: true },
  { name: 'categoria', label: 'Categoria', type: 'select', options: [
      { value: 'generale', label: 'Generale' }, { value: 'affitto', label: 'Affitto' }, { value: 'utenze', label: 'Utenze' },
      { value: 'marketing', label: 'Marketing' }, { value: 'stipendi', label: 'Stipendi' }, { value: 'merce', label: 'Merce' },
      { value: 'software', label: 'Software' }, { value: 'spedizioni', label: 'Spedizioni' }, { value: 'tasse', label: 'Tasse' },
    ] },
  { name: 'importo', label: 'Importo €', type: 'number', required: true },
  { name: 'ricorrenza', label: 'Ricorrenza', type: 'select', options: [
      { value: 'una_tantum', label: 'Una tantum' }, { value: 'mensile', label: 'Mensile' }, { value: 'annuale', label: 'Annuale' },
    ] },
  { name: 'fornitore', label: 'Fornitore' },
  { name: 'data_spesa', label: 'Data', type: 'date' },
  { name: 'note', label: 'Note', type: 'textarea' },
];

const exportColumns: ExportColumn<Expense>[] = [
  { header: 'Descrizione', accessor: (e) => e.descrizione },
  { header: 'Categoria', accessor: (e) => e.categoria },
  { header: 'Importo', accessor: (e) => eur(e.importo) },
  { header: 'Ricorrenza', accessor: (e) => e.ricorrenza },
  { header: 'Fornitore', accessor: (e) => e.fornitore || '' },
  { header: 'Data', accessor: (e) => (e.data_spesa ? date(e.data_spesa) : '') },
];

export function ExpensesPage() {
  const query = useExpenses();
  const del = useDeleteMany<number>((id) => api.expenses.delete(id), 'expenses');
  const navigate = useNavigate();
  const rows = query.data?.expenses ?? [];

  const filters = useMemo<FilterDef<Expense>[]>(() => {
    const categorie = [...new Set(rows.map((e) => e.categoria).filter(Boolean))].sort();
    return [
      { key: 'categoria', type: 'select', label: 'Categoria', accessor: (e) => e.categoria, options: categorie.map((c) => ({ value: c, label: c })) },
      { key: 'ricorrenza', type: 'select', label: 'Ricorrenza', accessor: (e) => e.ricorrenza,
        options: [{ value: 'una_tantum', label: 'Una tantum' }, { value: 'mensile', label: 'Mensile' }, { value: 'annuale', label: 'Annuale' }] },
      { key: 'importo', type: 'numberRange', label: 'Importo', unit: '€', accessor: (e) => Number(e.importo) },
      { key: 'data', type: 'dateRange', label: 'Data', accessor: (e) => e.data_spesa },
    ];
  }, [rows]);
  const s = query.data?.summary;

  const columns = useMemo<ColumnDef<Expense, unknown>[]>(
    () => [
      { accessorKey: 'descrizione', header: 'Descrizione', cell: ({ getValue }) => <span className="font-medium">{getValue() as string}</span> },
      { accessorKey: 'categoria', header: 'Categoria', cell: ({ getValue }) => <Badge variant="neutral">{getValue() as string}</Badge> },
      { accessorKey: 'ricorrenza', header: 'Ricorrenza', cell: ({ getValue }) => <span className="text-muted-foreground">{(getValue() as string).replace('_', ' ')}</span> },
      { accessorKey: 'fornitore', header: 'Fornitore', cell: ({ getValue }) => <span className="text-muted-foreground">{(getValue() as string) || '—'}</span> },
      { accessorKey: 'data_spesa', header: 'Data', cell: ({ getValue }) => <span className="text-muted-foreground">{getValue() ? date(getValue() as string) : '—'}</span> },
      { accessorKey: 'importo', header: 'Importo', cell: ({ getValue }) => <span className="font-semibold">{eur(getValue() as string)}</span>, sortingFn: (a, b) => Number(a.original.importo) - Number(b.original.importo) },
      {
        id: 'azioni', header: '', enableSorting: false,
        cell: ({ row }) => (
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/bills/${row.original.id}/edit`); }}>
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
        title="Fatture & Spese"
        subtitle="Costi operativi e spese ricorrenti."
        actions={<Button size="sm" onClick={() => navigate('/bills/new')}><Plus /> Nuova spesa</Button>}
      />
      <div className="mb-4 grid grid-cols-3 gap-4">
        <KpiCard label="Totale spese" value={eur(s?.total ?? 0)} icon={Receipt} tone="primary" loading={query.isLoading} />
        <KpiCard label="Questo mese" value={eur(s?.month ?? 0)} tone="info" loading={query.isLoading} />
        <KpiCard label="Ricorrenti / mese" value={eur(s?.monthly_recurring ?? 0)} tone="warning" loading={query.isLoading} />
      </div>
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(e) => String(e.id)}
        searchValue={(e) => `${e.descrizione} ${e.categoria} ${e.fornitore ?? ''}`}
        searchPlaceholder="Cerca spesa…"
        exportName="spese"
        exportTitle="Fatture & Spese"
        exportColumns={exportColumns}
        filters={filters}
        tableId="expenses"
        isLoading={query.isLoading}
        emptyState={<EmptyState icon={Receipt} title="Nessuna spesa registrata" />}
        bulkActions={(selected, clear) => (
          <BulkDelete count={selected.length} noun="spese" onDelete={() => del.mutateAsync(selected.map((e) => e.id))} onDone={clear} />
        )}
      />
    </div>
  );
}

/** Full-page create/edit form for an expense. */
export function ExpenseFormPage() {
  const { id } = useParams<{ id: string }>();
  const editing = id != null;
  const query = useExpenses();
  const saveMut = useSaveEntity(api.expenses.create, api.expenses.update, 'expenses');
  const row = editing ? (query.data?.expenses ?? []).find((e) => String(e.id) === id) : undefined;

  const initial = useMemo<FormValues>(() => {
    if (!editing) return { categoria: 'generale', ricorrenza: 'una_tantum' };
    return row
      ? {
          descrizione: row.descrizione, categoria: row.categoria, importo: Number(row.importo),
          ricorrenza: row.ricorrenza, fornitore: row.fornitore ?? '',
          data_spesa: row.data_spesa ? String(row.data_spesa).slice(0, 10) : '', note: row.note ?? '',
        }
      : {};
  }, [editing, row]);

  return (
    <EntityFormPage
      title={editing ? 'Modifica spesa' : 'Nuova spesa'}
      backPath="/bills"
      backLabel="Fatture & Spese"
      fields={FIELDS}
      initial={initial}
      loading={editing && !row && query.isLoading}
      submitLabel={editing ? 'Salva modifiche' : 'Registra spesa'}
      onSubmit={async (v) => {
        await saveMut.mutateAsync({
          id: editing ? Number(id) : undefined,
          data: {
            descrizione: v.descrizione, categoria: v.categoria || 'generale', importo: v.importo || 0,
            ricorrenza: v.ricorrenza || 'una_tantum', fornitore: v.fornitore || null,
            data_spesa: v.data_spesa || null, note: v.note || null,
          },
        });
        toast.success(editing ? 'Spesa aggiornata' : 'Spesa registrata');
      }}
    />
  );
}
