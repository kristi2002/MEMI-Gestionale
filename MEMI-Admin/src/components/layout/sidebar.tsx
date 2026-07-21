import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { NAV, NAV_TOOLS, type NavGroup } from '@/nav';
import { useAuth } from '@/hooks/use-auth';
import { canViewPath } from '@/lib/rbac';
import { cn } from '@/lib/utils';

function isGroupActive(group: NavGroup, pathname: string): boolean {
  if (group.to && group.to === pathname) return true;
  return !!group.children?.some((c) => pathname === c.to || pathname.startsWith(c.to + '/'));
}

function GroupBlock({ group, onNavigate }: { group: NavGroup; onNavigate?: () => void }) {
  const { pathname } = useLocation();
  const active = isGroupActive(group, pathname);
  const [open, setOpen] = useState(active);
  const Icon = group.icon;

  // Leaf link (no children)
  if (!group.children) {
    return (
      <NavLink
        to={group.to || '#'}
        onClick={onNavigate}
        end={group.to === '/'}
        className={({ isActive }) =>
          cn(
            'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
            isActive
              ? 'bg-primary/10 text-primary'
              : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground',
          )
        }
      >
        <Icon className="h-[18px] w-[18px] shrink-0" />
        <span className="truncate">{group.label}</span>
      </NavLink>
    );
  }

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          active ? 'text-foreground' : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground',
        )}
      >
        <Icon className="h-[18px] w-[18px] shrink-0" />
        <span className="flex-1 truncate text-left">{group.label}</span>
        <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="ml-4 mt-0.5 flex flex-col border-l border-border pl-3">
          {group.children.map((child) => (
            <NavLink
              key={child.to}
              to={child.to}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors',
                  isActive
                    ? 'font-medium text-primary'
                    : 'text-muted-foreground hover:text-foreground',
                )
              }
            >
              <span className="truncate">{child.label}</span>
              {!child.ready && (
                <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  presto
                </span>
              )}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { isAdmin, permissions } = useAuth();
  // Gate by the user's granted permission views (full admins see everything). A group with
  // children is shown only if at least one child is permitted, and its children are filtered
  // to the permitted set — mirroring the backend requirePermission() checks per route.
  const filterGroups = (groups: NavGroup[]): NavGroup[] =>
    groups.flatMap((g) => {
      if (g.children) {
        const children = g.children.filter((c) => canViewPath(c.to, isAdmin, permissions));
        return children.length ? [{ ...g, children }] : [];
      }
      return canViewPath(g.to, isAdmin, permissions) ? [g] : [];
    });
  const mainNav = filterGroups(NAV);
  const toolsNav = filterGroups(NAV_TOOLS);

  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="flex items-center gap-2.5 px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
          M
        </div>
        <div className="leading-tight">
          <div className="font-bold">
            Memi<span className="text-muted-foreground">.</span>
          </div>
          <div className="text-[11px] text-muted-foreground">Gestionale</div>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        {mainNav.map((g) => (
          <GroupBlock key={g.label} group={g} onNavigate={onNavigate} />
        ))}

        {toolsNav.length > 0 && (
          <>
            <div className="my-3 border-t border-border" />
            <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Strumenti
            </div>
            {toolsNav.map((g) => (
              <GroupBlock key={g.label} group={g} onNavigate={onNavigate} />
            ))}
          </>
        )}
      </nav>
    </div>
  );
}
