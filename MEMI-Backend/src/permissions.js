'use strict';

/**
 * Granular RBAC model.
 *
 * A user's effective access is an array of allowed view names. It is resolved as:
 *   - explicit admin_users.permissions (JSON array)  → use it
 *   - else role === 'admin'                           → null  (full access)
 *   - else                                            → STAFF_VIEWS (legacy staff)
 *
 * This is additive/backward-compatible: existing accounts have permissions = NULL,
 * so 'admin' stays full and 'staff' keeps the historical operational surface.
 * Custom profiles (warehouse, customer_service, marketing) are stored as an
 * explicit permissions array on a role='staff' account — no ENUM change needed.
 */

// Sections only a full admin sees by default (mirrors the frontend ADMIN_ONLY_VIEWS).
const ADMIN_ONLY = ['analytics', 'reports', 'liveview', 'finance', 'payouts', 'bills', 'taxes', 'integrations', 'staff', 'settings', 'audit-log'];

// The operational surface a default 'staff' account sees.
const STAFF_VIEWS = [
  'dashboard', 'orders', 'orders-drafts', 'orders-abandoned', 'returns', 'invoices',
  'products', 'inventory', 'transfers', 'collections', 'categories', 'giftcards',
  'customers', 'loyalty', 'segments', 'reviews', 'marketing', 'automations',
  'lifecycle', 'newsletter', 'popups', 'discounts', 'content', 'blog', 'files',
  'couriers', 'shipments', 'tracking', 'shipping-zones', 'pickup', 'chat',
  'online-store', 'social', 'pos', 'apps',
];

// Named profiles the staff UI can assign. `null` = full access.
const PRESETS = {
  admin: null,
  staff: STAFF_VIEWS,
  warehouse: ['dashboard', 'products', 'inventory', 'transfers', 'collections', 'categories', 'giftcards', 'couriers', 'shipments', 'tracking', 'shipping-zones', 'pickup', 'orders', 'orders-drafts', 'orders-abandoned'],
  customer_service: ['dashboard', 'orders', 'orders-drafts', 'orders-abandoned', 'returns', 'invoices', 'customers', 'loyalty', 'segments', 'reviews', 'chat', 'newsletter'],
  marketing: ['dashboard', 'marketing', 'automations', 'lifecycle', 'newsletter', 'popups', 'discounts', 'content', 'blog', 'files', 'analytics', 'reports', 'reviews'],
};

function resolvePermissions(role, permissionsJson) {
  let perms = permissionsJson;
  if (typeof perms === 'string') { try { perms = JSON.parse(perms); } catch (_) { perms = null; } }
  if (Array.isArray(perms) && perms.length) return perms;   // explicit set
  if (role === 'admin') return null;                        // full access
  return STAFF_VIEWS;                                        // default staff surface
}

module.exports = { ADMIN_ONLY, STAFF_VIEWS, PRESETS, resolvePermissions };
