import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Receipt } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { KpiCard } from '@/components/common/kpi-card';
import { DataTable } from '@/components/data-table/data-table';
import { BulkDelete } from '@/components/data-table/bulk-delete';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/common/empty-state';
import { useExpenses, useDeleteMany } from '@/hooks/queries';
import { api } from '@/lib/api';
import { eur, date } from '@/lib/format';
import type { Expense } from '@/types';
import type { ExportColumn } from '@/lib/export';

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
  const rows = query.data?.expenses ?? [];
  const s = query.data?.summary;

  const columns = useMemo<ColumnDef<Expense, unknown>[]>(
    () => [
      { accessorKey: 'descrizione', header: 'Descrizione', cell: ({ getValue }) => <span className="font-medium">{getValue() as string}</span> },
      { accessorKey: 'categoria', header: 'Categoria', cell: ({ getValue }) => <Badge variant="neutral">{getValue() as string}</Badge> },
      { accessorKey: 'ricorrenza', header: 'Ricorrenza', cell: ({ getValue }) => <span className="text-muted-foreground">{(getValue() as string).replace('_', ' ')}</span> },
      { accessorKey: 'fornitore', header: 'Fornitore', cell: ({ getValue }) => <span className="text-muted-foreground">{(getValue() as string) || '—'}</span> },
      { accessorKey: 'data_spesa', header: 'Data', cell: ({ getValue }) => <span className="text-muted-foreground">{getValue() ? date(getValue() as string) : '—'}</span> },
      { accessorKey: 'importo', header: 'Importo', cell: ({ getValue }) => <span className="font-semibold">{eur(getValue() as string)}</span>, sortingFn: (a, b) => Number(a.original.importo) - Number(b.original.importo) },
    ],
    [],
  );

  return (
    <div>
      <PageHeader title="Fatture & Spese" subtitle="Costi operativi e spese ricorrenti." />
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
        isLoading={query.isLoading}
        emptyState={<EmptyState icon={Receipt} title="Nessuna spesa registrata" />}
        bulkActions={(selected, clear) => (
          <BulkDelete count={selected.length} noun="spese" onDelete={() => del.mutateAsync(selected.map((e) => e.id))} onDone={clear} />
        )}
      />
    </div>
  );
}
