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

/* Flatten helpers for the infinite pages. */
export const flattenOrders = (pages?: { orders: OrderRow[] }[]): OrderRow[] =>
  pages?.flatMap((p) => p.orders) ?? [];
export const flattenProducts = (pages?: { items: ProductRow[] }[]): ProductRow[] =>
  pages?.flatMap((p) => p.items) ?? [];
export const flattenCustomers = (pages?: { customers: CustomerRow[] }[]): CustomerRow[] =>
  pages?.flatMap((p) => p.customers) ?? [];
