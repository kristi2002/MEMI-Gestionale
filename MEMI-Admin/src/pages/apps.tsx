import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { AppWindow, Power, Plus, Pencil } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/data-table/data-table';
import { BulkDelete } from '@/components/data-table/bulk-delete';
import { EmptyState } from '@/components/common/empty-state';
import type { FieldConfig, FormValues } from '@/components/common/entity-form-fields';
import { EntityFormPage } from '@/components/common/entity-form-page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useApps, useDeleteMany, useUpdateOne } from '@/hooks/queries';
import { api } from '@/lib/api';
import type { AppItem } from '@/types';
import type { ExportColumn } from '@/lib/export';
import { toast } from 'sonner';

const exportColumns: ExportColumn<AppItem>[] = [
  { header: 'App', accessor: (a) => a.nome },
  { header: 'Categoria', accessor: (a) => a.categoria },
  { header: 'Descrizione', accessor: (a) => a.descrizione },
  { header: 'Attiva', accessor: (a) => (a.enabled ? 'Sì' : 'No') },
];

export function AppsPage() {
  const query = useApps();
  const del = useDeleteMany<string>((key) => api.apps.remove(key), 'apps');
  const update = useUpdateOne<string>((key, data) => api.apps.update(key, data), 'apps');
  const rows = query.data?.apps ?? [];
  const navigate = useNavigate();

  const columns = useMemo<ColumnDef<AppItem, unknown>[]>(
    () => [
      {
        id: 'app',
        header: 'App',
        accessorFn: (a) => a.nome,
        cell: ({ row }) => {
          const a = row.original;
          return (
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-lg">{a.icona || '🧩'}</span>
              <div className="min-w-0">
                <div className="truncate font-medium">{a.nome}</div>
                <div className="truncate text-xs text-muted-foreground">{a.descrizione}</div>
              </div>
            </div>
          );
        },
      },
      { accessorKey: 'categoria', header: 'Categoria', cell: ({ getValue }) => <Badge variant="neutral">{(getValue() as string) || '—'}</Badge> },
      {
        accessorKey: 'enabled',
        header: 'Stato',
        cell: ({ row }) => (
          <Button
            variant={row.original.enabled ? 'secondary' : 'outline'}
            size="sm"
            className="h-7"
            onClick={() => update.mutate({ id: row.original.key, data: { enabled: !row.original.enabled } })}
          >
            <Power className={row.original.enabled ? 'text-success' : 'text-muted-foreground'} />
            {row.original.enabled ? 'Attiva' : 'Off'}
          </Button>
        ),
      },
      {
        id: 'azioni',
        header: '',
        enableSorting: false,
        cell: ({ row }) => (
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/apps/${encodeURIComponent(row.original.key)}/edit`); }}>
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
        title="App esterne"
        subtitle="Estensioni e integrazioni installabili per il tuo store."
        actions={<Button size="sm" onClick={() => navigate('/apps/new')}><Plus /> Nuova app</Button>}
      />
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(a) => a.key}
        searchValue={(a) => `${a.nome} ${a.categoria} ${a.descrizione}`}
        searchPlaceholder="Cerca app…"
        exportName="app_esterne"
        exportTitle="App esterne"
        exportColumns={exportColumns}
        isLoading={query.isLoading}
        emptyState={<EmptyState icon={AppWindow} title="Nessuna app" />}
        bulkActions={(selected, clear) => (
          <BulkDelete count={selected.length} noun="app" onDelete={() => del.mutateAsync(selected.map((a) => a.key))} onDone={clear} />
        )}
      />
    </div>
  );
}

const FIELDS: FieldConfig[] = [
  { name: 'nome', label: 'Nome app', required: true, wide: true },
  { name: 'categoria', label: 'Categoria', placeholder: 'es. Pagamenti' },
  { name: 'icona', label: 'Icona (emoji)', placeholder: '🧩' },
  { name: 'descrizione', label: 'Descrizione', type: 'textarea', wide: true },
  { name: 'enabled', label: 'Attiva', type: 'checkbox', side: true },
];

/** Full-page create/edit form for an app (keyed by its slug, not a numeric id). */
export function AppFormPage() {
  const { key } = useParams<{ key: string }>();
  const editing = key != null;
  const query = useApps();
  const qc = useQueryClient();
  const row = editing ? (query.data?.apps ?? []).find((a) => a.key === key) : undefined;

  const initial = useMemo<FormValues>(() => {
    if (!editing) return { enabled: true, icona: '🧩' };
    return row
      ? { nome: row.nome, categoria: row.categoria, icona: row.icona, descrizione: row.descrizione, enabled: row.enabled }
      : {};
  }, [editing, row]);

  return (
    <EntityFormPage
      title={editing ? `Modifica: ${row?.nome ?? 'app'}` : 'Nuova app'}
      backPath="/apps"
      backLabel="App esterne"
      mainTitle="App"
      sideTitle="Stato"
      fields={FIELDS}
      initial={initial}
      loading={editing && !row && query.isLoading}
      submitLabel={editing ? 'Salva modifiche' : 'Aggiungi app'}
      onSubmit={async (v) => {
        const data = {
          nome: v.nome,
          categoria: v.categoria || 'Altro',
          icona: v.icona || '🧩',
          descrizione: v.descrizione || '',
          enabled: v.enabled ? true : false,
        };
        if (editing) await api.apps.update(key!, data);
        else await api.apps.create(data);
        qc.invalidateQueries({ queryKey: ['apps'] });
        toast.success(editing ? 'App aggiornata' : 'App aggiunta');
      }}
    />
  );
}
