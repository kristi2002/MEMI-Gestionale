import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Pencil } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { eur } from '@/lib/format';
import { toast } from 'sonner';

type SchedaSize = string | { taglia: string; stock?: number | null };
type ProductDetail = {
  id?: string;
  name?: string;
  categoria?: string;
  colore?: string | null;
  color_label?: string | null;
  color_hex?: string | null;
  price?: number | string | null;
  original_price?: number | string | null;
  discount_pct?: number | null;
  status?: string;
  description?: string | null;
  collections?: string[];
  images?: ({ full?: string; card?: string; thumb?: string } | string)[];
  taglie?: SchedaSize[];
  stock_total?: number | null;
};

type ProductImg = { full?: string; card?: string; thumb?: string } | string;
function imgUrl(im: ProductImg): string | null {
  if (!im) return null;
  if (typeof im === 'string') return im;
  return im.full || im.card || im.thumb || null;
}

/** A labelled read-only field — the display twin of an input row. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm">{children ?? <span className="text-muted-foreground">—</span>}</div>
    </div>
  );
}

/**
 * Read-only "scheda prodotto" — same layout as the edit form but rendered as
 * plain values instead of inputs. A Modifica button jumps to the editable form.
 */
export function ProductSchedaPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [p, setP] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const d = (await api.products.get(id!)) as unknown as ProductDetail;
        if (alive) setP(d);
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
  }, [id, navigate]);

  const sizes = (p?.taglie ?? []).map((s) =>
    typeof s === 'string' ? { taglia: s, stock: null as number | null } : { taglia: s.taglia, stock: s.stock ?? null },
  );
  const totalStock = sizes.reduce((n, s) => n + (Number(s.stock) || 0), 0);
  const images = (p?.images ?? []).map(imgUrl).filter(Boolean) as string[];
  const price = p?.price == null ? null : Number(p.price);
  const original = p?.original_price == null || p?.original_price === '' ? null : Number(p.original_price);

  return (
    <div>
      <Button variant="ghost" size="sm" className="-ml-2 mb-2" onClick={() => navigate('/products')}>
        <ArrowLeft /> Prodotti
      </Button>
      <PageHeader
        title={loading ? 'Scheda prodotto' : p?.name || 'Scheda prodotto'}
        subtitle="Scheda prodotto — sola lettura. Usa Modifica per cambiare i dati."
        actions={
          <Button size="sm" onClick={() => navigate(`/products/${encodeURIComponent(id!)}/edit`)}>
            <Pencil /> Modifica
          </Button>
        }
      />

      {loading || !p ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Main column */}
          <div className="space-y-6 lg:col-span-2">
            {images.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Immagini</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                    {images.map((src, i) => (
                      <div key={i} className="aspect-square overflow-hidden rounded-md border bg-muted">
                        <img src={src} alt="" className="h-full w-full object-cover" />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Dettagli</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Field label="Nome">{p.name}</Field>
                <Field label="ID (slug)">
                  <span className="font-mono text-xs text-muted-foreground">{p.id}</span>
                </Field>
                <Field label="Descrizione">
                  {p.description ? <p className="whitespace-pre-line">{p.description}</p> : null}
                </Field>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Prezzi</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <Field label="Prezzo">
                    <span className="font-semibold">{price == null ? '—' : eur(price)}</span>
                  </Field>
                  <Field label="Prezzo originale">
                    {original == null ? null : <span className="text-muted-foreground line-through">{eur(original)}</span>}
                  </Field>
                  <Field label="Sconto">
                    {p.discount_pct ? <Badge variant="danger">-{p.discount_pct}%</Badge> : null}
                  </Field>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Taglie e magazzino</CardTitle>
              </CardHeader>
              <CardContent>
                {sizes.length > 0 ? (
                  <div className="overflow-hidden rounded-md border">
                    <div className="flex items-center gap-3 border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
                      <span className="flex-1">Taglia</span>
                      <span className="w-28 text-right">Stock disponibile</span>
                    </div>
                    {sizes.map((s) => (
                      <div key={s.taglia} className="flex items-center gap-3 border-b px-3 py-2 last:border-b-0">
                        <span className="flex-1 font-medium">{s.taglia}</span>
                        <span
                          className={
                            'w-28 text-right ' + (Number(s.stock) === 0 ? 'font-semibold text-destructive' : '')
                          }
                        >
                          {s.stock == null ? '—' : s.stock}
                        </span>
                      </div>
                    ))}
                    <div className="flex items-center gap-3 bg-muted/30 px-3 py-2 text-sm">
                      <span className="flex-1 font-medium">Totale</span>
                      <span className="w-28 text-right font-semibold">{p.stock_total ?? totalStock}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Nessuna taglia configurata.</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Side column */}
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Stato</CardTitle>
              </CardHeader>
              <CardContent>
                <StatusBadge code={p.status || 'attivo'} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Organizzazione</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Field label="Categoria">
                  <span className="capitalize">{p.categoria}</span>
                </Field>
                <Field label="Collezioni">
                  {p.collections && p.collections.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {p.collections.map((c) => (
                        <Badge key={c} variant="secondary">
                          {c}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </Field>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Colore</CardTitle>
              </CardHeader>
              <CardContent>
                <Field label="Colore">
                  {p.colore || p.color_label ? (
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-4 w-4 shrink-0 rounded-full border"
                        style={{ background: p.color_hex || 'transparent' }}
                      />
                      <span>{p.color_label || p.colore}</span>
                    </div>
                  ) : null}
                </Field>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
