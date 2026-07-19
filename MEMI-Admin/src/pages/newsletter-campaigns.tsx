import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowLeft, Send } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/data-table/data-table';
import { EmptyState } from '@/components/common/empty-state';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/format';
import type { ExportColumn } from '@/lib/export';

type Campaign = { id: number; subject: string; audience?: string; recipients: number; smtp: boolean; created_at: string };

const exportColumns: ExportColumn<Campaign>[] = [
  { header: 'Oggetto', accessor: (c) => c.subject },
  { header: 'Pubblico', accessor: (c) => c.audience || 'Tutti gli iscritti' },
  { header: 'Destinatari', accessor: (c) => c.recipients },
  { header: 'Inviata', accessor: (c) => (c.smtp ? 'Sì' : 'No (SMTP off)') },
  { header: 'Data', accessor: (c) => dateTime(c.created_at) },
];

/**
 * Newsletter broadcast history — the record of what was sent (subject, recipients,
 * when) that the fire-and-forget send used to leave behind. Read-only.
 */
export function NewsletterCampaignsPage() {
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['newsletter', 'campaigns'], queryFn: () => api.newsletter.campaigns() });
  const rows = q.data?.campaigns ?? [];

  const columns = useMemo<ColumnDef<Campaign, unknown>[]>(
    () => [
      { accessorKey: 'subject', header: 'Oggetto', cell: ({ getValue }) => <span className="font-medium">{getValue() as string}</span> },
      {
        accessorKey: 'audience',
        header: 'Pubblico',
        cell: ({ getValue }) => {
          const a = (getValue() as string) || 'Tutti gli iscritti';
          const isSeg = a.startsWith('Segmento');
          return <Badge variant={isSeg ? 'info' : 'neutral'}>{a}</Badge>;
        },
      },
      { accessorKey: 'recipients', header: 'Destinatari', cell: ({ getValue }) => <span>{getValue() as number}</span> },
      {
        accessorKey: 'smtp',
        header: 'Stato',
        cell: ({ getValue }) => (getValue() ? <Badge variant="success">Inviata</Badge> : <Badge variant="neutral">SMTP non attivo</Badge>),
      },
      { accessorKey: 'created_at', header: 'Data', cell: ({ getValue }) => <span className="whitespace-nowrap text-muted-foreground">{dateTime(getValue() as string)}</span> },
    ],
    [],
  );

  return (
    <div>
      <Button variant="ghost" size="sm" className="-ml-2 mb-2" onClick={() => navigate('/newsletter')}>
        <ArrowLeft /> Newsletter
      </Button>
      <PageHeader title="Campagne inviate" subtitle="Storico delle newsletter inviate (ultime 100)." />
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(c) => String(c.id)}
        searchValue={(c) => c.subject}
        searchPlaceholder="Cerca oggetto…"
        exportName="campagne_newsletter"
        exportTitle="Campagne newsletter"
        exportColumns={exportColumns}
        isLoading={q.isLoading}
        emptyState={<EmptyState icon={Send} title="Nessuna campagna inviata" />}
      />
    </div>
  );
}
