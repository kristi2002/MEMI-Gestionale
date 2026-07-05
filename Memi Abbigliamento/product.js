/* ============================================================
   PRODUCT.JS — Memi Abbigliamento
   Shared PDP interactivity for every /products/<slug>/index.html
   page: gallery thumbnail swap, size selection, add-to-cart morph
   (hooks into the global cart/wishlist functions app.js exposes),
   and the description/shipping accordions.
   ============================================================ */
(function () {
  'use strict';

  function selectThumb(btn) {
    document.querySelectorAll('.thumb').forEach(function (t) { t.classList.remove('active'); });
    btn.classList.add('active');
    var cls = btn.dataset.imgClass;
    var main = document.getElementById('mainImg');
    if (main) main.className = 'ph-fig ' + cls;
  }
  window.selectThumb = selectThumb;

  var selectedSize = null;
  function selectSize(btn) {
    document.querySelectorAll('.size-btn').forEach(function (b) { b.classList.remove('active'); });
    btn.classList.add('active');
    selectedSize = btn.textContent.trim();
    var label = document.getElementById('sizeLabel');
    if (label) label.textContent = '— ' + selectedSize;
    var atc = document.getElementById('atcBtn');
    if (atc) { atc.disabled = false; atc.style.opacity = '1'; atc.style.cursor = 'pointer'; }
  }
  window.selectSize = selectSize;

  function toggleAccordion(btn) {
    btn.parentElement.classList.toggle('open');
  }
  window.toggleAccordion = toggleAccordion;

  document.addEventListener('DOMContentLoaded', function () {
    var root = document.getElementById('pdpRoot');
    if (!root) return;
    var productId    = root.dataset.id;
    var productName  = root.dataset.name;
    var productPrice = parseFloat(root.dataset.price);
    var colorKey     = root.dataset.colorKey;
    var colorLabel   = root.dataset.colorLabel;
    var hasSizes     = root.dataset.hasSizes === '1';

    var atcBtn = document.getElementById('atcBtn');
    if (atcBtn) {
      if (!hasSizes) { atcBtn.disabled = false; atcBtn.style.opacity = '1'; }
      else { atcBtn.style.opacity = '.5'; atcBtn.style.cursor = 'not-allowed'; }

      atcBtn.addEventListener('click', function () {
        if (hasSizes && !selectedSize) return;
        if (this.classList.contains('is-loading') || this.classList.contains('is-done')) return;
        this.classList.add('is-loading');
        var self = this;
        setTimeout(function () {
          self.classList.remove('is-loading');
          self.classList.add('is-done');
          if (typeof window.addToCart === 'function') {
            var variantBits = [colorLabel];
            if (hasSizes && selectedSize) variantBits.push(selectedSize);
            window.addToCart({
              id: productId + (selectedSize ? '-' + selectedSize.toLowerCase() : ''),
              name: productName,
              variant: variantBits.join(' · '),
              price: productPrice,
              color: colorKey
            });
          }
          var galleryEl = document.getElementById('mainImg');
          if (galleryEl && typeof window.flyToCart === 'function') window.flyToCart(galleryEl);
          setTimeout(function () { window.openCart && window.openCart(); }, 450);
          setTimeout(function () { self.classList.remove('is-done'); }, 1800);
        }, 320);
      });
    }

    var wishlistBtn = document.getElementById('wishlistBtn');
    if (wishlistBtn) {
      function syncWishBtn() {
        try {
          var wl  = JSON.parse(localStorage.getItem('memi_wishlist')) || [];
          // Match on base productId OR productId+size variant
          var on  = wl.some(function (i) {
            return i.productId === productId || i.id === productId ||
                   (selectedSize && i.id === productId + '-sz-' + selectedSize);
          });
          var heart = document.getElementById('wishlistHeart');
          var label = document.getElementById('wishlistBtnLabel');
          wishlistBtn.classList.toggle('active', on);
          wishlistBtn.classList.toggle('is-wishlisted', on);
          if (heart) heart.style.fill = on ? 'var(--blush-dark)' : 'none';
          if (label) label.textContent = on ? 'Nella wishlist ✓' : 'Salva nella wishlist';
        } catch (_) {}
      }
      syncWishBtn();
      wishlistBtn.addEventListener('click', function () {
        if (typeof window.toggleWishlist === 'function') {
          window.toggleWishlist(productId, productName, colorLabel, colorKey, selectedSize);
        }
        syncWishBtn();
      });
    }
  });
})();

/* ============================================================
   PRODUCT REVIEWS — loads + renders published reviews and
   shows a submission form for the current product page.
   Appended here so it works across all 23 product pages
   without touching each individual HTML file.
   ============================================================ */
(function () {
  'use strict';

  function stars(n) {
    var s = '';
    for (var i = 1; i <= 5; i++) s += '<span style="color:' + (i <= n ? '#6B6BA3' : '#DBDBEE') + ';font-size:16px">★</span>';
    return s;
  }

  function renderReviews(productId, container) {
    if (!window.MemiAPI || !window.MemiAPI.reviews) return;
    window.MemiAPI.reviews.forProduct(productId).then(function (res) {
      var list = Array.isArray(res) ? res : (res && res.reviews) || [];
      var avg = list.length ? (list.reduce(function (s, r) { return s + (r.rating || 0); }, 0) / list.length).toFixed(1) : null;
      var html = '<section class="reviews-section" style="margin-top:40px;padding-top:32px;border-top:1px solid var(--beige)">';
      html += '<h2 style="font-family:var(--font-serif);font-size:1.25rem;font-weight:300;margin-bottom:4px">Recensioni</h2>';
      if (avg) {
        html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:20px">';
        html += stars(Math.round(avg));
        html += '<span style="font-size:.85rem;color:var(--brown-mid)">' + avg + ' / 5 — ' + list.length + (list.length === 1 ? ' recensione' : ' recensioni') + '</span>';
        html += '</div>';
      }

      if (list.length === 0) {
        html += '<p style="color:var(--brown-light);font-size:.875rem;margin-bottom:24px">Ancora nessuna recensione. Sii la prima!</p>';
      } else {
        html += '<div class="reviews-list" style="display:flex;flex-direction:column;gap:16px;margin-bottom:24px">';
        list.forEach(function (r) {
          var d = r.created_at ? new Date(r.created_at).toLocaleDateString('it-IT') : '';
          html += '<div style="background:#fff;border:1px solid var(--beige);border-radius:8px;padding:16px 20px">';
          html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">';
          html += '<div>' + stars(r.rating) + '</div>';
          html += '<span style="font-size:.7rem;color:var(--brown-light)">' + d + '</span>';
          html += '</div>';
          if (r.titolo) html += '<p style="font-weight:500;font-size:.9rem;margin-bottom:4px">' + r.titolo + '</p>';
          if (r.testo) html += '<p style="font-size:.85rem;color:var(--brown-mid);line-height:1.5">' + r.testo + '</p>';
          html += '<p style="font-size:.75rem;color:var(--brown-light);margin-top:8px">— ' + (r.customer_nome || 'Acquirente verificato') + '</p>';
          html += '</div>';
        });
        html += '</div>';
      }

      // Submit form
      html += '<div class="review-form-wrap" style="background:var(--cream);border-radius:10px;padding:20px 24px">';
      html += '<h3 style="font-size:.95rem;font-weight:500;margin-bottom:14px">Scrivi una recensione</h3>';
      html += '<form id="reviewForm">';
      html += '<div style="display:flex;gap:6px;margin-bottom:12px" id="starPicker">';
      for (var i = 1; i <= 5; i++) {
        html += '<button type="button" data-star="' + i + '" style="font-size:22px;background:none;border:none;cursor:pointer;color:#DBDBEE;transition:color .15s" onmouseover="highlightStars(this)" onmouseout="resetStars()" onclick="pickStar(this)">★</button>';
      }
      html += '</div>';
      html += '<input type="hidden" id="reviewRating" value="0"/>';
      html += '<input type="text" id="reviewNome" placeholder="Il tuo nome" style="width:100%;padding:8px 12px;border:1px solid var(--beige);border-radius:6px;margin-bottom:8px;font-family:inherit;font-size:.875rem;box-sizing:border-box"/>';
      html += '<input type="text" id="reviewTitolo" placeholder="Titolo (opzionale)" style="width:100%;padding:8px 12px;border:1px solid var(--beige);border-radius:6px;margin-bottom:8px;font-family:inherit;font-size:.875rem;box-sizing:border-box"/>';
      html += '<textarea id="reviewTesto" rows="3" placeholder="Racconta la tua esperienza…" style="width:100%;padding:8px 12px;border:1px solid var(--beige);border-radius:6px;margin-bottom:12px;font-family:inherit;font-size:.875rem;resize:vertical;box-sizing:border-box"></textarea>';
      html += '<div id="reviewMsg" style="font-size:.8rem;margin-bottom:8px"></div>';
      html += '<button type="submit" style="padding:.55rem 1.4rem;background:var(--espresso);color:#fff;border:none;border-radius:4px;font-family:inherit;font-size:.875rem;cursor:pointer;transition:opacity .15s" onmouseover="this.style.opacity=\'.8\'" onmouseout="this.style.opacity=\'1\'">Invia recensione</button>';
      html += '</form></div>';
      html += '</section>';
      container.insertAdjacentHTML('afterend', html);

      // Star picker helpers
      window.highlightStars = function(btn) {
        var n = parseInt(btn.dataset.star);
        document.querySelectorAll('#starPicker button').forEach(function(b,i) {
          b.style.color = (i < n) ? '#6B6BA3' : '#DBDBEE';
        });
      };
      window.resetStars = function() {
        var cur = parseInt(document.getElementById('reviewRating').value) || 0;
        document.querySelectorAll('#starPicker button').forEach(function(b,i) {
          b.style.color = (i < cur) ? '#6B6BA3' : '#DBDBEE';
        });
      };
      window.pickStar = function(btn) {
        var n = parseInt(btn.dataset.star);
        document.getElementById('reviewRating').value = n;
        window.resetStars();
      };

      // Form submit
      var form = document.getElementById('reviewForm');
      if (form) {
        form.addEventListener('submit', function(e) {
          e.preventDefault();
          var rating = parseInt(document.getElementById('reviewRating').value) || 0;
          var msg = document.getElementById('reviewMsg');
          if (rating < 1) { msg.style.color = '#c0453a'; msg.textContent = 'Seleziona un punteggio (1–5 stelle).'; return; }
          var nome   = (document.getElementById('reviewNome').value || '').trim();
          var titolo = (document.getElementById('reviewTitolo').value || '').trim();
          var testo  = (document.getElementById('reviewTesto').value || '').trim();
          var btn    = form.querySelector('[type=submit]');
          btn.disabled = true; btn.textContent = 'Invio…';
          window.MemiAPI.reviews.submit({
            product_id:    productId,
            rating:        rating,
            titolo:        titolo || null,
            testo:         testo  || null,
            customer_nome: nome   || null,
          }).then(function() {
            msg.style.color = '#5F7A3F';
            msg.textContent = 'Grazie! La tua recensione è in attesa di approvazione.';
            form.reset();
            document.getElementById('reviewRating').value = '0';
            window.resetStars && window.resetStars();
            btn.disabled = false; btn.textContent = 'Invia recensione';
          }).catch(function(err) {
            msg.style.color = '#c0453a';
            msg.textContent = (err && err.error) || 'Errore invio. Riprova.';
            btn.disabled = false; btn.textContent = 'Invia recensione';
          });
        });
      }
    }).catch(function() { /* reviews unavailable — fail silently */ });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var root = document.getElementById('pdpRoot');
    if (!root) return;
    var productId = root.dataset.id;
    if (!productId) return;
    // Defer slightly so the rest of the page renders first
    setTimeout(function() { renderReviews(productId, root); }, 200);
  });
})();

/* ============================================================
   GALLERY HYDRATION — replaces the static placeholder gallery
   with the real uploaded product images from the API. Runs on
   every /products/<slug>/ page via the shared script, so admin
   uploads appear without regenerating the static HTML.
   ============================================================ */
(function () {
  'use strict';
  document.addEventListener('DOMContentLoaded', function () {
    var root = document.getElementById('pdpRoot');
    if (!root || !window.MemiAPI || !window.MemiAPI.products) return;
    var productId = root.dataset.id;
    if (!productId) return;

    window.MemiAPI.products.get(productId).then(function (p) {
      /* SEO: canonical + Product structured data, built from live API data. */
      try {
        var canon = 'https://memiabbigliamento.it/product?id=' + encodeURIComponent(productId);
        if (!document.querySelector('link[rel="canonical"]')) {
          var lk = document.createElement('link'); lk.rel = 'canonical'; lk.href = canon;
          document.head.appendChild(lk);
        }
        var ldImgs = (Array.isArray(p.images) ? p.images : []).map(function (x) {
          var u = (typeof x === 'string') ? x : (x.full || x.card || x.thumb);
          if (u && u.indexOf('http') !== 0) u = 'https://memiabbigliamento.it' + u;
          return u;
        }).filter(Boolean);
        var inStock = (p.status !== 'esaurito');
        if (Array.isArray(p.taglie) && p.taglie.length && typeof p.taglie[0] === 'object') {
          inStock = p.taglie.some(function (tg) { return Number(tg.stock) > 0; });
        }
        var ld = {
          '@context': 'https://schema.org', '@type': 'Product',
          name: p.name, sku: p.id, url: canon,
          description: (p.description || p.name || ''),
          image: ldImgs,
          brand: { '@type': 'Brand', name: 'Memi Abbigliamento' },
          offers: {
            '@type': 'Offer', url: canon, priceCurrency: 'EUR',
            price: String(p.price),
            availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock'
          }
        };
        var ldTag = document.createElement('script');
        ldTag.type = 'application/ld+json';
        ldTag.textContent = JSON.stringify(ld);
        document.head.appendChild(ldTag);
      } catch (_) {}

      var raw = (p && Array.isArray(p.images)) ? p.images : [];
      var imgs = raw.map(function (x) {
        if (typeof x === 'string') return { full: x, card: x, thumb: x };
        return { full: x.full || x.card || x.thumb, card: x.card || x.full, thumb: x.thumb || x.card || x.full };
      }).filter(function (i) { return i.full; });
      if (!imgs.length) return; // no real images → keep the placeholder figure

      var main = document.getElementById('mainImg');
      var thumbsWrap = document.querySelector('.gallery-thumbs');
      if (!main) return;
      var name = root.dataset.name || '';

      function show(i) {
        main.classList.remove('ph-fig', 'ph-flat', 'ph-shimmer');
        main.style.width = '100%'; main.style.height = '100%';
        main.innerHTML = '<img class="gallery-main-img" src="' + imgs[i].full + '" alt="' + name +
          '" style="width:100%;height:100%;object-fit:cover;object-position:center top">';
        if (thumbsWrap) {
          var ts = thumbsWrap.querySelectorAll('.thumb');
          for (var j = 0; j < ts.length; j++) ts[j].classList.toggle('active', j === i);
        }
      }

      if (thumbsWrap) {
        thumbsWrap.innerHTML = imgs.map(function (im, i) {
          return '<button type="button" class="thumb' + (i === 0 ? ' active' : '') + '" data-i="' + i + '" role="listitem" style="padding:0">' +
            '<img src="' + im.thumb + '" alt="" style="width:100%;height:100%;object-fit:cover;object-position:center top">' +
          '</button>';
        }).join('');
        thumbsWrap.querySelectorAll('.thumb').forEach(function (btn) {
          btn.addEventListener('click', function () { show(parseInt(this.dataset.i, 10) || 0); });
        });
      }
      show(0);
    }).catch(function () { /* keep placeholder on error */ });
  });
})();
