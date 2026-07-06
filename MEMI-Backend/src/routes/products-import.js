'use strict';

/**
 * /api/admin/products  — Bulk product import (admin only)
 *
 *  POST /api/admin/products/import           Import products from a CSV
 *       ?dryRun=1                            Validate + preview only, no writes
 *       body: multipart file "file"  OR  JSON { csv: "<text>" }
 *  GET  /api/admin/products/import/template  Download a ready-to-fill CSV template
 *
 * Design note: this is a *synchronous* importer with a dry-run preview — the
 * right fit for a boutique catalog (tens–hundreds of rows). No message queue /
 * background worker is needed at this scale; the request returns a full result
 * summary. Images are pulled from public URLs in the CSV and run through the
 * existing sharp → WebP pipeline (images.js), so they're served like any other
 * product photo.
 */

const router = require('express').Router();
const multer = require('multer');
const { pool } = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { processAndStore, deleteVariants } = require('../images');
const AdmZip = require('adm-zip');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

// Larger limit for the bulk-photo ZIP (a folder of product photos).
const MAX_ZIP_MB = (parseInt(process.env.MAX_UPLOAD_MB, 10) || 8) * 30;
const uploadZip = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_ZIP_MB * 1024 * 1024, files: 1 } });
function zipUploadMw(req, res, next) {
  uploadZip.single('zip')(req, res, function (err) {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? ('ZIP troppo grande (max ' + MAX_ZIP_MB + ' MB)') : (err.message || 'Upload non valido');
      return res.status(400).json({ error: msg });
    }
    next();
  });
}

const IMG_EXT = /\.(jpe?g|png|webp|gif|avif|tiff?)$/i;
function byOrder(a, b) { return (a.order - b.order) || (a.name < b.name ? -1 : 1); }
function imagesArr(v) {
  let a = []; try { a = JSON.parse(v) || []; } catch (_) {}
  if (!Array.isArray(a)) a = [];
  return a.map(function (x) { return (typeof x === 'string') ? { full: x, card: x, thumb: x } : x; });
}
// Work out which product a zip entry belongs to (folder slug OR filename slug)
// and its order within that product (trailing -1 / _2 / (3) suffix).
function deriveTarget(entryName) {
  const parts = String(entryName).replace(/\\/g, '/').split('/').filter(function (p) { return p && p !== '.'; });
  const file = parts[parts.length - 1] || '';
  if (!IMG_EXT.test(file) || /(^|\/)__MACOSX/.test(entryName) || file.charAt(0) === '.') return null;
  const folder = parts.length > 1 ? parts[parts.length - 2] : null;
  const base = file.replace(/\.[^.]+$/, '');
  const m = base.match(/[\s._-]*\(?(\d+)\)?\s*$/);
  return {
    file: file,
    folderSlug: folder ? folder.trim().toLowerCase() : null,
    fullSlug: base.trim().toLowerCase(),                                   // keep digits (slugs like estate-2025)
    fileSlug: base.replace(/[\s._-]*\(?\d+\)?\s*$/, '').trim().toLowerCase(), // strip ordering suffix
    order: m ? parseInt(m[1], 10) : 0,
  };
}

const COLUMNS = ['id','name','categoria','colore','color_label','price','original_price',
  'discount_pct','is_new','popularity','collections','description','status','sizes','image_urls'];

/* ── tiny RFC-4180-ish CSV parser (quotes, commas, newlines inside quotes) ── */
function parseCSV(text) {
  text = String(text).replace(/^﻿/, '');            // strip BOM
  const rows = []; let row = [], field = '', i = 0, inQ = false;
  while (i < text.length) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } inQ = false; i++; continue; }
      field += c; i++; continue;
    }
    if (c === '"') { inQ = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => !(r.length === 1 && r[0].trim() === ''));   // drop blank lines
}
function rowsToObjects(rows) {
  if (!rows.length) return [];
  const headers = rows[0].map(h => h.trim().toLowerCase());
  return rows.slice(1).map(r => {
    const o = {};
    headers.forEach((h, idx) => { o[h] = (r[idx] != null ? r[idx].trim() : ''); });
    return o;
  });
}

/* ── field coercion helpers ── */
function parseSizes(s) {                                   // "S:5|M:8|L:3"
  if (!s) return [];
  return s.split('|').map(p => {
    const [t, st] = p.split(':');
    if (!t || !t.trim()) return null;
    return { taglia: t.trim(), stock: parseInt(String(st || '0').trim(), 10) || 0 };
  }).filter(Boolean);
}
function parseList(s) { return s ? s.split('|').map(x => x.trim()).filter(Boolean) : []; }
function toBool(s) { return /^(1|true|si|s[iì]|yes|y)$/i.test(String(s || '').trim()); }
function toNum(s, def = 0) { const n = parseFloat(String(s == null ? '' : s).replace(',', '.')); return isNaN(n) ? def : n; }

function validateRow(o) {
  const e = [];
  if (!o.id) e.push('id mancante');
  if (!o.name) e.push('name mancante');
  if (!o.categoria) e.push('categoria mancante');
  if (o.price === '' || isNaN(toNum(o.price, NaN))) e.push('price non valido');
  if (o.status && !['attivo', 'bozza', 'esaurito', 'archiviato'].includes(o.status))
    e.push('status non valido');
  return e;
}

async function fetchImageBuffer(url) {
  if (!/^https?:\/\//i.test(url)) throw new Error('URL non valido');
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 12 * 1024 * 1024) throw new Error('Immagine troppo grande');
  return buf;
}

/* map a CSV row → the products column set (keys are fixed, never user-controlled) */
function toFields(o) {
  return {
    name:         o.name,
    categoria:    o.categoria,
    colore:       o.colore || null,
    color_label:  o.color_label || null,
    price:        toNum(o.price),
    original_price: o.original_price ? toNum(o.original_price) : null,
    discount_pct: o.discount_pct ? Math.round(toNum(o.discount_pct)) : 0,
    is_new:       toBool(o.is_new) ? 1 : 0,
    popularity:   o.popularity ? Math.round(toNum(o.popularity)) : 0,
    collections:  JSON.stringify(parseList(o.collections)),
    description:  o.description || null,
    status:       o.status || 'attivo',
  };
}

/* ── POST /import ── */
router.post('/import', requireAdmin, upload.single('file'), async (req, res) => {
  const dryRun = req.query.dryRun === '1' || req.query.dryRun === 'true' || req.body.dryRun === '1' || req.body.dryRun === true;

  let text = '';
  if (req.file) text = req.file.buffer.toString('utf8');
  else if (typeof req.body.csv === 'string') text = req.body.csv;
  else return res.status(400).json({ error: 'Fornisci un file CSV ("file") o il campo "csv".' });

  let objects;
  try { objects = rowsToObjects(parseCSV(text)); }
  catch (e) { return res.status(400).json({ error: 'CSV non leggibile: ' + e.message }); }
  if (!objects.length) return res.status(400).json({ error: 'Il CSV non contiene righe dati.' });
  if (objects.length > 2000) return res.status(400).json({ error: 'Troppe righe (max 2000 per import).' });

  // Which ids already exist → create vs update
  const ids = objects.map(o => o.id).filter(Boolean);
  const existing = new Set();
  if (ids.length) {
    const [rows] = await pool.query('SELECT id FROM products WHERE id IN (?)', [ids]);
    rows.forEach(r => existing.add(r.id));
  }

  const preview = objects.map((o, idx) => {
    const errors = validateRow(o);
    return {
      row: idx + 2, id: o.id || '', name: o.name || '',
      action: errors.length ? 'error' : (existing.has(o.id) ? 'update' : 'create'),
      errors,
    };
  });

  if (dryRun) {
    return res.json({
      dryRun: true,
      total: objects.length,
      create: preview.filter(p => p.action === 'create').length,
      update: preview.filter(p => p.action === 'update').length,
      errors: preview.filter(p => p.action === 'error').length,
      preview,
    });
  }

  // ── real import ──
  let created = 0, updated = 0, imagesOk = 0, imagesFail = 0;
  const results = [];
  for (let idx = 0; idx < objects.length; idx++) {
    const o = objects[idx];
    const errs = validateRow(o);
    if (errs.length) { results.push({ row: idx + 2, id: o.id, status: 'error', errors: errs }); continue; }

    const isUpdate = existing.has(o.id);
    const f = toFields(o);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      if (isUpdate) {
        const keys = Object.keys(f);
        await conn.execute(
          `UPDATE products SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`,
          [...keys.map(k => f[k]), o.id]
        );
      } else {
        const cols = ['id', ...Object.keys(f), 'images'];
        const vals = [o.id, ...Object.keys(f).map(k => f[k]), JSON.stringify([])];
        await conn.execute(
          `INSERT INTO products (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
          vals
        );
      }
      // sizes: full replace for this product
      const sizes = parseSizes(o.sizes);
      if (sizes.length) {
        await conn.execute('DELETE FROM product_sizes WHERE product_id = ?', [o.id]);
        for (const s of sizes) {
          await conn.execute('INSERT INTO product_sizes (product_id, taglia, stock) VALUES (?, ?, ?)', [o.id, s.taglia, s.stock]);
        }
      }
      await conn.commit();
      isUpdate ? updated++ : created++;
    } catch (err) {
      await conn.rollback();
      results.push({ row: idx + 2, id: o.id, status: 'error', errors: [err.code === 'ER_DUP_ENTRY' ? 'ID duplicato' : err.message] });
      conn.release();
      continue;
    }
    conn.release();

    // images (best-effort, after the product is committed)
    const urls = parseList(o.image_urls);
    if (urls.length) {
      const imgs = [];
      for (const url of urls) {
        try { imgs.push(await processAndStore(await fetchImageBuffer(url))); imagesOk++; }
        catch (_) { imagesFail++; }
      }
      if (imgs.length) {
        try {
          const [[p]] = await pool.execute('SELECT images FROM products WHERE id = ?', [o.id]);
          let cur = []; try { cur = JSON.parse(p.images) || []; } catch (_) {}
          if (!Array.isArray(cur)) cur = [];
          await pool.execute('UPDATE products SET images = ? WHERE id = ?', [JSON.stringify(cur.concat(imgs)), o.id]);
        } catch (_) { /* non-fatal */ }
      }
    }
    results.push({ row: idx + 2, id: o.id, status: isUpdate ? 'updated' : 'created' });
  }

  return res.json({
    ok: true, created, updated,
    errors: results.filter(r => r.status === 'error').length,
    imagesOk, imagesFail, results,
  });
});

/* ── GET /import/template ── (public: it's just a blank sample, no data) ── */
router.get('/import/template', (req, res) => {
  const csv =
    COLUMNS.join(',') + '\n' +
    'vestito-lino-demo,Vestito in lino Demo,vestiti,blush,Rosa cipria,89.90,,0,1,10,shop-all|vestiti,' +
    'Vestito in lino leggero dal taglio morbido.,attivo,S:5|M:8|L:3,' +
    'https://esempio.it/vestito-fronte.jpg|https://esempio.it/vestito-retro.jpg' + '\n' +
    'blazer-sartoriale-demo,Blazer Sartoriale Demo,blazer,verde,Salvia,129.00,159.00,19,0,5,shop-all|blazer,' +
    'Blazer sartoriale foderato.,attivo,S:2|M:4|L:2,https://esempio.it/blazer.jpg' + '\n';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="memi-import-template.csv"');
  res.send(csv);
});

/* ─────────────────────────────────────────────────────────────
 * POST /bulk-images  — attach product photos in bulk from ONE .zip.
 *   ?dryRun=1                preview matches only, no writes
 *   ?mode=replace|append     replace = clear a product's existing
 *                            photos first (default: append)
 *   body: multipart file "zip"
 *
 * Matching is auto-detected: a photo is attached to the product whose
 * id (slug) equals EITHER the folder it's in (vestito-lino-cannes/1.jpg)
 * OR its file name with any trailing "-1 / _2 / (3)" order suffix removed
 * (vestito-lino-cannes-1.jpg). Order within a product follows that number.
 * ───────────────────────────────────────────────────────────── */
router.post('/bulk-images', requireAdmin, zipUploadMw, async (req, res) => {
  const dryRun  = req.query.dryRun === '1' || req.query.dryRun === 'true';
  const replace = req.query.mode === 'replace';
  if (!req.file || !req.file.buffer || !req.file.buffer.length) {
    return res.status(400).json({ error: 'Nessun file ZIP ricevuto' });
  }

  let zip;
  try { zip = new AdmZip(req.file.buffer); }
  catch (e) { return res.status(400).json({ error: 'ZIP non leggibile: ' + e.message }); }

  const entries = zip.getEntries().filter(function (e) { return !e.isDirectory; });
  if (!entries.length) return res.status(400).json({ error: 'Lo ZIP è vuoto' });

  // Known product ids (slugs), lower-cased for matching.
  const [rows] = await pool.execute('SELECT id FROM products');
  const ids = new Set(rows.map(function (r) { return String(r.id).toLowerCase(); }));

  const groups = {};          // pid -> [{order, name, entry}]
  const unmatched = [];
  for (const e of entries) {
    const d = deriveTarget(e.entryName);
    if (!d) continue;         // skip non-images / junk (__MACOSX, dotfiles)
    let pid = null;
    if (d.folderSlug && ids.has(d.folderSlug)) pid = d.folderSlug;
    else if (ids.has(d.fullSlug)) pid = d.fullSlug;
    else if (ids.has(d.fileSlug)) pid = d.fileSlug;
    if (!pid) { unmatched.push({ file: e.entryName, reason: 'nessun prodotto corrispondente' }); continue; }
    (groups[pid] = groups[pid] || []).push({ order: d.order, name: d.file, entry: e });
  }

  const matched = Object.keys(groups).map(function (pid) {
    return { id: pid, count: groups[pid].length, files: groups[pid].slice().sort(byOrder).map(function (x) { return x.name; }) };
  }).sort(function (a, b) { return a.id < b.id ? -1 : 1; });
  const totalImages = entries.filter(function (e) { return deriveTarget(e.entryName); }).length;

  if (dryRun) {
    return res.json({ ok: true, dryRun: true, mode: replace ? 'replace' : 'append',
      totalImages: totalImages, matchedProducts: matched.length, matched: matched, unmatched: unmatched });
  }

  let added = 0, failed = 0;
  const results = [];
  for (const pid of Object.keys(groups)) {
    const list = groups[pid].slice().sort(byOrder);
    const [[product]] = await pool.execute('SELECT id, images FROM products WHERE id = ?', [pid]);
    if (!product) continue;
    const old = imagesArr(product.images);
    let images = replace ? [] : old.slice();
    let n = 0;
    for (const item of list) {
      try { images.push(await processAndStore(item.entry.getData())); n++; added++; }
      catch (e) { failed++; }
    }
    await pool.execute('UPDATE products SET images = ? WHERE id = ?', [JSON.stringify(images), pid]);
    if (replace) {
      const keepUrls = new Set(images.map(function (im) { return im.full; }));
      for (const im of old) {
        if (!keepUrls.has(im.full)) await deleteVariants(im);   // reference-counted (see images.js)
      }
    }
    results.push({ id: pid, added: n });
  }
  return res.json({ ok: true, mode: replace ? 'replace' : 'append',
    added: added, failed: failed, products: results.length, results: results, unmatched: unmatched });
});

module.exports = router;
