import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowLeftRight, Plus, Pencil } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/data-table/data-table';
import { BulkDelete } from '@/components/data-table/bulk-delete';
import { StatusBadge } from '@/components/common/status-badge';
import { EmptyState } from '@/components/common/empty-state';
import type { FieldConfig, FormValues } from '@/components/common/entity-form-fields';
import { EntityFormPage } from '@/components/common/entity-form-page';
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
  { name: 'stato', label: 'Stato', type: 'select', side: true, options: STATI },
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
  const navigate = useNavigate();
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
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(`/transfers/${row.original.id}/edit`)}>
            <Pencil />
          </Button>
        ),
      },
    ],
    [navigate],
  );

  return (
    <div>
      <PageHeader
        title="Trasferimenti"
        subtitle="Movimenti di stock tra sedi o magazzini."
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
        primaryAction={
          <Button size="sm" onClick={() => navigate('/transfers/new')}>
            <Plus /> Nuovo trasferimento
          </Button>
        }
        isLoading={query.isLoading}
        emptyState={<EmptyState icon={ArrowLeftRight} title="Nessun trasferimento" />}
        bulkActions={(selected, clear) => (
          <BulkDelete count={selected.length} noun="trasferimenti" onDelete={() => del.mutateAsync(selected.map((t) => t.id))} onDone={clear} />
        )}
      />
    </div>
  );
}

/** Full-page create/edit form for a stock transfer. */
export function TransferFormPage() {
  const { id } = useParams<{ id: string }>();
  const editing = id != null;
  const query = useTransfers();
  const save = useSaveEntity(api.transfers.create, api.transfers.update, 'transfers');
  const row = editing ? (query.data ?? []).find((t) => String(t.id) === id) : undefined;

  const initial = useMemo<FormValues>(() => {
    if (!editing) return { stato: 'richiesto' };
    return row
      ? { prodotto: row.prodotto, taglia: row.taglia ?? '', quantita: row.quantita, da_luogo: row.da_luogo ?? '', a_luogo: row.a_luogo ?? '', stato: row.stato, note: row.note ?? '' }
      : {};
  }, [editing, row]);

  return (
    <EntityFormPage
      title={editing ? 'Modifica trasferimento' : 'Nuovo trasferimento'}
      backPath="/transfers"
      backLabel="Trasferimenti"
      mainTitle="Trasferimento"
      sideTitle="Stato"
      fields={fields}
      initial={initial}
      loading={editing && !row && query.isLoading}
      submitLabel={editing ? 'Salva modifiche' : 'Crea trasferimento'}
      onSubmit={async (v) => {
        await save.mutateAsync({ id: editing ? Number(id) : undefined, data: v });
        toast.success('Trasferimento salvato');
      }}
    />
  );
}
