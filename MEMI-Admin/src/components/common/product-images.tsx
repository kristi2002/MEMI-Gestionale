import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Loader2, Trash2, ArrowLeft, ArrowRight, Star } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { api, API_BASE } from '@/lib/api';
import type { ProductImage } from '@/types';
import { toast } from 'sonner';

type Img = ProductImage | string;

/** Legacy rows stored a bare URL string; newer ones store the WebP variant set. */
const fullUrl = (img: Img): string => (typeof img === 'string' ? img : img.full || img.card || img.thumb || '');
const thumbUrl = (img: Img): string => (typeof img === 'string' ? img : img.thumb || img.card || img.full || '');

/** Uploads return app-relative paths (/api/uploads/…); in dev the admin runs on a
 *  different origin than the API, so resolve them against the configured base. */
function resolve(url: string): string {
  if (!url || /^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/api/')) return API_BASE.replace(/\/api$/, '') + url;
  return url;
}

/**
 * Product photo manager — upload, reorder, delete.
 *
 * Upload/delete hit the dedicated endpoints (sharp → WebP variants, reference-counted
 * file cleanup). Reorder has no endpoint of its own: it persists the whole array through
 * the normal product update, which is what the storefront reads. The FIRST image is the
 * card/hero image, so ordering is a real merchandising control, not cosmetics.
 */
export function ProductImagesCard({ productId, images, onChange }: {
  productId: string;
  images: Img[];
  onChange: (images: Img[]) => void;
}) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['products'] });
    qc.invalidateQueries({ queryKey: ['product', productId] });
  };

  async function upload(files: FileList | null) {
    if (!files || !files.length) return;
    setBusy(true);
    try {
      const res = await api.products.uploadImages(productId, files);
      onChange(res.images);
      toast.success(files.length === 1 ? 'Immagine caricata' : `${files.length} immagini caricate`);
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Caricamento non riuscito');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function remove(img: Img) {
    setBusy(true);
    try {
      const res = await api.products.deleteImage(productId, fullUrl(img));
      onChange(res.images);
      toast.success('Immagine eliminata');
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Eliminazione non riuscita');
    } finally {
      setBusy(false);
    }
  }

  async function move(from: number, to: number) {
    if (to < 0 || to >= images.length) return;
    const next = images.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
    setBusy(true);
    try {
      await api.products.update(productId, { images: next });
      invalidate();
    } catch (e) {
      onChange(images); // put it back — the server rejected the new order
      toast.error(e instanceof Error ? e.message : 'Riordino non riuscito');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Immagini</CardTitle>
        <CardDescription>
          La prima immagine è quella mostrata nelle schede prodotto e nelle liste. Formati accettati:
          JPG, PNG, WebP — vengono convertite automaticamente in WebP ottimizzato.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => upload(e.target.files)}
        />

        {images.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-md border border-dashed py-10 text-center">
            <ImagePlus className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nessuna immagine caricata.</p>
            <Button type="button" size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
              {busy ? <Loader2 className="animate-spin" /> : <ImagePlus />} Carica immagini
            </Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {images.map((img, i) => (
                <div key={fullUrl(img) || i} className="group relative overflow-hidden rounded-md border bg-muted/30">
                  <img
                    src={resolve(thumbUrl(img))}
                    alt={`Immagine prodotto ${i + 1}`}
                    loading="lazy"
                    className="aspect-[3/4] w-full object-cover"
                  />
                  {i === 0 && (
                    <Badge variant="default" className="absolute left-1.5 top-1.5 gap-1">
                      <Star className="h-3 w-3" /> Principale
                    </Badge>
                  )}
                  <div className="flex items-center justify-between gap-1 border-t bg-card px-1.5 py-1">
                    <div className="flex gap-0.5">
                      <Button
                        type="button" variant="ghost" size="icon" className="h-7 w-7"
                        disabled={busy || i === 0} onClick={() => move(i, i - 1)}
                        aria-label="Sposta a sinistra"
                      >
                        <ArrowLeft className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button" variant="ghost" size="icon" className="h-7 w-7"
                        disabled={busy || i === images.length - 1} onClick={() => move(i, i + 1)}
                        aria-label="Sposta a destra"
                      >
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <ConfirmDialog
                      title="Eliminare questa immagine?"
                      description="Il file viene rimosso dal server se nessun altro prodotto lo usa."
                      confirmLabel="Elimina"
                      destructive
                      onConfirm={() => remove(img)}
                      trigger={
                        <Button
                          type="button" variant="ghost" size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          disabled={busy} aria-label="Elimina immagine"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
            <Button
              type="button" variant="outline" size="sm" className="mt-3"
              disabled={busy} onClick={() => fileRef.current?.click()}
            >
              {busy ? <Loader2 className="animate-spin" /> : <ImagePlus />} Aggiungi immagini
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
