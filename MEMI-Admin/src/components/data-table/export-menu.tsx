import { useState } from 'react';
import { Download, FileText, FileSpreadsheet, FileJson, Printer, Copy, Loader2, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { exportData, type ExportColumn, type ExportFormat } from '@/lib/export';
import { toast } from 'sonner';

interface ExportMenuProps<T> {
  rows: T[];
  columns: ExportColumn<T>[];
  filename: string;
  title?: string;
  /** Number selected — when > 0 the label reflects "selezionati". */
  selectedCount?: number;
  size?: 'sm' | 'default';
  variant?: 'outline' | 'secondary' | 'ghost';
}

const OPTIONS: { format: ExportFormat; label: string; icon: typeof FileText }[] = [
  { format: 'csv', label: 'CSV', icon: FileText },
  { format: 'xlsx', label: 'Excel (XLSX)', icon: FileSpreadsheet },
  { format: 'pdf', label: 'PDF', icon: FileText },
  { format: 'json', label: 'JSON', icon: FileJson },
  { format: 'print', label: 'Stampa', icon: Printer },
  { format: 'copy', label: 'Copia negli appunti', icon: Copy },
];

export function ExportMenu<T>({
  rows,
  columns,
  filename,
  title,
  selectedCount = 0,
  size = 'sm',
  variant = 'outline',
}: ExportMenuProps<T>) {
  const [busy, setBusy] = useState<ExportFormat | null>(null);

  async function run(format: ExportFormat) {
    if (!rows.length) {
      toast.info('Nessuna riga da esportare');
      return;
    }
    setBusy(format);
    try {
      await exportData(format, { rows, columns, filename, title });
      if (format === 'copy') toast.success(`${rows.length} righe copiate`);
      else if (format !== 'print') toast.success(`Esportate ${rows.length} righe (${format.toUpperCase()})`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Esportazione non riuscita');
    } finally {
      setBusy(null);
    }
  }

  const label = selectedCount > 0 ? `Esporta (${selectedCount})` : 'Esporta';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} disabled={busy !== null}>
          {busy ? <Loader2 className="animate-spin" /> : <Download />}
          {label}
          <ChevronDown className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>
          {selectedCount > 0 ? `${selectedCount} selezionati` : `${rows.length} righe`}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {OPTIONS.map((o) => (
          <DropdownMenuItem key={o.format} onSelect={() => run(o.format)}>
            <o.icon className="text-muted-foreground" />
            {o.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
