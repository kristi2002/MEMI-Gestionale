import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Mail, Plus, Pencil, Send, Loader2, ArrowLeft, MailX } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { KpiCard } from '@/components/common/kpi-card';
import { DataTable } from '@/components/data-table/data-table';
import type { FilterDef } from '@/components/data-table/filters';
import { BulkDelete } from '@/components/data-table/bulk-delete';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/common/empty-state';
import type { FieldConfig, FormValues } from '@/components/common/entity-form-fields';
import { EntityFormPage } from '@/components/common/entity-form-page';
import { useNewsletter, useDeleteMany, useSaveEntity } from '@/hooks/queries';
import { api } from '@/lib/api';
import { date } from '@/lib/format';
import type { Subscriber } from '@/types';
import type { ExportColumn } from '@/lib/export';
import { toast } from 'sonner';

const exportColumns: ExportColumn<Subscriber>[] = [
  { header: 'Email', accessor: (s) => s.email },
  { header: 'Fonte', accessor: (s) => s.fonte },
  { header: 'Stato', accessor: (s) => (s.unsubscribed ? 'Disiscritto' : 'Attivo') },
  { header: 'Iscritto il', accessor: (s) => date(s.subscribed_at) },
];

export function NewsletterPage() {
  const query = useNewsletter();
  const del = useDeleteMany<number>((id) => api.newsletter.remove(id), 'newsletter');
  const navigate = useNavigate();
  const rows = query.data?.subscribers ?? [];

  const filters = useMemo<FilterDef<Subscriber>[]>(() => {
    const fonti = [...new Set(rows.map((s) => s.fonte).filter(Boolean))].sort();
    return [
      { key: 'stato', type: 'select', label: 'Stato', accessor: (s) => (s.unsubscribed ? 'disiscritto' : 'attivo'),
        options: [{ value: 'attivo', label: 'Attivo' }, { value: 'disiscritto', label: 'Disiscritto' }] },
      { key: 'fonte', type: 'select', label: 'Fonte', accessor: (s) => s.fonte, options: fonti.map((f) => ({ value: f, label: f })) },
      { key: 'iscritto', type: 'dateRange', label: 'Iscritto', accessor: (s) => s.subscribed_at },
    ];
  }, [rows]);

  const columns = useMemo<ColumnDef<Subscriber, unknown>[]>(
    () => [
      { accessorKey: 'email', header: 'Email', cell: ({ getValue }) => <span className="font-medium">{getValue() as string}</span> },
      { accessorKey: 'fonte', header: 'Fonte', cell: ({ getValue }) => <Badge variant="neutral">{(getValue() as string) || '—'}</Badge> },
      {
        accessorKey: 'unsubscribed',
        header: 'Stato',
        cell: ({ getValue }) => (getValue() ? <Badge variant="danger">Disiscritto</Badge> : <Badge variant="success">Attivo</Badge>),
      },
      { accessorKey: 'subscribed_at', header: 'Iscritto il', cell: ({ getValue }) => <span className="text-muted-foreground">{date(getValue() as string)}</span> },
      {
        id: 'azioni', header: '', enableSorting: false,
        cell: ({ row }) => (
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/newsletter/${row.original.id}/edit`); }}>
            <Pencil /> Modifica
          </Button>
        ),
      },
    ],
    [navigate],
  );

  return (
    <div>
      <PageHeader title="Newsletter" subtitle="Iscritti alla newsletter e invii." />
      <div className="mb-4 grid grid-cols-2 gap-4">
        <KpiCard label="Iscritti attivi" value={query.data?.total ?? 0} icon={Mail} tone="success" loading={query.isLoading} />
        <KpiCard label="Disiscritti" value={query.data?.unsubscribed ?? 0} icon={MailX} tone="muted" loading={query.isLoading} />
      </div>
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(s) => String(s.id)}
        searchValue={(s) => `${s.email} ${s.fonte}`}
        searchPlaceholder="Cerca email…"
        exportName="newsletter"
        exportTitle="Iscritti newsletter"
        exportColumns={exportColumns}
        filters={filters}
        tableId="newsletter"
        primaryAction={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate('/newsletter/compose')}>
              <Send /> Invia newsletter
            </Button>
            <Button size="sm" onClick={() => navigate('/newsletter/new')}>
              <Plus /> Nuovo iscritto
            </Button>
          </>
        }
        isLoading={query.isLoading}
        emptyState={<EmptyState icon={Mail} title="Nessun iscritto" />}
        bulkActions={(selected, clear) => (
          <BulkDelete count={selected.length} noun="iscritti" onDelete={() => del.mutateAsync(selected.map((s) => s.id))} onDone={clear} />
        )}
      />
    </div>
  );
}

/** Full-page create/edit form for a newsletter subscriber. */
export function NewsletterSubscriberFormPage() {
  const { id } = useParams<{ id: string }>();
  const editing = id != null;
  const query = useNewsletter();
  const saveMut = useSaveEntity(api.newsletter.create, api.newsletter.update, 'newsletter');
  const row = editing ? (query.data?.subscribers ?? []).find((s) => String(s.id) === id) : undefined;

  const createFields: FieldConfig[] = [
    { name: 'email', label: 'Email', type: 'email', required: true, wide: true, placeholder: 'cliente@example.com' },
    { name: 'fonte', label: 'Fonte', wide: true, placeholder: 'admin', help: 'Da dove arriva l’iscrizione (es. admin, evento, import).' },
  ];
  const editFields: FieldConfig[] = [
    { name: 'stato', label: 'Stato iscrizione', type: 'select', wide: true, options: [
        { value: 'attivo', label: 'Attivo — riceve le email' },
        { value: 'disiscritto', label: 'Disiscritto — non riceve email' },
      ] },
  ];

  const initial = useMemo<FormValues>(() => {
    if (!editing) return { fonte: 'admin' };
    return row ? { stato: row.unsubscribed ? 'disiscritto' : 'attivo' } : {};
  }, [editing, row]);

  return (
    <EntityFormPage
      title={editing ? `Modifica iscritto${row ? `: ${row.email}` : ''}` : 'Nuovo iscritto'}
      subtitle={editing ? undefined : 'Aggiungi manualmente un indirizzo alla newsletter.'}
      backPath="/newsletter"
      backLabel="Newsletter"
      mainTitle={editing ? 'Iscrizione' : 'Dettagli'}
      fields={editing ? editFields : createFields}
      initial={initial}
      loading={editing && !row && query.isLoading}
      submitLabel={editing ? 'Salva modifiche' : 'Aggiungi iscritto'}
      onSubmit={async (v) => {
        if (editing) {
          await saveMut.mutateAsync({ id: Number(id), data: { unsubscribed: v.stato === 'disiscritto' ? 1 : 0 } });
          toast.success('Iscritto aggiornato');
        } else {
          await saveMut.mutateAsync({ data: { email: v.email, fonte: v.fonte || 'admin' } });
          toast.success('Iscritto aggiunto');
        }
      }}
    />
  );
}

/** Compose & send a newsletter broadcast to all active subscribers. */
export function NewsletterComposePage() {
  const navigate = useNavigate();
  const query = useNewsletter();
  const activeCount = query.data?.total ?? 0;
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [testEmail, setTestEmail] = useState('');
  const [sending, setSending] = useState<'test' | 'all' | null>(null);

  async function send(mode: 'test' | 'all') {
    if (!subject.trim() || !body.trim()) {
      toast.error('Oggetto e messaggio sono obbligatori');
      return;
    }
    if (mode === 'test' && !testEmail.trim()) {
      toast.error('Inserisci un indirizzo email per il test');
      return;
    }
    if (mode === 'all' && !window.confirm(`Inviare la newsletter a ${activeCount} iscritti attivi?`)) return;
    setSending(mode);
    try {
      const res = await api.newsletter.send({
        subject: subject.trim(),
        body,
        ...(mode === 'test' ? { test_email: testEmail.trim() } : {}),
      });
      if (res.smtp === false) {
        toast.warning(res.message || 'SMTP non configurato — nessuna email inviata');
      } else if (mode === 'test') {
        toast.success('Email di test inviata');
      } else {
        toast.success(res.message || `Invio avviato a ${res.recipients ?? activeCount} iscritti`);
        navigate('/newsletter');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Invio non riuscito');
    } finally {
      setSending(null);
    }
  }

  return (
    <div>
      <Button variant="ghost" size="sm" className="-ml-2 mb-2" onClick={() => navigate('/newsletter')}>
        <ArrowLeft /> Newsletter
      </Button>
      <PageHeader title="Invia newsletter" subtitle={`Scrivi un messaggio da inviare ai ${activeCount} iscritti attivi.`} />

      <form onSubmit={(e) => { e.preventDefault(); send('all'); }} className="max-w-3xl space-y-5">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Messaggio</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="subject">Oggetto <span className="text-destructive">*</span></Label>
              <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Novità dalla collezione MEMI" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="body">Testo <span className="text-destructive">*</span></Label>
              <textarea
                id="body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                required
                className="flex min-h-[200px] w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Scrivi qui il contenuto della newsletter…"
              />
              <p className="text-xs text-muted-foreground">Testo semplice. Gli a-capo vengono mantenuti nell’email.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Prova</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="test">Invia una prova a</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Input id="test" type="email" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="tu@example.com" className="max-w-xs" />
                <Button type="button" variant="outline" disabled={sending !== null} onClick={() => send('test')}>
                  {sending === 'test' ? <Loader2 className="animate-spin" /> : <Send />} Invia prova
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center gap-2">
          <Button type="submit" disabled={sending !== null}>
            {sending === 'all' ? <Loader2 className="animate-spin" /> : <Send />} Invia a tutti ({activeCount})
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate('/newsletter')} disabled={sending !== null}>
            Annulla
          </Button>
        </div>
      </form>
    </div>
  );
}
