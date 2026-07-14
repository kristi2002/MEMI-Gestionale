import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { FileText } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { KpiCard } from '@/components/common/kpi-card';
import { DataTable } from '@/components/data-table/data-table';
import { BulkDelete } from '@/components/data-table/bulk-delete';
import { StatusBadge } from '@/components/common/status-badge';
import { EmptyState } from '@/components/common/empty-state';
import { useInvoices, useDeleteMany } from '@/hooks/queries';
import { api } from '@/lib/api';
import { eur, date } from '@/lib/format';
import { statusLabel } from '@/lib/status';
import type { Invoice } from '@/types';
import type { ExportColumn } from '@/lib/export';

const exportColumns: ExportColumn<Invoice>[] = [
  { header: 'N° Fattura', accessor: (i) => i.invoice_number },
  { header: 'Ordine', accessor: (i) => i.order_number || String(i.order_id) },
  { header: 'Cliente', accessor: (i) => `${i.customer_nome} ${i.customer_cognome}`.trim() },
  { header: 'Email', accessor: (i) => i.customer_email },
  { header: 'Imponibile', accessor: (i) => eur(Number(i.total) - Number(i.tax_amount)) },
  { header: 'IVA', accessor: (i) => eur(i.tax_amount) },
  { header: 'Totale', accessor: (i) => eur(i.total) },
  { header: 'Stato', accessor: (i) => statusLabel(i.stato) },
  { header: 'Data', accessor: (i) => date(i.created_at) },
];

export function InvoicesPage() {
  const query = useInvoices();
  const del = useDeleteMany<number>((id) => api.invoices.delete(id), 'invoices');
  const rows = query.data?.invoices ?? [];

  const counts = useMemo(
    () => ({
      total: rows.length,
      emesse: rows.filter((i) => i.stato === 'emessa' || i.stato === 'inviata').length,
      pagate: rows.filter((i) => i.stato === 'pagata').length,
    }),
    [rows],
  );

  const columns = useMemo<ColumnDef<Invoice, unknown>[]>(
    () => [
      { accessorKey: 'invoice_number', header: 'N° Fattura', cell: ({ getValue }) => <span className="font-semibold">{getValue() as string}</span> },
      { id: 'ordine', header: 'Ordine', accessorFn: (i) => i.order_number || i.order_id, cell: ({ row }) => <span className="text-muted-foreground">{row.original.order_number || `Ord. ${row.original.order_id}`}</span> },
      { id: 'cliente', header: 'Cliente', accessorFn: (i) => `${i.customer_nome} ${i.customer_cognome}`, cell: ({ row }) => <span className="truncate font-medium">{`${row.original.customer_nome} ${row.original.customer_cognome}`.trim() || '—'}</span> },
      { accessorKey: 'created_at', header: 'Data', cell: ({ getValue }) => <span className="text-muted-foreground">{date(getValue() as string)}</span> },
      { accessorKey: 'total', header: 'Totale', cell: ({ getValue }) => <span className="font-semibold">{eur(getValue() as string)}</span>, sortingFn: (a, b) => Number(a.original.total) - Number(b.original.total) },
      { accessorKey: 'stato', header: 'Stato', cell: ({ getValue }) => <StatusBadge code={getValue() as string} /> },
    ],
    [],
  );

  return (
    <div>
      <PageHeader title="Fatture" subtitle="Documenti fiscali emessi." />
      <div className="mb-4 grid grid-cols-3 gap-4">
        <KpiCard label="Totale fatture" value={counts.total} tone="primary" loading={query.isLoading} />
        <KpiCard label="Emesse / Inviate" value={counts.emesse} tone="info" loading={query.isLoading} />
        <KpiCard label="Pagate" value={counts.pagate} tone="success" loading={query.isLoading} />
      </div>
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(i) => String(i.id)}
        searchValue={(i) => `${i.invoice_number} ${i.order_number ?? ''} ${i.customer_nome} ${i.customer_cognome} ${i.customer_email}`}
        searchPlaceholder="Cerca fattura o cliente…"
        exportName="fatture"
        exportTitle="Fatture"
        exportColumns={exportColumns}
        isLoading={query.isLoading}
        emptyState={<EmptyState icon={FileText} title="Nessuna fattura emessa" />}
        bulkActions={(selected, clear) => (
          <BulkDelete count={selected.length} noun="fatture" onDelete={() => del.mutateAsync(selected.map((i) => i.id))} onDone={clear} />
        )}
      />
    </div>
  );
}
