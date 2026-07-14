import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { MapPin, Plus, Pencil } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/data-table/data-table';
import { BulkDelete } from '@/components/data-table/bulk-delete';
import { EmptyState } from '@/components/common/empty-state';
import { EntityFormDialog, useEntityForm, type FieldConfig, type FormValues } from '@/components/common/entity-form-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { usePickup, useDeleteMany, useSaveEntity } from '@/hooks/queries';
import { api } from '@/lib/api';
import type { PickupPoint } from '@/types';
import type { ExportColumn } from '@/lib/export';
import { toast } from 'sonner';

const fields: FieldConfig[] = [
  { name: 'nome', label: 'Nome punto', required: true },
  { name: 'corriere', label: 'Corriere' },
  { name: 'indirizzo', label: 'Indirizzo', wide: true, required: true },
  { name: 'orari', label: 'Orari', wide: true, placeholder: 'Lun-Ven 9-18' },
  { name: 'attivo', label: 'Attivo', type: 'checkbox' },
];

const exportColumns: ExportColumn<PickupPoint>[] = [
  { header: 'Nome', accessor: (p) => p.nome },
  { header: 'Indirizzo', accessor: (p) => p.indirizzo },
  { header: 'Corriere', accessor: (p) => p.corriere || '' },
  { header: 'Orari', accessor: (p) => p.orari || '' },
  { header: 'Attivo', accessor: (p) => (p.attivo ? 'Sì' : 'No') },
];

export function PickupPage() {
  const query = usePickup();
  const del = useDeleteMany<number>((id) => api.pickup.delete(id), 'pickup');
  const save = useSaveEntity(api.pickup.create, api.pickup.update, 'pickup');
  const form = useEntityForm();
  const rows = query.data ?? [];

  const columns = useMemo<ColumnDef<PickupPoint, unknown>[]>(
    () => [
      { accessorKey: 'nome', header: 'Punto', cell: ({ getValue }) => <span className="font-medium">{getValue() as string}</span> },
      { accessorKey: 'indirizzo', header: 'Indirizzo', cell: ({ getValue }) => <span className="text-muted-foreground">{getValue() as string}</span> },
      { accessorKey: 'corriere', header: 'Corriere', cell: ({ getValue }) => <span className="uppercase text-muted-foreground">{(getValue() as string) || '—'}</span> },
      { accessorKey: 'orari', header: 'Orari', cell: ({ getValue }) => <span className="text-muted-foreground">{(getValue() as string) || '—'}</span> },
      { accessorKey: 'attivo', header: 'Stato', cell: ({ getValue }) => (getValue() ? <Badge variant="success">Attivo</Badge> : <Badge variant="neutral">Disattivo</Badge>) },
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
        title="Punti di ritiro"
        subtitle="Sedi dove i clienti possono ritirare gli ordini."
        actions={
          <Button size="sm" onClick={form.openCreate}>
            <Plus /> Nuovo punto
          </Button>
        }
      />
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(p) => String(p.id)}
        searchValue={(p) => `${p.nome} ${p.indirizzo} ${p.corriere ?? ''}`}
        searchPlaceholder="Cerca punto di ritiro…"
        exportName="punti_ritiro"
        exportTitle="Punti di ritiro"
        exportColumns={exportColumns}
        isLoading={query.isLoading}
        emptyState={<EmptyState icon={MapPin} title="Nessun punto di ritiro" />}
        bulkActions={(selected, clear) => (
          <BulkDelete count={selected.length} noun="punti" onDelete={() => del.mutateAsync(selected.map((p) => p.id))} onDone={clear} />
        )}
      />
      <EntityFormDialog
        open={form.open}
        onOpenChange={form.setOpen}
        title={form.editing ? 'Modifica punto di ritiro' : 'Nuovo punto di ritiro'}
        fields={fields}
        initial={form.editing}
        onSubmit={async (values) => {
          await save.mutateAsync({ id: form.editing?.id as number | undefined, data: values });
          toast.success('Punto di ritiro salvato');
        }}
      />
    </div>
  );
}
