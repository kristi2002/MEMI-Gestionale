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
    const limit  = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const entityType = req.query.entity_type ? String(req.query.entity_type) : null;
    const action     = req.query.action ? String(req.query.action) : null;

    const where = [], params = [];
    if (entityType) { where.push('entity_type = ?'); params.push(entityType); }
    if (action)     { where.push('action = ?');      params.push(action); }
    const whereSql = where.length ? ' WHERE ' + where.join(' AND ') : '';

    const [[{ total }]] = await pool.execute('SELECT COUNT(*) AS total FROM audit_log' + whereSql, params);
    const [rows] = await pool.execute(
      `SELECT * FROM audit_log${whereSql} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`, params);
    res.set('X-Total-Count', String(total));
    return res.json(rows);
  } catch (err) {
    console.error('audit log list error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

module.exports = router;
