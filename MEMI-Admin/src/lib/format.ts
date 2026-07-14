/**
 * Formatting helpers — Italian locale, EUR currency.
 * Backend serialises DECIMAL columns as strings, so every money helper parses
 * defensively via Number().
 */

export function num(value: unknown): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(n) ? n : 0;
}

const eurFmt = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
});

export function eur(value: unknown): string {
  return eurFmt.format(num(value));
}

const numFmt = new Intl.NumberFormat('it-IT');
export function int(value: unknown): string {
  return numFmt.format(Math.round(num(value)));
}

export function date(value: unknown): string {
  if (!value) return '—';
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('it-IT');
}

export function dateTime(value: unknown): string {
  if (!value) return '—';
  const d = new Date(String(value));
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('it-IT', { dateStyle: 'medium', timeStyle: 'short' });
}

/** "3 min fa" / "2 h fa" / "5 g fa" relative time (matches legacy admin). */
export function ago(value: unknown): string {
  if (!value) return '—';
  const t = new Date(String(value)).getTime();
  if (Number.isNaN(t)) return '—';
  const m = Math.max(0, Math.floor((Date.now() - t) / 60000));
  if (m < 60) return `${m} min fa`;
  if (m < 1440) return `${Math.floor(m / 60)} h fa`;
  return `${Math.floor(m / 1440)} g fa`;
}

export function initials(name: string): string {
  return (name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('');
}
