import { useState } from 'react';
import { Outlet, useLocation, Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { canViewPathname } from '@/lib/rbac';

/** Route-level RBAC gate. The sidebar only *hides* links; without this a scoped
 *  staff account could still deep-link to an ungranted section (e.g. /finance,
 *  /staff) and the page would render + fire APIs that 403. Fail-closed for every
 *  mapped section; the backend remains the authority on the data. */
function GuardedOutlet() {
  const { pathname } = useLocation();
  const { isAdmin, permissions } = useAuth();
  if (!canViewPathname(pathname, isAdmin, permissions)) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-24 text-center">
        <ShieldAlert className="h-10 w-10 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Accesso negato</h1>
        <p className="text-sm text-muted-foreground">
          Il tuo profilo non ha i permessi per questa sezione. Contatta un amministratore
          se pensi si tratti di un errore.
        </p>
        <Link to="/" className="text-sm font-medium text-primary underline underline-offset-4">
          Torna alla dashboard
        </Link>
      </div>
    );
  }
  return <Outlet />;
}

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r lg:block">
        <Sidebar />
      </aside>

      {/* Mobile drawer */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm transition-opacity lg:hidden',
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={() => setMobileOpen(false)}
      />
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-72 border-r bg-sidebar transition-transform lg:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <Sidebar onNavigate={() => setMobileOpen(false)} />
      </aside>

      {/* Main column */}
      <div className="lg:pl-64">
        <Topbar onMenuClick={() => setMobileOpen(true)} />
        <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
          <GuardedOutlet />
        </main>
      </div>
    </div>
  );
}
