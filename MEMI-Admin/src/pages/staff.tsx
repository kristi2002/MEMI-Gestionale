import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { UserCog, Plus, Pencil } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/data-table/data-table';
import { BulkDelete } from '@/components/data-table/bulk-delete';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { EmptyState } from '@/components/common/empty-state';
import type { FieldConfig, FormValues } from '@/components/common/entity-form-fields';
import { EntityFormPage } from '@/components/common/entity-form-page';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { useStaff, useDeleteMany, useSaveEntity } from '@/hooks/queries';
import { useAuth } from '@/hooks/use-auth';
import { api } from '@/lib/api';
import { date, initials } from '@/lib/format';
import type { StaffMember } from '@/types';
import type { ExportColumn } from '@/lib/export';
import { toast } from 'sonner';

const exportColumns: ExportColumn<StaffMember>[] = [
  { header: 'Nome', accessor: (m) => m.nome || '' },
  { header: 'Email', accessor: (m) => m.email },
  { header: 'Ruolo', accessor: (m) => m.role },
  { header: 'Permessi', accessor: (m) => (m.permissions ? m.permissions.join(' | ') : 'tutti (da ruolo)') },
  { header: 'Creato il', accessor: (m) => date(m.created_at) },
];

// Named permission profiles — MIRRORS MEMI-Backend/src/permissions.js PRESETS.
// A profile stores an explicit permissions array on the account (admin ⇒ null =
// full access); this is what makes least-privilege reachable from the UI.
const PERMISSION_PRESETS: Record<string, string[] | null> = {
  admin: null,
  staff: ['dashboard', 'orders', 'orders-drafts', 'orders-abandoned', 'returns', 'invoices', 'products', 'inventory', 'transfers', 'collections', 'categories', 'giftcards', 'customers', 'loyalty', 'segments', 'reviews', 'marketing', 'automations', 'lifecycle', 'newsletter', 'popups', 'discounts', 'content', 'blog', 'files', 'couriers', 'shipments', 'tracking', 'shipping-zones', 'pickup', 'chat', 'online-store', 'social', 'pos', 'apps'],
  warehouse: ['dashboard', 'products', 'inventory', 'transfers', 'collections', 'categories', 'giftcards', 'couriers', 'shipments', 'tracking', 'shipping-zones', 'pickup', 'orders', 'orders-drafts', 'orders-abandoned'],
  customer_service: ['dashboard', 'orders', 'orders-drafts', 'orders-abandoned', 'returns', 'invoices', 'customers', 'loyalty', 'segments', 'reviews', 'chat', 'newsletter'],
  marketing: ['dashboard', 'marketing', 'automations', 'lifecycle', 'newsletter', 'popups', 'discounts', 'content', 'blog', 'files', 'analytics', 'reports', 'reviews'],
};
// Quick-fill presets offered as buttons (admin = the separate "accesso completo" mode).
const PRESET_BUTTONS: { key: string; label: string }[] = [
  { key: 'staff', label: 'Staff (completo)' },
  { key: 'warehouse', label: 'Magazzino' },
  { key: 'customer_service', label: 'Servizio clienti' },
  { key: 'marketing', label: 'Marketing' },
];

// The full granular view vocabulary the backend enforces (mirrors permissions.js:
// STAFF_VIEWS + ADMIN_ONLY), grouped like the sidebar so the matrix is scannable.
// Every key here is a real `requirePermission(view)` gate; granting it unlocks that section.
const VIEW_GROUPS: { label: string; admin?: boolean; views: { key: string; label: string }[] }[] = [
  { label: 'Generale', views: [{ key: 'dashboard', label: 'Home / Dashboard' }] },
  { label: 'Ordini', views: [
    { key: 'orders', label: 'Tutti gli ordini' },
    { key: 'orders-drafts', label: 'Bozze ordini' },
    { key: 'orders-abandoned', label: 'Carrelli abbandonati' },
    { key: 'returns', label: 'Resi' },
    { key: 'invoices', label: 'Fatture' },
  ] },
  { label: 'Prodotti', views: [
    { key: 'products', label: 'Prodotti' },
    { key: 'inventory', label: 'Magazzino' },
    { key: 'transfers', label: 'Trasferimenti' },
    { key: 'collections', label: 'Collezioni' },
    { key: 'categories', label: 'Categorie' },
    { key: 'giftcards', label: 'Gift card' },
  ] },
  { label: 'Clienti', views: [
    { key: 'customers', label: 'Clienti' },
    { key: 'loyalty', label: 'Fedeltà & Punti' },
    { key: 'segments', label: 'Segmenti' },
    { key: 'reviews', label: 'Recensioni' },
  ] },
  { label: 'Marketing', views: [
    { key: 'marketing', label: 'Marketing' },
    { key: 'automations', label: 'Automazioni' },
    { key: 'lifecycle', label: 'Email automatiche' },
    { key: 'newsletter', label: 'Newsletter' },
    { key: 'popups', label: 'Pop-up' },
    { key: 'discounts', label: 'Sconti' },
    { key: 'content', label: 'Contenuti' },
    { key: 'blog', label: 'Blog' },
    { key: 'files', label: 'File' },
  ] },
  { label: 'Spedizioni', views: [
    { key: 'couriers', label: 'Corrieri' },
    { key: 'shipments', label: 'Spedizioni in corso' },
    { key: 'tracking', label: 'Tracking' },
    { key: 'shipping-zones', label: 'Zone & Tariffe' },
    { key: 'pickup', label: 'Punti di ritiro' },
  ] },
  { label: 'Canali di vendita', views: [
    { key: 'chat', label: 'Chat' },
    { key: 'online-store', label: 'Negozio online' },
    { key: 'social', label: 'Social' },
    { key: 'pos', label: 'POS' },
    { key: 'apps', label: 'App esterne' },
  ] },
  { label: 'Statistiche', admin: true, views: [
    { key: 'analytics', label: 'Panoramica' },
    { key: 'reports', label: 'Report' },
    { key: 'liveview', label: 'Live view' },
  ] },
  { label: 'Finanza', admin: true, views: [
    { key: 'finance', label: 'Panoramica finanza' },
    { key: 'payouts', label: 'Pagamenti ricevuti' },
    { key: 'bills', label: 'Fatture & Spese' },
    { key: 'taxes', label: 'Tasse' },
  ] },
  { label: 'Sistema', admin: true, views: [
    { key: 'integrations', label: 'Integrazioni' },
    { key: 'staff', label: 'Staff & Permessi' },
    { key: 'audit-log', label: 'Registro attività' },
    { key: 'settings', label: 'Impostazioni' },
  ] },
];
const ALL_VIEWS = VIEW_GROUPS.flatMap((g) => g.views.map((v) => v.key));

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}

export function StaffPage() {
  const query = useStaff();
  const { me } = useAuth();
  const del = useDeleteMany<number>((id) => api.staff.delete(id), 'staff');
  const navigate = useNavigate();
  const rows = query.data?.staff ?? [];

  const columns = useMemo<ColumnDef<StaffMember, unknown>[]>(
    () => [
      {
        id: 'membro',
        header: 'Membro',
        accessorFn: (m) => m.nome || m.email,
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-3">
            <Avatar className="h-8 w-8">
              <AvatarFallback>{initials(row.original.nome || row.original.email)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="truncate font-medium">{row.original.nome || '—'}</div>
              <div className="truncate text-xs text-muted-foreground">{row.original.email}</div>
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'role',
        header: 'Ruolo',
        cell: ({ getValue }) => (getValue() === 'admin' ? <Badge variant="default">Admin</Badge> : <Badge variant="neutral">Staff</Badge>),
      },
      {
        accessorKey: 'permissions',
        header: 'Permessi',
        cell: ({ row }) => {
          const p = row.original.permissions;
          if (!p) return <span className="text-xs text-muted-foreground">tutti (da ruolo)</span>;
          return (
            <div className="flex max-w-[320px] flex-wrap gap-1">
              {p.slice(0, 4).map((x) => (
                <Badge key={x} variant="neutral">
                  {x}
                </Badge>
              ))}
              {p.length > 4 && <span className="text-xs text-muted-foreground">+{p.length - 4}</span>}
            </div>
          );
        },
      },
      { accessorKey: 'created_at', header: 'Creato il', cell: ({ getValue }) => <span className="text-muted-foreground">{date(getValue() as string)}</span> },
      {
        id: 'azioni', header: '', enableSorting: false,
        cell: ({ row }) => (
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/staff/${row.original.id}/edit`); }}>
            <Pencil /> Modifica
          </Button>
        ),
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Staff & Permessi"
        subtitle="Utenti amministratori e relativi permessi."
        actions={<Button size="sm" onClick={() => navigate('/staff/new')}><Plus /> Nuovo membro</Button>}
      />
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(m) => String(m.id)}
        searchValue={(m) => `${m.nome ?? ''} ${m.email} ${m.role}`}
        searchPlaceholder="Cerca membro…"
        exportName="staff"
        exportTitle="Staff & Permessi"
        exportColumns={exportColumns}
        isLoading={query.isLoading}
        emptyState={<EmptyState icon={UserCog} title="Nessun membro dello staff" />}
        bulkActions={(selected, clear) => {
          // Never allow deleting your own account from a bulk action.
          const ids = selected.map((m) => m.id).filter((id) => id !== me?.id);
          if (ids.length === 0) return <span className="px-2 text-xs text-muted-foreground">Non puoi eliminare il tuo account</span>;
          return (
            <BulkDelete
              count={ids.length}
              noun="membri"
              description="I membri selezionati perderanno l'accesso al gestionale."
              onDelete={() => del.mutateAsync(ids)}
              onDone={clear}
            />
          );
        }}
      />
    </div>
  );
}

/** Granular permission editor rendered inside the staff form. Reads/writes the live
 *  form state (`mode` = 'admin' | 'custom', `permissions` = string[]) so it takes part
 *  in submit. Home/dashboard is always granted (prevents an empty set collapsing to the
 *  full staff surface on the backend). */
function PermissionEditor({ values, set, editingSelf, wasAdmin }: {
  values: FormValues;
  set: (name: string, v: FormValues[string]) => void;
  editingSelf: boolean;
  wasAdmin: boolean;
}) {
  const mode = (values.mode as string) || 'custom';
  const isAdmin = mode === 'admin';
  const raw = (values.permissions as string[]) ?? [];
  const perms = new Set(raw);
  perms.add('dashboard'); // Home is always accessible.

  // Which named preset (if any) the current custom set matches — drives button highlight.
  const activePreset = useMemo(() => {
    const cur = [...perms];
    const match = Object.keys(PERMISSION_PRESETS).find((k) => {
      const arr = PERMISSION_PRESETS[k];
      return Array.isArray(arr) && sameSet([...new Set([...arr, 'dashboard'])], cur);
    });
    return match ?? 'custom';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw.join(',')]);

  function applyPreset(key: string) {
    set('mode', 'custom');
    set('permissions', [...(PERMISSION_PRESETS[key] ?? [])]);
  }
  function toggle(view: string) {
    if (view === 'dashboard') return; // always on
    const next = new Set(raw);
    next.add('dashboard');
    if (next.has(view)) next.delete(view); else next.add(view);
    set('mode', 'custom');
    set('permissions', [...next]);
  }
  function setAll(all: boolean) {
    set('mode', 'custom');
    set('permissions', all ? [...ALL_VIEWS] : ['dashboard']);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Permessi &amp; accesso</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Access mode */}
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant={isAdmin ? 'default' : 'outline'} onClick={() => set('mode', 'admin')}>
            Amministratore — accesso completo
          </Button>
          <Button
            type="button" size="sm" variant={!isAdmin ? 'default' : 'outline'}
            onClick={() => { if (isAdmin) { set('mode', 'custom'); if (!raw.length) set('permissions', [...(PERMISSION_PRESETS.staff ?? [])]); } }}
          >
            Permessi specifici
          </Button>
        </div>

        {isAdmin ? (
          <p className="text-sm text-muted-foreground">
            Questo membro è <strong>amministratore</strong>: ha accesso completo a tutte le sezioni,
            inclusa la gestione di staff, impostazioni e integrazioni.
          </p>
        ) : (
          <>
            {/* Preset quick-fill */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Preimpostazioni:</span>
              {PRESET_BUTTONS.map((p) => (
                <Button key={p.key} type="button" size="sm" variant={activePreset === p.key ? 'secondary' : 'outline'} onClick={() => applyPreset(p.key)}>
                  {p.label}
                </Button>
              ))}
              <span className="mx-0.5 text-muted-foreground">·</span>
              <Button type="button" size="sm" variant="ghost" onClick={() => setAll(true)}>Tutto</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setAll(false)}>Niente</Button>
              {activePreset === 'custom' && <Badge variant="info">Personalizzato</Badge>}
            </div>

            {/* Per-view matrix */}
            <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
              {VIEW_GROUPS.map((g) => (
                <div key={g.label} className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {g.label}
                    {g.admin && <span className="rounded bg-muted px-1 py-0.5 text-[9px] font-medium normal-case tracking-normal">solo admin</span>}
                  </div>
                  {g.views.map((v) => {
                    const forced = v.key === 'dashboard';
                    return (
                      <div key={v.key} className="flex items-center gap-2 text-sm">
                        <Checkbox checked={perms.has(v.key)} disabled={forced} onCheckedChange={forced ? undefined : () => toggle(v.key)} />
                        <span className={forced ? 'text-muted-foreground' : 'cursor-pointer select-none'} onClick={forced ? undefined : () => toggle(v.key)}>
                          {v.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            <p className="text-xs text-muted-foreground">
              Il membro potrà usare solo le sezioni selezionate; le altre restituiranno “accesso negato”.
              La Home è sempre inclusa. Le sezioni “solo admin” richiedono comunque il ruolo amministratore
              per alcune operazioni sensibili (es. creare staff).
            </p>
            {editingSelf && !wasAdmin && (
              <p className="text-xs text-warning">
                Stai modificando i tuoi permessi: rimuovere una sezione te ne toglierà l’accesso al prossimo caricamento.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Full-page create/edit form for a staff member. */
export function StaffFormPage() {
  const { id } = useParams<{ id: string }>();
  const editing = id != null;
  const query = useStaff();
  const { me } = useAuth();
  const saveMut = useSaveEntity(api.staff.create, api.staff.update, 'staff');
  const row = editing ? (query.data?.staff ?? []).find((m) => String(m.id) === id) : undefined;

  const fields = useMemo<FieldConfig[]>(() => {
    const f: FieldConfig[] = [{ name: 'nome', label: 'Nome', required: true }];
    if (!editing) {
      f.push({ name: 'email', label: 'Email', type: 'email', required: true });
      f.push({ name: 'password', label: 'Password', type: 'text', required: true, help: 'Minimo 8 caratteri.' });
    } else {
      f.push({ name: 'password', label: 'Nuova password', type: 'text', help: 'Lascia vuoto per non modificarla. Minimo 8 caratteri.' });
    }
    return f;
  }, [editing]);

  const initial = useMemo<FormValues>(() => {
    if (!editing) return { nome: '', password: '', mode: 'custom', permissions: PERMISSION_PRESETS.staff ?? [] };
    if (!row) return {};
    const admin = row.role === 'admin';
    return {
      nome: row.nome ?? '', email: row.email, password: '',
      mode: admin ? 'admin' : 'custom',
      permissions: admin ? (PERMISSION_PRESETS.staff ?? []) : (row.permissions ?? PERMISSION_PRESETS.staff ?? []),
    };
  }, [editing, row]);

  const editingSelf = editing && me?.id != null && Number(id) === me.id;

  return (
    <EntityFormPage
      title={editing ? 'Modifica membro' : 'Nuovo membro dello staff'}
      backPath="/staff"
      backLabel="Staff & Permessi"
      mainTitle={editing ? 'Membro' : 'Account'}
      fields={fields}
      initial={initial}
      loading={editing && !row && query.isLoading}
      submitLabel={editing ? 'Salva modifiche' : 'Aggiungi membro'}
      extra={(values, set) => (
        <PermissionEditor values={values} set={set} editingSelf={!!editingSelf} wasAdmin={row?.role === 'admin'} />
      )}
      onSubmit={async (v) => {
        const mode = (v.mode as string) || 'custom';
        // Safety: don't let an admin editing themselves drop to staff and lose admin rights (lock-out).
        if (editingSelf && row?.role === 'admin' && mode !== 'admin')
          throw new Error('Non puoi rimuovere il tuo ruolo di amministratore.');

        const data: Record<string, unknown> = { nome: v.nome };
        if (mode === 'admin') {
          data.role = 'admin';
          data.permissions = null;
        } else {
          // Always include dashboard so the set is never empty (empty → backend NULL → full staff surface).
          data.role = 'staff';
          data.permissions = Array.from(new Set([...(((v.permissions as string[]) ?? []).filter(Boolean)), 'dashboard']));
        }
        if (editing) {
          if (v.password) data.password = v.password;
          await saveMut.mutateAsync({ id: Number(id), data });
          toast.success('Membro aggiornato');
        } else {
          data.email = v.email;
          data.password = v.password;
          await saveMut.mutateAsync({ data });
          toast.success('Membro aggiunto');
        }
      }}
    />
  );
}
