import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Trash2, BadgePercent } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/data-table/data-table';
import { StatusBadge } from '@/components/common/status-badge';
import { EmptyState } from '@/components/common/empty-state';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { Button } from '@/components/ui/button';
import { useDiscounts, useDeleteDiscounts } from '@/hooks/queries';
import { eur, date } from '@/lib/format';
import type { Discount } from '@/types';
import type { ExportColumn } from '@/lib/export';
import { toast } from 'sonner';

function tipoLabel(d: Discount): string {
  if (d.tipo === 'percentuale') return `Percentuale ${d.valore}%`;
  if (d.tipo === 'fisso') return `${eur(d.valore)} fisso`;
  return 'Spedizione gratuita';
}

const exportColumns: ExportColumn<Discount>[] = [
  { header: 'Codice', accessor: (d) => d.code },
  { header: 'Tipo', accessor: (d) => tipoLabel(d) },
  { header: 'Utilizzi', accessor: (d) => `${d.utilizzi}/${d.max_utilizzi ?? '∞'}` },
  { header: 'Ordine minimo', accessor: (d) => eur(d.min_order) },
  { header: 'Scadenza', accessor: (d) => (d.scadenza ? date(d.scadenza) : '—') },
  { header: 'Stato', accessor: (d) => d.stato },
];

export function DiscountsPage() {
  const query = useDiscounts();
  const deleteMut = useDeleteDiscounts();
  const rows = query.data ?? [];

  const columns = useMemo<ColumnDef<Discount, unknown>[]>(
    () => [
      {
        accessorKey: 'code',
        header: 'Codice',
        cell: ({ getValue }) => (
          <code className="rounded bg-muted px-2 py-1 text-sm font-semibold">{getValue() as string}</code>
        ),
      },
      { id: 'tipo', header: 'Tipo', accessorFn: (d) => tipoLabel(d) },
      {
        id: 'utilizzi',
        header: 'Utilizzi',
        accessorFn: (d) => d.utilizzi,
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.utilizzi}/{row.original.max_utilizzi ?? '∞'}
          </span>
        ),
      },
      { accessorKey: 'min_order', header: 'Ordine min.', cell: ({ getValue }) => eur(getValue() as string) },
      {
        accessorKey: 'scadenza',
        header: 'Scadenza',
        cell: ({ getValue }) => <span className="text-muted-foreground">{getValue() ? date(getValue() as string) : '—'}</span>,
      },
      { accessorKey: 'stato', header: 'Stato', cell: ({ getValue }) => <StatusBadge code={getValue() as string} /> },
    ],
    [],
  );

  return (
    <div>
      <PageHeader title="Sconti" subtitle="Codici promozionali e regole di sconto." />

      <DataTable
        columns={columns}
        data={rows}
        getRowId={(d) => String(d.id)}
        searchValue={(d) => `${d.code} ${d.tipo}`}
        searchPlaceholder="Cerca codice…"
        exportName="sconti"
        exportTitle="Codici sconto"
        exportColumns={exportColumns}
        isLoading={query.isLoading}
        emptyState={<EmptyState icon={BadgePercent} title="Nessun codice sconto" />}
        bulkActions={(selected, clear) => {
          const ids = selected.map((d) => d.id);
          return (
            <ConfirmDialog
              title={`Eliminare ${ids.length} codici sconto?`}
              confirmLabel="Elimina"
              destructive
              onConfirm={async () => {
                await deleteMut.mutateAsync(ids);
                toast.success(`${ids.length} codici eliminati`);
                clear();
              }}
              trigger={
                <Button variant="destructive" size="sm">
                  <Trash2 /> Elimina
                </Button>
              }
            />
          );
        }}
      />
    </div>
  );
}
