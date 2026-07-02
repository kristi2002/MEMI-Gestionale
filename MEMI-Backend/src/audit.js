'use strict';

/**
 * Admin audit log — accountability for sensitive admin actions (order status/ship
 * changes, refunds, discount/giftcard create-delete). See docs/PRODUCTION-ROADMAP.md
 * Phase 5. Best-effort like email sending: a logging failure must never break the
 * admin action it's recording, so every call site should chain .catch(() => {}).
 */

const { pool } = require('./db');

/**
 * @param {object} p
 * @param {number} p.adminId
 * @param {string} p.adminEmail
 * @param {string} p.action      short verb, e.g. 'order.status_update', 'discount.delete'
 * @param {string} p.entityType  e.g. 'order', 'discount_code', 'gift_card', 'resi'
 * @param {string|number} p.entityId
 * @param {object} [p.details]   arbitrary JSON-serializable context (old/new values, etc.)
 */
async function logAdminAction({ adminId, adminEmail, action, entityType, entityId, details }) {
  await pool.execute(
    `INSERT INTO audit_log (admin_id, admin_email, action, entity_type, entity_id, details)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [adminId || null, adminEmail || null, action, entityType, String(entityId), JSON.stringify(details || {})]
  );
}

module.exports = { logAdminAction };
