import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowLeftRight, Plus, Pencil } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/data-table/data-table';
import { BulkDelete } from '@/components/data-table/bulk-delete';
import { StatusBadge } from '@/components/common/status-badge';
import { EmptyState } from '@/components/common/empty-state';
import { EntityFormDialog, useEntityForm, type FieldConfig, type FormValues } from '@/components/common/entity-form-dialog';
import { Button } from '@/components/ui/button';
import { useTransfers, useDeleteMany, useSaveEntity } from '@/hooks/queries';
import { api } from '@/lib/api';
import { date } from '@/lib/format';
import type { Transfer } from '@/types';
import type { ExportColumn } from '@/lib/export';
import { toast } from 'sonner';

const STATI = ['richiesto', 'in_transito', 'completato', 'annullato'].map((v) => ({ value: v, label: v.replace('_', ' ') }));

const fields: FieldConfig[] = [
  { name: 'prodotto', label: 'Prodotto', required: true },
  { name: 'taglia', label: 'Taglia' },
  { name: 'quantita', label: 'Quantità', type: 'number', required: true },
  { name: 'da_luogo', label: 'Da' },
  { name: 'a_luogo', label: 'A' },
  { name: 'stato', label: 'Stato', type: 'select', options: STATI },
  { name: 'note', label: 'Note', type: 'textarea', wide: true },
];

const exportColumns: ExportColumn<Transfer>[] = [
  { header: 'Prodotto', accessor: (t) => t.prodotto },
  { header: 'Taglia', accessor: (t) => t.taglia || '' },
  { header: 'Quantità', accessor: (t) => t.quantita },
  { header: 'Da', accessor: (t) => t.da_luogo || '' },
  { header: 'A', accessor: (t) => t.a_luogo || '' },
  { header: 'Stato', accessor: (t) => t.stato },
  { header: 'Data', accessor: (t) => date(t.created_at) },
];

export function TransfersPage() {
  const query = useTransfers();
  const del = useDeleteMany<number>((id) => api.transfers.delete(id), 'transfers');
  const save = useSaveEntity(api.transfers.create, api.transfers.update, 'transfers');
  const form = useEntityForm();
  const rows = query.data ?? [];

  const columns = useMemo<ColumnDef<Transfer, unknown>[]>(
    () => [
      { accessorKey: 'prodotto', header: 'Prodotto', cell: ({ getValue }) => <span className="font-medium">{getValue() as string}</span> },
      { accessorKey: 'taglia', header: 'Taglia', cell: ({ getValue }) => <span className="text-muted-foreground">{(getValue() as string) || '—'}</span> },
      { accessorKey: 'quantita', header: 'Qtà' },
      { id: 'rotta', header: 'Rotta', accessorFn: (t) => `${t.da_luogo} ${t.a_luogo}`, cell: ({ row }) => <span className="text-muted-foreground">{(row.original.da_luogo || '?')} → {(row.original.a_luogo || '?')}</span> },
      { accessorKey: 'created_at', header: 'Data', cell: ({ getValue }) => <span className="text-muted-foreground">{date(getValue() as string)}</span> },
      { accessorKey: 'stato', header: 'Stato', cell: ({ getValue }) => <StatusBadge code={getValue() as string} /> },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => form.openEdit(row.original as unknown as FormValues)}>
            <Pencil />
          </Button>
        ),
      },
    ],
    [form],
  );

  return (
    <div>
      <PageHeader
        title="Trasferimenti"
        subtitle="Movimenti di stock tra sedi o magazzini."
        actions={
          <Button size="sm" onClick={form.openCreate}>
            <Plus /> Nuovo trasferimento
          </Button>
        }
      />
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(t) => String(t.id)}
        searchValue={(t) => `${t.prodotto} ${t.da_luogo ?? ''} ${t.a_luogo ?? ''}`}
        searchPlaceholder="Cerca trasferimento…"
        exportName="trasferimenti"
        exportTitle="Trasferimenti"
        exportColumns={exportColumns}
        isLoading={query.isLoading}
        emptyState={<EmptyState icon={ArrowLeftRight} title="Nessun trasferimento" />}
        bulkActions={(selected, clear) => (
          <BulkDelete count={selected.length} noun="trasferimenti" onDelete={() => del.mutateAsync(selected.map((t) => t.id))} onDone={clear} />
        )}
      />
      <EntityFormDialog
        open={form.open}
        onOpenChange={form.setOpen}
        title={form.editing ? 'Modifica trasferimento' : 'Nuovo trasferimento'}
        fields={fields}
        initial={form.editing}
        onSubmit={async (values) => {
          await save.mutateAsync({ id: form.editing?.id as number | undefined, data: values });
          toast.success('Trasferimento salvato');
        }}
      />
    </div>
  );
}
