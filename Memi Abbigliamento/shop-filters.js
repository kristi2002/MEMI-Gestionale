/* ============================================================
   SHOP-FILTERS.JS — Memi Abbigliamento
   Shared client-side behaviour for every /collections/<slug>/
   page (and reusable by shop.html). Each collection page already
   ships with only the products that belong to it pre-rendered as
   real <article class="product-card"> markup (baked at build time
   by scripts/generate-collections.js) — this script just layers
   the interactive facet filtering (size / colour / price / sort),
   the right-side filter drawer, the grid density toggle and the
   scroll-in reveal on top of that static markup. No URL-param
   category gating needed here: the page is already scoped to its
   collection.
   ============================================================ */
(function () {
  'use strict';

  var filterOverlay = document.getElementById('filterOverlay');
  var openFilterBtn  = document.getElementById('openFilterBtn');
  var filterClose    = document.getElementById('filterClose');
  var filterScrim    = document.getElementById('filterScrim');

  function openFilterDrawer() {
    if (!filterOverlay) return;
    filterOverlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    if (openFilterBtn) openFilterBtn.setAttribute('aria-expanded', 'true');
  }
  function closeFilterDrawer() {
    if (!filterOverlay) return;
    filterOverlay.classList.remove('open');
    document.body.style.overflow = '';
    if (openFilterBtn) openFilterBtn.setAttribute('aria-expanded', 'false');
  }
  window.closeFilterDrawer = closeFilterDrawer;

  if (openFilterBtn) openFilterBtn.addEventListener('click', openFilterDrawer);
  if (filterClose) filterClose.addEventListener('click', closeFilterDrawer);
  if (filterScrim) filterScrim.addEventListener('click', closeFilterDrawer);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeFilterDrawer(); });

  document.querySelectorAll('.filter-section-hd').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var s = btn.closest('.filter-section');
      s.classList.toggle('collapsed');
      btn.setAttribute('aria-expanded', !s.classList.contains('collapsed'));
    });
  });

  var PRICE_MAX = 300, activeCategorie = new Set(), activeTaglie = new Set(), activeColori = new Set(), activePrezzo = PRICE_MAX;
  var X_SVG = '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  var coloreLabel = { blush: 'Rosa cipria', salvia: 'Salvia', lavanda: 'Lavanda', avorio: 'Avorio', menta: 'Menta', antico: 'Rosa antico', espresso: 'Espresso', 'avorio chiaro': 'Avorio chiaro' };
  var categoriaLabel = { vestiti: 'Vestiti', top: 'Top', blusa: 'Blusa & Camicie', pantaloni: 'Pantaloni', gonne: 'Gonne', blazer: 'Blazer', set: 'Set Coordinati', borse: 'Borse', gioielli: 'Gioielli', scarpe: 'Scarpe', cinture: 'Cinture & Bijoux' };

  function applyFilters() {
    var cards = document.querySelectorAll('#productGrid .product-card'), visible = 0;
    cards.forEach(function (card) {
      var cat = card.dataset.categoria, taglie = card.dataset.taglie ? card.dataset.taglie.split(' ') : [], colore = card.dataset.colore, prezzo = parseInt(card.dataset.prezzo, 10);
      var show = (activeCategorie.size === 0 || activeCategorie.has(cat)) &&
                 (activeTaglie.size === 0 || taglie.some(function (t) { return activeTaglie.has(t); })) &&
                 (activeColori.size === 0 || activeColori.has(colore)) &&
                 prezzo <= activePrezzo;
      card.style.display = show ? '' : 'none';
      if (show) visible++;
    });
    updateCounts(visible);
    renderChips();
    showEmptyStateIfNeeded(visible);
  }

  function showEmptyStateIfNeeded(visible) {
    var grid = document.getElementById('productGrid');
    if (!grid) return;
    var existing = grid.querySelector('.empty-collection-msg');
    if (visible === 0) {
      if (!existing) {
        var p = document.createElement('p');
        p.className = 'empty-collection-msg';
        p.textContent = 'Nessun articolo corrisponde ai filtri selezionati.';
        grid.appendChild(p);
      }
    } else if (existing) {
      existing.remove();
    }
  }

  function updateCounts(n) {
    var rc = document.getElementById('resultCount'); if (rc) rc.textContent = n;
    var fr = document.getElementById('filterResultCount'); if (fr) fr.textContent = n;
    var total = activeCategorie.size + activeTaglie.size + activeColori.size + (activePrezzo < PRICE_MAX ? 1 : 0);
    var badge = document.getElementById('filterCountBadge');
    if (badge) { badge.textContent = total; badge.style.display = total > 0 ? 'inline-flex' : 'none'; }
  }

  function renderChips() {
    var container = document.getElementById('activeFilters'); if (!container) return;
    container.innerHTML = '';
    activeCategorie.forEach(function (v) { addChip(container, categoriaLabel[v] || v, function () { activeCategorie.delete(v); uncheckCat(v); applyFilters(); }); });
    activeTaglie.forEach(function (v) { addChip(container, v.toUpperCase(), function () { activeTaglie.delete(v); uncheckSize(v); applyFilters(); }); });
    activeColori.forEach(function (v) { addChip(container, coloreLabel[v] || v, function () { activeColori.delete(v); uncheckSwatch(v); applyFilters(); }); });
    if (activePrezzo < PRICE_MAX) {
      addChip(container, 'Max €' + activePrezzo, function () {
        activePrezzo = PRICE_MAX;
        var pr = document.getElementById('priceRange');
        if (pr) { pr.value = PRICE_MAX; pr.style.background = 'linear-gradient(to right,var(--lavender) 0%,var(--lavender) 100%,var(--beige) 100%)'; document.getElementById('priceVal').textContent = '€' + PRICE_MAX; }
        applyFilters();
      });
    }
  }

  function addChip(container, label, onRemove) {
    var chip = document.createElement('span');
    chip.className = 'filter-chip';
    chip.innerHTML = label + ' <button aria-label="Rimuovi">' + X_SVG + '</button>';
    chip.querySelector('button').addEventListener('click', onRemove);
    container.appendChild(chip);
  }

  function uncheckCat(val) { document.querySelectorAll('.check-item input[data-cat]').forEach(function (cb) { if (cb.dataset.cat === val) cb.checked = false; }); }
  function uncheckSize(val) { document.querySelectorAll('#drawerSizes .size-chip-lg').forEach(function (btn) { if (btn.textContent.trim().toLowerCase() === val) btn.classList.remove('active'); }); }
  function uncheckSwatch(val) { document.querySelectorAll('#drawerSwatches .filter-swatch').forEach(function (btn) { if (btn.getAttribute('aria-label') === val) btn.classList.remove('active'); }); }

  window.toggleSizeChip = function (btn) {
    var val = btn.textContent.trim().toLowerCase();
    btn.classList.toggle('active');
    if (btn.classList.contains('active')) activeTaglie.add(val); else activeTaglie.delete(val);
    applyFilters();
  };
  window.toggleSwatch = function (btn) {
    var val = btn.getAttribute('aria-label');
    btn.classList.toggle('active');
    if (btn.classList.contains('active')) activeColori.add(val); else activeColori.delete(val);
    applyFilters();
  };

  document.querySelectorAll('.check-item input[data-cat]').forEach(function (cb) {
    cb.addEventListener('change', function () {
      if (cb.checked) activeCategorie.add(cb.dataset.cat); else activeCategorie.delete(cb.dataset.cat);
      applyFilters();
    });
  });

  var priceRange = document.getElementById('priceRange');
  if (priceRange) priceRange.addEventListener('input', function () { activePrezzo = parseInt(this.value, 10); applyFilters(); });

  var btnClearAll = document.getElementById('btnClearAll');
  if (btnClearAll) btnClearAll.addEventListener('click', function () {
    activeCategorie.clear(); activeTaglie.clear(); activeColori.clear(); activePrezzo = PRICE_MAX;
    document.querySelectorAll('.check-item input[data-cat]').forEach(function (cb) { cb.checked = false; });
    document.querySelectorAll('#drawerSizes .size-chip-lg').forEach(function (b) { b.classList.remove('active'); });
    document.querySelectorAll('#drawerSwatches .filter-swatch').forEach(function (b) { b.classList.remove('active'); });
    var pr = document.getElementById('priceRange');
    if (pr) { pr.value = PRICE_MAX; pr.style.background = 'linear-gradient(to right,var(--lavender) 0%,var(--lavender) 100%,var(--beige) 100%)'; document.getElementById('priceVal').textContent = '€' + PRICE_MAX; }
    applyFilters();
  });

  var ORIGINAL_ORDER = null;
  function sortCards(mode) {
    var grid = document.getElementById('productGrid'); if (!grid) return;
    if (!ORIGINAL_ORDER) ORIGINAL_ORDER = Array.from(grid.querySelectorAll('.product-card'));
    var cards = Array.from(grid.querySelectorAll('.product-card'));
    if (mode === 'novita') {
      ORIGINAL_ORDER.forEach(function (el) { grid.appendChild(el); });
    } else if (mode === 'piu-venduti') {
      cards.sort(function (a, b) { return (parseInt(a.dataset.popularity, 10) || 999) - (parseInt(b.dataset.popularity, 10) || 999); });
      cards.forEach(function (card) { grid.appendChild(card); });
    } else {
      cards.sort(function (a, b) {
        var pa = parseInt(a.dataset.prezzo, 10) || 0, pb = parseInt(b.dataset.prezzo, 10) || 0;
        return mode === 'prezzo-asc' ? pa - pb : pb - pa;
      });
      cards.forEach(function (card) { grid.appendChild(card); });
    }
  }
  /* Sort lives only inside the drawer now (sort + filters are one combined
     "Ordina & Filtra" control) — no separate topbar <select> to keep in sync. */
  document.querySelectorAll('input[name="sortOption"]').forEach(function (radio) {
    radio.addEventListener('change', function () { sortCards(radio.value); });
  });

  /* "Vista: 2 3 4" — plain numbered view-density links replacing the old
     icon-button grid toggle. */
  document.querySelectorAll('.view-toggle-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var cols = btn.dataset.cols;
      var grid = document.getElementById('productGrid');
      if (!grid) return;
      grid.classList.remove('view-2col', 'view-3col', 'view-4col');
      grid.classList.add('view-' + cols + 'col');
      document.querySelectorAll('.view-toggle-btn').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
    });
  });

  /* Initial count + scroll-in stagger reveal */
  (function () {
    var all = document.querySelectorAll('#productGrid .product-card');
    updateCounts(all.length);
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in-view'); io.unobserve(e.target); } });
    }, { threshold: .08 });
    all.forEach(function (card, i) { card.style.setProperty('--i', i % 4); io.observe(card); });
  })();
})();
