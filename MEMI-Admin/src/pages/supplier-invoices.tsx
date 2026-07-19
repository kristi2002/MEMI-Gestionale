import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { FileText, Plus, Pencil, Paperclip, AlertTriangle, Wallet, Receipt } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { KpiCard } from '@/components/common/kpi-card';
import { DataTable } from '@/components/data-table/data-table';
import type { FilterDef } from '@/components/data-table/filters';
import { BulkDelete } from '@/components/data-table/bulk-delete';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/common/empty-state';
import { AttachmentField } from '@/components/common/attachment-field';
import type { FieldConfig, FormValues } from '@/components/common/entity-form-fields';
import { EntityFormPage } from '@/components/common/entity-form-page';
import { Button } from '@/components/ui/button';
import { useSupplierInvoices, useSuppliers, useDeleteMany, useSaveEntity } from '@/hooks/queries';
import { api } from '@/lib/api';
import { eur, date, num } from '@/lib/format';
import type { SupplierInvoice } from '@/types';
import type { ExportColumn } from '@/lib/export';
import { toast } from 'sonner';

const statoLabel = (s: string) => (s === 'pagata' ? 'Pagata' : 'Da pagare');

const exportColumns: ExportColumn<SupplierInvoice>[] = [
  { header: 'Numero', accessor: (i) => i.numero },
  { header: 'Fornitore', accessor: (i) => i.supplier_nome || '' },
  { header: 'Data', accessor: (i) => (i.data_fattura ? date(i.data_fattura) : '') },
  { header: 'Scadenza', accessor: (i) => (i.scadenza ? date(i.scadenza) : '') },
  { header: 'Imponibile', accessor: (i) => eur(i.imponibile) },
  { header: 'IVA', accessor: (i) => eur(i.iva) },
  { header: 'Totale', accessor: (i) => eur(i.totale) },
  { header: 'Stato', accessor: (i) => (i.scaduta ? 'Scaduta' : statoLabel(i.stato)) },
];

export function SupplierInvoicesPage() {
  const query = useSupplierInvoices();
  const del = useDeleteMany<number>((id) => api.supplierInvoices.delete(id), 'supplier-invoices');
  const navigate = useNavigate();
  const rows = query.data?.invoices ?? [];
  const s = query.data?.summary;

  const filters = useMemo<FilterDef<SupplierInvoice>[]>(() => {
    const fornitori = [...new Set(rows.map((i) => i.supplier_nome).filter(Boolean))].sort() as string[];
    return [
      { key: 'stato', type: 'select', label: 'Stato', accessor: (i) => (i.scaduta ? 'scaduta' : i.stato),
        options: [{ value: 'da_pagare', label: 'Da pagare' }, { value: 'scaduta', label: 'Scaduta' }, { value: 'pagata', label: 'Pagata' }] },
      { key: 'fornitore', type: 'select', label: 'Fornitore', accessor: (i) => i.supplier_nome ?? '', options: fornitori.map((f) => ({ value: f, label: f })) },
      { key: 'totale', type: 'numberRange', label: 'Totale', unit: '€', accessor: (i) => num(i.totale) },
      { key: 'scadenza', type: 'dateRange', label: 'Scadenza', accessor: (i) => i.scadenza },
    ];
  }, [rows]);

  const columns = useMemo<ColumnDef<SupplierInvoice, unknown>[]>(
    () => [
      { accessorKey: 'numero', header: 'Numero', cell: ({ getValue }) => <span className="font-medium">{getValue() as string}</span> },
      { accessorKey: 'supplier_nome', header: 'Fornitore', cell: ({ getValue }) => <span>{(getValue() as string) || '—'}</span> },
      { accessorKey: 'data_fattura', header: 'Data', cell: ({ getValue }) => <span className="text-muted-foreground">{getValue() ? date(getValue() as string) : '—'}</span> },
      {
        accessorKey: 'scadenza', header: 'Scadenza',
        cell: ({ row }) => {
          const sc = row.original.scadenza;
          if (!sc) return <span className="text-muted-foreground">—</span>;
          return <span className={row.original.scaduta ? 'font-medium text-destructive' : 'text-muted-foreground'}>{date(sc)}</span>;
        },
      },
      { accessorKey: 'totale', header: 'Totale', cell: ({ getValue }) => <span className="font-semibold">{eur(getValue() as string)}</span>, sortingFn: (a, b) => num(a.original.totale) - num(b.original.totale) },
      {
        id: 'stato', header: 'Stato', accessorFn: (i) => (i.scaduta ? 'scaduta' : i.stato),
        cell: ({ row }) => row.original.scaduta
          ? <Badge variant="danger">Scaduta</Badge>
          : row.original.stato === 'pagata'
            ? <Badge variant="success">Pagata</Badge>
            : <Badge variant="warning">Da pagare</Badge>,
      },
      {
        id: 'allegato', header: '', enableSorting: false,
        cell: ({ row }) => row.original.attachment_url
          ? <a href={row.original.attachment_url} target="_blank" rel="noopener noreferrer" title="Allegato" onClick={(e) => e.stopPropagation()} className="text-muted-foreground hover:text-primary"><Paperclip className="h-4 w-4" /></a>
          : null,
      },
      {
        id: 'azioni', header: '', enableSorting: false,
        cell: ({ row }) => (
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/supplier-invoices/${row.original.id}/edit`); }}>
            <Pencil /> Modifica
          </Button>
        ),
      },
    ],
    [navigate],
  );

  return (
    <div>
      <PageHeader
        title="Fatture fornitori"
        subtitle="Fatture passive ricevute dai fornitori."
        actions={<Button size="sm" onClick={() => navigate('/supplier-invoices/new')}><Plus /> Nuova fattura</Button>}
      />
      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Fatture" value={s?.total ?? 0} icon={FileText} tone="primary" loading={query.isLoading} />
        <KpiCard label="Da pagare" value={`${s?.da_pagare_count ?? 0} · ${eur(s?.da_pagare_amount ?? 0)}`} icon={Wallet} tone="warning" loading={query.isLoading} />
        <KpiCard label="Scadute" value={eur(s?.scadute_amount ?? 0)} icon={AlertTriangle} tone="danger" loading={query.isLoading} />
        <KpiCard label="IVA totale" value={eur(s?.iva_total ?? 0)} icon={Receipt} tone="muted" loading={query.isLoading} />
      </div>
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(i) => String(i.id)}
        searchValue={(i) => `${i.numero} ${i.supplier_nome ?? ''}`}
        searchPlaceholder="Cerca numero o fornitore…"
        exportName="fatture_fornitori"
        exportTitle="Fatture fornitori"
        exportColumns={exportColumns}
        filters={filters}
        tableId="supplier-invoices"
        isLoading={query.isLoading}
        emptyState={<EmptyState icon={FileText} title="Nessuna fattura fornitore" description="Registra le fatture passive ricevute dai fornitori." />}
        bulkActions={(selected, clear) => (
          <BulkDelete count={selected.length} noun="fatture" onDelete={() => del.mutateAsync(selected.map((i) => i.id))} onDone={clear} />
        )}
      />
    </div>
  );
}

/** Full-page create/edit form for a supplier invoice. */
export function SupplierInvoiceFormPage() {
  const { id } = useParams<{ id: string }>();
  const editing = id != null;
  const query = useSupplierInvoices();
  const suppliersQ = useSuppliers();
  const saveMut = useSaveEntity(api.supplierInvoices.create, api.supplierInvoices.update, 'supplier-invoices');
  const row = editing ? (query.data?.invoices ?? []).find((i) => String(i.id) === id) : undefined;

  const fields = useMemo<FieldConfig[]>(() => {
    const suppliers = suppliersQ.data ?? [];
    return [
      { name: 'numero', label: 'Numero fattura', required: true, placeholder: 'es. FT-2026-001' },
      { name: 'supplier_id', label: 'Fornitore', type: 'select', options: [
          { value: '', label: '— Nessuno —' },
          ...suppliers.map((s) => ({ value: String(s.id), label: s.nome })),
        ] },
      { name: 'imponibile', label: 'Imponibile €', type: 'number' },
      { name: 'iva', label: 'IVA €', type: 'number' },
      { name: 'totale', label: 'Totale € (vuoto = imponibile+IVA)', type: 'number' },
      { name: 'stato', label: 'Stato', type: 'select', side: true, options: [
          { value: 'da_pagare', label: 'Da pagare' }, { value: 'pagata', label: 'Pagata' },
        ] },
      { name: 'data_fattura', label: 'Data fattura', type: 'date', side: true },
      { name: 'scadenza', label: 'Scadenza', type: 'date', side: true },
      { name: 'note', label: 'Note', type: 'textarea', wide: true },
    ];
  }, [suppliersQ.data]);

  const initial = useMemo<FormValues>(() => {
    if (!editing) return { stato: 'da_pagare', supplier_id: '' };
    return row
      ? {
          numero: row.numero, supplier_id: row.supplier_id ? String(row.supplier_id) : '',
          imponibile: Number(row.imponibile), iva: Number(row.iva), totale: Number(row.totale),
          stato: row.stato, note: row.note ?? '',
          data_fattura: row.data_fattura ? String(row.data_fattura).slice(0, 10) : '',
          scadenza: row.scadenza ? String(row.scadenza).slice(0, 10) : '',
          attachment_url: row.attachment_url ?? null,
        }
      : {};
  }, [editing, row]);

  return (
    <EntityFormPage
      title={editing ? `Modifica fattura${row ? ` ${row.numero}` : ''}` : 'Nuova fattura fornitore'}
      backPath="/supplier-invoices"
      backLabel="Fatture fornitori"
      mainTitle="Dettagli fattura"
      sideTitle="Stato & date"
      fields={fields}
      initial={initial}
      loading={editing && !row && query.isLoading}
      submitLabel={editing ? 'Salva modifiche' : 'Registra fattura'}
      extra={(values, set) => (
        <AttachmentField url={values.attachment_url as string | null | undefined} onChange={(u) => set('attachment_url', u)} uploadFn={api.supplierInvoices.uploadAttachment} title="Allegato (fattura PDF / immagine)" />
      )}
      onSubmit={async (v) => {
        await saveMut.mutateAsync({
          id: editing ? Number(id) : undefined,
          data: {
            numero: v.numero, supplier_id: v.supplier_id ? Number(v.supplier_id) : null,
            imponibile: v.imponibile || 0, iva: v.iva || 0,
            totale: v.totale === '' || v.totale === undefined ? '' : v.totale,
            stato: v.stato || 'da_pagare',
            data_fattura: v.data_fattura || null, scadenza: v.scadenza || null,
            note: v.note || null, attachment_url: (v.attachment_url as string) || null,
          },
        });
        toast.success(editing ? 'Fattura aggiornata' : 'Fattura registrata');
      }}
    />
  );
}
