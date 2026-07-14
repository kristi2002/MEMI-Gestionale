/**
 * api.ts — typed client for the MEMI backend.
 *
 * Mirrors the legacy MEMI/js/admin-api.js contract exactly (same paths, same
 * HttpOnly-cookie auth via credentials:'include') so this app is a drop-in
 * replacement that talks to the identical backend. No endpoint changes.
 */

const metaBase = document.querySelector<HTMLMetaElement>('meta[name="memi-api"]')?.content;
export const API_BASE = metaBase || '/api';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

function qs(params?: Query): string {
  if (!params) return '';
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

/** On a 401 the admin cookie is gone/expired — bounce to login. */
function handle401() {
  if (window.location.pathname !== '/login') {
    window.location.href = '/login?session=expired';
  }
}

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    if (res.status === 401) handle401();
    const msg = (body && (body.error || body.message)) || res.statusText || 'Errore di rete';
    throw new ApiError(msg, res.status);
  }
  return body as T;
}

async function request<T>(method: string, path: string, data?: unknown): Promise<T> {
  const res = await fetch(API_BASE + path, {
    method,
    credentials: 'include',
    headers: data !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: data !== undefined ? JSON.stringify(data) : undefined,
  });
  return parse<T>(res);
}

/** Some endpoints (products) return a bare array + X-Total-Count header. */
async function requestWithTotal<T>(path: string): Promise<{ items: T[]; total: number }> {
  const res = await fetch(API_BASE + path, { credentials: 'include' });
  const items = await parse<T[]>(res);
  const headerTotal = parseInt(res.headers.get('X-Total-Count') || '', 10);
  return { items, total: Number.isNaN(headerTotal) ? items.length : headerTotal };
}

async function upload<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(API_BASE + path, { method: 'POST', credentials: 'include', body: form });
  return parse<T>(res);
}

const get = <T>(path: string) => request<T>('GET', path);
const post = <T>(path: string, data?: unknown) => request<T>('POST', path, data ?? {});
const put = <T>(path: string, data?: unknown) => request<T>('PUT', path, data ?? {});
const del = <T>(path: string, data?: unknown) => request<T>('DELETE', path, data);

import type {
  AuthMe,
  DashboardKpis,
  CatalogKpis,
  ChartPoint,
  RecentOrder,
  OrderDetail,
  OrderListResponse,
  ProductRow,
  CustomerListResponse,
  Discount,
} from '@/types';

export const api = {
  auth: {
    login: (email: string, password: string) =>
      post<{ ok?: boolean }>('/admin/auth/login', { email, password }),
    logout: () => post('/admin/auth/logout', {}),
    me: () => get<AuthMe>('/admin/auth/me'),
    changePassword: (current_password: string, new_password: string) =>
      put('/admin/auth/password', { current_password, new_password }),
  },
  dashboard: {
    kpis: () => get<DashboardKpis>('/admin/dashboard/kpis'),
    catalogKpis: () => get<CatalogKpis>('/admin/dashboard/catalog-kpis'),
    chart: () => get<ChartPoint[]>('/admin/dashboard/chart'),
    recentOrders: () => get<RecentOrder[]>('/admin/dashboard/recent-orders'),
    topProducts: () =>
      get<{ product_id: string; product_name: string; units_sold: string; revenue: string }[]>(
        '/admin/dashboard/top-products',
      ),
  },
  orders: {
    list: (params?: Query) => get<OrderListResponse>('/orders/admin/list' + qs(params)),
    get: (id: number | string) => get<OrderDetail>('/orders/admin/' + id),
    updateStatus: (id: number, data: { order_status?: string; payment_status?: string }) =>
      put<{ ok: boolean; cancelled: boolean }>('/orders/admin/' + id + '/status', data),
    ship: (id: number, data: { courier_code: string; tracking_number: string; eta?: string; destinazione?: string }) =>
      put<{ ok: boolean }>('/orders/admin/' + id + '/ship', data),
    sendTracking: (id: number) => post<{ ok: boolean; sent_to: string }>('/orders/admin/' + id + '/send-tracking', {}),
    delete: (id: number) => del<{ ok: boolean }>('/orders/admin/' + id),
  },
  products: {
    listPaged: (params?: Query) =>
      requestWithTotal<ProductRow>('/products' + qs({ status: 'all', ...params })),
    get: (id: string) => get<ProductRow>('/products/' + encodeURIComponent(id)),
    update: (id: string, data: unknown) => put('/products/' + encodeURIComponent(id), data),
    delete: (id: string) => del('/products/' + encodeURIComponent(id)),
    importCsv: (file: File, dryRun?: boolean) => {
      const fd = new FormData();
      fd.append('file', file);
      return upload<unknown>('/admin/products/import' + (dryRun ? '?dryRun=1' : ''), fd);
    },
    importTemplateUrl: () => API_BASE + '/admin/products/import/template',
    feedUrl: () => API_BASE + '/feed/meta.csv',
  },
  customers: {
    list: (params?: Query) => get<CustomerListResponse>('/admin/customers' + qs(params)),
    get: (id: number) => get<Record<string, unknown>>('/admin/customers/' + id),
    delete: (id: number) => del('/admin/customers/' + id),
  },
  discounts: {
    list: () => get<Discount[]>('/admin/discounts'),
    create: (data: unknown) => post('/admin/discounts', data),
    update: (id: number, data: unknown) => put('/admin/discounts/' + id, data),
    delete: (id: number) => del('/admin/discounts/' + id),
  },
};
