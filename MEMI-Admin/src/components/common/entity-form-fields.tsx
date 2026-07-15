import { useRef, useState } from 'react';
import { Loader2, Upload, X } from 'lucide-react';
import type { FieldConfig, FormValues } from './entity-form-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

/**
 * The config-driven field grid, shared by EntityFormDialog (modal) and full-page
 * forms (e.g. ProductFormPage). Render it inside a
 * `grid grid-cols-1 gap-4 sm:grid-cols-2` container.
 */
export function EntityFormFields({
  fields,
  values,
  set,
}: {
  fields: FieldConfig[];
  values: FormValues;
  set: (name: string, v: FormValues[string]) => void;
}) {
  return (
    <>
      {fields.map((f) => {
        const t = f.type ?? 'text';
        const wide = f.wide ?? (t === 'textarea' || t === 'multiselect' || t === 'image');
        const val = values[f.name];
        return (
          <div key={f.name} className={`space-y-1.5 ${wide ? 'sm:col-span-2' : ''}`}>
            {t !== 'checkbox' && (
              <Label htmlFor={f.name}>
                {f.label}
                {f.required && <span className="text-destructive"> *</span>}
              </Label>
            )}
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
            ) : t === 'multiselect' ? (
              <MultiSelectField field={f} value={Array.isArray(val) ? (val as string[]) : []} set={set} />
            ) : t === 'image' ? (
              <ImageField field={f} value={(val as string) || ''} set={set} />
            ) : t === 'color' ? (
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label={`${f.label} selettore`}
                  className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-input bg-card p-1"
                  value={/^#[0-9a-fA-F]{6}$/.test((val as string) || '') ? (val as string) : '#cccccc'}
                  onChange={(e) => set(f.name, e.target.value)}
                />
                <Input
                  id={f.name}
                  type="text"
                  className="font-mono"
                  value={(val as string) ?? ''}
                  placeholder={f.placeholder ?? '#RRGGBB'}
                  onChange={(e) => set(f.name, e.target.value)}
                />
              </div>
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
    </>
  );
}

/** Toggleable chips for a string[] value. */
function MultiSelectField({
  field,
  value,
  set,
}: {
  field: FieldConfig;
  value: string[];
  set: (name: string, v: FormValues[string]) => void;
}) {
  const options = field.options ?? [];
  if (options.length === 0) {
    return <p className="text-sm text-muted-foreground">{field.placeholder ?? 'Nessuna opzione disponibile.'}</p>;
  }
  const toggle = (v: string) =>
    set(field.name, value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button
            type="button"
            key={o.value}
            aria-pressed={on}
            onClick={() => toggle(o.value)}
            className={cn(
              'rounded-full border px-3 py-1 text-sm transition-colors',
              on
                ? 'border-primary bg-primary/10 font-medium text-primary'
                : 'border-input text-muted-foreground hover:bg-muted',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Image upload with preview; stores the resulting URL string in the field. */
function ImageField({
  field,
  value,
  set,
}: {
  field: FieldConfig;
  value: string;
  set: (name: string, v: FormValues[string]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(file: File) {
    if (!field.upload) return;
    setBusy(true);
    try {
      const url = await field.upload(file);
      set(field.name, url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Caricamento non riuscito');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex h-20 w-28 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
        {value ? (
          <img src={value} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="text-xs text-muted-foreground">Nessuna</span>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? <Loader2 className="animate-spin" /> : <Upload />} {value ? 'Cambia immagine' : 'Carica immagine'}
        </Button>
        {value && (
          <Button type="button" variant="ghost" size="sm" onClick={() => set(field.name, '')}>
            <X /> Rimuovi
          </Button>
        )}
      </div>
    </div>
  );
}
