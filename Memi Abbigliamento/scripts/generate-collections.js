'use strict';
var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');

// Live catalog now lives in MySQL, served via the backend API — no more reading
// the stale local productsData.js. Override the base URL with MEMI_API_BASE to
// point this at a deployed backend (e.g. MEMI_API_BASE=https://api.memi.testdemo.it/api).
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

// The API returns DB column shapes (snake_case, DECIMAL-as-string, collections
// already parsed to an array). Normalize to the shape the renderers below expect
// (the same shape the old productsData.js used).
function normalizeProduct(r) {
  return {
    id: r.id,
    name: r.name,
    categoria: r.categoria,
    colore: r.colore,
    colorLabel: r.color_label,
    price: Number(r.price),
    originalPrice: r.original_price != null ? Number(r.original_price) : null,
    discountPct: r.discount_pct != null ? Number(r.discount_pct) : 0,
    isNew: !!r.is_new,
    icon: r.icon,
    altColor: r.alt_color,
    popularity: r.popularity != null ? Number(r.popularity) : 0,
    collections: Array.isArray(r.collections) ? r.collections : [],
    taglie: Array.isArray(r.taglie) ? r.taglie.map(function (t) { return typeof t === 'string' ? t : t.taglia; }) : [],
  };
}

var BG_DEFAULT = 'https://images.unsplash.com/photo-1558769132-cb1aea458c5e?auto=format&fit=crop&w=1920&q=85';
var BG = {
  vestiti:   'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1920&q=85',
  gonne:     'https://images.unsplash.com/photo-1583496661160-fb5218f5a9c4?auto=format&fit=crop&w=1920&q=85',
  top:       'https://images.unsplash.com/photo-1596783074918-c84cb06531ca?auto=format&fit=crop&w=1920&q=85',
  blusa:     'https://images.unsplash.com/photo-1551803091-e20673f15770?auto=format&fit=crop&w=1920&q=85',
  pantaloni: 'https://images.unsplash.com/photo-1594938298603-c8148c4b5a3a?auto=format&fit=crop&w=1920&q=85',
  blazer:    'https://images.unsplash.com/photo-1591369822096-ffd140ec948f?auto=format&fit=crop&w=1920&q=85',
  set:       'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=1920&q=85'
};

var COLLECTIONS = [
  { slug: 'shop-all',    label: 'Tutti i Capi',      heroTitleHTML: 'Tutto <em>il Catalogo</em>',     eyebrow: 'Collezione Estate 2025',  heroType: 'editorial', bg: BG_DEFAULT, includeCategoryFilter: true },
  { slug: 'novita',      label: 'Novità',            heroType: 'novita', includeCategoryFilter: true },
  { slug: 'vestiti',     label: 'Vestiti',            heroTitleHTML: 'I nostri <em>Vestiti</em>',      eyebrow: 'Abbigliamento', heroType: 'editorial', bg: BG.vestiti },
  { slug: 'top',         label: 'Top',                heroTitleHTML: 'I nostri <em>Top</em>',          eyebrow: 'Abbigliamento', heroType: 'editorial', bg: BG.top },
  { slug: 'blusa',       label: 'Blusa & Camicie',    heroTitleHTML: 'Blusa <em>&amp; Camicie</em>',   eyebrow: 'Abbigliamento', heroType: 'editorial', bg: BG.blusa },
  { slug: 'pantaloni',   label: 'Pantaloni',          heroTitleHTML: 'I nostri <em>Pantaloni</em>',    eyebrow: 'Abbigliamento', heroType: 'editorial', bg: BG.pantaloni },
  { slug: 'gonne',       label: 'Gonne',              heroTitleHTML: 'Le nostre <em>Gonne</em>',       eyebrow: 'Abbigliamento', heroType: 'editorial', bg: BG.gonne },
  { slug: 'blazer',      label: 'Blazer',             heroTitleHTML: 'Blazer <em>&amp; Giacche</em>',  eyebrow: 'Abbigliamento', heroType: 'editorial', bg: BG.blazer },
  { slug: 'set',         label: 'Set Coordinati',     heroTitleHTML: 'Set <em>Coordinati</em>',        eyebrow: 'Coordinati',    heroType: 'editorial', bg: BG.set },
  { slug: 'accessori',   label: 'Accessori',          heroType: 'accessori', includeCategoryFilter: true },
  { slug: 'borse',       label: 'Borse',              heroTitleHTML: 'Le nostre <em>Borse</em>',       eyebrow: 'Accessori', heroType: 'editorial', bg: BG_DEFAULT },
  { slug: 'gioielli',    label: 'Gioielli',           heroTitleHTML: 'I nostri <em>Gioielli</em>',     eyebrow: 'Accessori', heroType: 'editorial', bg: BG_DEFAULT },
  { slug: 'scarpe',      label: 'Scarpe',             heroTitleHTML: 'Le nostre <em>Scarpe</em>',      eyebrow: 'Accessori', heroType: 'editorial', bg: BG_DEFAULT },  { slug: 'saldi',       label: 'Saldi',              heroType: 'saldi', includeCategoryFilter: true },
  { slug: 'estate-2025', label: 'Estate 2025',        heroTitleHTML: 'Estate <em>2025</em>',           eyebrow: 'Collezione in evidenza', heroType: 'editorial', bg: BG_DEFAULT, includeCategoryFilter: true }
];

var ICONS = {
  dress: '<ellipse cx="60" cy="38" rx="20" ry="22" fill="white" opacity=".45"/><path d="M18 200 C18 140 102 140 102 200" fill="white" opacity=".45"/><rect x="28" y="62" width="64" height="86" rx="10" fill="white" opacity=".45"/>',
  bag:   '<path d="M42 72 Q42 42 60 42 Q78 42 78 72" stroke="white" stroke-width="6" opacity=".45"/><rect x="26" y="72" width="68" height="78" rx="10" fill="white" opacity=".45"/>',
  ring:  '<circle cx="60" cy="115" r="32" stroke="white" stroke-width="7" opacity=".45"/><polygon points="60,68 73,90 47,90" fill="white" opacity=".45"/>',
  shoe:  '<path d="M18 142 Q18 112 48 107 L74 96 Q96 90 101 110 L101 142 Q101 152 91 152 L23 152 Q18 152 18 142 Z" fill="white" opacity=".45"/>',
  belt:  '<rect x="14" y="100" width="92" height="16" rx="4" fill="white" opacity=".45"/><rect x="47" y="88" width="26" height="40" rx="4" stroke="white" stroke-width="5" opacity=".45"/>'
};

var CATEGORIA_LABEL = { vestiti: 'Vestiti', top: 'Top', blusa: 'Blusa & Camicie', pantaloni: 'Pantaloni', gonne: 'Gonne', blazer: 'Blazer', set: 'Set Coordinati', borse: 'Borse', gioielli: 'Gioielli', scarpe: 'Scarpe' };
var CATEGORIA_COUNT_ORDER = ['vestiti', 'top', 'blusa', 'pantaloni', 'gonne', 'blazer', 'set', 'borse', 'gioielli', 'scarpe'];

var WISHLIST_SVG = '<svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';

function escapeAttr(s) { return String(s).replace(/"/g, '&quot;'); }

function renderSizeChip(t) {
  var label = t === 'unica' ? 'Unica' : t.toUpperCase();
  return '<button class="size-chip">' + label + '</button>';
}

function renderCard(p) {
  var badges = '';
  if (p.isNew) badges += '<span class="badge badge-new">New</span>';
  if (p.discountPct) badges += '<span class="badge badge-sale">−' + p.discountPct + '%</span>';
  var badgesHtml = badges ? '<div class="product-badges">' + badges + '</div>' : '';

  var pricing = '<span class="price-current">€' + p.price.toFixed(2).replace('.', ',') + '</span>';
  if (p.originalPrice) {
    pricing += '<span class="price-original">€' + p.originalPrice.toFixed(2).replace('.', ',') + '</span>' +
               '<span class="price-discount">−' + p.discountPct + '%</span>';
  }

  var icon = ICONS[p.icon] || ICONS.dress;
  var sizeChips = p.taglie.map(renderSizeChip).join('');

  var slug = p.id;
  return '<a class="product-card-link" href="../../products/' + slug + '/index.html"><article class="product-card" data-categoria="' + p.categoria + '" data-taglie="' + escapeAttr(p.taglie.join(' ')) + '" data-colore="' + p.colore + '" data-prezzo="' + p.price + '" data-popularity="' + (p.popularity || 999) + '">' +
    '<div class="product-img-wrap">' +
      '<div class="product-img-main ph-fig ph-flat ph-shimmer"><svg viewBox="0 0 120 200" fill="none" class="fig-svg">' + icon + '</svg></div>' +
      '<div class="product-img-alt ph-fig ' + p.altColor + '"><svg viewBox="0 0 120 200" fill="none" class="fig-svg">' + icon + '</svg></div>' +
      badgesHtml +
      '<button class="product-wishlist" aria-label="Wishlist" onclick="event.preventDefault();event.stopPropagation();">' + WISHLIST_SVG + '</button>' +
      '<div class="product-quick-add" onclick="event.preventDefault();"><div class="size-chips">' + sizeChips + '</div></div>' +
    '</div>' +
    '<div class="product-info">' +
      '<p class="product-name">' + p.name + '</p>' +
      '<p class="product-color">' + p.colorLabel + '</p>' +
      '<div class="product-pricing">' + pricing + '</div>' +
    '</div>' +
  '</article></a>';
}

function renderHero(meta) {
  if (meta.heroType === 'novita') {
    return '<section class="shop-hero hero--novita" id="shopHero">' +
      '<video class="hero-video-bg" autoplay muted loop playsinline poster="https://images.unsplash.com/photo-1469334031218-e382a71b716b?auto=format&fit=crop&w=1920&q=85"><source src="https://videos.pexels.com/video-files/3209211/3209211-hd_1920_1080_24fps.mp4" type="video/mp4"></video>' +
      '<div class="hero-video-overlay"></div>' +
      '<div class="hero-novita-inner">' +
        '<div class="novita-drop-badge">Drop 23 ✦ Estate 2025</div>' +
        '<h1 class="page-hero-title">Novità</h1>' +
        '<p class="page-hero-sub">I pezzi più desiderati della stagione, appena arrivati.</p>' +
        '<a href="#productGrid" class="novita-scroll-hint"><span>Scopri la collezione</span><svg viewBox="0 0 24 24" fill="none"><polyline points="6 9 12 15 18 9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></a>' +
      '</div>' +
    '</section>';
  }
  if (meta.heroType === 'saldi') {
    return '<section class="shop-hero hero--saldi" id="shopHero">' +
      '<div class="hero-saldi-text"><p class="saldi-eyebrow">Fino al</p><div class="saldi-pct">&#8722;30<span>%</span></div><h1 class="page-hero-title">I <em>Saldi</em></h1><p class="page-hero-sub">Selezionati. Limitati. Solo per te.</p></div>' +
      '<div class="hero-saldi-img"><img src="https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=960&q=85" alt="" /></div>' +
    '</section>';
  }
  if (meta.heroType === 'accessori') {
    return '<section class="shop-hero hero--accessori" id="shopHero">' +
      '<div class="hero-accessori-img"><img src="https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=960&q=85" alt="" /></div>' +
      '<div class="hero-accessori-text"><span class="page-hero-eyebrow">Collezione accessori</span><h1 class="page-hero-title">I nostri<br><em>Accessori</em></h1><p class="page-hero-sub">Dettagli che fanno la differenza. Selezionati per esaltare ogni look.</p></div>' +
    '</section>';
  }
  return '<section class="shop-hero hero--editorial" id="shopHero">' +
    '<img class="editorial-hero-bg" src="' + meta.bg + '" alt="" loading="eager" />' +
    '<div class="editorial-hero-overlay"></div>' +
    '<div class="editorial-hero-content">' +
      '<span class="page-hero-eyebrow">' + meta.eyebrow + '</span>' +
      '<h1 class="page-hero-title">' + meta.heroTitleHTML + '</h1>' +
      '<p class="page-hero-sub">Articoli selezionati con cura per il tuo stile.</p>' +
    '</div>' +
  '</section>';
}

function renderCategoryFilterSection(productsInCollection) {
  var counts = {};
  productsInCollection.forEach(function (p) { counts[p.categoria] = (counts[p.categoria] || 0) + 1; });
  var items = CATEGORIA_COUNT_ORDER.filter(function (c) { return counts[c]; }).map(function (c, i) {
    return '<label class="check-item"><input type="checkbox" id="cat' + (i + 1) + '" data-cat="' + c + '"/><span>' + CATEGORIA_LABEL[c] + ' <span class="check-count">(' + counts[c] + ')</span></span></label>';
  }).join('');
  if (!items) return '';
  return '<div class="filter-section"><button class="filter-section-hd" aria-expanded="true">Categoria<svg class="filter-chevron" viewBox="0 0 10 6"><polyline points="1 1 5 5 9 1" stroke-linecap="round" stroke-linejoin="round"/></svg></button><div class="filter-section-bd"><div class="check-list">' + items + '</div></div></div>';
}

function renderFilterPanel(productsInCollection, includeCategoryFilter) {
  var categorySection = includeCategoryFilter ? renderCategoryFilterSection(productsInCollection) : '';
  return '<div class="filter-overlay" id="filterOverlay" role="dialog" aria-modal="true" aria-label="Filtri e ordina">' +
    '<div class="filter-scrim" id="filterScrim"></div>' +
    '<aside class="filter-panel" id="filterPanel">' +
      '<div class="filter-panel-head"><h2 class="filter-panel-title">Ordina &amp; Filtra</h2><button class="filter-panel-close" id="filterClose" aria-label="Chiudi filtri"><svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>' +
      '<div class="filter-panel-body">' +
        '<div class="filter-section"><button class="filter-section-hd" aria-expanded="true">Ordina per<svg class="filter-chevron" viewBox="0 0 10 6"><polyline points="1 1 5 5 9 1" stroke-linecap="round" stroke-linejoin="round"/></svg></button><div class="filter-section-bd"><div class="sort-radio-group"><label class="sort-radio-item"><input type="radio" name="sortOption" value="novita" checked /> Novità</label><label class="sort-radio-item"><input type="radio" name="sortOption" value="prezzo-asc" /> Prezzo: basso → alto</label><label class="sort-radio-item"><input type="radio" name="sortOption" value="prezzo-desc" /> Prezzo: alto → basso</label><label class="sort-radio-item"><input type="radio" name="sortOption" value="piu-venduti" /> Più venduti</label></div></div></div>' +
        categorySection +
        '<div class="filter-section"><button class="filter-section-hd" aria-expanded="true">Taglia<svg class="filter-chevron" viewBox="0 0 10 6"><polyline points="1 1 5 5 9 1" stroke-linecap="round" stroke-linejoin="round"/></svg></button><div class="filter-section-bd"><div class="size-chip-grid" id="drawerSizes"><button class="size-chip-lg" onclick="toggleSizeChip(this)">XS</button><button class="size-chip-lg" onclick="toggleSizeChip(this)">S</button><button class="size-chip-lg" onclick="toggleSizeChip(this)">M</button><button class="size-chip-lg" onclick="toggleSizeChip(this)">L</button><button class="size-chip-lg" onclick="toggleSizeChip(this)">XL</button></div></div></div>' +
        '<div class="filter-section"><button class="filter-section-hd" aria-expanded="true">Colore<svg class="filter-chevron" viewBox="0 0 10 6"><polyline points="1 1 5 5 9 1" stroke-linecap="round" stroke-linejoin="round"/></svg></button><div class="filter-section-bd"><div class="swatch-grid" id="drawerSwatches"><button class="filter-swatch" style="background:#F2C4BD;" aria-label="blush" onclick="toggleSwatch(this)"></button><button class="filter-swatch" style="background:#C4D4C0;" aria-label="salvia" onclick="toggleSwatch(this)"></button><button class="filter-swatch" style="background:#D6CEEA;" aria-label="lavanda" onclick="toggleSwatch(this)"></button><button class="filter-swatch" style="background:#E8DDD0;" aria-label="avorio" onclick="toggleSwatch(this)"></button><button class="filter-swatch" style="background:#3B2B2B;" aria-label="espresso" onclick="toggleSwatch(this)"></button><button class="filter-swatch" style="background:#d4a5a0;" aria-label="antico" onclick="toggleSwatch(this)"></button><button class="filter-swatch" style="background:#b5ceb5;" aria-label="menta" onclick="toggleSwatch(this)"></button></div></div></div>' +
        '<div class="filter-section"><button class="filter-section-hd" aria-expanded="true">Prezzo massimo<svg class="filter-chevron" viewBox="0 0 10 6"><polyline points="1 1 5 5 9 1" stroke-linecap="round" stroke-linejoin="round"/></svg></button><div class="filter-section-bd"><div class="price-range"><div class="price-labels"><span>€0</span><span id="priceVal">€300</span><span>€300</span></div><input type="range" min="0" max="300" value="300" id="priceRange" oninput="document.getElementById(&#39;priceVal&#39;).textContent=&#39;€&#39;+this.value;this.style.background=&#39;linear-gradient(to right,#B5646A 0%,#B5646A &#39;+Math.round(this.value/3)+&#39;%,var(--beige) &#39;+Math.round(this.value/3)+&#39;%)&#39;;" /></div></div></div>' +
      '</div>' +
      '<div class="filter-panel-foot"><button class="btn-clear-filters" id="btnClearAll">Cancella tutto</button><button class="btn-show-results" onclick="closeFilterDrawer()">Mostra <strong id="filterResultCount">' + productsInCollection.length + '</strong> articoli</button></div>' +
    '</aside>' +
  '</div>';
}

function renderPage(meta, productsInCollection) {
  var cardsHtml = productsInCollection.length
    ? productsInCollection.map(renderCard).join('\n      ')
    : '<p class="empty-collection-msg">Nessun articolo in questa collezione per il momento.</p>';

  return '<!DOCTYPE html>\n' +
'<html lang="it">\n' +
'<head>\n' +
'  <meta charset="UTF-8" />\n' +
'  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n' +
'  <title>' + meta.label + ' — Memi Abbigliamento</title>\n' +
'  <meta name="description" content="Scopri la collezione ' + meta.label + ' di Memi Abbigliamento: capi e accessori pastello selezionati con cura." />\n' +
'  <link rel="canonical" href="https://memi.testdemo.it/collections/' + meta.slug + '/" />\n' +
'  <link rel="preconnect" href="https://fonts.googleapis.com" />\n' +
'  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />\n' +
'  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400;1,500&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet" />\n' +
'  <link rel="icon" href="data:,">\n' +
'  <link rel="stylesheet" href="../../tokens.css" />\n' +
'  <link rel="stylesheet" href="../../shop.css" />\n' +
'  <link rel="stylesheet" href="../../app.css" />\n' +
'</head>\n' +
'<body>\n\n' +
'<div class="announcement-bar">✦ &nbsp;Spedizione gratuita su ordini superiori a €100 &nbsp;✦&nbsp; Reso gratuito entro 30 giorni &nbsp;✦</div>\n' +
'<div data-include="site-header"></div>\n\n' +
renderHero(meta) + '\n\n' +
'<div class="marquee-strip" aria-hidden="true"><div class="marquee-track"><span class="marquee-item">Novità Ogni Settimana</span><span class="marquee-item accent">✦</span><span class="marquee-item">Spedizione Gratuita</span><span class="marquee-item accent">✦</span><span class="marquee-item">Made in Italy</span><span class="marquee-item accent">✦</span><span class="marquee-item">Reso Gratuito 30 Giorni</span><span class="marquee-item accent">✦</span><span class="marquee-item">Estate 2025</span><span class="marquee-item accent">✦</span></div></div>\n\n' +
renderFilterPanel(productsInCollection, !!meta.includeCategoryFilter) + '\n\n' +
'<div class="shop-layout">\n' +
'  <main class="shop-main">\n' +
'    <div class="shop-topbar">\n' +
'      <p class="results-count"><strong id="resultCount">' + productsInCollection.length + '</strong> articoli</p>\n' +
'      <div class="topbar-right">\n' +
'        <div class="view-toggle" aria-label="Numero di colonne"><span class="view-toggle-label">Vista:</span><button class="view-toggle-btn" data-cols="2">2</button><button class="view-toggle-btn" data-cols="3">3</button><button class="view-toggle-btn active" data-cols="4">4</button></div>\n' +
'        <button class="btn-filter-toggle" id="openFilterBtn" aria-expanded="false" aria-controls="filterPanel">Ordina &amp; Filtra<span class="filter-count-badge" id="filterCountBadge" style="display:none;">0</span></button>\n' +
'      </div>\n' +
'    </div>\n' +
'    <div class="active-filters" id="activeFilters"></div>\n' +
'    <div class="product-grid view-4col" id="productGrid">\n      ' + cardsHtml + '\n    </div>\n' +
'  </main>\n' +
'</div>\n\n' +
// Cards are rendered at RUNTIME by catalog-loader.js (GET /api/products?collection=<slug>),
// not pre-baked into this static shell — must match the pattern already live on
// collections/<slug>/index.html, or regenerating a page would silently break it (no
// catalog-loader.js -> empty product grid forever). Keep the app.js?v= in sync with
// CLAUDE.md's current cache-bust version when that changes.
'<script src="../../app.js?v=35"></script>\n' +
'<script src="../../shop-filters.js"></script>\n' +
'<script>window.MEMI_CATALOG={collection:\'' + meta.slug + '\'};</script>\n' +
'<script src="../../catalog-loader.js?v=3"></script>\n' +
'</body>\n' +
'</html>\n';
}

async function main() {
  var rawProducts;
  try {
    rawProducts = await fetchProducts();
  } catch (err) {
    console.error('ERRORE: impossibile recuperare il catalogo dal backend API.');
    console.error(err.message);
    console.error('Verifica che il backend sia in esecuzione e raggiungibile su ' + API_BASE + ' (override con la variabile MEMI_API_BASE).');
    process.exit(1);
  }

  var PRODUCTS = rawProducts.map(normalizeProduct);

  var outDir = path.join(ROOT, 'collections');
  COLLECTIONS.forEach(function (meta) {
    var matches = PRODUCTS.filter(function (p) { return p.collections.indexOf(meta.slug) >= 0; });
    matches.sort(function (a, b) { return (a.popularity || 999) - (b.popularity || 999); });
    var html = renderPage(meta, matches);
    var dir = path.join(outDir, meta.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8');
    console.log('Generated collections/' + meta.slug + '/index.html (' + matches.length + ' products)');
  });
}

main().catch(function (err) {
  console.error('ERRORE inatteso durante la generazione delle collezioni.');
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
