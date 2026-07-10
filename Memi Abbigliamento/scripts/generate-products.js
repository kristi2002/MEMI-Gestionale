'use strict';

/**
 * Generate the static /products/<slug>/index.html files.
 *
 * These are NOT full product pages anymore — the canonical PDP is served dynamically at
 * /product?id=<slug> (single source of truth: MySQL via /api/products/:id). Each generated
 * file is a tiny **redirect stub** (noindex + canonical + refresh + location.replace) so old
 * indexed URLs keep working without duplicating catalog content or serving stale prices.
 *
 * Rewritten 2026-07-10: previously this baked full frozen PDPs from the stale productsData.js —
 * running it would have regressed the live redirect stubs back into stale duplicate pages. It now
 * reads the live catalog from the API (same source as generate-collections.js) and fails loudly
 * if the backend is unreachable (no silent stale fallback). productsData.js is no longer used.
 *
 * Override the backend with MEMI_API_BASE, e.g.
 *   MEMI_API_BASE=https://api.memi.testdemo.it/api node scripts/generate-products.js
 */

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var API_BASE = process.env.MEMI_API_BASE || 'http://localhost:3000/api';

async function fetchProducts() {
  var url = API_BASE + '/products?limit=1000';
  var res;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new Error('Impossibile contattare il backend API (' + url + '): ' + err.message);
  }
  if (!res.ok) {
    throw new Error('Il backend API ha risposto con errore ' + res.status + ' ' + res.statusText + ' (' + url + ')');
  }
  var data = await res.json();
  if (!Array.isArray(data)) {
    throw new Error('Risposta inattesa da ' + url + ': atteso un array di prodotti');
  }
  return data;
}

function redirectStub(id) {
  var target = '/product?id=' + id;
  return '<!DOCTYPE html>\n' +
  '<html lang="it">\n' +
  '<head>\n' +
  '  <meta charset="UTF-8" />\n' +
  '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n' +
  '  <title>Reindirizzamento… — Memi Abbigliamento</title>\n' +
  '  <!-- This product detail page is now served dynamically from the live API\n' +
  '       (single source of truth: MySQL via /api/products/:id). This static\n' +
  '       file only redirects to the canonical dynamic page so the old URL keeps working. -->\n' +
  '  <link rel="canonical" href="' + target + '" />\n' +
  '  <meta name="robots" content="noindex,follow" />\n' +
  '  <meta http-equiv="refresh" content="0; url=' + target + '" />\n' +
  '  <script>location.replace(' + JSON.stringify(target) + ');</script>\n' +
  '</head>\n' +
  '<body>\n' +
  '  <p style="font-family:sans-serif;padding:2rem;text-align:center;">\n' +
  '    Reindirizzamento al prodotto… Se non vieni reindirizzato,\n' +
  '    <a href="' + target + '">clicca qui</a>.\n' +
  '  </p>\n' +
  '</body>\n' +
  '</html>\n';
}

(async function main() {
  var products = await fetchProducts();
  var outDir = path.join(ROOT, 'products');
  var n = 0;
  products.forEach(function (p) {
    if (!p || !p.id) return;
    var dir = path.join(outDir, String(p.id));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), redirectStub(String(p.id)), 'utf8');
    n++;
    console.log('Generated products/' + p.id + '/index.html (redirect stub)');
  });
  console.log('Done — ' + n + ' redirect stub(s).');
})().catch(function (err) {
  console.error('generate-products failed:', err.message);
  process.exit(1);
});
