import { useMemo, useState } from 'react';
import { Upload, Trash2, ImageIcon, Loader2, Copy } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/common/empty-state';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { useSettings } from '@/hooks/queries';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { date } from '@/lib/format';
import type { MediaItem } from '@/types';
import { toast } from 'sonner';

function parseMedia(raw?: string): MediaItem[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function FilesPage() {
  const query = useSettings();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const media = useMemo(() => parseMedia(query.data?.media_library), [query.data]);

  async function onUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      const res = await api.settings.uploadMedia(files);
      toast.success(`${res.added} file caricati`);
      qc.invalidateQueries({ queryKey: ['settings'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload non riuscito');
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(url: string) {
    await api.settings.deleteMedia(url);
    toast.success('File eliminato');
    qc.invalidateQueries({ queryKey: ['settings'] });
  }

  return (
    <div>
      <PageHeader
        title="File"
        subtitle="Libreria media dello store."
        actions={
          <Button size="sm" asChild disabled={busy}>
            <label className="cursor-pointer">
              {busy ? <Loader2 className="animate-spin" /> : <Upload />} Carica file
              <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => onUpload(e.target.files)} />
            </label>
          </Button>
        }
      />

      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">Caricamento…</p>
      ) : media.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState icon={ImageIcon} title="Nessun file" description="Carica immagini per usarle nel sito." />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {media.map((m) => (
            <Card key={m.url} className="group overflow-hidden">
              <div className="relative aspect-square bg-muted">
                <img src={m.thumb || m.url} alt={m.nome} className="h-full w-full object-cover" loading="lazy" />
                <div className="absolute inset-0 flex items-center justify-center gap-2 bg-foreground/50 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => {
                      navigator.clipboard.writeText(m.full || m.url);
                      toast.success('URL copiato');
                    }}
                  >
                    <Copy />
                  </Button>
                  <ConfirmDialog
                    title="Eliminare il file?"
                    description={m.nome}
                    confirmLabel="Elimina"
                    destructive
                    onConfirm={() => onDelete(m.url)}
                    trigger={
                      <Button variant="destructive" size="icon" className="h-8 w-8">
                        <Trash2 />
                      </Button>
                    }
                  />
                </div>
              </div>
              <div className="p-2">
                <div className="truncate text-xs font-medium">{m.nome}</div>
                <div className="text-[11px] text-muted-foreground">{date(m.created_at)}</div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
