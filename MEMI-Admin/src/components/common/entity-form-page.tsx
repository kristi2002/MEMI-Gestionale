import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { PageHeader } from './page-header';
import { EntityFormFields } from './entity-form-fields';
import type { FieldConfig, FormValues } from './entity-form-fields';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

/**
 * Full-page create/edit form — the page-based replacement for EntityFormDialog.
 * Mirrors the ProductFormPage layout: a wide main column of fields plus a side
 * "Impostazioni" rail. Fields flagged `side: true` go to the rail; everything
 * else fills the main card. When no field is flagged, it falls back to a single
 * comfortable-width card. Entities pass their field config + initial values + an
 * onSubmit; this owns the form state and navigation.
 */
export function EntityFormPage({
  title,
  subtitle,
  backPath,
  backLabel,
  fields,
  initial,
  submitLabel,
  onSubmit,
  loading,
  mainTitle = 'Dettagli',
  sideTitle = 'Impostazioni',
}: {
  title: string;
  subtitle?: string;
  backPath: string;
  backLabel: string;
  fields: FieldConfig[];
  initial: FormValues;
  submitLabel: string;
  onSubmit: (values: FormValues) => Promise<void>;
  loading?: boolean;
  /** Title of the main column card. */
  mainTitle?: string;
  /** Title of the side rail card (shown only when some fields are `side`). */
  sideTitle?: string;
}) {
  const navigate = useNavigate();
  const [values, setValues] = useState<FormValues>(initial);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setValues(initial);
  }, [initial]);

  const set = (name: string, v: FormValues[string]) => setValues((p) => ({ ...p, [name]: v }));

  const mainFields = fields.filter((f) => !f.side);
  const sideFields = fields.filter((f) => f.side);
  const hasSide = sideFields.length > 0;

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
        <form onSubmit={submit}>
          <div className={hasSide ? 'grid grid-cols-1 gap-6 lg:grid-cols-3' : ''}>
            {/* Main column */}
            <div className={hasSide ? 'space-y-6 lg:col-span-2' : 'max-w-3xl'}>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{mainTitle}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <EntityFormFields fields={mainFields} values={values} set={set} />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Side rail */}
            {hasSide && (
              <div className="space-y-6">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{sideTitle}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 gap-4">
                      <EntityFormFields fields={sideFields} values={values} set={set} />
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>

          <div className="mt-6 flex items-center gap-2">
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
