import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { MapPin, Plus, Pencil, Clock, ExternalLink, Store } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/data-table/data-table';
import { BulkDelete } from '@/components/data-table/bulk-delete';
import { EmptyState } from '@/components/common/empty-state';
import type { FieldConfig, FormValues } from '@/components/common/entity-form-fields';
import { EntityFormPage } from '@/components/common/entity-form-page';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { usePickup, useDeleteMany, useSaveEntity, useUpdateOne } from '@/hooks/queries';
import { api } from '@/lib/api';
import type { PickupPoint } from '@/types';
import type { ExportColumn } from '@/lib/export';
import { toast } from 'sonner';

const fields: FieldConfig[] = [
  { name: 'nome', label: 'Nome punto', required: true, placeholder: 'es. MEMI Store — Milano Centro' },
  { name: 'indirizzo', label: 'Indirizzo completo', wide: true, required: true, placeholder: 'Via Mazzini 8, 20123 Milano MI', help: 'Via, civico, CAP e città — usato per generare il link alla mappa.' },
  { name: 'corriere', label: 'Corriere / gestore', placeholder: 'es. BRT, InPost, sede propria…', help: 'Chi gestisce il punto. Lascia vuoto se è una tua sede.' },
  { name: 'orari', label: 'Orari di apertura', wide: true, placeholder: 'Lun–Ven 9:00–18:00 · Sab 9:00–13:00' },
  { name: 'attivo', label: 'Attivo — visibile ai clienti', type: 'checkbox', side: true },
];

const exportColumns: ExportColumn<PickupPoint>[] = [
  { header: 'Nome', accessor: (p) => p.nome },
  { header: 'Indirizzo', accessor: (p) => p.indirizzo },
  { header: 'Corriere', accessor: (p) => p.corriere || '' },
  { header: 'Orari', accessor: (p) => p.orari || '' },
  { header: 'Attivo', accessor: (p) => (p.attivo ? 'Sì' : 'No') },
];

const mapsUrl = (address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

export function PickupPage() {
  const query = usePickup();
  const del = useDeleteMany<number>((id) => api.pickup.delete(id), 'pickup');
  const toggle = useUpdateOne<number>((id, data) => api.pickup.update(id, data as { attivo?: number }), 'pickup');
  const navigate = useNavigate();
  const rows = query.data ?? [];
  const activeCount = rows.filter((p) => p.attivo).length;

  const columns = useMemo<ColumnDef<PickupPoint, unknown>[]>(
    () => [
      {
        accessorKey: 'nome',
        header: 'Punto di ritiro',
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Store className="h-4 w-4" />
            </span>
            <span className="font-medium">{row.original.nome}</span>
          </div>
        ),
      },
      {
        accessorKey: 'indirizzo',
        header: 'Indirizzo',
        cell: ({ row }) => (
          <a
            href={mapsUrl(row.original.indirizzo)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-primary hover:underline"
            title="Apri in Google Maps"
          >
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="line-clamp-1 max-w-[260px]">{row.original.indirizzo}</span>
            <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
          </a>
        ),
      },
      {
        accessorKey: 'corriere',
        header: 'Corriere',
        cell: ({ getValue }) => {
          const v = (getValue() as string) || '';
          return v ? <Badge variant="neutral" className="uppercase">{v}</Badge> : <span className="text-muted-foreground">—</span>;
        },
      },
      {
        accessorKey: 'orari',
        header: 'Orari',
        cell: ({ getValue }) => {
          const v = (getValue() as string) || '';
          return v ? (
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              {v}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          );
        },
      },
      {
        accessorKey: 'attivo',
        header: 'Stato',
        cell: ({ row }) => (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggle.mutate(
                { id: row.original.id, data: { attivo: row.original.attivo ? 0 : 1 } },
                { onSuccess: () => toast.success(row.original.attivo ? 'Punto disattivato' : 'Punto attivato') },
              );
            }}
            title="Attiva / disattiva"
            className="cursor-pointer"
          >
            {row.original.attivo ? <Badge variant="success">Attivo</Badge> : <Badge variant="neutral">Disattivo</Badge>}
          </button>
        ),
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => navigate(`/pickup/${row.original.id}/edit`)}>
              <Pencil /> Modifica
            </Button>
          </div>
        ),
      },
    ],
    [navigate, toggle],
  );

  return (
    <div>
      <PageHeader
        title="Punti di ritiro"
        subtitle={
          rows.length
            ? `${rows.length} ${rows.length === 1 ? 'punto' : 'punti'} · ${activeCount} attiv${activeCount === 1 ? 'o' : 'i'} al checkout`
            : 'Sedi dove i clienti possono ritirare gli ordini.'
        }
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
        emptyState={
          <EmptyState
            icon={MapPin}
            title="Nessun punto di ritiro"
            description="Aggiungi le sedi dove i clienti possono ritirare gli ordini (opzione «Ritiro» al checkout)."
          />
        }
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
      mainTitle="Punto di ritiro"
      sideTitle="Stato"
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
