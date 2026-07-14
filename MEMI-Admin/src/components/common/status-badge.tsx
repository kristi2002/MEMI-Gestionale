import { Badge } from '@/components/ui/badge';
import { statusLabel, statusTone, type StatusTone } from '@/lib/status';

const toneToVariant: Record<StatusTone, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  info: 'info',
  neutral: 'neutral',
};

/** Renders a status code as a coloured, Italian-labelled pill. */
export function StatusBadge({ code }: { code?: string | null }) {
  if (!code) return <span className="text-muted-foreground">—</span>;
  return <Badge variant={toneToVariant[statusTone(code)]}>{statusLabel(code)}</Badge>;
}
