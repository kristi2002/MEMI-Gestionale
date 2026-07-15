import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { EntityFormFields } from './entity-form-fields';
import { Loader2 } from 'lucide-react';

export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'select'
  | 'multiselect'
  | 'checkbox'
  | 'date'
  | 'email'
  | 'image'
  | 'color';

export interface FieldConfig {
  name: string;
  label: string;
  type?: FieldType;
  options?: { value: string; label: string }[];
  placeholder?: string;
  required?: boolean;
  /** Full-width in the 2-col grid (default true for textarea/multiselect/image). */
  wide?: boolean;
  help?: string;
  /** For type 'image': upload a File and resolve to the stored URL. */
  upload?: (file: File) => Promise<string>;
}

export type FormValues = Record<string, string | number | boolean | string[] | null | undefined>;

interface EntityFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  fields: FieldConfig[];
  initial?: FormValues;
  submitLabel?: string;
  size?: 'default' | 'lg' | 'xl';
  onSubmit: (values: FormValues) => void | Promise<void>;
}

/** Config-driven create/edit form in a modal. Reused across entity views. */
export function EntityFormDialog({
  open,
  onOpenChange,
  title,
  description,
  fields,
  initial,
  submitLabel = 'Salva',
  size = 'lg',
  onSubmit,
}: EntityFormDialogProps) {
  const [values, setValues] = useState<FormValues>(initial ?? {});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setValues(initial ?? {});
  }, [open, initial]);

  function set(name: string, v: FormValues[string]) {
    setValues((prev) => ({ ...prev, [name]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await onSubmit(values);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size={size}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <EntityFormFields fields={fields} values={values} set={set} />
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Annulla
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />} {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Convenience wrapper: a page-level "Nuovo" button that opens the form. */
export function useEntityForm(): {
  open: boolean;
  setOpen: (v: boolean) => void;
  editing: FormValues | undefined;
  openCreate: () => void;
  openEdit: (row: FormValues) => void;
} {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FormValues | undefined>(undefined);
  return {
    open,
    setOpen,
    editing,
    openCreate: () => {
      setEditing(undefined);
      setOpen(true);
    },
    openEdit: (row: FormValues) => {
      setEditing(row);
      setOpen(true);
    },
  };
}
