/**
 * types.ts — response shapes from the MEMI backend, transcribed from the actual
 * route handlers + schema.sql. DECIMAL columns arrive as strings; parse with
 * Number()/num() on the client.
 */

export type PaymentStatus = 'in_attesa' | 'pagato' | 'rimborsato' | 'fallito';
export type OrderStatus =
  | 'in_attesa'
  | 'in_preparazione'
  | 'spedito'
  | 'consegnato'
  | 'annullato';
export type ProductStatus = 'attivo' | 'bozza' | 'esaurito' | 'archiviato';
export type DiscountType = 'percentuale' | 'fisso' | 'spedizione';
export type DiscountStatus = 'attivo' | 'disattivo' | 'pianificato';

export interface AuthMe {
  id: number;
  username?: string;
  email: string;
  nome?: string;
  ruolo?: string;
  role?: string;
  permissions?: string[];
}

export interface KpiCard {
  value: string;
  delta: string;
  up: boolean;
}
export interface DashboardKpis {
  revenue: KpiCard;
  orders: KpiCard;
  visitors: KpiCard;
  aov: KpiCard;
  /** Present only on the windowed (`?days`) response — orders ÷ visitors over the period. */
  conversion?: KpiCard;
}
export interface CatalogKpis {
  active_products: number;
  total_products: number;
  low_stock: number;
  out_of_stock: number;
  sales_today: number;
  orders_today: number;
}
export interface ChartPoint {
  day: string;
  revenue: string;
  orders: number;
}
export interface RecentOrder {
  id: number;
  order_number: string;
  customer_nome: string;
  customer_cognome: string;
  total: string;
  payment_status: PaymentStatus;
  order_status: OrderStatus;
  created_at: string;
  tracking_number: string | null;
  courier_code: string | null;
}

export interface OrderRow {
  id: number;
  order_number: string;
  customer_id: number | null;
  customer_nome: string;
  customer_cognome: string;
  customer_email: string;
  customer_telefono: string | null;
  shipping_address: string;
  shipping_citta: string;
  shipping_cap: string;
  shipping_paese: string;
  subtotal: string;
  shipping_cost: string;
  discount_amount: string;
  total: string;
  discount_code: string | null;
  payment_method: string;
  payment_status: PaymentStatus;
  order_status: OrderStatus;
  courier_code: string | null;
  tracking_number: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  gift_card_code?: string | null;
  gift_card_amount?: string;
}
export interface OrderListResponse {
  orders: OrderRow[];
  total: number;
}
export interface OrderItem {
  id: number;
  order_id: number;
  product_id: string;
  product_name: string;
  taglia: string | null;
  colore: string | null;
  price: string;
  qty: number;
}
export interface Shipment {
  id: number;
  tracking_number: string;
  order_id: number;
  courier_code: string;
  destinazione: string | null;
  stato: string;
  eta: string | null;
  created_at: string;
  updated_at: string;
}
export interface OrderDetail extends OrderRow {
  items: OrderItem[];
  shipment: Shipment | null;
}

export interface ProductImage {
  full?: string;
  card?: string;
  thumb?: string;
}
export interface ProductRow {
  id: string;
  name: string;
  categoria: string;
  colore: string | null;
  color_label: string | null;
  price: string;
  original_price: string | null;
  discount_pct: number;
  is_new: boolean;
  icon: string;
  popularity: number;
  collections: string[];
  description: string | null;
  images: (ProductImage | string)[];
  status: ProductStatus;
  created_at: string;
  updated_at: string;
  taglie: string[];
  stock_total: number;
}

/** Managed taxonomy entity — shared shape for categories and collections. */
export interface Taxonomy {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  hero_image: string | null;
  stato: 'attiva' | 'bozza';
  sort_order: number;
  product_count?: number;
  created_at?: string;
  updated_at?: string;
}
export type ProductCategory = Taxonomy;
export type ProductCollection = Taxonomy;

/** Managed colour palette entry. */
export interface ProductColor {
  id: number;
  slug: string;
  name: string;
  hex: string | null;
  sort_order: number;
  product_count?: number;
}

export interface CustomerRow {
  id: number;
  email: string;
  nome: string;
  cognome: string | null;
  telefono: string | null;
  citta: string | null;
  paese: string;
  total_orders: number;
  total_spent: string;
  created_at: string;
  last_login: string | null;
}
export interface CustomerListResponse {
  customers: CustomerRow[];
  total: number;
}

export interface Discount {
  id: number;
  code: string;
  tipo: DiscountType;
  valore: string;
  utilizzi: number;
  max_utilizzi: number | null;
  scadenza: string | null;
  stato: DiscountStatus;
  min_order: string;
  created_at: string;
}

/* ── Batch 2 resources ─────────────────────────────────── */
export interface Reso {
  id: number;
  rma_number: string;
  order_id: number;
  order_number: string;
  customer_nome: string;
  customer_email: string;
  motivo: string;
  descrizione: string | null;
  stato: 'aperto' | 'in_analisi' | 'approvato' | 'rifiutato' | 'rimborsato';
  rimborso_amount: string | null;
  created_at: string;
  updated_at: string;
}
export interface ResiResponse {
  resi: Reso[];
  total: number;
}

export interface Invoice {
  id: number;
  invoice_number: string;
  order_id: number;
  order_number: string | null;
  customer_nome: string;
  customer_cognome: string;
  customer_email: string;
  total: string;
  tax_amount: string;
  stato: 'bozza' | 'emessa' | 'inviata' | 'pagata' | 'annullata';
  created_at: string;
  due_date: string | null;
}
export interface InvoicesResponse {
  invoices: Invoice[];
  total: number;
}

export interface Review {
  id: number;
  product_id: string;
  product_name: string;
  customer_nome: string;
  customer_email: string | null;
  rating: number;
  titolo: string | null;
  testo: string | null;
  stato: 'in_attesa' | 'pubblicata' | 'rifiutata';
  risposta_admin: string | null;
  created_at: string;
}
export interface ReviewsResponse {
  reviews: Review[];
  total: number;
  pending: number;
}

export interface Subscriber {
  id: number;
  email: string;
  fonte: string;
  subscribed_at: string;
  unsubscribed: number;
}
export interface NewsletterResponse {
  subscribers: Subscriber[];
  total: number;
  unsubscribed: number;
}

export interface GiftCard {
  id: number;
  code: string;
  initial_amount: string;
  balance: string;
  stato: 'attiva' | 'utilizzata' | 'disattivata';
  recipient_email: string | null;
  note: string | null;
  created_at: string;
}
export interface GiftCardsResponse {
  cards: GiftCard[];
  summary: { total: number; attive: number; balance: number; emesso: number };
}

export interface Shipment2 {
  id: number;
  tracking_number: string;
  order_id: number;
  order_number: string;
  courier_code: string;
  customer_nome: string;
  customer_cognome: string;
  destinazione: string | null;
  stato: 'preso_in_carico' | 'in_transito' | 'in_consegna' | 'consegnato' | 'problema';
  eta: string | null;
  created_at: string;
}

export interface Courier {
  code: string;
  nome: string;
  slug: string | null;
  rate: string;
  attivo: number;
  tracking_url_template: string | null;
}

export interface CartLineItem {
  id: string | number;
  name: string;
  qty: number;
  price: number;
  taglia: string | null;
  categoria?: string | null; // cart line
}
export interface AbandonedCart {
  id: number;
  token: string;
  email: string | null;
  customer_nome: string | null;
  item_count: number;
  total: number;
  items: CartLineItem[];
  updated_at: string;
  created_at: string;
  recoverable: boolean;
}
export interface CartsResponse {
  carts: AbandonedCart[];
  summary: { count: number; potential_value: number; recoverable: number };
  threshold_minutes: number;
}
export interface CartCategory {
  categoria: string;
  cart_items: number;
  catalog_products: number;
}

export interface Supplier {
  id: number;
  nome: string;
  email: string | null;
  telefono: string | null;
  note: string | null;
  created_at: string;
}

export interface StaffMember {
  id: number;
  email: string;
  nome: string | null;
  role: 'admin' | 'staff';
  permissions: string[] | null;
  created_at: string;
}
export interface StaffResponse {
  staff: StaffMember[];
  total: number;
}

export interface AuditEntry {
  id: number;
  admin_id: number | null;
  admin_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface Expense {
  id: number;
  descrizione: string;
  categoria: string;
  importo: string;
  ricorrenza: string;
  fornitore: string | null;
  data_spesa: string | null;
  note: string | null;
  created_at: string;
  /** VAT rate % (0/4/5/10/22). imponibile (net) + iva_amount are derived server-side from importo (gross). */
  iva_rate?: string | number;
  imponibile?: string;
  iva_amount?: string;
  /** Optional receipt/invoice file under /api/uploads. */
  attachment_url?: string | null;
}
export interface ExpensesResponse {
  expenses: Expense[];
  summary: { total: string; month: string; monthly_recurring: string; iva_total?: string };
}

export interface SupplierInvoice {
  id: number;
  supplier_id: number | null;
  supplier_nome: string | null;
  numero: string;
  data_fattura: string | null;
  scadenza: string | null;
  imponibile: string;
  iva: string;
  totale: string;
  stato: string;              // 'da_pagare' | 'pagata'
  attachment_url: string | null;
  note: string | null;
  purchase_order_id: number | null;
  scaduta: number;            // 1 = overdue (unpaid & past due)
  created_at: string;
}
export interface SupplierInvoicesResponse {
  invoices: SupplierInvoice[];
  summary: { total: number; total_amount: string; da_pagare_count: string; da_pagare_amount: string; scadute_amount: string; iva_total: string };
}

export interface ShippingZone {
  id: number;
  nome: string;
  paesi: string | null;
  metodo: string | null;
  prezzo: string;
  spedizione_gratuita_da: string | null;
}

export interface PickupPoint {
  id: number;
  nome: string;
  indirizzo: string;
  corriere: string | null;
  orari: string | null;
  attivo: number;
  created_at: string;
}

export interface Campaign {
  id: number;
  nome: string;
  tipo: 'email' | 'ads' | 'automazione' | 'sms';
  canale: string | null;
  budget: string;
  destinatari: number;
  stato: 'bozza' | 'attiva' | 'pianificata' | 'conclusa';
  open_rate: string;
  click_rate: string;
  revenue: string;
  created_at: string;
}

export interface CmsPage {
  id: number;
  titolo: string;
  slug: string;
  contenuto: string | null;
  stato: 'pubblicata' | 'bozza';
  updated_at: string;
}

export interface BlogPost {
  id: number;
  titolo: string;
  slug: string;
  estratto: string | null;
  contenuto: string | null;
  stato: 'pubblicato' | 'bozza';
  published_at: string | null;
  created_at: string;
}

export interface LoyaltyTier {
  nome: string;
  min_spent: number;
  multiplier: number;
}
export interface LoyaltyConfig {
  enabled: boolean;
  signupBonus: number;
  pointsPerEuro: number;
  pointValueEur: number;
  minRedeem: number;
  expiryMonths: number;
  tiers: LoyaltyTier[];
}
export interface LoyaltyCustomer {
  id: number;
  nome: string;
  cognome: string;
  email: string;
  points: number;
  total_orders: number;
  total_spent: string;
  tier?: string | null;
}
export interface LoyaltyCustomersResponse {
  customers: LoyaltyCustomer[];
  summary: { total_points: number | string; members: number };
  tiers?: LoyaltyTier[];
}
export interface LoyaltyRedemption {
  id: number;
  code: string;
  valore: string;
  utilizzi: number;
  max_utilizzi: number | null;
  stato: string;
  scadenza: string | null;
  created_at: string;
}
export interface LoyaltyRedemptionsResponse {
  redemptions: LoyaltyRedemption[];
  summary: { total: number; total_value: string; used: number; used_value: string };
}
export interface LoyaltyTransaction {
  delta: number;
  reason: string | null;
  order_id: number | null;
  balance_after: number;
  created_at: string;
}
export interface LoyaltyCustomerDetail {
  id: number;
  nome: string;
  cognome: string;
  email: string;
  points: number;
  transactions: LoyaltyTransaction[];
}

export interface Segment {
  id: number;
  nome: string;
  descrizione: string | null;
  min_spent: string;
  min_orders: number;
  created_at: string;
  members: number;
}
export interface SegmentsResponse {
  segments: Segment[];
  total_customers: number;
}
export interface SegmentMember {
  id: number;
  nome: string;
  cognome: string | null;
  email: string;
  total_orders: number;
  total_spent: string;
}
export interface SegmentMembersResponse {
  segment: Segment;
  customers: SegmentMember[];
}

export interface Popup {
  id: number;
  titolo: string;
  contenuto: string | null;
  cta_label: string | null;
  cta_url: string | null;
  posizione: string;
  attivo: number;
  created_at: string;
}

export interface Automation {
  id: number;
  nome: string;
  trigger_event: string;
  azione: string;
  oggetto: string | null;
  messaggio: string | null;
  attivo: number;
  run_count: number;
  last_run: string | null;
  created_at: string;
}
export interface AutomationsResponse {
  automations: Automation[];
  triggers: string[];
  actions: string[];
}

export interface Transfer {
  id: number;
  prodotto: string;
  taglia: string | null;
  quantita: number;
  da_luogo: string | null;
  a_luogo: string | null;
  stato: string;
  note: string | null;
  created_at: string;
}

export interface PurchaseOrder {
  id: number;
  numero: string | null;
  supplier_id: number | null;
  supplier_nome: string | null;
  stato: 'bozza' | 'inviato' | 'ricevuto' | 'annullato';
  note: string | null;
  totale: string;
  items_qty: number;
  created_at: string;
  received_at: string | null;
}

export interface LifecycleData {
  campaigns: { type: string; label: string; scheduled: boolean; description: string }[];
  settings: Record<string, string>;
  enabled: boolean;
  smtp: boolean;
  recent: { type: string; sent: number; last_sent: string }[];
}

export type StoreSettings = Record<string, string>;

export interface FinanceData {
  summary: {
    revenue_total: number;
    revenue_month: number;
    revenue_today: number;
    pending_amount: number;
    refunded_amount: number;
    shipping_collected: number;
    paid_count: number;
    aov: number;
    expenses_total: number;
    expenses_month: number;
    net_total: number;
    net_month: number;
  };
  by_method: { method: string; count: number; total: number }[];
  recent: {
    order_number: string;
    customer: string;
    total: number;
    method: string;
    payment_status: PaymentStatus;
    created_at: string;
  }[];
  /** Present only when `?days` is passed — revenue/orders/expenses/net over the last N days. */
  period?: { days: number; revenue: number; orders: number; aov: number; expenses: number; net: number } | null;
}

export interface PayoutsData {
  summary: {
    received_total: number;
    received_count: number;
    received_month: number;
    received_today: number;
    shipping_collected: number;
  };
  by_method: { method: string; count: number; total: number }[];
  payments: {
    order_number: string;
    customer: string;
    total: number;
    shipping: number;
    method: string;
    reference: string | null;
    created_at: string;
  }[];
}

export interface TaxStats {
  oss_ytd: number;
  foreign_orders: number;
  threshold: number;
  over: boolean;
  by_country?: { paese: string; orders: number; revenue: number }[];
  /** IVA position (liquidazione) YTD: debito on sales (estimated at sales_rate) − credito on expenses (exact). */
  iva?: { sales_rate: number; revenue_ytd: number; debito: number; credito: number; saldo: number };
}

export interface Integration {
  key: string;
  nome: string;
  categoria: string;
  icona: string;
  connesso: boolean;
  dettaglio: string;
}
export interface IntegrationsResponse {
  integrations: Integration[];
}

export interface LiveView {
  online: number;
  views_30m: number;
  views_today: number;
  top_paths: { path: string; views: number }[];
  top_sources: { sorgente: string; views: number }[];
  recent: { path: string; session_id: string | null; created_at: string }[];
}

export interface MediaItem {
  nome: string;
  url: string;
  thumb: string;
  full: string;
  created_at: string;
}

export interface ReportsData {
  summary: { revenue_ytd: number; orders_ytd: number; aov: number };
  sales_by_month: { month: string; revenue: number; orders: number }[];
  orders_by_status: { stato: string; count: number }[];
  top_categories: { categoria: string; revenue: number; units: number }[];
}

export interface OnlineStoreData {
  status: string;
  name: string;
  domain: string;
  country: string;
  products: { total: number; active: number; out_of_stock: number };
  pages_published: number;
  orders_today: number;
}

export interface SocialChannel {
  key: string;
  nome: string;
  categoria: string;
  icona: string;
  connesso: boolean;
  dettaglio: string;
  url: string;
}
export interface SocialData {
  channels: SocialChannel[];
}

export interface PosData {
  enabled: boolean;
  today: { orders: number; revenue: number };
}

export interface AppItem {
  key: string;
  nome: string;
  categoria: string;
  icona: string;
  descrizione: string;
  enabled: boolean;
  config?: Record<string, unknown>;
}
export interface AppsData {
  apps: AppItem[];
}
