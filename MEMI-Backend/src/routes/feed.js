'use strict';

/**
 * /api/feed — public product feeds for external sales channels.
 *
 * GET /api/feed/meta.csv   Meta (Instagram/Facebook) + Google Shopping catalog
 *                          feed. Both accept this comma-separated format. Paste
 *                          the public URL into Meta Commerce Manager / Google
 *                          Merchant Center as a scheduled feed — no per-request
 *                          auth needed (it only exposes the public catalog).
 *
 * This is the "connect a channel without giving us your API keys" path. The
 * token-based Graph API push (auto-sync) is a later phase and reads the keys
 * saved on the admin Social page.
 */

const router   = require('express').Router();
const { pool } = require('../db');

function csvCell(v) {
  v = String(v == null ? '' : v);
  return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}

function firstImage(images) {
  let arr = images;
  if (typeof arr === 'string') { try { arr = JSON.parse(arr || '[]'); } catch (_) { arr = []; } }
  if (!Array.isArray(arr) || !arr.length) return '';
  const f = arr[0];
  if (typeof f === 'string') return f;
  return (f && (f.full || f.card || f.thumb)) || '';
}

router.get('/meta.csv', async (req, res) => {
  try {
    const shop = (process.env.FRONTEND_URL || '').replace(/\/+$/, '');
    const [rows] = await pool.execute(
      "SELECT id, name, description, categoria, price, status, images FROM products WHERE status IN ('attivo','esaurito')");
    const header = ['id', 'title', 'description', 'availability', 'condition', 'price', 'link', 'image_link', 'brand', 'product_type'];
    const lines = [header.join(',')];
    for (const p of rows) {
      let img = firstImage(p.images);
      if (img && img.charAt(0) === '/' && shop) img = shop + img;
      const link = shop ? shop + '/products/' + encodeURIComponent(p.id) + '/' : '/products/' + p.id + '/';
      lines.push([
        p.id,
        p.name,
        (p.description || p.name || '').replace(/\s+/g, ' ').trim(),
        p.status === 'esaurito' ? 'out of stock' : 'in stock',
        'new',
        (Number(p.price) || 0).toFixed(2) + ' EUR',
        link,
        img,
        'MEMI',
        p.categoria || '',
      ].map(csvCell).join(','));
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="memi-meta-feed.csv"');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.send(lines.join('\n'));
  } catch (err) {
    console.error('meta feed error', err);
    return res.status(500).send('error');
  }
});

module.exports = router;
