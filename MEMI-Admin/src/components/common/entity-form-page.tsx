import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { PageHeader } from './page-header';
import { EntityFormFields } from './entity-form-fields';
import type { FieldConfig, FormValues } from './entity-form-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

export interface FormSectionDef {
  /** Card title. Omit for a single untitled card. */
  title?: string;
  description?: string;
  fields: FieldConfig[];
}

/**
 * Full-page create/edit form — the page-based replacement for EntityFormDialog.
 * Renders one or more titled cards of config-driven fields with a back link and a
 * sticky submit row, matching the ProductFormPage look. Entities pass their field
 * config + initial values + an onSubmit; this owns the form state and navigation.
 */
export function EntityFormPage({
  title,
  subtitle,
  backPath,
  backLabel,
  sections,
  fields,
  initial,
  submitLabel,
  onSubmit,
  loading,
}: {
  title: string;
  subtitle?: string;
  backPath: string;
  backLabel: string;
  /** Either a flat field list… */
  fields?: FieldConfig[];
  /** …or grouped sections (each a card). */
  sections?: FormSectionDef[];
  initial: FormValues;
  submitLabel: string;
  onSubmit: (values: FormValues) => Promise<void>;
  loading?: boolean;
}) {
  const navigate = useNavigate();
  const [values, setValues] = useState<FormValues>(initial);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setValues(initial);
  }, [initial]);

  const set = (name: string, v: FormValues[string]) => setValues((p) => ({ ...p, [name]: v }));
  const groups: FormSectionDef[] = sections ?? [{ fields: fields ?? [] }];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await onSubmit(values);
      navigate(backPath);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Salvataggio non riuscito');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Button variant="ghost" size="sm" className="-ml-2 mb-2" onClick={() => navigate(backPath)}>
        <ArrowLeft /> {backLabel}
      </Button>
      <PageHeader title={title} subtitle={subtitle} />

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <form onSubmit={submit} className="max-w-3xl space-y-5">
          {groups.map((g, i) => (
            <Card key={i}>
              {g.title && (
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{g.title}</CardTitle>
                  {g.description && <p className="text-sm text-muted-foreground">{g.description}</p>}
                </CardHeader>
              )}
              <CardContent className={g.title ? '' : 'pt-6'}>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <EntityFormFields fields={g.fields} values={values} set={set} />
                </div>
              </CardContent>
            </Card>
          ))}
          <div className="flex items-center gap-2">
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />} {submitLabel}
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate(backPath)} disabled={busy}>
              Annulla
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
