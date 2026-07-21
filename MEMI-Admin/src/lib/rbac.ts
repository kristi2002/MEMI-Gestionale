/**
 * rbac.ts — maps an admin nav path to the backend permission "view" it requires.
 *
 * The backend gates each admin route with `requirePermission(view)` (see
 * MEMI-Backend/src/server.js) and resolves a user's granted views from
 * `admin_users.permissions` (see MEMI-Backend/src/permissions.js PRESETS).
 * The sidebar uses this map so a staff member only sees the sections their
 * preset actually grants — matching what the backend would authorize, instead
 * of the old coarse `adminOnly` boolean that both over- and under-showed.
 *
 * A full admin has `permissions = null` (→ isAdmin) and bypasses this entirely.
 * A path with no mapping is treated as admin-only (hidden from staff).
 */
export const VIEW_BY_PATH: Record<string, string> = {
  '/': 'dashboard',
  // Ordini
  '/orders': 'orders',
  '/orders/abandoned': 'orders-abandoned',
  '/returns': 'returns',
  '/invoices': 'invoices',
  // Prodotti
  '/products': 'products',
  '/inventory': 'inventory',
  '/transfers': 'transfers',
  '/collections': 'collections',
  '/categories': 'categories',
  '/colors': 'products', // backend gates /api/admin/colors under 'products'
  '/giftcards': 'giftcards',
  // Clienti
  '/customers': 'customers',
  '/loyalty': 'loyalty',
  '/segments': 'segments',
  '/reviews': 'reviews',
  // Marketing
  '/automations': 'automations',
  '/lifecycle': 'marketing', // backend gates /api/admin/lifecycle under 'marketing'
  '/newsletter': 'newsletter',
  '/discounts': 'discounts',
  // Statistiche
  '/analytics': 'analytics',
  '/reports': 'reports',
  '/liveview': 'liveview',
  // Spedizioni
  '/couriers': 'couriers',
  '/shipments': 'shipments',
  '/shipping-zones': 'shipping-zones',
  '/pickup': 'pickup',
  // Finanza
  '/finance': 'finance',
  '/payouts': 'payouts',
  '/bills': 'bills',
  '/taxes': 'taxes',
  // Acquisti (procurement ~ inventory; supplier invoices ~ bills)
  '/purchase-orders': 'inventory',
  '/supplier-invoices': 'bills',
  '/suppliers': 'inventory',
  // Strumenti
  '/integrations': 'integrations',
  '/apps': 'apps',
  '/staff': 'staff',
  '/audit-log': 'audit-log',
  '/settings': 'settings',
};

/** The permission view a nav path requires, or undefined if unmapped (→ admin-only). */
export function viewForPath(path?: string): string | undefined {
  if (!path) return undefined;
  return VIEW_BY_PATH[path];
}

/** True if a user (full admin, or staff whose granted views include `view`) may see a path. */
export function canViewPath(path: string | undefined, isAdmin: boolean, permissions: string[]): boolean {
  if (isAdmin) return true;
  const view = viewForPath(path);
  return !!view && permissions.includes(view);
}

/**
 * Resolve the permission view for a *live* location pathname, which may include
 * sub-segments the nav map doesn't list verbatim (e.g. `/staff/new`,
 * `/orders/123`). Prefers an exact match, then the longest matching base path so
 * `/orders/abandoned` resolves to its own view rather than `/orders`.
 */
export function viewForPathname(pathname: string): string | undefined {
  if (VIEW_BY_PATH[pathname]) return VIEW_BY_PATH[pathname];
  let best: string | undefined;
  let bestLen = -1;
  for (const key of Object.keys(VIEW_BY_PATH)) {
    if (key === '/') continue;
    if ((pathname === key || pathname.startsWith(key + '/')) && key.length > bestLen) {
      best = VIEW_BY_PATH[key];
      bestLen = key.length;
    }
  }
  return best;
}

/**
 * Route-level access decision for the current location. Full admins pass. For a
 * mapped view the user must hold it. Unmapped paths (rare sub-pages) fail OPEN at
 * the route — the backend still enforces `requirePermission` on every API call
 * (403), so this never grants data, it only avoids false "access denied" walls.
 * Every sensitive section (finance, staff, payouts, settings, …) IS mapped, so
 * direct navigation to them by a scoped staff account is blocked here.
 */
export function canViewPathname(pathname: string, isAdmin: boolean, permissions: string[]): boolean {
  if (isAdmin) return true;
  const view = viewForPathname(pathname);
  if (!view) return true;
  return permissions.includes(view);
}
