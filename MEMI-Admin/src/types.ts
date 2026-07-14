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
