import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Truck } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/data-table/data-table';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/common/empty-state';
import { useCouriers } from '@/hooks/queries';
import { eur } from '@/lib/format';
import type { Courier } from '@/types';
import type { ExportColumn } from '@/lib/export';

const exportColumns: ExportColumn<Courier>[] = [
  { header: 'Codice', accessor: (c) => c.code },
  { header: 'Nome', accessor: (c) => c.nome },
  { header: 'Tariffa', accessor: (c) => eur(c.rate) },
  { header: 'Attivo', accessor: (c) => (c.attivo ? 'Sì' : 'No') },
  { header: 'Tracking URL', accessor: (c) => c.tracking_url_template || '' },
];

export function CouriersPage() {
  const query = useCouriers();
  const rows = query.data ?? [];

  const columns = useMemo<ColumnDef<Courier, unknown>[]>(
    () => [
      { accessorKey: 'nome', header: 'Corriere', cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="flex h-7 items-center rounded-md bg-muted px-2 text-xs font-bold uppercase text-muted-foreground">{row.original.slug || row.original.code}</span>
          <span className="font-medium">{row.original.nome}</span>
        </div>
      ) },
      { accessorKey: 'rate', header: 'Tariffa', cell: ({ getValue }) => <span className="font-semibold">{eur(getValue() as string)}</span>, sortingFn: (a, b) => Number(a.original.rate) - Number(b.original.rate) },
      { accessorKey: 'tracking_url_template', header: 'Tracking URL', cell: ({ getValue }) => <span className="line-clamp-1 max-w-[280px] text-xs text-muted-foreground">{(getValue() as string) || '—'}</span> },
      { accessorKey: 'attivo', header: 'Stato', cell: ({ getValue }) => (getValue() ? <Badge variant="success">Attivo</Badge> : <Badge variant="neutral">Disattivo</Badge>) },
    ],
    [],
  );

  return (
    <div>
      <PageHeader title="Corrieri" subtitle="Corrieri configurati e relative tariffe." />
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(c) => c.code}
        searchValue={(c) => `${c.code} ${c.nome}`}
        searchPlaceholder="Cerca corriere…"
        exportName="corrieri"
        exportTitle="Corrieri"
        exportColumns={exportColumns}
        isLoading={query.isLoading}
        emptyState={<EmptyState icon={Truck} title="Nessun corriere configurato" />}
      />
    </div>
  );
}
