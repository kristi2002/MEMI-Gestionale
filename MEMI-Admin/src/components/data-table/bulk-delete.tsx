import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { toast } from 'sonner';

interface BulkDeleteProps {
  count: number;
  noun: string; // e.g. "resi", "fatture"
  onDelete: () => Promise<unknown>;
  onDone?: () => void;
  description?: string;
}

/** Standard destructive bulk-delete button + confirm for DataTable bulkActions. */
export function BulkDelete({ count, noun, onDelete, onDone, description }: BulkDeleteProps) {
  return (
    <ConfirmDialog
      title={`Eliminare ${count} ${noun}?`}
      description={description ?? 'Operazione irreversibile.'}
      confirmLabel="Elimina"
      destructive
      onConfirm={async () => {
        await onDelete();
        toast.success(`${count} ${noun} eliminati`);
        onDone?.();
      }}
      trigger={
        <Button variant="destructive" size="sm">
          <Trash2 /> Elimina
        </Button>
      }
    />
  );
}
