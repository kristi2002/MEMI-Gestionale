import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { MapPin, Plus, Pencil } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/data-table/data-table';
import { BulkDelete } from '@/components/data-table/bulk-delete';
import { EmptyState } from '@/components/common/empty-state';
import type { FieldConfig, FormValues } from '@/components/common/entity-form-fields';
import { EntityFormPage } from '@/components/common/entity-form-page';
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
  const navigate = useNavigate();
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
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(`/pickup/${row.original.id}/edit`)}>
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
        title="Punti di ritiro"
        subtitle="Sedi dove i clienti possono ritirare gli ordini."
        actions={
          <Button size="sm" onClick={() => navigate('/pickup/new')}>
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
    </div>
  );
}

/** Full-page create/edit form for a pickup point. */
export function PickupFormPage() {
  const { id } = useParams<{ id: string }>();
  const editing = id != null;
  const query = usePickup();
  const save = useSaveEntity(api.pickup.create, api.pickup.update, 'pickup');
  const row = editing ? (query.data ?? []).find((p) => String(p.id) === id) : undefined;

  const initial = useMemo<FormValues>(() => {
    if (!editing) return { attivo: true };
    return row ? { nome: row.nome, corriere: row.corriere ?? '', indirizzo: row.indirizzo, orari: row.orari ?? '', attivo: !!row.attivo } : {};
  }, [editing, row]);

  return (
    <EntityFormPage
      title={editing ? 'Modifica punto di ritiro' : 'Nuovo punto di ritiro'}
      backPath="/pickup"
      backLabel="Punti di ritiro"
      fields={fields}
      initial={initial}
      loading={editing && !row && query.isLoading}
      submitLabel={editing ? 'Salva modifiche' : 'Crea punto'}
      onSubmit={async (v) => {
        await save.mutateAsync({ id: editing ? Number(id) : undefined, data: v });
        toast.success('Punto di ritiro salvato');
      }}
    />
  );
}
