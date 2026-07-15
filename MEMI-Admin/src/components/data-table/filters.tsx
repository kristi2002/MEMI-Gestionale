import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Filter, X, ChevronDown, Check, Calendar, SlidersHorizontal, Bookmark, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * Unified, declarative filtering for list pages.
 *
 * A page describes its filters once (as FilterDef[]) and passes them to
 * <DataTable filters=… />. The table renders a consistent filter bar (controls +
 * active-filter chips + clear-all + saved views) and applies the filters to the
 * data itself — so every list page filters the same way, looks the same, and
 * behaves the same. Supports select, multi-select, date-range and number-range.
 */

export type FilterOption = { value: string; label: string };

export type FilterDef<T> = {
  /** Unique key within the table. */
  key: string;
  /** Human label shown on the control and chips. */
  label: string;
} & (
  | { type: 'select'; options: FilterOption[]; accessor: (row: T) => string | number | null | undefined }
  | { type: 'multiselect'; options: FilterOption[]; accessor: (row: T) => Array<string | number> | string | number | null | undefined }
  | { type: 'dateRange'; accessor: (row: T) => string | number | Date | null | undefined }
  | { type: 'numberRange'; accessor: (row: T) => number | string | null | undefined; unit?: string }
);

export type FilterValue =
  | { t: 'select'; v: string }
  | { t: 'multiselect'; v: string[] }
  | { t: 'dateRange'; from?: string; to?: string }
  | { t: 'numberRange'; min?: number; max?: number };

export type FilterValues = Record<string, FilterValue | undefined>;

/* ── value helpers ─────────────────────────────────────────── */

function isActive(v: FilterValue | undefined): boolean {
  if (!v) return false;
  if (v.t === 'select') return v.v !== '' && v.v !== 'all';
  if (v.t === 'multiselect') return v.v.length > 0;
  if (v.t === 'dateRange') return !!(v.from || v.to);
  if (v.t === 'numberRange') return v.min != null || v.max != null;
  return false;
}

export function activeFilterCount(values: FilterValues): number {
  return Object.values(values).filter(isActive).length;
}

/** Apply all active filters to the dataset (client-side). */
export function applyFilters<T>(data: T[], defs: FilterDef<T>[], values: FilterValues): T[] {
  const active = defs
    .map((d) => ({ d, v: values[d.key] }))
    .filter(({ v }) => isActive(v));
  if (!active.length) return data;

  return data.filter((row) =>
    active.every(({ d, v }) => {
      if (!v) return true;
      if (d.type === 'select' && v.t === 'select') {
        return String(d.accessor(row) ?? '') === v.v;
      }
      if (d.type === 'multiselect' && v.t === 'multiselect') {
        const raw = d.accessor(row);
        const arr = Array.isArray(raw) ? raw.map(String) : raw == null ? [] : [String(raw)];
        return v.v.some((sel) => arr.includes(sel));
      }
      if (d.type === 'dateRange' && v.t === 'dateRange') {
        const raw = d.accessor(row);
        if (raw == null || raw === '') return false;
        const t = new Date(raw as string | number | Date).getTime();
        if (Number.isNaN(t)) return false;
        if (v.from && t < new Date(v.from + 'T00:00:00').getTime()) return false;
        if (v.to && t > new Date(v.to + 'T23:59:59').getTime()) return false;
        return true;
      }
      if (d.type === 'numberRange' && v.t === 'numberRange') {
        const n = Number(d.accessor(row));
        if (Number.isNaN(n)) return false;
        if (v.min != null && n < v.min) return false;
        if (v.max != null && n > v.max) return false;
        return true;
      }
      return true;
    }),
  );
}

/* ── a tiny click-outside popover (reliable for inputs, unlike a menu) ── */
function Popover({ label, active, children }: { label: ReactNode; active: boolean; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn('h-9 shrink-0 gap-1.5 border-dashed', active && 'border-solid border-primary/50 bg-primary/5 text-primary')}
        onClick={() => setOpen((o) => !o)}
      >
        {label}
        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </Button>
      {open && (
        <div className="absolute left-0 z-50 mt-1 min-w-[15rem] rounded-md border bg-popover p-3 text-popover-foreground shadow-md">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

/* ── individual controls ───────────────────────────────────── */

function SelectControl<T>({ def, value, onChange }: { def: Extract<FilterDef<T>, { type: 'select' }>; value?: FilterValue; onChange: (v?: FilterValue) => void }) {
  const cur = value?.t === 'select' ? value.v : '';
  const curLabel = def.options.find((o) => o.value === cur)?.label;
  return (
    <Popover active={isActive(value)} label={<span>{def.label}{curLabel ? <span className="font-medium">: {curLabel}</span> : ''}</span>}>
      {(close) => (
        <div className="max-h-64 space-y-0.5 overflow-auto">
          <button type="button" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent" onClick={() => { onChange(undefined); close(); }}>
            <span className={cn('h-3.5 w-3.5', !isActive(value) ? 'opacity-100' : 'opacity-0')}><Check className="h-3.5 w-3.5" /></span>
            Tutti
          </button>
          {def.options.map((o) => (
            <button
              key={o.value}
              type="button"
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
              onClick={() => { onChange({ t: 'select', v: o.value }); close(); }}
            >
              <span className={cn('h-3.5 w-3.5', cur === o.value ? 'opacity-100' : 'opacity-0')}><Check className="h-3.5 w-3.5" /></span>
              <span className="capitalize">{o.label}</span>
            </button>
          ))}
        </div>
      )}
    </Popover>
  );
}

function MultiSelectControl<T>({ def, value, onChange }: { def: Extract<FilterDef<T>, { type: 'multiselect' }>; value?: FilterValue; onChange: (v?: FilterValue) => void }) {
  const sel = value?.t === 'multiselect' ? value.v : [];
  const toggle = (val: string) => {
    const next = sel.includes(val) ? sel.filter((x) => x !== val) : [...sel, val];
    onChange(next.length ? { t: 'multiselect', v: next } : undefined);
  };
  return (
    <Popover active={isActive(value)} label={<span>{def.label}{sel.length ? <span className="font-medium"> ({sel.length})</span> : ''}</span>}>
      {() => (
        <div className="max-h-64 space-y-0.5 overflow-auto">
          {def.options.map((o) => {
            const on = sel.includes(o.value);
            return (
              <button key={o.value} type="button" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent" onClick={() => toggle(o.value)}>
                <span className={cn('flex h-4 w-4 items-center justify-center rounded border', on ? 'border-primary bg-primary text-primary-foreground' : 'border-input')}>
                  {on && <Check className="h-3 w-3" />}
                </span>
                <span className="capitalize">{o.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </Popover>
  );
}

function DateRangeControl<T>({ def, value, onChange }: { def: Extract<FilterDef<T>, { type: 'dateRange' }>; value?: FilterValue; onChange: (v?: FilterValue) => void }) {
  const v = value?.t === 'dateRange' ? value : undefined;
  const set = (patch: Partial<{ from?: string; to?: string }>) => {
    const next = { from: v?.from, to: v?.to, ...patch };
    onChange(next.from || next.to ? { t: 'dateRange', ...next } : undefined);
  };
  const summary = v?.from || v?.to ? `: ${v?.from || '…'} → ${v?.to || '…'}` : '';
  return (
    <Popover active={isActive(value)} label={<span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{def.label}<span className="font-medium">{summary}</span></span>}>
      {() => (
        <div className="space-y-2">
          <label className="block text-xs text-muted-foreground">Da
            <Input type="date" value={v?.from ?? ''} onChange={(e) => set({ from: e.target.value || undefined })} className="mt-1" />
          </label>
          <label className="block text-xs text-muted-foreground">A
            <Input type="date" value={v?.to ?? ''} onChange={(e) => set({ to: e.target.value || undefined })} className="mt-1" />
          </label>
        </div>
      )}
    </Popover>
  );
}

function NumberRangeControl<T>({ def, value, onChange }: { def: Extract<FilterDef<T>, { type: 'numberRange' }>; value?: FilterValue; onChange: (v?: FilterValue) => void }) {
  const v = value?.t === 'numberRange' ? value : undefined;
  const set = (patch: Partial<{ min?: number; max?: number }>) => {
    const next = { min: v?.min, max: v?.max, ...patch };
    onChange(next.min != null || next.max != null ? { t: 'numberRange', ...next } : undefined);
  };
  const summary = v?.min != null || v?.max != null ? `: ${v?.min ?? '…'}–${v?.max ?? '…'}` : '';
  return (
    <Popover active={isActive(value)} label={<span>{def.label}<span className="font-medium">{summary}</span></span>}>
      {() => (
        <div className="flex items-center gap-2">
          <Input type="number" placeholder="Min" value={v?.min ?? ''} onChange={(e) => set({ min: e.target.value === '' ? undefined : Number(e.target.value) })} className="w-24" />
          <span className="text-muted-foreground">–</span>
          <Input type="number" placeholder="Max" value={v?.max ?? ''} onChange={(e) => set({ max: e.target.value === '' ? undefined : Number(e.target.value) })} className="w-24" />
          {def.unit && <span className="text-sm text-muted-foreground">{def.unit}</span>}
        </div>
      )}
    </Popover>
  );
}

/* ── chip summaries ────────────────────────────────────────── */
function chipText<T>(def: FilterDef<T>, v: FilterValue): string {
  if (def.type === 'select' && v.t === 'select') return `${def.label}: ${def.options.find((o) => o.value === v.v)?.label ?? v.v}`;
  if (def.type === 'multiselect' && v.t === 'multiselect') {
    const labels = v.v.map((val) => def.options.find((o) => o.value === val)?.label ?? val);
    return `${def.label}: ${labels.slice(0, 2).join(', ')}${labels.length > 2 ? ` +${labels.length - 2}` : ''}`;
  }
  if (def.type === 'dateRange' && v.t === 'dateRange') return `${def.label}: ${v.from || '…'} → ${v.to || '…'}`;
  if (def.type === 'numberRange' && v.t === 'numberRange') return `${def.label}: ${v.min ?? '…'}–${v.max ?? '…'}`;
  return def.label;
}

/* ── saved views (per-table, localStorage) ─────────────────── */
type SavedView = { name: string; values: FilterValues };
function loadViews(tableId: string): SavedView[] {
  try {
    return JSON.parse(localStorage.getItem(`memi_admin_views_${tableId}`) || '[]');
  } catch {
    return [];
  }
}
function storeViews(tableId: string, views: SavedView[]) {
  try {
    localStorage.setItem(`memi_admin_views_${tableId}`, JSON.stringify(views));
  } catch { /* ignore */ }
}

function SavedViews({ tableId, values, onApply }: { tableId: string; values: FilterValues; onApply: (v: FilterValues) => void }) {
  const [views, setViews] = useState<SavedView[]>(() => loadViews(tableId));
  const [name, setName] = useState('');
  const hasActive = activeFilterCount(values) > 0;
  const save = () => {
    const n = name.trim();
    if (!n) return;
    const next = [...views.filter((v) => v.name !== n), { name: n, values }];
    setViews(next);
    storeViews(tableId, next);
    setName('');
  };
  const remove = (n: string) => {
    const next = views.filter((v) => v.name !== n);
    setViews(next);
    storeViews(tableId, next);
  };
  return (
    <Popover active={false} label={<span className="inline-flex items-center gap-1"><Bookmark className="h-3.5 w-3.5" />Viste</span>}>
      {() => (
        <div className="space-y-2">
          {views.length === 0 && <p className="px-1 text-xs text-muted-foreground">Nessuna vista salvata.</p>}
          {views.map((v) => (
            <div key={v.name} className="flex items-center gap-2">
              <button type="button" className="flex-1 rounded px-2 py-1.5 text-left text-sm hover:bg-accent" onClick={() => onApply(v.values)}>
                {v.name}
              </button>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => remove(v.name)} aria-label={`Elimina ${v.name}`}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <div className="flex items-center gap-1 border-t pt-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome vista" className="h-8" disabled={!hasActive} onKeyDown={(e) => e.key === 'Enter' && save()} />
            <Button type="button" size="sm" className="h-8" onClick={save} disabled={!hasActive || !name.trim()}>Salva</Button>
          </div>
        </div>
      )}
    </Popover>
  );
}

/* ── the bar ───────────────────────────────────────────────── */
export function FilterBar<T>({
  defs,
  values,
  onChange,
  tableId,
}: {
  defs: FilterDef<T>[];
  values: FilterValues;
  onChange: (values: FilterValues) => void;
  tableId?: string;
}) {
  const setOne = (key: string, v?: FilterValue) => onChange({ ...values, [key]: v });
  const clearAll = () => onChange({});
  const activeCount = activeFilterCount(values);

  const activeChips = useMemo(
    () => defs.map((d) => ({ d, v: values[d.key] })).filter((x) => isActive(x.v)) as Array<{ d: FilterDef<T>; v: FilterValue }>,
    [defs, values],
  );

  if (!defs.length) return null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap">
        <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <SlidersHorizontal className="h-3.5 w-3.5" /> Filtri
        </span>
        {defs.map((def) => {
          const value = values[def.key];
          const onCh = (v?: FilterValue) => setOne(def.key, v);
          if (def.type === 'select') return <SelectControl key={def.key} def={def} value={value} onChange={onCh} />;
          if (def.type === 'multiselect') return <MultiSelectControl key={def.key} def={def} value={value} onChange={onCh} />;
          if (def.type === 'dateRange') return <DateRangeControl key={def.key} def={def} value={value} onChange={onCh} />;
          return <NumberRangeControl key={def.key} def={def} value={value} onChange={onCh} />;
        })}
        {tableId && <SavedViews tableId={tableId} values={values} onApply={onChange} />}
        {activeCount > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 shrink-0 gap-1 rounded-full border border-destructive/30 bg-destructive/5 px-3 font-medium text-destructive transition-colors hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive"
            onClick={clearAll}
          >
            <X className="h-3.5 w-3.5" /> Cancella filtri
            <span className="ml-0.5 rounded-full bg-destructive/15 px-1.5 text-[11px] leading-5 tabular-nums">{activeCount}</span>
          </Button>
        )}
      </div>
      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {activeChips.map(({ d, v }) => (
            <span key={d.key} className="inline-flex items-center gap-1 rounded-full border bg-muted/50 py-1 pl-2.5 pr-1.5 text-xs leading-none">
              <Filter className="h-3 w-3 shrink-0 opacity-50" />
              <span className="capitalize leading-none">{chipText(d, v)}</span>
              <button type="button" className="inline-flex shrink-0 items-center justify-center rounded-full p-0.5 hover:bg-background" onClick={() => setOne(d.key, undefined)} aria-label={`Rimuovi filtro ${d.label}`}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
