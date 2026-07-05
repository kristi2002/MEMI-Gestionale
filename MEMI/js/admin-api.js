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
      // [DEV BYPASS] Disabled for local development without credentials
      // if (xhr.status === 401 && window.location.pathname.indexOf('dashboard') !== -1) {
      //   clearToken();
      //   window.location.href = 'index.html?session=expired';
      // }
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
    changePassword: function(current, nw) { return put('/admin/auth/password', { current_password: current, new_password: nw }); },
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
    finance:      function() { return get('/admin/dashboard/finance'); },
    catalogKpis:  function() { return get('/admin/dashboard/catalog-kpis'); },
  };

  /* ═══════════════════════════════════════════════════════
     PRODUCTS
     ═══════════════════════════════════════════════════════ */
  var products = {
    list:        function(params) { return get('/products?' + $.param(Object.assign({ status: 'all' }, params || {}))); },
    listAll:     function()       { return get('/products?status=all'); },
    get:         function(id)     { return get('/products/' + encodeURIComponent(id)); },
    create:      function(data)   { return post('/products', data); },
    update:      function(id, data) { return put('/products/' + encodeURIComponent(id), data); },
    delete:      function(id)     { return del('/products/' + encodeURIComponent(id)); },
    updateStock: function(id, taglia, stock) {
      return put('/products/' + encodeURIComponent(id) + '/stock', { taglia: taglia, stock: stock });
    },
    // Multipart image upload — bypasses the JSON request() wrapper.
    uploadImages: function(id, files) {
      var fd = new FormData();
      for (var i = 0; i < files.length; i++) fd.append('images', files[i]);
      var token = getToken();
      return $.ajax({
        url:         API_BASE + '/products/' + encodeURIComponent(id) + '/images',
        method:      'POST',
        data:        fd,
        processData: false,
        contentType: false,
        headers:     token ? { Authorization: 'Bearer ' + token } : {},
        dataType:    'json',
      });
    },
    deleteImage: function(id, url) {
      return request('DELETE', '/products/' + encodeURIComponent(id) + '/images', { url: url });
    },
    // Bulk CSV import. dryRun=true → validate + preview only (no writes).
    importCsv: function(file, dryRun) {
      var fd = new FormData();
      fd.append('file', file);
      var token = getToken();
      return $.ajax({
        url:         API_BASE + '/admin/products/import' + (dryRun ? '?dryRun=1' : ''),
        method:      'POST',
        data:        fd,
        processData: false,
        contentType: false,
        headers:     token ? { Authorization: 'Bearer ' + token } : {},
        dataType:    'json',
      });
    },
    importTemplateUrl: function() { return API_BASE + '/admin/products/import/template'; },
  };

  /* ═══════════════════════════════════════════════════════
     ORDERS
     ═══════════════════════════════════════════════════════ */
  var orders = {
    list:         function(params) { return get('/orders/admin/list' + (params ? '?' + $.param(params) : '')); },
    get:          function(id)     { return get('/orders/admin/' + id); },
    create:       function(data)   { return post('/orders/admin', data); },
    updateStatus: function(id, data) { return put('/orders/admin/' + id + '/status', data); },
    ship:         function(id, data) { return put('/orders/admin/' + id + '/ship', data); },
    sendTracking: function(id)       { return post('/orders/admin/' + id + '/send-tracking', {}); },
    delete:       function(id)     { return del('/orders/admin/' + id); },
  };

  /* ═══════════════════════════════════════════════════════
     CUSTOMERS
     ═══════════════════════════════════════════════════════ */
  var customers = {
    list:   function(params) { return get('/admin/customers' + (params ? '?' + $.param(params) : '')); },
    get:    function(id)     { return get('/admin/customers/' + id); },
    update: function(id, d)  { return put('/admin/customers/' + id, d); },
    delete: function(id)     { return del('/admin/customers/' + id); },
    create: function(d)      { return post('/admin/customers', d); },
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
    couriers:        function()       { return get('/shipping/couriers?all=1'); },
    createCourier:   function(d)      { return post('/shipping/couriers', d); },
    updateCourier:   function(code, d) { return put('/shipping/couriers/' + code, d); },
    deleteCourier:   function(code)   { return del('/shipping/couriers/' + code); },
    shipments:       function()       { return get('/shipping/shipments'); },
    createShipment:  function(d)      { return post('/shipping/shipments', d); },
    updateShipment:  function(id, d)  { return put('/shipping/shipments/' + id, d); },
    pickup:          function()       { return get('/shipping/pickup'); },
    createPickup:    function(d)      { return post('/shipping/pickup', d); },
    updatePickup:    function(id, d)  { return put('/shipping/pickup/' + id, d); },
    deletePickup:    function(id)     { return del('/shipping/pickup/' + id); },
  };

  /* ═══════════════════════════════════════════════════════
     GIFT CARDS · CAMPAIGNS · CMS (pages + blog)
     ═══════════════════════════════════════════════════════ */
  var giftcards = {
    list:   function()       { return get('/admin/giftcards'); },
    create: function(d)      { return post('/admin/giftcards', d); },
    update: function(id, d)  { return put('/admin/giftcards/' + id, d); },
    delete: function(id)     { return del('/admin/giftcards/' + id); },
  };
  var campaigns = {
    list:   function()       { return get('/admin/campaigns'); },
    create: function(d)      { return post('/admin/campaigns', d); },
    update: function(id, d)  { return put('/admin/campaigns/' + id, d); },
    delete: function(id)     { return del('/admin/campaigns/' + id); },
  };
  var pages = {
    list:   function()       { return get('/admin/cms/pages'); },
    create: function(d)      { return post('/admin/cms/pages', d); },
    update: function(id, d)  { return put('/admin/cms/pages/' + id, d); },
    delete: function(id)     { return del('/admin/cms/pages/' + id); },
  };
  var blog = {
    list:   function()       { return get('/admin/cms/blog'); },
    create: function(d)      { return post('/admin/cms/blog', d); },
    update: function(id, d)  { return put('/admin/cms/blog/' + id, d); },
    delete: function(id)     { return del('/admin/cms/blog/' + id); },
  };
  var loyalty = {
    config:       function()        { return get('/admin/loyalty/config'); },
    updateConfig: function(d)       { return put('/admin/loyalty/config', d); },
    customers:    function(params)  { return get('/admin/loyalty/customers' + (params ? '?' + $.param(params) : '')); },
    customer:     function(id)      { return get('/admin/loyalty/customers/' + id); },
    adjust:       function(id, d)   { return post('/admin/loyalty/customers/' + id + '/adjust', d); },
  };

  /* ═══════════════════════════════════════════════════════
     NEWSLETTER
     ═══════════════════════════════════════════════════════ */
  var newsletter = {
    list:      function(params) { return get('/newsletter' + (params ? '?' + $.param(params) : '')); },
    subscribe: function(email, fonte) { return post('/newsletter/subscribe', { email: email, fonte: fonte || 'admin' }); },
  };

  /* ═══════════════════════════════════════════════════════
     INVOICES (fatture)
     ═══════════════════════════════════════════════════════ */
  var invoices = {
    list:   function(params) { return get('/admin/invoices' + (params ? '?' + $.param(params) : '')); },
    get:    function(id)     { return get('/admin/invoices/' + id); },
    create: function(d)      { return post('/admin/invoices', d); },
    update: function(id, d)  { return put('/admin/invoices/' + id, d); },
    delete: function(id)     { return del('/admin/invoices/' + id); },
  };
  /* ================================================================
     RESI (returns)
     ================================================================ */
  var resi = {
    list:   function(params) { return get('/admin/resi' + (params ? '?' + $.param(params) : '')); },
    get:    function(id)     { return get('/admin/resi/' + id); },
    create: function(d)      { return post('/admin/resi', d); },
    update: function(id, d)  { return put('/admin/resi/' + id, d); },
    refund: function(id, amount) { return post('/admin/resi/' + id + '/refund', amount !== undefined ? { amount: amount } : {}); },
    delete: function(id)     { return del('/admin/resi/' + id); },
  };

  /* ================================================================
     REVIEWS
     ================================================================ */
  var reviews = {
    list:   function(params) { return get('/reviews/admin' + (params ? '?' + $.param(params) : '')); },
    update: function(id, d)  { return put('/reviews/admin/' + id, d); },
    delete: function(id)     { return del('/reviews/admin/' + id); },
    submit: function(d)      { return post('/reviews', d); },
  };

  /* ================================================================
     STAFF
     ================================================================ */
  var staff = {
    list:   function()       { return get('/admin/staff'); },
    create: function(d)      { return post('/admin/staff', d); },
    update: function(id, d)  { return put('/admin/staff/' + id, d); },
    delete: function(id)     { return del('/admin/staff/' + id); },
  };

  /* ================================================================
     SETTINGS
     ================================================================ */
  var settings = {
    get:          function()  { return get('/admin/settings'); },
    update:       function(d) { return put('/admin/settings', d); },
    integrations: function()  { return get('/admin/settings/integrations'); },
  };


  /* -- Expose ---------------------------------------------------- */
  root.AdminAPI = { auth, dashboard, products, orders, customers, discounts, shipping, newsletter, invoices, resi, reviews, staff, settings, giftcards, campaigns, pages, blog, loyalty };

  /* -- Status-to-display helpers --------------------------------- */
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
      disattivo:       'Disattivo',
      pianificato:     'Pianificato',
      attiva:          'Attiva',
      utilizzata:      'Utilizzata',
      disattivata:     'Disattivata',
      pianificata:     'Pianificata',
      conclusa:        'Conclusa',
      pubblicata:      'Pubblicata',
      pubblicato:      'Pubblicato',
      rifiutata:       'Rifiutata',
      bozza:           'Bozza',
      esaurito:        'Esaurito',
      aperto:          'Aperto',
      in_analisi:      'In analisi',
      approvato:       'Approvato',
      rifiutato:       'Rifiutato',
      emessa:          'Emessa',
      inviata:         'Inviata',
      pagata:          'Pagata',
      annullata:       'Annullata',
    };
    return map[code] || code;
  };

})(window, jQuery);
