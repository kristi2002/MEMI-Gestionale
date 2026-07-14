import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Layers, FolderTree } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/data-table/data-table';
import { EmptyState } from '@/components/common/empty-state';
import { Badge } from '@/components/ui/badge';
import { useAllProducts } from '@/hooks/queries';
import { eur, num } from '@/lib/format';
import type { ProductRow } from '@/types';
import type { ExportColumn } from '@/lib/export';

interface TaxonomyRow {
  name: string;
  count: number;
  active: number;
  avgPrice: number;
}

const exportColumns: ExportColumn<TaxonomyRow>[] = [
  { header: 'Nome', accessor: (r) => r.name },
  { header: 'Prodotti', accessor: (r) => r.count },
  { header: 'Attivi', accessor: (r) => r.active },
  { header: 'Prezzo medio', accessor: (r) => eur(r.avgPrice) },
];

function aggregate(products: ProductRow[], keyFn: (p: ProductRow) => string[]): TaxonomyRow[] {
  const map = new Map<string, { count: number; active: number; sum: number }>();
  for (const p of products) {
    for (const key of keyFn(p)) {
      if (!key) continue;
      const e = map.get(key) ?? { count: 0, active: 0, sum: 0 };
      e.count++;
      if (p.status === 'attivo') e.active++;
      e.sum += num(p.price);
      map.set(key, e);
    }
  }
  return [...map.entries()]
    .map(([name, e]) => ({ name, count: e.count, active: e.active, avgPrice: e.sum / e.count }))
    .sort((a, b) => b.count - a.count);
}

function TaxonomyTable({
  title,
  subtitle,
  icon,
  keyFn,
  label,
  exportName,
}: {
  title: string;
  subtitle: string;
  icon: typeof Layers;
  keyFn: (p: ProductRow) => string[];
  label: string;
  exportName: string;
}) {
  const query = useAllProducts();
  const rows = useMemo(() => aggregate(query.data?.items ?? [], keyFn), [query.data, keyFn]);

  const columns = useMemo<ColumnDef<TaxonomyRow, unknown>[]>(
    () => [
      { accessorKey: 'name', header: label, cell: ({ getValue }) => <span className="font-medium capitalize">{getValue() as string}</span> },
      { accessorKey: 'count', header: 'Prodotti', cell: ({ getValue }) => <Badge variant="default">{getValue() as number}</Badge> },
      { accessorKey: 'active', header: 'Attivi', cell: ({ getValue }) => <span className="text-muted-foreground">{getValue() as number}</span> },
      { accessorKey: 'avgPrice', header: 'Prezzo medio', cell: ({ getValue }) => eur(getValue() as number) },
    ],
    [label],
  );

  const Icon = icon;
  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} />
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(r) => r.name}
        searchValue={(r) => r.name}
        searchPlaceholder={`Cerca ${label.toLowerCase()}…`}
        exportName={exportName}
        exportTitle={title}
        exportColumns={exportColumns}
        isLoading={query.isLoading}
        emptyState={<EmptyState icon={Icon} title={`Nessuna ${label.toLowerCase()}`} description="Derivato dai prodotti del catalogo." />}
      />
    </div>
  );
}

export function CategoriesPage() {
  return (
    <TaxonomyTable
      title="Categorie"
      subtitle="Categorie derivate dal catalogo prodotti."
      icon={FolderTree}
      label="Categoria"
      exportName="categorie"
      keyFn={(p) => [p.categoria]}
    />
  );
}

export function CollectionsPage() {
  return (
    <TaxonomyTable
      title="Collezioni"
      subtitle="Collezioni derivate dal catalogo prodotti."
      icon={Layers}
      label="Collezione"
      exportName="collezioni"
      keyFn={(p) => (Array.isArray(p.collections) ? p.collections : [])}
    />
  );
}
