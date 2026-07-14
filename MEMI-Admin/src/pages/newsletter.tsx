import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Mail } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { KpiCard } from '@/components/common/kpi-card';
import { DataTable } from '@/components/data-table/data-table';
import { BulkDelete } from '@/components/data-table/bulk-delete';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/common/empty-state';
import { useNewsletter, useDeleteMany } from '@/hooks/queries';
import { api } from '@/lib/api';
import { date } from '@/lib/format';
import type { Subscriber } from '@/types';
import type { ExportColumn } from '@/lib/export';

const exportColumns: ExportColumn<Subscriber>[] = [
  { header: 'Email', accessor: (s) => s.email },
  { header: 'Fonte', accessor: (s) => s.fonte },
  { header: 'Stato', accessor: (s) => (s.unsubscribed ? 'Disiscritto' : 'Attivo') },
  { header: 'Iscritto il', accessor: (s) => date(s.subscribed_at) },
];

export function NewsletterPage() {
  const query = useNewsletter();
  const del = useDeleteMany<number>((id) => api.newsletter.remove(id), 'newsletter');
  const rows = query.data?.subscribers ?? [];

  const columns = useMemo<ColumnDef<Subscriber, unknown>[]>(
    () => [
      { accessorKey: 'email', header: 'Email', cell: ({ getValue }) => <span className="font-medium">{getValue() as string}</span> },
      { accessorKey: 'fonte', header: 'Fonte', cell: ({ getValue }) => <Badge variant="neutral">{(getValue() as string) || '—'}</Badge> },
      {
        accessorKey: 'unsubscribed',
        header: 'Stato',
        cell: ({ getValue }) => (getValue() ? <Badge variant="danger">Disiscritto</Badge> : <Badge variant="success">Attivo</Badge>),
      },
      { accessorKey: 'subscribed_at', header: 'Iscritto il', cell: ({ getValue }) => <span className="text-muted-foreground">{date(getValue() as string)}</span> },
    ],
    [],
  );

  return (
    <div>
      <PageHeader title="Newsletter" subtitle="Iscritti alla newsletter." />
      <div className="mb-4 grid grid-cols-2 gap-4">
        <KpiCard label="Iscritti attivi" value={query.data?.total ?? 0} icon={Mail} tone="success" loading={query.isLoading} />
        <KpiCard label="Disiscritti" value={query.data?.unsubscribed ?? 0} tone="muted" loading={query.isLoading} />
      </div>
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(s) => String(s.id)}
        searchValue={(s) => `${s.email} ${s.fonte}`}
        searchPlaceholder="Cerca email…"
        exportName="newsletter"
        exportTitle="Iscritti newsletter"
        exportColumns={exportColumns}
        isLoading={query.isLoading}
        emptyState={<EmptyState icon={Mail} title="Nessun iscritto" />}
        bulkActions={(selected, clear) => (
          <BulkDelete count={selected.length} noun="iscritti" onDelete={() => del.mutateAsync(selected.map((s) => s.id))} onDone={clear} />
        )}
      />
    </div>
  );
}
