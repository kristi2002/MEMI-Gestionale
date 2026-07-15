import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Globe, Plus, Pencil } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/data-table/data-table';
import { BulkDelete } from '@/components/data-table/bulk-delete';
import { EmptyState } from '@/components/common/empty-state';
import type { FieldConfig, FormValues } from '@/components/common/entity-form-fields';
import { EntityFormPage } from '@/components/common/entity-form-page';
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
  { name: 'prezzo', label: 'Prezzo (€)', type: 'number', required: true, side: true },
  { name: 'spedizione_gratuita_da', label: 'Spedizione gratuita da (€)', type: 'number', side: true, help: 'Vuoto = mai gratuita' },
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
  const navigate = useNavigate();
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
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(`/shipping-zones/${row.original.id}/edit`)}>
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
        title="Zone & Tariffe"
        subtitle="Regole di spedizione per area geografica."
        actions={
          <Button size="sm" onClick={() => navigate('/shipping-zones/new')}>
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
    </div>
  );
}

/** Full-page create/edit form for a shipping zone. */
export function ShippingZoneFormPage() {
  const { id } = useParams<{ id: string }>();
  const editing = id != null;
  const query = useZones();
  const save = useSaveEntity(api.zones.create, api.zones.update, 'zones');
  const row = editing ? (query.data ?? []).find((z) => String(z.id) === id) : undefined;

  const initial = useMemo<FormValues>(() => {
    if (!editing) return {};
    return row
      ? { nome: row.nome, metodo: row.metodo ?? '', paesi: row.paesi ?? '', prezzo: Number(row.prezzo) || 0, spedizione_gratuita_da: row.spedizione_gratuita_da == null ? '' : Number(row.spedizione_gratuita_da) }
      : {};
  }, [editing, row]);

  return (
    <EntityFormPage
      title={editing ? 'Modifica zona' : 'Nuova zona'}
      backPath="/shipping-zones"
      backLabel="Zone & Tariffe"
      mainTitle="Zona"
      sideTitle="Tariffa"
      fields={fields}
      initial={initial}
      loading={editing && !row && query.isLoading}
      submitLabel={editing ? 'Salva modifiche' : 'Crea zona'}
      onSubmit={async (v) => {
        await save.mutateAsync({ id: editing ? Number(id) : undefined, data: v });
        toast.success('Zona salvata');
      }}
    />
  );
}
