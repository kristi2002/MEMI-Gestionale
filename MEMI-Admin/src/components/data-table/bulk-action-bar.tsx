import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

interface BulkActionBarProps {
  count: number;
  onClear: () => void;
  exportMenu?: ReactNode;
  children?: ReactNode;
}

/** Floating action bar shown while rows are selected (industry-standard pattern). */
export function BulkActionBar({ count, onClear, exportMenu, children }: BulkActionBarProps) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border bg-card/95 py-2 pl-4 pr-2 shadow-lg backdrop-blur">
        <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
          {count}
        </span>
        <span className="text-sm font-medium">selezionati</span>
        <Separator orientation="vertical" className="mx-1 h-6" />
        {exportMenu}
        {children}
        <Separator orientation="vertical" className="mx-1 h-6" />
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={onClear} aria-label="Deseleziona">
          <X />
        </Button>
      </div>
    </div>
  );
}
