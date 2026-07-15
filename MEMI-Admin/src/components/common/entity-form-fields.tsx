import type { FieldConfig, FormValues } from './entity-form-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';

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
        const wide = f.wide ?? t === 'textarea';
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
