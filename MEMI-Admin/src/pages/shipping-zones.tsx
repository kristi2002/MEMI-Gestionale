import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Globe, Plus, Pencil } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/data-table/data-table';
import { BulkDelete } from '@/components/data-table/bulk-delete';
import { EmptyState } from '@/components/common/empty-state';
import { EntityFormDialog, useEntityForm, type FieldConfig, type FormValues } from '@/components/common/entity-form-dialog';
import { Button } from '@/components/ui/button';
import { useZones, useDeleteMany, useSaveEntity } from '@/hooks/queries';
import { api } from '@/lib/api';
import { eur } from '@/lib/format';
import type { ShippingZone } from '@/types';
import type { ExportColumn } from '@/lib/export';
import { toast } from 'sonner';

const fields: FieldConfig[] = [
  { name: 'nome', label: 'Nome zona', required: true, placeholder: 'Italia, Europa…' },
  { name: 'metodo', label: 'Metodo', placeholder: 'standard / express' },
  { name: 'paesi', label: 'Paesi (codici ISO, separati da virgola)', wide: true, placeholder: 'IT, FR, DE' },
  { name: 'prezzo', label: 'Prezzo (€)', type: 'number', required: true },
  { name: 'spedizione_gratuita_da', label: 'Spedizione gratuita da (€)', type: 'number', help: 'Vuoto = mai gratuita' },
];

const exportColumns: ExportColumn<ShippingZone>[] = [
  { header: 'Nome', accessor: (z) => z.nome },
  { header: 'Paesi', accessor: (z) => z.paesi || '' },
  { header: 'Metodo', accessor: (z) => z.metodo || '' },
  { header: 'Prezzo', accessor: (z) => eur(z.prezzo) },
  { header: 'Gratis da', accessor: (z) => (z.spedizione_gratuita_da ? eur(z.spedizione_gratuita_da) : '') },
];

export function ShippingZonesPage() {
  const query = useZones();
  const del = useDeleteMany<number>((id) => api.zones.delete(id), 'zones');
  const save = useSaveEntity(api.zones.create, api.zones.update, 'zones');
  const form = useEntityForm();
  const rows = query.data ?? [];

  const columns = useMemo<ColumnDef<ShippingZone, unknown>[]>(
    () => [
      { accessorKey: 'nome', header: 'Zona', cell: ({ getValue }) => <span className="font-medium">{getValue() as string}</span> },
      { accessorKey: 'paesi', header: 'Paesi', cell: ({ getValue }) => <span className="text-muted-foreground">{(getValue() as string) || '—'}</span> },
      { accessorKey: 'metodo', header: 'Metodo', cell: ({ getValue }) => <span className="capitalize text-muted-foreground">{(getValue() as string) || '—'}</span> },
      { accessorKey: 'prezzo', header: 'Prezzo', cell: ({ getValue }) => <span className="font-semibold">{eur(getValue() as string)}</span> },
      { accessorKey: 'spedizione_gratuita_da', header: 'Gratis da', cell: ({ getValue }) => <span className="text-muted-foreground">{getValue() ? eur(getValue() as string) : '—'}</span> },
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
        title="Zone & Tariffe"
        subtitle="Regole di spedizione per area geografica."
        actions={
          <Button size="sm" onClick={form.openCreate}>
            <Plus /> Nuova zona
          </Button>
        }
      />
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(z) => String(z.id)}
        searchValue={(z) => `${z.nome} ${z.paesi ?? ''} ${z.metodo ?? ''}`}
        searchPlaceholder="Cerca zona…"
        exportName="zone_spedizione"
        exportTitle="Zone & Tariffe"
        exportColumns={exportColumns}
        isLoading={query.isLoading}
        emptyState={<EmptyState icon={Globe} title="Nessuna zona di spedizione" />}
        bulkActions={(selected, clear) => (
          <BulkDelete count={selected.length} noun="zone" onDelete={() => del.mutateAsync(selected.map((z) => z.id))} onDone={clear} />
        )}
      />
      <EntityFormDialog
        open={form.open}
        onOpenChange={form.setOpen}
        title={form.editing ? 'Modifica zona' : 'Nuova zona'}
        fields={fields}
        initial={form.editing}
        onSubmit={async (values) => {
          await save.mutateAsync({ id: form.editing?.id as number | undefined, data: values });
          toast.success('Zona salvata');
        }}
      />
    </div>
  );
}
