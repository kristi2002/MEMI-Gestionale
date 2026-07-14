import type { LucideIcon } from 'lucide-react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export type KpiTone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'muted';

const toneClasses: Record<KpiTone, string> = {
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/12 text-success',
  warning: 'bg-warning/15 text-warning',
  danger: 'bg-destructive/12 text-destructive',
  info: 'bg-info/12 text-info',
  muted: 'bg-muted text-muted-foreground',
};

interface KpiCardProps {
  label: string;
  value: string | number;
  delta?: string;
  up?: boolean;
  icon?: LucideIcon;
  tone?: KpiTone;
  loading?: boolean;
}

export function KpiCard({ label, value, delta, up, icon: Icon, tone = 'primary', loading }: KpiCardProps) {
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        {Icon && (
          <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg', toneClasses[tone])}>
            <Icon className="h-[18px] w-[18px]" />
          </span>
        )}
      </div>
      <div className="text-2xl font-bold tracking-tight text-foreground">
        {loading ? <span className="text-muted-foreground">…</span> : value}
      </div>
      {delta && (
        <div
          className={cn(
            'inline-flex items-center gap-1 text-xs font-medium',
            up ? 'text-success' : 'text-destructive',
          )}
        >
          {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
          {delta}
        </div>
      )}
    </Card>
  );
}
