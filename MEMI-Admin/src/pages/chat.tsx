import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Send, Loader2, Trash2, CheckCircle2, RotateCcw, User } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/common/empty-state';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { api } from '@/lib/api';
import { ago, dateTime, eur, initials } from '@/lib/format';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

/** Poll cadence for the inbox. Chat is the one admin view where a stale list has a
 *  customer waiting on the other end, so it refetches on an interval rather than
 *  only on focus. */
const POLL_MS = 20_000;

export function ChatPage() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const listQ = useQuery({
    queryKey: ['chat'],
    queryFn: () => api.chat.list(),
    refetchInterval: POLL_MS,
  });
  const conversations = useMemo(() => listQ.data?.conversations ?? [], [listQ.data]);

  const detailQ = useQuery({
    queryKey: ['chat', selectedId],
    queryFn: () => api.chat.get(selectedId!),
    enabled: selectedId != null,
    refetchInterval: selectedId != null ? POLL_MS : false,
  });

  // Open the newest conversation on first load so the view is never an empty shell.
  useEffect(() => {
    if (selectedId == null && conversations.length) setSelectedId(conversations[0].id);
  }, [conversations, selectedId]);

  // Keep the transcript pinned to the newest message.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [detailQ.data]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['chat'] });
  };

  async function send() {
    const body = draft.trim();
    if (!body || selectedId == null) return;
    setSending(true);
    try {
      await api.chat.reply(selectedId, body);
      setDraft('');
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['chat', selectedId] }),
        qc.invalidateQueries({ queryKey: ['chat'] }),
      ]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Invio non riuscito');
    } finally {
      setSending(false);
    }
  }

  async function setStatus(status: 'aperta' | 'chiusa') {
    if (selectedId == null) return;
    try {
      await api.chat.setStatus(selectedId, status);
      toast.success(status === 'chiusa' ? 'Conversazione chiusa' : 'Conversazione riaperta');
      qc.invalidateQueries({ queryKey: ['chat', selectedId] });
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Aggiornamento non riuscito');
    }
  }

  async function remove() {
    if (selectedId == null) return;
    try {
      await api.chat.remove(selectedId);
      toast.success('Conversazione eliminata');
      setSelectedId(null);
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Eliminazione non riuscita');
    }
  }

  const conv = detailQ.data?.conversation;
  const messages = detailQ.data?.messages ?? [];
  const unreadTotal = listQ.data?.unread_total ?? 0;

  return (
    <div>
      <PageHeader
        title="Chat clienti"
        subtitle="Messaggi ricevuti dal widget di assistenza sullo store."
        actions={unreadTotal > 0 ? <Badge variant="danger">{unreadTotal} da leggere</Badge> : undefined}
      />

      {listQ.isLoading ? (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <Skeleton className="h-96 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      ) : conversations.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={MessageSquare}
              title="Nessuna conversazione"
              description="Quando un cliente scrive dal widget di chat dello store, la conversazione compare qui."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          {/* ── Conversation list ─────────────────────── */}
          <Card className="overflow-hidden">
            <div className="max-h-[70vh] divide-y overflow-y-auto">
              {conversations.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className={cn(
                    'flex w-full items-start gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/50',
                    selectedId === c.id && 'bg-muted',
                  )}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {initials(c.name || c.email || '?')}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{c.name || c.email || 'Ospite'}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{ago(c.last_message_at || c.created_at)}</span>
                    </span>
                    <span className="mt-0.5 line-clamp-1 block text-xs text-muted-foreground">
                      {c.last_message || 'Nessun messaggio'}
                    </span>
                    <span className="mt-1 flex items-center gap-1.5">
                      {c.status === 'chiusa' && <Badge variant="neutral" className="text-[10px]">Chiusa</Badge>}
                      {c.unread_admin > 0 && <Badge variant="danger" className="text-[10px]">{c.unread_admin} nuovi</Badge>}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </Card>

          {/* ── Transcript ────────────────────────────── */}
          <Card className="flex min-h-[70vh] flex-col">
            {detailQ.isLoading || !conv ? (
              <div className="flex flex-1 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="truncate font-semibold">{conv.name || 'Ospite'}</span>
                      {conv.status === 'chiusa' && <Badge variant="neutral">Chiusa</Badge>}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                      {conv.email && <span className="break-all">{conv.email}</span>}
                      {conv.total_orders != null && <span>{conv.total_orders} ordini</span>}
                      {conv.total_spent != null && <span>{eur(conv.total_spent)} spesi</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {conv.status === 'chiusa' ? (
                      <Button variant="outline" size="sm" onClick={() => setStatus('aperta')}>
                        <RotateCcw /> Riapri
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => setStatus('chiusa')}>
                        <CheckCircle2 /> Chiudi
                      </Button>
                    )}
                    <ConfirmDialog
                      title="Eliminare la conversazione?"
                      description="Messaggi e cronologia vengono rimossi definitivamente."
                      confirmLabel="Elimina"
                      destructive
                      onConfirm={remove}
                      trigger={
                        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" aria-label="Elimina conversazione">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      }
                    />
                  </div>
                </div>

                <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                  {messages.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">Nessun messaggio.</p>
                  ) : messages.map((m) => {
                    const mine = m.sender === 'admin';
                    return (
                      <div key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                        <div className={cn('max-w-[75%] rounded-lg px-3 py-2 text-sm', mine ? 'bg-primary text-primary-foreground' : 'bg-muted')}>
                          <p className="whitespace-pre-wrap break-words">{m.body}</p>
                          <p className={cn('mt-1 text-[10px]', mine ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                            {dateTime(m.created_at)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <form
                  className="flex items-center gap-2 border-t px-4 py-3"
                  onSubmit={(e) => { e.preventDefault(); send(); }}
                >
                  <Input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Scrivi una risposta…"
                    disabled={sending}
                  />
                  <Button type="submit" size="sm" disabled={sending || !draft.trim()}>
                    {sending ? <Loader2 className="animate-spin" /> : <Send />} Invia
                  </Button>
                </form>
              </>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
