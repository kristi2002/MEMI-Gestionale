import { useMemo, useState, type ReactNode } from 'react';
import {
  type ColumnDef,
  type SortingState,
  type RowSelectionState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowUpDown, ChevronLeft, ChevronRight, Loader2, Search } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ExportMenu } from './export-menu';
import { BulkActionBar } from './bulk-action-bar';
import { FilterBar, applyFilters, type FilterDef, type FilterValues } from './filters';
import type { ExportColumn } from '@/lib/export';
import { cn } from '@/lib/utils';

export interface DataTableProps<T> {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  getRowId: (row: T) => string;
  /** Text search — a stringifier that returns the haystack for a row. */
  searchValue?: (row: T) => string;
  searchPlaceholder?: string;
  exportName: string;
  exportColumns: ExportColumn<T>[];
  exportTitle?: string;
  /** Declarative filters — rendered as a consistent bar and applied to the data. */
  filters?: FilterDef<T>[];
  /** Stable id enabling per-table saved filter views (localStorage). */
  tableId?: string;
  /** Extra controls rendered in the toolbar (rarely needed alongside `filters`). */
  toolbar?: ReactNode;
  /** Bulk-action buttons; receives the selected rows + a clear() callback. */
  bulkActions?: (selected: T[], clear: () => void) => ReactNode;
  isLoading?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  loadingMore?: boolean;
  onRowClick?: (row: T) => void;
  emptyState?: ReactNode;
  pageSize?: number;
}

export function DataTable<T>({
  columns,
  data,
  getRowId,
  searchValue,
  searchPlaceholder = 'Cerca…',
  exportName,
  exportColumns,
  exportTitle,
  filters,
  tableId,
  toolbar,
  bulkActions,
  isLoading,
  hasMore,
  onLoadMore,
  loadingMore,
  onRowClick,
  emptyState,
  pageSize = 25,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [globalFilter, setGlobalFilter] = useState('');
  const [filterValues, setFilterValues] = useState<FilterValues>({});

  const filteredData = useMemo(
    () => (filters && filters.length ? applyFilters(data, filters, filterValues) : data),
    [data, filters, filterValues],
  );

  // Prepend a selection column when bulk actions are wired up.
  const allColumns = useMemo<ColumnDef<T, unknown>[]>(() => {
    if (!bulkActions) return columns;
    const selectCol: ColumnDef<T, unknown> = {
      id: '__select',
      header: ({ table }) => (
        <Checkbox
          aria-label="Seleziona tutto"
          checked={
            table.getIsAllPageRowsSelected()
              ? true
              : table.getIsSomePageRowsSelected()
                ? 'indeterminate'
                : false
          }
          onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          aria-label="Seleziona riga"
          checked={row.getIsSelected()}
          onCheckedChange={(v) => row.toggleSelected(!!v)}
          onClick={(e) => e.stopPropagation()}
        />
      ),
      enableSorting: false,
      size: 36,
    };
    return [selectCol, ...columns];
  }, [columns, bulkActions]);

  const table = useReactTable({
    data: filteredData,
    columns: allColumns,
    state: { sorting, rowSelection, globalFilter },
    getRowId,
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: searchValue
      ? (row, _id, value) => searchValue(row.original).toLowerCase().includes(String(value).toLowerCase())
      : 'includesString',
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });

  const selectedRows = table.getSelectedRowModel().rows.map((r) => r.original);
  const filteredRows = table.getFilteredRowModel().rows.map((r) => r.original);
  const colSpan = allColumns.length;

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder={searchPlaceholder}
            className="pl-8"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {toolbar}
          <ExportMenu rows={filteredRows} columns={exportColumns} filename={exportName} title={exportTitle} />
        </div>
      </div>

      {/* Unified filter bar */}
      {filters && filters.length > 0 && (
        <FilterBar defs={filters} values={filterValues} onChange={setFilterValues} tableId={tableId} />
      )}

      {/* Table */}
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="hover:bg-transparent">
                {hg.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  return (
                    <TableHead key={header.id} style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}>
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          className="inline-flex items-center gap-1 hover:text-foreground"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <ArrowUpDown className="h-3 w-3 opacity-50" />
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  {allColumns.map((_c, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full max-w-[140px]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={colSpan} className="p-0">
                  {emptyState ?? (
                    <div className="py-12 text-center text-sm text-muted-foreground">Nessun risultato</div>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? 'selected' : undefined}
                  className={cn(onRowClick && 'cursor-pointer')}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Footer: counts + pagination + load more */}
      <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
        <p className="text-xs text-muted-foreground">
          {filteredRows.length} righe
          {hasMore ? ' caricate' : ''}
          {selectedRows.length > 0 && ` · ${selectedRows.length} selezionate`}
        </p>
        <div className="flex items-center gap-2">
          {hasMore && onLoadMore && (
            <Button variant="secondary" size="sm" onClick={onLoadMore} disabled={loadingMore}>
              {loadingMore && <Loader2 className="animate-spin" />} Carica altri
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeft />
          </Button>
          <span className="text-xs text-muted-foreground">
            {table.getState().pagination.pageIndex + 1} / {Math.max(1, table.getPageCount())}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>

      {/* Floating bulk-action bar */}
      {bulkActions && selectedRows.length > 0 && (
        <BulkActionBar
          count={selectedRows.length}
          onClear={() => setRowSelection({})}
          exportMenu={
            <ExportMenu
              rows={selectedRows}
              columns={exportColumns}
              filename={`${exportName}_selezionati`}
              title={exportTitle}
              selectedCount={selectedRows.length}
              variant="secondary"
            />
          }
        >
          {bulkActions(selectedRows, () => setRowSelection({}))}
        </BulkActionBar>
      )}
    </div>
  );
}
