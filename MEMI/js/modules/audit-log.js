/* MEMI Admin — Audit Log module. Classic <script> loaded AFTER app.js; shares the
   global scope (VIEWS, DATA, AdminAPI, pageHead, window.__rerender). Uses the
   .detail-grid "scheda" layout. Wired to GET /api/admin/audit-log. */

VIEWS['audit-log'] = function () {
  var data = DATA.auditLog;
  var list = Array.isArray(data) ? data : [];
  function actionIcon(a) {
    a = String(a || '');
    if (a.indexOf('delete') > -1 || a.indexOf('cancel') > -1) return '🗑';
    if (a.indexOf('create') > -1) return '➕';
    if (a.indexOf('refund') > -1) return '💸';
    if (a.indexOf('login')  > -1) return '🔑';
    if (a.indexOf('update') > -1 || a.indexOf('status') > -1 || a.indexOf('ship') > -1) return '✏️';
    return '•';
  }
  function when(ts) { return ts ? new Date(ts).toLocaleString('it-IT') : '—'; }
  function detailsOf(r) {
    try { var d = typeof r.details === 'string' ? JSON.parse(r.details || '{}') : (r.details || {}); return (d && Object.keys(d).length) ? JSON.stringify(d) : ''; }
    catch (_) { return ''; }
  }
  var types = [];
  list.forEach(function (r) { if (r.entity_type && types.indexOf(r.entity_type) === -1) types.push(r.entity_type); });
  types.sort();

  var rows = list.map(function (r) {
    var det = detailsOf(r);
    return '<tr>' +
      '<td style="color:var(--muted);white-space:nowrap">' + when(r.created_at) + '</td>' +
      '<td>' + (r.admin_email || ('#' + (r.admin_id || '?'))) + '</td>' +
      '<td>' + actionIcon(r.action) + ' <code style="font-size:11px">' + String(r.action || '').replace(/</g, '&lt;') + '</code></td>' +
      '<td>' + (r.entity_type || '') + (r.entity_id ? (' <span style="color:var(--muted)">#' + r.entity_id + '</span>') : '') + '</td>' +
      '<td style="font-size:11px;color:var(--muted);max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + String(det).replace(/"/g, '&quot;') + '">' + String(det).replace(/</g, '&lt;') + '</td>' +
      '</tr>';
  }).join('');

  return pageHead('Registro attività', 'Traccia delle azioni eseguite nel gestionale.', '') +
    '<div class="detail-grid">' +
      '<div class="detail-main"><div class="table-card"><div class="table-wrap"><table class="data">' +
        '<thead><tr><th>Quando</th><th>Utente</th><th>Azione</th><th>Entità</th><th>Dettagli</th></tr></thead>' +
        '<tbody>' + (list.length ? rows : '<tr><td colspan="5" class="empty">' + (data === undefined ? 'Caricamento…' : 'Nessuna attività registrata.') + '</td></tr>') + '</tbody>' +
      '</table></div></div></div>' +
      '<div class="detail-side">' +
        '<div class="card"><h3>Filtra</h3><label style="font-size:12px;color:var(--muted)">Tipo entità</label>' +
          '<select id="auditFilter" style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:6px;font-size:13px;margin-top:6px">' +
          '<option value="">Tutte</option>' + types.map(function (t) { return '<option value="' + t + '"' + (DATA.auditFilter === t ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select></div>' +
        '<div class="card"><h3>Riepilogo</h3><div class="kv"><div class="k">Voci</div><div class="v">' + list.length + '</div><div class="k">Tipi entità</div><div class="v">' + types.length + '</div></div>' +
          '<p style="font-size:11px;color:var(--muted);margin-top:8px">Solo lettura. Registra creazioni, modifiche, spedizioni, rimborsi e annullamenti.</p></div>' +
      '</div>' +
    '</div>';
};

jQuery(function ($) {
  $(document).on('change', '#auditFilter', function () {
    if (!window.AdminAPI) return;
    var t = $(this).val();
    DATA.auditFilter = t || null;
    AdminAPI.auditLog.list(t ? { entity_type: t, limit: 200 } : { limit: 200 }).done(function (rows) {
      DATA.auditLog = Array.isArray(rows) ? rows : [];
      window.__rerender('audit-log');
    }).fail(function () { if (window.toast) toast('Errore caricamento registro', 'error'); });
  });
});
