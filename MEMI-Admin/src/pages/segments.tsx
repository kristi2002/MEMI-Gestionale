import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { PieChart, Plus, Pencil, Users } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { KpiCard } from '@/components/common/kpi-card';
import { DataTable } from '@/components/data-table/data-table';
import { BulkDelete } from '@/components/data-table/bulk-delete';
import { EmptyState } from '@/components/common/empty-state';
import type { FieldConfig, FormValues } from '@/components/common/entity-form-fields';
import { EntityFormPage } from '@/components/common/entity-form-page';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useSegments, useDeleteMany, useSaveEntity } from '@/hooks/queries';
import { api } from '@/lib/api';
import { eur } from '@/lib/format';
import type { Segment } from '@/types';
import type { ExportColumn } from '@/lib/export';
import { toast } from 'sonner';

const fields: FieldConfig[] = [
  { name: 'nome', label: 'Nome segmento', required: true },
  { name: 'descrizione', label: 'Descrizione', type: 'textarea', wide: true },
  { name: 'min_spent', label: 'Spesa minima (€)', type: 'number', side: true },
  { name: 'min_orders', label: 'Ordini minimi', type: 'number', side: true },
];

const exportColumns: ExportColumn<Segment>[] = [
  { header: 'Nome', accessor: (s) => s.nome },
  { header: 'Descrizione', accessor: (s) => s.descrizione || '' },
  { header: 'Spesa min', accessor: (s) => eur(s.min_spent) },
  { header: 'Ordini min', accessor: (s) => s.min_orders },
  { header: 'Membri', accessor: (s) => s.members },
];

export function SegmentsPage() {
  const query = useSegments();
  const del = useDeleteMany<number>((id) => api.segments.delete(id), 'segments');
  const navigate = useNavigate();
  const rows = query.data?.segments ?? [];

  const columns = useMemo<ColumnDef<Segment, unknown>[]>(
    () => [
      { accessorKey: 'nome', header: 'Segmento', cell: ({ getValue }) => <span className="font-medium">{getValue() as string}</span> },
      { accessorKey: 'descrizione', header: 'Descrizione', cell: ({ getValue }) => <span className="line-clamp-1 max-w-[260px] text-muted-foreground">{(getValue() as string) || '—'}</span> },
      { accessorKey: 'min_spent', header: 'Spesa min', cell: ({ getValue }) => eur(getValue() as string) },
      { accessorKey: 'min_orders', header: 'Ordini min' },
      { accessorKey: 'members', header: 'Membri', cell: ({ getValue }) => <Badge variant="default">{getValue() as number}</Badge> },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(`/segments/${row.original.id}/edit`)}>
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
        title="Segmenti"
        subtitle="Gruppi di clienti definiti da regole di spesa e ordini."
      />
      <div className="mb-4 grid grid-cols-2 gap-4">
        <KpiCard label="Segmenti" value={rows.length} icon={PieChart} tone="primary" loading={query.isLoading} />
        <KpiCard label="Clienti totali" value={query.data?.total_customers ?? 0} icon={Users} tone="info" loading={query.isLoading} />
      </div>
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(s) => String(s.id)}
        searchValue={(s) => `${s.nome} ${s.descrizione ?? ''}`}
        searchPlaceholder="Cerca segmento…"
        exportName="segmenti"
        exportTitle="Segmenti"
        exportColumns={exportColumns}
        primaryAction={
          <Button size="sm" onClick={() => navigate('/segments/new')}>
            <Plus /> Nuovo segmento
          </Button>
        }
        isLoading={query.isLoading}
        emptyState={<EmptyState icon={PieChart} title="Nessun segmento" />}
        bulkActions={(selected, clear) => (
          <BulkDelete count={selected.length} noun="segmenti" onDelete={() => del.mutateAsync(selected.map((s) => s.id))} onDone={clear} />
        )}
      />
    </div>
  );
}

/** Full-page create/edit form for a customer segment. */
export function SegmentFormPage() {
  const { id } = useParams<{ id: string }>();
  const editing = id != null;
  const query = useSegments();
  const save = useSaveEntity(api.segments.create, api.segments.update, 'segments');
  const row = editing ? (query.data?.segments ?? []).find((s) => String(s.id) === id) : undefined;

  const initial = useMemo<FormValues>(() => {
    if (!editing) return {};
    return row ? { nome: row.nome, descrizione: row.descrizione ?? '', min_spent: Number(row.min_spent) || 0, min_orders: row.min_orders ?? 0 } : {};
  }, [editing, row]);

  return (
    <EntityFormPage
      title={editing ? 'Modifica segmento' : 'Nuovo segmento'}
      backPath="/segments"
      backLabel="Segmenti"
      mainTitle="Segmento"
      sideTitle="Regole di appartenenza"
      fields={fields}
      initial={initial}
      loading={editing && !row && query.isLoading}
      submitLabel={editing ? 'Salva modifiche' : 'Crea segmento'}
      onSubmit={async (v) => {
        await save.mutateAsync({ id: editing ? Number(id) : undefined, data: v });
        toast.success('Segmento salvato');
      }}
    />
  );
}
