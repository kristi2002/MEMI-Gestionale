#!/usr/bin/env node
'use strict';
/*
 * cache-bust.js — automatic, content-hash cache-busting for the static storefront.
 *
 * Replaces the `?v=...` query on versioned assets with a short content hash, across every
 * .html file. The hash only changes when the file's bytes change, so you never bump `?v=N`
 * by hand again — and returning visitors always get fresh JS/CSS after a real change.
 *
 * Usage:  node scripts/cache-bust.js [rootDir]      (rootDir defaults to the storefront root)
 * Runs at build time in the Dockerfile (see the multi-stage build). Safe to run repeatedly;
 * it is deterministic and never throws (a failure logs a warning and leaves files untouched).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
// Versioned assets to hash (only those that actually exist are used).
const ASSETS = [
  'app.js', 'api-client.js', 'catalog-loader.js', 'product.js', 'shop-filters.js',
  'tokens.css', 'app.css', 'shop.css', 'product.css',
];

function sha(p) {
  try { return crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex').slice(0, 8); }
  catch (_) { return null; }
}

function walkHtml(dir, out) {
  out = out || [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return out; }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === 'scripts') continue;
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) walkHtml(fp, out);
    else if (e.name.endsWith('.html')) out.push(fp);
  }
  return out;
}

try {
  const hashes = {};
  for (const a of ASSETS) { const h = sha(path.join(ROOT, a)); if (h) hashes[a] = h; }
  if (!Object.keys(hashes).length) { console.warn('cache-bust: no assets found under ' + ROOT); process.exit(0); }

  let changed = 0;
  for (const file of walkHtml(ROOT)) {
    let html;
    try { html = fs.readFileSync(file, 'utf8'); } catch (_) { continue; }
    const before = html;
    for (const [asset, h] of Object.entries(hashes)) {
      // Match `asset` optionally followed by `?v=<anything>` and rewrite to `asset?v=<hash>`.
      const re = new RegExp(asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\?v=[^"\'\\s>]*)?', 'g');
      html = html.replace(re, asset + '?v=' + h);
    }
    if (html !== before) { try { fs.writeFileSync(file, html); changed++; } catch (_) {} }
  }
  console.log('cache-bust: ' + Object.keys(hashes).length + ' assets hashed, ' + changed + ' HTML files updated');
} catch (err) {
  console.warn('cache-bust: skipped (' + err.message + ')');
}
process.exit(0);
