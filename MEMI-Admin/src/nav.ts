import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  ShoppingBag,
  Tag,
  Users,
  Megaphone,
  BadgePercent,
  BarChart3,
  FileText,
  Truck,
  CreditCard,
  Store,
  ShoppingCart,
  Plug,
  AppWindow,
  UserCog,
  History,
  Settings,
} from 'lucide-react';

export interface NavLeaf {
  label: string;
  to: string;
  /** false → route renders the "coming soon" placeholder (not yet ported). */
  ready?: boolean;
  adminOnly?: boolean;
}
export interface NavGroup {
  label: string;
  icon: LucideIcon;
  to?: string; // group header can be a direct link
  ready?: boolean;
  adminOnly?: boolean;
  children?: NavLeaf[];
}

/**
 * Mirrors MEMI/dashboard.html sidebar. `ready:true` marks views ported in this
 * first delivery; everything else routes to a labelled placeholder so the full
 * IA is navigable from day one.
 */
export const NAV: NavGroup[] = [
  { label: 'Home', icon: LayoutDashboard, to: '/', ready: true },
  {
    label: 'Ordini',
    icon: ShoppingBag,
    children: [
      { label: 'Tutti gli ordini', to: '/orders', ready: true },
      { label: 'Bozze', to: '/orders/drafts' },
      { label: 'Carrelli abbandonati', to: '/orders/abandoned' },
      { label: 'Resi', to: '/returns' },
      { label: 'Fatture', to: '/invoices' },
    ],
  },
  {
    label: 'Prodotti',
    icon: Tag,
    children: [
      { label: 'Catalogo', to: '/products', ready: true },
      { label: 'Magazzino', to: '/inventory' },
      { label: 'Trasferimenti', to: '/transfers' },
      { label: 'Collezioni', to: '/collections' },
      { label: 'Categorie', to: '/categories' },
      { label: 'Gift card', to: '/giftcards' },
    ],
  },
  {
    label: 'Clienti',
    icon: Users,
    children: [
      { label: 'Tutti i clienti', to: '/customers', ready: true },
      { label: 'Fedeltà & Punti', to: '/loyalty' },
      { label: 'Segmenti', to: '/segments' },
      { label: 'Recensioni', to: '/reviews' },
    ],
  },
  {
    label: 'Marketing',
    icon: Megaphone,
    children: [
      { label: 'Campagne', to: '/marketing' },
      { label: 'Automazioni', to: '/automations' },
      { label: 'Email automatiche', to: '/lifecycle' },
      { label: 'Newsletter', to: '/newsletter' },
      { label: 'Pop-up', to: '/popups' },
    ],
  },
  { label: 'Sconti', icon: BadgePercent, to: '/discounts', ready: true },
  {
    label: 'Statistiche',
    icon: BarChart3,
    adminOnly: true,
    children: [
      { label: 'Panoramica', to: '/analytics', adminOnly: true },
      { label: 'Report', to: '/reports', adminOnly: true },
      { label: 'Live view', to: '/liveview', adminOnly: true },
    ],
  },
  {
    label: 'Contenuti',
    icon: FileText,
    children: [
      { label: 'Pagine', to: '/content' },
      { label: 'Blog', to: '/blog' },
      { label: 'File', to: '/files' },
    ],
  },
  {
    label: 'Spedizioni',
    icon: Truck,
    children: [
      { label: 'Corrieri', to: '/couriers' },
      { label: 'Spedizioni in corso', to: '/shipments' },
      { label: 'Tracking', to: '/tracking' },
      { label: 'Zone & Tariffe', to: '/shipping-zones' },
      { label: 'Punti di ritiro', to: '/pickup' },
    ],
  },
  {
    label: 'Finanza',
    icon: CreditCard,
    adminOnly: true,
    children: [
      { label: 'Panoramica', to: '/finance', adminOnly: true },
      { label: 'Pagamenti ricevuti', to: '/payouts', adminOnly: true },
      { label: 'Fatture & Spese', to: '/bills', adminOnly: true },
      { label: 'Tasse', to: '/taxes', adminOnly: true },
    ],
  },
  {
    label: 'Canali',
    icon: Store,
    children: [
      { label: 'Negozio online', to: '/online-store' },
      { label: 'Social & Marketplace', to: '/social' },
      { label: 'Punto vendita', to: '/pos' },
    ],
  },
  {
    label: 'Acquisti',
    icon: ShoppingCart,
    adminOnly: true,
    children: [
      { label: 'Ordini fornitori', to: '/purchase-orders', adminOnly: true },
      { label: 'Fornitori', to: '/suppliers', adminOnly: true },
    ],
  },
];

export const NAV_TOOLS: NavGroup[] = [
  { label: 'Integrazioni', icon: Plug, to: '/integrations', adminOnly: true },
  { label: 'App esterne', icon: AppWindow, to: '/apps' },
  { label: 'Staff & Permessi', icon: UserCog, to: '/staff', adminOnly: true },
  { label: 'Registro attività', icon: History, to: '/audit-log', adminOnly: true },
  { label: 'Impostazioni', icon: Settings, to: '/settings', adminOnly: true },
];
