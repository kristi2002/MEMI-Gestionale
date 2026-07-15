import { useMemo, useRef, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Trash2, BadgePercent, Plus, Pencil } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/data-table/data-table';
import type { FilterDef } from '@/components/data-table/filters';
import { StatusBadge } from '@/components/common/status-badge';
import { EmptyState } from '@/components/common/empty-state';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { EntityFormDialog, type FieldConfig, type FormValues } from '@/components/common/entity-form-dialog';
import { Button } from '@/components/ui/button';
import { useDiscounts, useDeleteDiscounts, useSaveEntity } from '@/hooks/queries';
import { api } from '@/lib/api';
import { eur, date } from '@/lib/format';
import type { Discount } from '@/types';
import type { ExportColumn } from '@/lib/export';
import { toast } from 'sonner';

function tipoLabel(d: Discount): string {
  if (d.tipo === 'percentuale') return `Percentuale ${d.valore}%`;
  if (d.tipo === 'fisso') return `${eur(d.valore)} fisso`;
  return 'Spedizione gratuita';
}

const exportColumns: ExportColumn<Discount>[] = [
  { header: 'Codice', accessor: (d) => d.code },
  { header: 'Tipo', accessor: (d) => tipoLabel(d) },
  { header: 'Utilizzi', accessor: (d) => `${d.utilizzi}/${d.max_utilizzi ?? '∞'}` },
  { header: 'Ordine minimo', accessor: (d) => eur(d.min_order) },
  { header: 'Scadenza', accessor: (d) => (d.scadenza ? date(d.scadenza) : '—') },
  { header: 'Stato', accessor: (d) => d.stato },
];

const FIELDS: FieldConfig[] = [
  { name: 'code', label: 'Codice', required: true, placeholder: 'ESTATE10', help: 'Il codice che il cliente inserisce al checkout.' },
  { name: 'tipo', label: 'Tipo', type: 'select', required: true, options: [
      { value: 'percentuale', label: 'Percentuale (%)' },
      { value: 'fisso', label: 'Importo fisso (€)' },
      { value: 'spedizione', label: 'Spedizione gratuita' },
    ] },
  { name: 'valore', label: 'Valore', type: 'number', required: true, help: 'Percentuale o importo in €. Per spedizione gratuita usa 0.' },
  { name: 'min_order', label: 'Ordine minimo €', type: 'number' },
  { name: 'max_utilizzi', label: 'Utilizzi massimi', type: 'number', help: 'Vuoto = illimitato.' },
  { name: 'scadenza', label: 'Scadenza', type: 'date', help: 'Vuoto = nessuna scadenza.' },
  { name: 'stato', label: 'Stato', type: 'select', options: [
      { value: 'attivo', label: 'Attivo' }, { value: 'disattivo', label: 'Disattivo' }, { value: 'pianificato', label: 'Pianificato' },
    ] },
];

export function DiscountsPage() {
  const query = useDiscounts();
  const deleteMut = useDeleteDiscounts();
  const saveMut = useSaveEntity(api.discounts.create, api.discounts.update, 'discounts');
  const rows = query.data ?? [];

  const filters = useMemo<FilterDef<Discount>[]>(
    () => [
      { key: 'tipo', type: 'select', label: 'Tipo', accessor: (d) => d.tipo,
        options: [{ value: 'percentuale', label: 'Percentuale' }, { value: 'fisso', label: 'Importo fisso' }, { value: 'spedizione', label: 'Spedizione gratuita' }] },
      { key: 'stato', type: 'select', label: 'Stato', accessor: (d) => d.stato,
        options: [{ value: 'attivo', label: 'Attivo' }, { value: 'disattivo', label: 'Disattivo' }, { value: 'pianificato', label: 'Pianificato' }] },
    ],
    [],
  );

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Discount | null>(null);
  const [initial, setInitial] = useState<FormValues>({});

  function openCreate() {
    setEditing(null);
    setInitial({ tipo: 'percentuale', stato: 'attivo', valore: 0, min_order: 0 });
    setFormOpen(true);
  }
  function openEdit(d: Discount) {
    setEditing(d);
    setInitial({
      code: d.code,
      tipo: d.tipo,
      valore: Number(d.valore),
      min_order: d.min_order == null ? 0 : Number(d.min_order),
      max_utilizzi: d.max_utilizzi == null ? '' : Number(d.max_utilizzi),
      scadenza: d.scadenza ? String(d.scadenza).slice(0, 10) : '',
      stato: d.stato,
    });
    setFormOpen(true);
  }
  const openEditRef = useRef(openEdit);
  openEditRef.current = openEdit;

  async function onSubmit(v: FormValues) {
    const data: Record<string, unknown> = {
      code: v.code,
      tipo: v.tipo,
      valore: v.valore || 0,
      min_order: v.min_order || 0,
      max_utilizzi: v.max_utilizzi === '' || v.max_utilizzi == null ? null : v.max_utilizzi,
      scadenza: v.scadenza || null,
      stato: v.stato || 'attivo',
    };
    await saveMut.mutateAsync({ id: editing ? editing.id : undefined, data });
    toast.success(editing ? 'Codice aggiornato' : 'Codice creato');
  }

  const columns = useMemo<ColumnDef<Discount, unknown>[]>(
    () => [
      {
        accessorKey: 'code',
        header: 'Codice',
        cell: ({ getValue }) => (
          <code className="rounded bg-muted px-2 py-1 text-sm font-semibold">{getValue() as string}</code>
        ),
      },
      { id: 'tipo', header: 'Tipo', accessorFn: (d) => tipoLabel(d) },
      {
        id: 'utilizzi',
        header: 'Utilizzi',
        accessorFn: (d) => d.utilizzi,
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.utilizzi}/{row.original.max_utilizzi ?? '∞'}
          </span>
        ),
      },
      { accessorKey: 'min_order', header: 'Ordine min.', cell: ({ getValue }) => eur(getValue() as string) },
      {
        accessorKey: 'scadenza',
        header: 'Scadenza',
        cell: ({ getValue }) => <span className="text-muted-foreground">{getValue() ? date(getValue() as string) : '—'}</span>,
      },
      { accessorKey: 'stato', header: 'Stato', cell: ({ getValue }) => <StatusBadge code={getValue() as string} /> },
      {
        id: 'azioni',
        header: '',
        enableSorting: false,
        cell: ({ row }) => (
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openEditRef.current(row.original); }}>
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
        title="Sconti"
        subtitle="Codici promozionali e regole di sconto."
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus /> Nuovo codice
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={rows}
        getRowId={(d) => String(d.id)}
        searchValue={(d) => `${d.code} ${d.tipo}`}
        searchPlaceholder="Cerca codice…"
        exportName="sconti"
        exportTitle="Codici sconto"
        exportColumns={exportColumns}
        filters={filters}
        tableId="discounts"
        isLoading={query.isLoading}
        emptyState={<EmptyState icon={BadgePercent} title="Nessun codice sconto" />}
        bulkActions={(selected, clear) => {
          const ids = selected.map((d) => d.id);
          return (
            <ConfirmDialog
              title={`Eliminare ${ids.length} codici sconto?`}
              confirmLabel="Elimina"
              destructive
              onConfirm={async () => {
                await deleteMut.mutateAsync(ids);
                toast.success(`${ids.length} codici eliminati`);
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

      <EntityFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title={editing ? `Modifica codice: ${editing.code}` : 'Nuovo codice sconto'}
        fields={FIELDS}
        initial={initial}
        submitLabel={editing ? 'Salva modifiche' : 'Crea codice'}
        onSubmit={onSubmit}
      />
    </div>
  );
}
