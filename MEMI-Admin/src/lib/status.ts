/** Status code → Italian label (ported from AdminAPI.statusLabel). */
const LABELS: Record<string, string> = {
  in_attesa: 'In attesa',
  in_preparazione: 'In preparazione',
  spedito: 'Spedito',
  consegnato: 'Consegnato',
  annullato: 'Annullato',
  pagato: 'Pagato',
  rimborsato: 'Rimborsato',
  fallito: 'Fallito',
  preso_in_carico: 'Preso in carico',
  in_transito: 'In transito',
  in_consegna: 'In consegna',
  problema: 'Problema',
  attivo: 'Attivo',
  disattivo: 'Disattivo',
  pianificato: 'Pianificato',
  bozza: 'Bozza',
  esaurito: 'Esaurito',
  archiviato: 'Archiviato',
};

export function statusLabel(code?: string | null): string {
  if (!code) return '—';
  return LABELS[code] || code;
}

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

/** Maps any status code to a semantic tone for the badge colour. */
export function statusTone(code?: string | null): StatusTone {
  const s = (code || '').toLowerCase();
  if (/(conseg|pagat|attiv|approv|pubblic)/.test(s)) return 'success';
  if (/(spedit|transito|consegna|carico|analisi|invia)/.test(s)) return 'info';
  if (/(attesa|preparaz|pianif|pending)/.test(s)) return 'warning';
  if (/(annull|rimbors|esaur|fallit|rifiut|problema|disatt)/.test(s)) return 'danger';
  return 'neutral';
}
