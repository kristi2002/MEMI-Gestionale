import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import type { OrderRow, ProductRow, CustomerRow } from '@/types';

/* ── Dashboard ─────────────────────────────────────────── */
export function useDashboard() {
  const kpis = useQuery({ queryKey: ['dash', 'kpis'], queryFn: () => api.dashboard.kpis() });
  const catalog = useQuery({ queryKey: ['dash', 'catalog'], queryFn: () => api.dashboard.catalogKpis() });
  const chart = useQuery({ queryKey: ['dash', 'chart'], queryFn: () => api.dashboard.chart() });
  const recent = useQuery({ queryKey: ['dash', 'recent'], queryFn: () => api.dashboard.recentOrders() });
  const top = useQuery({ queryKey: ['dash', 'top'], queryFn: () => api.dashboard.topProducts() });
  return { kpis, catalog, chart, recent, top };
}

const PAGE = 50;

/* ── Orders (infinite) ─────────────────────────────────── */
export function useOrders(filters: { stato?: string; pagamento?: string } = {}) {
  return useInfiniteQuery({
    queryKey: ['orders', filters],
    queryFn: ({ pageParam = 0 }) => api.orders.list({ limit: PAGE, offset: pageParam, ...filters }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.orders.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
  });
}

/* ── Products (infinite; total from X-Total-Count) ─────── */
export function useProducts() {
  return useInfiniteQuery({
    queryKey: ['products'],
    queryFn: ({ pageParam = 0 }) => api.products.listPaged({ limit: 60, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.items.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
  });
}

/* ── Customers (infinite) ──────────────────────────────── */
export function useCustomers() {
  return useInfiniteQuery({
    queryKey: ['customers'],
    queryFn: ({ pageParam = 0 }) => api.customers.list({ limit: PAGE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.customers.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
  });
}

/* ── Discounts (flat) ──────────────────────────────────── */
export function useDiscounts() {
  return useQuery({ queryKey: ['discounts'], queryFn: () => api.discounts.list() });
}

/* All products in one shot (for category/collection aggregation — no dedicated API). */
export function useAllProducts() {
  return useQuery({ queryKey: ['products', 'all'], queryFn: () => api.products.listPaged({ limit: 1000, offset: 0 }) });
}

/* ── Managed taxonomy entities ─────────────────────────── */
export const useCategories = () => useQuery({ queryKey: ['categories'], queryFn: () => api.categories.list() });
export const useCollections = () => useQuery({ queryKey: ['collections'], queryFn: () => api.collections.list() });
export const useColors = () => useQuery({ queryKey: ['colors'], queryFn: () => api.colors.list() });

/* ── Mutations used by bulk actions ────────────────────── */
export function useOrderStatusMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { order_status?: string; payment_status?: string } }) =>
      api.orders.updateStatus(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Aggiornamento non riuscito'),
  });
}

export function useDeleteOrders() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: number[]) => Promise.allSettled(ids.map((id) => api.orders.delete(id))),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
  });
}

export function useDeleteProducts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => Promise.allSettled(ids.map((id) => api.products.delete(id))),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });
}

export function useDeleteCustomers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: number[]) => Promise.allSettled(ids.map((id) => api.customers.delete(id))),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });
}

export function useDeleteDiscounts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: number[]) => Promise.allSettled(ids.map((id) => api.discounts.delete(id))),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['discounts'] }),
  });
}

/* ── Batch 2 list queries ──────────────────────────────── */
export const useResi = () => useQuery({ queryKey: ['resi'], queryFn: () => api.resi.list({ limit: 200 }) });
export const useInvoices = () => useQuery({ queryKey: ['invoices'], queryFn: () => api.invoices.list({ limit: 200 }) });
export const useReviews = () => useQuery({ queryKey: ['reviews'], queryFn: () => api.reviews.list({ limit: 200 }) });
export const useNewsletter = () => useQuery({ queryKey: ['newsletter'], queryFn: () => api.newsletter.list({ limit: 500 }) });
export const useGiftcards = () => useQuery({ queryKey: ['giftcards'], queryFn: () => api.giftcards.list() });
export const useShipments = () => useQuery({ queryKey: ['shipments'], queryFn: () => api.shipping.shipments() });
export const useCouriers = () => useQuery({ queryKey: ['couriers'], queryFn: () => api.shipping.couriers() });
export const useCarts = () => useQuery({ queryKey: ['carts'], queryFn: () => api.carts.list() });
export const useSuppliers = () => useQuery({ queryKey: ['suppliers'], queryFn: () => api.suppliers.list() });
export const useStaff = () => useQuery({ queryKey: ['staff'], queryFn: () => api.staff.list() });
export const useAuditLog = () => useQuery({ queryKey: ['audit'], queryFn: () => api.auditLog.list({ limit: 300 }) });
export const useExpenses = () => useQuery({ queryKey: ['expenses'], queryFn: () => api.expenses.list() });

/** Generic "delete these ids" mutation that invalidates a query key on success. */
export function useDeleteMany<Id>(fn: (id: Id) => Promise<unknown>, invalidateKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: Id[]) => Promise.allSettled(ids.map(fn)),
    onSuccess: () => qc.invalidateQueries({ queryKey: [invalidateKey] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Operazione non riuscita'),
  });
}

/** Generic single-record update mutation (e.g. review moderation). */
export function useUpdateOne<Id>(fn: (id: Id, data: unknown) => Promise<unknown>, invalidateKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: Id; data: unknown }) => fn(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [invalidateKey] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Operazione non riuscita'),
  });
}

/** Generic create-or-update: pass an `id` to update, omit to create. */
export function useSaveEntity(
  createFn: (data: unknown) => Promise<unknown>,
  updateFn: (id: number, data: unknown) => Promise<unknown>,
  invalidateKey: string,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id?: number; data: unknown }) =>
      id != null ? updateFn(id, data) : createFn(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [invalidateKey] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Salvataggio non riuscito'),
  });
}

/* ── Batch 3 list queries ──────────────────────────────── */
export const useCampaigns = () => useQuery({ queryKey: ['campaigns'], queryFn: () => api.campaigns.list() });
export const useSegments = () => useQuery({ queryKey: ['segments'], queryFn: () => api.segments.list() });
export const usePopups = () => useQuery({ queryKey: ['popups'], queryFn: () => api.popups.list() });
export const useAutomations = () => useQuery({ queryKey: ['automations'], queryFn: () => api.automations.list() });
export const useTransfers = () => useQuery({ queryKey: ['transfers'], queryFn: () => api.transfers.list() });
export const usePurchaseOrders = () => useQuery({ queryKey: ['purchase-orders'], queryFn: () => api.purchaseOrders.list() });
export const useZones = () => useQuery({ queryKey: ['zones'], queryFn: () => api.zones.list() });
export const usePickup = () => useQuery({ queryKey: ['pickup'], queryFn: () => api.pickup.list() });
export const useLoyaltyConfig = () => useQuery({ queryKey: ['loyalty', 'config'], queryFn: () => api.loyalty.config() });
export const useLoyaltyCustomers = () => useQuery({ queryKey: ['loyalty', 'customers'], queryFn: () => api.loyalty.customers({ limit: 200 }) });
export const useLifecycle = () => useQuery({ queryKey: ['lifecycle'], queryFn: () => api.lifecycle.get() });
export const useSettings = () => useQuery({ queryKey: ['settings'], queryFn: () => api.settings.get() });
export const useFinance = () => useQuery({ queryKey: ['finance'], queryFn: () => api.dashboard.finance() });
export const useTaxStats = () => useQuery({ queryKey: ['tax-stats'], queryFn: () => api.dashboard.taxStats() });
export const useIntegrations = () => useQuery({ queryKey: ['integrations'], queryFn: () => api.settings.integrations() });
export const useLiveview = () => useQuery({ queryKey: ['liveview'], queryFn: () => api.dashboard.liveview(), refetchInterval: 15_000 });
export const useReports = () => useQuery({ queryKey: ['reports'], queryFn: () => api.reports.get() });
export const useApps = () => useQuery({ queryKey: ['apps'], queryFn: () => api.apps.get() });

/* Flatten helpers for the infinite pages. */
export const flattenOrders = (pages?: { orders: OrderRow[] }[]): OrderRow[] =>
  pages?.flatMap((p) => p.orders) ?? [];
export const flattenProducts = (pages?: { items: ProductRow[] }[]): ProductRow[] =>
  pages?.flatMap((p) => p.items) ?? [];
export const flattenCustomers = (pages?: { customers: CustomerRow[] }[]): CustomerRow[] =>
  pages?.flatMap((p) => p.customers) ?? [];
