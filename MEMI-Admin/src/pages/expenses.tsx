import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Receipt, Plus, Pencil, Paperclip } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { KpiCard } from '@/components/common/kpi-card';
import { DataTable } from '@/components/data-table/data-table';
import type { FilterDef } from '@/components/data-table/filters';
import { BulkDelete } from '@/components/data-table/bulk-delete';
import { Badge } from '@/components/ui/badge';
import { AttachmentField } from '@/components/common/attachment-field';
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
  { name: 'importo', label: 'Importo € (totale IVA inclusa)', type: 'number', required: true },
  { name: 'iva_rate', label: 'Aliquota IVA', type: 'select', options: [
      { value: '0', label: '0% (esente / fuori campo)' }, { value: '4', label: '4%' }, { value: '5', label: '5%' },
      { value: '10', label: '10%' }, { value: '22', label: '22% (ordinaria)' },
    ], help: 'L’imponibile e l’IVA sono calcolati dal totale.' },
  { name: 'fornitore', label: 'Fornitore' },
  { name: 'note', label: 'Note', type: 'textarea' },
  { name: 'categoria', label: 'Categoria', type: 'select', side: true, options: [
      { value: 'generale', label: 'Generale' }, { value: 'affitto', label: 'Affitto' }, { value: 'utenze', label: 'Utenze' },
      { value: 'marketing', label: 'Marketing' }, { value: 'stipendi', label: 'Stipendi' }, { value: 'merce', label: 'Merce' },
      { value: 'software', label: 'Software' }, { value: 'spedizioni', label: 'Spedizioni' }, { value: 'tasse', label: 'Tasse' },
    ] },
  { name: 'ricorrenza', label: 'Ricorrenza', type: 'select', side: true, options: [
      { value: 'una_tantum', label: 'Una tantum' }, { value: 'mensile', label: 'Mensile' }, { value: 'annuale', label: 'Annuale' },
    ] },
  { name: 'data_spesa', label: 'Data', type: 'date', side: true },
];

const exportColumns: ExportColumn<Expense>[] = [
  { header: 'Descrizione', accessor: (e) => e.descrizione },
  { header: 'Categoria', accessor: (e) => e.categoria },
  { header: 'Imponibile', accessor: (e) => eur(e.imponibile ?? e.importo) },
  { header: 'Aliquota IVA', accessor: (e) => `${Number(e.iva_rate ?? 0)}%` },
  { header: 'IVA', accessor: (e) => eur(e.iva_amount ?? 0) },
  { header: 'Totale', accessor: (e) => eur(e.importo) },
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
      {
        id: 'iva', header: 'IVA', accessorFn: (e) => Number(e.iva_amount ?? 0),
        cell: ({ row }) => {
          const rate = Number(row.original.iva_rate ?? 0);
          const amt = Number(row.original.iva_amount ?? 0);
          if (!rate) return <span className="text-muted-foreground">—</span>;
          return <span className="whitespace-nowrap text-muted-foreground">{eur(amt)} <Badge variant="neutral">{rate}%</Badge></span>;
        },
      },
      { accessorKey: 'importo', header: 'Totale', cell: ({ getValue }) => <span className="font-semibold">{eur(getValue() as string)}</span>, sortingFn: (a, b) => Number(a.original.importo) - Number(b.original.importo) },
      {
        id: 'allegato', header: '', enableSorting: false,
        cell: ({ row }) => row.original.attachment_url
          ? <a href={row.original.attachment_url} target="_blank" rel="noopener noreferrer" title="Allegato" onClick={(e) => e.stopPropagation()} className="text-muted-foreground hover:text-primary"><Paperclip className="h-4 w-4" /></a>
          : null,
      },
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
      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Totale spese" value={eur(s?.total ?? 0)} icon={Receipt} tone="primary" loading={query.isLoading} />
        <KpiCard label="Questo mese" value={eur(s?.month ?? 0)} tone="info" loading={query.isLoading} />
        <KpiCard label="Ricorrenti / mese" value={eur(s?.monthly_recurring ?? 0)} tone="warning" loading={query.isLoading} />
        <KpiCard label="IVA totale" value={eur(s?.iva_total ?? 0)} icon={Receipt} tone="muted" loading={query.isLoading} />
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
    if (!editing) return { categoria: 'generale', ricorrenza: 'una_tantum', iva_rate: '22' };
    return row
      ? {
          descrizione: row.descrizione, categoria: row.categoria, importo: Number(row.importo),
          ricorrenza: row.ricorrenza, fornitore: row.fornitore ?? '', iva_rate: String(row.iva_rate ?? 0),
          data_spesa: row.data_spesa ? String(row.data_spesa).slice(0, 10) : '', note: row.note ?? '',
          attachment_url: row.attachment_url ?? null,
        }
      : {};
  }, [editing, row]);

  return (
    <EntityFormPage
      title={editing ? 'Modifica spesa' : 'Nuova spesa'}
      backPath="/bills"
      backLabel="Fatture & Spese"
      mainTitle="Dettagli spesa"
      sideTitle="Classificazione"
      fields={FIELDS}
      initial={initial}
      loading={editing && !row && query.isLoading}
      submitLabel={editing ? 'Salva modifiche' : 'Registra spesa'}
      extra={(values, set) => (
        <AttachmentField url={values.attachment_url as string | null | undefined} onChange={(u) => set('attachment_url', u)} uploadFn={api.expenses.uploadAttachment} />
      )}
      onSubmit={async (v) => {
        await saveMut.mutateAsync({
          id: editing ? Number(id) : undefined,
          data: {
            descrizione: v.descrizione, categoria: v.categoria || 'generale', importo: v.importo || 0,
            ricorrenza: v.ricorrenza || 'una_tantum', fornitore: v.fornitore || null,
            iva_rate: v.iva_rate ?? '0', attachment_url: (v.attachment_url as string) || null,
            data_spesa: v.data_spesa || null, note: v.note || null,
          },
        });
        toast.success(editing ? 'Spesa aggiornata' : 'Spesa registrata');
      }}
    />
  );
}
