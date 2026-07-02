'use strict';

/**
 * /api/admin/audit-log  — read-only view of the admin action log (admin only)
 *
 * GET /api/admin/audit-log?limit=200&entity_type=order
 */

const router = require('express').Router();
const { pool }         = require('../db');
const { requireAdmin } = require('../middleware/auth');

router.get('/', requireAdmin, async (req, res) => {
  try {
    const safeLimit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 1000);
    const entityType = req.query.entity_type ? String(req.query.entity_type) : null;

    let sql = 'SELECT * FROM audit_log';
    const params = [];
    if (entityType) { sql += ' WHERE entity_type = ?'; params.push(entityType); }
    sql += ` ORDER BY created_at DESC LIMIT ${safeLimit}`;

    const [rows] = await pool.execute(sql, params);
    return res.json(rows);
  } catch (err) {
    console.error('audit log list error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

module.exports = router;
