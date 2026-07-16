/**
 * scripts/export-catalog.js — Esporta il catalogo dal database LOCALE
 * in un formato pronto per l'import nell'admin ONLINE.
 *
 * Genera in ./catalog-export/:
 *   - memi-prodotti.csv       → per "Prodotti → Importa CSV" (descrizioni, prezzi, taglie…)
 *   - images/<slug>/1.webp…   → una cartella per prodotto, da zippare per
 *                               "Prodotti → Importa foto (ZIP)" (mode replace)
 *
 * Uso (con lo stack locale attivo):
 *   node scripts/export-catalog.js                          # default http://localhost:3000/api
 *   node scripts/export-catalog.js http://localhost:3000/api
 *
 * Richiede Node 18+ (usa fetch nativo). Nessuna dipendenza.
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const API    = (process.argv[2] || 'http://localhost:3000/api').replace(/\/$/, '');
const ORIGIN = API.replace(/\/api$/, '');
const OUT    = path.resolve(process.cwd(), 'catalog-export');
const IMGDIR = path.join(OUT, 'images');

// Stesse colonne accettate da POST /api/admin/products/import.
// image_urls resta VUOTO di proposito: le foto viaggiano nello ZIP
// (gli URL locali non sarebbero raggiungibili dal server online).
const COLUMNS = ['id','name','categoria','colore','color_label','price','original_price',
  'discount_pct','is_new','popularity','collections','description','status','sizes','image_urls'];

function csvField(v) {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(url + ' → HTTP ' + res.status);
  return res.json();
}

(async () => {
  console.log('API locale:  ' + API);
  console.log('Output:      ' + OUT + '\n');

  let list;
  try {
    list = await getJSON(API + '/products?status=all&limit=2000');
  } catch (e) {
    console.error('❌ Impossibile leggere i prodotti: ' + e.message);
    console.error('   Lo stack locale è attivo? (docker compose up, API su ' + ORIGIN + ')');
    process.exit(1);
  }
  if (!Array.isArray(list) || !list.length) {
    console.error('❌ Nessun prodotto trovato nel database locale.');
    process.exit(1);
  }
  console.log('Trovati ' + list.length + ' prodotti. Esporto…\n');

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(IMGDIR, { recursive: true });

  const rows = [COLUMNS.join(',')];
  let imgOk = 0, imgFail = 0;

  for (const p of list) {
    // Il dettaglio ha le taglie con stock (la lista no)
    let det;
    try { det = await getJSON(API + '/products/' + encodeURIComponent(p.id)); }
    catch (e) { console.error('  ✗ ' + p.id + ': dettaglio non leggibile (' + e.message + '), salto'); continue; }

    const sizes = (det.taglie || []).map(s => s.taglia + ':' + (s.stock || 0)).join('|');
    const collections = Array.isArray(det.collections) ? det.collections.join('|') : '';

    rows.push([
      det.id, det.name, det.categoria, det.colore || '', det.color_label || '',
      det.price, det.original_price == null ? '' : det.original_price,
      det.discount_pct || 0, det.is_new ? 1 : 0, det.popularity || 0,
      collections, det.description || '', det.status || 'attivo', sizes, ''
    ].map(csvField).join(','));

    // Scarica le foto (variante "full") in images/<slug>/N.webp
    const images = Array.isArray(det.images) ? det.images : [];
    let n = 0;
    for (const im of images) {
      const rel = typeof im === 'string' ? im : (im.full || im.card || im.thumb);
      if (!rel) continue;
      const url = /^https?:\/\//i.test(rel) ? rel : ORIGIN + rel;
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const buf = Buffer.from(await res.arrayBuffer());
        const ext = (url.match(/\.(jpe?g|png|webp|gif|avif)(\?|$)/i) || [,'webp'])[1].toLowerCase();
        const dir = path.join(IMGDIR, det.id);
        fs.mkdirSync(dir, { recursive: true });
        n++;
        fs.writeFileSync(path.join(dir, n + '.' + ext), buf);
        imgOk++;
      } catch (e) {
        imgFail++;
        console.error('  ✗ ' + det.id + ': foto non scaricata (' + url + ' — ' + e.message + ')');
      }
    }
    console.log('  ✓ ' + det.id + '  (' + n + ' foto)');
  }

  fs.writeFileSync(path.join(OUT, 'memi-prodotti.csv'), '﻿' + rows.join('\n'), 'utf8');

  console.log('\n──────────────────────────────────');
  console.log('✅ Export completato:');
  console.log('   CSV:  ' + path.join(OUT, 'memi-prodotti.csv') + '  (' + (rows.length - 1) + ' prodotti)');
  console.log('   Foto: ' + IMGDIR + '  (' + imgOk + ' scaricate' + (imgFail ? ', ' + imgFail + ' FALLITE' : '') + ')');
  console.log('\nOra crea lo ZIP delle foto, ad es. in PowerShell:');
  console.log('  Compress-Archive -Path catalog-export\\images\\* -DestinationPath catalog-export\\memi-foto.zip -Force');
  console.log('\nPoi nell\'admin ONLINE (https://admin.memi.testdemo.it):');
  console.log('  1. Prodotti → Importa CSV        → memi-prodotti.csv');
  console.log('  2. Prodotti → Importa foto (ZIP) → memi-foto.zip  (modalità: SOSTITUISCI)');
})().catch(e => { console.error('❌ Errore:', e); process.exit(1); });
