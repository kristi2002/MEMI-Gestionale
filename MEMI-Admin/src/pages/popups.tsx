import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { MessageSquareQuote, Plus, Pencil, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/data-table/data-table';
import { EmptyState } from '@/components/common/empty-state';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import type { FieldConfig, FormValues } from '@/components/common/entity-form-fields';
import { EntityFormPage } from '@/components/common/entity-form-page';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { usePopups, useSaveEntity, useDeleteMany } from '@/hooks/queries';
import { api } from '@/lib/api';
import type { Popup } from '@/types';
import type { ExportColumn } from '@/lib/export';
import { date as itDate } from '@/lib/format';
import { toast } from 'sonner';

const POSITIONS = [
  { value: 'center', label: 'Centro (modale)' },
  { value: 'bottom-right', label: 'In basso a destra' },
  { value: 'bottom-left', label: 'In basso a sinistra' },
  { value: 'top', label: 'Barra in alto' },
];

const positionLabel = (v: string) => POSITIONS.find((p) => p.value === v)?.label ?? v;

const exportColumns: ExportColumn<Popup>[] = [
  { header: 'Titolo', accessor: (r) => r.titolo },
  { header: 'Posizione', accessor: (r) => positionLabel(r.posizione) },
  { header: 'Attivo', accessor: (r) => (r.attivo ? 'sì' : 'no') },
  { header: 'Creato', accessor: (r) => itDate(r.created_at) },
];

const popupFields: FieldConfig[] = [
  { name: 'titolo', label: 'Titolo', required: true, wide: true, placeholder: 'es. Iscriviti e ottieni il 10%' },
  { name: 'contenuto', label: 'Testo', type: 'textarea', wide: true, placeholder: 'Il messaggio mostrato nel pop-up.' },
  { name: 'cta_label', label: 'Testo del pulsante', placeholder: 'es. Scopri le novità' },
  { name: 'cta_url', label: 'Link del pulsante', placeholder: '/shop' },
  { name: 'posizione', label: 'Posizione', type: 'select', side: true, options: POSITIONS },
  {
    name: 'attivo', label: 'Attivo', type: 'select', side: true,
    options: [{ value: '1', label: 'Sì — visibile sullo store' }, { value: '0', label: 'No — bozza' }],
    help: 'I pop-up attivi vengono mostrati ai visitatori dello storefront.',
  },
];

export function PopupsPage() {
  const query = usePopups();
  const rows = query.data ?? [];
  const deleteMut = useDeleteMany<number>((id) => api.popups.delete(id), 'popups');
  const navigate = useNavigate();

  const columns = useMemo<ColumnDef<Popup, unknown>[]>(
    () => [
      {
        id: 'titolo',
        header: 'Pop-up',
        accessorFn: (r) => r.titolo,
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="truncate font-medium">{row.original.titolo}</div>
            {row.original.contenuto && (
              <div className="truncate text-xs text-muted-foreground">{row.original.contenuto}</div>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'posizione',
        header: 'Posizione',
        cell: ({ getValue }) => <span className="text-muted-foreground">{positionLabel(getValue() as string)}</span>,
      },
      {
        accessorKey: 'attivo',
        header: 'Stato',
        cell: ({ getValue }) =>
          getValue() ? <Badge variant="success">Attivo</Badge> : <Badge variant="neutral">Bozza</Badge>,
      },
      {
        accessorKey: 'created_at',
        header: 'Creato',
        cell: ({ getValue }) => <span className="text-muted-foreground">{itDate(getValue() as string)}</span>,
      },
      {
        id: 'azioni',
        header: '',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/popups/${row.original.id}/edit`); }}>
              <Pencil /> Modifica
            </Button>
            <ConfirmDialog
              title={`Eliminare "${row.original.titolo}"?`}
              description="Il pop-up smetterà immediatamente di essere mostrato sullo store."
              confirmLabel="Elimina"
              destructive
              onConfirm={async () => {
                try {
                  await api.popups.delete(row.original.id);
                  query.refetch();
                  toast.success('Pop-up eliminato');
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : 'Eliminazione non riuscita');
                }
              }}
              trigger={
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" aria-label="Elimina">
                  <Trash2 />
                </Button>
              }
            />
          </div>
        ),
      },
    ],
    [query, navigate],
  );

  return (
    <div>
      <PageHeader
        title="Pop-up"
        subtitle="Messaggi mostrati ai visitatori dello storefront."
        actions={
          <Button size="sm" onClick={() => navigate('/popups/new')}>
            <Plus /> Nuovo pop-up
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={rows}
        getRowId={(r) => String(r.id)}
        searchValue={(r) => `${r.titolo} ${r.contenuto ?? ''}`}
        searchPlaceholder="Cerca pop-up…"
        exportName="popup"
        exportTitle="Pop-up"
        exportColumns={exportColumns}
        isLoading={query.isLoading}
        emptyState={
          <EmptyState
            icon={MessageSquareQuote}
            title="Nessun pop-up"
            description="Crea il primo messaggio con il pulsante in alto a destra."
          />
        }
        bulkActions={(selected, clear) => {
          const ids = selected.map((p) => p.id);
          return (
            <ConfirmDialog
              title={`Eliminare ${ids.length} pop-up?`}
              confirmLabel="Elimina"
              destructive
              onConfirm={async () => {
                await deleteMut.mutateAsync(ids);
                toast.success('Operazione completata');
                clear();
              }}
              trigger={
                <Button variant="destructive" size="sm">
                  <Trash2 /> Elimina
                </Button>
              }
            />
          );
        }}
      />
    </div>
  );
}

/** Full-page create/edit form for a pop-up. */
export function PopupFormPage() {
  const { id } = useParams<{ id: string }>();
  const editing = id != null;
  const query = usePopups();
  const saveMut = useSaveEntity(api.popups.create, api.popups.update, 'popups');
  const row = editing ? (query.data ?? []).find((p) => String(p.id) === id) : undefined;

  const initial = useMemo<FormValues>(() => {
    if (!editing) return { posizione: 'center', attivo: '0' };
    return row
      ? {
          titolo: row.titolo,
          contenuto: row.contenuto ?? '',
          cta_label: row.cta_label ?? '',
          cta_url: row.cta_url ?? '',
          posizione: row.posizione || 'center',
          attivo: row.attivo ? '1' : '0',
        }
      : {};
  }, [editing, row]);

  return (
    <EntityFormPage
      title={editing ? `Modifica pop-up${row ? `: ${row.titolo}` : ''}` : 'Nuovo pop-up'}
      backPath="/popups"
      backLabel="Pop-up"
      mainTitle="Contenuto"
      sideTitle="Pubblicazione"
      fields={popupFields}
      initial={initial}
      loading={editing && !row && query.isLoading}
      submitLabel={editing ? 'Salva modifiche' : 'Crea pop-up'}
      onSubmit={async (v) => {
        await saveMut.mutateAsync({
          id: editing ? Number(id) : undefined,
          data: {
            titolo: v.titolo,
            contenuto: v.contenuto || null,
            cta_label: v.cta_label || null,
            cta_url: v.cta_url || null,
            posizione: v.posizione || 'center',
            attivo: String(v.attivo) === '1' ? 1 : 0,
          },
        });
        toast.success(editing ? 'Pop-up salvato' : 'Pop-up creato');
      }}
    />
  );
}
