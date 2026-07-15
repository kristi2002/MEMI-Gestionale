import { useMemo, useRef } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Megaphone, Plus, Pencil } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/data-table/data-table';
import { BulkDelete } from '@/components/data-table/bulk-delete';
import { StatusBadge } from '@/components/common/status-badge';
import { EmptyState } from '@/components/common/empty-state';
import { EntityFormDialog, useEntityForm, type FieldConfig, type FormValues } from '@/components/common/entity-form-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCampaigns, useDeleteMany, useSaveEntity } from '@/hooks/queries';
import { api } from '@/lib/api';
import { eur, num } from '@/lib/format';
import type { Campaign } from '@/types';
import type { ExportColumn } from '@/lib/export';
import { toast } from 'sonner';

const FIELDS: FieldConfig[] = [
  { name: 'nome', label: 'Nome campagna', required: true, wide: true },
  { name: 'tipo', label: 'Tipo', type: 'select', options: [
      { value: 'email', label: 'Email' }, { value: 'ads', label: 'Ads' }, { value: 'automazione', label: 'Automazione' }, { value: 'sms', label: 'SMS' },
    ] },
  { name: 'stato', label: 'Stato', type: 'select', options: [
      { value: 'bozza', label: 'Bozza' }, { value: 'pianificata', label: 'Pianificata' }, { value: 'attiva', label: 'Attiva' }, { value: 'conclusa', label: 'Conclusa' },
    ] },
  { name: 'canale', label: 'Canale', placeholder: 'es. Instagram, Newsletter' },
  { name: 'budget', label: 'Budget €', type: 'number' },
  { name: 'destinatari', label: 'Destinatari', type: 'number' },
];

const exportColumns: ExportColumn<Campaign>[] = [
  { header: 'Nome', accessor: (c) => c.nome },
  { header: 'Tipo', accessor: (c) => c.tipo },
  { header: 'Budget', accessor: (c) => eur(c.budget) },
  { header: 'Destinatari', accessor: (c) => c.destinatari },
  { header: 'Open rate', accessor: (c) => `${num(c.open_rate).toFixed(1)}%` },
  { header: 'Click rate', accessor: (c) => `${num(c.click_rate).toFixed(1)}%` },
  { header: 'Revenue', accessor: (c) => eur(c.revenue) },
  { header: 'Stato', accessor: (c) => c.stato },
];

export function CampaignsPage() {
  const query = useCampaigns();
  const del = useDeleteMany<number>((id) => api.campaigns.delete(id), 'campaigns');
  const saveMut = useSaveEntity(api.campaigns.create, api.campaigns.update, 'campaigns');
  const form = useEntityForm();
  const rows = query.data ?? [];

  const openEditRef = useRef(form.openEdit);
  openEditRef.current = form.openEdit;

  async function onSubmit(v: FormValues) {
    const id = form.editing?.id as number | undefined;
    const data = {
      nome: v.nome, tipo: v.tipo || 'email', canale: v.canale || null,
      budget: v.budget || 0, destinatari: v.destinatari || 0, stato: v.stato || 'bozza',
    };
    await saveMut.mutateAsync({ id, data });
    toast.success(id ? 'Campagna aggiornata' : 'Campagna creata');
  }

  const columns = useMemo<ColumnDef<Campaign, unknown>[]>(
    () => [
      { accessorKey: 'nome', header: 'Campagna', cell: ({ getValue }) => <span className="font-medium">{getValue() as string}</span> },
      { accessorKey: 'tipo', header: 'Tipo', cell: ({ getValue }) => <Badge variant="neutral">{getValue() as string}</Badge> },
      { accessorKey: 'destinatari', header: 'Destinatari', cell: ({ getValue }) => <span className="text-muted-foreground">{(getValue() as number).toLocaleString('it-IT')}</span> },
      { accessorKey: 'open_rate', header: 'Open', cell: ({ getValue }) => `${num(getValue()).toFixed(1)}%` },
      { accessorKey: 'click_rate', header: 'Click', cell: ({ getValue }) => `${num(getValue()).toFixed(1)}%` },
      { accessorKey: 'revenue', header: 'Revenue', cell: ({ getValue }) => <span className="font-semibold">{eur(getValue() as string)}</span>, sortingFn: (a, b) => num(a.original.revenue) - num(b.original.revenue) },
      { accessorKey: 'stato', header: 'Stato', cell: ({ getValue }) => <StatusBadge code={getValue() as string} /> },
      {
        id: 'azioni', header: '', enableSorting: false,
        cell: ({ row }) => (
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openEditRef.current(row.original as unknown as FormValues); }}>
            <Pencil /> Modifica
          </Button>
        ),
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Campagne"
        subtitle="Campagne marketing e relative performance."
        actions={<Button size="sm" onClick={form.openCreate}><Plus /> Nuova campagna</Button>}
      />
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(c) => String(c.id)}
        searchValue={(c) => `${c.nome} ${c.tipo}`}
        searchPlaceholder="Cerca campagna…"
        exportName="campagne"
        exportTitle="Campagne"
        exportColumns={exportColumns}
        isLoading={query.isLoading}
        emptyState={<EmptyState icon={Megaphone} title="Nessuna campagna" />}
        bulkActions={(selected, clear) => (
          <BulkDelete count={selected.length} noun="campagne" onDelete={() => del.mutateAsync(selected.map((c) => c.id))} onDone={clear} />
        )}
      />
      <EntityFormDialog
        open={form.open}
        onOpenChange={form.setOpen}
        title={form.editing ? 'Modifica campagna' : 'Nuova campagna'}
        fields={FIELDS}
        initial={form.editing}
        submitLabel={form.editing ? 'Salva modifiche' : 'Crea campagna'}
        onSubmit={onSubmit}
      />
    </div>
  );
}
