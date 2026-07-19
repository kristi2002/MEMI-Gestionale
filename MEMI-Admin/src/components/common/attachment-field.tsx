import { useRef, useState } from 'react';
import { Paperclip, Upload, X, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

/**
 * Receipt/invoice attachment control — uploads on select (via `uploadFn`), then shows a
 * view / replace / remove UI. Writes the returned URL out through `onChange` so the parent
 * form saves it. Shared by expenses and supplier-invoices (each passes its own uploadFn).
 */
export function AttachmentField({
  url,
  onChange,
  uploadFn,
  title = 'Allegato (ricevuta / fattura)',
}: {
  url: string | null | undefined;
  onChange: (u: string | null) => void;
  uploadFn: (file: File) => Promise<{ url: string }>;
  title?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // let the same file be re-selected later
    if (!file) return;
    setUploading(true);
    try {
      const res = await uploadFn(file);
      onChange(res.url);
      toast.success('Allegato caricato');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Caricamento non riuscito');
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {url ? (
          <div className="flex flex-wrap items-center gap-3">
            <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline">
              <Paperclip className="h-4 w-4" /> Visualizza allegato
            </a>
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}><X /> Rimuovi</Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nessun allegato caricato.</p>
        )}
        <div>
          <input ref={inputRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden" onChange={onPick} />
          <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
            {uploading ? <Loader2 className="animate-spin" /> : <Upload />} {url ? 'Sostituisci file' : 'Carica file'}
          </Button>
          <p className="mt-1.5 text-xs text-muted-foreground">PDF, JPG, PNG o WebP · max 8 MB.</p>
        </div>
      </CardContent>
    </Card>
  );
}
