import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowLeft, Users } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/data-table/data-table';
import { EmptyState } from '@/components/common/empty-state';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { eur, num } from '@/lib/format';
import type { SegmentMember } from '@/types';
import type { ExportColumn } from '@/lib/export';

const fullName = (m: SegmentMember) => `${m.nome ?? ''} ${m.cognome ?? ''}`.trim();

const exportColumns: ExportColumn<SegmentMember>[] = [
  { header: 'Cliente', accessor: (m) => fullName(m) },
  { header: 'Email', accessor: (m) => m.email },
  { header: 'Ordini', accessor: (m) => m.total_orders },
  { header: 'Speso', accessor: (m) => eur(m.total_spent) },
];

/**
 * Members of one segment — the drill-down that surfaces WHO is in a segment
 * (the backend endpoint existed but had no UI). Rows link to each customer's
 * profile; the list is exportable (CSV/PDF) so a cohort can feed marketing.
 */
export function SegmentMembersPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ['segments', 'members', id],
    queryFn: () => api.segments.customers(Number(id)),
    enabled: id != null,
  });
  const seg = q.data?.segment;
  const members = q.data?.customers ?? [];

  const columns = useMemo<ColumnDef<SegmentMember, unknown>[]>(
    () => [
      {
        id: 'cliente',
        header: 'Cliente',
        accessorFn: (m) => fullName(m),
        cell: ({ row }) => (
          <button className="text-left font-medium hover:underline" onClick={() => navigate(`/customers/${row.original.id}`)}>
            {fullName(row.original) || '—'}
          </button>
        ),
      },
      { accessorKey: 'email', header: 'Email', cell: ({ getValue }) => <span className="text-muted-foreground">{getValue() as string}</span> },
      { accessorKey: 'total_orders', header: 'Ordini' },
      {
        accessorKey: 'total_spent',
        header: 'Speso',
        cell: ({ getValue }) => <span className="font-semibold">{eur(getValue() as string)}</span>,
        sortingFn: (a, b) => num(a.original.total_spent) - num(b.original.total_spent),
      },
    ],
    [navigate],
  );

  return (
    <div>
      <Button variant="ghost" size="sm" className="-ml-2 mb-2" onClick={() => navigate('/segments')}>
        <ArrowLeft /> Segmenti
      </Button>
      <PageHeader
        title={seg ? `Membri: ${seg.nome}` : 'Membri segmento'}
        subtitle={seg ? `Clienti con spesa ≥ ${eur(seg.min_spent)} e ≥ ${seg.min_orders} ordini — ${members.length} membri` : undefined}
      />
      <DataTable
        columns={columns}
        data={members}
        getRowId={(m) => String(m.id)}
        searchValue={(m) => `${fullName(m)} ${m.email}`}
        searchPlaceholder="Cerca cliente…"
        exportName={seg ? 'segmento_' + seg.nome.toLowerCase().replace(/\s+/g, '_') : 'segmento_membri'}
        exportTitle={seg ? 'Membri ' + seg.nome : 'Membri segmento'}
        exportColumns={exportColumns}
        isLoading={q.isLoading}
        emptyState={<EmptyState icon={Users} title="Nessun membro in questo segmento" />}
      />
    </div>
  );
}
