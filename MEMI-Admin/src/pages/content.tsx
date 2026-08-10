import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { FileText, Newspaper, Plus, Pencil, Trash2, ExternalLink } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/data-table/data-table';
import { EntityFormPage } from '@/components/common/entity-form-page';
import type { FieldConfig } from '@/components/common/entity-form-fields';
import { EmptyState } from '@/components/common/empty-state';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/common/status-badge';
import { useDeleteMany, useSaveEntity } from '@/hooks/queries';
import { api } from '@/lib/api';
import { date } from '@/lib/format';
import type { CmsPage, BlogPost } from '@/types';
import type { ExportColumn } from '@/lib/export';
import { toast } from 'sonner';

/* The storefront reads these through /api/cms/published/* — blog.html, articolo.html
 * and pagina.html. Without this view the blog stays permanently empty and any
 * /pagina?slug=… link 404s, which is exactly the state the audit found. */
const STOREFRONT = (import.meta.env.VITE_STOREFRONT_URL as string | undefined) || '';

const useCmsPages = () => useQuery({ queryKey: ['cms-pages'], queryFn: () => api.pages.list() });
const useBlogPosts = () => useQuery({ queryKey: ['cms-blog'], queryFn: () => api.blog.list() });

/* ════════════════ Pagine ════════════════ */

const pageExport: ExportColumn<CmsPage>[] = [
  { header: 'Titolo', accessor: (p) => p.titolo },
  { header: 'Slug', accessor: (p) => p.slug },
  { header: 'Stato', accessor: (p) => p.stato },
  { header: 'Aggiornata', accessor: (p) => date(p.updated_at) },
];

export function CmsPagesPage() {
  const navigate = useNavigate();
  const query = useCmsPages();
  const del = useDeleteMany<number>((id) => api.pages.delete(id), 'cms-pages');
  const rows = query.data ?? [];

  const columns = useMemo<ColumnDef<CmsPage, unknown>[]>(
    () => [
      { accessorKey: 'titolo', header: 'Titolo', cell: ({ getValue }) => <span className="font-medium">{getValue() as string}</span> },
      { accessorKey: 'slug', header: 'Slug', cell: ({ getValue }) => <span className="font-mono text-xs text-muted-foreground">/{getValue() as string}</span> },
      { accessorKey: 'stato', header: 'Stato', cell: ({ getValue }) => <StatusBadge code={getValue() as string} /> },
      { accessorKey: 'updated_at', header: 'Aggiornata', cell: ({ getValue }) => <span className="text-muted-foreground">{date(getValue() as string)}</span> },
      {
        id: 'azioni', header: '', enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            {STOREFRONT && row.original.stato === 'pubblicata' && (
              <Button variant="ghost" size="sm" asChild>
                <a href={`${STOREFRONT}/pagina.html?slug=${encodeURIComponent(row.original.slug)}`} target="_blank" rel="noreferrer" aria-label="Apri sullo store">
                  <ExternalLink />
                </a>
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => navigate(`/content/pages/${row.original.id}/edit`)}>
              <Pencil /> Modifica
            </Button>
          </div>
        ),
      },
    ],
    [navigate],
  );

  return (
    <div>
      <PageHeader
        title="Pagine"
        subtitle="Pagine di contenuto pubblicate sullo store (chi siamo, FAQ, spedizioni…)."
        actions={<Button size="sm" onClick={() => navigate('/content/pages/new')}><Plus /> Nuova pagina</Button>}
      />
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(p) => String(p.id)}
        onRowClick={(p) => navigate(`/content/pages/${p.id}/edit`)}
        searchValue={(p) => `${p.titolo} ${p.slug}`}
        searchPlaceholder="Cerca pagina…"
        exportName="pagine"
        exportTitle="Pagine"
        exportColumns={pageExport}
        isLoading={query.isLoading}
        emptyState={<EmptyState icon={FileText} title="Nessuna pagina" description="Crea la prima pagina di contenuto con il pulsante in alto a destra." />}
        bulkActions={(selected, clear) => (
          <ConfirmDialog
            title={`Eliminare ${selected.length} pagine?`}
            description="Le pagine spariscono anche dallo store. Operazione irreversibile."
            confirmLabel="Elimina"
            destructive
            onConfirm={async () => { await del.mutateAsync(selected.map((p) => p.id)); toast.success('Pagine eliminate'); clear(); }}
            trigger={<Button variant="destructive" size="sm"><Trash2 /> Elimina</Button>}
          />
        )}
      />
    </div>
  );
}

const pageFields = (editing: boolean): FieldConfig[] => [
  { name: 'titolo', label: 'Titolo', required: true, wide: true },
  {
    name: 'slug', label: 'Slug (URL)', wide: true,
    placeholder: 'es. spedizioni-e-resi',
    help: editing
      ? 'Cambiare lo slug rompe i link esistenti a questa pagina.'
      : 'Lascia vuoto per generarlo dal titolo.',
  },
  {
    name: 'contenuto', label: 'Contenuto', type: 'textarea', wide: true,
    help: 'Accetta HTML semplice: <p>, <h2>, <ul>, <a>, <strong>.',
  },
  {
    name: 'stato', label: 'Stato', type: 'select', side: true,
    options: [{ value: 'bozza', label: 'Bozza' }, { value: 'pubblicata', label: 'Pubblicata' }],
    help: 'Solo le pagine pubblicate sono visibili sullo store.',
  },
];

export function CmsPageFormPage() {
  const { id } = useParams<{ id: string }>();
  const editing = id != null;
  const query = useCmsPages();
  const save = useSaveEntity(api.pages.create, api.pages.update, 'cms-pages');
  const row = editing ? (query.data ?? []).find((p) => String(p.id) === id) : undefined;

  const initial = useMemo(() => {
    if (!editing) return { stato: 'bozza' };
    return row ? { titolo: row.titolo, slug: row.slug, contenuto: row.contenuto ?? '', stato: row.stato } : {};
  }, [editing, row]);

  return (
    <EntityFormPage
      title={editing ? `Modifica pagina${row ? `: ${row.titolo}` : ''}` : 'Nuova pagina'}
      backPath="/content/pages"
      backLabel="Pagine"
      mainTitle="Contenuto"
      sideTitle="Pubblicazione"
      fields={pageFields(editing)}
      initial={initial}
      loading={editing && !row && query.isLoading}
      submitLabel={editing ? 'Salva modifiche' : 'Crea pagina'}
      onSubmit={async (v) => {
        const data: Record<string, unknown> = {
          titolo: v.titolo,
          contenuto: v.contenuto || null,
          stato: v.stato || 'bozza',
        };
        // Only send slug when the user actually typed one: the backend derives it
        // from the title on create, and an empty string would slugify to "pagina".
        if (typeof v.slug === 'string' && v.slug.trim()) data.slug = v.slug.trim();
        await save.mutateAsync({ id: editing ? Number(id) : undefined, data });
        toast.success(editing ? 'Pagina salvata' : 'Pagina creata');
      }}
    />
  );
}

/* ════════════════ Blog ════════════════ */

const blogExport: ExportColumn<BlogPost>[] = [
  { header: 'Titolo', accessor: (p) => p.titolo },
  { header: 'Slug', accessor: (p) => p.slug },
  { header: 'Stato', accessor: (p) => p.stato },
  { header: 'Pubblicato', accessor: (p) => (p.published_at ? date(p.published_at) : '—') },
];

export function BlogPage() {
  const navigate = useNavigate();
  const query = useBlogPosts();
  const del = useDeleteMany<number>((id) => api.blog.delete(id), 'cms-blog');
  const rows = query.data ?? [];

  const columns = useMemo<ColumnDef<BlogPost, unknown>[]>(
    () => [
      { accessorKey: 'titolo', header: 'Titolo', cell: ({ getValue }) => <span className="font-medium">{getValue() as string}</span> },
      { accessorKey: 'slug', header: 'Slug', cell: ({ getValue }) => <span className="font-mono text-xs text-muted-foreground">/{getValue() as string}</span> },
      { accessorKey: 'stato', header: 'Stato', cell: ({ getValue }) => <StatusBadge code={getValue() as string} /> },
      { accessorKey: 'published_at', header: 'Pubblicato', cell: ({ getValue }) => <span className="text-muted-foreground">{getValue() ? date(getValue() as string) : '—'}</span> },
      {
        id: 'azioni', header: '', enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            {STOREFRONT && row.original.stato === 'pubblicato' && (
              <Button variant="ghost" size="sm" asChild>
                <a href={`${STOREFRONT}/articolo.html?slug=${encodeURIComponent(row.original.slug)}`} target="_blank" rel="noreferrer" aria-label="Apri sullo store">
                  <ExternalLink />
                </a>
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => navigate(`/content/blog/${row.original.id}/edit`)}>
              <Pencil /> Modifica
            </Button>
          </div>
        ),
      },
    ],
    [navigate],
  );

  return (
    <div>
      <PageHeader
        title="Blog"
        subtitle="Articoli mostrati su /blog e /articolo dello store."
        actions={<Button size="sm" onClick={() => navigate('/content/blog/new')}><Plus /> Nuovo articolo</Button>}
      />
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(p) => String(p.id)}
        onRowClick={(p) => navigate(`/content/blog/${p.id}/edit`)}
        searchValue={(p) => `${p.titolo} ${p.slug} ${p.estratto ?? ''}`}
        searchPlaceholder="Cerca articolo…"
        exportName="blog"
        exportTitle="Blog"
        exportColumns={blogExport}
        isLoading={query.isLoading}
        emptyState={<EmptyState icon={Newspaper} title="Nessun articolo" description="Il blog dello store resta vuoto finché non pubblichi il primo articolo." />}
        bulkActions={(selected, clear) => (
          <ConfirmDialog
            title={`Eliminare ${selected.length} articoli?`}
            description="Gli articoli spariscono anche dallo store. Operazione irreversibile."
            confirmLabel="Elimina"
            destructive
            onConfirm={async () => { await del.mutateAsync(selected.map((p) => p.id)); toast.success('Articoli eliminati'); clear(); }}
            trigger={<Button variant="destructive" size="sm"><Trash2 /> Elimina</Button>}
          />
        )}
      />
    </div>
  );
}

const blogFields = (editing: boolean): FieldConfig[] => [
  { name: 'titolo', label: 'Titolo', required: true, wide: true },
  {
    name: 'slug', label: 'Slug (URL)', wide: true,
    placeholder: 'es. come-scegliere-il-blazer',
    help: editing ? 'Cambiare lo slug rompe i link esistenti.' : 'Lascia vuoto per generarlo dal titolo.',
  },
  { name: 'estratto', label: 'Estratto', type: 'textarea', wide: true, help: 'Anteprima mostrata nella lista del blog.' },
  { name: 'contenuto', label: 'Contenuto', type: 'textarea', wide: true, help: 'Accetta HTML semplice: <p>, <h2>, <ul>, <a>, <strong>.' },
  {
    name: 'stato', label: 'Stato', type: 'select', side: true,
    options: [{ value: 'bozza', label: 'Bozza' }, { value: 'pubblicato', label: 'Pubblicato' }],
    help: 'Pubblicando ora, la data di pubblicazione viene impostata a oggi.',
  },
  {
    name: 'cover_color', label: 'Copertina (CSS)', side: true, wide: true,
    placeholder: 'linear-gradient(135deg,#e89aae,#7fc29b)',
    help: 'Sfondo della card quando l’articolo non ha immagine.',
  },
];

export function BlogFormPage() {
  const { id } = useParams<{ id: string }>();
  const editing = id != null;
  const query = useBlogPosts();
  const save = useSaveEntity(api.blog.create, api.blog.update, 'cms-blog');
  const row = editing ? (query.data ?? []).find((p) => String(p.id) === id) : undefined;

  const initial = useMemo(() => {
    if (!editing) return { stato: 'bozza', cover_color: 'linear-gradient(135deg,#e89aae,#7fc29b)' };
    return row
      ? {
          titolo: row.titolo, slug: row.slug, estratto: row.estratto ?? '',
          contenuto: row.contenuto ?? '', stato: row.stato,
          cover_color: (row as BlogPost & { cover_color?: string }).cover_color ?? '',
        }
      : {};
  }, [editing, row]);

  return (
    <EntityFormPage
      title={editing ? `Modifica articolo${row ? `: ${row.titolo}` : ''}` : 'Nuovo articolo'}
      backPath="/content/blog"
      backLabel="Blog"
      mainTitle="Articolo"
      sideTitle="Pubblicazione"
      fields={blogFields(editing)}
      initial={initial}
      loading={editing && !row && query.isLoading}
      submitLabel={editing ? 'Salva modifiche' : 'Crea articolo'}
      onSubmit={async (v) => {
        const data: Record<string, unknown> = {
          titolo: v.titolo,
          estratto: v.estratto || null,
          contenuto: v.contenuto || null,
          cover_color: v.cover_color || null,
          stato: v.stato || 'bozza',
        };
        if (typeof v.slug === 'string' && v.slug.trim()) data.slug = v.slug.trim();
        await save.mutateAsync({ id: editing ? Number(id) : undefined, data });
        toast.success(editing ? 'Articolo salvato' : 'Articolo creato');
      }}
    />
  );
}
