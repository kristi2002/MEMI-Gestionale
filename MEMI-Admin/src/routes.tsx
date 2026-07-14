import type { ReactElement } from 'react';
import { NAV, NAV_TOOLS, type NavGroup, type NavLeaf } from '@/nav';
import { PlaceholderPage } from '@/pages/placeholder';
import { DashboardPage } from '@/pages/dashboard';
import { OrdersPage } from '@/pages/orders';
import { ProductsPage } from '@/pages/products';
import { CustomersPage } from '@/pages/customers';
import { DiscountsPage } from '@/pages/discounts';

/** Concrete React pages ported in this delivery, keyed by route path. */
const READY_PAGES: Record<string, ReactElement> = {
  '/': <DashboardPage />,
  '/orders': <OrdersPage />,
  '/products': <ProductsPage />,
  '/customers': <CustomersPage />,
  '/discounts': <DiscountsPage />,
};

export interface AppRoute {
  path: string;
  element: ReactElement;
}

/** Flattens the nav tree into a full route table; unported leaves → placeholder. */
export function buildRoutes(): AppRoute[] {
  const routes: AppRoute[] = [];
  const seen = new Set<string>();

  const add = (path: string, label: string, subtitle?: string) => {
    if (seen.has(path)) return;
    seen.add(path);
    routes.push({ path, element: READY_PAGES[path] ?? <PlaceholderPage title={label} subtitle={subtitle} /> });
  };

  const walkLeaf = (leaf: NavLeaf, parent: string) =>
    add(leaf.to, leaf.label, parent !== leaf.label ? parent : undefined);

  const walk = (groups: NavGroup[]) => {
    for (const g of groups) {
      if (g.to) add(g.to, g.label);
      g.children?.forEach((c) => walkLeaf(c, g.label));
    }
  };

  walk(NAV);
  walk(NAV_TOOLS);
  return routes;
}
