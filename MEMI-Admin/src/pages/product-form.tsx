import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { EntityFormFields } from '@/components/common/entity-form-fields';
import type { FieldConfig, FormValues } from '@/components/common/entity-form-dialog';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { toast } from 'sonner';

/** "S:10, M:5, Unica:20" → [{taglia:'S',stock:10}, …]. Bare labels default to stock 0. */
function parseSizes(s: string): { taglia: string; stock: number }[] {
  return String(s || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .map((seg) => {
      const [t, st] = seg.split(':').map((y) => y.trim());
      return { taglia: t, stock: st != null && st !== '' ? Number(st) || 0 : 0 };
    })
    .filter((x) => x.taglia);
}

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
  taglie?: (string | { taglia: string; stock?: number })[];
};

/** Full-page create/edit form for a catalog product (replaces the old modal). */
export function ProductFormPage() {
  const { id } = useParams<{ id: string }>();
  const editing = id != null;
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [values, setValues] = useState<FormValues>({ status: 'attivo', discount_pct: 0 });
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
        const sizes = Array.isArray(d.taglie)
          ? d.taglie.map((s) => (typeof s === 'string' ? s : `${s.taglia}:${s.stock ?? 0}`)).join(', ')
          : '';
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
          sizes,
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

  const fields = useMemo<FieldConfig[]>(() => {
    const base: FieldConfig[] = [
      { name: 'name', label: 'Nome', required: true, wide: true },
      { name: 'categoria', label: 'Categoria', required: true, help: 'es. vestiti, top, pantaloni, gonne, blazer, set, scarpe, borse, gioielli, cinture' },
      { name: 'status', label: 'Stato', type: 'select', options: [
          { value: 'attivo', label: 'Attivo' }, { value: 'bozza', label: 'Bozza' }, { value: 'esaurito', label: 'Esaurito' },
        ] },
      { name: 'colore', label: 'Colore (chiave)', placeholder: 'blush' },
      { name: 'color_label', label: 'Colore (etichetta)', placeholder: 'Rosa cipria' },
      { name: 'price', label: 'Prezzo €', type: 'number', required: true },
      { name: 'original_price', label: 'Prezzo originale €', type: 'number', help: 'Vuoto se non in saldo.' },
      { name: 'discount_pct', label: 'Sconto %', type: 'number' },
      { name: 'sizes', label: 'Taglie e stock', wide: true, placeholder: 'S:10, M:5, L:0', help: 'Coppie taglia:quantità separate da virgola. Taglia unica → "Unica:20". Le immagini si caricano via importazione CSV.' },
      { name: 'description', label: 'Descrizione', type: 'textarea', wide: true },
    ];
    if (editing) return base;
    return [
      { name: 'id', label: 'ID (slug)', required: true, placeholder: 'es. blazer-lino-avorio', help: 'Identificativo univoco minuscolo, usato nell’URL del prodotto.' },
      ...base,
    ];
  }, [editing]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const data: Record<string, unknown> = {
        name: values.name,
        categoria: values.categoria,
        colore: values.colore || null,
        color_label: values.color_label || null,
        price: values.price,
        original_price: values.original_price === '' || values.original_price == null ? null : values.original_price,
        discount_pct: values.discount_pct || 0,
        status: values.status || 'attivo',
        description: values.description || null,
      };
      const sizes = parseSizes(values.sizes as string);
      if (sizes.length) data.taglie = sizes;

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
            ? 'Aggiorna dettagli, prezzi e stock per taglia.'
            : 'Crea un prodotto nel catalogo. Le immagini si caricano dopo, via importazione CSV.'
        }
      />

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <form onSubmit={submit} className="max-w-3xl">
          <div className="rounded-lg border bg-card p-5 sm:p-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <EntityFormFields fields={fields} values={values} set={set} />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2">
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
