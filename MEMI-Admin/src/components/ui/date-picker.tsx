import * as React from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

/* ── date helpers (all local-time; never `new Date('YYYY-MM-DD')` which is UTC) ── */
const MONTHS = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']; // Monday-first (Italian)

const pad = (n: number) => String(n).padStart(2, '0');
const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const formatIt = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const mondayIndex = (d: Date) => (d.getDay() + 6) % 7; // 0 = Monday … 6 = Sunday

/** First 10 chars parsed as a local date, tolerating full ISO datetimes. */
function parseISO(s?: string | null): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s ?? ''));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 6×7 grid of days covering the month of `view`, padded from the surrounding months. */
function buildGrid(view: Date): Date[] {
  const start = addDays(startOfMonth(view), -mondayIndex(startOfMonth(view)));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export interface DatePickerProps {
  id?: string;
  /** ISO `YYYY-MM-DD` (or a full ISO datetime — only the date part is used). */
  value?: string | null;
  /** Fires with an ISO `YYYY-MM-DD`, or `''` when cleared. */
  onChange: (value: string) => void;
  placeholder?: string;
  /** Extra classes for the trigger button. */
  className?: string;
  disabled?: boolean;
  /** Show the "Cancella" action + allow emptying (default true). */
  clearable?: boolean;
  /** Render the calendar in a portal (default true). Pass false inside another
   *  home-grown click-outside popover, e.g. the filter bar. */
  withPortal?: boolean;
  align?: 'start' | 'center' | 'end';
  ariaLabel?: string;
}

/**
 * A design-system date picker that replaces the browser's native (OS-rendered)
 * `<input type="date">` calendar — the one that looks like Windows XP — with a
 * themed month grid that respects light/dark tokens and the violet accent.
 * Keeps the value as an ISO `YYYY-MM-DD` string, so it's a drop-in for the
 * existing native inputs.
 */
export function DatePicker({
  id,
  value,
  onChange,
  placeholder = 'gg/mm/aaaa',
  className,
  disabled,
  clearable = true,
  withPortal = true,
  align = 'start',
  ariaLabel,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const selected = parseISO(value);
  const today = React.useMemo(() => new Date(), []);
  const [view, setView] = React.useState<Date>(() => startOfMonth(selected ?? today));
  // Day that should hold DOM focus for keyboard nav (roving tabindex).
  const [focusISO, setFocusISO] = React.useState<string>(() => toISO(selected ?? today));
  const gridRef = React.useRef<HTMLDivElement>(null);

  // Re-anchor the view + focus each time the popover opens.
  React.useEffect(() => {
    if (!open) return;
    const base = parseISO(value) ?? today;
    setView(startOfMonth(base));
    setFocusISO(toISO(base));
  }, [open, value, today]);

  // Move real DOM focus onto the active day after open / month change.
  React.useLayoutEffect(() => {
    if (!open) return;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-iso="${focusISO}"]`)?.focus();
  }, [open, focusISO, view]);

  const commit = (d: Date) => {
    onChange(toISO(d));
    setOpen(false);
  };

  const moveFocus = (next: Date) => {
    setFocusISO(toISO(next));
    if (next.getMonth() !== view.getMonth() || next.getFullYear() !== view.getFullYear()) {
      setView(startOfMonth(next));
    }
  };

  const onGridKeyDown = (e: React.KeyboardEvent) => {
    const cur = parseISO(focusISO) ?? today;
    let next: Date | null = null;
    switch (e.key) {
      case 'ArrowLeft': next = addDays(cur, -1); break;
      case 'ArrowRight': next = addDays(cur, 1); break;
      case 'ArrowUp': next = addDays(cur, -7); break;
      case 'ArrowDown': next = addDays(cur, 7); break;
      case 'Home': next = addDays(cur, -mondayIndex(cur)); break;
      case 'End': next = addDays(cur, 6 - mondayIndex(cur)); break;
      case 'PageUp': next = addMonths(cur, e.shiftKey ? -12 : -1); break;
      case 'PageDown': next = addMonths(cur, e.shiftKey ? 12 : 1); break;
      default: return;
    }
    e.preventDefault();
    moveFocus(next);
  };

  const grid = buildGrid(view);

  const navBtn =
    'inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
          'data-[state=open]:ring-2 data-[state=open]:ring-ring',
          className,
        )}
      >
        <span className={cn('truncate', !selected && 'text-muted-foreground')}>
          {selected ? formatIt(selected) : placeholder}
        </span>
        {selected && clearable ? (
          <X
            className="h-4 w-4 shrink-0 opacity-50 transition-opacity hover:opacity-100"
            role="button"
            aria-label="Cancella data"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onChange('');
            }}
          />
        ) : (
          <CalendarIcon className="h-4 w-4 shrink-0 opacity-50" />
        )}
      </PopoverTrigger>

      <PopoverContent
        withPortal={withPortal}
        align={align}
        className="p-3"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {/* Header: « year  ‹ month   Caption   month ›  year » */}
        <div className="mb-2 flex items-center justify-between px-0.5">
          <div className="flex items-center gap-1">
            <button type="button" className={navBtn} aria-label="Anno precedente" onClick={() => setView(addMonths(view, -12))}>
              <ChevronsLeft className="h-4 w-4" />
            </button>
            <button type="button" className={navBtn} aria-label="Mese precedente" onClick={() => setView(addMonths(view, -1))}>
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>
          <div className="text-sm font-semibold tabular-nums" aria-live="polite">
            {MONTHS[view.getMonth()]} {view.getFullYear()}
          </div>
          <div className="flex items-center gap-1">
            <button type="button" className={navBtn} aria-label="Mese successivo" onClick={() => setView(addMonths(view, 1))}>
              <ChevronRight className="h-4 w-4" />
            </button>
            <button type="button" className={navBtn} aria-label="Anno successivo" onClick={() => setView(addMonths(view, 12))}>
              <ChevronsRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Weekday header */}
        <div className="grid grid-cols-7 gap-0.5">
          {WEEKDAYS.map((w) => (
            <div key={w} className="flex h-8 items-center justify-center text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">
              {w}
            </div>
          ))}
        </div>

        {/* Day grid */}
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
        <div ref={gridRef} role="grid" className="grid grid-cols-7 gap-0.5" onKeyDown={onGridKeyDown}>
          {grid.map((d) => {
            const outside = d.getMonth() !== view.getMonth();
            const isSelected = !!selected && sameDay(d, selected);
            const isToday = sameDay(d, today);
            const isFocusTarget = toISO(d) === focusISO;
            return (
              <button
                key={toISO(d)}
                type="button"
                role="gridcell"
                data-iso={toISO(d)}
                tabIndex={isFocusTarget ? 0 : -1}
                aria-pressed={isSelected}
                aria-current={isToday ? 'date' : undefined}
                aria-label={`${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`}
                onClick={() => commit(d)}
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-md text-sm tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  outside && 'text-muted-foreground/40',
                  !isSelected && !outside && 'text-foreground hover:bg-accent hover:text-accent-foreground',
                  !isSelected && outside && 'hover:bg-accent hover:text-accent-foreground',
                  isToday && !isSelected && 'font-semibold text-primary ring-1 ring-inset ring-primary/40',
                  isSelected && 'bg-primary font-semibold text-primary-foreground hover:bg-primary',
                )}
              >
                {d.getDate()}
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-2 flex items-center justify-between border-t pt-2">
          <button
            type="button"
            className="rounded-md px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-accent"
            onClick={() => commit(new Date())}
          >
            Oggi
          </button>
          {clearable && selected && (
            <button
              type="button"
              className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
            >
              Cancella
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
