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
  ResiResponse,
  InvoicesResponse,
  ReviewsResponse,
  NewsletterResponse,
  GiftCardsResponse,
  Shipment2,
  Courier,
  CartsResponse,
  Supplier,
  StaffResponse,
  AuditEntry,
  ExpensesResponse,
  Campaign,
  CmsPage,
  BlogPost,
  SegmentsResponse,
  Popup,
  AutomationsResponse,
  Transfer,
  PurchaseOrder,
  ShippingZone,
  PickupPoint,
  LoyaltyConfig,
  LoyaltyCustomersResponse,
  LifecycleData,
  StoreSettings,
  FinanceData,
  TaxStats,
  IntegrationsResponse,
  ReportsData,
  OnlineStoreData,
  SocialData,
  PosData,
  AppsData,
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
    finance: () => get<FinanceData>('/admin/dashboard/finance'),
    taxStats: () => get<TaxStats>('/admin/dashboard/tax-stats'),
    liveview: () => get<import('@/types').LiveView>('/admin/liveview'),
  },
  orders: {
    list: (params?: Query) => get<OrderListResponse>('/orders/admin/list' + qs(params)),
    get: (id: number | string) => get<OrderDetail>('/orders/admin/' + id),
    updateStatus: (id: number, data: { order_status?: string; payment_status?: string }) =>
      put<{ ok: boolean; cancelled: boolean }>('/orders/admin/' + id + '/status', data),
    ship: (id: number, data: { courier_code: string; tracking_number: string; eta?: string; destinazione?: string }) =>
      put<{ ok: boolean }>('/orders/admin/' + id + '/ship', data),
    sendTracking: (id: number) => post<{ ok: boolean; sent_to: string }>('/orders/admin/' + id + '/send-tracking', {}),
    refreshTracking: (id: number) =>
      post<{ ok: boolean; status: string; order_status: string; simulated: boolean; events: { label: string; at: string | null }[] }>(
        '/orders/admin/' + id + '/refresh-tracking',
        {},
      ),
    delete: (id: number) => del<{ ok: boolean }>('/orders/admin/' + id),
  },
  products: {
    listPaged: (params?: Query) =>
      requestWithTotal<ProductRow>('/products' + qs({ status: 'all', ...params })),
    get: (id: string) => get<ProductRow>('/products/' + encodeURIComponent(id)),
    create: (data: unknown) => post('/products', data),
    update: (id: string, data: unknown) => put('/products/' + encodeURIComponent(id), data),
    updateStock: (id: string, taglia: string, stock: number) =>
      put('/products/' + encodeURIComponent(id) + '/stock', { taglia, stock }),
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
    create: (data: unknown) => post('/admin/customers', data),
    update: (id: number, data: unknown) => put('/admin/customers/' + id, data),
    delete: (id: number) => del('/admin/customers/' + id),
  },
  discounts: {
    list: () => get<Discount[]>('/admin/discounts'),
    create: (data: unknown) => post('/admin/discounts', data),
    update: (id: number, data: unknown) => put('/admin/discounts/' + id, data),
    delete: (id: number) => del('/admin/discounts/' + id),
  },
  resi: {
    list: (params?: Query) => get<ResiResponse>('/admin/resi' + qs(params)),
    update: (id: number, data: unknown) => put('/admin/resi/' + id, data),
    refund: (id: number, data: unknown) => post('/admin/resi/' + id + '/refund', data),
    delete: (id: number) => del('/admin/resi/' + id),
  },
  invoices: {
    list: (params?: Query) => get<InvoicesResponse>('/admin/invoices' + qs(params)),
    delete: (id: number) => del('/admin/invoices/' + id),
  },
  reviews: {
    list: (params?: Query) => get<ReviewsResponse>('/reviews/admin' + qs(params)),
    update: (id: number, data: unknown) => put('/reviews/admin/' + id, data),
    delete: (id: number) => del('/reviews/admin/' + id),
  },
  newsletter: {
    list: (params?: Query) => get<NewsletterResponse>('/newsletter' + qs(params)),
    remove: (id: number) => del('/newsletter/' + id),
  },
  giftcards: {
    list: () => get<GiftCardsResponse>('/admin/giftcards'),
    create: (data: unknown) => post('/admin/giftcards', data),
    update: (id: number, data: unknown) => put('/admin/giftcards/' + id, data),
    delete: (id: number) => del('/admin/giftcards/' + id),
  },
  shipping: {
    shipments: () => get<Shipment2[]>('/shipping/shipments'),
    couriers: () => get<Courier[]>('/shipping/couriers?all=1'),
  },
  carts: {
    list: (params?: Query) => get<CartsResponse>('/admin/carts' + qs(params)),
    recover: (id: number) => post('/admin/carts/' + id + '/recover', {}),
    delete: (id: number) => del('/admin/carts/' + id),
  },
  suppliers: {
    list: () => get<Supplier[]>('/admin/suppliers'),
    create: (data: unknown) => post('/admin/suppliers', data),
    update: (id: number, data: unknown) => put('/admin/suppliers/' + id, data),
    delete: (id: number) => del('/admin/suppliers/' + id),
  },
  staff: {
    list: () => get<StaffResponse>('/admin/staff'),
    create: (data: unknown) => post('/admin/staff', data),
    update: (id: number, data: unknown) => put('/admin/staff/' + id, data),
    delete: (id: number) => del('/admin/staff/' + id),
  },
  auditLog: {
    list: (params?: Query) => get<AuditEntry[]>('/admin/audit-log' + qs(params)),
  },
  expenses: {
    list: () => get<ExpensesResponse>('/admin/expenses'),
    create: (data: unknown) => post('/admin/expenses', data),
    update: (id: number, data: unknown) => put('/admin/expenses/' + id, data),
    delete: (id: number) => del('/admin/expenses/' + id),
  },
  campaigns: {
    list: () => get<Campaign[]>('/admin/campaigns'),
    create: (d: unknown) => post('/admin/campaigns', d),
    update: (id: number, d: unknown) => put('/admin/campaigns/' + id, d),
    delete: (id: number) => del('/admin/campaigns/' + id),
  },
  pages: {
    list: () => get<CmsPage[]>('/admin/cms/pages'),
    create: (d: unknown) => post('/admin/cms/pages', d),
    update: (id: number, d: unknown) => put('/admin/cms/pages/' + id, d),
    delete: (id: number) => del('/admin/cms/pages/' + id),
  },
  blog: {
    list: () => get<BlogPost[]>('/admin/cms/blog'),
    create: (d: unknown) => post('/admin/cms/blog', d),
    update: (id: number, d: unknown) => put('/admin/cms/blog/' + id, d),
    delete: (id: number) => del('/admin/cms/blog/' + id),
  },
  segments: {
    list: () => get<SegmentsResponse>('/admin/segments'),
    create: (d: unknown) => post('/admin/segments', d),
    update: (id: number, d: unknown) => put('/admin/segments/' + id, d),
    delete: (id: number) => del('/admin/segments/' + id),
  },
  popups: {
    list: () => get<Popup[]>('/admin/popups'),
    create: (d: unknown) => post('/admin/popups', d),
    update: (id: number, d: unknown) => put('/admin/popups/' + id, d),
    delete: (id: number) => del('/admin/popups/' + id),
  },
  automations: {
    list: () => get<AutomationsResponse>('/admin/automations'),
    create: (d: unknown) => post('/admin/automations', d),
    update: (id: number, d: unknown) => put('/admin/automations/' + id, d),
    delete: (id: number) => del('/admin/automations/' + id),
  },
  transfers: {
    list: () => get<Transfer[]>('/admin/transfers'),
    create: (d: unknown) => post('/admin/transfers', d),
    update: (id: number, d: unknown) => put('/admin/transfers/' + id, d),
    delete: (id: number) => del('/admin/transfers/' + id),
  },
  purchaseOrders: {
    list: () => get<PurchaseOrder[]>('/admin/purchase-orders'),
    get: (id: number) => get<unknown>('/admin/purchase-orders/' + id),
    create: (d: unknown) => post('/admin/purchase-orders', d),
    update: (id: number, d: unknown) => put('/admin/purchase-orders/' + id, d),
    delete: (id: number) => del('/admin/purchase-orders/' + id),
    receive: (id: number) => post('/admin/purchase-orders/' + id + '/receive', {}),
  },
  zones: {
    list: () => get<ShippingZone[]>('/shipping/zones'),
    create: (d: unknown) => post('/shipping/zones', d),
    update: (id: number, d: unknown) => put('/shipping/zones/' + id, d),
    delete: (id: number) => del('/shipping/zones/' + id),
  },
  pickup: {
    list: () => get<PickupPoint[]>('/shipping/pickup'),
    create: (d: unknown) => post('/shipping/pickup', d),
    update: (id: number, d: unknown) => put('/shipping/pickup/' + id, d),
    delete: (id: number) => del('/shipping/pickup/' + id),
  },
  loyalty: {
    config: () => get<LoyaltyConfig>('/admin/loyalty/config'),
    updateConfig: (d: unknown) => put('/admin/loyalty/config', d),
    customers: (params?: Query) => get<LoyaltyCustomersResponse>('/admin/loyalty/customers' + qs(params)),
  },
  lifecycle: {
    get: () => get<LifecycleData>('/admin/lifecycle'),
    settings: (d: unknown) => put('/admin/lifecycle/settings', d),
    run: (d?: unknown) => post('/admin/lifecycle/run', d ?? {}),
  },
  settings: {
    get: () => get<StoreSettings>('/admin/settings'),
    update: (d: unknown) => put('/admin/settings', d),
    integrations: () => get<IntegrationsResponse>('/admin/settings/integrations'),
    uploadMedia: (files: FileList | File[]) => {
      const fd = new FormData();
      for (const f of Array.from(files)) fd.append('file', f);
      return upload<{ added: number; media: import('@/types').MediaItem[] }>('/admin/settings/media', fd);
    },
    deleteMedia: (url: string) => del<{ removed: number; media: import('@/types').MediaItem[] }>('/admin/settings/media', { url }),
  },
  reports: { get: () => get<ReportsData>('/admin/reports') },
  onlineStore: { get: () => get<OnlineStoreData>('/admin/online-store') },
  social: { get: () => get<SocialData>('/admin/social') },
  pos: { get: () => get<PosData>('/admin/pos') },
  apps: { get: () => get<AppsData>('/admin/apps') },
};
