/* MEMI Admin — Purchasing (Acquisti) module: Fornitori + Ordini fornitori.
   Classic <script> after app.js; shares the global scope (VIEWS, DATA, AdminAPI,
   pageHead, statusPill, openModal, toast, renderView). Receiving a PO adds its
   items to product stock (backend, transactional). */

function _pEsc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

VIEWS.suppliers = function () {
  var list = DATA.suppliers;
  return pageHead('Fornitori', 'Anagrafica fornitori per gli ordini di acquisto.', '<button class="btn btn-primary btn-sm js-new-supplier">+ Nuovo fornitore</button>') +
    '<div class="table-card"><div class="table-wrap"><table class="data">' +
    '<thead><tr><th>Nome</th><th>Email</th><th>Telefono</th><th></th></tr></thead><tbody>' +
    ((list && list.length) ? list.map(function (s) {
      return '<tr><td><strong>' + _pEsc(s.nome) + '</strong></td><td>' + _pEsc(s.email || '—') + '</td><td>' + _pEsc(s.telefono || '—') + '</td>' +
        '<td class="row-actions"><button class="js-edit-supplier" data-json="' + encodeURIComponent(JSON.stringify(s)) + '" title="Modifica"><i class="ti ti-pencil"></i></button>' +
        '<button class="js-del-supplier" data-id="' + s.id + '" title="Elimina"><i class="ti ti-trash"></i></button></td></tr>';
    }).join('') : '<tr><td colspan="4" class="empty">' + (list === undefined ? 'Caricamento…' : 'Nessun fornitore. Aggiungine uno con “+ Nuovo fornitore”.') + '</td></tr>') +
    '</tbody></table></div></div>';
};

VIEWS['purchase-orders'] = function () {
  var list = DATA.purchaseOrders;
  var stLabel = { bozza: 'Bozza', inviato: 'Inviato', ricevuto: 'Ricevuto', annullato: 'Annullato' };
  return pageHead('Ordini fornitori', 'Ordini di acquisto: crea una bozza, poi “Ricevi” per aggiungere lo stock.', '<button class="btn btn-primary btn-sm js-new-po">+ Nuovo ordine</button>') +
    '<div class="table-card"><div class="table-wrap"><table class="data">' +
    '<thead><tr><th>Numero</th><th>Fornitore</th><th>Articoli</th><th>Totale</th><th>Stato</th><th></th></tr></thead><tbody>' +
    ((list && list.length) ? list.map(function (o) {
      return '<tr><td><strong>' + _pEsc(o.numero || ('#' + o.id)) + '</strong></td><td>' + _pEsc(o.supplier_nome || '—') + '</td><td>' + (o.items_qty || 0) + '</td>' +
        '<td>€ ' + (Number(o.totale) || 0).toFixed(2).replace('.', ',') + '</td><td>' + statusPill(stLabel[o.stato] || o.stato) + '</td>' +
        '<td class="row-actions">' +
        ((o.stato !== 'ricevuto' && o.stato !== 'annullato') ? '<button class="btn btn-soft btn-sm js-receive-po" data-id="' + o.id + '" title="Segna ricevuto e aggiorna lo stock">📥 Ricevi</button> ' : '') +
        '<button class="js-del-po" data-id="' + o.id + '" title="Elimina"><i class="ti ti-trash"></i></button></td></tr>';
    }).join('') : '<tr><td colspan="6" class="empty">' + (list === undefined ? 'Caricamento…' : 'Nessun ordine fornitore.') + '</td></tr>') +
    '</tbody></table></div></div>';
};

jQuery(function ($) {
  var INP = 'width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px;font-size:13px';

  /* ── Suppliers ── */
  function supplierForm(id, s) {
    s = s || {};
    return '<form id="supplierForm"><div class="kv" style="grid-template-columns:110px 1fr;gap:10px;align-items:center">' +
      '<div class="k">Nome *</div><div class="v"><input name="nome" required value="' + _pEsc(s.nome || '') + '" style="' + INP + '"/></div>' +
      '<div class="k">Email</div><div class="v"><input name="email" value="' + _pEsc(s.email || '') + '" style="' + INP + '"/></div>' +
      '<div class="k">Telefono</div><div class="v"><input name="telefono" value="' + _pEsc(s.telefono || '') + '" style="' + INP + '"/></div>' +
      '<div class="k">Note</div><div class="v"><textarea name="note" rows="2" style="' + INP + '">' + _pEsc(s.note || '') + '</textarea></div>' +
      '</div><div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">' +
      '<button type="button" class="btn btn-ghost btn-sm" onclick="closeModal()">Annulla</button>' +
      '<button type="submit" class="btn btn-primary btn-sm">' + (id ? 'Salva' : 'Crea') + '</button></div></form>';
  }
  $(document).on('click', '.js-new-supplier', function () {
    openModal('Nuovo fornitore', supplierForm(null));
    $('#supplierForm').on('submit', function (e) {
      e.preventDefault(); if (!window.AdminAPI) return;
      AdminAPI.suppliers.create(Object.fromEntries(new FormData(this)))
        .done(function () { toast('Fornitore creato', 'success'); closeModal(); renderView('suppliers'); })
        .fail(function (x) { toast((x.responseJSON && x.responseJSON.error) || 'Errore', 'error'); });
    });
  });
  $(document).on('click', '.js-edit-supplier', function () {
    var s = {}; try { s = JSON.parse(decodeURIComponent($(this).data('json'))); } catch (_) {}
    openModal('Modifica fornitore', supplierForm(s.id, s));
    $('#supplierForm').on('submit', function (e) {
      e.preventDefault(); if (!window.AdminAPI) return;
      AdminAPI.suppliers.update(s.id, Object.fromEntries(new FormData(this)))
        .done(function () { toast('Fornitore aggiornato', 'success'); closeModal(); renderView('suppliers'); })
        .fail(function (x) { toast((x.responseJSON && x.responseJSON.error) || 'Errore', 'error'); });
    });
  });
  $(document).on('click', '.js-del-supplier', function () {
    if (!window.AdminAPI || !confirm('Eliminare questo fornitore?')) return;
    AdminAPI.suppliers.delete($(this).data('id'))
      .done(function () { toast('Fornitore eliminato', 'success'); renderView('suppliers'); })
      .fail(function (x) { toast((x.responseJSON && x.responseJSON.error) || 'Errore', 'error'); });
  });

  /* ── Purchase orders ── */
  function poItemRow() {
    return '<div class="po-item-row" style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr auto;gap:6px;margin-bottom:6px">' +
      '<input name="prodotto" placeholder="ID prodotto (slug)" style="' + INP + '"/>' +
      '<input name="taglia" placeholder="Taglia" style="' + INP + '"/>' +
      '<input name="quantita" type="number" min="1" value="1" placeholder="Qtà" style="' + INP + '"/>' +
      '<input name="costo_unitario" type="number" step="0.01" min="0" placeholder="Costo" style="' + INP + '"/>' +
      '<button type="button" class="btn btn-ghost btn-sm js-po-rm-row" title="Rimuovi">✕</button></div>';
  }
  $(document).on('click', '.js-new-po', function () {
    var suppliers = (DATA.suppliers || []);
    var supOpts = '<option value="">— Nessun fornitore —</option>' + suppliers.map(function (s) { return '<option value="' + s.id + '">' + _pEsc(s.nome) + '</option>'; }).join('');
    openModal('Nuovo ordine fornitore',
      '<form id="poForm">' +
        '<div class="kv" style="grid-template-columns:110px 1fr;gap:10px;align-items:center;margin-bottom:12px">' +
          '<div class="k">Fornitore</div><div class="v"><select name="supplier_id" style="' + INP + '">' + supOpts + '</select></div>' +
          '<div class="k">Note</div><div class="v"><input name="note" style="' + INP + '"/></div>' +
        '</div>' +
        '<strong style="font-size:13px">Righe prodotto</strong>' +
        '<div id="poItems" style="margin-top:8px">' + poItemRow() + '</div>' +
        '<button type="button" class="btn btn-soft btn-sm js-po-add-row">+ Aggiungi riga</button>' +
        '<div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">' +
        '<button type="button" class="btn btn-ghost btn-sm" onclick="closeModal()">Annulla</button>' +
        '<button type="submit" class="btn btn-primary btn-sm">Crea ordine</button></div></form>', null, 'lg');
    $('#poForm').on('submit', function (e) {
      e.preventDefault(); if (!window.AdminAPI) return;
      var supplier_id = $(this).find('[name=supplier_id]').val() || null;
      var note = $(this).find('[name=note]').val() || null;
      var items = [];
      $('#poItems .po-item-row').each(function () {
        var prod = $(this).find('[name=prodotto]').val().trim();
        if (!prod) return;
        items.push({ prodotto: prod, taglia: $(this).find('[name=taglia]').val().trim() || null,
          quantita: parseInt($(this).find('[name=quantita]').val(), 10) || 0, costo_unitario: Number($(this).find('[name=costo_unitario]').val()) || 0 });
      });
      if (!items.length) { toast('Aggiungi almeno una riga con un ID prodotto', 'error'); return; }
      AdminAPI.purchaseOrders.create({ supplier_id: supplier_id, note: note, items: items })
        .done(function (r) { toast('Ordine ' + (r.numero || '') + ' creato', 'success'); closeModal(); renderView('purchase-orders'); })
        .fail(function (x) { toast((x.responseJSON && x.responseJSON.error) || 'Errore', 'error'); });
    });
  });
  $(document).on('click', '.js-po-add-row', function () { $('#poItems').append(poItemRow()); });
  $(document).on('click', '.js-po-rm-row', function () { if ($('#poItems .po-item-row').length > 1) $(this).closest('.po-item-row').remove(); });
  $(document).on('click', '.js-receive-po', function () {
    if (!window.AdminAPI || !confirm('Segnare questo ordine come ricevuto? Lo stock dei prodotti verrà aumentato.')) return;
    AdminAPI.purchaseOrders.receive($(this).data('id'))
      .done(function (r) { toast('Ordine ricevuto — ' + (r.added || 0) + ' pezzi aggiunti a stock', 'success'); renderView('purchase-orders'); })
      .fail(function (x) { toast((x.responseJSON && x.responseJSON.error) || 'Errore', 'error'); });
  });
  $(document).on('click', '.js-del-po', function () {
    if (!window.AdminAPI || !confirm('Eliminare questo ordine fornitore?')) return;
    AdminAPI.purchaseOrders.delete($(this).data('id'))
      .done(function () { toast('Ordine eliminato', 'success'); renderView('purchase-orders'); })
      .fail(function (x) { toast((x.responseJSON && x.responseJSON.error) || 'Errore', 'error'); });
  });
});
