import { useMemo, useRef, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Truck, Plus, Pencil, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/data-table/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/common/empty-state';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { EntityFormDialog, type FieldConfig, type FormValues } from '@/components/common/entity-form-dialog';
import { useCouriers, useDeleteMany } from '@/hooks/queries';
import { api } from '@/lib/api';
import { eur } from '@/lib/format';
import type { Courier } from '@/types';
import type { ExportColumn } from '@/lib/export';
import { toast } from 'sonner';

const exportColumns: ExportColumn<Courier>[] = [
  { header: 'Codice', accessor: (c) => c.code },
  { header: 'Nome', accessor: (c) => c.nome },
  { header: 'Tariffa', accessor: (c) => eur(c.rate) },
  { header: 'Attivo', accessor: (c) => (c.attivo ? 'Sì' : 'No') },
  { header: 'Tracking URL', accessor: (c) => c.tracking_url_template || '' },
];

export function CouriersPage() {
  const query = useCouriers();
  const rows = query.data ?? [];
  const deleteMut = useDeleteMany<string>((code) => api.shipping.deleteCourier(code), 'couriers');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Courier | null>(null);
  const [initial, setInitial] = useState<FormValues>({});

  const fields = useMemo<FieldConfig[]>(() => {
    const base: FieldConfig[] = [
      { name: 'nome', label: 'Nome', required: true, placeholder: 'es. BRT Corriere Espresso' },
      { name: 'slug', label: 'Sigla', placeholder: 'BRT', help: 'Etichetta breve mostrata come badge.' },
      { name: 'rate', label: 'Tariffa €', type: 'number', help: 'Costo base di spedizione.' },
      { name: 'tracking_url_template', label: 'URL tracking', wide: true, placeholder: 'https://…?n={tracking}', help: '{tracking} viene sostituito col numero di spedizione.' },
      { name: 'attivo', label: 'Attivo', type: 'checkbox' },
    ];
    if (editing) return base;
    return [
      { name: 'code', label: 'Codice', required: true, placeholder: 'brt', help: 'Identificativo univoco minuscolo (immutabile).' },
      ...base,
    ];
  }, [editing]);

  function openCreate() {
    setEditing(null);
    setInitial({ attivo: true, rate: 0 });
    setFormOpen(true);
  }
  function openEdit(c: Courier) {
    setEditing(c);
    setInitial({
      nome: c.nome,
      slug: c.slug ?? '',
      rate: c.rate == null ? 0 : Number(c.rate),
      tracking_url_template: c.tracking_url_template ?? '',
      attivo: !!c.attivo,
    });
    setFormOpen(true);
  }
  const openEditRef = useRef(openEdit);
  openEditRef.current = openEdit;

  async function onSubmit(v: FormValues) {
    const data: Record<string, unknown> = {
      nome: v.nome,
      slug: v.slug || null,
      rate: v.rate || 0,
      tracking_url_template: v.tracking_url_template || null,
      attivo: v.attivo ? 1 : 0,
    };
    try {
      if (editing) {
        await api.shipping.updateCourier(editing.code, data);
        toast.success('Corriere aggiornato');
      } else {
        data.code = v.code;
        await api.shipping.createCourier(data);
        toast.success('Corriere creato');
      }
      query.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Salvataggio non riuscito');
      throw e;
    }
  }

  const columns = useMemo<ColumnDef<Courier, unknown>[]>(
    () => [
      { accessorKey: 'nome', header: 'Corriere', cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="flex h-7 items-center rounded-md bg-muted px-2 text-xs font-bold uppercase text-muted-foreground">{row.original.slug || row.original.code}</span>
          <span className="font-medium">{row.original.nome}</span>
        </div>
      ) },
      { accessorKey: 'rate', header: 'Tariffa', cell: ({ getValue }) => <span className="font-semibold">{eur(getValue() as string)}</span>, sortingFn: (a, b) => Number(a.original.rate) - Number(b.original.rate) },
      { accessorKey: 'tracking_url_template', header: 'Tracking URL', cell: ({ getValue }) => <span className="line-clamp-1 max-w-[280px] text-xs text-muted-foreground">{(getValue() as string) || '—'}</span> },
      { accessorKey: 'attivo', header: 'Stato', cell: ({ getValue }) => (getValue() ? <Badge variant="success">Attivo</Badge> : <Badge variant="neutral">Disattivo</Badge>) },
      {
        id: 'azioni',
        header: '',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openEditRef.current(row.original); }}>
              <Pencil /> Modifica
            </Button>
            <ConfirmDialog
              title={`Eliminare "${row.original.nome}"?`}
              description="Il corriere verrà rimosso. Le spedizioni già create non sono toccate."
              confirmLabel="Elimina"
              destructive
              onConfirm={async () => {
                await deleteMut.mutateAsync([row.original.code]);
                toast.success('Corriere eliminato');
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
    [deleteMut],
  );

  return (
    <div>
      <PageHeader
        title="Corrieri"
        subtitle="Corrieri configurati e relative tariffe."
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus /> Nuovo corriere
          </Button>
        }
      />
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(c) => c.code}
        searchValue={(c) => `${c.code} ${c.nome}`}
        searchPlaceholder="Cerca corriere…"
        exportName="corrieri"
        exportTitle="Corrieri"
        exportColumns={exportColumns}
        isLoading={query.isLoading}
        emptyState={<EmptyState icon={Truck} title="Nessun corriere configurato" description="Aggiungine uno con il pulsante in alto a destra." />}
        bulkActions={(selected, clear) => {
          const codes = selected.map((c) => c.code);
          return (
            <ConfirmDialog
              title={`Eliminare ${codes.length} corrieri?`}
              confirmLabel="Elimina"
              destructive
              onConfirm={async () => {
                await deleteMut.mutateAsync(codes);
                toast.success(`${codes.length} corrieri eliminati`);
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
        title={editing ? `Modifica corriere: ${editing.nome}` : 'Nuovo corriere'}
        fields={fields}
        initial={initial}
        submitLabel={editing ? 'Salva modifiche' : 'Crea corriere'}
        onSubmit={onSubmit}
      />
    </div>
  );
}
