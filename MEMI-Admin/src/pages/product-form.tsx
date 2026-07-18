import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { EntityFormFields } from '@/components/common/entity-form-fields';
import type { FieldConfig, FormValues } from '@/components/common/entity-form-fields';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SizeStockEditor, type SizeStock } from '@/components/common/size-stock-editor';
import { useCategories, useCollections, useColors } from '@/hooks/queries';
import { api } from '@/lib/api';
import { toast } from 'sonner';

/** The only collections assignable from this form — editorial groupings, not categories. */
// (Collections assignable from this form are the managed Collezioni entities.)

type ProductDetail = {
  name?: string;
  categoria?: string;
  colore?: string | null;
  color_label?: string | null;
  price?: number | string | null;
  original_price?: number | string | null;
  discount_pct?: number | null;
  status?: string;
  description?: string | null;
  collections?: string[];
  taglie?: (string | { taglia: string; stock?: number })[];
};

/** A titled card wrapping a subset of the config-driven fields. */
function FormSection({
  title,
  description,
  fields,
  values,
  set,
}: {
  title: string;
  description?: string;
  fields: FieldConfig[];
  values: FormValues;
  set: (name: string, v: FormValues[string]) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <EntityFormFields fields={fields} values={values} set={set} />
        </div>
      </CardContent>
    </Card>
  );
}

/** Full-page create/edit form for a catalog product (Shopify-style layout). */
export function ProductFormPage() {
  const { id } = useParams<{ id: string }>();
  const editing = id != null;
  const navigate = useNavigate();
  const qc = useQueryClient();

  const categoriesQuery = useCategories();
  const collectionsQuery = useCollections();
  const colorsQuery = useColors();

  const [values, setValues] = useState<FormValues>({ status: 'attivo', discount_pct: 0 });
  const [sizes, setSizes] = useState<SizeStock[]>([]);
  const [loading, setLoading] = useState<boolean>(editing);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!editing) return;
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const d = (await api.products.get(id!)) as unknown as ProductDetail;
        if (!alive) return;
        setSizes(
          Array.isArray(d.taglie)
            ? d.taglie.map((s) => (typeof s === 'string' ? { taglia: s, stock: 0 } : { taglia: s.taglia, stock: Number(s.stock) || 0 }))
            : [],
        );
        setValues({
          name: d.name ?? '',
          categoria: d.categoria ?? '',
          colore: d.colore ?? '',
          color_label: d.color_label ?? '',
          price: d.price == null ? '' : Number(d.price),
          original_price: d.original_price == null ? '' : Number(d.original_price),
          discount_pct: d.discount_pct || 0,
          status: d.status ?? 'attivo',
          description: d.description ?? '',
          collections: Array.isArray(d.collections) ? d.collections : [],
        });
      } catch {
        toast.error('Prodotto non trovato');
        navigate('/products', { replace: true });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, editing, navigate]);

  function set(name: string, v: FormValues[string]) {
    setValues((prev) => ({ ...prev, [name]: v }));
  }

  /** Category options come from the managed Categorie entity; the current value is
   *  always included so legacy products with an unmanaged slug still edit cleanly. */
  const categoryOptions = useMemo(() => {
    const managed = (categoriesQuery.data ?? []).map((c) => ({ value: c.slug, label: c.name }));
    const cur = (values.categoria as string) || '';
    if (cur && !managed.some((o) => o.value === cur)) managed.unshift({ value: cur, label: cur });
    return managed;
  }, [categoriesQuery.data, values.categoria]);

  // Options are every managed Collezione (any slug the admin created), plus any
  // slug already on this product so an existing membership is never dropped just
  // because it isn't in the managed list.
  const collectionOptions = useMemo(() => {
    const opts = (collectionsQuery.data ?? []).map((c) => ({ value: c.slug, label: c.name }));
    const cur = Array.isArray(values.collections) ? (values.collections as string[]) : [];
    for (const slug of cur) {
      if (!opts.some((o) => o.value === slug)) opts.push({ value: slug, label: slug });
    }
    return opts;
  }, [collectionsQuery.data, values.collections]);

  // Colour options come from the managed Colori entity; current value always included.
  const colorOptions = useMemo(() => {
    const managed = (colorsQuery.data ?? []).map((c) => ({ value: c.slug, label: c.name }));
    const cur = (values.colore as string) || '';
    if (cur && !managed.some((o) => o.value === cur)) managed.unshift({ value: cur, label: (values.color_label as string) || cur });
    return managed;
  }, [colorsQuery.data, values.colore, values.color_label]);

  // ── Field groups (rendered as separate cards) ──────────────────────────────
  const detailFields = useMemo<FieldConfig[]>(() => {
    const f: FieldConfig[] = [
      { name: 'name', label: 'Nome', required: true, wide: true },
      { name: 'description', label: 'Descrizione', type: 'textarea', wide: true },
    ];
    if (!editing) {
      f.unshift({ name: 'id', label: 'ID (slug)', required: true, wide: true, placeholder: 'es. blazer-lino-avorio', help: 'Identificativo univoco minuscolo, usato nell’URL del prodotto.' });
    }
    return f;
  }, [editing]);

  const priceFields: FieldConfig[] = [
    { name: 'price', label: 'Prezzo €', type: 'number', required: true },
    { name: 'original_price', label: 'Prezzo originale €', type: 'number', help: 'Vuoto se non in saldo.' },
    { name: 'discount_pct', label: 'Sconto %', type: 'number' },
  ];

  const statusFields: FieldConfig[] = [
    { name: 'status', label: 'Stato', type: 'select', wide: true, options: [
        { value: 'attivo', label: 'Attivo' }, { value: 'bozza', label: 'Bozza' }, { value: 'esaurito', label: 'Esaurito' },
      ] },
  ];

  const organizationFields = useMemo<FieldConfig[]>(() => {
    const categoria: FieldConfig = categoryOptions.length
      ? { name: 'categoria', label: 'Categoria', type: 'select', required: true, wide: true, placeholder: 'Seleziona categoria…', options: categoryOptions,
          help: 'Gestisci l’elenco in Prodotti → Categorie.' }
      : { name: 'categoria', label: 'Categoria', required: true, wide: true, placeholder: 'es. scarpe',
          help: 'Nessuna categoria gestita: creane in Prodotti → Categorie.' };
    const collezioni: FieldConfig = {
      name: 'collections', label: 'Collezioni', type: 'multiselect', wide: true,
      options: collectionOptions,
      placeholder: collectionOptions.length ? undefined : 'Nessuna collezione: creane in Prodotti \u2192 Collezioni.',
      help: 'Raggruppamenti editoriali che controllano le pagine collezione dello shop. Un prodotto pu\u00f2 stare in pi\u00f9 collezioni.',
    };
    return [categoria, collezioni];
  }, [categoryOptions, collectionOptions]);

  const colorFields = useMemo<FieldConfig[]>(() => {
    const colore: FieldConfig = colorOptions.length
      ? { name: 'colore', label: 'Colore', type: 'select', wide: true, placeholder: 'Seleziona colore…', options: colorOptions,
          help: 'Gestisci la palette in Prodotti → Colori.' }
      : { name: 'colore', label: 'Colore (chiave)', wide: true, placeholder: 'blush',
          help: 'Nessun colore gestito: creane in Prodotti → Colori.' };
    return [colore];
  }, [colorOptions]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!values.categoria) {
      toast.error('La categoria è obbligatoria');
      return;
    }
    setBusy(true);
    try {
      // Mirror the selected colour's display name into color_label (kept in sync
      // with the managed palette). Collections come from the multiselect and are
      // sent as an array of slugs (also managed under Collezioni).
      const selectedColor = (colorsQuery.data ?? []).find((c) => c.slug === values.colore);
      const colorLabel = selectedColor?.name ?? (values.color_label as string) ?? null;
      const data: Record<string, unknown> = {
        name: values.name,
        categoria: values.categoria,
        colore: values.colore || null,
        color_label: values.colore ? colorLabel : null,
        price: values.price,
        original_price: values.original_price === '' || values.original_price == null ? null : values.original_price,
        discount_pct: values.discount_pct || 0,
        status: values.status || 'attivo',
        description: values.description || null,
        // Persist exactly the selected collection slugs. No filtering: a product's
        // membership in a custom collection must survive an edit of any other field.
        collections: Array.isArray(values.collections) ? (values.collections as string[]) : [],
      };
      const cleanSizes = sizes.filter((s) => s.taglia.trim());
      if (cleanSizes.length) data.taglie = cleanSizes;

      if (editing) {
        await api.products.update(id!, data);
        toast.success('Prodotto aggiornato');
      } else {
        data.id = values.id;
        await api.products.create(data);
        toast.success('Prodotto creato');
      }
      qc.invalidateQueries({ queryKey: ['products'] });
      navigate('/products');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Salvataggio non riuscito');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Button variant="ghost" size="sm" className="-ml-2 mb-2" onClick={() => navigate('/products')}>
        <ArrowLeft /> Prodotti
      </Button>
      <PageHeader
        title={editing ? 'Modifica prodotto' : 'Nuovo prodotto'}
        subtitle={
          editing
            ? 'Aggiorna dettagli, prezzi, organizzazione e stock per taglia.'
            : 'Crea un prodotto nel catalogo. Le immagini si caricano dopo, via importazione CSV.'
        }
      />

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <form onSubmit={submit}>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Main column */}
            <div className="space-y-6 lg:col-span-2">
              <FormSection title="Dettagli" fields={detailFields} values={values} set={set} />
              <FormSection title="Prezzi" fields={priceFields} values={values} set={set} />
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Taglie e magazzino</CardTitle>
                  <CardDescription>
                    Seleziona le taglie disponibili e imposta lo stock per ciascuna. Le immagini si caricano via importazione CSV.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <SizeStockEditor value={sizes} onChange={setSizes} />
                </CardContent>
              </Card>
            </div>
            {/* Side column */}
            <div className="space-y-6">
              <FormSection title="Stato" fields={statusFields} values={values} set={set} />
              <FormSection
                title="Organizzazione"
                description="Categoria e collezioni del prodotto."
                fields={organizationFields}
                values={values}
                set={set}
              />
              <FormSection title="Colore" fields={colorFields} values={values} set={set} />
            </div>
          </div>

          <div className="mt-6 flex items-center gap-2">
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />} {editing ? 'Salva modifiche' : 'Crea prodotto'}
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate('/products')} disabled={busy}>
              Annulla
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
