/**
 * admin-api.js  —  MEMI Gestionale Admin Panel
 * ──────────────────────────────────────────────
 * Handles all communication with the MEMI Backend API from the admin panel.
 * Uses jQuery $.ajax() to stay consistent with the existing codebase.
 *
 * Token storage: localStorage('memi_admin_token')
 *
 * Usage: loaded before app.js in dashboard.html
 * All functions return jQuery Deferred / Promise objects.
 */

(function (root, $) {
  'use strict';

  /* ── Config ──────────────────────────────────────────────────
     API_BASE is injected via <meta name="memi-api" content="..."> in dashboard.html.
     Defaults to /api for same-origin deployments.          */
  var metaEl   = document.querySelector('meta[name="memi-api"]');
  var API_BASE = (metaEl && metaEl.content) || '/api';

  /* ── Token helpers ─────────────────────────────────────────── */
  function getToken()   { try { return localStorage.getItem('memi_admin_token');       } catch(_){ return null; } }
  function setToken(t)  { try { localStorage.setItem('memi_admin_token', t);           } catch(_){} }
  function clearToken() { try { localStorage.removeItem('memi_admin_token');            } catch(_){} }

  /* ── Core request ──────────────────────────────────────────── */
  function request(method, path, data) {
    var headers = {};
    var token   = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;

    return $.ajax({
      url:         API_BASE + path,
      method:      method,
      contentType: 'application/json',
      data:        (data !== undefined) ? JSON.stringify(data) : undefined,
      headers:     headers,
      dataType:    'json',
    }).fail(function(xhr) {
      var msg = (xhr.responseJSON && xhr.responseJSON.error) || xhr.statusText || 'Errore di rete';
      // If 401 on any admin request, token is expired — redirect to login
      if (xhr.status === 401 && window.location.pathname.indexOf('dashboard') !== -1) {
        clearToken();
        window.location.href = 'index.html?session=expired';
      }
      return $.Deferred().reject({ error: msg });
    });
  }

  var get  = function(path)       { return request('GET',    path); };
  var post = function(path, data) { return request('POST',   path, data); };
  var put  = function(path, data) { return request('PUT',    path, data); };
  var del  = function(path)       { return request('DELETE', path); };

  /* ═══════════════════════════════════════════════════════
     AUTH
     ═══════════════════════════════════════════════════════ */
  var auth = {
    login: function(email, password) {
      return post('/admin/auth/login', { email: email, password: password })
        .done(function(data) { if (data.token) setToken(data.token); });
    },
    logout:    function() { clearToken(); },
    me:        function() { return get('/admin/auth/me'); },
    isLoggedIn: function() { return !!getToken(); },
  };

  /* ═══════════════════════════════════════════════════════
     DASHBOARD
     ═══════════════════════════════════════════════════════ */
  var dashboard = {
    kpis:         function() { return get('/admin/dashboard/kpis'); },
    chart:        function() { return get('/admin/dashboard/chart'); },
    topProducts:  function() { return get('/admin/dashboard/top-products'); },
    recentOrders: function() { return get('/admin/dashboard/recent-orders'); },
  };

  /* ═══════════════════════════════════════════════════════
     PRODUCTS
     ═══════════════════════════════════════════════════════ */
  var products = {
    list:        function(params) { return get('/products' + (params ? '?' + $.param(params) : '') + '&status=all'); },
    listAll:     function()       { return get('/products'); },
    get:         function(id)     { return get('/products/' + encodeURIComponent(id)); },
    create:      function(data)   { return post('/products', data); },
    update:      function(id, data) { return put('/products/' + encodeURIComponent(id), data); },
    delete:      function(id)     { return del('/products/' + encodeURIComponent(id)); },
    updateStock: function(id, taglia, stock) {
      return put('/products/' + encodeURIComponent(id) + '/stock', { taglia: taglia, stock: stock });
    },
  };

  /* ═══════════════════════════════════════════════════════
     ORDERS
     ═══════════════════════════════════════════════════════ */
  var orders = {
    list:         function(params) { return get('/orders/admin/list' + (params ? '?' + $.param(params) : '')); },
    get:          function(id)     { return get('/orders/admin/' + id); },
    updateStatus: function(id, data) { return put('/orders/admin/' + id + '/status', data); },
    ship:         function(id, data) { return put('/orders/admin/' + id + '/ship', data); },
  };

  /* ═══════════════════════════════════════════════════════
     CUSTOMERS
     ═══════════════════════════════════════════════════════ */
  var customers = {
    list:   function(params) { return get('/admin/customers' + (params ? '?' + $.param(params) : '')); },
    get:    function(id)     { return get('/admin/customers/' + id); },
    update: function(id, d)  { return put('/admin/customers/' + id, d); },
    delete: function(id)     { return del('/admin/customers/' + id); },
  };

  /* ═══════════════════════════════════════════════════════
     DISCOUNTS
     ═══════════════════════════════════════════════════════ */
  var discounts = {
    list:   function()       { return get('/admin/discounts'); },
    create: function(data)   { return post('/admin/discounts', data); },
    update: function(id, d)  { return put('/admin/discounts/' + id, d); },
    delete: function(id)     { return del('/admin/discounts/' + id); },
  };

  /* ═══════════════════════════════════════════════════════
     SHIPPING
     ═══════════════════════════════════════════════════════ */
  var shipping = {
    zones:           function()       { return get('/shipping/zones'); },
    createZone:      function(data)   { return post('/shipping/zones', data); },
    updateZone:      function(id, d)  { return put('/shipping/zones/' + id, d); },
    deleteZone:      function(id)     { return del('/shipping/zones/' + id); },
    couriers:        function()       { return get('/shipping/couriers'); },
    updateCourier:   function(code, d) { return put('/shipping/couriers/' + code, d); },
    shipments:       function()       { return get('/shipping/shipments'); },
    updateShipment:  function(id, d)  { return put('/shipping/shipments/' + id, d); },
  };

  /* ── Expose ─────────────────────────────────────────────── */
  root.AdminAPI = { auth, dashboard, products, orders, customers, discounts, shipping };

  /* ── Status-to-display helpers ──────────────────────────── */
  root.AdminAPI.statusLabel = function(code) {
    var map = {
      in_attesa:       'In attesa',
      in_preparazione: 'In preparazione',
      spedito:         'Spedito',
      consegnato:      'Consegnato',
      annullato:       'Annullato',
      pagato:          'Pagato',
      rimborsato:      'Rimborsato',
      fallito:         'Fallito',
      preso_in_carico: 'Preso in carico',
      in_transito:     'In transito',
      in_consegna:     'In consegna',
      problema:        'Problema',
      attivo:          'Attivo',
      bozza:           'Bozza',
      esaurito:        'Esaurito',
    };
    return map[code] || code;
  };

})(window, jQuery);
