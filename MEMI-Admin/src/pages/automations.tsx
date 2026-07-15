import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Zap, Power, Plus, Pencil } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/data-table/data-table';
import { BulkDelete } from '@/components/data-table/bulk-delete';
import { EmptyState } from '@/components/common/empty-state';
import type { FieldConfig, FormValues } from '@/components/common/entity-form-fields';
import { EntityFormPage } from '@/components/common/entity-form-page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAutomations, useDeleteMany, useUpdateOne, useSaveEntity } from '@/hooks/queries';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/format';
import type { Automation } from '@/types';
import type { ExportColumn } from '@/lib/export';
import { toast } from 'sonner';

const humanize = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

function automationFields(triggers: string[], actions: string[]): FieldConfig[] {
  return [
    { name: 'nome', label: 'Nome', required: true, wide: true, placeholder: 'es. Email di benvenuto' },
    { name: 'oggetto', label: 'Oggetto', wide: true, help: 'Facoltativo — oggetto dell’email inviata.' },
    { name: 'messaggio', label: 'Messaggio', type: 'textarea', wide: true, help: 'Facoltativo.' },
    { name: 'trigger_event', label: 'Quando (trigger)', type: 'select', required: true, side: true, placeholder: 'Seleziona evento…',
      options: triggers.map((t) => ({ value: t, label: humanize(t) })) },
    { name: 'azione', label: 'Azione', type: 'select', required: true, side: true, placeholder: 'Seleziona azione…',
      options: actions.map((a) => ({ value: a, label: humanize(a) })) },
    { name: 'attivo', label: 'Attiva subito', type: 'checkbox', side: true },
  ];
}

const exportColumns: ExportColumn<Automation>[] = [
  { header: 'Nome', accessor: (a) => a.nome },
  { header: 'Trigger', accessor: (a) => a.trigger_event },
  { header: 'Azione', accessor: (a) => a.azione },
  { header: 'Attivo', accessor: (a) => (a.attivo ? 'Sì' : 'No') },
  { header: 'Esecuzioni', accessor: (a) => a.run_count },
  { header: 'Ultima', accessor: (a) => (a.last_run ? dateTime(a.last_run) : '') },
];

export function AutomationsPage() {
  const query = useAutomations();
  const del = useDeleteMany<number>((id) => api.automations.delete(id), 'automations');
  const update = useUpdateOne<number>((id, data) => api.automations.update(id, data), 'automations');
  const rows = query.data?.automations ?? [];
  const navigate = useNavigate();

  const columns = useMemo<ColumnDef<Automation, unknown>[]>(
    () => [
      { accessorKey: 'nome', header: 'Automazione', cell: ({ getValue }) => <span className="font-medium">{getValue() as string}</span> },
      { accessorKey: 'trigger_event', header: 'Quando', cell: ({ getValue }) => <Badge variant="neutral">{(getValue() as string).replace(/_/g, ' ')}</Badge> },
      { accessorKey: 'azione', header: 'Fa', cell: ({ getValue }) => <span className="text-muted-foreground">{(getValue() as string).replace(/_/g, ' ')}</span> },
      { accessorKey: 'run_count', header: 'Eseguita', cell: ({ getValue }) => <span className="text-muted-foreground">{getValue() as number}×</span> },
      { accessorKey: 'last_run', header: 'Ultima', cell: ({ getValue }) => <span className="text-muted-foreground">{getValue() ? dateTime(getValue() as string) : '—'}</span> },
      {
        accessorKey: 'attivo',
        header: 'Stato',
        cell: ({ row }) => (
          <Button
            variant={row.original.attivo ? 'secondary' : 'outline'}
            size="sm"
            className="h-7"
            onClick={() => update.mutate({ id: row.original.id, data: { attivo: row.original.attivo ? 0 : 1 } })}
          >
            <Power className={row.original.attivo ? 'text-success' : 'text-muted-foreground'} />
            {row.original.attivo ? 'Attiva' : 'Off'}
          </Button>
        ),
      },
      {
        id: 'azioni',
        header: '',
        enableSorting: false,
        cell: ({ row }) => (
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/automations/${row.original.id}/edit`); }}>
            <Pencil /> Modifica
          </Button>
        ),
      },
    ],
    [update, navigate],
  );

  return (
    <div>
      <PageHeader
        title="Automazioni"
        subtitle="Azioni automatiche attivate da eventi dello store."
      />
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(a) => String(a.id)}
        searchValue={(a) => `${a.nome} ${a.trigger_event} ${a.azione}`}
        searchPlaceholder="Cerca automazione…"
        exportName="automazioni"
        exportTitle="Automazioni"
        exportColumns={exportColumns}
        primaryAction={
          <Button size="sm" onClick={() => navigate('/automations/new')}>
            <Plus /> Nuova automazione
          </Button>
        }
        isLoading={query.isLoading}
        emptyState={<EmptyState icon={Zap} title="Nessuna automazione" />}
        bulkActions={(selected, clear) => (
          <BulkDelete count={selected.length} noun="automazioni" onDelete={() => del.mutateAsync(selected.map((a) => a.id))} onDone={clear} />
        )}
      />

    </div>
  );
}

/** Full-page create/edit form for an automation. */
export function AutomationFormPage() {
  const { id } = useParams<{ id: string }>();
  const editing = id != null;
  const query = useAutomations();
  const saveMut = useSaveEntity(api.automations.create, api.automations.update, 'automations');
  const triggers = query.data?.triggers ?? [];
  const actions = query.data?.actions ?? [];
  const row = editing ? (query.data?.automations ?? []).find((a) => String(a.id) === id) : undefined;

  const initial = useMemo<FormValues>(() => {
    if (!editing) return { attivo: true, trigger_event: triggers[0] ?? '', azione: actions[0] ?? '' };
    return row
      ? { nome: row.nome, trigger_event: row.trigger_event, azione: row.azione, oggetto: row.oggetto ?? '', messaggio: row.messaggio ?? '', attivo: !!row.attivo }
      : {};
  }, [editing, row, triggers, actions]);

  return (
    <EntityFormPage
      title={editing ? `Modifica${row ? `: ${row.nome}` : ' automazione'}` : 'Nuova automazione'}
      backPath="/automations"
      backLabel="Automazioni"
      mainTitle="Automazione"
      sideTitle="Trigger & azione"
      fields={automationFields(triggers, actions)}
      initial={initial}
      loading={editing && !row && query.isLoading}
      submitLabel={editing ? 'Salva modifiche' : 'Crea automazione'}
      onSubmit={async (v) => {
        await saveMut.mutateAsync({
          id: editing ? Number(id) : undefined,
          data: { nome: v.nome, trigger_event: v.trigger_event, azione: v.azione, oggetto: v.oggetto || null, messaggio: v.messaggio || null, attivo: v.attivo ? 1 : 0 },
        });
        toast.success(editing ? 'Automazione aggiornata' : 'Automazione creata');
      }}
    />
  );
}
