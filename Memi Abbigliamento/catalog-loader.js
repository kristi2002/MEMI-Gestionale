/* ============================================================
   CATALOG-LOADER.JS — Memi Abbigliamento
   ------------------------------------------------------------
   Shared, API-driven product loader for every "collection-style"
   storefront surface:
     • /collections/<slug>/index.html   (15 pages)
     • /estate-2025.html                (collection = estate-2025)
     • /best-seller.html                (top products by popularity)

   It replaces the previously hard-coded product cards + frozen
   counts with REAL data fetched live from GET /api/products, so
   the MySQL database (driven by the admin panel) is the single
   source of truth. Nothing about the catalog is baked into HTML.

   How a page opts in:
     <script>window.MEMI_CATALOG = { collection: 'blazer' };</script>
     <script src="/catalog-loader.js?v=1"></script>
   For best-seller:
     <script>window.MEMI_CATALOG = { mode: 'best-seller', limit: 12 };</script>
   If no config is given it falls back to parsing the slug from a
   /collections/<slug>/ URL.

   It also publishes window.PRODUCTS (mapped from the API) so any
   legacy client code that still reads it can never drift from the DB.
   ============================================================ */
(function () {
  'use strict';

  var ACCESSORI_CATS = ['borse', 'gioielli', 'scarpe', 'cinture', 'accessori'];
  var WISHLIST_ICON  = '<svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';

  /* ── Config resolution ─────────────────────────────────── */
  function resolveConfig() {
    var cfg = window.MEMI_CATALOG || {};
    if (!cfg.collection && cfg.mode !== 'best-seller') {
      // Fallback: /collections/<slug>/...  → slug
      var m = location.pathname.match(/\/collections\/([^\/]+)/);
      if (m) cfg.collection = decodeURIComponent(m[1]);
    }
    return cfg;
  }

  /* ── Helpers ───────────────────────────────────────────── */
  function fmtPrice(n) { return '€' + parseFloat(n).toFixed(2).replace('.', ','); }

  function pickImg(x, size) {
    return !x ? null : (typeof x === 'string' ? x : (x[size] || x.card || x.full || x.thumb));
  }

  // Consistent, honest placeholder for products that have no uploaded image
  // (no misleading stock photos). Shared visual with the PDP and shop.
  var NO_IMAGE = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800"><rect width="600" height="800" fill="#f1ece6"/><rect x="225" y="300" width="150" height="120" rx="10" fill="none" stroke="#cbb9a8" stroke-width="6"/><circle cx="268" cy="338" r="13" fill="none" stroke="#cbb9a8" stroke-width="6"/><path d="M232 414 L300 358 L338 392 L368 366 L368 418 Z" fill="#cbb9a8"/><text x="300" y="476" text-anchor="middle" font-family="DM Sans, sans-serif" font-size="26" fill="#a8978a">Nessuna immagine</text></svg>');
  function imgFallback(seed) {
    return NO_IMAGE;
  }

  function buildCard(p, idx, opts) {
    opts = opts || {};
    var slug      = p.id; // product id IS the slug
    var href      = '/product?id=' + encodeURIComponent(slug);
    var taglie    = Array.isArray(p.taglie) ? p.taglie : [];
    var taglieStr = taglie.map(function (t) { return String(t).toLowerCase(); }).join(' ') || 'unica';
    var isAcc     = ACCESSORI_CATS.indexOf(p.categoria) !== -1;
    var isOos     = p.status === 'esaurito';

    var badges = '';
    if (opts.rank) {
      var medal = opts.rank === 1 ? 'gold' : (opts.rank === 2 ? 'silver' : 'bronze');
      badges += '<div class="rank-badge ' + medal + '">' + opts.rank + '</div>';
    }
    var flagBadges = '';
    if (isOos) {
      flagBadges += '<span class="badge" style="background:#9b2c2c;color:#fff;">Esaurito</span>';
    } else {
      if (p.is_new)       flagBadges += '<span class="badge badge-new">New</span>';
      if (p.discount_pct) flagBadges += '<span class="badge badge-sale">−' + p.discount_pct + '%</span>';
    }

    var chips = '';
    if (taglie.length) {
      chips = taglie.map(function (t) {
        return '<button class="size-chip' + (isOos ? ' oos' : '') + '">' + String(t).toUpperCase() + '</button>';
      }).join('');
    } else {
      chips = '<button class="size-chip' + (isOos ? ' oos' : '') + '">Unica</button>';
    }

    var imgs = Array.isArray(p.images) && p.images.length ? p.images : [];
    var img1 = pickImg(imgs[0], 'card') || imgFallback(idx);
    var img2 = pickImg(imgs[1], 'card') || pickImg(imgs[0], 'card') || imgFallback(idx + 1);

    var pricingHtml = '<span class="price-current">' + fmtPrice(p.price) + '</span>';
    if (p.original_price && p.discount_pct) {
      pricingHtml += '<span class="price-original">' + fmtPrice(p.original_price) + '</span>';
      pricingHtml += '<span class="price-discount">−' + p.discount_pct + '%</span>';
    }

    var dataAcc = isAcc ? ' data-is-accessori="1"' : '';
    return '<a class="product-card-link" href="' + href + '">' +
      '<article class="product-card in-view"' +
        ' data-categoria="' + (p.categoria || '') + '"' +
        ' data-cat="' + (p.categoria || '') + '"' +
        ' data-taglie="' + taglieStr + '"' +
        ' data-colore="' + (p.colore || '') + '"' +
        ' data-prezzo="' + (p.price || 0) + '"' +
        ' data-popularity="' + (p.popularity || 999) + '"' +
        ' style="--i:' + (idx % 4) + '"' +
        dataAcc + '>' +
        '<div class="product-img-wrap">' +
          '<img class="product-img-main" src="' + img1 + '" alt="' + esc(p.name) + '" loading="lazy">' +
          '<img class="product-img-alt" src="' + img2 + '" alt="' + esc(p.name) + ' alt" loading="lazy">' +
          badges +
          (flagBadges ? '<div class="product-badges">' + flagBadges + '</div>' : '') +
          '<button class="product-wishlist" aria-label="Wishlist" onclick="event.preventDefault();event.stopPropagation();">' + WISHLIST_ICON + '</button>' +
          '<div class="product-quick-add" onclick="event.preventDefault();"><div class="size-chips">' + chips + '</div></div>' +
        '</div>' +
        '<div class="product-info">' +
          '<p class="product-name">' + esc(p.name) + '</p>' +
          '<p class="product-color">' + esc(p.color_label || '') + '</p>' +
          '<div class="product-pricing">' + pricingHtml + '</div>' +
        '</div>' +
      '</article>' +
    '</a>';
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ── Count + grid helpers ──────────────────────────────── */
  function setCounts(n) {
    ['resultCount', 'filterResultCount'].forEach(function (id) {
      var el = document.getElementById(id); if (el) el.textContent = n;
    });
    document.querySelectorAll('[data-result-count]').forEach(function (el) { el.textContent = n; });
  }

  function pickGrid(cfg) {
    if (cfg.grid) { var g = document.querySelector(cfg.grid); if (g) return g; }
    return document.getElementById('productGrid')
        || document.getElementById('collGrid')
        || document.querySelector('.bs-rest .product-grid')
        || document.querySelector('.product-grid');
  }

  function emptyState(grid, msg) {
    if (grid) grid.innerHTML =
      '<div style="grid-column:1/-1;text-align:center;padding:3rem 1rem;color:var(--brown-light);font-size:.88rem;">' +
      esc(msg) + '</div>';
  }

  /* ── Main ──────────────────────────────────────────────── */
  function init() {
    var cfg  = resolveConfig();
    var grid = pickGrid(cfg);
    if (!grid) return;

    var url = '/api/products?limit=' + (cfg.limit ? Math.max(cfg.limit, 100) : 200);
    if (cfg.collection) url += '&collection=' + encodeURIComponent(cfg.collection);

    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (res) {
        var products = Array.isArray(res) ? res : (res && res.products) || [];

        // best-seller: API already sorts by popularity DESC; just cap the list.
        if (cfg.mode === 'best-seller' && cfg.limit) products = products.slice(0, cfg.limit);

        // Publish for any legacy reader (search/cart/wishlist) so it can't drift.
        try {
          window.PRODUCTS = products.map(function (p) {
            return {
              id: p.id, name: p.name, categoria: p.categoria, taglie: p.taglie || [],
              colore: p.colore, colorLabel: p.color_label, price: p.price,
              originalPrice: p.original_price, discountPct: p.discount_pct,
              isNew: !!p.is_new, images: p.images || [], collections: p.collections || []
            };
          });
        } catch (_) {}

        if (!products.length) {
          emptyState(grid, 'Nessun prodotto disponibile in questa collezione.');
          setCounts(0);
          return;
        }

        // Optional "Top 3" featured strip (best-seller hero).
        var top3 = document.querySelector('.bs-top3');
        var restProducts = products;
        if (top3) {
          var top = products.slice(0, 3);
          restProducts = products.slice(3);
          top3.innerHTML = top.map(function (p, i) { return buildCard(p, i, { rank: i + 1 }); }).join('');
        }

        grid.innerHTML = restProducts.map(function (p, i) { return buildCard(p, i); }).join('');
        setCounts(products.length);

        // Re-run the filter engine's hooks if present (collections pages).
        if (typeof window.applyFilters === 'function') window.applyFilters();
      })
      .catch(function () {
        emptyState(grid, 'Impossibile caricare i prodotti. Ricarica la pagina.');
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 0); });
  } else {
    setTimeout(init, 0);
  }
})();
