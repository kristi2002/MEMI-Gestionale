/* MEMI Admin — extracted module. Loaded as a classic <script> AFTER app.js;
   shares the global scope (VIEWS, DATA, renderView, AdminAPI, helpers). */

/* ── Order detail "scheda" (full page, replaces the cramped order modal) ──────
   Reuses the document-delegated action handlers (.js-save-order-status,
   .js-open-ship-modal, .js-print-order) by rendering buttons with the same
   classes / ids / data-attrs, so no handler logic is duplicated. */
function _orderItemsHtml(items){
  if (items === null || typeof items === 'undefined')
    return '<h3>Prodotti ordinati</h3><p style="color:var(--muted);font-size:13px">Caricamento prodotti…</p>';
  if (!items.length)
    return '<h3>Prodotti ordinati</h3><p style="color:var(--muted);font-size:13px">Nessun prodotto associato a questo ordine.</p>';
  return '<h3>Prodotti ordinati</h3>' +
    '<div class="table-wrap"><table class="data" style="width:100%">' +
    '<thead><tr><th>Prodotto</th><th style="text-align:center">Taglia</th><th style="text-align:center">Qtà</th><th style="text-align:right">Prezzo</th></tr></thead><tbody>' +
    items.map(function(i){
      return '<tr><td>'+(i.product_name||'—')+'</td>' +
        '<td style="text-align:center;color:var(--muted)">'+(i.taglia||'—')+'</td>' +
        '<td style="text-align:center">'+(i.qty||1)+'</td>' +
        '<td style="text-align:right">€ '+parseFloat(i.price||0).toFixed(2).replace('.',',')+'</td></tr>';
    }).join('') +
    '</tbody></table></div>';
}

VIEWS['order-detail'] = function(){
  var d = DATA.orderDetail;
  if (!d || !d.o) {
    return pageHead('Ordine','') + '<div class="card"><p class="empty">Ordine non trovato. Torna alla lista ordini.</p></div>';
  }
  var o = d.o, dbId = d.dbId || o._db_id || null;
  var statusOpts = ['in_attesa','in_preparazione','spedito','consegnato','annullato'].map(function(s){
    return '<option value="'+s+'"'+(o._raw_status===s?' selected':'')+'>'+(window.AdminAPI?AdminAPI.statusLabel(s):s)+'</option>';
  }).join('');
  return ''
    + '<button class="detail-back" onclick="renderView(\'orders\');setActiveNav(\'orders\')"><i class="ti ti-arrow-left"></i> Torna agli ordini</button>'
    + pageHead('Ordine '+o.id, (o.data||'')+' · '+(o.cliente||''),
        '<button class="btn btn-ghost btn-sm js-print-order"><i class="ti ti-printer"></i> Stampa</button>')
    + '<div class="detail-grid">'
    +   '<div class="detail-main">'
    +     '<div class="card" id="orderDetailItems">'+_orderItemsHtml(d.items)+'</div>'
    +   '</div>'
    +   '<div class="detail-side">'
    +     '<div class="card"><h3>Riepilogo</h3><div class="kv">'
    +       '<div class="k">Stato</div><div class="v">'+statusPill(o.stato)+'</div>'
    +       '<div class="k">Pagamento</div><div class="v">'+statusPill(o.pagamento)+'</div>'
    +       '<div class="k">Totale</div><div class="v"><strong>'+o.totale+'</strong></div>'
    +       '<div class="k">Corriere</div><div class="v">'+(o.corriere||'—')+(o.tracking&&o.tracking!=='-'?' · <code>'+o.tracking+'</code>':'')+'</div>'
    +     '</div></div>'
    +     '<div class="card"><h3>Cliente</h3><div class="kv">'
    +       '<div class="k">Nome</div><div class="v">'+(o.cliente||'—')+'</div>'
    +       '<div class="k">Data ordine</div><div class="v">'+(o.data||'—')+'</div>'
    +     '</div></div>'
    +     '<div class="card"><h3>Azioni</h3>'
    +       '<label style="font-size:12px;color:var(--muted)">Cambia stato ordine</label>'
    +       '<select id="modalOrderStatus" style="width:100%;border:1px solid var(--line);border-radius:6px;padding:8px;font-size:13px;margin:6px 0 12px">'+statusOpts+'</select>'
    +       '<div style="display:flex;flex-direction:column;gap:8px">'
    +         (dbId?'<button class="btn btn-primary btn-sm js-save-order-status" data-id="'+dbId+'"><i class="ti ti-device-floppy"></i> Salva stato</button>':'')
    +         (dbId?'<button class="btn btn-soft btn-sm js-open-ship-modal" data-id="'+dbId+'" data-order="'+o.id+'" data-payment="'+o.pagamento+'">🚚 Spedisci</button>':'')
    +         '<button class="btn btn-ghost btn-sm js-print-order"><i class="ti ti-printer"></i> Stampa ordine</button>'
    +       '</div>'
    +     '</div>'
    +   '</div>'
    + '</div>';
};

window.openOrderDetail = function(o, dbId){
  if (!o) return;
  DATA.orderDetail = { o: o, dbId: dbId || o._db_id || null, items: null };
  if (typeof setActiveNav === 'function') setActiveNav('orders');
  renderView('order-detail');
  var id = DATA.orderDetail.dbId;
  if (id && window.AdminAPI) {
    AdminAPI.orders.get(id).done(function(res){
      DATA.orderDetail.items = (res && res.items) ? res.items : [];
      DATA.orderDetail.full  = res || null;
      $('#orderDetailItems').html(_orderItemsHtml(DATA.orderDetail.items));
    }).fail(function(){
      DATA.orderDetail.items = [];
      $('#orderDetailItems').html(_orderItemsHtml([]));
    });
  } else {
    DATA.orderDetail.items = [];
    $('#orderDetailItems').html(_orderItemsHtml([]));
  }
};
