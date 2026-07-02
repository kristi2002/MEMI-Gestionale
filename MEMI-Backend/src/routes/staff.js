'use strict';

/**
 * /api/admin/staff  — Admin user management
 *
 * GET    /api/admin/staff       List all admin/staff users
 * POST   /api/admin/staff       Create new staff account (admin only)
 * PUT    /api/admin/staff/:id   Update nome, email, role, password (admin only)
 * DELETE /api/admin/staff/:id   Delete account — cannot delete yourself (admin only)
 */

const router           = require('express').Router();
const { pool }         = require('../db');
const { requireAdmin } = require('../middleware/auth');
const bcrypt           = require('bcryptjs');
const { logAdminAction } = require('../audit');

/* ── GET /api/admin/staff ── */
router.get('/', requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, email, nome, role, created_at FROM admin_users ORDER BY created_at ASC'
    );
    return res.json({ staff: rows, total: rows.length });
  } catch (err) {
    console.error('list staff error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── POST /api/admin/staff ── */
router.post('/', requireAdmin, async (req, res) => {
  if (req.admin.role !== 'admin')
    return res.status(403).json({ error: 'Solo admin può creare account staff' });

  const { email, nome, password, role = 'staff' } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email e password obbligatori' });
  if (password.length < 8)
    return res.status(400).json({ error: 'La password deve contenere almeno 8 caratteri' });

  try {
    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.execute(
      'INSERT INTO admin_users (email, nome, password_hash, role) VALUES (?, ?, ?, ?)',
      [email, nome || '', hash, role === 'admin' ? 'admin' : 'staff']
    );
    const [[user]] = await pool.execute(
      'SELECT id, email, nome, role, created_at FROM admin_users WHERE id = ?',
      [result.insertId]
    );
    logAdminAction({
      adminId: req.admin.id, adminEmail: req.admin.email, action: 'staff.create',
      entityType: 'admin_user', entityId: result.insertId, details: { email, role: role === 'admin' ? 'admin' : 'staff' },
    }).catch(() => {});
    return res.status(201).json({ user });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ error: 'Email già registrata' });
    console.error('create staff error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── PUT /api/admin/staff/:id ── */
router.put('/:id', requireAdmin, async (req, res) => {
  if (req.admin.role !== 'admin')
    return res.status(403).json({ error: 'Solo admin può modificare account staff' });

  const { nome, email, role, password } = req.body;
  const fields = [];
  const vals   = [];

  if (nome  !== undefined) { fields.push('nome = ?');  vals.push(nome); }
  if (email !== undefined) { fields.push('email = ?'); vals.push(email); }
  if (role  !== undefined) { fields.push('role = ?');  vals.push(role === 'admin' ? 'admin' : 'staff'); }
  if (password) {
    if (password.length < 8)
      return res.status(400).json({ error: 'La password deve contenere almeno 8 caratteri' });
    const hash = await bcrypt.hash(password, 10);
    fields.push('password_hash = ?');
    vals.push(hash);
  }

  if (!fields.length)
    return res.status(400).json({ error: 'Nessun campo da aggiornare' });

  try {
    vals.push(req.params.id);
    await pool.execute(`UPDATE admin_users SET ${fields.join(', ')} WHERE id = ?`, vals);
    const [[user]] = await pool.execute(
      'SELECT id, email, nome, role, created_at FROM admin_users WHERE id = ?',
      [req.params.id]
    );
    if (!user) return res.status(404).json({ error: 'Utente non trovato' });
    logAdminAction({
      adminId: req.admin.id, adminEmail: req.admin.email, action: 'staff.update',
      entityType: 'admin_user', entityId: req.params.id,
      // Never log the password itself — only whether it was rotated.
      details: { nome, email, role, password_changed: !!password },
    }).catch(() => {});
    return res.json({ user });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ error: 'Email già in uso' });
    console.error('update staff error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── DELETE /api/admin/staff/:id ── */
router.delete('/:id', requireAdmin, async (req, res) => {
  if (req.admin.role !== 'admin')
    return res.status(403).json({ error: 'Solo admin può eliminare account staff' });

  // Prevent self-deletion
  if (String(req.params.id) === String(req.admin.id))
    return res.status(400).json({ error: 'Non puoi eliminare il tuo stesso account' });

  try {
    const [result] = await pool.execute(
      'DELETE FROM admin_users WHERE id = ?', [req.params.id]
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ error: 'Utente non trovato' });
    logAdminAction({
      adminId: req.admin.id, adminEmail: req.admin.email, action: 'staff.delete',
      entityType: 'admin_user', entityId: req.params.id, details: {},
    }).catch(() => {});
    return res.json({ ok: true });
  } catch (err) {
    console.error('delete staff error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

module.exports = router;
