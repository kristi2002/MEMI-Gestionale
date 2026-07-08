/* MEMI Admin — extracted module. Loaded as a classic <script> AFTER app.js;
   shares the global scope (VIEWS, DATA, renderView, AdminAPI, helpers). */

/* ── Pagination: shared row mappers + "Carica altri" load-more ────────────────
   Mappers are shared by the renderView fetch branch and the load-more handlers.
   Load-more appends the next page to DATA then repaints via window.__rerender
   (no re-fetch of page 1). */
function mapAdminOrder(o){
  return {
    id:          o.order_number,
    _db_id:      o.id,
    _raw_status: o.order_status,
    cliente:     ((o.customer_nome||'') + ' ' + (o.customer_cognome||'')).trim(),
    data:        o.created_at ? new Date(o.created_at).toLocaleDateString('it-IT') : '-',
    totale:      'EUR ' + parseFloat(o.total||0).toFixed(2).replace('.', ','),
    pagamento:   window.AdminAPI ? AdminAPI.statusLabel(o.payment_status) : o.payment_status,
    stato:       window.AdminAPI ? AdminAPI.statusLabel(o.order_status) : o.order_status,
    corriere:    (o.courier_code || '-').toUpperCase(),
    tracking:    o.tracking_number || '-',
  };
}
function mapAdminProduct(p){
  var totalStock = (p.stock_total != null) ? (parseInt(p.stock_total) || 0) : 0;
  if (!totalStock && p.taglie && Array.isArray(p.taglie)) {
    p.taglie.forEach(function(t){ totalStock += (parseInt(t && t.stock) || 0); });
  }
  var _iconMap = { dress:'👗', bag:'👜', shoe:'👟', ring:'💍', earring:'👂', necklace:'💎', top:'👕', blazer:'🥻', cardigan:'🧶', jacket:'🧥', scarf:'🧣', pants:'👖', shorts:'🩳', skirt:'👗', sandal:'👡', sneaker:'👟', vestiti:'👗', gonne:'👗', pantaloni:'👖', borse:'👜', scarpe:'👟', gioielli:'💍', accessori:'✨', set:'✨', cinture:'🪡' };
  var icon = _iconMap[p.icon] || _iconMap[p.categoria] || '👗';
  var imgArr = Array.isArray(p.images) ? p.images : [];
  var first  = imgArr[0];
  var thumb  = first ? (typeof first==='string' ? first : (first.thumb||first.card||first.full)) : null;
  return {
    id:     p.id,
    nome:   p.name,
    cat:    p.categoria,
    prezzo: 'EUR ' + parseFloat(p.price||0).toFixed(2).replace('.', ','),
    stock:  totalStock,
    status: window.AdminAPI ? AdminAPI.statusLabel(p.status || 'attivo') : (p.status||'attivo'),
    img:    icon,
    thumb:  thumb,
    collections: Array.isArray(p.collections) ? p.collections : [],
  };
}
function loadMoreHtml(cls, loaded, total){
  if (!total || loaded >= total) return '';
  return '<div style="text-align:center;margin-top:16px"><button class="btn btn-soft ' + cls + '">Carica altri (' + (total - loaded) + ' rimanenti)</button></div>';
}
jQuery(function ($) {
  $(document).on('click', '.js-load-more-orders', function () {
    var meta = DATA.ordersMeta; if (!meta || !window.AdminAPI) return;
    var $b = $(this).prop('disabled', true).text('Caricamento…');
    AdminAPI.orders.list({ limit: meta.limit, offset: DATA.orders.length }).done(function (data) {
      var list = (data && data.orders) ? data.orders : [];
      DATA.orders = DATA.orders.concat(list.map(mapAdminOrder));
      if (data && typeof data.total === 'number') DATA.ordersMeta.total = data.total;
      window.__rerender('orders');
    }).fail(function () { $b.prop('disabled', false).text('Carica altri'); });
  });
  $(document).on('click', '.js-load-more-products', function () {
    var meta = DATA.productsMeta; if (!meta || !window.AdminAPI) return;
    $(this).prop('disabled', true).text('Caricamento…');
    AdminAPI.products.listPaged({ limit: meta.limit, offset: DATA.products.length }).done(function (res) {
      var list = (res && res.products) || [];
      DATA.products = DATA.products.concat(list.map(mapAdminProduct));
      if (res && typeof res.total === 'number') DATA.productsMeta.total = res.total;
      window.__rerender('products');
    }).fail(function () { window.__rerender('products'); });
  });
});

/* Inventory shares DATA.products/productsMeta — its own load-more repaints inventory. */
jQuery(function ($) {
  $(document).on('click', '.js-load-more-inventory', function () {
    var meta = DATA.productsMeta; if (!meta || !window.AdminAPI) return;
    $(this).prop('disabled', true).text('Caricamento…');
    AdminAPI.products.listPaged({ limit: meta.limit, offset: DATA.products.length }).done(function (res) {
      var list = (res && res.products) || [];
      DATA.products = DATA.products.concat(list.map(mapAdminProduct));
      if (res && typeof res.total === 'number') DATA.productsMeta.total = res.total;
      window.__rerender('inventory');
    }).fail(function () { window.__rerender('inventory'); });
  });
});
