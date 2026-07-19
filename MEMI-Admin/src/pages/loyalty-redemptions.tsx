import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowLeft, Ticket, CheckCircle2, Coins } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { KpiCard } from '@/components/common/kpi-card';
import { DataTable } from '@/components/data-table/data-table';
import { EmptyState } from '@/components/common/empty-state';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { eur, num, dateTime } from '@/lib/format';
import type { LoyaltyRedemption } from '@/types';
import type { ExportColumn } from '@/lib/export';

const isUsed = (r: LoyaltyRedemption) => r.utilizzi >= (r.max_utilizzi ?? 1);

const exportColumns: ExportColumn<LoyaltyRedemption>[] = [
  { header: 'Codice', accessor: (r) => r.code },
  { header: 'Valore', accessor: (r) => eur(r.valore) },
  { header: 'Stato', accessor: (r) => (isUsed(r) ? 'Riscattato' : 'Attivo') },
  { header: 'Emesso il', accessor: (r) => dateTime(r.created_at) },
];

/**
 * Codici fedeltà riscattati — the single-use discount codes minted when a customer
 * converts points to a discount (POST /api/auth/loyalty/redeem, 'PUNTI-' prefix).
 * Read-only: shows what was issued, its € value, and whether it's been used at checkout.
 */
export function LoyaltyRedemptionsPage() {
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['loyalty', 'redemptions'], queryFn: () => api.loyalty.redemptions() });
  const rows = q.data?.redemptions ?? [];
  const s = q.data?.summary;

  const columns = useMemo<ColumnDef<LoyaltyRedemption, unknown>[]>(
    () => [
      { accessorKey: 'code', header: 'Codice', cell: ({ getValue }) => <span className="font-mono text-sm font-medium">{getValue() as string}</span> },
      { accessorKey: 'valore', header: 'Valore', cell: ({ getValue }) => <span className="font-semibold">{eur(getValue() as string)}</span>, sortingFn: (a, b) => num(a.original.valore) - num(b.original.valore) },
      {
        id: 'stato', header: 'Stato', accessorFn: (r) => (isUsed(r) ? 1 : 0),
        cell: ({ row }) => isUsed(row.original)
          ? <Badge variant="neutral">Riscattato</Badge>
          : <Badge variant="success">Attivo</Badge>,
      },
      { accessorKey: 'created_at', header: 'Emesso il', cell: ({ getValue }) => <span className="whitespace-nowrap text-muted-foreground">{dateTime(getValue() as string)}</span> },
    ],
    [],
  );

  return (
    <div>
      <Button variant="ghost" size="sm" className="-ml-2 mb-2" onClick={() => navigate('/loyalty')}>
        <ArrowLeft /> Fedeltà & Punti
      </Button>
      <PageHeader title="Codici riscattati" subtitle="Codici sconto generati dalla conversione dei punti fedeltà." />

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <KpiCard label="Codici emessi" value={s?.total ?? 0} icon={Ticket} tone="primary" loading={q.isLoading} />
        <KpiCard label="Valore totale" value={eur(s?.total_value ?? 0)} icon={Coins} tone="info" loading={q.isLoading} />
        <KpiCard label="Riscattati" value={`${s?.used ?? 0} · ${eur(s?.used_value ?? 0)}`} icon={CheckCircle2} tone="success" loading={q.isLoading} />
      </div>

      <DataTable
        columns={columns}
        data={rows}
        getRowId={(r) => String(r.id)}
        searchValue={(r) => r.code}
        searchPlaceholder="Cerca codice…"
        exportName="codici_fedelta"
        exportTitle="Codici fedeltà riscattati"
        exportColumns={exportColumns}
        isLoading={q.isLoading}
        emptyState={<EmptyState icon={Ticket} title="Nessun codice riscattato" description="I codici compaiono quando i clienti convertono i punti in sconti." />}
      />
    </div>
  );
}
