/* MEMI Admin — Product Variants manager. Classic <script> after app.js; shares the
   global scope (AdminAPI, openModal, toast). Opened from the inventory row
   (.js-variants). Parent/child variants via /api/products/:id/variants. */

function renderVariants(pid) {
  AdminAPI.variants.list(pid).done(function (list) {
    list = Array.isArray(list) ? list : [];
    var rows = list.map(function (v) {
      var opts = Object.keys(v.options || {}).map(function (k) { return k + ': ' + v.options[k]; }).join(', ');
      return '<tr>' +
        '<td>' + (opts ? String(opts).replace(/</g, '&lt;') : '—') + '</td>' +
        '<td>' + (v.sku ? String(v.sku).replace(/</g, '&lt;') : '—') + '</td>' +
        '<td>' + (v.price != null ? ('€ ' + Number(v.price).toFixed(2).replace('.', ',')) : '<span style="color:var(--muted)">prezzo base</span>') + '</td>' +
        '<td>' + (v.stock || 0) + '</td>' +
        '<td class="row-actions"><button class="js-del-variant" data-pid="' + pid + '" data-vid="' + v.id + '" title="Elimina"><i class="ti ti-trash"></i></button></td>' +
        '</tr>';
    }).join('');
    var inp = 'width:100%;padding:6px 8px;border:1px solid var(--line);border-radius:6px;font-size:12.5px';
    var html =
      '<div class="table-wrap"><table class="data" style="width:100%"><thead><tr><th>Attributi</th><th>SKU</th><th>Prezzo</th><th>Stock</th><th></th></tr></thead>' +
      '<tbody>' + (list.length ? rows : '<tr><td colspan="5" class="empty">Nessuna variante. Aggiungine una qui sotto.</td></tr>') + '</tbody></table></div>' +
      '<form id="newVariantForm" style="margin-top:14px;border-top:1px solid var(--line);padding-top:12px">' +
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">' +
          '<input name="colore" placeholder="Colore" style="' + inp + '"/>' +
          '<input name="taglia" placeholder="Taglia" style="' + inp + '"/>' +
          '<input name="materiale" placeholder="Materiale" style="' + inp + '"/>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:8px">' +
          '<input name="sku" placeholder="SKU (opz.)" style="' + inp + '"/>' +
          '<input name="price" type="number" step="0.01" min="0" placeholder="Prezzo (opz.)" style="' + inp + '"/>' +
          '<input name="stock" type="number" min="0" value="0" placeholder="Stock" style="' + inp + '"/>' +
        '</div>' +
        '<div style="margin-top:10px;text-align:right"><button type="submit" class="btn btn-primary btn-sm">+ Aggiungi variante</button></div>' +
      '</form>';
    $('#modalBody').html(html);
    $('#newVariantForm').on('submit', function (e) {
      e.preventDefault();
      var fd = Object.fromEntries(new FormData(this));
      var options = {};
      ['colore', 'taglia', 'materiale'].forEach(function (k) { if (fd[k] && fd[k].trim()) options[k] = fd[k].trim(); });
      if (!Object.keys(options).length) { toast('Specifica almeno un attributo', 'error'); return; }
      AdminAPI.variants.create(pid, { options: options, sku: fd.sku || null, price: fd.price || null, stock: fd.stock || 0 })
        .done(function () { toast('Variante aggiunta', 'success'); renderVariants(pid); })
        .fail(function (x) { toast((x.responseJSON && x.responseJSON.error) || 'Errore', 'error'); });
    });
  }).fail(function () { $('#modalBody').html('<p style="color:var(--danger)">Errore nel caricamento delle varianti.</p>'); });
}

window.openVariantsModal = function (pid, nome) {
  if (!window.AdminAPI) return;
  openModal('Varianti · ' + (nome || pid), '<p style="color:var(--muted)">Caricamento…</p>', null, 'lg');
  renderVariants(pid);
};

jQuery(function ($) {
  $(document).on('click', '.js-variants', function () { openVariantsModal($(this).data('id'), $(this).data('nome')); });
  $(document).on('click', '.js-del-variant', function () {
    if (!window.AdminAPI || !confirm('Eliminare questa variante?')) return;
    var pid = $(this).data('pid'), vid = $(this).data('vid');
    AdminAPI.variants.delete(pid, vid)
      .done(function () { toast('Variante eliminata', 'success'); renderVariants(pid); })
      .fail(function (x) { toast((x.responseJSON && x.responseJSON.error) || 'Errore', 'error'); });
  });
});
