/* ============================================================
   APP.JS — Memi Abbigliamento
   Shared interactive layer. Include at the end of <body>
   Handles: Cart · Wishlist · Search · Mobile nav · Toasts
   ============================================================ */

(function () {
  'use strict';

  /* ── 0. SHARED NAV MODEL ────────────────────────────────── */
  /* Single source of truth for primary navigation. Desktop header
     and mobile drawer both render from this list, so they can never
     drift out of sync again (desktop previously hard-coded a 4-link
     subset per page; mobile drawer hard-coded a 7-link version with
     "Home" added — now mobile = ['Home', ...NAV_ITEMS]). */

  /* Every page now links to a real, crawlable, pre-rendered route at
     /collections/<slug>/index (baked by scripts/generate-collections.js
     from productsData.js) instead of shop?categoria=... query strings.
     Pages can live at the site root (index, shop, about, ...)
     OR two levels deep inside collections/<slug>/ — ROOT below resolves the
     correct relative prefix either way, with no leading-slash assumptions,
     so links keep working whether the site is opened via a static server
     or directly via file://. */
  function collectionsRoot() {
    return '';  // all links are now absolute paths
  }
  function currentCollectionSlug() {
    const m = window.location.pathname.match(/\/collections\/([^/]+)\/?/);
    return m ? m[1] : null;
  }

  const NAV_ITEMS = [
    { collection: 'novita',    label: 'Novità' },
    { collection: 'shop-all',  label: 'Abbigliamento' },
    { collection: 'accessori', label: 'Accessori' },
    { collection: 'saldi',     label: 'Saldi' },
    { href: 'look',        label: 'Shop the Look' },
    { href: 'editoriali/primavera-estate-2026/', label: 'Editoriali' },
    { href: 'about',       label: 'Chi Siamo' },
  ];

  function currentHrefKey() {
    const page = window.location.pathname.split('/').pop() || '/';
    return page + window.location.search;
  }

  function injectHeader() {
    const hosts = document.querySelectorAll('[data-include="site-header"]');
    if (!hosts.length) return;
    const cur = currentHrefKey();
    const ROOT = collectionsRoot();
    const curSlug = currentCollectionSlug();

    // Helper: active class for direct (non-collection) links
    function ac(href) { return cur === href ? ' class="active"' : ''; }
    // Helper: active class for a /collections/<slug>/ link
    function cc(slug) { return curSlug === slug ? ' class="active"' : ''; }
    // Active for any shop/collection page
    const shopActive = cur.startsWith('shop') ? ' mega-label--active' : '';
    const aboutActive = cur.startsWith('about') ? ' mega-label--active' : '';
    const editorialiActive = cur.startsWith('editoriali') ? ' mega-label--active' : '';

    // LEFT group — Novità, Saldi + Shop mega-trigger (sits left of the centered
    // logo; Saldi moved here from the right side so the right side — which
    // also carries Look, the Chi Siamo dropdown, and the icon cluster — isn't
    // heavier than the left, keeping Memi. visually centered)
    const desktopNavLeft =
      '<nav class="desktop-nav desktop-nav-left" aria-label="Navigazione principale">' +
        '<a href="/shop?categoria=novita"' + ac('shop?categoria=novita') + '>Novità</a>' +
        '<a href="/shop?saldi=1" class="nav-saldi' + (cur === 'shop?saldi=1' ? ' active' : '') + '">Saldi</a>' +
        '<div class="mega-trigger" data-mega="shop">' +
          '<span class="mega-label' + shopActive + '">' +
            'Shop' +
            '<svg class="mega-arrow" viewBox="0 0 10 6" fill="none"><polyline points="1 1 5 5 9 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>' +
          '</span>' +
          '<div class="mega-panel" role="navigation" aria-label="Categorie shop">' +
            '<div class="mega-col">' +
              '<p class="mega-col-title">Abbigliamento</p>' +
              '<a href="/shop" class="mega-link">Tutti i capi</a>' +
              '<a href="/shop?categoria=vestiti" class="mega-link">Vestiti</a>' +
              '<a href="/shop?categoria=top" class="mega-link">Top &amp; Bluse</a>' +
              '<a href="/shop?categoria=pantaloni" class="mega-link">Pantaloni</a>' +
              '<a href="/shop?categoria=gonne" class="mega-link">Gonne</a>' +
              '<a href="/shop?categoria=blazer" class="mega-link">Blazer</a>' +
              '<a href="/shop?categoria=set" class="mega-link">Set Coordinati</a>' +
            '</div>' +
            '<div class="mega-col">' +
              '<p class="mega-col-title">Accessori</p>' +
              '<a href="/shop?categoria=accessori" class="mega-link">Tutti gli accessori</a>' +
              '<a href="/shop?categoria=borse" class="mega-link">Borse</a>' +
              '<a href="/shop?categoria=gioielli" class="mega-link">Gioielli</a>' +
              '<a href="/shop?categoria=scarpe" class="mega-link">Scarpe</a>' +
              '<a href="/shop?categoria=cinture" class="mega-link">Cinture &amp; Bijoux</a>' +
            '</div>' +
            '<div class="mega-col">' +
              '<p class="mega-col-title">Collezioni</p>' +
              '<a href="/shop?categoria=novita" class="mega-link mega-link--accent">✦ &nbsp;Nuovi Arrivi</a>' +
              '<a href="/shop?saldi=1" class="mega-link mega-link--sale">Saldi</a>' +
              '<a href="/estate-2025" class="mega-link">Estate 2025</a>' +
              '<a href="/look" class="mega-link">Shop the Look</a>' +
              '<a href="/best-seller" class="mega-link">Best Sellers</a>' +
            '</div>' +
            '<div class="mega-editorial">' +
              '<img src="https://images.unsplash.com/photo-1558769132-cb1aea458c5e?auto=format&fit=crop&w=480&q=80" alt="Collezione Estate 2025" />' +
              '<div class="mega-editorial-body">' +
                '<p class="mega-editorial-eyebrow">In evidenza</p>' +
                '<p class="mega-editorial-title">Estate <em>2025</em></p>' +
                '<a href="/estate-2025" class="mega-editorial-cta">Scopri la collezione →</a>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<a href="/look"' + ac('look') + '>Look</a>' +
      '</nav>';

    // RIGHT group — Look, Editoriali, Chi Siamo mega-trigger (sits right of the centered logo)
    const desktopNavRight =
      '<nav class="desktop-nav desktop-nav-right" aria-label="Altri link">' +
        '<div class="mega-trigger" data-mega="editoriali">' +
          '<span class="mega-label' + editorialiActive + '">' +
            'Editoriali' +
            '<svg class="mega-arrow" viewBox="0 0 10 6" fill="none"><polyline points="1 1 5 5 9 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>' +
          '</span>' +
          '<div class="mega-panel mega-panel--sm" role="navigation" aria-label="Editoriali">' +
            '<div class="mega-col">' +
              '<a href="/editoriali/primavera-estate-2026/" class="mega-link">Primavera Estate 2026</a>' +
              '<a href="/editoriali/estate-2025/" class="mega-link">Estate 2025</a>' +
              '<a href="/editoriali/autunno-inverno-2025/" class="mega-link">Autunno Inverno 2025</a>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="mega-trigger" data-mega="about">' +
          '<span class="mega-label' + aboutActive + '">' +
            'Chi Siamo' +
            '<svg class="mega-arrow" viewBox="0 0 10 6" fill="none"><polyline points="1 1 5 5 9 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>' +
          '</span>' +
          '<div class="mega-panel mega-panel--sm" role="navigation" aria-label="Chi siamo">' +
            '<div class="mega-col">' +
              '<a href="/about" class="mega-link">La Nostra Storia</a>' +
              '<a href="/valori" class="mega-link">I Nostri Valori</a>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</nav>';

    const headerActions =
      '<div class="header-actions">' +
        '<button class="icon-btn" aria-label="Cerca"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></button>' +
        '<button class="icon-btn" aria-label="Carrello"><svg viewBox="0 0 24 24"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg><span class="cart-badge" style="display:none">0</span></button>' +
      '</div>';

    const headerHtml =
      '<header class="site-header" id="siteHeader">' +
        '<div class="header-inner">' +
          '<button class="burger" aria-label="Apri menu" aria-expanded="false"><span></span><span></span><span></span></button>' +
          desktopNavLeft +
          '<a href="/" class="logo">Memi<span>.</span></a>' +
          '<div class="nav-right-group">' + desktopNavRight + headerActions + '</div>' +
        '</div>' +
      '</header>';

    hosts.forEach(function (host) { host.outerHTML = headerHtml; });
    // Enable box-shadow transition only after first paint to avoid flash
    requestAnimationFrame(function() {
      var h = document.getElementById('siteHeader');
      if (h) h.classList.add('ready');
    });
  }

  /* ── 1. CART STATE ─────────────────────────────────────── */

  const CART_KEY = 'memi_cart';

  let cart = loadCart();

  function loadCart() {
    try {
      const raw = localStorage.getItem(CART_KEY);
      const items = raw ? JSON.parse(raw) : [];
      const clean = items.filter(i => i.id && !isNaN(i.price) && i.price > 0);
      if (clean.length !== items.length) localStorage.setItem(CART_KEY, JSON.stringify(clean));
      return clean;
    } catch (_) { return []; }
  }

  function saveCart() {
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (_) {}
  }

  function cartTotal() { return cart.reduce((s, i) => s + i.price * i.qty, 0); }
  function cartCount() { return cart.reduce((s, i) => s + i.qty, 0); }

  function addToCart(item) {
    const { silent, noIncrement, ...data } = item;
    const existing = cart.find(i => i.id === data.id);
    if (existing) {
      if (noIncrement) return;
      existing.qty++;
    } else {
      cart.push({ ...data, qty: 1 });
    }
    saveCart(); updateCartBadges(); renderCartItems();
    if (!silent) showToast(data.name);
  }

  function removeFromCart(id) {
    cart = cart.filter(i => i.id !== id);
    saveCart(); updateCartBadges(); renderCartItems();
  }

  function changeQty(id, delta) {
    const item = cart.find(i => i.id === id);
    if (!item) return;
    item.qty = Math.max(1, item.qty + delta);
    saveCart(); renderCartItems(); updateCartBadges();
  }

  /* ── 2. WISHLIST STATE ─────────────────────────────────── */

  const WISHLIST_KEY = 'memi_wishlist';
  let wishlist = loadWishlist();

  function loadWishlist() {
    try { return JSON.parse(localStorage.getItem(WISHLIST_KEY)) || []; }
    catch (_) { return []; }
  }

  function saveWishlist() {
    try { localStorage.setItem(WISHLIST_KEY, JSON.stringify(wishlist)); } catch (_) {}
  }

  function isWishlisted(id) { return wishlist.some(function(i){ return i.productId === id || i.id === id; }); }

  function toggleWishlist(id, name, color, colorKey, taglia) {
    var wishId = id + (taglia ? '-sz-' + taglia : '');
    if (wishlist.some(function(i){ return i.id === wishId; })) {
      wishlist = wishlist.filter(function(i){ return i.id !== wishId; });
    } else {
      wishlist.push({ id: wishId, productId: id, name: name, color: color, colorKey: colorKey || 'ph-blush', taglia: taglia || null });
    }
    saveWishlist();
    updateWishlistBadge();
    // Sync all heart buttons for this product across the page (CSS class approach)
    var wishlisted = isWishlisted(id);
    document.querySelectorAll('.product-wishlist[data-id="' + id + '"]').forEach(function(btn) {
      btn.classList.toggle('is-wishlisted', wishlisted);
      btn.setAttribute('aria-label', wishlisted ? 'Rimuovi dalla wishlist' : 'Aggiungi alla wishlist');
    });
  }

  function updateWishlistBadge() {
    const count = wishlist.length;
    const badge = document.getElementById('wishlistBadge');
    if (badge) {
      badge.textContent = count;
      badge.style.display = count > 0 ? 'flex' : 'none';
    }
  }

  window.toggleWishlist = toggleWishlist;

  /* ── 3. PRODUCT CATALOG (for search) — loaded live from the API ── */
  // Starts empty and is filled from /api/products. If the store has no
  // products, search correctly finds nothing (no more fake placeholder data).
  const CATALOG = [];

  function _searchColorKey(colore) {
    var c = (colore || '').toLowerCase();
    if (/ros|blush|coral|cipria|peony|antico/.test(c))     return 'ph-blush';
    if (/verd|salv|menta|musch|sage|oliv/.test(c))          return 'ph-sage';
    if (/lavan|lilla|viola|glic|malva/.test(c))             return 'ph-lavender';
    if (/avor|crema|panna|bianc|perla|nud|sabbia/.test(c))  return 'ph-cream';
    return 'ph-flat';
  }

  // Pick a usable image URL from a product's images array (WebP variants or legacy strings).
  function pickImg(images) {
    if (!Array.isArray(images) || !images.length) return '';
    var x = images[0];
    if (typeof x === 'string') return x;
    return (x && (x.card || x.full || x.thumb)) || '';
  }
  // Find a catalog product's real image by a cart/wishlist item id (base id or id+size).
  function catalogImg(id) {
    if (!id) return '';
    for (var i = 0; i < CATALOG.length; i++) {
      var p = CATALOG[i];
      if (id === p.id || id.indexOf(p.id + '-') === 0) return p.img || '';
    }
    return '';
  }

  function loadSearchCatalog() {
    if (typeof fetch !== 'function') return;
    fetch('/api/products?limit=300')
      .then(function (r) { return r.json(); })
      .then(function (res) {
        var products = Array.isArray(res) ? res : (res && res.products) || [];
        CATALOG.length = 0;
        products.forEach(function (p) {
          CATALOG.push({
            id:       p.id,
            img:      pickImg(p.images),
            name:     p.name || '',
            color:    p.color_label || p.colore || '',
            colorKey: _searchColorKey(p.colore || p.color_label),
            price:    '€' + (Number(p.price) || 0).toFixed(2).replace('.', ','),
            tags:     [ (p.categoria || '') ]
                        .concat(p.is_new ? ['novita', 'new'] : [])
                        .concat((Number(p.discount_pct) > 0) ? ['saldi', 'sale'] : [])
          });
        });
      })
      .catch(function () { /* offline / no products → search finds nothing */ });
  }
  loadSearchCatalog();

  /* ── 4. FOOTER INJECTION ───────────────────────────────── */

  function injectFooter() {
    // Build new footer HTML (dark, minimal, elegant)
    const footerHtml = `
<footer class="site-footer sf2" role="contentinfo">
  <div class="sf2-trust">
    <div class="sf2-trust-inner">
      <div class="sf2-trust-item"><svg viewBox="0 0 24 24"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg><span>Spedizione gratuita da €50</span></div>
      <div class="sf2-trust-item"><svg viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg><span>Reso gratuito entro 30 giorni</span></div>
      <div class="sf2-trust-item"><svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg><span>Pagamenti sicuri</span></div>
      <div class="sf2-trust-item"><svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg><span>Made in Italy</span></div>
    </div>
  </div>
  <div class="sf2-inner">
    <div class="sf2-brand">
      <a href="/" class="sf2-logo">Memi<em>.</em></a>
      <p class="sf2-tagline">Moda femminile curata, italiana.</p>
      <div class="sf2-social">
        <a href="https://instagram.com/memiabbigliamento" aria-label="Instagram" target="_blank" rel="noopener">
          <svg viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>
        </a>
        <a href="#" aria-label="Pinterest">
          <svg viewBox="0 0 24 24"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.236 2.636 7.855 6.356 9.312-.088-.791-.167-2.005.035-2.868.181-.78 1.172-4.97 1.172-4.97s-.299-.598-.299-1.482c0-1.388.806-2.428 1.808-2.428.852 0 1.265.64 1.265 1.408 0 .858-.546 2.141-.828 3.33-.236.995.499 1.806 1.48 1.806 1.773 0 3.141-1.872 3.141-4.573 0-2.39-1.717-4.061-4.168-4.061-2.837 0-4.502 2.126-4.502 4.327 0 .856.329 1.772.74 2.273a.3.3 0 0 1 .069.285c-.075.314-.244.995-.277 1.134-.044.183-.145.222-.334.134-1.249-.581-2.03-2.407-2.03-3.874 0-3.154 2.292-6.052 6.608-6.052 3.469 0 6.165 2.473 6.165 5.776 0 3.447-2.173 6.22-5.19 6.22-1.013 0-1.966-.527-2.292-1.148l-.623 2.378c-.226.869-.835 1.958-1.244 2.621.937.29 1.931.446 2.962.446 5.522 0 10-4.477 10-10S17.522 2 12 2z" stroke="none" fill="currentColor" opacity=".7"/></svg>
        </a>
        <a href="#" aria-label="TikTok">
          <svg viewBox="0 0 24 24"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.76a4.85 4.85 0 0 1-1.01-.07z" stroke="none" fill="currentColor" opacity=".7"/></svg>
        </a>
      </div>
    </div>
    <div class="sf2-nav">
      <div class="sf2-col">
        <h4>Negozio</h4>
        <ul>
          <li><a href="/shop?categoria=novita">Novità</a></li>
          <li><a href="/shop?saldi=1">Saldi</a></li>
          <li><a href="/shop">Tutti i Capi</a></li>
          <li><a href="/shop?categoria=accessori">Accessori</a></li>
          <li><a href="/look">Shop the Look</a></li>
        </ul>
      </div>
      <div class="sf2-col">
        <h4>Azienda</h4>
        <ul>
          <li><a href="/about">Chi Siamo</a></li>
          <li><a href="/editoriali/primavera-estate-2026/">Editoriali</a></li>
          <li><a href="/blog">Blog</a></li>
          <li><a href="/valori">I Nostri Valori</a></li>
        </ul>
      </div>
      <div class="sf2-col">
        <h4>Supporto</h4>
        <ul>
          <li><a href="mailto:info@memiabbigliamento.it">Contattaci</a></li>
          <li><a href="/returns">Spedizioni &amp; Resi</a></li>
          <li><a href="/privacy">Privacy Policy</a></li>
        </ul>
      </div>
    </div>
  </div>
  <div class="sf2-bottom">
    <p>© 2025 Memi Abbigliamento · Tutti i diritti riservati</p>
    <nav class="sf2-legal" aria-label="Link legali">
      <a href="/privacy">Privacy</a>
      <a href="#">Cookie</a>
      <a href="#">Termini</a>
    </nav>
    <p class="sf2-made">Fatto con cura, in Italia ✦</p>
  </div>
</footer>`;

    // Inject footer CSS once
    if (!document.getElementById('sf2-styles')) {
      const s = document.createElement('style');
      s.id = 'sf2-styles';
      s.textContent = `
        footer.sf2{background:var(--lavender-light,#EAE7F4);color:var(--espresso,#3B2B2B);padding:0;margin-top:auto;}
        .sf2-trust{border-bottom:1px solid var(--beige,#DDD9EC);padding:.9rem 2rem;}
        .sf2-trust-inner{max-width:1280px;margin:0 auto;display:flex;flex-wrap:wrap;gap:1rem 2.5rem;justify-content:center;}
        .sf2-trust-item{display:flex;align-items:center;gap:.5rem;font-size:.7rem;letter-spacing:.06em;text-transform:uppercase;color:var(--brown-mid,#7A6B6B);}
        .sf2-trust-item svg{width:14px;height:14px;stroke:var(--brown-mid,#7A6B6B);fill:none;stroke-width:1.6;flex-shrink:0;}
        .sf2-inner{max-width:1280px;margin:0 auto;padding:3.25rem 2rem 3.5rem;display:grid;grid-template-columns:1fr 2fr;gap:4rem;align-items:start;}
        @media(max-width:800px){.sf2-inner{grid-template-columns:1fr;gap:2.5rem;}}
        .sf2-logo{font-family:var(--font-serif,'Cormorant Garamond',serif);font-size:2rem;font-weight:300;color:var(--espresso,#3B2B2B);letter-spacing:.06em;text-decoration:none;display:block;margin-bottom:.55rem;}
        .sf2-logo em{color:var(--blush-dark,#C48991);font-style:normal;}
        .sf2-tagline{font-size:.7rem;letter-spacing:.1em;text-transform:uppercase;color:var(--brown-light,#9e8a8a);margin-bottom:1.75rem;}
        .sf2-social{display:flex;gap:.6rem;}
        .sf2-social a{width:36px;height:36px;border:1px solid var(--beige-dark,#C0B9D9);border-radius:50%;display:flex;align-items:center;justify-content:center;transition:border-color .2s,background .2s;}
        .sf2-social a:hover{border-color:var(--espresso,#3B2B2B);background:rgba(59,43,43,.06);}
        .sf2-social svg{width:13px;height:13px;stroke:var(--brown-mid,#7A6B6B);fill:none;stroke-width:1.7;}
        .sf2-nav{display:grid;grid-template-columns:repeat(3,1fr);gap:2rem;}
        @media(max-width:480px){.sf2-nav{grid-template-columns:repeat(2,1fr);}}
        .sf2-col h4{font-size:.65rem;letter-spacing:.13em;text-transform:uppercase;color:var(--brown-light,#9e8a8a);margin-bottom:1rem;font-weight:600;}
        .sf2-col ul{list-style:none;padding:0;margin:0;}
        .sf2-col li{margin-bottom:.5rem;}
        .sf2-col a{font-size:.82rem;color:var(--brown-mid,#7A6B6B);text-decoration:none;transition:color .2s;}
        .sf2-col a:hover{color:var(--espresso,#3B2B2B);}
        .sf2-bottom{max-width:1280px;margin:0 auto;padding:1.1rem 2rem;border-top:1px solid var(--beige,#DDD9EC);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.6rem;font-size:.7rem;color:var(--brown-light,#9e8a8a);}
        .sf2-legal{display:flex;gap:1.2rem;}
        .sf2-legal a{color:var(--brown-light,#9e8a8a);text-decoration:none;transition:color .2s;}
        .sf2-legal a:hover{color:var(--espresso,#3B2B2B);}
        .sf2-made{color:var(--brown-light,#9e8a8a);letter-spacing:.04em;}
      `;
      document.head.appendChild(s);
    }

    // Replace [data-include="site-footer"] placeholders
    document.querySelectorAll('[data-include="site-footer"]').forEach(function(el) {
      const tmp = document.createElement('div');
      tmp.innerHTML = footerHtml;
      el.replaceWith(tmp.firstElementChild);
    });

    // Replace any existing inline footer.site-footer (not already sf2)
    document.querySelectorAll('footer.site-footer:not(.sf2)').forEach(function(el) {
      const tmp = document.createElement('div');
      tmp.innerHTML = footerHtml;
      el.replaceWith(tmp.firstElementChild);
    });

    // If no footer exists at all (pages without placeholder/inline), append to body
    if (!document.querySelector('footer.site-footer')) {
      document.body.insertAdjacentHTML('beforeend', footerHtml);
    }
  }

  /* ── 5. INJECT MARKUP ──────────────────────────────────── */

  function injectMarkup() {
    // Guard: prevent double-injection (can happen on homepage due to
    // browser pre-render / bfcache restore triggering a second init)
    // Guard: prevent double-injection (can happen on homepage due to
    // browser pre-render / bfcache restore triggering a second init)
    if (document.getElementById('siteHeader')) return;

    // Header (must run first — other injected pieces, e.g. the wishlist
    // icon, attach to .header-actions inside it)
    injectHeader();

    // Shared scrim
    const scrim = document.createElement('div');
    scrim.className = 'app-scrim';
    scrim.id = 'appScrim';
    document.body.appendChild(scrim);

    // Cart drawer
    document.body.insertAdjacentHTML('beforeend', `
      <aside class="cart-drawer" id="cartDrawer" role="dialog" aria-modal="true" aria-label="Carrello">
        <div class="cart-drawer-header">
          <span class="cart-drawer-title">
            Il tuo carrello
            <span class="cart-count-badge" id="cartCountBadgeDrawer">0</span>
          </span>
          <button class="cart-close-btn" id="cartCloseBtn" aria-label="Chiudi carrello">
            <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="cart-drawer-body" id="cartDrawerBody"></div>
        <div class="cart-drawer-footer" id="cartDrawerFooter"></div>
      </aside>
    `);

    // Wishlist drawer
    document.body.insertAdjacentHTML('beforeend', `
      <aside class="wishlist-drawer" id="wishlistDrawer" role="dialog" aria-modal="true" aria-label="Lista desideri">
        <div class="cart-drawer-header">
          <span class="cart-drawer-title">
            Lista desideri
            <span class="cart-count-badge" id="wishlistCountBadgeDrawer">0</span>
          </span>
          <button class="cart-close-btn" id="wishlistCloseBtn" aria-label="Chiudi lista desideri">
            <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="cart-drawer-body" id="wishlistDrawerBody"></div>
        <div class="cart-drawer-footer" id="wishlistDrawerFooter"></div>
      </aside>
    `);

    // Search drawer
    document.body.insertAdjacentHTML('beforeend', `
      <div class="search-overlay" id="searchOverlay" role="dialog" aria-modal="true" aria-label="Cerca">
        <div class="search-drawer-header">
          <span class="search-drawer-title">Cerca</span>
          <button class="search-close-btn" id="searchCloseBtn" aria-label="Chiudi ricerca">
            <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="search-drawer-body">
          <div class="search-input-wrap">
            <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="search" class="search-input" id="searchInput"
              placeholder="Cerca vestiti, blazer, gonne…"
              autocomplete="off" aria-label="Campo di ricerca" />
            <button class="search-clear-btn" id="searchClearBtn" aria-label="Cancella" style="display:none;">
              <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="search-results" id="searchResults" style="display:none;"></div>
          <div class="search-trending" id="searchTrending">
            <p class="search-trending-label">Tendenze</p>
            <div class="search-tags">
              ${['Vestiti lino','Blazer salvia','Top seta','Gonna plissé','Set coordinato','Novità'].map(t =>
                `<button class="search-tag-chip" data-query="${t}">${t}</button>`
              ).join('')}
            </div>
          </div>
        </div>
      </div>
    `);

    // Mobile nav drawer — same NAV_ITEMS as the desktop header, plus Home
    const currentFull = currentHrefKey();
    const mobileRoot = collectionsRoot();
    const mobileSlug = currentCollectionSlug();
    const navItems = [{ href: '/', label: 'Home' }].concat(NAV_ITEMS);
    document.body.insertAdjacentHTML('beforeend', `
      <nav class="mobile-nav-drawer" id="mobileNavDrawer" role="navigation" aria-label="Menu principale">
        <div class="mobile-nav-header">
          <a href="/" class="mobile-nav-logo">Memi<span>.</span></a>
          <button class="mobile-nav-close" id="mobileNavClose" aria-label="Chiudi menu">
            <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="mobile-nav-links">
          ${navItems.map(item => {
            const href = item.collection
              ? '/collections/' + item.collection + '/'
              : (item.href.startsWith('/') ? item.href : '/' + item.href);
            const isActive = item.collection ? mobileSlug === item.collection : currentFull === item.href;
            return `
            <a href="${href}" class="mobile-nav-link${isActive ? ' active' : ''}">
              ${item.label}
              <svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
            </a>
          `;
          }).join('')}
        </div>
        <div class="mobile-nav-footer">
          <div class="mobile-nav-social">
            <a href="https://instagram.com/memiabbigliamento" aria-label="Instagram" target="_blank" rel="noopener">
              <svg viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
            </a>
          </div>
          <p class="mobile-nav-contact">
            Assistenza: <a href="mailto:info@memiabbigliamento.it">info@memiabbigliamento.it</a>
          </p>
        </div>
      </nav>
    `);

    // Toast stack
    document.body.insertAdjacentHTML('beforeend', `<div class="toast-stack" id="toastStack"></div>`);

    // Inject wishlist button into header (between search and cart)
    const headerActions = document.querySelector('.header-actions');
    if (headerActions && !document.getElementById('wishlistHeaderBtn')) {
      const cartBtn = headerActions.querySelector('[aria-label*="arrello"]');
      const wlBtn = document.createElement('button');
      wlBtn.className = 'icon-btn';
      wlBtn.id = 'wishlistHeaderBtn';
      wlBtn.setAttribute('aria-label', 'Lista desideri');
      wlBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
        <span class="cart-badge" id="wishlistBadge" style="display:none;">0</span>
      `;
      if (cartBtn) headerActions.insertBefore(wlBtn, cartBtn);
      else headerActions.appendChild(wlBtn);
    }

    // Auth header button
    if (headerActions && !document.getElementById('authHeaderBtn')) {
      const searchBtn = headerActions.querySelector('[aria-label*="erca"]');
      const authBtn   = document.createElement('button');
      authBtn.className = 'icon-btn auth-header-btn';
      authBtn.id = 'authHeaderBtn';
      authBtn.setAttribute('aria-label', 'Accedi o registrati');
      authBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
      if (searchBtn) headerActions.insertBefore(authBtn, searchBtn);
      else headerActions.prepend(authBtn);
    }

    // Auth drawer (slide-out from right)
    document.body.insertAdjacentHTML('beforeend', `
      <aside class="auth-drawer" id="authDrawer" role="dialog" aria-modal="true" aria-label="Accesso account">
        <div class="auth-drawer-inner">
          <div class="auth-drawer-head">
            <div class="auth-brand">
              <a href="/" class="auth-logo">Memi<span>.</span></a>
              <p class="auth-tagline">La tua moda. Il tuo account.</p>
            </div>
            <button class="cart-close-btn auth-close" id="authCloseBtn" aria-label="Chiudi">
              <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="auth-tabs">
            <button class="auth-tab active" id="authTabLogin">Accedi</button>
            <button class="auth-tab" id="authTabRegister">Registrati</button>
          </div>
          <div class="auth-panels-wrap">
            <div class="auth-panel" id="authPanelLogin">
              <form id="authLoginForm" novalidate>
                <div class="auth-field" id="authLoginEmailField">
                  <label for="authLoginEmail">Email</label>
                  <input type="email" id="authLoginEmail" placeholder="la.tua@email.com" autocomplete="email" />
                  <span class="auth-field-hint" id="authLoginEmailHint"></span>
                </div>
                <div class="auth-field" id="authLoginPwdField">
                  <label for="authLoginPwd">Password</label>
                  <div class="auth-pwd-wrap">
                    <input type="password" id="authLoginPwd" placeholder="••••••••" autocomplete="current-password" />
                    <button type="button" class="auth-eye-btn" aria-label="Mostra password" data-target="authLoginPwd">
                      <svg class="eye-open" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      <svg class="eye-closed" viewBox="0 0 24 24" style="display:none"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    </button>
                  </div>
                  <span class="auth-field-hint" id="authLoginPwdHint"></span>
                </div>
                <p class="auth-error" id="authLoginError"></p>
                <p style="text-align:right;margin-bottom:.75rem;">
                  <a href="forgot-password.html" class="auth-forgot-link" style="font-size:.75rem;color:var(--brown-light);text-decoration:underline;text-underline-offset:3px;">Password dimenticata?</a>
                </p>
                <button type="submit" class="btn-primary auth-submit" id="authLoginBtn">
                  <span class="auth-btn-label">Accedi</span>
                  <span class="auth-btn-spin" aria-hidden="true"></span>
                </button>
              </form>
            </div>
            <div class="auth-panel auth-panel--right" id="authPanelRegister">
              <form id="authRegisterForm" novalidate>
                <div class="auth-field" id="authRegNameField">
                  <label for="authRegName">Nome</label>
                  <input type="text" id="authRegName" placeholder="Il tuo nome" autocomplete="given-name" />
                </div>
                <div class="auth-field" id="authRegEmailField">
                  <label for="authRegEmail">Email</label>
                  <input type="email" id="authRegEmail" placeholder="la.tua@email.com" autocomplete="email" />
                  <span class="auth-field-hint" id="authRegEmailHint"></span>
                </div>
                <div class="auth-field" id="authRegPwdField">
                  <label for="authRegPwd">Password</label>
                  <div class="auth-pwd-wrap">
                    <input type="password" id="authRegPwd" placeholder="Min. 8 caratteri" autocomplete="new-password" />
                    <button type="button" class="auth-eye-btn" aria-label="Mostra password" data-target="authRegPwd">
                      <svg class="eye-open" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      <svg class="eye-closed" viewBox="0 0 24 24" style="display:none"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    </button>
                  </div>
                  <span class="auth-field-hint" id="authRegPwdHint"></span>
                </div>
                <p class="auth-error" id="authRegError"></p>
                <button type="submit" class="btn-primary auth-submit" id="authRegBtn">
                  <span class="auth-btn-label">Crea account</span>
                  <span class="auth-btn-spin" aria-hidden="true"></span>
                </button>
              </form>
            </div>
          </div>
          <div class="auth-drawer-footer">
            <p class="auth-guest"><button type="button" id="authGuestBtn">Continua come ospite →</button></p>
            <p class="auth-benefits">❖ Salva la lista desideri   ❖ Traccia i tuoi ordini</p>
          </div>
        </div>
      </aside>
    `);

    // Account drawer
    document.body.insertAdjacentHTML('beforeend', `
      <aside class="account-drawer" id="accountDrawer" role="dialog" aria-modal="true" aria-label="Il mio account">
        <div class="account-drawer-header">
          <div class="account-avatar" id="accountAvatar">M</div>
          <div class="account-info">
            <p class="account-info-name" id="accountInfoName">—</p>
            <p class="account-info-email" id="accountInfoEmail">—</p>
          </div>
          <button class="cart-close-btn" id="accountCloseBtn" aria-label="Chiudi">
            <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="account-drawer-body">
          <button class="account-menu-item" id="accountToWishlist">
            <svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            Lista desideri
          </button>
          <a href="/account" class="account-menu-item">
            <svg viewBox="0 0 24 24"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
            I miei ordini
          </a>
        </div>
        <div class="account-drawer-footer">
          <button class="account-logout" id="accountLogoutBtn">Esci dall'account</button>
        </div>
      </aside>
    `);

    // Auth styles
    const s = document.createElement('style');
    s.textContent = `
      /* Auth Drawer */
      .auth-drawer{position:fixed;top:0;right:-460px;width:min(420px,94vw);height:100%;background:var(--bg-base,#FFFFFF);z-index:9000;transition:right .35s cubic-bezier(.4,0,.2,1);display:flex;flex-direction:column;box-shadow:-4px 0 40px rgba(10,4,4,.14);border-left:1px solid var(--beige,#DDD9EC)}
      .auth-drawer.open{right:0}
      .auth-drawer-inner{display:flex;flex-direction:column;height:100%;overflow-y:auto}
      .auth-drawer-head{display:flex;align-items:flex-start;justify-content:space-between;padding:1.5rem 1.5rem 1rem;border-bottom:1px solid var(--beige,#DDD9EC);flex-shrink:0}
      .auth-brand{}
      .auth-logo{font-family:var(--font-serif,'Cormorant Garamond',serif);font-size:1.75rem;font-weight:300;color:var(--espresso,#3b2b2b);text-decoration:none;letter-spacing:.06em;display:block}
      .auth-logo span{color:var(--blush-dark,#C4A8B0)}
      .auth-tagline{font-size:.72rem;color:var(--brown-light,#9e8a8a);letter-spacing:.09em;text-transform:uppercase;margin-top:.3rem}
      .auth-tabs{display:flex;border-bottom:1px solid var(--beige,#DDD9EC);margin:0 1.5rem;flex-shrink:0}
      .auth-tab{flex:1;background:none;border:none;border-bottom:2px solid transparent;margin-bottom:-1px;padding:.7rem 0;font-family:var(--font-sans,'DM Sans',sans-serif);font-size:.75rem;letter-spacing:.08em;text-transform:uppercase;color:var(--brown-light,#9e8a8a);cursor:pointer;transition:color .2s,border-color .2s}
      .auth-tab.active{color:var(--espresso,#3b2b2b);border-bottom-color:var(--espresso,#3b2b2b)}
      .auth-panels-wrap{position:relative;flex:1;padding:1.25rem 1.5rem 0;min-height:0}
      .auth-panel{transition:opacity .28s ease,transform .28s cubic-bezier(.4,0,.2,1)}
      .auth-panel--right{position:absolute;inset:1.25rem 1.5rem 0;opacity:0;transform:translateX(32px);pointer-events:none;transition:opacity .28s ease,transform .28s cubic-bezier(.4,0,.2,1)}
      .auth-panel--left{position:absolute;inset:1.25rem 1.5rem 0;opacity:0;transform:translateX(-32px);pointer-events:none;transition:opacity .28s ease,transform .28s cubic-bezier(.4,0,.2,1)}
      .auth-form{display:flex;flex-direction:column;gap:.9rem}
      .auth-field{display:flex;flex-direction:column;gap:.3rem}
      .auth-field label{font-size:.72rem;letter-spacing:.07em;text-transform:uppercase;color:var(--brown-mid,#6b5050)}
      .auth-field input{border:1px solid var(--beige-dark,#C0B9D9);border-radius:4px;padding:.65rem .85rem;font-family:var(--font-sans,'DM Sans',sans-serif);font-size:.9rem;color:var(--espresso,#3b2b2b);background:var(--white,#FFFFFF);outline:none;transition:border-color .18s,box-shadow .18s;width:100%;box-sizing:border-box}
      .auth-field input:focus{border-color:var(--espresso,#3b2b2b);box-shadow:0 0 0 3px rgba(47,52,56,.07)}
      .auth-field.field-error input{border-color:#d45c5c}
      .auth-field.field-valid input{border-color:var(--sage-dark,#8eab89)}
      .auth-field-hint{font-size:.74rem;min-height:1em;color:var(--brown-light,#9e8a8a)}
      .auth-field.field-error .auth-field-hint{color:#c04040}
      .auth-field.field-valid .auth-field-hint{color:var(--sage-dark,#8eab89)}
      .auth-pwd-wrap{position:relative}
      .auth-pwd-wrap input{padding-right:2.6rem}
      .auth-eye-btn{position:absolute;right:.6rem;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:var(--brown-light,#9e8a8a);width:28px;height:28px;display:flex;align-items:center;justify-content:center;border-radius:4px;transition:color .15s}
      .auth-eye-btn:hover{color:var(--espresso,#3b2b2b)}
      .auth-eye-btn svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:1.6}
      .auth-error{font-size:.8rem;color:#b94040;min-height:1.1em;margin:-.25rem 0 0}
      .auth-submit{margin-top:.375rem;width:100%;padding:.8rem;font-size:.78rem;justify-content:center;position:relative;overflow:hidden}
      .auth-submit.is-loading .auth-btn-label{opacity:0}
      .auth-submit.is-loading .auth-btn-spin{display:block}
      .auth-btn-spin{display:none;position:absolute;width:18px;height:18px;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;border-radius:50%;animation:authSpin .6s linear infinite}
      @keyframes authSpin{to{transform:rotate(360deg)}}
      .auth-drawer-footer{padding:1rem 1.5rem 1.5rem;border-top:1px solid var(--beige,#DDD9EC);margin-top:1.25rem;flex-shrink:0}
      .auth-guest{text-align:center;margin-bottom:.5rem}
      .auth-guest button{background:none;border:none;cursor:pointer;font-size:.82rem;color:var(--brown-mid,#6b5050);text-decoration:underline;text-underline-offset:2px;font-family:var(--font-sans,'DM Sans',sans-serif)}
      .auth-guest button:hover{color:var(--espresso,#3b2b2b)}
      .auth-benefits{text-align:center;font-size:.7rem;color:var(--brown-light,#9e8a8a);letter-spacing:.04em;margin:0}
      .auth-header-btn.user-logged{background:var(--blush,#F3D1D6)!important;font-family:var(--font-serif,'Cormorant Garamond',serif);font-size:1rem;font-weight:500;color:var(--espresso,#3b2b2b)}
      .auth-header-btn.user-logged svg{display:none}
      .account-drawer{position:fixed;top:0;right:-380px;width:min(360px,92vw);height:100%;background:var(--white,#FFFFFF);z-index:8000;transition:right .3s cubic-bezier(.4,0,.2,1);display:flex;flex-direction:column;box-shadow:-4px 0 32px rgba(10,4,4,.12)}
      .account-drawer.open{right:0}
      .account-drawer-header{display:flex;align-items:center;gap:.875rem;padding:1.25rem 1.25rem 1rem;border-bottom:1px solid var(--beige,#DDD9EC)}
      .account-avatar{width:44px;height:44px;border-radius:50%;background:var(--blush,#F3D1D6);display:flex;align-items:center;justify-content:center;font-family:var(--font-serif,'Cormorant Garamond',serif);font-size:1.2rem;color:var(--espresso,#3b2b2b);flex-shrink:0}
      .account-info{flex:1;min-width:0}
      .account-info-name{font-family:var(--font-serif,'Cormorant Garamond',serif);font-size:1.05rem;color:var(--espresso,#3b2b2b);font-weight:400;margin:0}
      .account-info-email{font-size:.72rem;color:var(--brown-light,#9e8a8a);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:0}
      .account-drawer-body{flex:1;padding:.5rem 0;overflow-y:auto}
      .account-menu-item{display:flex;align-items:center;gap:.75rem;padding:.9rem 1.25rem;text-decoration:none;color:var(--espresso,#3b2b2b);font-size:.9rem;transition:background .15s;border:none;background:none;width:100%;text-align:left;cursor:pointer;font-family:var(--font-sans,'DM Sans',sans-serif)}
      .account-menu-item:hover{background:var(--bg-soft,#F3F1F9)}
      .account-menu-item svg{width:18px;height:18px;stroke:var(--brown-mid,#6b5050);fill:none;stroke-width:1.5;flex-shrink:0}
      .account-drawer-footer{padding:1rem 1.25rem;border-top:1px solid var(--beige,#DDD9EC)}
      .account-logout{width:100%;background:none;border:1px solid var(--beige-dark,#C0B9D9);border-radius:3px;padding:.7rem;font-family:var(--font-sans,'DM Sans',sans-serif);font-size:.75rem;color:var(--brown-mid,#6b5050);letter-spacing:.06em;text-transform:uppercase;cursor:pointer;transition:border-color .15s,color .15s}
      .account-logout:hover{border-color:var(--espresso,#3b2b2b);color:var(--espresso,#3b2b2b)}
    `;
    document.head.appendChild(s);

    // ── CART / WISHLIST MICRO-INTERACTION CSS ────────────────────
    const cartUiStyle = document.createElement('style');
    cartUiStyle.textContent = `
      /* Badge pop: scale-up then settle on item add */
      @keyframes badgePop {
        0%   { transform: scale(1); }
        40%  { transform: scale(1.45); background: var(--blush,#F3D1D6); }
        70%  { transform: scale(0.92); }
        100% { transform: scale(1); background: var(--espresso,#3b2b2b); }
      }
      .cart-badge.badge-pop { animation: badgePop 380ms var(--ease-out,cubic-bezier(.22,1,.36,1)) forwards; }

      /* Heart toggle — CSS class approach */
      .product-wishlist path { transition: fill 200ms, stroke 200ms; }
      .product-wishlist.is-wishlisted path {
        fill: var(--blush,#F3D1D6);
        stroke: var(--blush-dark,#C4A8B0);
      }
      .product-wishlist.is-wishlisted svg { animation: heartPop 300ms var(--ease-out,cubic-bezier(.22,1,.36,1)); }
      @keyframes heartPop {
        0%   { transform: scale(1); }
        50%  { transform: scale(1.3); }
        100% { transform: scale(1); }
      }

      /* Color + size tag chips inside cart/wishlist items */
      .cart-item-tags {
        display: flex; flex-wrap: wrap; gap: 4px;
        margin-top: 4px;
      }
      .cart-tag {
        display: inline-flex; align-items: center;
        padding: 2px 8px; border-radius: 99px;
        font-size: .68rem; letter-spacing: .04em;
        background: var(--bg-soft,#F3F1F9);
        color: var(--brown-mid,#6b5050);
        border: 1px solid var(--beige,#DDD9EC);
        white-space: nowrap;
      }
      .cart-tag-size {
        background: var(--blush-light,#FAE8EB);
        border-color: var(--blush,#F3D1D6);
        color: var(--espresso,#3b2b2b);
        font-weight: 500;
      }
      .cart-tag-none {
        color: var(--brown-light,#9e8a8a);
        font-style: italic;
        border-style: dashed;
      }

      /* Wishlist drawer: Sposta nel carrello button */
      .wl-move-btn {
        display: block; width: 100%; margin-top: var(--space-2,0.5rem);
        padding: 7px 12px; border-radius: 3px;
        background: var(--espresso,#3b2b2b); color: var(--white,#FFFFFF);
        font-family: var(--font-sans,'DM Sans',sans-serif);
        font-size: .72rem; letter-spacing: .08em; text-transform: uppercase;
        font-weight: 600; border: none; cursor: pointer; text-align: center;
        transition: background 150ms, opacity 150ms;
      }
      .wl-move-btn:hover { background: var(--ink,#2f3438); }
      .wl-move-btn:disabled { opacity: .45; cursor: default; }
    `;
    document.head.appendChild(cartUiStyle);

    // ── MEGA MENU CSS ────────────────────────────────────────────
    const ms = document.createElement('style');
    ms.textContent = `
      /* Mega-menu wrapper */
      .desktop-nav { position: static !important; }
      .mega-trigger { position: relative; display: inline-flex; align-items: center; }

      .mega-label {
        display: inline-flex; align-items: center; gap: 5px;
        font-size: var(--text-sm,0.875rem);
        letter-spacing: var(--tracking-wide,0.08em);
        text-transform: uppercase; font-weight: 500;
        color: var(--brown-mid,#6b5050);
        cursor: pointer; transition: color 180ms;
        user-select: none;
      }
      .mega-label:hover, .mega-label--active { color: var(--espresso,#3b2b2b); }
      .mega-arrow { width: 10px; height: 6px; transition: transform 220ms ease-out; flex-shrink: 0; }
      .mega-trigger:hover .mega-arrow,
      .mega-trigger.is-open .mega-arrow,
      .mega-trigger:focus-within .mega-arrow { transform: rotate(180deg); }

      /* Nav saldi — pink accent */
      a.nav-saldi { color: #B5708A !important; }
      a.nav-saldi:hover { color: #8A4F66 !important; }

      /* Full-width mega panel */
      .mega-panel {
        position: fixed;
        top: 64px; left: 0; right: 0;
        background: var(--white,#FFFFFF);
        border-top: 1px solid var(--beige,#DDD9EC);
        border-bottom: 2px solid var(--beige,#DDD9EC);
        box-shadow: 0 16px 48px rgba(59,43,43,.1);
        display: grid;
        grid-template-columns: 1fr 1fr 1fr 280px;
        gap: 0;
        padding: 2.5rem max(calc((100vw - 1280px) / 2 + 1.5rem), 1.5rem) 2.5rem;
        visibility: hidden; opacity: 0;
        transform: translateY(-10px);
        transition: opacity 220ms ease-out, transform 220ms ease-out, visibility 0s 220ms;
        z-index: 190;
        pointer-events: none;
      }
      .mega-trigger.is-open .mega-panel {
        visibility: visible; opacity: 1;
        transform: translateY(0);
        transition-delay: 0s;
        pointer-events: auto;
      }

      /* Small dropdown (Chi Siamo) */
      .mega-panel--sm {
        position: absolute;
        top: calc(100% + 10px);
        left: 50%; right: auto;
        width: 200px;
        transform: translateX(-50%) translateY(-6px);
        grid-template-columns: 1fr;
        padding: 0.5rem;
        border-radius: 12px;
        background: var(--white,#FFFFFF);
        border: 1px solid var(--beige,#DDD9EC);
        box-shadow: 0 8px 32px rgba(59,43,43,.13);
      }
      .mega-trigger.is-open .mega-panel--sm {
        transform: translateX(-50%) translateY(0);
      }
      .mega-panel--sm .mega-col { padding-right: 0; }
      .mega-panel--sm .mega-link {
        padding: 0.55rem 0.875rem;
        border-radius: 8px;
        font-size: 0.8125rem;
      }
      .mega-panel--sm .mega-link:hover {
        background: var(--bg-soft,#F3F1F9);
        transform: none;
      }

      /* Column content */
      .mega-col { padding-right: 2.5rem; }
      .mega-panel--sm .mega-col { padding-right: 0; }

      /* Narrow-desktop squeeze zone — same 900–1150px window as the header
         nav fix above. Shrink the fixed editorial image column and the
         per-column padding so the three text columns keep enough room for
         "Cinture & Bijoux" / "✦ Nuovi Arrivi" without wrapping awkwardly. */
      @media (min-width: 900px) and (max-width: 1150px) {
        .mega-panel { grid-template-columns: 1fr 1fr 1fr 200px; padding-left: 1.5rem; padding-right: 1.5rem; }
        .mega-col { padding-right: 1.5rem; }
      }

      .mega-col-title {
        font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase;
        font-weight: 600; color: var(--espresso,#3b2b2b);
        margin-bottom: 1rem;
        padding-bottom: 0.5rem;
        border-bottom: 1px solid var(--beige,#DDD9EC);
      }
      .mega-link {
        display: block;
        font-size: var(--text-sm,0.875rem);
        color: var(--brown-mid,#6b5050);
        padding: 0.35rem 0;
        transition: color 150ms, transform 150ms;
        font-weight: 400;
      }
      .mega-link:hover {
        color: var(--espresso,#3b2b2b);
        transform: translateX(3px);
      }
      .mega-link--accent { color: var(--lavender-dark,#A89BC4) !important; font-weight: 500; }
      .mega-link--sale { color: #B5708A !important; font-weight: 500; }

      /* Editorial image panel */
      .mega-editorial {
        position: relative;
        border-radius: 10px;
        overflow: hidden;
        aspect-ratio: 3/4;
        max-height: 260px;
        margin-top: -0.5rem;
        flex-shrink: 0;
      }
      .mega-editorial img {
        width: 100%; height: 100%; object-fit: cover;
        transition: transform 600ms ease-out;
      }
      .mega-editorial:hover img { transform: scale(1.04); }
      .mega-editorial-body {
        position: absolute;
        inset: 0;
        background: linear-gradient(to top, rgba(59,43,43,.72) 0%, rgba(59,43,43,.08) 55%, transparent 100%);
        display: flex; flex-direction: column; justify-content: flex-end;
        padding: 1.25rem;
      }
      .mega-editorial-eyebrow {
        font-size: 9px; letter-spacing: 0.18em; text-transform: uppercase;
        color: rgba(255,255,255,.6); margin-bottom: 4px;
      }
      .mega-editorial-title {
        font-family: var(--font-serif,'Cormorant Garamond',Georgia,serif);
        font-size: 1.5rem; font-weight: 300; color: #fff;
        letter-spacing: -0.02em; line-height: 1.15; margin-bottom: 0.75rem;
      }
      .mega-editorial-title em { font-style: italic; }
      .mega-editorial-cta {
        display: inline-block; font-size: 10px; font-weight: 600;
        letter-spacing: 0.1em; text-transform: uppercase; color: #fff;
        border-bottom: 1px solid rgba(255,255,255,.5);
        padding-bottom: 1px; transition: border-color 150ms;
      }
      .mega-editorial-cta:hover { border-color: #fff; }

      /* ── Centered word-mark header (Toteme-style) ───────────────
         3-column grid: equal-width flexible side columns keep the
         logo mathematically centered regardless of how much nav
         content sits on either side. Mobile/tablet (<900px) keeps
         the original flex layout (burger · centered logo · icons)
         untouched — these rules only kick in at desktop widths. */
      @media (min-width: 900px) {
        .header-inner {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          column-gap: var(--space-4, 1rem);
        }
        .burger { display: none; }
        .desktop-nav-left {
          grid-column: 1;
          flex: 0 0 auto;
          justify-content: flex-start;
          min-width: 0;
        }
        .logo {
          grid-column: 2;
          justify-self: center;
          flex: unset;
          text-align: center;
          white-space: nowrap;
        }
        .nav-right-group {
          grid-column: 3;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: var(--space-6, 1.5rem);
          min-width: 0;
        }
        .nav-right-group .desktop-nav-right {
          flex: 0 0 auto;
          justify-content: flex-start;
        }
      }
      /* Narrow-desktop squeeze zone (900–1150px): both nav groups plus the
         centered logo are tight in the available 1fr columns at this size —
         tighten gaps so "Saldi · Look · Chi Siamo ▾ · search · cart" never
         wraps or crowds the logo. Wide desktops keep the roomier spacing. */
      @media (min-width: 900px) and (max-width: 1150px) {
        .desktop-nav { gap: var(--space-4, 1rem) !important; }
        .nav-right-group { gap: var(--space-3, 0.75rem) !important; }
        .header-actions { gap: var(--space-2, 0.5rem) !important; }
      }
    `;
    document.head.appendChild(ms);

    // Inject footer (replaces inline <footer> or placeholder on all pages)
    injectFooter();
  }

  /* ── 6. RENDER CART ────────────────────────────────────── */

  function renderCartItems() {
    const body   = document.getElementById('cartDrawerBody');
    const footer = document.getElementById('cartDrawerFooter');
    const badge  = document.getElementById('cartCountBadgeDrawer');
    if (!body || !footer) return;

    const count = cartCount();
    if (badge) badge.textContent = count;

    if (cart.length === 0) {
      body.innerHTML = `
        <div class="cart-empty">
          <svg viewBox="0 0 24 24"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
          <div>
            <strong>Il carrello è vuoto</strong>
            <p>Aggiungi qualcosa di bello per iniziare.</p>
          </div>
        </div>`;
      footer.innerHTML = `<button class="btn-continue-shopping" onclick="closeCart()">Continua lo shopping →</button>`;
      return;
    }

    const total     = cartTotal();
    const FREE_SHIP = 50;
    const remaining = Math.max(0, FREE_SHIP - total);
    const progress  = Math.min(100, (total / FREE_SHIP) * 100);

    body.innerHTML = cart.map(item => `
      <div class="cart-item" data-id="${item.id}">
        <div class="cart-item-img">
          ${(function(){ var im = catalogImg(item.id); return im
            ? '<img src="' + im + '" alt="" style="width:100%;height:100%;object-fit:cover;object-position:center top">'
            : '<div class="ph ' + (item.color || 'ph-blush') + '"><svg viewBox="0 0 60 80" fill="none"><ellipse cx="30" cy="14" rx="10" ry="11" fill="white" opacity=".4"/><path d="M8 80 C8 55 52 55 52 80" fill="white" opacity=".4"/><rect x="14" y="26" width="32" height="34" rx="5" fill="white" opacity=".4"/></svg></div>'; })()}
        </div>
        <div class="cart-item-info">
          <p class="cart-item-name">${item.name}</p>
          ${(function(){
            var parts   = (item.variant || '').split(' · ');
            var color   = parts[0] || '';
            var size    = parts[1] || '';
            var colorTag = color ? '<span class="cart-tag">' + color + '</span>' : '';
            var sizeTag  = size
              ? '<span class="cart-tag cart-tag-size">' + size + '</span>'
              : '<span class="cart-tag cart-tag-none">Taglia non sel.</span>';
            return '<div class="cart-item-tags">' + colorTag + sizeTag + '</div>';
          })()}
          <div class="qty-stepper">
            <button class="qty-btn" onclick="appChangeQty('${item.id}', -1)" aria-label="Diminuisci quantità">−</button>
            <span class="qty-display">${item.qty}</span>
            <button class="qty-btn" onclick="appChangeQty('${item.id}', 1)" aria-label="Aumenta quantità">+</button>
          </div>
        </div>
        <div class="cart-item-right">
          <span class="cart-item-price">€${(item.price * item.qty).toFixed(2).replace('.', ',')}</span>
          <button class="cart-item-remove" onclick="appRemove('${item.id}')">Rimuovi</button>
        </div>
      </div>
    `).join('');

    footer.innerHTML = `
      <div class="shipping-progress">
        <div class="shipping-progress-bar-wrap">
          <div class="shipping-progress-bar" style="width:${progress}%"></div>
        </div>
        <p class="shipping-progress-label">
          ${remaining > 0
            ? `Aggiungi <strong>€${remaining.toFixed(2).replace('.', ',')}</strong> per la <strong>spedizione gratuita</strong>`
            : `<span class="done">✓ Hai la spedizione gratuita!</span>`
          }
        </p>
      </div>
      <div class="express-checkout">
        <p class="express-label">Checkout rapido</p>
        <div class="express-btns">
          <button class="express-btn apple"  onclick="window.location.href='/checkout?pay=card'">Apple Pay</button>
          <button class="express-btn paypal" onclick="window.location.href='/checkout?pay=paypal'">PayPal</button>
          <button class="express-btn klarna" onclick="window.location.href='/checkout?pay=klarna'">Klarna</button>
        </div>
      </div>
      <div class="cart-subtotal">
        <span>Subtotale</span>
        <span class="cart-subtotal-amount">€${total.toFixed(2).replace('.', ',')}</span>
      </div>
      <div class="cart-shipping-note">
        <svg viewBox="0 0 24 24"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
        ${remaining > 0
          ? `Spedizione standard €4,90 — o gratuita sopra €50`
          : `<span class="highlight">Spedizione gratuita applicata</span>`
        }
      </div>
      <a href="/checkout" class="btn-checkout">Vai al checkout</a>
      <button class="btn-continue-shopping" onclick="closeCart()">Continua lo shopping</button>
    `;
  }

  /* ── 6. RENDER WISHLIST ────────────────────────────────── */

  function renderWishlistItems() {
    const body   = document.getElementById('wishlistDrawerBody');
    const footer = document.getElementById('wishlistDrawerFooter');
    const badge  = document.getElementById('wishlistCountBadgeDrawer');
    if (!body || !footer) return;

    if (badge) badge.textContent = wishlist.length;

    if (wishlist.length === 0) {
      body.innerHTML = `
        <div class="cart-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
          <div>
            <strong>Lista desideri vuota</strong>
            <p>Salva i tuoi preferiti con il cuoricino.</p>
          </div>
        </div>`;
      footer.innerHTML = `<button class="btn-continue-shopping" onclick="closeWishlist()">Sfoglia la collezione →</button>`;
      return;
    }

    body.innerHTML = wishlist.map(item => {
      const prod = CATALOG.find(p => item.id === p.id || item.id.startsWith(p.id + '-'));
      const href = prod ? '/product?id=' + prod.id : '/product';
      return `
      <div class="cart-item" data-id="${item.id}">
        <div class="cart-item-img">
          ${(prod && prod.img)
            ? '<img src="' + prod.img + '" alt="" style="width:100%;height:100%;object-fit:cover;object-position:center top">'
            : '<div class="ph ' + (item.colorKey || 'ph-blush') + '"><svg viewBox="0 0 60 80" fill="none"><ellipse cx="30" cy="14" rx="10" ry="11" fill="white" opacity=".4"/><path d="M8 80 C8 55 52 55 52 80" fill="white" opacity=".4"/><rect x="14" y="26" width="32" height="34" rx="5" fill="white" opacity=".4"/></svg></div>'}
        </div>
        <div class="cart-item-info">
          <p class="cart-item-name">${item.name}</p>
          <div class="cart-item-tags">
            ${item.color ? '<span class="cart-tag">' + item.color + '</span>' : ''}
            ${item.taglia
              ? '<span class="cart-tag cart-tag-size">' + item.taglia + '</span>'
              : '<span class="cart-tag cart-tag-none">Taglia non sel.</span>'
            }
          </div>
        </div>
        <div class="cart-item-right">
          <a href="${href}" class="cart-item-remove" style="text-decoration:underline;text-underline-offset:3px;color:inherit;">Vedi</a>
          <button class="cart-item-remove" onclick="appRemoveWishlist('${item.id}')">Rimuovi</button>
        </div>
      </div>
      <button class="wl-move-btn" onclick="appMoveToCart('${item.id}')">
        Sposta nel carrello
      </button>
    `}).join('');

    footer.innerHTML = `
      <a href="shop" class="btn-checkout" style="text-align:center;">Sfoglia la collezione</a>
      <button class="btn-continue-shopping" onclick="closeWishlist()">Chiudi</button>
    `;
  }

  /* ── 7. OPEN / CLOSE ───────────────────────────────────── */

  function openCart() {
    renderCartItems();
    document.getElementById('cartDrawer')?.classList.add('open');
    document.getElementById('appScrim')?.classList.add('visible');
    document.body.style.overflow = 'hidden';
    document.getElementById('searchOverlay')?.classList.remove('open');
    document.getElementById('wishlistDrawer')?.classList.remove('open');
  }

  function closeCart() {
    document.getElementById('cartDrawer')?.classList.remove('open');
    document.getElementById('appScrim')?.classList.remove('visible');
    document.body.style.overflow = '';
  }

  function openWishlist() {
    renderWishlistItems();
    document.getElementById('wishlistDrawer')?.classList.add('open');
    document.getElementById('appScrim')?.classList.add('visible');
    document.body.style.overflow = 'hidden';
    document.getElementById('cartDrawer')?.classList.remove('open');
    document.getElementById('searchOverlay')?.classList.remove('open');
  }

  function closeWishlist() {
    document.getElementById('wishlistDrawer')?.classList.remove('open');
    document.getElementById('appScrim')?.classList.remove('visible');
    document.body.style.overflow = '';
  }

  function openSearch() {
    document.getElementById('searchOverlay')?.classList.add('open');
    document.getElementById('appScrim')?.classList.add('visible');
    document.body.style.overflow = 'hidden';
    setTimeout(() => document.getElementById('searchInput')?.focus(), 50);
    document.getElementById('cartDrawer')?.classList.remove('open');
    document.getElementById('wishlistDrawer')?.classList.remove('open');
    document.getElementById('mobileNavDrawer')?.classList.remove('open');
  }

  function closeSearch() {
    document.getElementById('searchOverlay')?.classList.remove('open');
    document.getElementById('appScrim')?.classList.remove('visible');
    document.body.style.overflow = '';
  }

  function openMobileNav() {
    document.getElementById('mobileNavDrawer')?.classList.add('open');
    document.getElementById('appScrim')?.classList.add('visible');
    document.body.style.overflow = 'hidden';
  }

  function closeMobileNav() {
    document.getElementById('mobileNavDrawer')?.classList.remove('open');
    document.getElementById('appScrim')?.classList.remove('visible');
    document.body.style.overflow = '';
  }

  /* ── 8. TOAST ──────────────────────────────────────────── */

  function showToast(productName) {
    const stack = document.getElementById('toastStack');
    if (!stack) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
      <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
      <span class="toast-text">Aggiunto: <strong>${productName}</strong></span>
      <button class="toast-view-btn" onclick="openCart()">Vedi carrello</button>
    `;
    stack.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('removing');
      toast.addEventListener('animationend', () => toast.remove(), { once: true });
    }, 3500);
  }

  /* ── 9. SEARCH ─────────────────────────────────────────── */

  function wireSearch() {
    const input    = document.getElementById('searchInput');
    const results  = document.getElementById('searchResults');
    const trending = document.getElementById('searchTrending');
    const clearBtn = document.getElementById('searchClearBtn');
    if (!input) return;

    document.querySelectorAll('.search-tag-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        input.value = chip.dataset.query || chip.textContent;
        input.dispatchEvent(new Event('input'));
        input.focus();
      });
    });

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        input.value = '';
        input.dispatchEvent(new Event('input'));
        input.focus();
      });
    }

    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      if (clearBtn) clearBtn.style.display = q ? 'flex' : 'none';

      const isShop = window.location.pathname.includes('shop');
      if (isShop) {
        const cards = document.querySelectorAll('#productGrid .product-card');
        cards.forEach(card => {
          card.style.display = (!q || card.textContent.toLowerCase().includes(q)) ? '' : 'none';
        });
      }

      if (!q) {
        if (results)  results.style.display  = 'none';
        if (trending) trending.style.display = 'block';
        return;
      }

      const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      const words = norm(q).split(/\s+/).filter(Boolean);
      const matches = CATALOG.filter(p => {
        const hay = norm(p.name + ' ' + p.color + ' ' + p.tags.join(' '));
        return words.every(w => hay.includes(w));
      }).slice(0, 6);

      if (trending) trending.style.display = 'none';
      if (!results) return;

      if (matches.length === 0) {
        results.style.display = 'block';
        results.innerHTML = '<p class="search-no-results">Nessun risultato per "<strong>' + input.value + '</strong>"</p>';
        return;
      }

      results.style.display = 'block';
      results.innerHTML =
        '<p class="search-results-label">' + matches.length + ' risultat' + (matches.length === 1 ? 'o' : 'i') + '</p>' +
        '<div class="search-results-grid">' +
        matches.map(function(p) {
          return '<a href="/product?id=' + p.id + '" class="search-result-card">' +
            '<div class="search-result-card-thumb ph ' + p.colorKey + '">' +
              (p.img
                ? '<img src="' + p.img + '" alt="" style="width:100%;height:100%;object-fit:cover;object-position:center top">'
                : '<svg viewBox="0 0 60 80" fill="none">' +
                  '<ellipse cx="30" cy="14" rx="10" ry="11" fill="white" opacity=".4"/>' +
                  '<path d="M8 80 C8 55 52 55 52 80" fill="white" opacity=".4"/>' +
                  '<rect x="14" y="26" width="32" height="34" rx="5" fill="white" opacity=".4"/>' +
                '</svg>') +
            '</div>' +
            '<div class="search-result-card-info">' +
              '<p class="search-result-card-name">' + p.name + '</p>' +
              '<p class="search-result-card-color">' + p.color + '</p>' +
              '<p class="search-result-card-price">' + p.price + '</p>' +
            '</div>' +
          '</a>';
        }).join('') +
        '</div>' +
        '<a href="/search?q=' + encodeURIComponent(input.value) + '" class="search-see-all">Vedi tutti i risultati</a>';
    });

    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        var q = e.target.value.trim();
        if (q) { closeSearch(); window.location.href = '/search?q=' + encodeURIComponent(q); }
      }
      if (e.key === 'Escape') closeSearch();
    });
  }

  /* ── 9b. HEADER SCROLL SHADOW ──────────────────────────── */
  /* Centralized here so every page with a .site-header gets the
     shadow-on-scroll effect — previously this was wired only inside
     index's own inline <script>, so shop/product/look/about
     never received it. */

  function wireHeaderScroll() {
    var header = document.querySelector('.site-header');
    if (!header) return;
    window.addEventListener('scroll', function () {
      header.classList.toggle('scrolled', window.scrollY > 10);
    }, { passive: true });
  }

  /* ── 10. WIRE BUTTONS ──────────────────────────────────── */

  function wireButtons() {
    document.querySelectorAll('.icon-btn[aria-label*="arrello"], .icon-btn[aria-label*="Cart"]').forEach(function(btn) {
      btn.addEventListener('click', function(e) { e.preventDefault(); openCart(); });
    });
    document.querySelectorAll('.icon-btn[aria-label*="erca"]').forEach(function(btn) {
      btn.addEventListener('click', function(e) { e.preventDefault(); openSearch(); });
    });
    document.querySelectorAll('.burger, [aria-label="Menu"], [aria-label="Apri menu"]').forEach(function(btn) {
      btn.addEventListener('click', openMobileNav);
    });

    wireHeaderScroll();

    // Mega-menu: JS-controlled open/close with close-delay so the mouse
    // can travel from the trigger into the panel without the gap closing it.
    var megaTimers = {};
    document.querySelectorAll('.mega-trigger').forEach(function(trigger) {
      var key = trigger.dataset.mega || Math.random();
      function openMega() {
        clearTimeout(megaTimers[key]);
        document.querySelectorAll('.mega-trigger').forEach(function(t) {
          if (t !== trigger) t.classList.remove('is-open');
        });
        trigger.classList.add('is-open');
      }
      function closeMega() {
        megaTimers[key] = setTimeout(function() {
          trigger.classList.remove('is-open');
        }, 120);
      }
      trigger.addEventListener('mouseenter', openMega);
      trigger.addEventListener('mouseleave', closeMega);
      var panel = trigger.querySelector('.mega-panel');
      if (panel) {
        panel.addEventListener('mouseenter', function() { clearTimeout(megaTimers[key]); });
        panel.addEventListener('mouseleave', closeMega);
      }
    });
    // Close all mega panels when clicking outside
    document.addEventListener('click', function(e) {
      if (!e.target.closest('.mega-trigger')) {
        document.querySelectorAll('.mega-trigger').forEach(function(t) { t.classList.remove('is-open'); });
      }
    });

    var wlBtn = document.getElementById('wishlistHeaderBtn');
    if (wlBtn) wlBtn.addEventListener('click', function(e) { e.preventDefault(); openWishlist(); });

    var cc = document.getElementById('cartCloseBtn');     if (cc) cc.addEventListener('click', closeCart);
    var wc = document.getElementById('wishlistCloseBtn'); if (wc) wc.addEventListener('click', closeWishlist);
    var sc = document.getElementById('searchCloseBtn');   if (sc) sc.addEventListener('click', closeSearch);
    var nc = document.getElementById('mobileNavClose');   if (nc) nc.addEventListener('click', closeMobileNav);

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') { closeCart(); closeSearch(); closeMobileNav(); closeWishlist(); closeAuthModal(); closeAccountDrawer(); }
    });

    var scrim = document.getElementById('appScrim');
    if (scrim) scrim.addEventListener('click', function() { closeCart(); closeMobileNav(); closeWishlist(); closeSearch(); closeAccountDrawer(); });

    wireProductCards();
    wirePDP();
    wireLookItems();
    wireSearch();
  }

  /* ── 11. PRODUCT CARDS ─────────────────────────────────── */

  function wireProductCards() {
    document.querySelectorAll('.product-card').forEach(function(card) {
      card.style.cursor = 'pointer';
      card.addEventListener('click', function() {
        var dataId = card.dataset.id;
        if (dataId) { window.location.href = '/product?id=' + dataId; return; }
        var nameEl = card.querySelector('.product-name');
        var name   = nameEl ? nameEl.textContent.trim() : '';
        var prod   = CATALOG.find(function(p) { return p.name === name; });
        window.location.href = prod ? '/product?id=' + prod.id : '/product';
      });
    });

    document.querySelectorAll('.product-quick-add .size-chip:not(.oos):not(.disabled)').forEach(function(chip) {
      chip.addEventListener('click', function(e) {
        e.stopPropagation();
        var card  = chip.closest('.product-card');
        var name  = (card && card.querySelector('.product-name') && card.querySelector('.product-name').textContent.trim()) || 'Prodotto';
        var color = (card && card.querySelector('.product-color') && card.querySelector('.product-color').textContent.trim()) || '';
        var priceEl = card && card.querySelector('.price-current');
        var price = parseFloat((priceEl ? priceEl.textContent : '0').replace('€','').replace(',','.')) || 0;
        var size  = chip.textContent.trim();
        // Use the real product id from the card (set from the API); only slugify the
        // name as a last-resort fallback. Slugified names diverge from real slugs
        // (e.g. "Borsa Tote Lino" vs "borsa-tote-lino"), corrupting cart/PDP matching.
        var baseId = (card && card.dataset.id) ? card.dataset.id : name.toLowerCase().replace(/\s+/g, '-');
        var id    = baseId + '-' + size.toLowerCase();
        var chips = chip.closest('.size-chips');
        if (chips) chips.querySelectorAll('.size-chip').forEach(function(c) {
          c.style.background = ''; c.style.color = ''; c.style.borderColor = '';
          c.removeAttribute('data-selected');
        });
        chip.style.background = 'var(--espresso)';
        chip.style.color = 'var(--white)';
        chip.style.borderColor = 'var(--espresso)';
        chip.setAttribute('data-selected', 'true');
        addToCart({ id: id, name: name, variant: color + ' · ' + size, price: price, color: getCardColor(card) });
        openCart();
      });
    });

    document.querySelectorAll('.product-wishlist').forEach(function(btn) {
      var card     = btn.closest('.product-card');
      var name     = (card && card.querySelector('.product-name') && card.querySelector('.product-name').textContent.trim()) || 'Prodotto';
      var color    = (card && card.querySelector('.product-color') && card.querySelector('.product-color').textContent.trim()) || '';
      var colorKey = getCardColor(card);
      // Prefer the real product id (from the API) so the heart state matches the PDP.
      var id       = (card && card.dataset.id) ? card.dataset.id : name.toLowerCase().replace(/\s+/g, '-');
      btn.dataset.id = id;
      // Restore persisted heart state via CSS class (not inline style)
      btn.classList.toggle('is-wishlisted', isWishlisted(id));
      btn.setAttribute('aria-label', isWishlisted(id) ? 'Rimuovi dalla wishlist' : 'Aggiungi alla wishlist');
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var activeChip = card && card.querySelector('.size-chip[data-selected="true"]');
        var taglia = activeChip ? activeChip.textContent.trim() : null;
        toggleWishlist(id, name, color, colorKey, taglia);
        var wishlisted = isWishlisted(id);
        btn.classList.toggle('is-wishlisted', wishlisted);
        btn.setAttribute('aria-label', wishlisted ? 'Rimuovi dalla wishlist' : 'Aggiungi alla wishlist');
      });
    });
  }

  function getCardColor(card) {
    var el = card && (card.querySelector('.product-img-main') || card.querySelector('.product-img-wrap > div'));
    if (!el) return 'ph-blush';
    var classes = ['ph-blush','ph-sage','ph-lavender','ph-cream','ph-peach','ph-mint'];
    for (var i = 0; i < classes.length; i++) {
      if (el.classList.contains(classes[i])) return classes[i];
    }
    return 'ph-blush';
  }

  /* ── 12. PDP ───────────────────────────────────────────── */
  /* NOTE: product has its own ATC click handler (with the morph
     state machine + flyToCart animation). wirePDP here only handles
     the no-size-selected validation flash — it does NOT add to cart
     a second time, so there is no double-add. */

  function wirePDP() {
    var atcBtn = document.getElementById('atcBtn');
    if (!atcBtn) return;
    // product already attached the main click handler via its
    // own <script> block. We only need to ensure that if the button
    // is clicked without a size, the size grid gets the outline flash.
    // The product handler guards with `if (!selectedSize) return;`
    // so we can't easily intercept that here — the page script handles it.
    // Nothing more to wire from app.js on the PDP.
  }

  /* ── 13. LOOK ITEMS ────────────────────────────────────── */

  function wireLookItems() {
    document.querySelectorAll('.btn-item-cart').forEach(function(btn) {
      if (btn.hasAttribute('onclick')) return; // inline onclick handles it; skip to avoid double-fire
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var item  = btn.closest('.look-item');
        var name  = (item && item.querySelector('.look-item-name')  && item.querySelector('.look-item-name').textContent.trim())  || 'Prodotto';
        var color = (item && item.querySelector('.look-item-color') && item.querySelector('.look-item-color').textContent.trim()) || '';
        var priceEl = item && item.querySelector('.look-item-price');
        var price = parseFloat((priceEl ? priceEl.textContent : '0').replace('€','').replace(',','.')) || 0;
        addToCart({ id: name.toLowerCase().replace(/\s+/g, '-'), name: name, variant: color, price: price, color: 'ph-blush' });
        openCart();
      });
    });
  }

  /* ── 14. UPDATE BADGES ─────────────────────────────────── */

  function updateCartBadges() {
    var count = cartCount();
    document.querySelectorAll('.cart-badge:not(#wishlistBadge)').forEach(function(b) {
      b.textContent = count;
      b.style.display = count > 0 ? 'flex' : 'none';
      // Pop animation: remove then re-add the class so it retriggers
      b.classList.remove('badge-pop');
      void b.offsetWidth; // reflow to reset animation
      if (count > 0) b.classList.add('badge-pop');
    });
    var db = document.getElementById('cartCountBadgeDrawer');
    if (db) db.textContent = count;
    // Dispatch custom event — any page can listen for cartUpdated
    window.dispatchEvent(new CustomEvent('cartUpdated', { detail: { count: count } }));
  }

  /* ── 15. AUTH ──────────────────────────────────────────── */

  /* ── AUTH — backed by MEMI Backend API ─────────────────────
     JWT token is stored in localStorage('memi_token').
     The legacy 'memi_session' key is still written for backwards
     compatibility with pages that read it (e.g. checkout prefill).
     ─────────────────────────────────────────────────────────── */
  const AUTH_SESSION_KEY = 'memi_session';

  function getCurrentUser() {
    try { return JSON.parse(localStorage.getItem(AUTH_SESSION_KEY)); } catch(_) { return null; }
  }
  function _saveSession(user) {
    try { localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({ email: user.email, name: user.nome || user.name })); } catch(_) {}
  }
  function clearSession() {
    try {
      localStorage.removeItem(AUTH_SESSION_KEY);
      localStorage.removeItem('memi_token');
    } catch(_) {}
  }

  /* Async wrappers — these call MemiAPI if available, otherwise fall back to
     a plain error so the UI shows the right message. */
  async function authLogin(email, password) {
    if (!window.MemiAPI) return { ok: false, msg: 'API non disponibile' };
    try {
      var data = await window.MemiAPI.auth.login(email, password);
      _saveSession(data.user);
      return { ok: true, user: data.user };
    } catch(err) {
      return { ok: false, msg: (err && err.error) || 'Errore di login' };
    }
  }

  async function authRegister(name, email, password) {
    if (!window.MemiAPI) return { ok: false, msg: 'API non disponibile' };
    try {
      var data = await window.MemiAPI.auth.register(name, email, password);
      _saveSession(data.user);
      return { ok: true, user: data.user };
    } catch(err) {
      return { ok: false, msg: (err && err.error) || 'Errore di registrazione' };
    }
  }

  function authLogout() {
    if (window.MemiAPI) window.MemiAPI.auth.logout();
    clearSession();
  }

  function openAuthDrawer(tab) {
    document.getElementById('authDrawer')?.classList.add('open');
    document.getElementById('appScrim')?.classList.add('visible');
    document.body.style.overflow = 'hidden';
    switchAuthTab(tab || 'login');
  }

  function openAuthModal(tab) { openAuthDrawer(tab); }   /* alias */

  function closeAuthDrawer() {
    document.getElementById('authDrawer')?.classList.remove('open');
    document.getElementById('appScrim')?.classList.remove('visible');
    document.body.style.overflow = '';
  }

  function closeAuthModal() { closeAuthDrawer(); }       /* alias */

  function switchAuthTab(tab) {
    var isLogin = tab !== 'register';
    document.getElementById('authTabLogin')?.classList.toggle('active', isLogin);
    document.getElementById('authTabRegister')?.classList.toggle('active', !isLogin);
    var lp = document.getElementById('authPanelLogin');
    var rp = document.getElementById('authPanelRegister');
    if (!lp || !rp) return;
    if (isLogin) {
      lp.className = 'auth-panel';
      lp.style.cssText = 'opacity:1;transform:translateX(0);position:relative;pointer-events:auto';
      rp.className = 'auth-panel auth-panel--right';
      rp.style.cssText = 'opacity:0;transform:translateX(32px);position:absolute;top:0;left:0;right:0;pointer-events:none';
    } else {
      rp.className = 'auth-panel';
      rp.style.cssText = 'opacity:1;transform:translateX(0);position:relative;pointer-events:auto';
      lp.className = 'auth-panel auth-panel--left';
      lp.style.cssText = 'opacity:0;transform:translateX(-32px);position:absolute;top:0;left:0;right:0;pointer-events:none';
    }
  }

  function openAccountDrawer() {
    const user = getCurrentUser();
    if (!user) { openAuthModal('login'); return; }
    document.getElementById('accountAvatar').textContent    = user.name.charAt(0).toUpperCase();
    document.getElementById('accountInfoName').textContent  = user.name;
    document.getElementById('accountInfoEmail').textContent = user.email;
    document.getElementById('accountDrawer')?.classList.add('open');
    document.getElementById('appScrim')?.classList.add('visible');
    document.body.style.overflow = 'hidden';
  }

  function closeAccountDrawer() {
    document.getElementById('accountDrawer')?.classList.remove('open');
    document.getElementById('appScrim')?.classList.remove('visible');
    document.body.style.overflow = '';
  }

  function updateAuthUI() {
    const user = getCurrentUser();
    const btn  = document.getElementById('authHeaderBtn');
    if (!btn) return;
    if (user) {
      btn.classList.add('user-logged');
      btn.textContent = user.name.charAt(0).toUpperCase();
      btn.setAttribute('aria-label', 'Il mio account — ' + user.name);
    } else {
      btn.classList.remove('user-logged');
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
      btn.setAttribute('aria-label', 'Accedi o registrati');
    }
  }

  function showAuthToast(msg) {
    const stack = document.getElementById('toastStack');
    if (!stack) return;
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg><span class="toast-text">${msg}</span>`;
    stack.appendChild(t);
    setTimeout(() => { t.classList.add('removing'); t.addEventListener('animationend', () => t.remove(), { once: true }); }, 3500);
  }

  /* ── Real-time field validation helper ── */
  function validateEmailField(inputEl, hintEl, fieldEl) {
    var val = inputEl.value.trim();
    var ok  = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
    if (!val) { fieldEl.classList.remove('field-error','field-valid'); hintEl.textContent = ''; return false; }
    fieldEl.classList.toggle('field-error', !ok);
    fieldEl.classList.toggle('field-valid',  ok);
    hintEl.textContent = ok ? '' : 'Indirizzo email non valido.';
    return ok;
  }

  function validatePwdField(inputEl, hintEl, fieldEl, min) {
    var val = inputEl.value;
    var ok  = val.length >= (min || 6);
    if (!val) { fieldEl.classList.remove('field-error','field-valid'); hintEl.textContent = ''; return false; }
    fieldEl.classList.toggle('field-error', !ok);
    fieldEl.classList.toggle('field-valid',  ok);
    hintEl.textContent = ok ? '' : 'Minimo ' + (min || 6) + ' caratteri.';
    return ok;
  }

  function wireEyeBtns() {
    document.querySelectorAll('.auth-eye-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var target = document.getElementById(this.dataset.target);
        if (!target) return;
        var isText = target.type === 'text';
        target.type = isText ? 'password' : 'text';
        var open   = this.querySelector('.eye-open');
        var closed = this.querySelector('.eye-closed');
        if (open)   open.style.display   = isText ? '' : 'none';
        if (closed) closed.style.display = isText ? 'none' : '';
      });
    });
  }

  function wireAuth() {
    document.getElementById('authTabLogin')?.addEventListener('click',    function() { switchAuthTab('login'); });
    document.getElementById('authTabRegister')?.addEventListener('click', function() { switchAuthTab('register'); });
    document.getElementById('authCloseBtn')?.addEventListener('click',    closeAuthDrawer);
    document.getElementById('authGuestBtn')?.addEventListener('click',    closeAuthDrawer);

    /* Real-time validation — login */
    var loginEmailEl   = document.getElementById('authLoginEmail');
    var loginEmailHint = document.getElementById('authLoginEmailHint');
    var loginEmailFld  = document.getElementById('authLoginEmailField');
    var loginPwdEl     = document.getElementById('authLoginPwd');
    var loginPwdHint   = document.getElementById('authLoginPwdHint');
    var loginPwdFld    = document.getElementById('authLoginPwdField');
    if (loginEmailEl) loginEmailEl.addEventListener('input', function() {
      validateEmailField(loginEmailEl, loginEmailHint, loginEmailFld);
    });
    if (loginPwdEl) loginPwdEl.addEventListener('input', function() {
      validatePwdField(loginPwdEl, loginPwdHint, loginPwdFld, 8);
    });

    /* Real-time validation — register */
    var regEmailEl   = document.getElementById('authRegEmail');
    var regEmailHint = document.getElementById('authRegEmailHint');
    var regEmailFld  = document.getElementById('authRegEmailField');
    var regPwdEl     = document.getElementById('authRegPwd');
    var regPwdHint   = document.getElementById('authRegPwdHint');
    var regPwdFld    = document.getElementById('authRegPwdField');
    if (regEmailEl) regEmailEl.addEventListener('input', function() {
      validateEmailField(regEmailEl, regEmailHint, regEmailFld);
    });
    if (regPwdEl) regPwdEl.addEventListener('input', function() {
      validatePwdField(regPwdEl, regPwdHint, regPwdFld, 8);
    });

    /* Eye toggle */
    wireEyeBtns();

    /* Login submit with fetch() placeholder */
    document.getElementById('authLoginForm')?.addEventListener('submit', function(e) {
      e.preventDefault();
      var email  = (loginEmailEl ? loginEmailEl.value.trim() : '');
      var pwd    = (loginPwdEl   ? loginPwdEl.value : '');
      var errEl  = document.getElementById('authLoginError');
      var btn    = document.getElementById('authLoginBtn');
      errEl.textContent = '';

      var emailOk = validateEmailField(loginEmailEl, loginEmailHint, loginEmailFld);
      var pwdOk   = validatePwdField(loginPwdEl, loginPwdHint, loginPwdFld, 1);
      if (!emailOk || !pwdOk || !email || !pwd) {
        if (!email || !pwd) errEl.textContent = 'Inserisci email e password.';
        return;
      }

      /* Loading state */
      if (btn) btn.classList.add('is-loading');

      authLogin(email, pwd).then(function(res) {
        if (btn) btn.classList.remove('is-loading');
        if (!res.ok) { errEl.textContent = res.msg; return; }
        closeAuthDrawer();
        updateAuthUI();
        renderWishlistItems();
        var displayName = (res.user && (res.user.nome || res.user.name)) || email;
        showAuthToast('Bentornata, ' + displayName + '!');
      });
    });

    /* Register submit with fetch() placeholder */
    document.getElementById('authRegisterForm')?.addEventListener('submit', function(e) {
      e.preventDefault();
      var name   = (document.getElementById('authRegName')  ? document.getElementById('authRegName').value.trim()  : '');
      var email  = (regEmailEl ? regEmailEl.value.trim() : '');
      var pwd    = (regPwdEl   ? regPwdEl.value : '');
      var errEl  = document.getElementById('authRegError');
      var btn    = document.getElementById('authRegBtn');
      errEl.textContent = '';

      var emailOk = validateEmailField(regEmailEl, regEmailHint, regEmailFld);
      var pwdOk   = validatePwdField(regPwdEl, regPwdHint, regPwdFld, 8);
      if (!name || !emailOk || !pwdOk) {
        if (!name) errEl.textContent = 'Inserisci il tuo nome.';
        return;
      }

      /* Loading state */
      if (btn) btn.classList.add('is-loading');

      authRegister(name, email, pwd).then(function(res) {
        if (btn) btn.classList.remove('is-loading');
        if (!res.ok) { errEl.textContent = res.msg; return; }
        closeAuthDrawer();
        updateAuthUI();
        showAuthToast('Benvenuta, ' + name + '! Account creato ✦');
      });
    });

    document.getElementById('authHeaderBtn')?.addEventListener('click', function() {
      getCurrentUser() ? openAccountDrawer() : openAuthDrawer('login');
    });

    document.getElementById('accountCloseBtn')?.addEventListener('click', closeAccountDrawer);
    document.getElementById('accountToWishlist')?.addEventListener('click', function() {
      closeAccountDrawer(); openWishlist();
    });
    document.getElementById('accountLogoutBtn')?.addEventListener('click', function() {
      authLogout();
      closeAccountDrawer();
      updateAuthUI();
      showAuthToast("Hai effettuato il logout.");
    });
  }

  /* ── 15b. SCROLL STAGGER — product cards ──────────────── */
  /* IntersectionObserver reveals each .product-card with a staggered
     delay based on its position within the visible batch. */

  function wireScrollStagger() {
    var cards = document.querySelectorAll('.product-card');
    if (!cards.length) return;

    var batchStart = 0; // tracks which card opened the current batch
    var observer = new IntersectionObserver(function(entries) {
      // Collect newly-intersecting cards in DOM order
      var entering = [];
      entries.forEach(function(e) {
        if (e.isIntersecting && !e.target.classList.contains('in-view')) {
          entering.push(e.target);
        }
      });
      // Sort by DOM position so stagger reads left→right, top→bottom
      entering.sort(function(a, b) {
        var ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
        if (Math.abs(ra.top - rb.top) > 40) return ra.top - rb.top;
        return ra.left - rb.left;
      });
      entering.forEach(function(card, idx) {
        card.style.setProperty('--i', idx);
        card.classList.add('in-view');
        observer.unobserve(card);
      });
    }, { threshold: 0.12 });

    cards.forEach(function(card) { observer.observe(card); });
  }

  /* ── 15c. MAGNETIC HOVER ────────────────────────────────
     Subtle 2–4° tilt + scale on .btn-primary and .product-card.
     Capped and eased so it feels premium, not gimmicky.    */

  function wireMagneticHover() {
    // Only on non-touch devices
    if (window.matchMedia('(hover: none)').matches) return;

    // Product cards — very subtle, they already have a lift/shadow hover
    document.querySelectorAll('.product-card').forEach(function(card) {
      card.addEventListener('mousemove', function(e) {
        if (!card.classList.contains('in-view')) return;
        var r = card.getBoundingClientRect();
        var x = ((e.clientX - r.left) / r.width  - 0.5) * 2; // -1..1
        var y = ((e.clientY - r.top)  / r.height - 0.5) * 2;
        card.style.transform = 'translateY(-3px) rotateX(' + (-y * 2.5) + 'deg) rotateY(' + (x * 2.5) + 'deg)';
        card.style.transition = 'transform 120ms ease-out, box-shadow var(--dur-med) var(--ease-out)';
      });
      card.addEventListener('mouseleave', function() {
        card.style.transform = '';
        card.style.transition = '';
      });
    });

    // Primary CTAs — slightly stronger tilt
    document.querySelectorAll('.btn-primary').forEach(function(btn) {
      btn.addEventListener('mousemove', function(e) {
        var r = btn.getBoundingClientRect();
        var x = ((e.clientX - r.left) / r.width  - 0.5) * 2;
        var y = ((e.clientY - r.top)  / r.height - 0.5) * 2;
        btn.style.transform = 'translateY(-1px) rotateX(' + (-y * 4) + 'deg) rotateY(' + (x * 4) + 'deg) scale(1.02)';
        btn.style.transition = 'transform 100ms ease-out';
      });
      btn.addEventListener('mouseleave', function() {
        btn.style.transform = '';
        btn.style.transition = '';
      });
    });
  }

  /* ── 15d. FLY-TO-CART ───────────────────────────────────
     Clone the source element and animate it to the cart icon. */

  function flyToCart(sourceEl) {
    var cartIcon = document.querySelector('.icon-btn[aria-label*="arrello"] .cart-badge');
    var cartBtn  = cartIcon ? cartIcon.closest('.icon-btn') : null;
    if (!sourceEl || !cartBtn) return;
    var start = sourceEl.getBoundingClientRect();
    var end   = cartBtn.getBoundingClientRect();
    var clone = sourceEl.cloneNode(true);
    clone.className = 'fly-thumb';
    Object.assign(clone.style, {
      left:   start.left   + 'px',
      top:    start.top    + 'px',
      width:  start.width  + 'px',
      height: start.height + 'px',
    });
    document.body.appendChild(clone);
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        clone.style.transform = 'translate(' + (end.left - start.left) + 'px, ' + (end.top - start.top) + 'px) scale(0.12)';
        clone.style.opacity   = '0';
      });
    });
    clone.addEventListener('transitionend', function() { clone.remove(); }, { once: true });
    // Fallback remove
    setTimeout(function() { clone.remove(); }, 800);
  }


  /* ── 16. WIRE REVEAL ──────────────────────────────────── */

  function wireReveal() {
    var els = document.querySelectorAll('.reveal:not(.visible)');
    if (!els.length) return;
    var obs = new IntersectionObserver(function(entries) {
      entries.forEach(function(e) {
        if (e.isIntersecting) {
          e.target.classList.add('visible');
          obs.unobserve(e.target);
        }
      });
    }, { threshold: 0.15 });
    els.forEach(function(el) { obs.observe(el); });
  }

  /* ── 16b. NEWSLETTER SIGNUP ──────────────────────────────── */

  function wireNewsletterForms() {
    var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    document.querySelectorAll('.newsletter-form, .footer-newsletter-form').forEach(function(form) {
      if (form.dataset.newsletterBound) return;
      form.dataset.newsletterBound = '1';
      form.addEventListener('submit', function(e) {
        e.preventDefault();
        var input = form.querySelector('input[type="email"]');
        var btn   = form.querySelector('button[type="submit"]');
        var email = input ? input.value.trim() : '';
        if (!email || !EMAIL_RE.test(email)) {
          if (input) {
            input.style.borderColor = '#C4A8B0';
            input.focus();
            input.addEventListener('input', function reset() {
              input.style.borderColor = '';
              input.removeEventListener('input', reset);
            });
          }
          return;
        }
        if (btn && btn.dataset.busy) return;
        if (btn) { btn.dataset.busy = '1'; btn.disabled = true; }
        var orig = btn ? btn.innerHTML : '';
        if (btn) btn.innerHTML = '…';

        var apiBase = (window.MemiAPI && window.MemiAPI._base) || '/api';
        fetch(apiBase + '/newsletter/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email, fonte: 'storefront' }),
        })
          .then(function(r) { return r.json().catch(function(){ return {}; }); })
          .then(function(data) {
            if (btn) {
              btn.innerHTML = data.error ? '✗ Errore' : '✓ Iscritto!';
              setTimeout(function() {
                btn.innerHTML = orig;
                btn.disabled = false;
                delete btn.dataset.busy;
              }, 2600);
            }
            if (!data.error && input) input.value = '';
          })
          .catch(function() {
            if (btn) {
              btn.innerHTML = orig;
              btn.disabled = false;
              delete btn.dataset.busy;
            }
          });
      });
    });
  }

  /* ── 16b. ICON PULSE ON PAGE LOAD ──────────────────────── */
  /* Compares current cart/wishlist count against the last count the
     user saw (stored in sessionStorage). If the count grew, the icon
     gets a short pulse ring so the user notices new items.
     sessionStorage clears when the browser tab is closed, so the pulse
     only fires during the same browsing session. */

  var PULSE_CART_KEY  = 'memi_cart_seen';
  var PULSE_WISH_KEY  = 'memi_wish_seen';

  // Inject the pulse keyframe once into <head>
  (function injectPulseStyle() {
    if (document.getElementById('memi-pulse-style')) return;
    var s = document.createElement('style');
    s.id = 'memi-pulse-style';
    s.textContent =
      '@keyframes iconPulseRing{' +
        '0%{box-shadow:0 0 0 0 rgba(201,137,122,.55)}' +
        '60%{box-shadow:0 0 0 10px rgba(201,137,122,0)}' +
        '100%{box-shadow:0 0 0 0 rgba(201,137,122,0)}' +
      '}' +
      '.icon-pulse{animation:iconPulseRing 700ms ease-out 3}';
    document.head.appendChild(s);
  })();

  function pulseIconIfNew() {
    // ── Cart ──
    var cartNow  = cartCount();
    var cartSeen = parseInt(sessionStorage.getItem(PULSE_CART_KEY) || '0', 10);
    if (cartNow > cartSeen) {
      // Delay slightly so header is fully injected first
      setTimeout(function() {
        document.querySelectorAll('.icon-btn[aria-label*="arrello"], .icon-btn[aria-label*="Cart"]').forEach(function(btn) {
          btn.classList.remove('icon-pulse');
          void btn.offsetWidth; // reflow
          btn.classList.add('icon-pulse');
          btn.addEventListener('animationend', function() { btn.classList.remove('icon-pulse'); }, { once: true });
        });
      }, 350);
    }
    sessionStorage.setItem(PULSE_CART_KEY, cartNow);

    // ── Wishlist ──
    var wishNow  = wishlist.length;
    var wishSeen = parseInt(sessionStorage.getItem(PULSE_WISH_KEY) || '0', 10);
    if (wishNow > wishSeen) {
      setTimeout(function() {
        var wlBtn = document.getElementById('wishlistHeaderBtn');
        if (wlBtn) {
          wlBtn.classList.remove('icon-pulse');
          void wlBtn.offsetWidth;
          wlBtn.classList.add('icon-pulse');
          wlBtn.addEventListener('animationend', function() { wlBtn.classList.remove('icon-pulse'); }, { once: true });
        }
      }, 450);
    }
    sessionStorage.setItem(PULSE_WISH_KEY, wishNow);
  }

  /* ── 17. INIT ──────────────────────────────────────────── */

  function init() {
    injectMarkup();
    // Restore persisted badge counts from localStorage immediately after
    // the header is injected — fixes the "badge resets on page change" bug.
    updateCartBadges();
    updateWishlistBadge();
    pulseIconIfNew();
    wireButtons();
    wireScrollStagger();
    wireReveal();
    wireMagneticHover();
    wireAuth();
    wireNewsletterForms();
  }


  /* == 18. GLOBAL EXPORTS == */

  window.addToCart           = addToCart;
  window.flyToCart           = flyToCart;
  window.openCart            = openCart;
  window.closeCart           = closeCart;
  window.openWishlist        = openWishlist;
  window.closeWishlist       = closeWishlist;
  window.openSearch          = openSearch;
  window.closeSearch         = closeSearch;
  window.appChangeQty        = changeQty;
  window.appRemove           = removeFromCart;
  window.wireProductCards    = wireProductCards;
  window.rewireScrollStagger = function() { wireScrollStagger(); };

  window.appRemoveWishlist = function(id) {
    var entry  = wishlist.find(function(i) { return i.id === id; });
    var baseId = entry ? (entry.productId || id) : id;
    wishlist = wishlist.filter(function(i) { return i.id !== id; });
    saveWishlist();
    updateWishlistBadge();
    renderWishlistItems();
    if (!wishlist.some(function(i) { return (i.productId || i.id) === baseId; })) {
      document.querySelectorAll('.product-wishlist[data-id="' + baseId + '"]').forEach(function(btn) {
        btn.classList.remove('is-wishlisted');
        btn.setAttribute('aria-label', 'Aggiungi alla wishlist');
      });
    }
  };

  window.appMoveToCart = function(id) {
    var entry = wishlist.find(function(i) { return i.id === id; });
    if (!entry) return;
    var prod  = CATALOG.find(function(p) {
      return p.id === (entry.productId || entry.id) || entry.id.startsWith(p.id);
    });
    var price = prod ? parseFloat((prod.price || '0').replace('\u20ac','').replace(',','.')) || 0 : 0;
    addToCart({
      id:      entry.id + '-cart',
      name:    entry.name,
      variant: (entry.color || '') + (entry.taglia ? ' · ' + entry.taglia : ''),
      price:   price,
      color:   entry.colorKey || 'ph-blush'
    });
    window.appRemoveWishlist(id);
    closeWishlist();
    openCart();
  };

  /* == 19. BOOT == */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
  