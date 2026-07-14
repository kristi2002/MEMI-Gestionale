import type { ReactElement } from 'react';
import { NAV, NAV_TOOLS, type NavGroup, type NavLeaf } from '@/nav';
import { PlaceholderPage } from '@/pages/placeholder';
import { DashboardPage } from '@/pages/dashboard';
import { OrdersPage } from '@/pages/orders';
import { ProductsPage } from '@/pages/products';
import { InventoryPage } from '@/pages/inventory';
import { CustomersPage } from '@/pages/customers';
import { DiscountsPage } from '@/pages/discounts';
import { ReturnsPage } from '@/pages/returns';
import { InvoicesPage } from '@/pages/invoices';
import { ReviewsPage } from '@/pages/reviews';
import { NewsletterPage } from '@/pages/newsletter';
import { GiftcardsPage } from '@/pages/giftcards';
import { ShipmentsPage } from '@/pages/shipments';
import { CouriersPage } from '@/pages/couriers';
import { AbandonedCartsPage } from '@/pages/abandoned-carts';
import { SuppliersPage } from '@/pages/suppliers';
import { StaffPage } from '@/pages/staff';
import { AuditLogPage } from '@/pages/audit-log';
import { ExpensesPage } from '@/pages/expenses';
import { ShippingZonesPage } from '@/pages/shipping-zones';
import { PickupPage } from '@/pages/pickup';
import { PopupsPage } from '@/pages/popups';
import { SegmentsPage } from '@/pages/segments';
import { TransfersPage } from '@/pages/transfers';
import { CampaignsPage } from '@/pages/campaigns';
import { PagesPage } from '@/pages/pages';
import { BlogPage } from '@/pages/blog';
import { AutomationsPage } from '@/pages/automations';
import { PurchaseOrdersPage } from '@/pages/purchase-orders';
import { LoyaltyPage } from '@/pages/loyalty';
import { SettingsPage } from '@/pages/settings';
import { LifecyclePage } from '@/pages/lifecycle';
import { CategoriesPage, CollectionsPage } from '@/pages/taxonomy';
import { FinancePage } from '@/pages/finance';
import { AnalyticsPage } from '@/pages/analytics';
import { TaxesPage } from '@/pages/taxes';
import { LiveviewPage } from '@/pages/liveview';
import { IntegrationsPage } from '@/pages/integrations';
import { FilesPage } from '@/pages/files';
import { ReportsPage } from '@/pages/reports';
import { OnlineStorePage, SocialPage, PosPage } from '@/pages/channels';
import { AppsPage } from '@/pages/apps';

/** Concrete React pages ported in this delivery, keyed by route path. */
const READY_PAGES: Record<string, ReactElement> = {
  '/': <DashboardPage />,
  '/orders': <OrdersPage />,
  '/orders/drafts': <OrdersPage initialTab="unpaid" title="Bozze / Non pagati" subtitle="Ordini non ancora pagati." />,
  '/orders/abandoned': <AbandonedCartsPage />,
  '/returns': <ReturnsPage />,
  '/invoices': <InvoicesPage />,
  '/products': <ProductsPage />,
  '/inventory': <InventoryPage />,
  '/transfers': <TransfersPage />,
  '/collections': <CollectionsPage />,
  '/categories': <CategoriesPage />,
  '/giftcards': <GiftcardsPage />,
  '/customers': <CustomersPage />,
  '/loyalty': <LoyaltyPage />,
  '/segments': <SegmentsPage />,
  '/reviews': <ReviewsPage />,
  '/marketing': <CampaignsPage />,
  '/automations': <AutomationsPage />,
  '/lifecycle': <LifecyclePage />,
  '/newsletter': <NewsletterPage />,
  '/popups': <PopupsPage />,
  '/discounts': <DiscountsPage />,
  '/content': <PagesPage />,
  '/blog': <BlogPage />,
  '/couriers': <CouriersPage />,
  '/shipments': <ShipmentsPage />,
  '/tracking': <ShipmentsPage title="Tracking" />,
  '/shipping-zones': <ShippingZonesPage />,
  '/pickup': <PickupPage />,
  '/bills': <ExpensesPage />,
  '/purchase-orders': <PurchaseOrdersPage />,
  '/suppliers': <SuppliersPage />,
  '/staff': <StaffPage />,
  '/audit-log': <AuditLogPage />,
  '/settings': <SettingsPage />,
  '/analytics': <AnalyticsPage />,
  '/liveview': <LiveviewPage />,
  '/finance': <FinancePage />,
  '/payouts': <FinancePage />,
  '/taxes': <TaxesPage />,
  '/files': <FilesPage />,
  '/integrations': <IntegrationsPage />,
  '/reports': <ReportsPage />,
  '/online-store': <OnlineStorePage />,
  '/social': <SocialPage />,
  '/pos': <PosPage />,
  '/apps': <AppsPage />,
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
