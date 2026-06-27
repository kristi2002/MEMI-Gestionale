'use strict';

/**
 * /api/admin/cms  — Content management: static pages + blog posts (admin only)
 *
 * Pages:
 *   GET    /api/admin/cms/pages         List pages
 *   POST   /api/admin/cms/pages         Create a page
 *   PUT    /api/admin/cms/pages/:id     Update a page
 *   DELETE /api/admin/cms/pages/:id     Delete a page
 *
 * Blog:
 *   GET    /api/admin/cms/blog          List blog posts
 *   POST   /api/admin/cms/blog          Create a post
 *   PUT    /api/admin/cms/blog/:id      Update a post
 *   DELETE /api/admin/cms/blog/:id      Delete a post
 */

const router = require('express').Router();
const { pool }         = require('../db');
const { requireAdmin } = require('../middleware/auth');

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180) || 'pagina';
}

/* ════════════ PAGES ════════════ */
router.get('/pages', requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM cms_pages ORDER BY updated_at DESC');
    return res.json(rows);
  } catch (err) {
    console.error('cms pages list error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

router.post('/pages', requireAdmin, async (req, res) => {
  const { titolo, contenuto, stato = 'bozza' } = req.body;
  if (!titolo || !titolo.trim()) return res.status(400).json({ error: 'Titolo obbligatorio' });
  const slug = req.body.slug ? slugify(req.body.slug) : slugify(titolo);
  try {
    const [result] = await pool.execute(
      `INSERT INTO cms_pages (titolo, slug, contenuto, stato) VALUES (?, ?, ?, ?)`,
      [titolo.trim(), slug, contenuto || null, stato === 'pubblicata' ? 'pubblicata' : 'bozza']
    );
    return res.status(201).json({ ok: true, id: result.insertId, slug });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Slug già esistente' });
    console.error('create page error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

router.put('/pages/:id', requireAdmin, async (req, res) => {
  const { titolo, contenuto, stato, slug } = req.body;
  try {
    const fields = [];
    const vals   = [];
    const add = (col, val) => { if (val !== undefined) { fields.push(`${col} = ?`); vals.push(val); } };
    add('titolo', titolo);
    add('contenuto', contenuto);
    if (stato !== undefined) add('stato', stato === 'pubblicata' ? 'pubblicata' : 'bozza');
    if (slug  !== undefined) add('slug', slugify(slug));
    if (!fields.length) return res.status(400).json({ error: 'Nessun campo da aggiornare' });
    vals.push(req.params.id);
    const [result] = await pool.execute(`UPDATE cms_pages SET ${fields.join(', ')} WHERE id = ?`, vals);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Pagina non trovata' });
    return res.json({ ok: true });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Slug già esistente' });
    return res.status(500).json({ error: 'Errore server' });
  }
});

router.delete('/pages/:id', requireAdmin, async (req, res) => {
  try {
    const [result] = await pool.execute('DELETE FROM cms_pages WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Pagina non trovata' });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ════════════ BLOG ════════════ */
router.get('/blog', requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM blog_posts ORDER BY created_at DESC');
    return res.json(rows);
  } catch (err) {
    console.error('blog list error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

router.post('/blog', requireAdmin, async (req, res) => {
  const { titolo, estratto, contenuto, cover_color, stato = 'bozza' } = req.body;
  if (!titolo || !titolo.trim()) return res.status(400).json({ error: 'Titolo obbligatorio' });
  const slug = req.body.slug ? slugify(req.body.slug) : slugify(titolo);
  const published_at = stato === 'pubblicato' ? new Date().toISOString().slice(0, 10) : null;
  try {
    const [result] = await pool.execute(
      `INSERT INTO blog_posts (titolo, slug, estratto, contenuto, cover_color, stato, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [titolo.trim(), slug, estratto || null, contenuto || null,
       cover_color || 'linear-gradient(135deg,#e89aae,#7fc29b)',
       stato === 'pubblicato' ? 'pubblicato' : 'bozza', published_at]
    );
    return res.status(201).json({ ok: true, id: result.insertId, slug });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Slug già esistente' });
    console.error('create blog error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

router.put('/blog/:id', requireAdmin, async (req, res) => {
  const { titolo, estratto, contenuto, cover_color, stato, slug } = req.body;
  try {
    const fields = [];
    const vals   = [];
    const add = (col, val) => { if (val !== undefined) { fields.push(`${col} = ?`); vals.push(val); } };
    add('titolo', titolo);
    add('estratto', estratto);
    add('contenuto', contenuto);
    add('cover_color', cover_color);
    if (slug !== undefined) add('slug', slugify(slug));
    if (stato !== undefined) {
      add('stato', stato === 'pubblicato' ? 'pubblicato' : 'bozza');
      if (stato === 'pubblicato') add('published_at', new Date().toISOString().slice(0, 10));
    }
    if (!fields.length) return res.status(400).json({ error: 'Nessun campo da aggiornare' });
    vals.push(req.params.id);
    const [result] = await pool.execute(`UPDATE blog_posts SET ${fields.join(', ')} WHERE id = ?`, vals);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Articolo non trovato' });
    return res.json({ ok: true });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Slug già esistente' });
    return res.status(500).json({ error: 'Errore server' });
  }
});

router.delete('/blog/:id', requireAdmin, async (req, res) => {
  try {
    const [result] = await pool.execute('DELETE FROM blog_posts WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Articolo non trovato' });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ══════════════════════════════════════════════════════════════
   PUBLIC (no auth) — published content for the storefront.
   Mounted at /api/cms (see server.js). Only returns PUBLISHED rows.
   ══════════════════════════════════════════════════════════════ */
router.get('/published/pages/:slug', async (req, res) => {
  try {
    const [[page]] = await pool.execute(
      "SELECT titolo, slug, contenuto, updated_at FROM cms_pages WHERE slug = ? AND stato = 'pubblicata' LIMIT 1",
      [req.params.slug]
    );
    if (!page) return res.status(404).json({ error: 'Pagina non trovata' });
    return res.json(page);
  } catch (err) {
    console.error('cms public page error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

router.get('/published/blog', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      "SELECT titolo, slug, estratto, cover_color, published_at FROM blog_posts WHERE stato = 'pubblicato' ORDER BY COALESCE(published_at, created_at) DESC LIMIT 50"
    );
    return res.json(rows);
  } catch (err) {
    console.error('cms public blog list error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

router.get('/published/blog/:slug', async (req, res) => {
  try {
    const [[post]] = await pool.execute(
      "SELECT titolo, slug, estratto, contenuto, cover_color, published_at FROM blog_posts WHERE slug = ? AND stato = 'pubblicato' LIMIT 1",
      [req.params.slug]
    );
    if (!post) return res.status(404).json({ error: 'Articolo non trovato' });
    return res.json(post);
  } catch (err) {
    console.error('cms public blog error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

module.exports = router;
