import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Factory } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/data-table/data-table';
import { BulkDelete } from '@/components/data-table/bulk-delete';
import { EmptyState } from '@/components/common/empty-state';
import { useSuppliers, useDeleteMany } from '@/hooks/queries';
import { api } from '@/lib/api';
import { date } from '@/lib/format';
import type { Supplier } from '@/types';
import type { ExportColumn } from '@/lib/export';

const exportColumns: ExportColumn<Supplier>[] = [
  { header: 'Nome', accessor: (s) => s.nome },
  { header: 'Email', accessor: (s) => s.email || '' },
  { header: 'Telefono', accessor: (s) => s.telefono || '' },
  { header: 'Note', accessor: (s) => s.note || '' },
  { header: 'Creato il', accessor: (s) => date(s.created_at) },
];

export function SuppliersPage() {
  const query = useSuppliers();
  const del = useDeleteMany<number>((id) => api.suppliers.delete(id), 'suppliers');
  const rows = query.data ?? [];

  const columns = useMemo<ColumnDef<Supplier, unknown>[]>(
    () => [
      { accessorKey: 'nome', header: 'Fornitore', cell: ({ getValue }) => <span className="font-medium">{getValue() as string}</span> },
      { accessorKey: 'email', header: 'Email', cell: ({ getValue }) => <span className="text-muted-foreground">{(getValue() as string) || '—'}</span> },
      { accessorKey: 'telefono', header: 'Telefono', cell: ({ getValue }) => <span className="text-muted-foreground">{(getValue() as string) || '—'}</span> },
      { accessorKey: 'note', header: 'Note', cell: ({ getValue }) => <span className="line-clamp-1 max-w-[280px] text-muted-foreground">{(getValue() as string) || '—'}</span> },
      { accessorKey: 'created_at', header: 'Creato il', cell: ({ getValue }) => <span className="text-muted-foreground">{date(getValue() as string)}</span> },
    ],
    [],
  );

  return (
    <div>
      <PageHeader title="Fornitori" subtitle="Anagrafica fornitori per gli ordini di acquisto." />
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(s) => String(s.id)}
        searchValue={(s) => `${s.nome} ${s.email ?? ''} ${s.telefono ?? ''}`}
        searchPlaceholder="Cerca fornitore…"
        exportName="fornitori"
        exportTitle="Fornitori"
        exportColumns={exportColumns}
        isLoading={query.isLoading}
        emptyState={<EmptyState icon={Factory} title="Nessun fornitore" />}
        bulkActions={(selected, clear) => (
          <BulkDelete count={selected.length} noun="fornitori" onDelete={() => del.mutateAsync(selected.map((s) => s.id))} onDone={clear} />
        )}
      />
    </div>
  );
}
