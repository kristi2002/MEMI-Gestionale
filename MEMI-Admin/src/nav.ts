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
      { label: 'Bozze', to: '/orders/drafts' , ready: true },
      { label: 'Carrelli abbandonati', to: '/orders/abandoned', ready: true },
      { label: 'Resi', to: '/returns', ready: true },
      { label: 'Fatture', to: '/invoices', ready: true },
    ],
  },
  {
    label: 'Prodotti',
    icon: Tag,
    children: [
      { label: 'Catalogo', to: '/products', ready: true },
      { label: 'Magazzino', to: '/inventory', ready: true },
      { label: 'Trasferimenti', to: '/transfers' , ready: true },
      { label: 'Collezioni', to: '/collections' , ready: true },
      { label: 'Categorie', to: '/categories' , ready: true },
      { label: 'Gift card', to: '/giftcards', ready: true },
    ],
  },
  {
    label: 'Clienti',
    icon: Users,
    children: [
      { label: 'Tutti i clienti', to: '/customers', ready: true },
      { label: 'Fedeltà & Punti', to: '/loyalty' , ready: true },
      { label: 'Segmenti', to: '/segments' , ready: true },
      { label: 'Recensioni', to: '/reviews', ready: true },
    ],
  },
  {
    label: 'Marketing',
    icon: Megaphone,
    children: [
      { label: 'Campagne', to: '/marketing' , ready: true },
      { label: 'Automazioni', to: '/automations' , ready: true },
      { label: 'Email automatiche', to: '/lifecycle' , ready: true },
      { label: 'Newsletter', to: '/newsletter', ready: true },
      { label: 'Pop-up', to: '/popups' , ready: true },
    ],
  },
  { label: 'Sconti', icon: BadgePercent, to: '/discounts', ready: true },
  {
    label: 'Statistiche',
    icon: BarChart3,
    adminOnly: true,
    children: [
      { label: 'Panoramica', to: '/analytics', adminOnly: true , ready: true },
      { label: 'Report', to: '/reports', adminOnly: true },
      { label: 'Live view', to: '/liveview', adminOnly: true , ready: true },
    ],
  },
  {
    label: 'Contenuti',
    icon: FileText,
    children: [
      { label: 'Pagine', to: '/content' , ready: true },
      { label: 'Blog', to: '/blog' , ready: true },
      { label: 'File', to: '/files' , ready: true },
    ],
  },
  {
    label: 'Spedizioni',
    icon: Truck,
    children: [
      { label: 'Corrieri', to: '/couriers', ready: true },
      { label: 'Spedizioni in corso', to: '/shipments', ready: true },
      { label: 'Tracking', to: '/tracking', ready: true },
      { label: 'Zone & Tariffe', to: '/shipping-zones' , ready: true },
      { label: 'Punti di ritiro', to: '/pickup' , ready: true },
    ],
  },
  {
    label: 'Finanza',
    icon: CreditCard,
    adminOnly: true,
    children: [
      { label: 'Panoramica', to: '/finance', adminOnly: true , ready: true },
      { label: 'Pagamenti ricevuti', to: '/payouts', adminOnly: true , ready: true },
      { label: 'Fatture & Spese', to: '/bills', adminOnly: true, ready: true },
      { label: 'Tasse', to: '/taxes', adminOnly: true , ready: true },
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
      { label: 'Ordini fornitori', to: '/purchase-orders', adminOnly: true , ready: true },
      { label: 'Fornitori', to: '/suppliers', adminOnly: true, ready: true },
    ],
  },
];

export const NAV_TOOLS: NavGroup[] = [
  { label: 'Integrazioni', icon: Plug, to: '/integrations', adminOnly: true , ready: true },
  { label: 'App esterne', icon: AppWindow, to: '/apps' },
  { label: 'Staff & Permessi', icon: UserCog, to: '/staff', adminOnly: true, ready: true },
  { label: 'Registro attività', icon: History, to: '/audit-log', adminOnly: true, ready: true },
  { label: 'Impostazioni', icon: Settings, to: '/settings', adminOnly: true , ready: true },
];
