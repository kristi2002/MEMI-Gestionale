/**
 * api-client.js  —  Memi Abbigliamento
 * ──────────────────────────────────────
 * Thin wrapper around the MEMI Backend REST API.
 *
 * Usage:
 *   <script src="/api-client.js"></script>
 *   // window.MemiAPI is then available everywhere
 *
 * Configuration:
 *   Set window.MEMI_API_URL before loading this script, or it defaults to
 *   the same origin + /api.  In production Coolify will inject the env var
 *   as a meta tag (see index.html head comment).
 *
 * Token storage:
 *   Customer JWT lives in localStorage under 'memi_token'.
 *   Admin JWT lives in localStorage under 'memi_admin_token' (used by admin panel only).
 */

(function (root) {
  'use strict';

  /* ── Config ─────────────────────────────────────────── */
  // Detect API base URL:
  // 1. window.MEMI_API_URL if set by the page
  // 2. data-api attribute on the <script> tag itself
  // 3. /api on the current origin
  var scriptEl = document.currentScript || (function () {
    var s = document.querySelectorAll('script[src*="api-client"]');
    return s[s.length - 1];
  })();
  var API_BASE = root.MEMI_API_URL
    || (scriptEl && scriptEl.dataset.api)
    || '/api';

  /* ── Token helpers ───────────────────────────────────── */
  function getToken()      { try { return localStorage.getItem('memi_token');  } catch(_){ return null; } }
  function setToken(t)     { try { localStorage.setItem('memi_token', t);      } catch(_){} }
  function clearToken()    { try { localStorage.removeItem('memi_token');       } catch(_){} }

  /* ── Core fetch wrapper ──────────────────────────────── */
  /**
   * request(method, path, body?)
   * Returns the parsed JSON response or throws {error: string}.
   */
  async function request(method, path, body) {
    var headers = { 'Content-Type': 'application/json' };
    var token = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;

    var opts = { method: method, headers: headers };
    if (body !== undefined) opts.body = JSON.stringify(body);

    var url = API_BASE + path;
    try {
      var res = await fetch(url, opts);
      var json = await res.json().catch(function() { return { error: 'Risposta non valida dal server' }; });
      if (!res.ok) throw json;
      return json;
    } catch (err) {
      // Network error (server offline, CORS, etc.)
      if (err instanceof TypeError) {
        throw { error: 'Impossibile contattare il server. Riprova tra poco.' };
      }
      throw err;
    }
  }

  var get  = function(path)        { return request('GET',    path); };
  var post = function(path, body)  { return request('POST',   path, body); };
  var put  = function(path, body)  { return request('PUT',    path, body); };
  var del  = function(path)        { return request('DELETE', path); };

  /* ═══════════════════════════════════════════════════════
     AUTH
     ═══════════════════════════════════════════════════════ */
  var auth = {
    /**
     * Register a new customer.
     * On success: saves JWT, returns {token, user}.
     */
    register: async function(nome, email, password, consents, birthday) {
      var body = { nome: nome, email: email, password: password };
      if (consents) {
        body.privacy_consent   = !!consents.privacy_consent;
        body.marketing_consent = !!consents.marketing_consent;
        if (consents.cognome) body.cognome = consents.cognome;
      }
      if (birthday) body.birthday = birthday;
      var data = await post('/auth/register', body);
      if (data.token) setToken(data.token);
      return data;
    },

    /**
     * Login.
     * On success: saves JWT, returns {token, user}.
     */
    login: async function(email, password) {
      var data = await post('/auth/login', { email: email, password: password });
      if (data.token) setToken(data.token);
      return data;
    },

    /** Logout — clears local token, cart, and wishlist. */
    logout: function() {
      clearToken();
      try { localStorage.removeItem('memi_session'); } catch(_) {}
      try { localStorage.removeItem('memi_cart'); } catch(_) {}
      try { localStorage.removeItem('memi_wishlist'); } catch(_) {}
    },

    /** Returns current user profile from the API (requires valid token). */
    me: function() { return get('/auth/me'); },

    /** Update profile. */
    updateMe: function(data) { return put('/auth/me', data); },

    /** Loyalty: points balance + ledger + config. */
    loyalty: function() { return get('/auth/loyalty'); },

    /** Loyalty: redeem points → returns a single-use discount code. */
    redeemPoints: function(points) { return post('/auth/loyalty/redeem', { points: points }); },

    /** Save the fit/size profile (stored on customers.sizes). */
    saveSizes: function(sizes) { return put('/auth/me', { sizes: sizes }); },
    /** Save style preferences (customers.preferences). */
    savePreferences: function(prefs) { return put('/auth/me', { preferences: prefs }); },
    /** Persist the preferred language (customers.lang). */
    setLang: function(lang) { return put('/auth/me', { lang: lang }); },

    /** Wishlist (customers.wishlist JSON) — used for cross-device sync. */
    wishlist: {
      get:  function()      { return get('/auth/wishlist'); },
      save: function(items) { return put('/auth/wishlist', { items: items }); },
    },

    /** Cart (customers.cart JSON) — restores the basket after logout/login. */
    cart: {
      get:  function()      { return get('/auth/cart'); },
      save: function(items) { return put('/auth/cart', { items: items }); },
    },

    /** Saved shipping addresses (customer_addresses table). */
    addresses: {
      list:       function()        { return get('/auth/addresses'); },
      create:     function(data)     { return post('/auth/addresses', data); },
      update:     function(id, data) { return put('/auth/addresses/' + encodeURIComponent(id), data); },
      remove:     function(id)       { return del('/auth/addresses/' + encodeURIComponent(id)); },
      setDefault: function(id)       { return put('/auth/addresses/' + encodeURIComponent(id) + '/default', {}); },
    },

    /** Per-customer newsletter subscription + settings. */
    newsletter: {
      get:  function()     { return get('/auth/newsletter'); },
      save: function(data) { return put('/auth/newsletter', data); },
    },

    /** True if a token exists in localStorage (doesn't verify it). */
    isLoggedIn: function() { return !!getToken(); },
  };

  /* ═══════════════════════════════════════════════════════
     PRODUCTS
     ═══════════════════════════════════════════════════════ */
  var products = {
    /**
     * List products.
     * @param {object} filters  { categoria, colore, saldi, novita, q, collection }
     */
    list: function(filters) {
      var qs = '';
      if (filters) {
        var parts = [];
        Object.keys(filters).forEach(function(k) {
          if (filters[k] !== undefined && filters[k] !== null)
            parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(filters[k]));
        });
        if (parts.length) qs = '?' + parts.join('&');
      }
      return get('/products' + qs);
    },

    /** Single product with sizes + stock. */
    get: function(id) { return get('/products/' + encodeURIComponent(id)); },

    /** Stock per size (lightweight, for cart / checkout). */
    stock: function(id) { return get('/products/' + encodeURIComponent(id) + '/stock'); },
  };

  /* ═══════════════════════════════════════════════════════
     ORDERS
     ═══════════════════════════════════════════════════════ */
  var orders = {
    /**
     * Place a new order.
     * @param {object} orderData  { nome, cognome, email, telefono, indirizzo, citta, cap, paese,
     *                              items, discount_code, payment_method }
     */
    place: function(orderData) { return post('/orders', orderData); },

    /** Validate a discount code before checkout. `items` (optional) lets the server
     *  compute product-scoped codes on the same lines it will see at order creation. */
    validateDiscount: function(code, subtotal, items) {
      return post('/orders/validate-discount', { code: code, subtotal: subtotal, items: items || [] });
    },

    /** Customer's own order history (requires login). */
    myOrders: function() { return get('/orders/my'); },

    /** Single order detail for the logged-in customer. */
    myOrder: function(id) { return get('/orders/my/' + encodeURIComponent(id)); },

    /** Cancel an unshipped order (logged-in customer); paid orders are refunded. */
    cancel: function(id) { return post('/orders/my/' + encodeURIComponent(id) + '/cancel', {}); },

    /** Public order lookup — no login required. Needs order number + email. */
    track: function(orderNumber, email) {
      return get('/orders/track?number=' + encodeURIComponent(orderNumber) + '&email=' + encodeURIComponent(email));
    },
  };

  /* ═══════════════════════════════════════════════════════
     SHIPPING
     ═══════════════════════════════════════════════════════ */
  var shipping = {
    zones:    function() { return get('/shipping/zones'); },
    couriers: function() { return get('/shipping/couriers'); },
  };

  /* ═══════════════════════════════════════════════════════
     GIFT CARDS (customer-facing)
     ═══════════════════════════════════════════════════════ */
  var giftcards = {
    /** Pre-checkout preview — actual redemption happens in orders.place() via gift_card_code. */
    validate: function(code) { return get('/giftcards/validate/' + encodeURIComponent(code)); },
  };

  /* ═══════════════════════════════════════════════════════
     REVIEWS
     ═══════════════════════════════════════════════════════ */
  var reviews = {
    /** Published reviews for a product (public). */
    forProduct: function(productId) {
      return get('/reviews/product/' + encodeURIComponent(productId));
    },
    /** Submit a review (public, optionally authenticated). */
    submit: function(data) { return post('/reviews', data); },
  };

  /* ═══════════════════════════════════════════════════════
     RETURNS (customer-facing)
     ═══════════════════════════════════════════════════════ */
  var resi = {
    /** Submit a return request — verified by order_number + email. */
    request: function(data) { return post('/resi/request', data); },

    /** Public return policy (enabled, window days, allowed reasons). */
    config: function() { return get('/resi/config'); },

    /** The logged-in customer's own return requests. */
    myReturns: function() { return get('/resi/my'); },
  };

  /* ── Expose public API ──────────────────────────────────── */
  root.MemiAPI = {
    auth:      auth,
    products:  products,
    orders:    orders,
    shipping:  shipping,
    giftcards: giftcards,
    reviews:   reviews,
    resi:      resi,

    // Expose low-level request for custom calls
    _request: request,
    _base:    API_BASE,
  };

  // Backwards compat: also fire a custom event so other scripts know the API is ready
  document.dispatchEvent(new CustomEvent('memi:api:ready'));

})(typeof window !== 'undefined' ? window : global);
