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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react';

export type FieldType = 'text' | 'textarea' | 'number' | 'select' | 'checkbox' | 'date' | 'email';

export interface FieldConfig {
  name: string;
  label: string;
  type?: FieldType;
  options?: { value: string; label: string }[];
  placeholder?: string;
  required?: boolean;
  /** Full-width in the 2-col grid (default true for textarea). */
  wide?: boolean;
  help?: string;
}

export type FormValues = Record<string, string | number | boolean | null | undefined>;

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
          {fields.map((f) => {
            const t = f.type ?? 'text';
            const wide = f.wide ?? (t === 'textarea');
            const val = values[f.name];
            return (
              <div key={f.name} className={`space-y-1.5 ${wide ? 'sm:col-span-2' : ''}`}>
                {t !== 'checkbox' && <Label htmlFor={f.name}>{f.label}{f.required && <span className="text-destructive"> *</span>}</Label>}
                {t === 'textarea' ? (
                  <textarea
                    id={f.name}
                    className="flex min-h-[90px] w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={(val as string) ?? ''}
                    placeholder={f.placeholder}
                    required={f.required}
                    onChange={(e) => set(f.name, e.target.value)}
                  />
                ) : t === 'select' ? (
                  <Select value={(val as string) ?? ''} onValueChange={(v) => set(f.name, v)}>
                    <SelectTrigger id={f.name}>
                      <SelectValue placeholder={f.placeholder ?? 'Seleziona…'} />
                    </SelectTrigger>
                    <SelectContent>
                      {(f.options ?? []).map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : t === 'checkbox' ? (
                  <label className="flex cursor-pointer items-center gap-2 pt-1">
                    <Checkbox checked={!!val} onCheckedChange={(v) => set(f.name, !!v)} />
                    <span className="text-sm font-medium">{f.label}</span>
                  </label>
                ) : (
                  <Input
                    id={f.name}
                    type={t === 'number' ? 'number' : t === 'date' ? 'date' : t === 'email' ? 'email' : 'text'}
                    value={(val as string | number) ?? ''}
                    placeholder={f.placeholder}
                    required={f.required}
                    step={t === 'number' ? 'any' : undefined}
                    onChange={(e) => set(f.name, t === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)}
                  />
                )}
                {f.help && <p className="text-xs text-muted-foreground">{f.help}</p>}
              </div>
            );
          })}
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
