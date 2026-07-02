/* MEMI Admin SPA — jQuery + MEMI Backend API (sync probe marker) */
/* ===========================================================
   MEMI Admin - SPA con jQuery + MEMI Backend API
   I dati vengono caricati dall'API in tempo reale.
   Richiede admin-api.js caricato prima di questo file.
   =========================================================== */

/* ── API data cache — populated on view load ── */
const DATA = {
  kpi: {
    revenue: { value: "Caricamento…", delta: "", up:true },
    orders:  { value: "—",            delta: "", up:true },
    visitors:{ value: "—",            delta: "", up:false },
    aov:     { value: "—",            delta: "", up:true }
  },
  // All collections start empty and are filled from the API. No mock/seed
  // rows: if an endpoint is unavailable the UI shows an honest empty state
  // instead of fabricated data.
  products:    [],
  orders:      [],
  customers:   [],
  couriers:    [],
  shipments:   [],
  zones:       [],
  pickupPoints:[],
  discounts:   [],
  apps:        [],
  newsletter: null,
  chartData:  null,
  invoices:   null,
  resi:       null,
  reviews:     null,
  staff:       null,
  settings:    null,
  collections: null,
  categories:  null,
  giftcards:   null,
  giftSummary: null,
  campaigns:   null,
  pages:       null,
  blog:        null,
  loyalty:     null
};

const COURIER_LOGOS = {
  sda: "SDA", brt:"BRT", gls:"GLS", poste:"PI", dhl:"DHL"
};

/* ----------------- HELPERS ----------------- */
function statusPill(stato){
  const s = (stato||"").toLowerCase();
  if(s.includes("conseg"))   return `<span class="status-pill ok">${stato}</span>`;
  if(s.includes("spedit") || s.includes("transito") || s.includes("consegna")) return `<span class="status-pill shipped">${stato}</span>`;
  if(s.includes("attesa") || s.includes("preparaz") || s.includes("preso") || s.includes("pianif")) return `<span class="status-pill pending">${stato}</span>`;
  if(s.includes("annul") || s.includes("rimbors") || s.includes("esauri")) return `<span class="status-pill fail">${stato}</span>`;
  if(s.includes("attiv") || s.includes("pagat"))    return `<span class="status-pill ok">${stato}</span>`;
  if(s.includes("bozza") || s.includes("disatt"))   return `<span class="status-pill neutral">${stato}</span>`;
  return `<span class="status-pill neutral">${stato}</span>`;
}

function pageHead(title, sub, actions){
  actions = actions || "";
  return `
    <div class="page-head">
      <div>
        <h2>${title}</h2>
        <p>${sub||""}</p>
      </div>
      <div class="page-actions">${actions}</div>
    </div>
  `;
}

function chartSVG(){
  var data = DATA.chartData;
  var W = 600, H = 220, PX = 24, PY = 18;
  if (!data || data.length < 2) {
    // Honest empty/loading state — flat baseline + label, no fabricated curve.
    var msg = (DATA.chartData === null) ? 'Caricamento…' : 'Nessun dato di vendita nel periodo';
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <line x1="${PX}" x2="${W-PX}" y1="${H-PY}" y2="${H-PY}" stroke="var(--line)" stroke-width="1.5"/>
      <text x="${W/2}" y="${H/2}" text-anchor="middle" fill="var(--muted)" font-size="13" font-family="inherit">${msg}</text>
    </svg>`;
  }
  var revenues = data.map(function(d){ return parseFloat(d.revenue)||0; });
  var orders   = data.map(function(d){ return parseFloat(d.orders)||0; });
  var maxRev   = Math.max.apply(null, revenues) || 1;
  var maxOrd   = Math.max.apply(null, orders) || 1;
  var n = data.length;
  function toPoints(vals, maxV) {
    return vals.map(function(v, i){
      var x = PX + (i/(n-1))*(W-2*PX);
      var y = H - PY - (v/maxV)*(H-2*PY);
      return x.toFixed(1)+','+y.toFixed(1);
    });
  }
  var rPts = toPoints(revenues, maxRev);
  var oPts = toPoints(orders, maxOrd);
  var rLine = rPts.map(function(p,i){ return (i===0?'M':'L')+p; }).join(' ');
  var rArea = rLine+' L'+(W-PX)+','+(H-PY)+' L'+PX+','+(H-PY)+' Z';
  var oLine = oPts.map(function(p,i){ return (i===0?'M':'L')+p; }).join(' ');
  // Grid lines
  var gridLines = '';
  for (var g=0;g<4;g++){
    var gy = PY + g*((H-2*PY)/3);
    gridLines += '<line x1="'+PX+'" x2="'+(W-PX)+'" y1="'+gy.toFixed(0)+'" y2="'+gy.toFixed(0)+'" stroke="var(--line)" stroke-width="1"/>';
  }
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="overflow:visible">
    <defs><linearGradient id="g1" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="#7fc29b" stop-opacity=".35"/>
      <stop offset="100%" stop-color="#7fc29b" stop-opacity="0"/>
    </linearGradient></defs>
    ${gridLines}
    <path d="${rArea}" fill="url(#g1)"/>
    <path d="${rLine}" fill="none" stroke="#7fc29b" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="${oLine}" fill="none" stroke="#e89aae" stroke-width="2" stroke-dasharray="5 3" stroke-linejoin="round"/>
  </svg>`;
}

function toast(msg, type){
  const $t = $('#toast');
  $t.removeClass('show success error info').text(msg);
  if(type) $t.addClass(type);
  $t.addClass('show');
  setTimeout(()=> $t.removeClass('show'), 2200);
}

function openModal(title, body, footer){
  $('#modalTitle').text(title);
  $('#modalBody').html(body + (footer ? '<div class="modal-foot" style="margin-top:16px;display:flex;justify-content:flex-end;gap:8px">' + footer + '</div>' : ''));
  $('#modalBackdrop').addClass('show');
}
function closeModal(){ $('#modalBackdrop').removeClass('show'); }

/* ----------------- VIEWS ----------------- */
const VIEWS = {};

VIEWS.dashboard = function(){
  const k = DATA.kpi;
  return `
    ${pageHead("Buongiorno, Admin 👋","Ecco cosa è successo oggi nel tuo store.",`
      <button class="btn btn-soft btn-sm js-export-orders">📤 Esporta</button>
    `)}
    <div class="grid grid-4">
      <div class="card kpi green"><div class="icon-wrap">💰</div>
        <span class="label">Fatturato (oggi)</span>
        <span class="value">${k.revenue.value}</span>
        <span class="delta ${k.revenue.up?'up':'down'}">${k.revenue.delta} vs ieri</span>
      </div>
      <div class="card kpi pink"><div class="icon-wrap">🧾</div>
        <span class="label">Ordini</span>
        <span class="value">${k.orders.value}</span>
        <span class="delta ${k.orders.up?'up':'down'}">${k.orders.delta}</span>
      </div>
      <div class="card kpi soft"><div class="icon-wrap">👁</div>
        <span class="label">Visitatori</span>
        <span class="value">${k.visitors.value}</span>
        <span class="delta ${k.visitors.up?'up':'down'}">${k.visitors.delta}</span>
      </div>
      <div class="card kpi green"><div class="icon-wrap">📈</div>
        <span class="label">AOV</span>
        <span class="value">${k.aov.value}</span>
        <span class="delta ${k.aov.up?'up':'down'}">${k.aov.delta}</span>
      </div>
    </div>

    <div class="grid grid-3" style="margin-top:16px">
      <div class="card" style="grid-column:span 2">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <h3>Andamento vendite</h3>
          <select class="btn btn-soft btn-sm">
            <option>Ultimi 7 giorni</option>
            <option>Ultimi 30 giorni</option>
            <option>Ultimo trimestre</option>
          </select>
        </div>
        <div class="chart-placeholder">${chartSVG()}</div>
      </div>
      <div class="card">
        <h3>Ordini recenti</h3>
        <ul class="list-clean">
          ${DATA.orders.slice(0,5).map(o=>`
            <li>
              <div>
                <strong>${o.id}</strong>
                <small style="display:block;color:var(--muted)">${o.cliente}</small>
              </div>
              <div style="text-align:right">
                <strong>${o.totale}</strong>
                <small style="display:block">${statusPill(o.stato)}</small>
              </div>
            </li>
          `).join('')}
        </ul>
      </div>
    </div>

    <div class="grid grid-2" style="margin-top:16px">
      <div class="card">
        <h3>Top prodotti</h3>
        <ul class="list-clean">
          ${DATA.products.slice(0,5).map((p,i)=>`
            <li>
              <div style="display:flex;align-items:center;gap:10px">
                <div class="prod-thumb" style="width:38px;height:38px;font-size:18px;border-radius:8px">${p.img}</div>
                <div><strong>${p.nome}</strong><small style="display:block;color:var(--muted)">${p.cat}</small></div>
              </div>
              <strong>${p.prezzo}</strong>
            </li>
          `).join('')}
        </ul>
      </div>
      <div class="card">
        <h3>Spedizioni in corso</h3>
        <ul class="list-clean">
          ${DATA.shipments.slice(0,5).map(s=>`
            <li>
              <div>
                <strong>${s.id}</strong>
                <small style="display:block;color:var(--muted)">${s.destinazione} · ${s.corriere.toUpperCase()}</small>
              </div>
              ${statusPill(s.stato)}
            </li>
          `).join('')}
        </ul>
      </div>
    </div>
  `;
};

/* ---------- ORDINI ---------- */
VIEWS.orders = function(filter){
  let rows = DATA.orders;
  if(filter==="drafts") rows = rows.filter(o=>o.stato.toLowerCase().includes("attesa"));
  if(filter==="abandoned") rows = []; // simulato
  return `
    ${pageHead("Ordini","Gestisci tutti gli ordini ricevuti dallo store.",`
      <button class="btn btn-ghost btn-sm js-export-orders">📤 Esporta CSV</button>
      <button class="btn btn-primary btn-sm js-new-order">+ Nuovo ordine</button>
    `)}
    <div class="table-card">
      <div class="table-head">
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-soft btn-sm tab-filter active">Tutti</button>
          <button class="btn btn-soft btn-sm tab-filter">Non pagati</button>
          <button class="btn btn-soft btn-sm tab-filter">Da spedire</button>
          <button class="btn btn-soft btn-sm tab-filter">Spediti</button>
          <button class="btn btn-soft btn-sm tab-filter">Annullati</button>
        </div>
        <div class="table-tools">
          <input type="text" id="orderSearch" placeholder="Cerca ordine o cliente..."/>
          <select><option>Ordina: più recenti</option><option>Totale ↑</option><option>Totale ↓</option></select>
        </div>
      </div>
      <div class="table-wrap">
        <table class="data" id="ordersTable">
          <thead>
            <tr>
              <th><input type="checkbox" id="selAll"/></th>
              <th>Ordine</th><th>Cliente</th><th>Data</th><th>Totale</th>
              <th>Pagamento</th><th>Stato</th><th>Corriere</th><th></th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(o=>`
              <tr data-id="${o.id}" data-status="${o._raw_status||''}">
                <td><input type="checkbox" class="rowSel"/></td>
                <td><strong>${o.id}</strong></td>
                <td>${o.cliente}</td>
                <td>${o.data}</td>
                <td><strong>${o.totale}</strong></td>
                <td>${statusPill(o.pagamento)}</td>
                <td>${statusPill(o.stato)}</td>
                <td>${o.corriere}</td>
                <td class="row-actions">
                  <button title="Visualizza" class="js-view-order">👁</button>
                  <button title="Stampa" class="js-print-order-row">🖨</button>
                  <button title="Elimina" class="js-del-order" data-id="${o._db_id||''}" data-order="${o.id}">🗑</button>
                </td>
              </tr>
            `).join('')}
            ${rows.length===0?`<tr><td colspan="9" class="empty">Nessun ordine in questa vista</td></tr>`:''}
          </tbody>
        </table>
      </div>
    </div>
  `;
};
VIEWS["orders-drafts"]    = ()=> VIEWS.orders("drafts");
VIEWS["orders-abandoned"] = ()=> VIEWS.orders("abandoned");

VIEWS.invoices = function(){
  const invs = DATA.invoices || [];
  const total  = invs.length;
  const emesse = invs.filter(i=>i.stato==='emessa'||i.stato==='inviata').length;
  const pagate = invs.filter(i=>i.stato==='pagata').length;
  return `
    ${pageHead("Fatture","Documenti fiscali emessi.",`
      <button class="btn btn-soft btn-sm js-export-invoices">📤 Esporta CSV</button>
      <button class="btn btn-primary btn-sm js-new-invoice">+ Nuova fattura</button>
    `)}
    <div class="grid grid-3" style="margin-bottom:16px">
      <div class="card kpi green"><span class="label">Totale fatture</span><span class="value">${total}</span></div>
      <div class="card kpi soft"><span class="label">Emesse / Inviate</span><span class="value">${emesse}</span></div>
      <div class="card kpi pink"><span class="label">Pagate</span><span class="value">${pagate}</span></div>
    </div>
    <div class="table-card">
      <div class="table-head">
        <div style="display:flex;gap:6px">
          <input type="text" id="invSearch" placeholder="Cerca fattura..." style="padding:6px 12px;border:1px solid var(--line);border-radius:6px;font-size:13px;width:220px"/>
        </div>
      </div>
      <div class="table-wrap"><table class="data" id="invoiceTable">
        <thead><tr><th>N° Fattura</th><th>Ordine</th><th>Cliente</th><th>Data</th><th>Importo</th><th>Stato</th><th></th></tr></thead>
        <tbody>
          ${invs.length ? invs.map(inv=>`
            <tr data-id="${inv.id}">
              <td><strong>${inv.invoice_number}</strong></td>
              <td>${inv.order_number||('Ord. '+inv.order_id)}</td>
              <td>${(inv.customer_nome||'')+' '+(inv.customer_cognome||'')}</td>
              <td style="color:var(--muted)">${new Date(inv.created_at).toLocaleDateString('it-IT')}</td>
              <td><strong>€ ${parseFloat(inv.total||0).toFixed(2).replace('.',',')}</strong></td>
              <td>${statusPill(AdminAPI?AdminAPI.statusLabel(inv.stato):inv.stato)}</td>
              <td class="row-actions">
                <button class="js-view-invoice" data-id="${inv.id}" title="Visualizza">👁</button>
                <button class="js-inv-stato" data-id="${inv.id}" data-stato="inviata" title="Segna inviata">✉</button>
                <button class="js-del-invoice" data-id="${inv.id}" title="Elimina">🗑</button>
              </td>
            </tr>
          `).join('') : `<tr><td colspan="7" class="empty">${DATA.invoices===null?'Caricamento…':'Nessuna fattura emessa'}</td></tr>`}
        </tbody>
      </table></div>
    </div>
  `;
};

VIEWS.returns = function(){
  const resiList = DATA.resi || [];
  const aperti    = resiList.filter(r=>r.stato==='aperto').length;
  const inAnalisi = resiList.filter(r=>r.stato==='in_analisi').length;
  const rimborsati= resiList.filter(r=>r.stato==='rimborsato').length;
  return `
    ${pageHead("Resi","Gestisci richieste di reso e rimborsi.",`
      <button class="btn btn-primary btn-sm js-new-reso">+ Nuovo reso</button>
    `)}
    <div class="grid grid-3" style="margin-bottom:16px">
      <div class="card kpi pink"><div class="icon-wrap">↩</div><span class="label">Aperti</span><span class="value">${aperti}</span></div>
      <div class="card kpi soft"><div class="icon-wrap">⏳</div><span class="label">In analisi</span><span class="value">${inAnalisi}</span></div>
      <div class="card kpi green"><div class="icon-wrap">✅</div><span class="label">Rimborsati</span><span class="value">${rimborsati}</span></div>
    </div>
    <div class="table-card"><div class="table-wrap"><table class="data" id="resiTable">
      <thead><tr><th>RMA</th><th>Ordine</th><th>Cliente</th><th>Motivo</th><th>Data</th><th>Stato</th><th></th></tr></thead>
      <tbody>
        ${resiList.length ? resiList.map(r=>`
          <tr data-id="${r.id}">
            <td><strong>${r.rma_number}</strong></td>
            <td>${r.order_number||('#'+r.order_id)}</td>
            <td>${r.customer_nome||r.customer_email||'—'}</td>
            <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.motivo||'—'}</td>
            <td style="color:var(--muted)">${new Date(r.created_at).toLocaleDateString('it-IT')}</td>
            <td>${statusPill(AdminAPI?AdminAPI.statusLabel(r.stato):r.stato)}</td>
            <td class="row-actions">
              <button class="js-view-reso" data-id="${r.id}" title="Gestisci reso">👁</button>
              <button class="js-del-reso" data-id="${r.id}" data-rma="${r.rma_number}" title="Elimina">🗑</button>
            </td>
          </tr>
        `).join('') : `<tr><td colspan="7" class="empty">${DATA.resi===null?'Caricamento…':'Nessun reso registrato'}</td></tr>`}
      </tbody>
    </table></div></div>
  `;
};

/* ---------- PRODOTTI ---------- */
VIEWS.products = function(){
  return `
    ${pageHead("Prodotti","Gestisci catalogo, varianti, prezzi e magazzino.",`
      <button class="btn btn-ghost btn-sm js-export-products">📤 Esporta CSV</button>
      <button class="btn btn-primary btn-sm js-new-product">+ Nuovo prodotto</button>
    `)}
    <div class="card" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:14px">
      <input type="text" id="prodSearch" placeholder="Cerca prodotto..." style="flex:1;min-width:200px;padding:8px 12px;border:1px solid var(--line);border-radius:8px;background:#fafafa"/>
      <select id="prodCatFilter" class="btn btn-soft btn-sm">
        <option value="">Tutte le categorie</option>
        ${(()=>{ var cats=[...new Set((DATA.products||[]).map(p=>p.cat).filter(Boolean))].sort(); return cats.map(c=>`<option value="${c}">${c}</option>`).join(''); })()}
      </select>
      <select id="prodStatusFilter" class="btn btn-soft btn-sm">
        <option value="">Tutti gli stati</option>
        <option value="attivo">Attivo</option>
        <option value="bozza">Bozza</option>
        <option value="esaurito">Esaurito</option>
      </select>
      <div style="margin-left:auto;display:flex;gap:4px">
        <button class="btn btn-soft btn-sm view-toggle active" data-mode="grid">▦ Griglia</button>
        <button class="btn btn-soft btn-sm view-toggle" data-mode="list">☰ Lista</button>
      </div>
    </div>
    <div id="productsArea"></div>
  `;
};

VIEWS.inventory = function(){
  return `
    ${pageHead("Magazzino","Tracciamento giacenze e aggiornamento stock.","")}
    <div class="table-card"><div class="table-wrap"><table class="data">
      <thead><tr><th>SKU / ID</th><th>Prodotto</th><th>Categoria</th><th>Stock totale</th><th>Stato</th><th></th></tr></thead>
      <tbody>
        ${DATA.products.map(p=>`<tr data-prod-id="${p.id}">
          <td><code style="font-size:11px">${p.id}</code></td>
          <td><div style="display:flex;align-items:center;gap:8px"><span>${p.img}</span><strong>${p.nome}</strong></div></td>
          <td>${p.cat}</td>
          <td><strong>${p.stock}</strong></td>
          <td>${statusPill(p.stock===0?'Esaurito':p.stock<10?'Scorta bassa':'OK')}</td>
          <td class="row-actions">
            <button class="btn btn-soft btn-sm js-update-stock" data-id="${p.id}" data-nome="${p.nome}" title="Aggiorna stock">✏ Stock</button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table></div></div>
  `;
};

VIEWS.collections = function(){
  const colls = DATA.collections || [];
  const gradients = [
    'linear-gradient(135deg,#f9e4e8,#e8d5f0)',
    'linear-gradient(135deg,#d5ece8,#d5e8f0)',
    'linear-gradient(135deg,#f0e8d5,#f0d5d5)',
    'linear-gradient(135deg,#e8f0d5,#d5f0e8)',
    'linear-gradient(135deg,#f0d5e8,#e8d5f0)',
    'linear-gradient(135deg,#d5e8f0,#d5ecf0)',
  ];
  return `
    ${pageHead("Collezioni","Raggruppa prodotti per campagne tematiche.","")}
    ${colls.length === 0 ? `<div class="card"><p style="color:var(--muted);text-align:center;padding:40px">${DATA.collections===null?'Caricamento…':'Nessuna collezione trovata nei prodotti.'}</p></div>` : `
    <div class="grid grid-3">
      ${colls.map((c,i)=>`
        <div class="card" style="cursor:pointer">
          <div style="height:100px;border-radius:10px;background:${gradients[i%gradients.length]};margin-bottom:10px;display:flex;align-items:center;justify-content:center;font-size:28px">📚</div>
          <strong>${c.slug}</strong>
          <p style="color:var(--muted);font-size:12px;margin-top:4px">${c.count} ${c.count===1?'prodotto':'prodotti'}</p>
        </div>
      `).join('')}
    </div>`}
  `;
};

VIEWS.categories = function(){
  const cats = DATA.categories || [];
  const _catIcon = {vestiti:'👗',gonne:'👗',blazer:'🥻',top:'👕',pantaloni:'👖',borse:'👜',scarpe:'👟',gioielli:'💍',accessori:'✨',set:'✨',cinture:'🪡',maglie:'👕',abiti:'👗',capispalla:'🧥',intimo:'🩱'};
  return `
    ${pageHead("Categorie","Struttura del catalogo prodotti.","")}
    ${cats.length === 0 ? `<div class="card"><p style="color:var(--muted);text-align:center;padding:40px">${DATA.categories===null?'Caricamento…':'Nessuna categoria trovata.'}</p></div>` : `
    <div class="card">
      <table class="data" style="width:100%">
        <thead><tr><th>Categoria</th><th style="text-align:right">Prodotti</th><th style="text-align:right">Attivi</th><th style="text-align:right">Esauriti</th></tr></thead>
        <tbody>
          ${cats.map(c=>`<tr>
            <td><span style="margin-right:6px">${_catIcon[c.slug]||'📦'}</span><strong>${c.slug.charAt(0).toUpperCase()+c.slug.slice(1)}</strong></td>
            <td style="text-align:right">${c.count}</td>
            <td style="text-align:right">${c.active}</td>
            <td style="text-align:right"><span style="color:${c.esauriti>0?'var(--red)':'var(--muted)'}">${c.esauriti}</span></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`}
  `;
};

VIEWS.transfers = function(){
  return `
    ${pageHead("Trasferimenti","Movimenti di magazzino tra depositi.","")}
    <div class="card"><p style="color:var(--muted);text-align:center;padding:40px">Nessun trasferimento registrato.</p></div>
  `;
};

VIEWS.giftcards = function(){
  const cards = DATA.giftcards || [];
  const sum   = DATA.giftSummary || { total:0, attive:0, balance:0, emesso:0 };
  const eur   = v => '€ ' + (Number(v)||0).toFixed(2).replace('.', ',');
  return `
    ${pageHead("Gift Card","Card prepagate digitali.",`<button class="btn btn-primary btn-sm js-new-giftcard">+ Emetti gift card</button>`)}
    <div class="grid grid-4" style="margin-bottom:16px">
      <div class="card kpi green"><span class="label">Emesse</span><span class="value">${sum.total}</span></div>
      <div class="card kpi pink"><span class="label">Attive</span><span class="value">${sum.attive}</span></div>
      <div class="card kpi soft"><span class="label">Valore residuo</span><span class="value">${eur(sum.balance)}</span></div>
      <div class="card kpi green"><span class="label">Totale emesso</span><span class="value">${eur(sum.emesso)}</span></div>
    </div>
    <div class="table-card"><div class="table-wrap"><table class="data">
      <thead><tr><th>Codice</th><th>Valore iniziale</th><th>Saldo</th><th>Destinatario</th><th>Stato</th><th>Emessa</th><th></th></tr></thead>
      <tbody>
        ${cards.length ? cards.map(c=>`
          <tr data-id="${c.id}">
            <td><strong style="font-family:monospace">${c.code}</strong></td>
            <td>${eur(c.initial_amount)}</td>
            <td><strong>${eur(c.balance)}</strong></td>
            <td>${c.recipient_email||'—'}</td>
            <td>${statusPill(AdminAPI?AdminAPI.statusLabel(c.stato):c.stato)}</td>
            <td style="color:var(--muted)">${new Date(c.created_at).toLocaleDateString('it-IT')}</td>
            <td class="row-actions">
              <button class="js-copy-code" data-code="${c.code}" title="Copia codice">📋</button>
              <button class="js-toggle-giftcard" data-id="${c.id}" data-stato="${c.stato}" title="${c.stato==='disattivata'?'Riattiva':'Disattiva'}">${c.stato==='disattivata'?'✅':'🚫'}</button>
              <button class="js-del-giftcard" data-id="${c.id}" data-code="${c.code}" title="Elimina">🗑</button>
            </td>
          </tr>
        `).join('') : `<tr><td colspan="7" class="empty">${DATA.giftcards===null?'Caricamento…':'Nessuna gift card emessa'}</td></tr>`}
      </tbody>
    </table></div></div>
  `;
};

/* ---------- CLIENTI ---------- */
VIEWS.customers = function(){
  return `
    ${pageHead("Clienti","Anagrafica e cronologia acquisti.",`
      <button class="btn btn-soft btn-sm js-export-customers">📤 Esporta CSV</button>
      <button class="btn btn-primary btn-sm js-new-customer">+ Nuovo cliente</button>
    `)}
    <div class="grid grid-4" style="margin-bottom:16px">
      <div class="card kpi green"><span class="label">Totale clienti</span><span class="value">${DATA.customers.length}</span></div>
      <div class="card kpi pink"><span class="label">VIP</span><span class="value">${DATA.customers.filter(c=>c.vip).length}</span></div>
      <div class="card kpi soft"><span class="label">Con più di 1 ordine</span><span class="value">${DATA.customers.filter(c=>(parseInt(c.ordini)||0)>1).length}</span></div>
      <div class="card kpi soft"><span class="label">Spesa media</span><span class="value">${(()=>{const n=DATA.customers.length;if(!n)return '—';const tot=DATA.customers.reduce((s,c)=>s+(parseFloat(String(c.speso||'').replace(/[^0-9,.-]/g,'').replace(/\./g,'').replace(',','.'))||0),0);return '€ '+(tot/n).toFixed(0);})()}</span></div>
    </div>
    <div class="table-card"><div class="table-wrap"><table class="data">
      <thead><tr><th>Cliente</th><th>Email</th><th>Ordini</th><th>Speso</th><th>Ultimo ordine</th><th>Tag</th><th></th></tr></thead>
      <tbody>
        ${DATA.customers.map(c=>`
          <tr>
            <td><div style="display:flex;align-items:center;gap:8px"><div class="avatar small">${c.nome.charAt(0)}</div><strong>${c.nome}</strong></div></td>
            <td>${c.email}</td><td>${c.ordini}</td><td>${c.speso}</td><td>${c.ultimo}</td>
            <td>${c.vip?'<span class="badge badge-pink">VIP</span>':'<span class="badge badge-soft">Standard</span>'}</td>
            <td class="row-actions">
              <button class="js-view-customer" data-id="${c._db_id||c.id}" data-name="${c.nome}" title="Visualizza">👁</button>
              <button class="js-email-customer" data-email="${c.email}" title="Invia email">✉</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table></div></div>
  `;
};

VIEWS.segments = function(){
  return `
    ${pageHead("Segmenti","Raggruppa i clienti per comportamento.",`<button class="btn btn-primary btn-sm js-new-segment">+ Analizza segmento</button>`)}
    ${(()=>{
      const custs = DATA.customers;
      if(custs===null || custs===undefined){ return '<div class="card"><p style="color:var(--muted);text-align:center;padding:40px">Caricamento…</p></div>'; }
      const num = s => parseFloat(String(s||'').replace(/[^0-9,.-]/g,'').replace(/\./g,'').replace(',','.'))||0;
      const segs = [
        ["VIP","Speso > €300", custs.filter(c=>c.vip||num(c.speso)>300).length],
        ["Spendaccioni","Speso > €100", custs.filter(c=>num(c.speso)>100).length],
        ["Clienti fedeli","Più di 1 ordine", custs.filter(c=>(parseInt(c.ordini)||0)>1).length],
        ["Primo acquisto","Un solo ordine", custs.filter(c=>(parseInt(c.ordini)||0)===1).length],
        ["Senza ordini","Registrati, 0 ordini", custs.filter(c=>(parseInt(c.ordini)||0)===0).length],
        ["Totale clienti","Tutta la base", custs.length]
      ];
      return `<div class="grid grid-3">${segs.map(s=>`
        <div class="card">
          <h3>${s[0]}</h3>
          <p style="color:var(--muted);font-size:12px">${s[1]}</p>
          <p style="margin-top:10px"><strong>${s[2]} ${s[2]===1?'cliente':'clienti'}</strong></p>
        </div>
      `).join('')}</div>`;
    })()}
  `;
};

VIEWS.reviews = function(){
  const rvs     = (DATA.reviews && DATA.reviews.list) ? DATA.reviews.list : [];
  const pending = (DATA.reviews && DATA.reviews.pending) ? DATA.reviews.pending : 0;
  const total   = (DATA.reviews && DATA.reviews.total)   ? DATA.reviews.total   : 0;
  const avgRaw  = rvs.length ? (rvs.reduce((s,r)=>s+(parseFloat(r.rating)||0),0)/rvs.length).toFixed(1) : '—';
  return `
    ${pageHead("Recensioni","Moderation e feedback prodotti.",`
      <button class="btn btn-soft btn-sm js-filter-reviews" data-stato="">Tutte</button>
      <button class="btn btn-soft btn-sm js-filter-reviews" data-stato="in_attesa">⏳ In attesa (${pending})</button>
    `)}
    <div class="grid grid-3" style="margin-bottom:16px">
      <div class="card kpi green"><span class="label">Totale recensioni</span><span class="value">${total}</span></div>
      <div class="card kpi pink"><span class="label">In attesa moderaz.</span><span class="value">${pending}</span></div>
      <div class="card kpi soft"><span class="label">Rating medio</span><span class="value">${avgRaw}★</span></div>
    </div>
    <div class="table-card"><div class="table-wrap"><table class="data" id="reviewsTable">
      <thead><tr><th>Prodotto</th><th>Cliente</th><th>Rating</th><th>Testo</th><th>Data</th><th>Stato</th><th></th></tr></thead>
      <tbody>
        ${rvs.length ? rvs.map(r=>`
          <tr data-id="${r.id}">
            <td><strong>${r.product_name||r.product_id}</strong></td>
            <td>${r.customer_nome||'Anonimo'}</td>
            <td style="color:#e89aae;font-size:15px">${'★'.repeat(parseInt(r.rating)||0)}${'☆'.repeat(5-(parseInt(r.rating)||0))}</td>
            <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted)">${r.testo||'—'}</td>
            <td style="color:var(--muted)">${new Date(r.created_at).toLocaleDateString('it-IT')}</td>
            <td>${statusPill(AdminAPI?AdminAPI.statusLabel(r.stato):r.stato)}</td>
            <td class="row-actions">
              ${r.stato==='in_attesa'?`<button class="js-approve-review" data-id="${r.id}" title="Pubblica" style="color:var(--green)">✓</button><button class="js-reject-review" data-id="${r.id}" title="Rifiuta" style="color:var(--pink)">✗</button>`:''}
              <button class="js-del-review" data-id="${r.id}" title="Elimina">🗑</button>
            </td>
          </tr>
        `).join('') : `<tr><td colspan="7" class="empty">${DATA.reviews===null?'Caricamento…':'Nessuna recensione'}</td></tr>`}
      </tbody>
    </table></div></div>
  `;
};

/* ---------- FEDELTÀ & PUNTI ---------- */
function loyaltyField(label,key,value,type){
  type=type||'number';
  if(type==='select'){
    return `<div class="kv" style="grid-template-columns:200px 1fr;gap:8px;align-items:center"><div style="font-size:13px;color:var(--muted)">${label}</div><div><select class="loyalty-input" data-key="${key}" style="width:100%;padding:7px 10px;border:1px solid var(--line);border-radius:6px"><option value="1"${String(value)==='1'?' selected':''}>Sì</option><option value="0"${String(value)==='0'?' selected':''}>No</option></select></div></div>`;
  }
  return `<div class="kv" style="grid-template-columns:200px 1fr;gap:8px;align-items:center"><div style="font-size:13px;color:var(--muted)">${label}</div><div><input type="number" step="0.01" min="0" class="loyalty-input" data-key="${key}" value="${value}" style="width:100%;padding:7px 10px;border:1px solid var(--line);border-radius:6px"/></div></div>`;
}
VIEWS.loyalty = function(){
  const d = DATA.loyalty;
  if (!d) return `${pageHead("Fedeltà & Punti","Programma punti clienti.","")}<div class="card"><p style="color:var(--muted);text-align:center;padding:40px">Caricamento…</p></div>`;
  const cfg = d.config || {};
  const custs = d.customers || [];
  const sum = d.summary || {};
  const eur = v => '€ ' + (Number(v)||0).toFixed(2);
  const ptsPerEuro = Number(cfg.pointsPerEuro)||0;
  const ptVal = Number(cfg.pointValueEur)||0;
  return `
    ${pageHead("Fedeltà & Punti","I clienti accumulano punti (registrazione + acquisti) e li riscattano in sconti.",`<button class="btn btn-primary btn-sm js-save-loyalty">💾 Salva configurazione</button>`)}
    <div class="grid grid-3" style="margin-bottom:16px">
      <div class="card kpi green"><span class="label">Punti in circolazione</span><span class="value">${sum.total_points||0}</span></div>
      <div class="card kpi pink"><span class="label">Membri</span><span class="value">${sum.members||0}</span></div>
      <div class="card kpi soft"><span class="label">Valore residuo</span><span class="value">${eur((sum.total_points||0)*ptVal)}</span></div>
    </div>
    <div class="card" style="margin-bottom:16px">
      <h3 style="margin-bottom:12px">Configurazione programma</h3>
      <div class="grid grid-2" style="gap:10px">
        ${loyaltyField('Programma attivo','loyalty_enabled', cfg.enabled?'1':'0','select')}
        ${loyaltyField('Bonus registrazione (punti)','loyalty_signup_bonus', cfg.signupBonus)}
        ${loyaltyField('Punti per € speso','loyalty_points_per_euro', cfg.pointsPerEuro)}
        ${loyaltyField('Valore di 1 punto (€)','loyalty_point_value_eur', cfg.pointValueEur)}
        ${loyaltyField('Minimo punti per riscatto','loyalty_min_redeem', cfg.minRedeem)}
      </div>
      <p style="color:var(--muted);font-size:12px;margin-top:8px">Esempio: un acquisto di € 100 genera <strong>${Math.floor(100*ptsPerEuro)} punti</strong> = ${eur(Math.floor(100*ptsPerEuro)*ptVal)} di sconto riscattabile.</p>
    </div>
    <div class="table-card"><div class="table-wrap"><table class="data">
      <thead><tr><th>Cliente</th><th>Email</th><th>Punti</th><th>Ordini</th><th>Speso</th><th></th></tr></thead>
      <tbody>
        ${custs.length ? custs.map(c=>`
          <tr>
            <td><strong>${((c.nome||'')+' '+(c.cognome||'')).trim()||'—'}</strong></td>
            <td>${c.email}</td>
            <td><strong>${c.points||0}</strong></td>
            <td>${c.total_orders||0}</td>
            <td>${eur(c.total_spent)}</td>
            <td class="row-actions"><button class="btn btn-soft btn-sm js-adjust-points" data-id="${c.id}" data-nome="${((c.nome||'')+' '+(c.cognome||'')).replace(/"/g,'&quot;')}" data-points="${c.points||0}">± Punti</button></td>
          </tr>
        `).join('') : `<tr><td colspan="6" class="empty">Nessun cliente registrato</td></tr>`}
      </tbody>
    </table></div></div>
  `;
};

/* ---------- MARKETING ---------- */
VIEWS.marketing = function(){
  const camps = DATA.campaigns || [];
  const eur = v => '€ ' + (Number(v)||0).toFixed(0);
  const tipoIcon = { email:'📧', ads:'📣', automazione:'⚙️', sms:'💬' };
  return `
    ${pageHead("Marketing","Campagne attive e performance.",`<button class="btn btn-primary btn-sm js-new-campaign">+ Nuova campagna</button>`)}
    ${camps.length===0 ? `<div class="card"><p style="color:var(--muted);text-align:center;padding:40px">${DATA.campaigns===null?'Caricamento…':'Nessuna campagna. Creane una con “+ Nuova campagna”.'}</p></div>` : `
    <div class="grid grid-3">
      ${camps.map(c=>`
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <h3>${tipoIcon[c.tipo]||'📌'} ${c.nome}</h3>
            ${statusPill(AdminAPI?AdminAPI.statusLabel(c.stato):c.stato)}
          </div>
          <p style="color:var(--muted);font-size:12px;margin-top:4px">${(c.tipo||'').charAt(0).toUpperCase()+(c.tipo||'').slice(1)}${c.canale?' · '+c.canale:''}${c.destinatari?' · '+c.destinatari+' destinatari':''}${Number(c.budget)>0?' · '+eur(c.budget)+' budget':''}</p>
          <div style="margin-top:10px;display:flex;gap:14px;flex-wrap:wrap">
            <div><strong>${Number(c.open_rate)||0}%</strong><small style="display:block;color:var(--muted)">Open</small></div>
            <div><strong>${Number(c.click_rate)||0}%</strong><small style="display:block;color:var(--muted)">Click</small></div>
            <div><strong>${eur(c.revenue)}</strong><small style="display:block;color:var(--muted)">Generati</small></div>
          </div>
          <div style="margin-top:12px;display:flex;gap:6px">
            <button class="btn btn-soft btn-sm js-edit-campaign" data-id="${c.id}" data-nome="${(c.nome||'').replace(/"/g,'&quot;')}" data-stato="${c.stato}">✏ Modifica</button>
            <button class="btn btn-ghost btn-sm js-del-campaign" data-id="${c.id}" data-nome="${(c.nome||'').replace(/"/g,'&quot;')}">🗑</button>
          </div>
        </div>
      `).join('')}
    </div>`}
  `;
};
VIEWS.automations = ()=> VIEWS.marketing();
VIEWS.newsletter = function(){
  const nl = DATA.newsletter;
  const total       = nl ? nl.total       : '—';
  const unsubscribed= nl ? nl.unsubscribed : '—';
  const recent      = (nl && nl.recent)   ? nl.recent : [];
  return `
    ${pageHead("Newsletter","Iscritti e contatti email.",`<button class="btn btn-primary btn-sm js-nl-export" title="Esporta CSV">⬇ Esporta</button>`)}
    <div class="grid grid-3">
      <div class="card kpi green">
        <div class="icon-wrap">📧</div>
        <span class="label">Iscritti attivi</span>
        <span class="value">${total}</span>
        <span class="delta up">in database</span>
      </div>
      <div class="card kpi pink">
        <div class="icon-wrap">🚫</div>
        <span class="label">Disiscritti</span>
        <span class="value">${unsubscribed}</span>
        <span class="delta">totali</span>
      </div>
      <div class="card kpi soft">
        <div class="icon-wrap">📈</div>
        <span class="label">Tasso iscrizione</span>
        <span class="value">${nl && nl.total > 0 ? Math.round(nl.total / (nl.total + nl.unsubscribed) * 100) + '%' : '—'}</span>
        <span class="delta">attivi sul totale</span>
      </div>
    </div>
    <div class="card" style="margin-top:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <h3>Lista iscritti</h3>
        <input type="text" id="nlSearch" placeholder="Cerca email..." style="padding:6px 12px;border:1px solid var(--line);border-radius:6px;font-size:13px;width:220px">
      </div>
      <div class="table-wrap"><table class="data" id="nlTable">
        <thead><tr><th>Email</th><th>Fonte</th><th>Data iscrizione</th><th>Stato</th></tr></thead>
        <tbody>
          ${recent.length ? recent.slice(0,100).map(s=>`
            <tr>
              <td>${s.email}</td>
              <td><span style="font-size:11px;padding:2px 6px;border-radius:4px;background:var(--bg);border:1px solid var(--line)">${s.fonte || 'footer'}</span></td>
              <td style="color:var(--muted)">${new Date(s.subscribed_at).toLocaleDateString('it-IT')}</td>
              <td>${s.unsubscribed ? statusPill('Discritto') : statusPill('Attivo')}</td>
            </tr>
          `).join('') : `<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:24px">
            ${nl === null ? 'Caricamento...' : 'Nessun iscritto trovato'}
          </td></tr>`}
        </tbody>
      </table></div>
    </div>
  `;
};
VIEWS.popups = function(){
  return `${pageHead("Pop-up","Banner promozionali sul negozio.","")}
    <div class="card"><p style="color:var(--muted);text-align:center;padding:40px">Nessun pop-up configurato.</p></div>`;
};

VIEWS.discounts = function(){
  return `
    ${pageHead("Sconti","Codici sconto e promozioni automatiche.",`<button class="btn btn-primary btn-sm js-new-discount">+ Nuovo sconto</button>`)}
    <div class="table-card"><div class="table-wrap"><table class="data">
      <thead><tr><th>Codice</th><th>Tipo</th><th>Utilizzi</th><th>Scadenza</th><th>Stato</th><th></th></tr></thead>
      <tbody>
        ${DATA.discounts.map(d=>`
          <tr data-id="${d._db_id||''}">
            <td><strong>${d.code}</strong></td>
            <td>${d.tipo}</td><td>${d.utilizzi}</td><td>${d.scad}</td>
            <td>${statusPill(d.stato)}</td>
            <td class="row-actions">
              <button class="js-copy-code" data-code="${d.code}" title="Copia codice">📋</button>
              <button class="js-del-discount" data-id="${d._db_id||''}" data-code="${d.code}" title="Elimina">🗑</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table></div></div>
  `;
};

/* ---------- ANALYTICS ---------- */
VIEWS.analytics = function(){
  var kpi = DATA.kpi || {};
  var rev = kpi.revenue || {}; var ord = kpi.orders || {}; var vis = kpi.visitors || {}; var aov = kpi.aov || {};
  function kpiCard(color,label,value,delta,up){
    return `<div class="card kpi ${color}"><span class="label">${label}</span><span class="value">${value||'—'}</span>${delta?`<span class="delta ${up?'up':'down'}">${delta}</span>`:''}</div>`;
  }
  return `
    ${pageHead("Statistiche","Performance del tuo store.","")}
    <div class="grid grid-4">
      ${kpiCard('green','Entrate',rev.value,rev.delta,rev.up)}
      ${kpiCard('pink','Ordini',ord.value,ord.delta,ord.up)}
      ${kpiCard('soft','Visitatori',vis.value,vis.delta,vis.up)}
      ${kpiCard('green','Scontrino medio',aov.value,aov.delta,aov.up)}
    </div>
    <div class="card" style="margin-top:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <h3>Andamento entrate — 30 giorni</h3>
        ${DATA.chartData?'':'<span style="font-size:12px;color:var(--muted)">Caricamento…</span>'}
      </div>
      <div class="chart-placeholder">${chartSVG()}</div>
    </div>
    <div class="card" style="margin-top:16px">
      <h3>Fonti traffico</h3>
      <p style="color:var(--muted);font-size:13px;margin-top:8px">Google Analytics integration — disponibile con chiave API configurata nelle Impostazioni.</p>
    </div>
  `;
};
VIEWS.reports = function(){
  return `${pageHead("Report","Reportistica avanzata. Clicca un report per esportarlo in CSV.","")}<div class="grid grid-3">
    ${[["orders","Vendite — Ordini"],["products","Vendite per prodotto"],["customers","Vendite per cliente"],["discounts","Sconti utilizzati"],["inventory","Inventario / Stock"],["invoices","Fatture emesse"]].map(r=>`
      <div class="card js-run-report" data-report="${r[0]}" style="cursor:pointer"><h3>📊 ${r[1]}</h3><small style="color:var(--muted)">Esporta CSV →</small></div>
    `).join('')}
    </div>`;
};
VIEWS.liveview = function(){
  return `${pageHead("Live View","Cosa succede in questo momento sul tuo store.","")}
    <div class="grid grid-4">
      <div class="card kpi green"><span class="label">Visitatori ora</span><span class="value">—</span></div>
      <div class="card kpi pink"><span class="label">Carrelli attivi</span><span class="value">—</span></div>
      <div class="card kpi soft"><span class="label">Checkout in corso</span><span class="value">—</span></div>
      <div class="card kpi green"><span class="label">Vendite (1h)</span><span class="value">—</span></div>
    </div>
    <div class="card" style="margin-top:16px;padding:40px;text-align:center;color:var(--muted)">Il monitoraggio in tempo reale richiede l'integrazione di un servizio di analytics (es. Google Analytics 4) configurato nelle Impostazioni.</div>`;
};

/* ---------- CONTENUTI ---------- */
VIEWS.content = function(){
  const pages = DATA.pages || [];
  return `${pageHead("Pagine","Pagine statiche del sito.",`<button class="btn btn-primary btn-sm js-new-page">+ Nuova pagina</button>`)}
    <div class="table-card"><div class="table-wrap"><table class="data">
      <thead><tr><th>Titolo</th><th>URL</th><th>Stato</th><th>Modificata</th><th></th></tr></thead>
      <tbody>
        ${pages.length ? pages.map(p=>`
          <tr data-id="${p.id}">
            <td><strong>${p.titolo}</strong></td>
            <td><code style="font-size:11px">/${p.slug}</code></td>
            <td>${statusPill(p.stato==='pubblicata'?'Pubblicata':'Bozza')}</td>
            <td style="color:var(--muted)">${new Date(p.updated_at||p.created_at).toLocaleDateString('it-IT')}</td>
            <td class="row-actions">
              <button class="js-edit-page" data-id="${p.id}" data-titolo="${(p.titolo||'').replace(/"/g,'&quot;')}" data-stato="${p.stato}" data-slug="${p.slug}" title="Modifica">✏</button>
              <button class="js-del-page" data-id="${p.id}" data-titolo="${(p.titolo||'').replace(/"/g,'&quot;')}" title="Elimina">🗑</button>
            </td>
          </tr>
        `).join('') : `<tr><td colspan="5" class="empty">${DATA.pages===null?'Caricamento…':'Nessuna pagina. Creane una con “+ Nuova pagina”.'}</td></tr>`}
      </tbody>
    </table></div></div>`;
};
VIEWS.blog = function(){
  const posts = DATA.blog || [];
  return `${pageHead("Blog","Articoli e contenuti editoriali.",`<button class="btn btn-primary btn-sm js-new-blog">+ Nuovo articolo</button>`)}
    ${posts.length===0 ? `<div class="card"><p style="color:var(--muted);text-align:center;padding:40px">${DATA.blog===null?'Caricamento…':'Nessun articolo. Creane uno con “+ Nuovo articolo”.'}</p></div>` : `
    <div class="grid grid-3">
      ${posts.map(p=>`
        <div class="card">
          <div style="height:100px;border-radius:8px;background:${p.cover_color||'linear-gradient(135deg,var(--pink),var(--green))'};margin-bottom:10px"></div>
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
            <strong>${p.titolo}</strong>
            ${statusPill(p.stato==='pubblicato'?'Pubblicato':'Bozza')}
          </div>
          <p style="color:var(--muted);font-size:12px;margin-top:4px">${p.published_at?('Pubblicato il '+new Date(p.published_at).toLocaleDateString('it-IT')):'Bozza'}</p>
          <div style="margin-top:10px;display:flex;gap:6px">
            <button class="btn btn-soft btn-sm js-edit-blog" data-id="${p.id}" data-titolo="${(p.titolo||'').replace(/"/g,'&quot;')}" data-estratto="${(p.estratto||'').replace(/"/g,'&quot;')}" data-stato="${p.stato}" data-slug="${p.slug}">✏ Modifica</button>
            <button class="btn btn-ghost btn-sm js-del-blog" data-id="${p.id}" data-titolo="${(p.titolo||'').replace(/"/g,'&quot;')}">🗑</button>
          </div>
        </div>
      `).join('')}
    </div>`}`;
};
VIEWS.files = function(){
  // Media library persisted as a JSON list in store_settings['media_library']
  let media = [];
  try { media = JSON.parse((DATA.settings && DATA.settings.media_library) || '[]'); } catch(_) {}
  if (!Array.isArray(media)) media = [];
  return `${pageHead("File","Asset multimediali del negozio (per URL).",`<button class="btn btn-primary btn-sm js-add-file">+ Aggiungi file</button>`)}
    ${media.length===0 ? `<div class="card"><p style="color:var(--muted);text-align:center;padding:40px">Nessun file. Aggiungi un'immagine tramite URL con “+ Aggiungi file”.</p></div>` : `
    <div class="grid grid-4">
      ${media.map((m,i)=>`<div class="card" style="text-align:center">
        <div style="height:90px;background:var(--line-2) center/cover no-repeat;${m.url?`background-image:url('${m.url.replace(/'/g,'')}')`:''};border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:28px">${m.url?'':'🖼'}</div>
        <small style="display:block;margin-top:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${m.nome||('file-'+(i+1))}</small>
        <button class="btn btn-ghost btn-sm js-del-file" data-idx="${i}" style="margin-top:4px">🗑</button>
      </div>`).join('')}
    </div>`}`;
};
VIEWS.menus = function(){
  return `${pageHead("Menu di navigazione","Configura header e footer del sito.","")}
    <div class="grid grid-2">
      <div class="card"><h3>Header</h3><ul class="list-clean">
        <li>Home</li><li>Catalogo</li><li>Collezioni</li><li>Saldi</li><li>Contatti</li>
      </ul></div>
      <div class="card"><h3>Footer</h3><ul class="list-clean">
        <li>Chi siamo</li><li>Spedizioni</li><li>Resi</li><li>Termini</li><li>Privacy</li>
      </ul></div>
    </div>`;
};

/* ===========================================================
   ⭐ SPEDIZIONI - sezione completa stile SDA
   =========================================================== */

VIEWS.couriers = function(){
  return `
    ${pageHead("Corrieri","Gestisci i partner di spedizione integrati con il tuo store.",`
      <button class="btn btn-ghost btn-sm js-import-rates">📥 Importa tariffe</button>
      <button class="btn btn-primary btn-sm js-new-courier">+ Aggiungi corriere</button>
    `)}

    <div class="grid grid-4" style="margin-bottom:16px">
      <div class="card kpi green"><div class="icon-wrap">📦</div><span class="label">Corrieri attivi</span><span class="value">${DATA.couriers.filter(c=>c.attivo).length}</span></div>
      <div class="card kpi pink"><div class="icon-wrap">⏱</div><span class="label">Corrieri totali</span><span class="value">${DATA.couriers.length}</span></div>
      <div class="card kpi soft"><div class="icon-wrap">⚠</div><span class="label">Spedizioni in corso</span><span class="value">${(DATA.shipments&&DATA.shipments.length)?DATA.shipments.length:'—'}</span></div>
      <div class="card kpi green"><div class="icon-wrap">✓</div><span class="label">Tariffa media</span><span class="value">${(()=>{const r=DATA.couriers.map(c=>parseFloat(String(c.rate||'').replace(/[^0-9.,]/g,'').replace(',','.'))||0).filter(x=>x>0);return r.length?'€ '+(r.reduce((a,b)=>a+b,0)/r.length).toFixed(2):'—';})()}</span></div>
    </div>

    <div class="courier-list">
      ${DATA.couriers.map(c=>`
        <div class="courier-card ${c.attivo?'active':''}" data-courier="${c.code}">
          <label class="switch">
            <input type="checkbox" class="js-toggle-courier" ${c.attivo?'checked':''}/>
            <span class="slider"></span>
          </label>
          <div class="courier-head">
            <div class="courier-logo ${c.code}">${c.slug}</div>
            <div>
              <h4>${c.nome}</h4>
              <small>Tariffa base ${c.rate} · Italia</small>
            </div>
          </div>
          <div class="courier-stats">
            <div class="stat"><strong>${c.sped}</strong>spedizioni</div>
            <div class="stat"><strong>${c.consegnati}</strong>consegnate</div>
            <div class="stat"><strong>${c.ritardi}</strong>ritardi</div>
          </div>
          <div class="courier-actions">
            <button class="btn btn-soft btn-sm js-courier-config" data-courier="${c.code}">⚙ Configura</button>
            <button class="btn btn-ghost btn-sm js-courier-track" data-courier="${c.code}">📍 Tracking</button>
            <button class="btn btn-ghost btn-sm js-courier-rates" data-courier="${c.code}">💶 Tariffe</button>
            <button class="btn btn-ghost btn-sm js-del-courier" data-courier="${c.code}" data-nome="${(c.nome||'').replace(/"/g,'&quot;')}" title="Rimuovi corriere">🗑</button>
          </div>
        </div>
      `).join('')}
    </div>

    <div class="card" style="margin-top:18px">
      <h3>API Tracking - Stato connessioni</h3>
      <ul class="list-clean">
        ${DATA.couriers.map(c=>`
          <li>
            <div style="display:flex;align-items:center;gap:10px">
              <div class="courier-logo ${c.code}" style="width:32px;height:32px;font-size:11px">${c.slug}</div>
              <strong>${c.nome}</strong>
            </div>
            <div style="display:flex;align-items:center;gap:10px">
              ${c.attivo?'<span class="status-pill ok">Attivo</span>':'<span class="status-pill neutral">Non attivo</span>'}
            </div>
          </li>
        `).join('')}
      </ul>
    </div>
  `;
};

// Build a clickable courier deep-link from the courier's saved template ({tracking} → number).
function courierTrackingUrl(code, tn){
  if(!code||!tn) return '';
  var c=(DATA.couriers||[]).find(function(x){ return x.code===String(code).toLowerCase(); });
  var tpl=c&&c.tracking_url_template;
  return tpl ? tpl.replace(/\{tracking\}/gi, encodeURIComponent(tn)) : '';
}
VIEWS.shipments = function(){
  return `
    ${pageHead("Spedizioni in corso","Monitora ogni pacco in tempo reale.",`
      <button class="btn btn-ghost btn-sm js-export-shipments">📤 Esporta CSV</button>
      <button class="btn btn-primary btn-sm js-new-shipment">+ Nuova spedizione</button>
    `)}

    <div class="card" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:14px">
      <input type="text" id="shipSearch" placeholder="Cerca per tracking, ordine o cliente..." style="flex:1;min-width:200px;padding:8px 12px;border:1px solid var(--line);border-radius:8px;background:#fafafa"/>
      <select class="btn btn-soft btn-sm" id="shipFilterCourier">
        <option value="">Tutti i corrieri</option>
        ${DATA.couriers.map(c=>`<option value="${c.code}">${c.nome}</option>`).join('')}
      </select>
      <select class="btn btn-soft btn-sm" id="shipFilterStatus">
        <option value="">Tutti gli stati</option>
        <option>In transito</option><option>In consegna</option><option>Consegnato</option><option>Preso in carico</option>
      </select>
    </div>

    <div class="table-card"><div class="table-wrap">
      <table class="data" id="shipTable">
        <thead><tr><th>Tracking</th><th>Ordine</th><th>Cliente</th><th>Corriere</th><th>Destinazione</th><th>Stato</th><th>ETA</th><th></th></tr></thead>
        <tbody>
          ${DATA.shipments.map(s=>{
            const courier = DATA.couriers.find(c=>c.code===s.corriere) || { slug:(s.corriere||'?').toUpperCase(), nome:(s.corriere||'—') };
            return `<tr data-courier="${s.corriere}" data-status="${s.stato}">
              <td><strong>${s.id}</strong></td>
              <td>${s.ordine}</td>
              <td>${s.cliente}</td>
              <td><div style="display:flex;align-items:center;gap:6px"><div class="courier-logo ${s.corriere}" style="width:26px;height:26px;font-size:10px;border-radius:6px">${courier.slug}</div>${courier.nome.split(' ')[0]}</div></td>
              <td>${s.destinazione}</td>
              <td>${statusPill(s.stato)}</td>
              <td>${s.eta}</td>
              <td class="row-actions">${(function(){var u=courierTrackingUrl(s.corriere,s.id);return u?'<a class="btn btn-ghost btn-sm" href="'+u+'" target="_blank" rel="noopener" title="Traccia sul sito del corriere">🔗</a>':'';})()}<button class="js-track-detail" data-id="${s.id}" title="Dettaglio">📍</button><button class="js-ship-label" data-id="${s.id}" data-ordine="${s.ordine}" data-cliente="${(s.cliente||'').replace(/"/g,'&quot;')}" data-dest="${(s.destinazione||'').replace(/"/g,'&quot;')}" title="Etichetta">🏷</button></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div></div>
  `;
};

VIEWS.tracking = function(){
  return `
    ${pageHead("Tracking spedizione","Inserisci un codice per vedere il tracciamento dettagliato.","")}
    <div class="card">
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <input type="text" id="trackInput" placeholder="Es: SDA9981200001" value="SDA9981200001" style="flex:1;min-width:240px;padding:11px 14px;border:1px solid var(--line);border-radius:8px;background:#fafafa"/>
        <select class="btn btn-soft btn-sm" id="trackCourier">
          ${DATA.couriers.map(c=>`<option value="${c.code}">${c.nome}</option>`).join('')}
        </select>
        <button class="btn btn-primary btn-sm" id="btnTrack">🔍 Traccia</button>
      </div>
    </div>

    <div id="trackingResult" style="margin-top:16px"></div>
  `;
};

VIEWS["shipping-zones"] = function(){
  return `
    ${pageHead("Zone & Tariffe di spedizione","Definisci paesi, metodi e prezzi.",`<button class="btn btn-primary btn-sm js-new-zone">+ Nuova zona</button>`)}
    <div class="table-card"><div class="table-wrap"><table class="data">
      <thead><tr><th>Zona</th><th>Paesi</th><th>Metodo</th><th>Prezzo</th><th>Spedizione gratuita</th><th></th></tr></thead>
      <tbody>
        ${DATA.zones.map(z=>`
          <tr>
            <td><strong>${z.nome}</strong></td>
            <td>${z.paesi}</td>
            <td>${z.metodo}</td>
            <td>${z.prezzo}</td>
            <td>${z.grat==='—'||z.grat==='-'?'<span class="badge badge-soft">no</span>':'<span class="badge badge-green">da '+z.grat+'</span>'}</td>
            <td class="row-actions">
              <button class="js-edit-zone" data-id="${z._db_id||''}" title="Modifica">✏</button>
              <button class="js-del-zone" data-id="${z._db_id||''}" data-nome="${z.nome}" title="Elimina">🗑</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table></div></div>

    <div class="grid grid-2" style="margin-top:16px">
      <div class="card">
        <h3>Soglie spedizione gratuita</h3>
        <ul class="list-clean">
          ${(DATA.zones||[]).filter(z=>z.grat && z.grat!=='-' && z.grat!=='—').map(z=>`<li><span>${z.nome}</span> <span class="badge badge-green">${z.grat}</span></li>`).join('') || '<li><span style="color:var(--muted)">Nessuna soglia gratuita impostata sulle zone.</span></li>'}
        </ul>
      </div>
      <div class="card">
        <h3>Zone configurate</h3>
        <div class="kv">
          <div class="k">Totale zone</div><div class="v">${(DATA.zones||[]).length}</div>
          <div class="k">Corrieri attivi</div><div class="v">${(DATA.couriers||[]).filter(c=>c.attivo).length}</div>
        </div>
      </div>
    </div>
  `;
};

VIEWS.pickup = function(){
  return `
    ${pageHead("Punti di ritiro","Network di pickup point per consegna alternativa.",`<button class="btn btn-primary btn-sm js-new-pickup">+ Aggiungi punto</button>`)}
    <div class="table-card"><div class="table-wrap"><table class="data">
      <thead><tr><th>Nome</th><th>Indirizzo</th><th>Corriere</th><th>Orari</th><th></th></tr></thead>
      <tbody>
        ${(DATA.pickupPoints||[]).map(p=>`
          <tr data-id="${p._db_id||''}">
            <td><strong>${p.nome}</strong></td>
            <td>${p.indirizzo}</td>
            <td><span class="badge badge-green">${p.corriere||'-'}</span></td>
            <td>${p.orari||'-'}</td>
            <td class="row-actions">
              <button class="js-edit-pickup" data-id="${p._db_id||''}" data-nome="${(p.nome||'').replace(/"/g,'&quot;')}" data-indirizzo="${(p.indirizzo||'').replace(/"/g,'&quot;')}" data-corriere="${p.corriere||''}" data-orari="${(p.orari||'').replace(/"/g,'&quot;')}" title="Modifica">✏</button>
              <button class="js-del-pickup" data-id="${p._db_id||''}" data-nome="${(p.nome||'').replace(/"/g,'&quot;')}" title="Elimina">🗑</button>
            </td>
          </tr>
        `).join('')}
        ${(DATA.pickupPoints||[]).length===0?'<tr><td colspan="5" class="empty">Nessun punto di ritiro. Aggiungine uno.</td></tr>':''}
      </tbody>
    </table></div></div>
  `;
};

/* ===========================================================
   ⭐ CHAT CLIENTI
   =========================================================== */
const CHATS = [
  { id:"ch1", nome:"Sofia Bianchi",     online:true,  ultimo:"Grazie mille!", ora:"14:42", unread:0, ordine:"#10254",
    msgs:[
      {t:"in",  txt:"Ciao, ho fatto un ordine ieri ma non ho ricevuto il tracking",ts:"14:30"},
      {t:"out", txt:"Ciao Sofia! Controllo subito 👀",ts:"14:31"},
      {t:"note",txt:"Cliente VIP - 8 ordini totali"},
      {t:"out", txt:"Ho trovato l'ordine #10254, è stato preso in carico da SDA stamattina. Il tracking è SDA9981200001",ts:"14:35"},
      {t:"in",  txt:"Perfetto! E quanto ci mette ad arrivare?",ts:"14:38"},
      {t:"out", txt:"La consegna stimata è per il 16/05 entro le 18:00 🚚",ts:"14:40"},
      {t:"in",  txt:"Grazie mille!",ts:"14:42"}
    ]
  },
  { id:"ch2", nome:"Marco Rossi",       online:true,  ultimo:"Va bene aspetto", ora:"14:20", unread:2, ordine:"#10253",
    msgs:[
      {t:"in", txt:"Buongiorno, posso cambiare l'indirizzo di spedizione?",ts:"14:10"},
      {t:"out",txt:"Buongiorno Marco, certo. Qual è il nuovo indirizzo?",ts:"14:12"},
      {t:"in", txt:"Via Garibaldi 22, Roma 00100",ts:"14:15"},
      {t:"in", txt:"Va bene aspetto",ts:"14:20"}
    ]
  },
  { id:"ch3", nome:"Giulia Verdi",      online:false, ultimo:"Foto allegata", ora:"13:08", unread:1, ordine:"#10252",
    msgs:[
      {t:"in", txt:"Ciao, la felpa che ho ricevuto ha un difetto",ts:"12:55"},
      {t:"in", txt:"Foto allegata 📷",ts:"13:08"}
    ]
  },
  { id:"ch4", nome:"Luca Neri",         online:false, ultimo:"Ottimo, grazie", ora:"Ieri", unread:0, ordine:"#10251",
    msgs:[
      {t:"in", txt:"Le sneakers sono perfette, grazie!",ts:"Ieri 18:30"},
      {t:"out",txt:"Grazie a te Luca! Ci farebbe piacere una recensione ⭐",ts:"Ieri 18:35"},
      {t:"in", txt:"Ottimo, grazie",ts:"Ieri 18:40"}
    ]
  },
  { id:"ch5", nome:"Anna Greco",        online:true,  ultimo:"Quanto costa la spedizione?", ora:"12:14", unread:1, ordine:null,
    msgs:[
      {t:"in", txt:"Salve, vorrei sapere se spedite in Sardegna",ts:"12:10"},
      {t:"in", txt:"Quanto costa la spedizione?",ts:"12:14"}
    ]
  },
  { id:"ch6", nome:"Paolo Conti",       online:false, ultimo:"Risolto, grazie", ora:"Lun", unread:0, ordine:"#10249",
    msgs:[
      {t:"in", txt:"Ho un problema con il pagamento",ts:"Lun 09:15"},
      {t:"out",txt:"Mi spiace Paolo, può inviarmi uno screenshot?",ts:"Lun 09:18"},
      {t:"in", txt:"Risolto, grazie",ts:"Lun 10:02"}
    ]
  }
];

let activeChatId = "ch1";

const QUICK_REPLIES = [
  "Ciao! Come posso aiutarti? 😊",
  "Sto verificando, un attimo...",
  "L'ordine è in fase di preparazione",
  "Spedizione gratuita sopra €79",
  "Grazie del messaggio!"
];

const AUTO_REPLIES = [
  "Perfetto, grazie mille! 🙏",
  "Ok ricevuto",
  "Posso avere maggiori dettagli?",
  "Grazie per la risposta veloce 👍",
  "Va bene, attendo conferma",
  "Grazie, gentilissimi come sempre"
];

VIEWS.chat = function(){
  return `
    ${pageHead("Chat clienti","Conversazioni in tempo reale con i tuoi clienti.",`
      <button class="btn btn-soft btn-sm" onclick="toast('Conversazioni: '+CHATS.length+' · Non lette: '+CHATS.reduce(function(s,c){return s+(c.unread||0);},0),'info')">📊 Statistiche</button>
      <button class="btn btn-ghost btn-sm" onclick="renderView('settings');setActiveNav('settings')">⚙ Impostazioni chat</button>
    `)}
    <div class="chat-wrap">
      <!-- LISTA CONVERSAZIONI -->
      <div class="chat-list">
        <div class="chat-search">
          <input type="text" id="chatSearch" placeholder="Cerca conversazione..."/>
        </div>
        <div class="chat-tabs">
          <button class="active" data-tab="all">Tutte (${CHATS.length})</button>
          <button data-tab="unread">Non lette (${CHATS.filter(c=>c.unread>0).length})</button>
          <button data-tab="online">Online (${CHATS.filter(c=>c.online).length})</button>
        </div>
        <div class="chat-conversations" id="chatConvList"></div>
      </div>

      <!-- CHAT ATTIVA -->
      <div class="chat-main">
        <div class="chat-header" id="chatHeader"></div>
        <div class="chat-body" id="chatBody"></div>
        <div class="quick-replies" id="quickReplies">
          ${QUICK_REPLIES.map(r=>`<span class="qr">${r}</span>`).join('')}
        </div>
        <form class="chat-input" id="chatForm">
          <button type="button" class="icon-btn" title="Allegato">📎</button>
          <button type="button" class="icon-btn" title="Emoji">😊</button>
          <input type="text" id="chatInput" placeholder="Scrivi un messaggio..." autocomplete="off"/>
          <button type="submit" class="send" title="Invia">➤</button>
        </form>
      </div>

      <!-- INFO CLIENTE -->
      <div class="chat-info" id="chatInfo"></div>
    </div>
  `;
};

function renderConvList(filter){
  filter = filter || "all";
  let list = CHATS.slice();
  if(filter==="unread") list = list.filter(c=>c.unread>0);
  if(filter==="online") list = list.filter(c=>c.online);

  const html = list.map(c=>`
    <div class="chat-conv ${c.id===activeChatId?'active':''}" data-id="${c.id}">
      <div class="avatar">${c.nome.charAt(0)}</div>
      <div class="presence ${c.online?'online':''}"></div>
      <div class="info">
        <div class="top">
          <strong>${c.nome}</strong>
          <small>${c.ora}</small>
        </div>
        <p>${c.ultimo}</p>
      </div>
      ${c.unread?`<span class="unread">${c.unread}</span>`:''}
    </div>
  `).join('');
  $('#chatConvList').html(html || '<div class="empty">Nessuna conversazione</div>');
}

function renderActiveChat(){
  const c = CHATS.find(x=>x.id===activeChatId);
  if(!c) return;

  // Header
  $('#chatHeader').html(`
    <div class="avatar">${c.nome.charAt(0)}</div>
    <div>
      <h4>${c.nome}</h4>
      <small>${c.online?'<span style="color:var(--green-strong)">● Online</span>':'Visto poco fa'} ${c.ordine?'· Ordine '+c.ordine:''}</small>
    </div>
    <div class="actions">
      <button class="icon-btn" title="Chiama">📞</button>
      <button class="icon-btn" title="Video">📹</button>
      <button class="icon-btn" title="Info">ℹ</button>
      <button class="icon-btn" title="Altro">⋮</button>
    </div>
  `);

  // Body
  const ord = c.ordine ? DATA.orders.find(o=>o.id===c.ordine) : null;
  const cust = DATA.customers.find(cu=>cu.nome===c.nome);

  let bodyHtml = '<div class="chat-day">Oggi</div>';
  c.msgs.forEach(m=>{
    if(m.t==="note"){
      bodyHtml += `<div class="chat-msg note">📝 ${m.txt}</div>`;
    } else {
      bodyHtml += `<div class="chat-msg ${m.t}">${m.txt}<span class="ts">${m.ts||''}</span></div>`;
    }
  });
  $('#chatBody').html(bodyHtml);
  scrollChatToBottom();

  // Info cliente
  $('#chatInfo').html(`
    <div class="ci-section" style="text-align:center;padding-bottom:10px;border-bottom:1px solid var(--line-2);margin-bottom:14px">
      <div class="avatar" style="width:64px;height:64px;font-size:24px;margin:0 auto 10px">${c.nome.charAt(0)}</div>
      <strong style="font-size:14px">${c.nome}</strong>
      <small style="display:block;color:var(--muted);margin-top:2px">${cust?cust.email:'cliente@mail.it'}</small>
      ${cust&&cust.vip?'<span class="badge badge-pink" style="margin-top:6px;display:inline-block">⭐ VIP</span>':''}
    </div>

    <div class="ci-section">
      <h4>Dettagli cliente</h4>
      <div class="kv" style="grid-template-columns:90px 1fr">
        <div class="k">Ordini</div><div class="v">${cust?cust.ordini:0}</div>
        <div class="k">Totale</div><div class="v">${cust?cust.speso:'€ 0'}</div>
        <div class="k">Ultimo</div><div class="v">${cust?cust.ultimo:'-'}</div>
      </div>
    </div>

    ${ord?`
    <div class="ci-section">
      <h4>Ordine collegato</h4>
      <div class="card" style="padding:10px;box-shadow:none">
        <strong>${ord.id}</strong>
        <small style="display:block;color:var(--muted);margin:2px 0 6px">${ord.data} · ${ord.totale}</small>
        ${statusPill(ord.stato)}
        ${ord.tracking!=='-'?`<small style="display:block;margin-top:6px">📦 ${ord.tracking}</small>`:''}
      </div>
    </div>`:''}

    <div class="ci-section">
      <h4>Azioni rapide</h4>
      <button class="btn btn-soft btn-sm js-chat-discount" style="width:100%;margin-bottom:6px">🎁 Invia sconto -10%</button>
      <button class="btn btn-soft btn-sm js-chat-goorder" data-order="${ord?ord.id:''}" style="width:100%;margin-bottom:6px">📦 Vai all'ordine</button>
      <button class="btn btn-ghost btn-sm js-chat-block" style="width:100%">🚫 Blocca cliente</button>
    </div>

    <div class="ci-section">
      <h4>Tag</h4>
      <span class="badge badge-green">Italia</span>
      <span class="badge badge-pink">Newsletter</span>
      <span class="badge badge-soft">App mobile</span>
    </div>
  `);

  // Reset unread
  c.unread = 0;
  renderConvList($('.chat-tabs button.active').data('tab'));
}

function scrollChatToBottom(){
  const $b = $('#chatBody');
  if($b.length) $b.scrollTop($b[0].scrollHeight);
}

function sendChatMessage(text){
  if(!text || !text.trim()) return;
  const c = CHATS.find(x=>x.id===activeChatId);
  const now = new Date();
  const ts = now.getHours().toString().padStart(2,'0')+':'+now.getMinutes().toString().padStart(2,'0');
  c.msgs.push({t:"out",txt:text,ts:ts});
  c.ultimo = text.length>30?text.slice(0,30)+'...':text;
  c.ora = ts;
  renderActiveChat();

  // Risposta simulata
  setTimeout(()=>{
    $('#chatBody').append('<div class="chat-typing" id="typingIndicator"><span></span><span></span><span></span></div>');
    scrollChatToBottom();
    setTimeout(()=>{
      $('#typingIndicator').remove();
      const reply = AUTO_REPLIES[Math.floor(Math.random()*AUTO_REPLIES.length)];
      const now2 = new Date();
      const ts2 = now2.getHours().toString().padStart(2,'0')+':'+now2.getMinutes().toString().padStart(2,'0');
      c.msgs.push({t:"in",txt:reply,ts:ts2});
      c.ultimo = reply;
      c.ora = ts2;
      renderActiveChat();
      toast('Nuovo messaggio da '+c.nome, 'info');
    }, 1400);
  }, 600);
}

/* ---------- FINANZA ---------- */
VIEWS.finance = function(){
  var f = (DATA.finance && DATA.finance.summary) || null;
  var eur = function(n){ return '€ ' + (Number(n)||0).toFixed(2).replace('.', ','); };
  if (!f) return `${pageHead("Finanza","Panoramica economica del negozio.","")}
    <div class="card"><p style="color:var(--muted);text-align:center;padding:40px">${DATA.finance===null?'Caricamento…':'Nessun dato finanziario.'}</p></div>`;
  var methods = (DATA.finance.by_method) || [];
  return `${pageHead("Finanza","Panoramica economica — ordini pagati.","")}
    <div class="grid grid-4">
      <div class="card kpi green"><span class="label">Fatturato totale</span><span class="value">${eur(f.revenue_total)}</span></div>
      <div class="card kpi pink"><span class="label">Questo mese</span><span class="value">${eur(f.revenue_month)}</span></div>
      <div class="card kpi soft"><span class="label">In attesa</span><span class="value">${eur(f.pending_amount)}</span></div>
      <div class="card kpi green"><span class="label">Scontrino medio</span><span class="value">${eur(f.aov)}</span></div>
    </div>
    <div class="grid grid-2" style="margin-top:16px">
      <div class="card"><h3>Riepilogo</h3><div class="kv">
        <div class="k">Ordini pagati</div><div class="v">${f.paid_count}</div>
        <div class="k">Fatturato oggi</div><div class="v">${eur(f.revenue_today)}</div>
        <div class="k">Spedizioni incassate</div><div class="v">${eur(f.shipping_collected)}</div>
        <div class="k">Rimborsato</div><div class="v" style="color:${f.refunded_amount>0?'var(--red)':'inherit'}">${eur(f.refunded_amount)}</div>
      </div></div>
      <div class="card"><h3>Per metodo di pagamento</h3>
        ${methods.length ? `<table class="data" style="width:100%"><thead><tr><th>Metodo</th><th style="text-align:right">Ordini</th><th style="text-align:right">Totale</th></tr></thead><tbody>
          ${methods.map(function(m){ return `<tr><td>${m.method}</td><td style="text-align:right">${m.count}</td><td style="text-align:right">${eur(m.total)}</td></tr>`; }).join('')}
        </tbody></table>` : '<p style="color:var(--muted);font-size:13px">Nessun pagamento registrato.</p>'}
      </div>
    </div>`;
};
VIEWS.payouts = function(){
  var recent = (DATA.finance && DATA.finance.recent) || [];
  var eur = function(n){ return '€ ' + (Number(n)||0).toFixed(2).replace('.', ','); };
  var paid = recent.filter(function(r){ return r.payment_status==='pagato'; });
  return `${pageHead("Pagamenti ricevuti","Incassi dagli ordini pagati.","")}
    ${paid.length ? `<div class="table-card"><div class="table-wrap"><table class="data">
      <thead><tr><th>Ordine</th><th>Cliente</th><th>Metodo</th><th>Data</th><th style="text-align:right">Importo</th></tr></thead>
      <tbody>${paid.map(function(r){ return `<tr><td><strong>${r.order_number}</strong></td><td>${r.customer}</td><td>${r.method}</td><td style="color:var(--muted)">${new Date(r.created_at).toLocaleDateString('it-IT')}</td><td style="text-align:right"><strong>${eur(r.total)}</strong></td></tr>`; }).join('')}</tbody>
    </table></div></div>` : `<div class="card"><p style="color:var(--muted);text-align:center;padding:40px">${DATA.finance===null?'Caricamento…':'Nessun pagamento registrato.'}</p></div>`}`;
};
VIEWS.bills = function(){
  return `${pageHead("Fatture & Spese","Spese del negozio (piano, app, dominio).","")}
    <div class="card"><p style="color:var(--muted);text-align:center;padding:40px">Nessuna spesa registrata.</p></div>`;
};
VIEWS.taxes = function(){
  const s = DATA.settings || {};
  const vat = s.store_vat_rate || '22';
  return `${pageHead("Tasse","Configurazione IVA e regimi fiscali.","")}
    <div class="grid grid-2">
      <div class="card"><h3>IVA Italia</h3><div class="kv">
        <div class="k">Aliquota standard</div><div class="v">${vat}%</div>
        <div class="k">Aliquota ridotta</div><div class="v">10%</div>
        <div class="k">Inclusa nel prezzo</div><div class="v">Sì</div>
      </div><p style="color:var(--muted);font-size:12px;margin-top:10px">Configurabile nelle Impostazioni.</p></div>
      <div class="card"><h3>UE OSS</h3><div class="kv">
        <div class="k">Stato</div><div class="v">—</div>
        <div class="k">Soglia annuale</div><div class="v">€ 10.000</div>
        <div class="k">Venduto YTD</div><div class="v">—</div>
      </div></div>
    </div>`;
};

/* ---------- CANALI ---------- */
VIEWS["online-store"] = function(){
  const s = DATA.settings || {};
  const theme  = s.theme_name    || 'Pastel Minimal v2.4';
  const color  = s.theme_primary || '#7fc29b';
  const domain = s.store_domain  || 'memi.it';
  return `${pageHead("Negozio online","Tema, dominio e configurazione del sito.",`<button class="btn btn-primary btn-sm js-customize-theme">🎨 Personalizza tema</button>`)}
    <div class="grid grid-3">
      <div class="card"><h3>Tema attivo</h3><p style="display:flex;align-items:center;gap:8px"><span style="width:14px;height:14px;border-radius:50%;background:${color};display:inline-block"></span>${theme}</p><small style="color:var(--muted)">Colore primario ${color}</small></div>
      <div class="card"><h3>Dominio</h3><p>${domain}</p><small style="color:var(--muted)">SSL attivo</small></div>
      <div class="card"><h3>Velocità</h3><p>Score: <strong>—</strong></p><small style="color:var(--muted)">Richiede analisi performance</small></div>
    </div>`;
};
VIEWS.pos = function(){
  return `${pageHead("Punto Vendita","Configura POS fisici collegati allo store.","")}
    <div class="card"><p style="color:var(--muted);text-align:center;padding:40px">Nessun punto vendita configurato.</p></div>`;
};
VIEWS.social = function(){
  return `${pageHead("Social & Marketplace","Vendi sui canali esterni.","")}
    <div class="grid grid-3">
      ${[["Instagram Shopping"],["Facebook Shop"],["TikTok Shop"],["Amazon"],["Zalando"],["Google Shopping"]].map(s=>`
        <div class="card"><h3>${s[0]}</h3><span class="badge badge-soft">Non collegato</span></div>
      `).join('')}
    </div>`;
};

/* ---------- SISTEMA ---------- */
VIEWS.apps = function(){
  const apps = DATA.apps || [];
  return `${pageHead("App installate","Estendi le funzionalità del tuo store.",`<button class="btn btn-primary btn-sm js-app-store">+ App Store</button>`)}
    ${apps.length===0 ? `<div class="card"><p style="color:var(--muted);text-align:center;padding:40px">Nessuna app installata. Aggiungine una da “+ App Store”.</p></div>` : `
    <div class="grid grid-3">
      ${apps.map(a=>`
        <div class="card">
          <div style="display:flex;align-items:center;gap:10px">
            <div style="width:42px;height:42px;border-radius:10px;background:var(--line-2);display:flex;align-items:center;justify-content:center;font-size:18px">🧩</div>
            <div><strong>${a.nome}</strong><small style="display:block;color:var(--muted)">${a.cat}</small></div>
          </div>
          <div style="margin-top:10px;display:flex;justify-content:space-between;align-items:center">
            ${statusPill(a.stato)}
            <button class="btn btn-soft btn-sm js-open-app" data-nome="${(a.nome||'').replace(/"/g,'&quot;')}" data-cat="${a.cat}" data-stato="${a.stato}">Apri</button>
          </div>
        </div>
      `).join('')}
    </div>`}`;
};
VIEWS.integrations = function(){
  var list = DATA.integrations || [];
  return `
    ${pageHead("Integrazioni","Stato delle connessioni ai servizi esterni.","")}
    ${(!list.length)
      ? `<div class="card"><p style="color:var(--muted);text-align:center;padding:40px">${DATA.integrations===null?'Caricamento…':'Nessuna integrazione disponibile.'}</p></div>`
      : `<div class="grid grid-3">
          ${list.map(function(i){
            return `<div class="card">
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
                <span style="font-size:24px">${i.icona||'🔌'}</span>
                <div><strong>${i.nome||''}</strong><div style="font-size:11px;color:var(--muted)">${i.categoria||''}</div></div>
              </div>
              <div style="margin:10px 0">${i.connesso?'<span class="status-pill ok">Connesso</span>':'<span class="status-pill neutral">Non configurato</span>'}</div>
              <p style="font-size:12px;color:var(--muted);margin:0">${i.dettaglio||''}</p>
            </div>`;
          }).join('')}
        </div>
        <p style="font-size:12px;color:var(--muted);margin-top:14px">Le credenziali si configurano come variabili d'ambiente sul server (Coolify → Environment Variables). Questa pagina mostra solo lo stato, mai i valori segreti.</p>`}
  `;
};
VIEWS.staff = function(){
  const list = DATA.staff || [];
  function roleB(r){ return r==='admin'?'<span class="badge badge-pink">Admin</span>':'<span class="badge badge-soft">Staff</span>'; }
  function av(n){ return (n||'?').charAt(0).toUpperCase(); }
  return `${pageHead("Staff & Permessi","Account collaboratori del negozio.",`<button class="btn btn-primary btn-sm js-new-staff">+ Invita staff</button>`)}
    <div class="table-card"><div class="table-wrap"><table class="data" id="staffTable">
      <thead><tr><th>Nome</th><th>Email</th><th>Ruolo</th><th>Creato</th><th></th></tr></thead>
      <tbody>
        ${list.length ? list.map(u=>`<tr data-id="${u.id}">
          <td><div style="display:flex;align-items:center;gap:8px"><div class="avatar small" style="background:var(--blush);width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600">${av(u.nome)}</div><strong>${u.nome||'—'}</strong></div></td>
          <td>${u.email}</td>
          <td>${roleB(u.role)}</td>
          <td style="color:var(--muted);font-size:12px">${new Date(u.created_at).toLocaleDateString('it-IT')}</td>
          <td style="text-align:right">
            <button class="btn btn-ghost btn-sm js-edit-staff" data-id="${u.id}" data-nome="${u.nome||''}" data-email="${u.email}" data-role="${u.role}" title="Modifica">✏️</button>
            <button class="btn btn-ghost btn-sm js-del-staff" data-id="${u.id}" data-nome="${u.nome||u.email}" style="color:var(--red)" title="Elimina">🗑</button>
          </td>
        </tr>`).join('') : `<tr><td colspan="5" class="empty">${DATA.staff===null?'Caricamento…':'Nessun account staff'}</td></tr>`}
      </tbody>
    </table></div></div>
    <div class="grid grid-2" style="margin-top:16px">
      <div class="card"><h3>👑 Admin</h3><p style="color:var(--muted);font-size:13px;margin-top:6px">Accesso completo: ordini, catalogo, clienti, marketing, <strong>finanza</strong>, <strong>statistiche</strong>, <strong>impostazioni</strong>, integrazioni e gestione staff.</p></div>
      <div class="card"><h3>🧑‍💼 Staff</h3><p style="color:var(--muted);font-size:13px;margin-top:6px">Accesso operativo: ordini, catalogo, magazzino, clienti, contenuti e spedizioni. <strong>Non</strong> vede finanza, statistiche, impostazioni, integrazioni né gestione account.</p></div>
    </div>`;
};

VIEWS.settings = function(){
  var s = DATA.settings || {};
  function field(label,key,type,placeholder){
    type=type||'text';
    return `<div class="kv" style="grid-template-columns:180px 1fr;gap:10px;align-items:center;margin-bottom:12px">
      <div style="font-size:13px;color:var(--muted)">${label}</div>
      <div><input type="${type}" class="settings-input" data-key="${key}" value="${(s[key]||'').replace(/"/g,'&quot;')}" placeholder="${placeholder||''}" style="width:100%;padding:7px 10px;border:1px solid var(--line);border-radius:6px;font-family:inherit;font-size:13px"/></div>
    </div>`;
  }
  return `${pageHead("Impostazioni","Configurazione del negozio.",`<button class="btn btn-primary btn-sm js-save-settings">💾 Salva</button>`)}
    <div class="grid grid-2" style="gap:16px">
      <div class="card">
        <h3 style="margin-bottom:16px">🏬 Generale</h3>
        ${field('Nome negozio','store_name','text','MEMI Abbigliamento')}
        ${field('Email contatto','store_email','email','info@memi.it')}
        ${field('Telefono','store_phone','tel','+39 ...')}
        ${field('Indirizzo','store_address','text','Via Roma 1')}
        ${field('Città','store_city','text','Milano')}
        ${field('Paese','store_country','text','Italia')}
        ${field('Partita IVA','store_vat_number','text','IT...')}
      </div>
      <div class="card">
        <h3 style="margin-bottom:16px">🚚 Spedizione & Resi</h3>
        ${field('Costo spedizione (EUR)','shipping_default_cost','number','5.90')}
        ${field('Soglia spediz. gratuita (EUR)','shipping_free_threshold','number','150.00')}
        ${field('Giorni reso','returns_policy_days','number','14')}
        <h3 style="margin:16px 0">📧 Notifiche</h3>
        ${field('Email notifiche ordini','order_notification_email','email','ordini@memi.it')}
        <h3 style="margin:16px 0">📱 Social</h3>
        ${field('Instagram handle','store_instagram','text','@memi_abbigliamento')}
        ${field('Facebook page','store_facebook','text','memiabbigliamento')}
      </div>
    </div>
    ${DATA.settings===null?'<p style="color:var(--muted);font-size:12px;margin-top:8px">Caricamento impostazioni…</p>':''}
  `;
};

/* ----------------- ROUTING ----------------- */
/* ── Role-based permissions ─────────────────────────────────
   'admin' = full access. 'staff' = operational sections only
   (no finance, statistiche, staff management, settings, integrations). */
var ADMIN_ONLY_VIEWS = ['analytics','reports','liveview','finance','payouts','bills','taxes','integrations','staff','settings'];
function currentRole(){ return (window.CURRENT_ADMIN && window.CURRENT_ADMIN.role) || 'admin'; }
function canAccessView(name){ return currentRole()==='admin' || ADMIN_ONLY_VIEWS.indexOf(name)===-1; }
function applyRolePermissions(){
  if (currentRole()==='admin') return;            // full access — nothing to hide
  ADMIN_ONLY_VIEWS.forEach(function(v){
    document.querySelectorAll('[data-view="'+v+'"]').forEach(function(el){ el.style.display='none'; });
  });
  // collapse parent groups left with no visible children
  document.querySelectorAll('.nav-parent').forEach(function(p){
    var kids = p.querySelectorAll('.nav-children .nav-item');
    if (kids.length && !Array.prototype.some.call(kids, function(k){ return k.style.display!=='none'; })) {
      p.style.display = 'none';
    }
  });
}
window.applyRolePermissions = applyRolePermissions;

function renderView(name){
  const fn = VIEWS[name] || VIEWS.dashboard;
  $('#viewContainer').html(fn()).hide().fadeIn(150);
  // Esegui hook post-render
  if(name==='products') renderProductsArea('grid');
  if(name==='tracking') runTracking();
  if(name==='chat'){ renderConvList('all'); renderActiveChat(); }
}

function setActiveNav(name){
  $('.nav-item').removeClass('active');
  $(`.nav-item[data-view="${name}"]`).addClass('active');
  // espandi parent se necessario
  const $parent = $(`.nav-item[data-view="${name}"]`).closest('.nav-parent');
  if($parent.length){ $parent.addClass('open'); }
}

/* ----------------- PRODUCT GRID/LIST ----------------- */
function renderProductsArea(mode){
  if(mode==='grid'){
    const html = `<div class="prod-grid">
      ${DATA.products.map(p=>`
        <div class="prod-card js-product" data-id="${p.id}">
          <div class="prod-thumb">${p.thumb?`<img src="${p.thumb}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">`:p.img}</div>
          <div class="prod-info">
            <h4>${p.nome}</h4>
            <div class="price">${p.prezzo}</div>
            <div class="meta">${p.cat} · stock ${p.stock} · ${statusPill(p.status)}</div>
          </div>
        </div>
      `).join('')}
    </div>`;
    $('#productsArea').html(html);
  } else {
    const html = `<div class="table-card"><div class="table-wrap"><table class="data">
      <thead><tr><th>SKU</th><th>Prodotto</th><th>Categoria</th><th>Prezzo</th><th>Stock</th><th>Stato</th></tr></thead>
      <tbody>
        ${DATA.products.map(p=>`
          <tr class="js-product" data-id="${p.id}" style="cursor:pointer">
            <td>${p.id}</td>
            <td><div style="display:flex;align-items:center;gap:8px">${p.thumb?`<img src="${p.thumb}" alt="" style="width:28px;height:28px;object-fit:cover;border-radius:5px">`:`<span style="font-size:18px">${p.img}</span>`}${p.nome}</div></td>
            <td>${p.cat}</td><td><strong>${p.prezzo}</strong></td><td>${p.stock}</td>
            <td>${statusPill(p.status)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table></div></div>`;
    $('#productsArea').html(html);
  }
}

/* ----------------- TRACKING — real shipments data ----------------- */
function runTracking(){
  var code    = $('#trackInput').val().trim();
  if (!code) return;
  var $r = $('#trackingResult');
  $r.html('<div class="card"><p style="text-align:center;color:var(--muted)">Ricerca in corso…</p></div>');

  // Search DATA.shipments (already fetched by renderView override)
  var shipments = DATA.shipments || [];
  var s = shipments.find(function(sh){ return sh.id && sh.id.toLowerCase() === code.toLowerCase(); });

  if (!s) {
    // Try a fresh API fetch in case the user typed a code not yet in memory
    if (window.AdminAPI) {
      AdminAPI.shipping.shipments().done(function(list){
        DATA.shipments = (list || []).map(function(sh){
          return {
            _db_id:       sh.id,
            id:           sh.tracking_number,
            ordine:       sh.order_number || ('#' + sh.order_id),
            _order_db_id: sh.order_id,
            cliente:      ((sh.customer_nome||'') + ' ' + (sh.customer_cognome||'')).trim() || '-',
            corriere:     (sh.courier_code || '').toLowerCase(),
            destinazione: sh.destinazione || '-',
            stato:        AdminAPI.statusLabel(sh.stato),
            eta:          sh.eta ? new Date(sh.eta).toLocaleDateString('it-IT') : '-',
          };
        });
        var found = DATA.shipments.find(function(sh){ return sh.id && sh.id.toLowerCase() === code.toLowerCase(); });
        _renderTrackingResult($r, found, code);
      }).fail(function(){ _renderTrackingResult($r, null, code); });
    } else {
      _renderTrackingResult($r, null, code);
    }
    return;
  }
  _renderTrackingResult($r, s, code);
}

function _renderTrackingResult($r, s, code) {
  if (!s) {
    $r.html(
      '<div class="card" style="text-align:center;padding:32px">' +
        '<p style="font-size:1.5rem;margin-bottom:8px">🔍</p>' +
        '<p style="font-weight:500;margin-bottom:4px">Nessuna spedizione trovata</p>' +
        '<p style="color:var(--muted);font-size:.875rem">Codice <strong>' + code + '</strong> non trovato. Verifica che sia corretto.</p>' +
      '</div>'
    );
    return;
  }

  var courierObj = (DATA.couriers || []).find(function(c){ return c.code === s.corriere; }) || {};
  var courierName = courierObj.nome || (s.corriere || 'Corriere').toUpperCase();
  var courierSlug = courierObj.slug || (s.corriere || '').toUpperCase();

  // Build timeline from status
  var statusMap = {
    in_attesa:       { icon: '🕐', label: 'In attesa di presa in carico' },
    preso_in_carico: { icon: '📦', label: 'Preso in carico dal corriere' },
    in_transito:     { icon: '🚚', label: 'In transito' },
    in_consegna:     { icon: '📍', label: 'In consegna oggi' },
    consegnato:      { icon: '✅', label: 'Consegnato' },
    problema:        { icon: '⚠️', label: 'Problema — contatta il corriere' },
  };
  var allStatuses = ['in_attesa','preso_in_carico','in_transito','in_consegna','consegnato'];
  // Find current status key from raw stato label
  var rawKey = 'in_transito'; // default
  if (window.AdminAPI) {
    Object.keys(statusMap).forEach(function(k){ if (AdminAPI.statusLabel(k) === s.stato) rawKey = k; });
  }
  var currentIdx = allStatuses.indexOf(rawKey);

  var timelineHtml = allStatuses.map(function(st, i) {
    var info    = statusMap[st] || { icon: '•', label: st };
    var isCurrent = (i === currentIdx);
    var isDone    = (i < currentIdx);
    var cls = isCurrent ? 'timeline-item current' : (isDone ? 'timeline-item done' : 'timeline-item');
    return '<div class="' + cls + '">' +
      '<div class="ev">' + info.icon + ' ' + info.label + '</div>' +
    '</div>';
  }).join('');

  $r.html(
    '<div class="card">' +
      '<div style="display:flex;align-items:center;gap:14px;margin-bottom:14px">' +
        '<div class="courier-logo ' + s.corriere + '">' + courierSlug + '</div>' +
        '<div>' +
          '<h3>' + courierName + '</h3>' +
          '<small style="color:var(--muted)">Tracking: <strong>' + s.id + '</strong></small>' +
        '</div>' +
        '<div style="margin-left:auto">' + statusPill(s.stato) + '</div>' +
      '</div>' +
      '<div class="kv" style="margin-bottom:14px">' +
        '<div class="k">Ordine</div><div class="v">' + s.ordine + '</div>' +
        '<div class="k">Destinatario</div><div class="v">' + s.cliente + '</div>' +
        '<div class="k">Destinazione</div><div class="v">' + s.destinazione + '</div>' +
        '<div class="k">Consegna stimata</div><div class="v">' + s.eta + '</div>' +
      '</div>' +
      '<h3 style="margin-bottom:12px">Stato spedizione</h3>' +
      '<div class="timeline">' + timelineHtml + '</div>' +
      '<div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap">' +
        '<button class="btn btn-ghost btn-sm js-send-tracking" data-id="' + s._order_db_id + '">📧 Invia tracking al cliente</button>' +
      '</div>' +
    '</div>'
  );
}

/* ----------------- INIT ----------------- */
$(function(){

  // Click navigazione
  $(document).on('click','.nav-item',function(e){
    e.preventDefault();
    const $this = $(this);
    const view = $this.data('view');
    // Toggle parent senza vista (chevron)
    if(!view && $this.hasClass('nav-item')) return;

    // Se è un parent con view, espandi anche
    if($this.parent().hasClass('nav-parent')){
      const $p = $this.parent();
      // chiudi gli altri
      $('.nav-parent').not($p).removeClass('open');
      $p.toggleClass('open');
    } else if($this.hasClass('child')){
      // mantieni il parent aperto
    } else {
      $('.nav-parent').removeClass('open');
    }

    if(view){
      // Drive everything through the URL hash so each view has a shareable,
      // bookmarkable URL and the browser back/forward buttons work.
      if(('#'+view) === window.location.hash){ handleRoute(); }   // same view → just refresh
      else { window.location.hash = view; }                       // triggers hashchange → handleRoute
    }
  });

  // ── Hash-based routing ──────────────────────────────────────
  // The admin is a single-page app: one dashboard.html whose #viewContainer is
  // swapped by JS. We reflect the current view in location.hash (e.g.
  // dashboard.html#orders) so the URL changes, refresh keeps you on the page,
  // and back/forward navigate between views.
  function currentHashView(){
    var h = (window.location.hash || '').replace(/^#/, '').trim();
    return (h && VIEWS[h]) ? h : 'dashboard';
  }
  function handleRoute(){
    var view = currentHashView();
    setActiveNav(view);
    renderView(view);
  }
  $(window).on('hashchange', handleRoute);

  // Modal
  $('#modalClose, #modalBackdrop').on('click', function(e){
    if(e.target.id==='modalClose' || e.target.id==='modalBackdrop') closeModal();
  });

  // Top-bar global search
  var $topSearchWrap = $('#topSearch').wrap('<div style="position:relative;flex:1"></div>').parent();
  $topSearchWrap.css('flex','1');
  $('#topSearch').on('keypress', function(e){
    if(e.which!==13) return;
    var q = $(this).val().trim().toLowerCase();
    if(!q) return;
    // Search across orders, products, customers
    var results = [];
    (DATA.orders||[]).forEach(function(o){
      if((o.id+' '+o.cliente).toLowerCase().includes(q))
        results.push({label:'🧾 '+o.id+' — '+o.cliente, view:'orders'});
    });
    (DATA.products||[]).forEach(function(p){
      if((p.nome+' '+p.cat).toLowerCase().includes(q))
        results.push({label:'👗 '+p.nome, view:'products'});
    });
    (DATA.customers||[]).forEach(function(c){
      if((c.nome+' '+c.email).toLowerCase().includes(q))
        results.push({label:'👤 '+c.nome+' <'+c.email+'>', view:'customers'});
    });
    // Remove existing dropdown
    $('#globalSearchDrop').remove();
    if(!results.length){ toast('Nessun risultato per "'+$(this).val()+'"','info'); return; }
    var items = results.slice(0,8).map(function(r){
      return '<div class="gsd-item" data-view="'+r.view+'" style="padding:8px 14px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--line)">'+r.label+'</div>';
    }).join('');
    var $drop = $('<div id="globalSearchDrop" style="position:absolute;top:100%;left:0;right:0;background:var(--card);border:1px solid var(--line);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.12);z-index:1000;margin-top:4px">'+items+'</div>');
    $topSearchWrap.append($drop);
    $drop.on('click','.gsd-item',function(){
      var view=$(this).data('view');
      $('#globalSearchDrop').remove();
      setActiveNav(view);
      renderView(view);
    });
    $(document).one('click',function(){ $('#globalSearchDrop').remove(); });
  });

  // Delegated handlers
  $(document).on('click','.js-toggle-courier', function(){
    const $card = $(this).closest('.courier-card');
    const code  = $card.data('courier');
    const nowActive = !$card.hasClass('active');
    $card.toggleClass('active');
    if (window.AdminAPI && code) {
      AdminAPI.shipping.updateCourier(code, { attivo: nowActive ? 1 : 0 })
        .done(function(){ toast(nowActive ? 'Corriere attivato' : 'Corriere disattivato', nowActive ? 'success' : 'info'); })
        .fail(function(){ $card.toggleClass('active'); toast('Errore aggiornamento corriere', 'error'); });
    } else {
      toast(nowActive ? 'Corriere attivato' : 'Corriere disattivato', nowActive ? 'success' : 'info');
    }
  });
  $(document).on('click','.js-courier-config', function(e){
    e.stopPropagation();
    const code = $(this).data('courier');
    const c = DATA.couriers.find(c=>c.code===code);
    openModal(`Configurazione — ${c.nome||code}`, `
      <form id="courierConfigForm">
        <div class="kv" style="grid-template-columns:150px 1fr;gap:10px">
          <div class="k">Nome</div><div class="v"><input class="field-input" name="nome" value="${(c.nome||'').replace(/"/g,'&quot;')}" style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px"/></div>
          <div class="k">Tariffa base €</div><div class="v"><input class="field-input" type="number" step="0.01" min="0" name="rate" value="${c.rate_raw!=null?c.rate_raw:''}" style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px"/></div>
          <div class="k">Attivo</div><div class="v"><label class="switch"><input type="checkbox" name="attivo" ${c.attivo?'checked':''}><span class="slider"></span></label></div>
          <div class="k">URL tracking</div><div class="v"><input class="field-input" name="tracking_url_template" value="${(c.tracking_url_template||'').replace(/"/g,'&quot;')}" placeholder="https://corriere.it/track?n={tracking}" style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px"/><small style="color:var(--muted)">Usa <code>{tracking}</code> dove va il numero. Il link viene inviato automaticamente al cliente alla spedizione.</small></div>
        </div>
        <div style="margin-top:18px;display:flex;gap:8px;justify-content:flex-end">
          <button type="button" class="btn btn-ghost btn-sm" onclick="closeModal()">Annulla</button>
          <button type="submit" class="btn btn-primary btn-sm">💾 Salva</button>
        </div>
      </form>
    `);
    $('#courierConfigForm').on('submit', function(ev){
      ev.preventDefault();
      var fd = Object.fromEntries(new FormData(this));
      var attivo = $(this).find('[name=attivo]').is(':checked') ? 1 : 0;
      var $btn = $(this).find('[type=submit]');
      $btn.prop('disabled',true).text('Salvataggio…');
      AdminAPI.shipping.updateCourier(code, {
        nome: fd.nome,
        rate: (fd.rate!==undefined && fd.rate!=='') ? parseFloat(fd.rate) : undefined,
        attivo: attivo,
        tracking_url_template: fd.tracking_url_template || null
      }).done(function(){ toast('Corriere aggiornato','success'); closeModal(); renderView('couriers'); })
        .fail(function(){ toast('Errore aggiornamento corriere','error'); $btn.prop('disabled',false).text('💾 Salva'); });
    });
  });
  $(document).on('click','.js-courier-track', function(){
    setActiveNav('tracking');
    renderView('tracking');
  });
  $(document).on('click','.js-courier-rates', function(){
    const code = $(this).data('courier');
    const c = DATA.couriers.find(c=>c.code===code);
    openModal(`Tariffe - ${c.nome}`, `
      <table class="data" style="width:100%">
        <thead><tr><th>Servizio</th><th>Peso</th><th>Tempo</th><th>Prezzo</th></tr></thead>
        <tbody>
          <tr><td>Standard</td><td>0-1 kg</td><td>3-5gg</td><td>${c.rate}</td></tr>
          <tr><td>Standard</td><td>1-3 kg</td><td>3-5gg</td><td>€ 7,90</td></tr>
          <tr><td>Express</td><td>0-1 kg</td><td>24h</td><td>€ 12,90</td></tr>
          <tr><td>Express</td><td>1-3 kg</td><td>24h</td><td>€ 15,90</td></tr>
          <tr><td>Internazionale UE</td><td>0-1 kg</td><td>5-7gg</td><td>€ 14,90</td></tr>
        </tbody>
      </table>
    `);
  });

  // Tracking detail
  $(document).on('click','.js-track-detail', function(){
    const id = $(this).data('id');
    const s = DATA.shipments.find(x=>x.id===id);
    if(!s) return;
    const c = DATA.couriers.find(c=>c.code===s.corriere) || { nome:(s.corriere||'—') };
    openModal(`Spedizione ${s.id}`, `
      <div class="kv">
        <div class="k">Ordine</div><div class="v">${s.ordine}</div>
        <div class="k">Cliente</div><div class="v">${s.cliente}</div>
        <div class="k">Corriere</div><div class="v">${c.nome}</div>
        <div class="k">Destinazione</div><div class="v">${s.destinazione}</div>
        <div class="k">Stato</div><div class="v">${statusPill(s.stato)}</div>
        <div class="k">ETA</div><div class="v">${s.eta}</div>
      </div>
      <div style="margin-top:14px">
        <button class="btn btn-soft btn-sm" onclick="closeModal();window.location.hash='tracking';setTimeout(function(){var i=document.getElementById('trackInput');if(i){i.value='${s.id}';if(typeof runTracking==='function')runTracking();}},120)">📍 Apri tracking completo</button>
      </div>
    `);
  });

  // Order detail
  $(document).on('click','.js-view-order', function(){
    const id = $(this).closest('tr').data('id');
    const o  = DATA.orders.find(x=>x.id===id);
    if (!o) return;
    const dbId = o._db_id || null;

    function buildOrderBody(items) {
      var itemsSection = '';
      if (items && items.length) {
        itemsSection = `
          <div style="margin:14px 0;padding:12px;background:var(--bg);border-radius:8px;border:1px solid var(--line)">
            <strong style="font-size:13px;display:block;margin-bottom:8px">Prodotti ordinati</strong>
            <table style="width:100%;font-size:12px;border-collapse:collapse">
              <thead><tr style="color:var(--muted);border-bottom:1px solid var(--line)">
                <th style="padding:4px 0;text-align:left">Prodotto</th>
                <th style="padding:4px 0;text-align:center">Taglia</th>
                <th style="padding:4px 0;text-align:center">Qty</th>
                <th style="padding:4px 0;text-align:right">Prezzo</th>
              </tr></thead>
              <tbody>
                ${items.map(i=>`<tr style="border-bottom:1px solid var(--line)">
                  <td style="padding:6px 0">${i.product_name}</td>
                  <td style="padding:6px 0;text-align:center;color:var(--muted)">${i.taglia||'—'}</td>
                  <td style="padding:6px 0;text-align:center">${i.qty}</td>
                  <td style="padding:6px 0;text-align:right">€ ${parseFloat(i.price||0).toFixed(2).replace('.',',')}</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>`;
      }
      return `
        <div class="kv">
          <div class="k">Cliente</div><div class="v">${o.cliente}</div>
          <div class="k">Data</div><div class="v">${o.data}</div>
          <div class="k">Totale</div><div class="v"><strong>${o.totale}</strong></div>
          <div class="k">Pagamento</div><div class="v">${statusPill(o.pagamento)}</div>
          <div class="k">Stato</div><div class="v">
            <select id="modalOrderStatus" style="border:1px solid var(--line);border-radius:6px;padding:4px 8px;font-size:13px">
              ${['in_attesa','in_preparazione','spedito','consegnato','annullato'].map(s=>
                `<option value="${s}" ${o._raw_status===s?'selected':''}>${AdminAPI ? AdminAPI.statusLabel(s) : s}</option>`
              ).join('')}
            </select>
          </div>
          <div class="k">Corriere</div><div class="v">${o.corriere} ${o.tracking!=='-'?`· <code>${o.tracking}</code>`:''}</div>
        </div>
        ${itemsSection}
        <div style="margin-top:18px;display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
          <button class="btn btn-ghost btn-sm js-print-order">🖨 Stampa</button>
          ${dbId ? `<button class="btn btn-soft btn-sm js-open-ship-modal" data-id="${dbId}" data-order="${o.id}" data-payment="${o.pagamento}">🚚 Spedisci</button>` : ''}
          ${dbId ? `<button class="btn btn-primary btn-sm js-save-order-status" data-id="${dbId}">💾 Salva stato</button>` : ''}
        </div>
      `;
    }

    // Show modal immediately with loading placeholder for items
    openModal(`Ordine ${o.id}`, buildOrderBody(null));

    // Load line items from API
    if (dbId && window.AdminAPI) {
      AdminAPI.orders.get(dbId).done(function(res){
        $('#modalBody').html(buildOrderBody(res.items || []));
      }).fail(function(){
        // Modal already showing, just leave without items
      });
    }
  });

  // Print order
  $(document).on('click','.js-print-order', function(){
    window.print();
  });

  // Save order status via API
  $(document).on('click','.js-save-order-status', function(){
    const dbId  = $(this).data('id');
    const stato = $('#modalOrderStatus').val();
    if (!window.AdminAPI || !dbId) return;
    const $btn = $(this);
    $btn.prop('disabled', true).text('Salvataggio…');
    AdminAPI.orders.updateStatus(dbId, { order_status: stato })
      .done(function() { toast('Stato aggiornato', 'success'); closeModal(); renderView('orders'); })
      .fail(function() { toast('Errore aggiornamento', 'error'); $btn.prop('disabled', false).text('💾 Salva stato'); });
  });

  // Product detail
  $(document).on('click','.js-product', function(){
    const id = $(this).data('id');
    const p = DATA.products.find(x=>x.id===id);
    if (!p) return;
    openModal(p.nome, `
      <div style="display:flex;gap:16px">
        <div class="prod-thumb" style="width:140px;height:140px;border-radius:10px;flex:0 0 140px">${p.img}</div>
        <div class="kv" style="flex:1">
          <div class="k">SKU</div><div class="v">${p.id}</div>
          <div class="k">Categoria</div><div class="v">${p.cat}</div>
          <div class="k">Prezzo</div><div class="v"><strong>${p.prezzo}</strong></div>
          <div class="k">Stock</div><div class="v">${p.stock} pezzi</div>
          <div class="k">Stato</div><div class="v">${statusPill(p.status)}</div>
        </div>
      </div>
      <div style="margin-top:18px;display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-ghost btn-sm js-del-product" data-id="${p.id}" data-nome="${p.nome}">🗑 Elimina</button>
        <button class="btn btn-soft btn-sm js-edit-product" data-id="${p.id}">✏ Modifica</button>
      </div>
    `);
  });

  // Delete product
  $(document).on('click','.js-del-product', function(){
    const id   = $(this).data('id');
    const nome = $(this).data('nome');
    if (!id || !window.AdminAPI) return;
    if (!confirm(`Eliminare il prodotto "${nome}"? L'azione è irreversibile.`)) return;
    AdminAPI.products.delete(id)
      .done(function(){
        toast('Prodotto eliminato', 'success');
        closeModal();
        renderView('products');
      })
      .fail(function(){ toast('Errore durante l\'eliminazione', 'error'); });
  });

  // Edit product — open form modal
  /* ── Product image gallery (drag-drop upload, reorder, primary, delete) ── */
  function imgUrl(img, size){ return (typeof img==='string') ? img : (img[size]||img.thumb||img.card||img.full); }
  function imgFull(img){ return (typeof img==='string') ? img : (img.full||img.card||img.thumb); }
  function productGalleryHtml(){
    return '<div style="margin-top:16px">'+
      '<div style="font-size:13px;font-weight:600;margin-bottom:6px">Immagini prodotto</div>'+
      '<div id="galleryGrid" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px"></div>'+
      '<div id="galleryDrop" style="border:2px dashed var(--line);border-radius:8px;padding:16px;text-align:center;cursor:pointer;color:var(--muted);font-size:13px">'+
        'Trascina qui le immagini o <strong>clicca per scegliere</strong><br><small>JPG · PNG · WebP — vengono ottimizzate in automatico</small>'+
        '<input type="file" id="galleryFile" accept="image/*" multiple style="display:none"/>'+
      '</div>'+
      '<div id="galleryMsg" style="font-size:12px;color:var(--muted);margin-top:4px"></div>'+
    '</div>';
  }
  function wireProductGallery(id, initialImages){
    var imgs = Array.isArray(initialImages) ? initialImages.slice() : [];
    var grid = document.getElementById('galleryGrid');
    var drop = document.getElementById('galleryDrop');
    var fileInput = document.getElementById('galleryFile');
    var msg  = document.getElementById('galleryMsg');
    if(!grid || !drop) return;
    function render(){
      if(!imgs.length){ grid.innerHTML = '<span style="color:var(--muted);font-size:12px">Nessuna immagine ancora.</span>'; return; }
      grid.innerHTML = imgs.map(function(img,i){
        return '<div style="position:relative;width:84px;height:106px;border:1px solid var(--line);border-radius:8px;overflow:hidden;'+(i===0?'box-shadow:0 0 0 2px var(--green-strong)':'')+'">'+
          '<img src="'+imgUrl(img,'thumb')+'" style="width:100%;height:100%;object-fit:cover" alt=""/>'+
          (i===0?'<span style="position:absolute;top:2px;left:2px;background:var(--green-strong);color:#fff;font-size:9px;padding:1px 4px;border-radius:4px">Principale</span>':'')+
          '<div style="position:absolute;bottom:0;left:0;right:0;display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,.9)">'+
            '<button type="button" class="gal-left" data-i="'+i+'" title="Sposta a sinistra" style="font-size:12px;padding:1px 4px;background:none">◀</button>'+
            (i!==0?'<button type="button" class="gal-primary" data-i="'+i+'" title="Imposta come principale" style="font-size:12px;padding:1px 4px;background:none">★</button>':'<span></span>')+
            '<button type="button" class="gal-right" data-i="'+i+'" title="Sposta a destra" style="font-size:12px;padding:1px 4px;background:none">▶</button>'+
            '<button type="button" class="gal-del" data-i="'+i+'" title="Elimina" style="font-size:12px;padding:1px 4px;background:none;color:var(--danger)">✕</button>'+
          '</div>'+
        '</div>';
      }).join('');
    }
    function persist(){ AdminAPI.products.update(id, { images: imgs }).fail(function(){ toast('Errore salvataggio ordine','error'); }); }
    function upload(files){
      if(!files || !files.length) return;
      msg.style.color='var(--muted)'; msg.textContent='Caricamento e ottimizzazione…';
      AdminAPI.products.uploadImages(id, files).done(function(r){ imgs = r.images||imgs; render(); msg.textContent='Immagini caricate.'; })
        .fail(function(x){ msg.style.color='var(--danger)'; msg.textContent=(x.responseJSON&&x.responseJSON.error)||'Errore caricamento'; });
    }
    render();
    drop.addEventListener('click', function(){ fileInput.click(); });
    fileInput.addEventListener('change', function(){ upload(this.files); this.value=''; });
    ['dragover','dragenter'].forEach(function(ev){ drop.addEventListener(ev, function(e){ e.preventDefault(); drop.style.borderColor='var(--green-strong)'; }); });
    ['dragleave','drop'].forEach(function(ev){ drop.addEventListener(ev, function(e){ e.preventDefault(); drop.style.borderColor='var(--line)'; }); });
    drop.addEventListener('drop', function(e){ upload(e.dataTransfer.files); });
    $(grid).on('click','.gal-del', function(){
      var i=+$(this).data('i'); var img=imgs[i];
      AdminAPI.products.deleteImage(id, imgFull(img)).done(function(r){ imgs=r.images||imgs; render(); }).fail(function(){ toast('Errore eliminazione','error'); });
    });
    $(grid).on('click','.gal-primary', function(){ var i=+$(this).data('i'); imgs.unshift(imgs.splice(i,1)[0]); render(); persist(); });
    $(grid).on('click','.gal-left', function(){ var i=+$(this).data('i'); if(i>0){ imgs.splice(i-1,0,imgs.splice(i,1)[0]); render(); persist(); } });
    $(grid).on('click','.gal-right', function(){ var i=+$(this).data('i'); if(i<imgs.length-1){ imgs.splice(i+1,0,imgs.splice(i,1)[0]); render(); persist(); } });
  }

  // ── Catalog facet pickers (category/collections are SELECTED, never typed) ──
  function _cap(s){ return String(s||'').charAt(0).toUpperCase()+String(s||'').slice(1); }
  function _catalogCategories(){
    var set = {};
    ['vestiti','top','gonne','pantaloni','blazer','set','borse','gioielli','scarpe','cinture'].forEach(function(c){ set[c]=1; });
    (DATA.products||[]).forEach(function(p){ var c=(p.cat||p.categoria||''); if(c) set[String(c).toLowerCase().trim()]=1; });
    return Object.keys(set).filter(Boolean).sort();
  }
  function _catalogCollections(){
    var set = {};
    ['shop-all','novita','saldi','estate-2025','vestiti','top','gonne','pantaloni','blazer','set','borse','gioielli','scarpe','cinture','accessori'].forEach(function(c){ set[c]=1; });
    (DATA.products||[]).forEach(function(p){ (Array.isArray(p.collections)?p.collections:[]).forEach(function(s){ if(s) set[String(s).toLowerCase().trim()]=1; }); });
    return Object.keys(set).filter(Boolean).sort();
  }
  var PRODUCT_COLORS = [['blush','Rosa cipria'],['salvia','Salvia'],['lavanda','Lavanda'],['avorio','Avorio'],['menta','Menta'],['antico','Rosa antico'],['espresso','Espresso']];
  function colorLabelFor(key){ for(var i=0;i<PRODUCT_COLORS.length;i++){ if(PRODUCT_COLORS[i][0]===key) return PRODUCT_COLORS[i][1]; } return ''; }
  function colorSelect(current){
    current = (current||'').toLowerCase();
    return '<select class="field-input" name="colore" style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px">'
      + '<option value="">— nessuno —</option>'
      + PRODUCT_COLORS.map(function(c){ return '<option value="'+c[0]+'"'+(c[0]===current?' selected':'')+'>'+c[1]+'</option>'; }).join('')
      + '</select>';
  }
  function categorySelect(current){
    var cats = _catalogCategories();
    current = (current||'').toLowerCase().trim();
    if (current && cats.indexOf(current)===-1) cats.unshift(current);
    return '<select class="field-input" name="categoria" required style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px">'
      + '<option value="" disabled'+(current?'':' selected')+'>Seleziona categoria…</option>'
      + cats.map(function(c){ return '<option value="'+c+'"'+(c===current?' selected':'')+'>'+_cap(c)+'</option>'; }).join('')
      + '</select>';
  }
  function collectionChecks(selected){
    selected = (selected||[]).map(function(s){ return String(s).toLowerCase().trim(); });
    return '<div style="display:flex;flex-wrap:wrap;gap:6px 14px;max-height:130px;overflow:auto;padding:8px;border:1px solid var(--line);border-radius:6px;background:var(--bg-soft,#fafafa)">'
      + _catalogCollections().map(function(s){
          return '<label style="display:inline-flex;align-items:center;gap:5px;font-size:13px;white-space:nowrap;cursor:pointer"><input type="checkbox" class="coll-check" value="'+s+'"'+(selected.indexOf(s)!==-1?' checked':'')+'/>'+s+'</label>';
        }).join('')
      + '</div>';
  }

  function openProductEditor(id){
    if (!id || !window.AdminAPI) return;
    AdminAPI.products.get(id).done(function(p){
      openModal(`Modifica: ${p.name}`, `
        <form id="editProductForm">
          <div class="kv" style="grid-template-columns:120px 1fr;gap:10px">
            <div class="k">Nome *</div><div class="v"><input class="field-input" type="text" name="name" value="${(p.name||'').replace(/"/g,'&quot;')}" required style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px"/></div>
            <div class="k">Categoria *</div><div class="v">${categorySelect(p.categoria)}</div>
            <div class="k">Collezioni</div><div class="v">${collectionChecks(Array.isArray(p.collections)?p.collections:[])}<small style="color:var(--muted);display:block;margin-top:4px">Seleziona le collezioni — controllano le pagine collezione dello shop</small></div>
            <div class="k">Prezzo €</div><div class="v"><input class="field-input" type="number" name="price" step="0.01" value="${p.price||''}" style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px"/></div>
            <div class="k">Prezzo orig. €</div><div class="v"><input class="field-input" type="number" name="original_price" step="0.01" min="0" value="${p.original_price||''}" placeholder="(se scontato → calcola sconto)" style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px"/></div>
            <div class="k">Colore</div><div class="v">${colorSelect(p.colore)}</div>
            <div class="k">Novità</div><div class="v"><label style="display:inline-flex;align-items:center;gap:8px;font-size:13px"><input type="checkbox" name="is_new" ${p.is_new?'checked':''}/> Mostra badge "New"</label></div>
            <div class="k">Stato</div><div class="v">
              <select name="status" style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px">
                ${['attivo','bozza','esaurito'].map(s=>`<option value="${s}" ${p.status===s?'selected':''}>${AdminAPI.statusLabel(s)}</option>`).join('')}
              </select>
            </div>
            <div class="k">Descrizione</div><div class="v"><textarea name="description" rows="3" style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px">${p.description||''}</textarea></div>
          </div>
          ${productGalleryHtml()}
          <div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">
            <button type="button" class="btn btn-ghost btn-sm" onclick="closeModal()">Chiudi</button>
            <button type="submit" class="btn btn-primary btn-sm" data-id="${id}">💾 Salva modifiche</button>
          </div>
        </form>
      `);
      wireProductGallery(id, p.images);
      $('#editProductForm').on('submit', function(e){
        e.preventDefault();
        const fd = Object.fromEntries(new FormData(this));
        const $btn = $(this).find('[type=submit]');
        $btn.prop('disabled',true).text('Salvataggio…');
        var collections = $('#editProductForm .coll-check:checked').map(function(){ return this.value; }).get();
        var coloreKey = fd.colore || null;
        var isNew = $('#editProductForm [name=is_new]').is(':checked');
        var origP = fd.original_price ? parseFloat(fd.original_price) : null;
        var priceP = parseFloat(fd.price);
        var discountPct = (origP && origP > priceP) ? Math.round((1 - priceP/origP) * 100) : 0;
        AdminAPI.products.update(id, {
          name: fd.name, categoria: fd.categoria,
          price: priceP, original_price: origP,
          colore: coloreKey, color_label: coloreKey ? colorLabelFor(coloreKey) : null,
          is_new: isNew, discount_pct: discountPct,
          status: fd.status,
          description: fd.description, collections: collections
        }).done(function(){
          toast('Prodotto aggiornato','success');
          closeModal();
          renderView('products');
        }).fail(function(){ toast('Errore aggiornamento','error'); $btn.prop('disabled',false).text('💾 Salva modifiche'); });
      });
    }).fail(function(){ toast('Errore caricamento prodotto','error'); });
  }

  $(document).on('click','.js-edit-product', function(){
    openProductEditor($(this).data('id'));
  });

  // Toggle view (grid/list) prodotti
  $(document).on('click','.view-toggle', function(){
    $('.view-toggle').removeClass('active');
    $(this).addClass('active');
    renderProductsArea($(this).data('mode'));
  });

  // Search prodotti
  $(document).on('keyup','#prodSearch', function(){
    const q = $(this).val().toLowerCase();
    $('#productsArea .prod-card, #productsArea tbody tr').each(function(){
      const txt = $(this).text().toLowerCase();
      $(this).toggle(txt.includes(q));
    });
  });

  // Search ordini
  $(document).on('keyup','#orderSearch', function(){
    const q = $(this).val().toLowerCase();
    $('#ordersTable tbody tr').each(function(){
      $(this).toggle($(this).text().toLowerCase().includes(q));
    });
  });

  // Tab filter ordini
  $(document).on('click','.tab-filter', function(){
    $('.tab-filter').removeClass('active');
    $(this).addClass('active');
    const f = $(this).text().toLowerCase();
    $('#ordersTable tbody tr').each(function(){
      // Match on raw DB status (data-status attribute) — never on localised display text
      const st = ($(this).data('status') || '').toLowerCase();
      if(f==='tutti')       $(this).show();
      else if(f==='non pagati') $(this).toggle(st==='in_attesa');
      else if(f==='da spedire') $(this).toggle(st==='in_preparazione');
      else if(f==='spediti')    $(this).toggle(st==='spedito');
      else if(f==='annullati')  $(this).toggle(st==='annullato' || st==='rimborsato');
    });
  });

  // Selezione ordini multi
  $(document).on('change','#selAll', function(){
    $('.rowSel').prop('checked', this.checked);
  });

  // Search newsletter iscritti
  $(document).on('keyup','#nlSearch', function(){
    const q = $(this).val().toLowerCase();
    $('#nlTable tbody tr').each(function(){
      $(this).toggle($(this).text().toLowerCase().includes(q));
    });
  });

  // Export newsletter CSV
  $(document).on('click','.js-nl-export', function(){
    if (!DATA.newsletter || !DATA.newsletter.recent || !DATA.newsletter.recent.length) {
      toast('Nessun dato da esportare', 'info'); return;
    }
    const rows = [['Email','Fonte','Data iscrizione','Stato']];
    DATA.newsletter.recent.forEach(function(s){
      rows.push([s.email, s.fonte||'footer', new Date(s.subscribed_at).toLocaleDateString('it-IT'), s.unsubscribed?'Discritto':'Attivo']);
    });
    const csv = rows.map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = 'newsletter_iscritti_' + new Date().toISOString().slice(0,10) + '.csv';
    a.click();
    toast('CSV esportato', 'success');
  });

  // Search spedizioni
  $(document).on('keyup','#shipSearch', function(){
    const q = $(this).val().toLowerCase();
    $('#shipTable tbody tr').each(function(){
      $(this).toggle($(this).text().toLowerCase().includes(q));
    });
  });
  $(document).on('change','#shipFilterCourier, #shipFilterStatus', function(){
    const c = $('#shipFilterCourier').val();
    const s = $('#shipFilterStatus').val();
    $('#shipTable tbody tr').each(function(){
      const okC = !c || $(this).data('courier')===c;
      const okS = !s || $(this).data('status')===s;
      $(this).toggle(okC && okS);
    });
  });

  // Tracking button
  $(document).on('click','#btnTrack', runTracking);
  $(document).on('keypress','#trackInput', function(e){ if(e.which===13) runTracking(); });

  // Send tracking info to customer
  $(document).on('click','.js-send-tracking', function(){
    var orderId = $(this).data('id');
    if (!orderId) { toast('ID ordine non disponibile','error'); return; }
    AdminAPI.orders.get(orderId).done(function(res){
      var o = res.order || res;
      var tracking = o.tracking_number || '-';
      var courier  = (o.courier_code || 'corriere').toUpperCase();
      var email    = o.customer_email || '';
      var nome     = ((o.customer_nome||'') + ' ' + (o.customer_cognome||'')).trim();
      if (!email) { toast('Nessuna email per questo cliente', 'error'); return; }
      // Show confirmation modal before sending
      openModal(
        'Invia tracking a ' + nome,
        '<p style="margin-bottom:12px;font-size:.875rem">Stai per inviare le seguenti informazioni a <strong>' + email + '</strong>:</p>' +
        '<div class="kv">' +
          '<div class="k">Corriere</div><div class="v">' + courier + '</div>' +
          '<div class="k">Tracking</div><div class="v" style="font-family:monospace">' + tracking + '</div>' +
        '</div>',
        '<button class="btn btn-primary btn-sm" id="confirmSendTracking" ' +
          'data-email="' + email + '" data-tracking="' + tracking + '" data-courier="' + courier + '" data-nome="' + nome + '">' +
          '📧 Invia email' +
        '</button>'
      );
    }).fail(function(){ toast('Errore caricamento ordine','error'); });
  });

  $(document).on('click','#confirmSendTracking', function(){
    var $btn    = $(this);
    var email   = $btn.data('email');
    var tracking = $btn.data('tracking');
    var courier  = $btn.data('courier');
    closeModal();
    // No dedicated send-email endpoint exists — copy the tracking number to the clipboard
    // so the admin can paste it manually, and be honest in the toast about what happened.
    function afterCopy(copied){
      toast(
        (copied ? 'Tracking ' + tracking + ' copiato negli appunti' : 'Tracking: ' + tracking)
        + ' — invia manualmente a ' + email,
        copied ? 'success' : 'info'
      );
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(tracking).then(function(){ afterCopy(true); }, function(){ afterCopy(false); });
    } else {
      // Fallback for non-secure contexts / older browsers without the async Clipboard API.
      var $tmp = $('<textarea readonly style="position:fixed;opacity:0">').val(tracking).appendTo('body');
      $tmp.trigger('select');
      var copied = false;
      try { copied = document.execCommand('copy'); } catch (e) { copied = false; }
      $tmp.remove();
      afterCopy(copied);
    }
  });

  // Sidebar mobile menu
  $(document).on('click','#mobileMenu', function(){
    $('.sidebar').toggleClass('mobile-open');
  });

  // Sidebar collapse (desktop)
  $(document).on('click','.collapse-btn', function(){
    const $sidebar = $('.sidebar');
    $sidebar.toggleClass('collapsed');
    const isCollapsed = $sidebar.hasClass('collapsed');
    $(this).text(isCollapsed ? '›' : '‹');
    try { localStorage.setItem('memi_sidebar_collapsed', isCollapsed ? '1' : '0'); } catch(_){}
  });
  // Restore collapse state on load
  try {
    if (localStorage.getItem('memi_sidebar_collapsed') === '1') {
      $('.sidebar').addClass('collapsed');
      $('.collapse-btn').text('›');
    }
  } catch(_){}

  // Logout — clear token before redirecting
  $(document).on('click','.logout-btn', function(e){
    e.preventDefault();
    if (window.AdminAPI) AdminAPI.auth.logout();
    window.location.href = 'index.html';
  });

  /* ===== CHAT EVENTS ===== */
  $(document).on('click','.chat-conv', function(){
    activeChatId = $(this).data('id');
    renderActiveChat();
    $('.chat-conv').removeClass('active');
    $(this).addClass('active');
  });

  $(document).on('click','.chat-tabs button', function(){
    $('.chat-tabs button').removeClass('active');
    $(this).addClass('active');
    renderConvList($(this).data('tab'));
  });

  $(document).on('keyup','#chatSearch', function(){
    const q = $(this).val().toLowerCase();
    $('.chat-conv').each(function(){
      $(this).toggle($(this).text().toLowerCase().includes(q));
    });
  });

  $(document).on('submit','#chatForm', function(e){
    e.preventDefault();
    const $i = $('#chatInput');
    sendChatMessage($i.val());
    $i.val('').focus();
  });

  $(document).on('click','.quick-replies .qr', function(){
    sendChatMessage($(this).text());
  });

  /* ═══════════════════════════════════════════════════
     ⭐ NEW PRODUCT — create modal
     ═══════════════════════════════════════════════════ */
  $(document).on('click','.js-new-product', function(){
    openModal('Nuovo prodotto', `
      <form id="newProductForm">
        <div class="kv" style="grid-template-columns:130px 1fr;gap:10px">
          <div class="k">ID / SKU *</div><div class="v"><input class="field-input" type="text" name="id" placeholder="es. vestito-floreale-01" required style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px"/></div>
          <div class="k">Nome *</div><div class="v"><input class="field-input" type="text" name="name" placeholder="Nome prodotto" required style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px"/></div>
          <div class="k">Categoria *</div><div class="v">${categorySelect('')}</div>
          <div class="k">Collezioni</div><div class="v">${collectionChecks([])}<small style="color:var(--muted);display:block;margin-top:4px">Seleziona le collezioni (controllano le pagine collezione)</small></div>
          <div class="k">Prezzo € *</div><div class="v"><input class="field-input" type="number" name="price" step="0.01" min="0" placeholder="0.00" required style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px"/></div>
          <div class="k">Prezzo orig. €</div><div class="v"><input class="field-input" type="number" name="original_price" step="0.01" min="0" placeholder="(se scontato → calcola sconto)" style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px"/></div>
          <div class="k">Colore</div><div class="v">${colorSelect('')}</div>
          <div class="k">Novità</div><div class="v"><label style="display:inline-flex;align-items:center;gap:8px;font-size:13px"><input type="checkbox" name="is_new" /> Mostra badge "New"</label></div>
          <div class="k">Stato</div><div class="v">
            <select name="status" style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px">
              <option value="attivo">Attivo</option>
              <option value="bozza">Bozza</option>
            </select>
          </div>
          <div class="k">Taglie / Stock</div><div class="v">
            <small style="color:var(--muted)">Formato: XS:10, S:20, M:15, L:8</small>
            <input class="field-input" type="text" name="taglie_str" placeholder="XS:10, S:20, M:15, L:8" style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px;margin-top:4px"/>
          </div>
          <div class="k">Descrizione</div><div class="v"><textarea name="description" rows="3" placeholder="Descrizione prodotto..." style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px"></textarea></div>
        </div>
        <div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">
          <button type="button" class="btn btn-ghost btn-sm" onclick="closeModal()">Annulla</button>
          <button type="submit" class="btn btn-primary btn-sm">+ Crea prodotto</button>
        </div>
      </form>
    `);
    $('#newProductForm').on('submit', function(e){
      e.preventDefault();
      if (!window.AdminAPI) return;
      const fd  = Object.fromEntries(new FormData(this));
      const $btn = $(this).find('[type=submit]');
      const taglie = (fd.taglie_str || '').split(',').map(s => s.trim()).filter(Boolean).map(s => {
        const parts = s.split(':');
        return { taglia: (parts[0]||'').trim().toUpperCase(), stock: parseInt(parts[1]) || 0 };
      });
      $btn.prop('disabled', true).text('Creazione...');
      const newId = fd.id.trim().toLowerCase().replace(/\s+/g, '-');
      const collections = $('#newProductForm .coll-check:checked').map(function(){ return this.value; }).get();
      const coloreKey = fd.colore || null;
      const isNew = $('#newProductForm [name=is_new]').is(':checked');
      const origP = fd.original_price ? parseFloat(fd.original_price) : null;
      const priceP = parseFloat(fd.price);
      const discountPct = (origP && origP > priceP) ? Math.round((1 - priceP/origP) * 100) : 0;
      AdminAPI.products.create({
        id: newId,
        name: fd.name, categoria: fd.categoria,
        price: priceP,
        original_price: origP,
        colore: coloreKey, color_label: coloreKey ? colorLabelFor(coloreKey) : null,
        is_new: isNew, discount_pct: discountPct,
        status: fd.status, description: fd.description, taglie: taglie,
        collections: collections,
      }).done(function(){
        toast('Prodotto creato — ora aggiungi le immagini', 'success');
        // Reopen in the editor so images can be uploaded right away
        openProductEditor(newId);
      }).fail(function(xhr){
        const msg = (xhr.responseJSON && xhr.responseJSON.error) || 'Errore creazione';
        toast(msg, 'error');
        $btn.prop('disabled', false).text('+ Crea prodotto');
      });
    });
  });

  /* NEW DISCOUNT */
  $(document).on('click','.js-new-discount', function(){
    openModal('Nuovo codice sconto', `
      <form id="newDiscountForm">
        <div class="kv" style="grid-template-columns:130px 1fr;gap:10px">
          <div class="k">Codice *</div><div class="v"><input type="text" name="code" placeholder="es. ESTATE30" required style="text-transform:uppercase;width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px"/></div>
          <div class="k">Tipo *</div><div class="v">
            <select name="tipo" style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px">
              <option value="percentuale">Percentuale %</option>
              <option value="fisso">Fisso EUR</option>
              <option value="spedizione">Spedizione gratuita</option>
            </select>
          </div>
          <div class="k">Valore</div><div class="v"><input type="number" name="valore" step="0.01" min="0" placeholder="es. 20 per 20%" style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px"/></div>
          <div class="k">Ordine min. EUR</div><div class="v"><input type="number" name="min_order" step="0.01" min="0" value="0" style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px"/></div>
          <div class="k">Max utilizzi</div><div class="v"><input type="number" name="max_utilizzi" min="1" placeholder="(illimitato)" style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px"/></div>
          <div class="k">Scadenza</div><div class="v"><input type="date" name="scadenza" style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px"/></div>
          <div class="k">Stato</div><div class="v">
            <select name="stato" style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px">
              <option value="attivo">Attivo</option>
              <option value="pianificato">Pianificato</option>
              <option value="disattivo">Disattivo</option>
            </select>
          </div>
        </div>
        <div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">
          <button type="button" class="btn btn-ghost btn-sm" onclick="closeModal()">Annulla</button>
          <button type="submit" class="btn btn-primary btn-sm">+ Crea sconto</button>
        </div>
      </form>
    `);
    $('#newDiscountForm').on('submit', function(e){
      e.preventDefault();
      if (!window.AdminAPI) return;
      const fd   = Object.fromEntries(new FormData(this));
      const $btn = $(this).find('[type=submit]');
      $btn.prop('disabled', true).text('Creazione...');
      AdminAPI.discounts.create({
        code:         fd.code.toUpperCase().trim(),
        tipo:         fd.tipo,
        valore:       parseFloat(fd.valore) || 0,
        min_order:    parseFloat(fd.min_order) || 0,
        max_utilizzi: fd.max_utilizzi ? parseInt(fd.max_utilizzi) : null,
        scadenza:     fd.scadenza || null,
        stato:        fd.stato,
      }).done(function(){
        toast('Codice sconto creato', 'success');
        closeModal();
        renderView('discounts');
      }).fail(function(xhr){
        const msg = (xhr.responseJSON && xhr.responseJSON.error) || 'Errore creazione';
        toast(msg, 'error');
        $btn.prop('disabled', false).text('+ Crea sconto');
      });
    });
  });

  /* Copy discount code */
  $(document).on('click','.js-copy-code', function(e){
    e.stopPropagation();
    const code = $(this).data('code');
    if (navigator.clipboard) {
      navigator.clipboard.writeText(code).then(function(){ toast('Codice copiato: ' + code, 'success'); });
    } else {
      toast(code, 'info');
    }
  });

  /* Delete discount */
  $(document).on('click','.js-del-discount', function(e){
    e.stopPropagation();
    const id   = $(this).data('id');
    const code = $(this).data('code');
    if (!id || !window.AdminAPI) return;
    if (!confirm('Eliminare il codice "' + code + '"?')) return;
    AdminAPI.discounts.delete(id)
      .done(function(){ toast('Codice eliminato', 'success'); renderView('discounts'); })
      .fail(function(){ toast('Errore eliminazione', 'error'); });
  });

  /* SHIPPING ZONES */
  function openZoneModal(title, initialData, onSave){
    const d = initialData || {};
    openModal(title, `
      <form id="zoneForm">
        <div class="kv" style="grid-template-columns:150px 1fr;gap:10px">
          <div class="k">Nome zona *</div><div class="v"><input type="text" name="nome" value="${d.nome||''}" required style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px"/></div>
          <div class="k">Paesi *</div><div class="v"><input type="text" name="paesi" value="${d.paesi||''}" required placeholder="es. Italia" style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px"/></div>
          <div class="k">Metodo</div><div class="v"><input type="text" name="metodo" value="${d.metodo||''}" placeholder="es. Standard 3-5gg" style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px"/></div>
          <div class="k">Prezzo EUR *</div><div class="v"><input type="number" name="prezzo" step="0.01" min="0" value="${d._raw_prezzo||''}" required style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px"/></div>
          <div class="k">Spediz. gratis da EUR</div><div class="v"><input type="number" name="spedizione_gratuita_da" step="0.01" min="0" value="${d._raw_grat||''}" placeholder="(vuoto = disattivata)" style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px"/></div>
        </div>
        <div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">
          <button type="button" class="btn btn-ghost btn-sm" onclick="closeModal()">Annulla</button>
          <button type="submit" class="btn btn-primary btn-sm">Salva</button>
        </div>
      </form>
    `);
    $('#zoneForm').on('submit', function(e){
      e.preventDefault();
      const fd   = Object.fromEntries(new FormData(this));
      const $btn = $(this).find('[type=submit]');
      $btn.prop('disabled', true).text('Salvataggio...');
      onSave({
        nome: fd.nome, paesi: fd.paesi, metodo: fd.metodo,
        prezzo: parseFloat(fd.prezzo),
        spedizione_gratuita_da: fd.spedizione_gratuita_da ? parseFloat(fd.spedizione_gratuita_da) : null,
      }, $btn);
    });
  }

  $(document).on('click','.js-new-zone', function(){
    openZoneModal('Nuova zona di spedizione', null, function(payload, $btn){
      AdminAPI.shipping.createZone(payload)
        .done(function(){ toast('Zona creata','success'); closeModal(); renderView('shipping-zones'); })
        .fail(function(){ toast('Errore creazione','error'); $btn.prop('disabled',false).text('Salva'); });
    });
  });

  $(document).on('click','.js-edit-zone', function(){
    const id = $(this).data('id');
    if (!id) return;
    const z = DATA.zones.find(function(x){ return x._db_id == id; });
    const init = z ? Object.assign({}, z, {
      _raw_prezzo: z.prezzo ? z.prezzo.replace('EUR ','').replace('E ','').replace(/[^\d.]/g,'') : '',
      _raw_grat:   z.grat && z.grat !== '-' && z.grat !== 'EUR' ? z.grat.replace(/[^\d.]/g,'') : ''
    }) : {};
    openZoneModal('Modifica zona', init, function(payload, $btn){
      AdminAPI.shipping.updateZone(id, payload)
        .done(function(){ toast('Zona aggiornata','success'); closeModal(); renderView('shipping-zones'); })
        .fail(function(){ toast('Errore aggiornamento','error'); $btn.prop('disabled',false).text('Salva'); });
    });
  });

  $(document).on('click','.js-del-zone', function(){
    const id   = $(this).data('id');
    const nome = $(this).data('nome');
    if (!id || !window.AdminAPI) return;
    if (!confirm('Eliminare la zona "' + nome + '"?')) return;
    AdminAPI.shipping.deleteZone(id)
      .done(function(){ toast('Zona eliminata','success'); renderView('shipping-zones'); })
      .fail(function(){ toast('Errore eliminazione','error'); });
  });

  /* CUSTOMER DETAIL */
  $(document).on('click','.js-view-customer', function(){
    const id   = $(this).data('id');
    const name = $(this).data('name');
    if (!id || !window.AdminAPI) return;
    $('#modalTitle').text(name || 'Cliente');
    $('#modalBody').html('<div style="padding:30px;text-align:center;color:var(--muted)">Caricamento...</div>');
    $('#modalBackdrop').addClass('show');
    const numId = String(id).replace('C-','').replace(/^0+/,'') || id;
    AdminAPI.customers.get(numId).done(function(c){
      const orders = (c.orders || []).map(function(o){
        return '<tr>' +
          '<td><strong>' + o.order_number + '</strong></td>' +
          '<td>EUR ' + parseFloat(o.total).toFixed(2).replace('.',',') + '</td>' +
          '<td>' + statusPill(AdminAPI.statusLabel(o.payment_status)) + '</td>' +
          '<td>' + statusPill(AdminAPI.statusLabel(o.order_status)) + '</td>' +
          '<td>' + new Date(o.created_at).toLocaleDateString('it-IT') + '</td>' +
          '</tr>';
      }).join('');
      const addr = [c.indirizzo, c.citta, c.cap, c.paese].filter(Boolean).join(', ') || '-';
      $('#modalBody').html(
        '<div class="kv" style="grid-template-columns:120px 1fr;gap:8px;margin-bottom:16px">' +
          '<div class="k">Nome</div><div class="v"><strong>' + (c.nome||'') + ' ' + (c.cognome||'') + '</strong></div>' +
          '<div class="k">Email</div><div class="v"><a href="mailto:' + c.email + '">' + c.email + '</a></div>' +
          '<div class="k">Telefono</div><div class="v">' + (c.telefono||'-') + '</div>' +
          '<div class="k">Indirizzo</div><div class="v">' + addr + '</div>' +
          '<div class="k">Ordini</div><div class="v">' + (c.total_orders||0) + '</div>' +
          '<div class="k">Spesa totale</div><div class="v"><strong>EUR ' + parseFloat(c.total_spent||0).toFixed(2).replace('.',',') + '</strong></div>' +
          '<div class="k">Registrato</div><div class="v">' + new Date(c.created_at).toLocaleDateString('it-IT') + '</div>' +
          '<div class="k">Ultimo accesso</div><div class="v">' + (c.last_login ? new Date(c.last_login).toLocaleDateString('it-IT') : '-') + '</div>' +
        '</div>' +
        (orders ?
          '<h4 style="margin-bottom:8px">Ultimi ordini</h4>' +
          '<div style="overflow-x:auto"><table class="data" style="width:100%">' +
          '<thead><tr><th>Ordine</th><th>Totale</th><th>Pagamento</th><th>Stato</th><th>Data</th></tr></thead>' +
          '<tbody>' + orders + '</tbody>' +
          '</table></div>'
          : '<p style="color:var(--muted)">Nessun ordine.</p>') +
        '<div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">' +
          '<button class="btn btn-ghost btn-sm js-del-customer" data-id="' + numId + '" data-name="' + (c.nome||'') + '">Elimina account</button>' +
        '</div>'
      );
    }).fail(function(){ $('#modalBody').html('<p style="padding:20px;color:var(--muted)">Errore caricamento cliente.</p>'); });
  });

  $(document).on('click','.js-email-customer', function(){
    const email = $(this).data('email');
    if (email) window.open('mailto:' + email, '_blank');
  });

  $(document).on('click','.js-del-customer', function(){
    const id   = $(this).data('id');
    const name = $(this).data('name');
    if (!id || !window.AdminAPI) return;
    if (!confirm('Eliminare l\'account di "' + name + '"?')) return;
    AdminAPI.customers.delete(id)
      .done(function(){ toast('Cliente eliminato','success'); closeModal(); renderView('customers'); })
      .fail(function(){ toast('Errore eliminazione','error'); });
  });

  /* ═════════════════════════════════════════════
     CSV EXPORTS
     ═════════════════════════════════════════════ */
  function downloadCSV(rows, filename) {
    var csv = rows.map(function(r){ return r.map(function(c){ return '"'+String(c==null?'':c).replace(/"/g,'""')+'"'; }).join(','); }).join('\n');
    var a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,'+encodeURIComponent(csv);
    a.download = filename+'_'+new Date().toISOString().slice(0,10)+'.csv';
    a.click();
  }

  $(document).on('click','.js-export-orders', function(){
    if (!DATA.orders || !DATA.orders.length){ toast('Nessun ordine da esportare','info'); return; }
    var rows=[['ID Ordine','Cliente','Data','Totale','Pagamento','Stato','Corriere','Tracking']];
    DATA.orders.forEach(function(o){ rows.push([o.id,o.cliente,o.data,o.totale,o.pagamento,o.stato,o.corriere,o.tracking]); });
    downloadCSV(rows,'ordini');
    toast('CSV esportato: ' + DATA.orders.length + ' ordini' + (DATA.orders.length >= 100 ? ' (limite raggiunto — usa i filtri per esportare tutto)' : '') ,'success');
  });

  $(document).on('click','.js-export-products', function(){
    if (!DATA.products || !DATA.products.length){ toast('Nessun prodotto da esportare','info'); return; }
    var rows=[['ID','Nome','Categoria','Prezzo','Stock','Stato']];
    DATA.products.forEach(function(p){ rows.push([p.id,p.nome,p.cat,p.prezzo,p.stock,p.status]); });
    downloadCSV(rows,'prodotti');
    toast('CSV esportato: ' + DATA.products.length + ' prodotti','success');
  });

  $(document).on('click','.js-export-customers', function(){
    if (!DATA.customers || !DATA.customers.length){ toast('Nessun cliente da esportare','info'); return; }
    var rows=[['ID','Nome','Email','Ordini','Totale speso','VIP']];
    DATA.customers.forEach(function(c){ rows.push([c._db_id||c.id,c.nome,c.email,c.ordini,c.speso,c.vip?'Sì':'No']); });
    downloadCSV(rows,'clienti');
    toast('CSV esportato: ' + DATA.customers.length + ' clienti' + (DATA.customers.length >= 50 ? ' (limite raggiunto — usa la ricerca per filtrare)' : '') ,'success');
  });

  $(document).on('click','.js-export-invoices', function(){
    if (!DATA.invoices || !DATA.invoices.length){ toast('Nessuna fattura da esportare','info'); return; }
    var rows=[['N° Fattura','Ordine','Cliente','Email','Importo','Stato','Data']];
    DATA.invoices.forEach(function(i){ rows.push([i.invoice_number,i.order_number||i.order_id,(i.customer_nome||'')+' '+(i.customer_cognome||''),i.customer_email||'',i.total,i.stato,new Date(i.created_at).toLocaleDateString('it-IT')]); });
    downloadCSV(rows,'fatture');
    toast('CSV esportato: ' + DATA.invoices.length + ' fatture' + (DATA.invoices.length >= 200 ? ' (limite raggiunto)' : '') ,'success');
  });

  /* ═════════════════════════════════════════════
     PRODUCTS FILTER
     ═════════════════════════════════════════════ */
  $(document).on('change','#prodCatFilter, #prodStatusFilter', function(){
    var cat    = $('#prodCatFilter').val().toLowerCase();
    var status = $('#prodStatusFilter').val().toLowerCase();
    $('#productsArea .prod-card, #productsArea tbody tr').each(function(){
      var txt = $(this).text().toLowerCase();
      var okCat    = !cat    || txt.includes(cat);
      var okStatus = !status || txt.includes(status==='attivo'?'attiv':status==='bozza'?'bozza':status==='esaurito'?'esaur':status);
      $(this).toggle(okCat && okStatus);
    });
  });

  /* ═════════════════════════════════════════════
     INVENTORY STOCK UPDATE
     ═════════════════════════════════════════════ */
  $(document).on('click','.js-update-stock', function(){
    var id   = $(this).data('id');
    var nome = $(this).data('nome');
    if (!id || !window.AdminAPI) return;
    // Load current sizes from API
    AdminAPI.products.get(id).done(function(p){
      var taglie = (p.taglie && p.taglie.length) ? p.taglie : [];
      var rows = taglie.map(function(t){
        return '<tr><td style="padding:6px 8px;font-weight:600">'+t.taglia+'</td><td style="padding:6px 8px"><input type="number" min="0" class="stock-input field-input" data-taglia="'+t.taglia+'" value="'+t.stock+'" style="width:80px;padding:4px 8px;border:1px solid var(--line);border-radius:6px"/></td></tr>';
      }).join('');
      if(!rows) rows='<tr><td colspan="2" style="padding:16px;color:var(--muted);text-align:center">Nessuna taglia configurata. Usa Modifica prodotto.</td></tr>';
      openModal('Stock: '+nome, `
        <table style="width:100%;margin-bottom:16px"><thead><tr><th style="padding:4px 8px">Taglia</th><th style="padding:4px 8px">Stock</th></tr></thead><tbody>${rows}</tbody></table>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="btn btn-ghost btn-sm" onclick="closeModal()">Annulla</button>
          <button class="btn btn-primary btn-sm" id="saveStockBtn" data-id="${id}">💾 Salva stock</button>
        </div>
      `);
    }).fail(function(){ toast('Errore caricamento prodotto','error'); });
  });

  $(document).on('click','#saveStockBtn', function(){
    var id   = $(this).data('id');
    var $btn = $(this);
    var tasks= [];
    $('.stock-input').each(function(){
      var taglia= $(this).data('taglia');
      var stock = parseInt($(this).val());
      if(taglia && !isNaN(stock)) tasks.push({taglia:taglia,stock:stock});
    });
    if(!tasks.length){ closeModal(); return; }
    $btn.prop('disabled',true).text('Salvataggio…');
    var dfd = $.Deferred().resolve();
    tasks.forEach(function(t){
      dfd = dfd.then(function(){ return AdminAPI.products.updateStock(id,t.taglia,t.stock); });
    });
    dfd.done(function(){ toast('Stock aggiornato','success'); closeModal(); renderView('inventory'); })
       .fail(function(){ toast('Errore aggiornamento stock','error'); $btn.prop('disabled',false).text('💾 Salva stock'); });
  });

  /* ═════════════════════════════════════════════
     NUOVO CLIENTE
     ═════════════════════════════════════════════ */
  $(document).on('click','.js-new-customer', function(){
    openModal('Nuovo cliente', `
      <form id="newCustomerForm">
        <div class="kv" style="grid-template-columns:130px 1fr;gap:10px">
          <div class="k">Nome *</div><div class="v"><input type="text" name="nome" required placeholder="Nome" style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px"/></div>
          <div class="k">Cognome</div><div class="v"><input type="text" name="cognome" placeholder="Cognome" style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px"/></div>
          <div class="k">Email *</div><div class="v"><input type="email" name="email" required placeholder="email@esempio.it" style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px"/></div>
          <div class="k">Telefono</div><div class="v"><input type="tel" name="telefono" placeholder="+39..." style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px"/></div>
          <div class="k">Citta</div><div class="v"><input type="text" name="citta" placeholder="Citta" style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px"/></div>
          <div class="k">Password temp.</div><div class="v"><input type="password" name="password" placeholder="(auto-generata se vuoto)" style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px"/></div>
        </div>
        <div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">
          <button type="button" class="btn btn-ghost btn-sm" onclick="closeModal()">Annulla</button>
          <button type="submit" class="btn btn-primary btn-sm">+ Crea cliente</button>
        </div>
      </form>
    `);
    $('#newCustomerForm').on('submit',function(e){
      e.preventDefault();
      if(!window.AdminAPI) return;
      var fd   = Object.fromEntries(new FormData(this));
      var $btn = $(this).find('[type=submit]');
      $btn.prop('disabled',true).text('Creazione...');
      AdminAPI.customers.create({
        nome: fd.nome, cognome: fd.cognome||'', email: fd.email,
        telefono: fd.telefono||null, citta: fd.citta||null,
        password: fd.password||null
      }).done(function(){
        toast('Cliente creato','success'); closeModal(); renderView('customers');
      }).fail(function(xhr){
        var msg=(xhr.responseJSON&&xhr.responseJSON.error)||'Errore creazione';
        toast(msg,'error'); $btn.prop('disabled',false).text('+ Crea cliente');
      });
    });
  });

  /* ═════════════════════════════════════════════
     DELETE ORDER
     ═════════════════════════════════════════════ */
  $(document).on('click','.js-del-order', function(){
    var dbId    = $(this).data('id');
    var orderNr = $(this).data('order');
    if (!dbId || !window.AdminAPI){ toast('ID ordine non disponibile','error'); return; }
    if (!confirm('Eliminare definitivamente l\'ordine '+orderNr+'? L\'azione e\' irreversibile.')) return;
    AdminAPI.orders.delete(dbId)
      .done(function(){ toast('Ordine eliminato','success'); renderView('orders'); })
      .fail(function(xhr){ toast((xhr.responseJSON&&xhr.responseJSON.error)||'Errore eliminazione','error'); });
  });

  /* ═════════════════════════════════════════════
     PRINT ORDER ROW
     ═════════════════════════════════════════════ */
  $(document).on('click','.js-print-order-row', function(){
    var id = $(this).closest('tr').data('id');
    var o  = DATA.orders.find(function(x){ return x.id===id; });
    if (!o){ window.print(); return; }
    var win = window.open('','_blank');
    win.document.write('<html><body style="font-family:sans-serif;padding:30px">'+
      '<h2>Ordine '+o.id+'</h2>'+
      '<p><strong>Cliente:</strong> '+o.cliente+'</p>'+
      '<p><strong>Data:</strong> '+o.data+'</p>'+
      '<p><strong>Totale:</strong> '+o.totale+'</p>'+
      '<p><strong>Stato:</strong> '+o.stato+'</p>'+
      '<p><strong>Corriere:</strong> '+o.corriere+' - '+o.tracking+'</p>'+
      '</body></html>');
    win.document.close(); win.print();
  });

  /* ═════════════════════════════════════════════
     SEARCH: FATTURE
     ═════════════════════════════════════════════ */
  $(document).on('keyup','#invSearch', function(){
    var q=$(this).val().toLowerCase();
    $('#invoiceTable tbody tr').each(function(){ $(this).toggle($(this).text().toLowerCase().includes(q)); });
  });

  /* ═════════════════════════════════════════════
     INVOICES CRUD
     ═════════════════════════════════════════════ */
  $(document).on('click','.js-new-invoice', function(){
    openModal('Nuova fattura', '<form id="newInvoiceForm"><div class="kv" style="grid-template-columns:140px 1fr;gap:10px;align-items:center">'+
      '<div class="k">Ordine *</div><div class="v">'+orderPickerHtml()+'</div>'+
      '<div class="k">Scadenza</div><div class="v"><input type="date" name="due_date" style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px"/></div>'+
      '<div class="k">Aliquota IVA %</div><div class="v"><input type="number" name="tax_rate" value="22" min="0" max="100" style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px"/></div>'+
      '<div class="k">C.F. cliente</div><div class="v"><input type="text" name="customer_cf" placeholder="(opzionale)" style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px"/></div>'+
      '<div class="k">Note</div><div class="v"><textarea name="note" rows="2" style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px"></textarea></div>'+
      '</div><div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">'+
      '<button type="button" class="btn btn-ghost btn-sm" onclick="closeModal()">Annulla</button>'+
      '<button type="submit" class="btn btn-primary btn-sm">Emetti fattura</button></div></form>');
    wireOrderPicker();
    $('#newInvoiceForm').on('submit',function(e){
      e.preventDefault();
      if(!window.AdminAPI) return;
      var fd=Object.fromEntries(new FormData(this));
      if(!fd.order_id){ toast('Seleziona un ordine','info'); return; }
      var $btn=$(this).find('[type=submit]');
      $btn.prop('disabled',true).text('Emissione...');
      AdminAPI.invoices.create({
        order_id: fd.order_id, due_date: fd.due_date||null,
        tax_rate: parseFloat(fd.tax_rate)||22,
        customer_cf: fd.customer_cf||null, note: fd.note||null
      }).done(function(){
        toast('Fattura emessa','success'); closeModal(); renderView('invoices');
      }).fail(function(xhr){
        var msg=(xhr.responseJSON&&xhr.responseJSON.error)||'Errore emissione';
        toast(msg,'error'); $btn.prop('disabled',false).text('Emetti fattura');
      });
    });
  });

  $(document).on('click','.js-view-invoice', function(){
    var id=$(this).data('id');
    if(!id||!window.AdminAPI) return;
    AdminAPI.invoices.get(id).done(function(inv){
      var items=(inv.items||[]).map(function(i){ return '<tr><td>'+i.product_name+'</td><td style="text-align:center">'+(i.taglia||'-')+'</td><td style="text-align:center">'+i.qty+'</td><td style="text-align:right">EUR '+parseFloat(i.price||0).toFixed(2).replace('.',',')+'</td></tr>'; }).join('');
      var statoOpts=['bozza','emessa','inviata','pagata','annullata'].map(function(s){ return '<option value="'+s+'"'+(inv.stato===s?' selected':'')+'>'+s+'</option>'; }).join('');
      openModal('Fattura '+inv.invoice_number,
        '<div class="kv" style="grid-template-columns:130px 1fr;gap:8px">'+
        '<div class="k">N Fattura</div><div class="v"><strong>'+inv.invoice_number+'</strong></div>'+
        '<div class="k">Ordine</div><div class="v">'+(inv.order_number||inv.order_id)+'</div>'+
        '<div class="k">Cliente</div><div class="v">'+((inv.customer_nome||'')+' '+(inv.customer_cognome||''))+'</div>'+
        '<div class="k">Importo</div><div class="v"><strong>EUR '+parseFloat(inv.total||0).toFixed(2).replace('.',',')+'</strong></div>'+
        '<div class="k">Stato</div><div class="v"><select id="invStatoSel" style="padding:4px 8px;border:1px solid var(--line);border-radius:6px">'+statoOpts+'</select></div>'+
        '</div>'+
        (items?'<div style="margin-top:12px"><table class="data" style="width:100%"><thead><tr><th>Prodotto</th><th>Taglia</th><th>Qty</th><th>Prezzo</th></tr></thead><tbody>'+items+'</tbody></table></div>':'')+
        '<div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end">'+
        '<button class="btn btn-ghost btn-sm" onclick="closeModal()">Chiudi</button>'+
        '<button class="btn btn-primary btn-sm js-save-inv-stato" data-id="'+inv.id+'">Salva stato</button></div>'
      );
    }).fail(function(){ toast('Errore caricamento fattura','error'); });
  });

  $(document).on('click','.js-save-inv-stato', function(){
    var id=$(this).data('id');
    var stato=$('#invStatoSel').val();
    var $btn=$(this);
    $btn.prop('disabled',true).text('Salvataggio...');
    AdminAPI.invoices.update(id,{stato:stato})
      .done(function(){ toast('Stato fattura aggiornato','success'); closeModal(); renderView('invoices'); })
      .fail(function(){ toast('Errore','error'); $btn.prop('disabled',false).text('Salva stato'); });
  });

  $(document).on('click','.js-inv-stato', function(){
    var id=$(this).data('id'), stato=$(this).data('stato');
    if(!id||!window.AdminAPI) return;
    AdminAPI.invoices.update(id,{stato:stato})
      .done(function(){ toast('Fattura aggiornata','success'); renderView('invoices'); })
      .fail(function(){ toast('Errore','error'); });
  });

  $(document).on('click','.js-del-invoice', function(){
    var id=$(this).data('id');
    if(!id||!window.AdminAPI) return;
    if(!confirm('Eliminare questa fattura?')) return;
    AdminAPI.invoices.delete(id)
      .done(function(){ toast('Fattura eliminata','success'); renderView('invoices'); })
      .fail(function(){ toast('Errore eliminazione','error'); });
  });

  /* ═════════════════════════════════════════════
     RESI CRUD
     ═════════════════════════════════════════════ */
  $(document).on('click','.js-new-reso', function(){
    function buildResoModal(orders){
    var orderOpts=(orders||[]).map(function(o){ return '<option value="'+(o._db_id||'')+'">'+o.id+' - '+o.cliente+'</option>'; }).join('');
    openModal('Nuovo reso',
      '<form id="newResoForm"><div class="kv" style="grid-template-columns:130px 1fr;gap:10px">'+
      '<div class="k">Ordine *</div><div class="v"><select name="order_id" required style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px"><option value="">- Seleziona ordine -</option>'+orderOpts+'</select></div>'+
      '<div class="k">Motivo *</div><div class="v"><select name="motivo" required style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px">'+
      '<option>Taglia errata</option><option>Difetto di produzione</option><option>Non corrispondente alla descrizione</option>'+
      '<option>Non gradito</option><option>Danneggiato alla consegna</option><option>Altro</option></select></div>'+
      '<div class="k">Descrizione</div><div class="v"><textarea name="descrizione" rows="3" style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px"></textarea></div>'+
      '</div><div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">'+
      '<button type="button" class="btn btn-ghost btn-sm" onclick="closeModal()">Annulla</button>'+
      '<button type="submit" class="btn btn-primary btn-sm">Apri reso</button></div></form>');
    $('#newResoForm').on('submit',function(e){
      e.preventDefault();
      if(!window.AdminAPI) return;
      var fd=Object.fromEntries(new FormData(this));
      var $btn=$(this).find('[type=submit]');
      $btn.prop('disabled',true).text('Creazione...');
      AdminAPI.resi.create({order_id:fd.order_id,motivo:fd.motivo,descrizione:fd.descrizione||null})
        .done(function(){ toast('Reso aperto','success'); closeModal(); renderView('returns'); })
        .fail(function(xhr){ var msg=(xhr.responseJSON&&xhr.responseJSON.error)||'Errore'; toast(msg,'error'); $btn.prop('disabled',false).text('Apri reso'); });
    });
    }
    // Works even on direct navigation/refresh: load orders on demand if not cached.
    if (DATA.orders && DATA.orders.length) { buildResoModal(DATA.orders); return; }
    if (!window.AdminAPI) { buildResoModal([]); return; }
    AdminAPI.orders.list().done(function(res){
      var raw = (res && res.orders) ? res.orders : (Array.isArray(res) ? res : []);
      var mapped = raw.map(function(o){
        return { _db_id: o.id, id: o.order_number || ('#'+o.id),
                 cliente: ((o.customer_nome||'')+' '+(o.customer_cognome||'')).trim() || (o.customer_email||'') };
      });
      DATA.orders = (DATA.orders && DATA.orders.length) ? DATA.orders : mapped;
      buildResoModal(mapped);
    }).fail(function(){ buildResoModal([]); });
  });

  $(document).on('click','.js-view-reso', function(){
    var id=$(this).data('id');
    if(!id||!window.AdminAPI) return;
    AdminAPI.resi.get(id).done(function(r){
      var items=(r.items||[]).map(function(i){ return '<tr><td>'+i.product_name+'</td><td>'+(i.taglia||'-')+'</td><td>'+i.qty+'</td><td>EUR '+parseFloat(i.price||0).toFixed(2).replace('.',',')+'</td></tr>'; }).join('');
      var statoOpts=['aperto','in_analisi','approvato','rifiutato','rimborsato'].map(function(s){ return '<option value="'+s+'"'+(r.stato===s?' selected':'')+'>'+(AdminAPI?AdminAPI.statusLabel(s):s)+'</option>'; }).join('');
      openModal('Reso '+r.rma_number,
        '<div class="kv" style="grid-template-columns:130px 1fr;gap:8px">'+
        '<div class="k">RMA</div><div class="v"><strong>'+r.rma_number+'</strong></div>'+
        '<div class="k">Ordine</div><div class="v">'+(r.order_number||('#'+r.order_id))+'</div>'+
        '<div class="k">Motivo</div><div class="v">'+(r.motivo||'-')+'</div>'+
        '<div class="k">Descrizione</div><div class="v">'+(r.descrizione||'-')+'</div>'+
        '<div class="k">Stato</div><div class="v"><select id="resoStatoSel" style="padding:4px 8px;border:1px solid var(--line);border-radius:6px">'+statoOpts+'</select></div>'+
        '<div class="k">Rimborso EUR</div><div class="v"><input type="number" id="resoRimborso" step="0.01" min="0" value="'+(r.rimborso_amount||'')+'" placeholder="(vuoto = nessuno)" style="padding:4px 8px;border:1px solid var(--line);border-radius:6px;width:120px"/></div>'+
        '</div>'+
        (items?'<div style="margin-top:12px"><table class="data" style="width:100%"><thead><tr><th>Prodotto</th><th>Taglia</th><th>Qty</th><th>Prezzo</th></tr></thead><tbody>'+items+'</tbody></table></div>':'')+
        '<div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end">'+
        '<button class="btn btn-ghost btn-sm" onclick="closeModal()">Chiudi</button>'+
        ((r.payment_intent_id && r.stato !== 'rimborsato') ? '<button class="btn btn-soft btn-sm js-refund-reso" data-id="'+r.id+'" data-total="'+(r.order_total||0)+'">💳 Rimborsa via Stripe</button>' : '')+
        '<button class="btn btn-primary btn-sm js-save-reso" data-id="'+r.id+'">Aggiorna reso</button></div>'
      );
    }).fail(function(){ toast('Errore caricamento reso','error'); });
  });

  $(document).on('click','.js-save-reso', function(){
    var id=$(this).data('id');
    var stato=$('#resoStatoSel').val();
    var rimborso=$('#resoRimborso').val();
    var $btn=$(this);
    $btn.prop('disabled',true).text('Salvataggio...');
    AdminAPI.resi.update(id,{stato:stato,rimborso_amount:rimborso?parseFloat(rimborso):null})
      .done(function(){ toast('Reso aggiornato','success'); closeModal(); renderView('returns'); })
      .fail(function(){ toast('Errore','error'); $btn.prop('disabled',false).text('Aggiorna reso'); });
  });

  $(document).on('click','.js-refund-reso', function(){
    var id=$(this).data('id');
    var total=parseFloat($(this).data('total'))||0;
    var input=$('#resoRimborso').val();
    var amount = input ? parseFloat(input) : total;
    if (!(amount > 0)) amount = total;
    if (!confirm('Emettere un rimborso Stripe di EUR '+amount.toFixed(2)+'? Operazione irreversibile.')) return;
    var $btn=$(this);
    $btn.prop('disabled',true).text('Rimborso...');
    AdminAPI.resi.refund(id, amount)
      .done(function(res){ toast('Rimborso eseguito'+((res&&res.warning)?': '+res.warning:''),'success'); closeModal(); renderView('returns'); })
      .fail(function(xhr){ var m=(xhr.responseJSON&&xhr.responseJSON.error)||'Errore rimborso'; toast(m,'error'); $btn.prop('disabled',false).text('💳 Rimborsa via Stripe'); });
  });

  $(document).on('click','.js-del-reso', function(){
    var id=$(this).data('id'), rma=$(this).data('rma');
    if(!id||!window.AdminAPI) return;
    if(!confirm('Eliminare il reso '+rma+'?')) return;
    AdminAPI.resi.delete(id)
      .done(function(){ toast('Reso eliminato','success'); renderView('returns'); })
      .fail(function(){ toast('Errore eliminazione','error'); });
  });

  /* ═════════════════════════════════════════════
     REVIEWS CRUD
     ═════════════════════════════════════════════ */
  $(document).on('click','.js-approve-review', function(){
    var id=$(this).data('id');
    if(!id||!window.AdminAPI) return;
    AdminAPI.reviews.update(id,{stato:'pubblicata'})
      .done(function(){ toast('Recensione pubblicata','success'); renderView('reviews'); })
      .fail(function(){ toast('Errore','error'); });
  });

  $(document).on('click','.js-reject-review', function(){
    var id=$(this).data('id');
    if(!id||!window.AdminAPI) return;
    AdminAPI.reviews.update(id,{stato:'rifiutata'})
      .done(function(){ toast('Recensione rifiutata','info'); renderView('reviews'); })
      .fail(function(){ toast('Errore','error'); });
  });

  $(document).on('click','.js-del-review', function(){
    var id=$(this).data('id');
    if(!id||!window.AdminAPI) return;
    if(!confirm('Eliminare questa recensione?')) return;
    AdminAPI.reviews.delete(id)
      .done(function(){ toast('Recensione eliminata','success'); renderView('reviews'); })
      .fail(function(){ toast('Errore eliminazione','error'); });
  });

  $(document).on('click','.js-filter-reviews', function(){
    var stato=$(this).data('stato');
    if(stato){
      $('#reviewsTable tbody tr').each(function(){
        $(this).toggle($(this).text().toLowerCase().includes(stato.replace('_',' ')));
      });
    } else {
      $('#reviewsTable tbody tr').show();
    }
  });

  /* ═════════════════════════════════════════════
     SHIP ORDER
     ═════════════════════════════════════════════ */
  $(document).on('click','.js-open-ship-modal', function(){
    var dbId    = $(this).data('id');
    var orderNr = $(this).data('order');
    var payment = String($(this).data('payment') || '');
    var alreadyPaid = /pagat/i.test(payment) || /rimbors/i.test(payment);
    var couriers = DATA.couriers && DATA.couriers.length ? DATA.couriers : [
      {code:'sda',nome:'SDA'},{code:'brt',nome:'BRT'},{code:'gls',nome:'GLS'},
      {code:'poste',nome:'Poste Italiane'},{code:'dhl',nome:'DHL'}
    ];
    var courierOpts = couriers.map(function(c){ return '<option value="'+c.code+'">'+c.nome+'</option>'; }).join('');
    openModal('Spedisci ordine '+orderNr,
      '<form id="shipForm"><div class="kv" style="grid-template-columns:130px 1fr;gap:10px">'+
      '<div class="k">Corriere *</div><div class="v"><select name="courier_code" required style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px">'+courierOpts+'</select></div>'+
      '<div class="k">Tracking # *</div><div class="v"><input type="text" name="tracking_number" required placeholder="es. SDA1234567890" style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px"/></div>'+
      '<div class="k">Destinazione</div><div class="v"><input type="text" name="destinazione" placeholder="es. Roma (RM)" style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px"/></div>'+
      '<div class="k">ETA</div><div class="v"><input type="date" name="eta" style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px"/></div>'+
      '</div>'+
      (alreadyPaid ? '' :
        '<label style="display:flex;align-items:center;gap:8px;margin-top:14px;font-size:13px;cursor:pointer">'+
        '<input type="checkbox" name="mark_paid" value="1"/> Segna anche come pagato (pagamento attuale: '+(payment||'sconosciuto')+')'+
        '</label>'
      )+
      '<p style="margin-top:10px;font-size:12px;color:var(--muted)">Lo stato ordine verrà impostato a Spedito. '+
      (alreadyPaid ? 'Il pagamento risulta già ' + payment + ' e non verrà modificato.' : 'Il pagamento resta invariato a meno che tu non spunti la casella sopra.')+
      '</p>'+
      '<div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">'+
      '<button type="button" class="btn btn-ghost btn-sm" onclick="closeModal()">Annulla</button>'+
      '<button type="submit" class="btn btn-primary btn-sm">Conferma spedizione</button></div></form>'
    );
    $('#shipForm').on('submit', function(e){
      e.preventDefault();
      if (!window.AdminAPI) return;
      var fd   = Object.fromEntries(new FormData(this));
      var $btn = $(this).find('[type=submit]');
      $btn.prop('disabled', true).text('Invio...');
      var finish = function(){
        toast('Ordine spedito', 'success');
        closeModal();
        renderView('orders');
      };
      AdminAPI.orders.ship(dbId, {
        courier_code:    fd.courier_code,
        tracking_number: fd.tracking_number,
        destinazione:    fd.destinazione || null,
        eta:             fd.eta || null,
      }).done(function(){
        if (fd.mark_paid) {
          AdminAPI.orders.updateStatus(dbId, { payment_status: 'pagato' }).always(finish);
        } else {
          finish();
        }
      }).fail(function(xhr){
        var msg = (xhr.responseJSON && xhr.responseJSON.error) || 'Errore spedizione';
        toast(msg, 'error');
        $btn.prop('disabled', false).text('Conferma spedizione');
      });
    });
  });

  /* ═════════════════════════════════════════════
     SETTINGS SAVE
     ═════════════════════════════════════════════ */
  $(document).on('click','.js-save-settings', function(){
    if (!window.AdminAPI) return;
    var data = {};
    $('.settings-input').each(function(){ data[$(this).data('key')] = $(this).val(); });
    var $btn = $(this);
    $btn.prop('disabled', true).text('Salvataggio...');
    AdminAPI.settings.update(data)
      .done(function(saved){
        DATA.settings = saved;
        toast('Impostazioni salvate', 'success');
      })
      .fail(function(){ toast('Errore salvataggio', 'error'); })
      .always(function(){ $btn.prop('disabled', false).text('💾 Salva'); });
  });

  /* ═════════════════════════════════════════════
     STAFF – new
     ═════════════════════════════════════════════ */
  $(document).on('click','.js-new-staff', function(){
    openModal('Nuovo account staff',
      '<form id="newStaffForm"><div class="kv" style="grid-template-columns:120px 1fr;gap:10px">'+
      '<div class="k">Nome</div><div class="v"><input type="text" name="nome" placeholder="Nome cognome" style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px"/></div>'+
      '<div class="k">Email *</div><div class="v"><input type="email" name="email" required placeholder="staff@memi.it" style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px"/></div>'+
      '<div class="k">Password *</div><div class="v"><input type="password" name="password" required placeholder="Min 8 caratteri" style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px"/></div>'+
      '<div class="k">Ruolo</div><div class="v"><select name="role" style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px"><option value="staff">Staff</option><option value="admin">Admin</option></select></div>'+
      '</div><div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">'+
      '<button type="button" class="btn btn-ghost btn-sm" onclick="closeModal()">Annulla</button>'+
      '<button type="submit" class="btn btn-primary btn-sm">Crea account</button></div></form>'
    );
    $('#newStaffForm').on('submit', function(e){
      e.preventDefault();
      if (!window.AdminAPI) return;
      var fd = Object.fromEntries(new FormData(this));
      var $btn = $(this).find('[type=submit]');
      $btn.prop('disabled', true).text('Creazione...');
      AdminAPI.staff.create({ nome: fd.nome, email: fd.email, password: fd.password, role: fd.role })
        .done(function(){ toast('Account creato', 'success'); closeModal(); renderView('staff'); })
        .fail(function(xhr){ var msg=(xhr.responseJSON&&xhr.responseJSON.error)||'Errore'; toast(msg,'error'); $btn.prop('disabled',false).text('Crea account'); });
    });
  });

  /* ═════════════════════════════════════════════
     STAFF – edit
     ═════════════════════════════════════════════ */
  $(document).on('click','.js-edit-staff', function(){
    var id    = $(this).data('id');
    var nome  = $(this).data('nome');
    var email = $(this).data('email');
    var role  = $(this).data('role');
    openModal('Modifica staff',
      '<form id="editStaffForm"><div class="kv" style="grid-template-columns:120px 1fr;gap:10px">'+
      '<div class="k">Nome</div><div class="v"><input type="text" name="nome" value="'+nome+'" style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px"/></div>'+
      '<div class="k">Email</div><div class="v"><input type="email" name="email" value="'+email+'" style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px"/></div>'+
      '<div class="k">Nuova password</div><div class="v"><input type="password" name="password" placeholder="(lascia vuoto per non cambiare)" style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px"/></div>'+
      '<div class="k">Ruolo</div><div class="v"><select name="role" style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px">'+
        '<option value="staff"'+(role==='staff'?' selected':'')+'>Staff</option>'+
        '<option value="admin"'+(role==='admin'?' selected':'')+'>Admin</option>'+
      '</select></div>'+
      '</div><div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">'+
      '<button type="button" class="btn btn-ghost btn-sm" onclick="closeModal()">Annulla</button>'+
      '<button type="submit" class="btn btn-primary btn-sm">Salva</button></div></form>'
    );
    $('#editStaffForm').on('submit', function(e){
      e.preventDefault();
      if (!window.AdminAPI) return;
      var fd = Object.fromEntries(new FormData(this));
      var payload = { nome: fd.nome, email: fd.email, role: fd.role };
      if (fd.password) payload.password = fd.password;
      var $btn = $(this).find('[type=submit]');
      $btn.prop('disabled', true).text('Salvataggio...');
      AdminAPI.staff.update(id, payload)
        .done(function(){ toast('Account aggiornato', 'success'); closeModal(); renderView('staff'); })
        .fail(function(xhr){ var msg=(xhr.responseJSON&&xhr.responseJSON.error)||'Errore'; toast(msg,'error'); $btn.prop('disabled',false).text('Salva'); });
    });
  });

  /* ═════════════════════════════════════════════
     STAFF – delete
     ═════════════════════════════════════════════ */
  $(document).on('click','.js-del-staff', function(){
    var id   = $(this).data('id');
    var nome = $(this).data('nome');
    if (!id || !window.AdminAPI) return;
    if (!confirm('Eliminare account di ' + nome + '? Irreversibile.')) return;
    AdminAPI.staff.delete(id)
      .done(function(){ toast('Account eliminato', 'success'); renderView('staff'); })
      .fail(function(xhr){ toast((xhr.responseJSON&&xhr.responseJSON.error)||'Errore', 'error'); });
  });

  /* ═════════════════════════════════════════════
     NEW FEATURE HANDLERS (gift cards, campaigns, CMS,
     pickup, couriers, shipments, theme, apps, reports…)
     ═════════════════════════════════════════════ */
  var inputCss = 'width:100%;padding:7px 10px;border:1px solid var(--line);border-radius:6px;font-family:inherit;font-size:13px';
  function fieldRow(label, inner){ return '<div class="k">'+label+'</div><div class="v">'+inner+'</div>'; }
  function modalForm(formId, rowsHtml, submitLabel){
    return '<form id="'+formId+'"><div class="kv" style="grid-template-columns:140px 1fr;gap:10px;align-items:center">'+rowsHtml+'</div>'+
      '<div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end">'+
      '<button type="button" class="btn btn-ghost btn-sm" onclick="closeModal()">Annulla</button>'+
      '<button type="submit" class="btn btn-primary btn-sm">'+(submitLabel||'Salva')+'</button></div></form>';
  }
  function apiReady(){ if(!window.AdminAPI){ toast('API non disponibile','error'); return false; } return true; }

  /* ── Reusable CATALOG PRODUCT PICKER ──────────────────────────
     Type to search /api/products, click a result to add it as a line.
     The admin never types product names/prices by hand — only real
     catalogue products can be attached. Returns {getItems, count}.    */
  function productPickerHtml(){
    return '<div class="prod-picker">'+
      '<input type="text" id="pickerSearch" autocomplete="off" placeholder="Cerca un prodotto del catalogo…" style="'+inputCss+'"/>'+
      '<div id="pickerResults" style="display:none;max-height:190px;overflow:auto;border:1px solid var(--line);border-radius:6px;margin-top:4px"></div>'+
      '<div id="pickerSelected" style="margin-top:8px;display:flex;flex-direction:column;gap:6px"></div>'+
    '</div>';
  }
  function wireProductPicker(){
    var selected = [];
    var $search=$('#pickerSearch'), $results=$('#pickerResults'), $sel=$('#pickerSelected'), t;
    function renderSelected(){
      if(!selected.length){ $sel.html('<p style="color:var(--muted);font-size:12px">Nessun prodotto selezionato.</p>'); return; }
      $sel.html(selected.map(function(s,i){
        return '<div style="display:flex;align-items:center;gap:8px;border:1px solid var(--line);border-radius:6px;padding:6px 8px">'+
          '<span style="flex:1;font-size:13px">'+s.name+'</span>'+
          '<span style="color:var(--muted);font-size:12px">€ '+Number(s.price).toFixed(2)+'</span>'+
          '<input type="number" min="1" value="'+s.qty+'" class="pk-qty" data-i="'+i+'" style="width:56px;padding:4px 6px;border:1px solid var(--line);border-radius:6px"/>'+
          '<button type="button" class="pk-rm" data-i="'+i+'" title="Rimuovi" style="color:var(--danger)">✕</button>'+
        '</div>';
      }).join(''));
    }
    renderSelected();
    $search.on('input', function(){
      var q=$(this).val().trim(); clearTimeout(t);
      if(!q){ $results.hide().empty(); return; }
      t=setTimeout(function(){
        AdminAPI.products.list({ q:q, status:'all' }).done(function(list){
          if(!Array.isArray(list)) list=(list&&list.products)||[];
          if(!list.length){ $results.html('<div style="padding:8px;color:var(--muted);font-size:12px">Nessun prodotto in catalogo per “'+q+'”</div>').show(); return; }
          $results.html(list.slice(0,8).map(function(p){
            return '<div class="pk-res" data-id="'+p.id+'" data-name="'+(p.name||'').replace(/"/g,'&quot;')+'" data-price="'+(Number(p.price)||0)+'" style="padding:7px 10px;cursor:pointer;border-bottom:1px solid var(--line-2);font-size:13px;display:flex;justify-content:space-between"><span>'+p.name+'</span><span style="color:var(--muted)">€ '+(Number(p.price)||0).toFixed(2)+'</span></div>';
          }).join('')).show();
        }).fail(function(){ $results.html('<div style="padding:8px;color:var(--muted);font-size:12px">Errore ricerca</div>').show(); });
      }, 250);
    });
    $results.on('click','.pk-res', function(){
      var id=$(this).data('id');
      if(!selected.some(function(s){ return String(s.id)===String(id); })){
        selected.push({ id:id, name:$(this).data('name'), price:$(this).data('price'), qty:1 });
        renderSelected();
      }
      $search.val('').focus(); $results.hide().empty();
    });
    $sel.on('input','.pk-qty', function(){ var i=$(this).data('i'); selected[i].qty=Math.max(1,parseInt($(this).val())||1); });
    $sel.on('click','.pk-rm', function(){ var i=$(this).data('i'); selected.splice(i,1); renderSelected(); });
    return { getItems:function(){ return selected.map(function(s){ return { product_id:s.id, qty:s.qty }; }); }, count:function(){ return selected.length; } };
  }

  /* ── Reusable ORDER PICKER (single select, live search) ──────
     Search existing orders by number/customer and pick one. Used by the
     invoice and shipment modals so the admin never types an order id.   */
  function orderPickerHtml(){
    return '<div class="order-picker">'+
      '<input type="text" id="orderPickSearch" autocomplete="off" placeholder="Cerca ordine per numero o cliente…" style="'+inputCss+'"/>'+
      '<div id="orderPickResults" style="display:none;max-height:190px;overflow:auto;border:1px solid var(--line);border-radius:6px;margin-top:4px"></div>'+
      '<div id="orderPickSelected" style="margin-top:6px"></div>'+
      '<input type="hidden" id="orderPickId" name="order_id"/>'+
    '</div>';
  }
  function wireOrderPicker(onPick){
    var $search=$('#orderPickSearch'), $results=$('#orderPickResults'), $sel=$('#orderPickSelected'), $hid=$('#orderPickId'), t;
    $search.on('input', function(){
      var q=$(this).val().trim(); clearTimeout(t);
      if(!q){ $results.hide().empty(); return; }
      t=setTimeout(function(){
        AdminAPI.orders.list({ q:q, limit:20 }).done(function(data){
          var list=(data&&data.orders)?data.orders:(Array.isArray(data)?data:[]);
          if(!list.length){ $results.html('<div style="padding:8px;color:var(--muted);font-size:12px">Nessun ordine per “'+q+'”</div>').show(); return; }
          $results.html(list.slice(0,10).map(function(o){
            var nome=((o.customer_nome||'')+' '+(o.customer_cognome||'')).trim()||'—';
            var label=(o.order_number||('#'+o.id))+' · '+nome+' · € '+(Number(o.total)||0).toFixed(2);
            return '<div class="op-res" data-id="'+o.id+'" data-label="'+label.replace(/"/g,'&quot;')+'" style="padding:7px 10px;cursor:pointer;border-bottom:1px solid var(--line-2);font-size:13px">'+label+'</div>';
          }).join('')).show();
        }).fail(function(){ $results.html('<div style="padding:8px;color:var(--muted);font-size:12px">Errore ricerca</div>').show(); });
      }, 250);
    });
    $results.on('click','.op-res', function(){
      var id=$(this).data('id'), label=$(this).data('label');
      $hid.val(id);
      $sel.html('<div style="display:flex;align-items:center;gap:8px;border:1px solid var(--line);border-radius:6px;padding:6px 8px"><span style="flex:1;font-size:13px">'+label+'</span><button type="button" class="op-clear" title="Cambia" style="color:var(--danger)">✕</button></div>');
      $search.val('').hide(); $results.hide().empty();
      if(typeof onPick==='function') onPick(id);
    });
    $sel.on('click','.op-clear', function(){ $hid.val(''); $sel.empty(); $search.show().val('').focus(); });
  }

  /* ── New manual order (catalog-driven) ── */
  $(document).on('click','.js-new-order', function(){
    openModal('Nuovo ordine manuale',
      '<form id="newOrderForm"><div class="kv" style="grid-template-columns:130px 1fr;gap:10px;align-items:center">'+
        fieldRow('Nome cliente *','<input name="nome" required placeholder="Mario" style="'+inputCss+'"/>')+
        fieldRow('Cognome','<input name="cognome" placeholder="Rossi" style="'+inputCss+'"/>')+
        fieldRow('Email *','<input type="email" name="email" required placeholder="cliente@mail.it" style="'+inputCss+'"/>')+
        fieldRow('Spedizione (EUR)','<input type="number" step="0.01" min="0" name="shipping_cost" value="0" style="'+inputCss+'"/>')+
        fieldRow('Pagamento','<select name="payment_status" style="'+inputCss+'"><option value="in_attesa">In attesa</option><option value="pagato">Pagato</option></select>')+
      '</div>'+
      '<div style="margin-top:14px"><div style="font-size:13px;font-weight:600;margin-bottom:6px">Prodotti dal catalogo *</div>'+productPickerHtml()+'</div>'+
      '<div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn btn-ghost btn-sm" onclick="closeModal()">Annulla</button><button type="submit" class="btn btn-primary btn-sm">Crea ordine</button></div></form>');
    var picker = wireProductPicker();
    $('#newOrderForm').on('submit', function(e){
      e.preventDefault(); if(!apiReady()) return;
      var items = picker.getItems();
      if(!items.length){ toast('Seleziona almeno un prodotto dal catalogo','info'); return; }
      var fd = Object.fromEntries(new FormData(this));
      var $btn=$(this).find('[type=submit]'); $btn.prop('disabled',true).text('Creazione...');
      AdminAPI.orders.create({
        nome:fd.nome, cognome:fd.cognome||'', email:fd.email,
        shipping_cost:fd.shipping_cost||0, payment_status:fd.payment_status||'in_attesa',
        items: items
      }).done(function(r){ toast('Ordine '+(r.order_number||'')+' creato','success'); closeModal(); renderView('orders'); })
        .fail(function(x){ toast((x.responseJSON&&x.responseJSON.error)||'Errore creazione ordine','error'); $btn.prop('disabled',false).text('Crea ordine'); });
    });
  });

  /* ── Gift cards ── */
  $(document).on('click','.js-new-giftcard', function(){
    openModal('Emetti gift card',
      modalForm('newGiftForm',
        fieldRow('Importo (EUR) *','<input type="number" step="0.01" min="1" name="initial_amount" required placeholder="50.00" style="'+inputCss+'"/>')+
        fieldRow('Email destinatario','<input type="email" name="recipient_email" placeholder="(facoltativa)" style="'+inputCss+'"/>')+
        fieldRow('Note','<input name="note" placeholder="(facoltative)" style="'+inputCss+'"/>'),
        'Emetti'));
    $('#newGiftForm').on('submit', function(e){
      e.preventDefault(); if(!apiReady()) return;
      var fd=Object.fromEntries(new FormData(this));
      var $btn=$(this).find('[type=submit]'); $btn.prop('disabled',true).text('Emissione...');
      AdminAPI.giftcards.create(fd).done(function(r){ toast('Gift card '+r.code+' emessa','success'); closeModal(); renderView('giftcards'); })
        .fail(function(x){ toast((x.responseJSON&&x.responseJSON.error)||'Errore','error'); $btn.prop('disabled',false).text('Emetti'); });
    });
  });
  $(document).on('click','.js-toggle-giftcard', function(){
    if(!apiReady()) return;
    var id=$(this).data('id'); var cur=$(this).data('stato');
    var next = cur==='disattivata' ? 'attiva' : 'disattivata';
    AdminAPI.giftcards.update(id,{stato:next}).done(function(){ toast('Gift card aggiornata','success'); renderView('giftcards'); })
      .fail(function(){ toast('Errore','error'); });
  });
  $(document).on('click','.js-del-giftcard', function(){
    if(!apiReady()) return;
    var id=$(this).data('id'); var code=$(this).data('code');
    if(!confirm('Eliminare la gift card '+code+'?')) return;
    AdminAPI.giftcards.delete(id).done(function(){ toast('Gift card eliminata','success'); renderView('giftcards'); })
      .fail(function(){ toast('Errore','error'); });
  });

  /* ── Campaigns ── */
  function campaignForm(formId, data){
    data = data || {};
    var opt=function(v,l,sel){ return '<option value="'+v+'"'+(sel===v?' selected':'')+'>'+l+'</option>'; };
    return modalForm(formId,
      fieldRow('Nome *','<input name="nome" required value="'+(data.nome||'').replace(/"/g,'&quot;')+'" placeholder="Saldi estate" style="'+inputCss+'"/>')+
      fieldRow('Tipo','<select name="tipo" style="'+inputCss+'">'+opt('email','Email',data.tipo)+opt('ads','Ads',data.tipo)+opt('automazione','Automazione',data.tipo)+opt('sms','SMS',data.tipo)+'</select>')+
      fieldRow('Canale','<input name="canale" value="'+(data.canale||'')+'" placeholder="es. Meta, Klaviyo" style="'+inputCss+'"/>')+
      fieldRow('Budget (EUR)','<input type="number" step="0.01" min="0" name="budget" value="'+(data.budget||0)+'" style="'+inputCss+'"/>')+
      fieldRow('Destinatari','<input type="number" min="0" name="destinatari" value="'+(data.destinatari||0)+'" style="'+inputCss+'"/>')+
      fieldRow('Stato','<select name="stato" style="'+inputCss+'">'+opt('bozza','Bozza',data.stato)+opt('attiva','Attiva',data.stato)+opt('pianificata','Pianificata',data.stato)+opt('conclusa','Conclusa',data.stato)+'</select>'),
      data.id?'Salva':'Crea campagna');
  }
  $(document).on('click','.js-new-campaign', function(){
    openModal('Nuova campagna', campaignForm('newCampaignForm'));
    $('#newCampaignForm').on('submit', function(e){
      e.preventDefault(); if(!apiReady()) return;
      var fd=Object.fromEntries(new FormData(this));
      AdminAPI.campaigns.create(fd).done(function(){ toast('Campagna creata','success'); closeModal(); renderView('marketing'); })
        .fail(function(x){ toast((x.responseJSON&&x.responseJSON.error)||'Errore','error'); });
    });
  });
  $(document).on('click','.js-edit-campaign', function(){
    if(!apiReady()) return;
    var id=$(this).data('id');
    var c=(DATA.campaigns||[]).find(function(x){ return String(x.id)===String(id); })||{};
    openModal('Modifica campagna', campaignForm('editCampaignForm', c));
    $('#editCampaignForm').on('submit', function(e){
      e.preventDefault();
      var fd=Object.fromEntries(new FormData(this));
      AdminAPI.campaigns.update(id,fd).done(function(){ toast('Campagna aggiornata','success'); closeModal(); renderView('marketing'); })
        .fail(function(x){ toast((x.responseJSON&&x.responseJSON.error)||'Errore','error'); });
    });
  });
  $(document).on('click','.js-del-campaign', function(){
    if(!apiReady()) return;
    var id=$(this).data('id'); var nome=$(this).data('nome');
    if(!confirm('Eliminare la campagna "'+nome+'"?')) return;
    AdminAPI.campaigns.delete(id).done(function(){ toast('Campagna eliminata','success'); renderView('marketing'); })
      .fail(function(){ toast('Errore','error'); });
  });

  /* ── CMS Pages ── */
  $(document).on('click','.js-new-page', function(){
    openModal('Nuova pagina',
      modalForm('newPageForm',
        fieldRow('Titolo *','<input name="titolo" required placeholder="Chi siamo" style="'+inputCss+'"/>')+
        fieldRow('Contenuto','<textarea name="contenuto" rows="5" placeholder="Testo della pagina..." style="'+inputCss+'"></textarea>')+
        fieldRow('Stato','<select name="stato" style="'+inputCss+'"><option value="bozza">Bozza</option><option value="pubblicata">Pubblicata</option></select>'),
        'Crea pagina'));
    $('#newPageForm').on('submit', function(e){
      e.preventDefault(); if(!apiReady()) return;
      var fd=Object.fromEntries(new FormData(this));
      AdminAPI.pages.create(fd).done(function(){ toast('Pagina creata','success'); closeModal(); renderView('content'); })
        .fail(function(x){ toast((x.responseJSON&&x.responseJSON.error)||'Errore','error'); });
    });
  });
  $(document).on('click','.js-edit-page', function(){
    if(!apiReady()) return;
    var id=$(this).data('id'); var titolo=$(this).data('titolo'); var stato=$(this).data('stato');
    openModal('Modifica pagina',
      modalForm('editPageForm',
        fieldRow('Titolo *','<input name="titolo" required value="'+String(titolo).replace(/"/g,'&quot;')+'" style="'+inputCss+'"/>')+
        fieldRow('Stato','<select name="stato" style="'+inputCss+'"><option value="bozza"'+(stato==='bozza'?' selected':'')+'>Bozza</option><option value="pubblicata"'+(stato==='pubblicata'?' selected':'')+'>Pubblicata</option></select>'),
        'Salva'));
    $('#editPageForm').on('submit', function(e){
      e.preventDefault();
      var fd=Object.fromEntries(new FormData(this));
      AdminAPI.pages.update(id,fd).done(function(){ toast('Pagina aggiornata','success'); closeModal(); renderView('content'); })
        .fail(function(x){ toast((x.responseJSON&&x.responseJSON.error)||'Errore','error'); });
    });
  });
  $(document).on('click','.js-del-page', function(){
    if(!apiReady()) return;
    var id=$(this).data('id'); var titolo=$(this).data('titolo');
    if(!confirm('Eliminare la pagina "'+titolo+'"?')) return;
    AdminAPI.pages.delete(id).done(function(){ toast('Pagina eliminata','success'); renderView('content'); })
      .fail(function(){ toast('Errore','error'); });
  });

  /* ── Blog ── */
  $(document).on('click','.js-new-blog', function(){
    openModal('Nuovo articolo',
      modalForm('newBlogForm',
        fieldRow('Titolo *','<input name="titolo" required placeholder="Guida outfit estate" style="'+inputCss+'"/>')+
        fieldRow('Estratto','<input name="estratto" placeholder="Breve riassunto" style="'+inputCss+'"/>')+
        fieldRow('Contenuto','<textarea name="contenuto" rows="5" style="'+inputCss+'"></textarea>')+
        fieldRow('Stato','<select name="stato" style="'+inputCss+'"><option value="bozza">Bozza</option><option value="pubblicato">Pubblicato</option></select>'),
        'Crea articolo'));
    $('#newBlogForm').on('submit', function(e){
      e.preventDefault(); if(!apiReady()) return;
      var fd=Object.fromEntries(new FormData(this));
      AdminAPI.blog.create(fd).done(function(){ toast('Articolo creato','success'); closeModal(); renderView('blog'); })
        .fail(function(x){ toast((x.responseJSON&&x.responseJSON.error)||'Errore','error'); });
    });
  });
  $(document).on('click','.js-edit-blog', function(){
    if(!apiReady()) return;
    var id=$(this).data('id'); var titolo=$(this).data('titolo'); var estratto=$(this).data('estratto'); var stato=$(this).data('stato');
    openModal('Modifica articolo',
      modalForm('editBlogForm',
        fieldRow('Titolo *','<input name="titolo" required value="'+String(titolo).replace(/"/g,'&quot;')+'" style="'+inputCss+'"/>')+
        fieldRow('Estratto','<input name="estratto" value="'+String(estratto||'').replace(/"/g,'&quot;')+'" style="'+inputCss+'"/>')+
        fieldRow('Stato','<select name="stato" style="'+inputCss+'"><option value="bozza"'+(stato==='bozza'?' selected':'')+'>Bozza</option><option value="pubblicato"'+(stato==='pubblicato'?' selected':'')+'>Pubblicato</option></select>'),
        'Salva'));
    $('#editBlogForm').on('submit', function(e){
      e.preventDefault();
      var fd=Object.fromEntries(new FormData(this));
      AdminAPI.blog.update(id,fd).done(function(){ toast('Articolo aggiornato','success'); closeModal(); renderView('blog'); })
        .fail(function(x){ toast((x.responseJSON&&x.responseJSON.error)||'Errore','error'); });
    });
  });
  $(document).on('click','.js-del-blog', function(){
    if(!apiReady()) return;
    var id=$(this).data('id'); var titolo=$(this).data('titolo');
    if(!confirm('Eliminare l\'articolo "'+titolo+'"?')) return;
    AdminAPI.blog.delete(id).done(function(){ toast('Articolo eliminato','success'); renderView('blog'); })
      .fail(function(){ toast('Errore','error'); });
  });

  /* ── Media library (Files) — stored in store_settings ── */
  function getMedia(){ try { var m=JSON.parse((DATA.settings&&DATA.settings.media_library)||'[]'); return Array.isArray(m)?m:[]; } catch(_){ return []; } }
  function saveMedia(list, okMsg){
    if(!apiReady()) return;
    AdminAPI.settings.update({ media_library: JSON.stringify(list) }).done(function(saved){
      DATA.settings = saved || DATA.settings || {};
      if(DATA.settings) DATA.settings.media_library = JSON.stringify(list);
      toast(okMsg||'Salvato','success'); renderView('files');
    }).fail(function(){ toast('Errore salvataggio','error'); });
  }
  $(document).on('click','.js-add-file', function(){
    openModal('Aggiungi file',
      modalForm('addFileForm',
        fieldRow('Nome *','<input name="nome" required placeholder="hero-estate.jpg" style="'+inputCss+'"/>')+
        fieldRow('URL immagine *','<input name="url" required placeholder="https://..." style="'+inputCss+'"/>'),
        'Aggiungi'));
    $('#addFileForm').on('submit', function(e){
      e.preventDefault();
      var fd=Object.fromEntries(new FormData(this));
      var list=getMedia(); list.unshift({ nome:fd.nome, url:fd.url });
      closeModal(); saveMedia(list,'File aggiunto');
    });
  });
  $(document).on('click','.js-del-file', function(){
    var idx=parseInt($(this).data('idx'),10);
    var list=getMedia();
    if(idx>=0 && idx<list.length){ list.splice(idx,1); saveMedia(list,'File rimosso'); }
  });

  /* ── Couriers: add / delete / import rates ── */
  $(document).on('click','.js-new-courier', function(){
    openModal('Aggiungi corriere',
      modalForm('newCourierForm',
        fieldRow('Codice *','<input name="code" required placeholder="es. tnt" style="'+inputCss+'"/>')+
        fieldRow('Nome *','<input name="nome" required placeholder="TNT Express" style="'+inputCss+'"/>')+
        fieldRow('Sigla','<input name="slug" maxlength="6" placeholder="TNT" style="'+inputCss+'"/>')+
        fieldRow('Tariffa base (EUR)','<input type="number" step="0.01" min="0" name="rate" value="6.00" style="'+inputCss+'"/>')+
        fieldRow('Attivo','<select name="attivo" style="'+inputCss+'"><option value="1">Sì</option><option value="0">No</option></select>'),
        'Aggiungi'));
    $('#newCourierForm').on('submit', function(e){
      e.preventDefault(); if(!apiReady()) return;
      var fd=Object.fromEntries(new FormData(this)); fd.attivo = fd.attivo==='1';
      AdminAPI.shipping.createCourier(fd).done(function(){ toast('Corriere aggiunto','success'); closeModal(); renderView('couriers'); })
        .fail(function(x){ toast((x.responseJSON&&x.responseJSON.error)||'Errore','error'); });
    });
  });
  $(document).on('click','.js-del-courier', function(){
    if(!apiReady()) return;
    var code=$(this).data('courier'); var nome=$(this).data('nome');
    if(!confirm('Rimuovere il corriere "'+nome+'"?')) return;
    AdminAPI.shipping.deleteCourier(code).done(function(){ toast('Corriere rimosso','success'); renderView('couriers'); })
      .fail(function(){ toast('Errore','error'); });
  });
  $(document).on('click','.js-import-rates', function(){
    var rows=(DATA.couriers||[]).map(function(c){
      return fieldRow(c.nome,'<input type="number" step="0.01" min="0" class="rate-input" data-code="'+c.code+'" value="'+(String(c.rate||'').replace(/[^0-9.,]/g,'').replace(',','.')||'0')+'" style="'+inputCss+'"/>');
    }).join('');
    openModal('Importa / aggiorna tariffe',
      '<form id="ratesForm"><div class="kv" style="grid-template-columns:160px 1fr;gap:10px;align-items:center">'+rows+'</div>'+
      '<div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn btn-ghost btn-sm" onclick="closeModal()">Annulla</button>'+
      '<button type="submit" class="btn btn-primary btn-sm">Aggiorna tariffe</button></div></form>');
    $('#ratesForm').on('submit', function(e){
      e.preventDefault(); if(!apiReady()) return;
      var updates=[]; $('.rate-input').each(function(){ updates.push(AdminAPI.shipping.updateCourier($(this).data('code'),{ rate:parseFloat($(this).val())||0 })); });
      $.when.apply($,updates).done(function(){ toast('Tariffe aggiornate','success'); closeModal(); renderView('couriers'); })
        .fail(function(){ toast('Errore aggiornamento','error'); });
    });
  });

  /* ── Shipments: new / export / label ── */
  $(document).on('click','.js-new-shipment', function(){
    var couriers = (DATA.couriers&&DATA.couriers.length)?DATA.couriers:[{code:'sda',nome:'SDA'},{code:'brt',nome:'BRT'},{code:'gls',nome:'GLS'},{code:'dhl',nome:'DHL'}];
    var courierOpts = couriers.map(function(c){ return '<option value="'+c.code+'">'+c.nome+'</option>'; }).join('');
    openModal('Nuova spedizione',
      '<form id="newShipForm"><div class="kv" style="grid-template-columns:140px 1fr;gap:10px;align-items:center">'+
        fieldRow('Ordine *', orderPickerHtml())+
        fieldRow('Corriere *','<select name="courier_code" required style="'+inputCss+'">'+courierOpts+'</select>')+
        fieldRow('Tracking *','<input name="tracking_number" required placeholder="SDA1234567890" style="'+inputCss+'"/>')+
        fieldRow('Destinazione','<input name="destinazione" placeholder="Milano (MI)" style="'+inputCss+'"/>')+
        fieldRow('ETA','<input type="date" name="eta" style="'+inputCss+'"/>')+
      '</div><div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn btn-ghost btn-sm" onclick="closeModal()">Annulla</button><button type="submit" class="btn btn-primary btn-sm">Crea spedizione</button></div></form>');
    wireOrderPicker();
    $('#newShipForm').on('submit', function(e){
      e.preventDefault(); if(!apiReady()) return;
      var fd=Object.fromEntries(new FormData(this));
      if(!fd.order_id){ toast('Seleziona un ordine','info'); return; }
      AdminAPI.shipping.createShipment(fd).done(function(){ toast('Spedizione creata','success'); closeModal(); renderView('shipments'); })
        .fail(function(x){ toast((x.responseJSON&&x.responseJSON.error)||'Errore','error'); });
    });
  });
  $(document).on('click','.js-export-shipments', function(){
    if(!DATA.shipments||!DATA.shipments.length){ toast('Nessuna spedizione da esportare','info'); return; }
    var rows=[['Tracking','Ordine','Cliente','Corriere','Destinazione','Stato','ETA']];
    DATA.shipments.forEach(function(s){ rows.push([s.id,s.ordine,s.cliente,(s.corriere||'').toUpperCase(),s.destinazione,s.stato,s.eta]); });
    downloadCSV(rows,'spedizioni'); toast('CSV esportato: '+DATA.shipments.length+' spedizioni','success');
  });
  $(document).on('click','.js-ship-label', function(){
    var id=$(this).data('id'), ordine=$(this).data('ordine'), cliente=$(this).data('cliente'), dest=$(this).data('dest');
    var w=window.open('','_blank');
    if(!w){ toast('Abilita i popup per stampare l\'etichetta','info'); return; }
    w.document.write('<html><head><title>Etichetta '+id+'</title><style>body{font-family:Arial;padding:24px}.lbl{border:2px solid #000;border-radius:8px;padding:20px;max-width:380px}.lbl h2{margin:0 0 8px}.row{margin:6px 0;font-size:14px}.bc{font-family:monospace;font-size:22px;letter-spacing:3px;margin-top:14px;border-top:1px dashed #888;padding-top:12px}</style></head><body><div class="lbl"><h2>MEMI · Etichetta di spedizione</h2><div class="row"><b>Ordine:</b> '+ordine+'</div><div class="row"><b>Destinatario:</b> '+cliente+'</div><div class="row"><b>Destinazione:</b> '+dest+'</div><div class="bc">'+id+'</div></div><script>window.print()</script></body></html>');
    w.document.close();
  });

  /* ── Pickup points: new / edit / delete ── */
  function pickupForm(formId, d){
    d=d||{};
    return modalForm(formId,
      fieldRow('Nome *','<input name="nome" required value="'+(d.nome||'').replace(/"/g,'&quot;')+'" placeholder="Edicola Centro" style="'+inputCss+'"/>')+
      fieldRow('Indirizzo *','<input name="indirizzo" required value="'+(d.indirizzo||'').replace(/"/g,'&quot;')+'" placeholder="Via Roma 1, Milano" style="'+inputCss+'"/>')+
      fieldRow('Corriere','<input name="corriere" value="'+(d.corriere||'')+'" placeholder="SDA" style="'+inputCss+'"/>')+
      fieldRow('Orari','<input name="orari" value="'+(d.orari||'').replace(/"/g,'&quot;')+'" placeholder="Lun-Sab 8-19" style="'+inputCss+'"/>'),
      d.id?'Salva':'Aggiungi');
  }
  $(document).on('click','.js-new-pickup', function(){
    openModal('Nuovo punto di ritiro', pickupForm('newPickupForm'));
    $('#newPickupForm').on('submit', function(e){
      e.preventDefault(); if(!apiReady()) return;
      var fd=Object.fromEntries(new FormData(this));
      AdminAPI.shipping.createPickup(fd).done(function(){ toast('Punto aggiunto','success'); closeModal(); renderView('pickup'); })
        .fail(function(x){ toast((x.responseJSON&&x.responseJSON.error)||'Errore','error'); });
    });
  });
  $(document).on('click','.js-edit-pickup', function(){
    if(!apiReady()) return;
    var id=$(this).data('id');
    if(!id){ toast('Salva prima i dati dal server','info'); return; }
    var d={ id:id, nome:$(this).data('nome'), indirizzo:$(this).data('indirizzo'), corriere:$(this).data('corriere'), orari:$(this).data('orari') };
    openModal('Modifica punto di ritiro', pickupForm('editPickupForm', d));
    $('#editPickupForm').on('submit', function(e){
      e.preventDefault();
      var fd=Object.fromEntries(new FormData(this));
      AdminAPI.shipping.updatePickup(id,fd).done(function(){ toast('Punto aggiornato','success'); closeModal(); renderView('pickup'); })
        .fail(function(x){ toast((x.responseJSON&&x.responseJSON.error)||'Errore','error'); });
    });
  });
  $(document).on('click','.js-del-pickup', function(){
    if(!apiReady()) return;
    var id=$(this).data('id'); var nome=$(this).data('nome');
    if(!id){ toast('Punto non sincronizzato','info'); return; }
    if(!confirm('Eliminare "'+nome+'"?')) return;
    AdminAPI.shipping.deletePickup(id).done(function(){ toast('Punto eliminato','success'); renderView('pickup'); })
      .fail(function(){ toast('Errore','error'); });
  });

  /* ── Online store: customize theme (saved to settings) ── */
  $(document).on('click','.js-customize-theme', function(){
    var s=DATA.settings||{};
    openModal('Personalizza tema',
      modalForm('themeForm',
        fieldRow('Nome tema','<input name="theme_name" value="'+(s.theme_name||'Pastel Minimal v2.4').replace(/"/g,'&quot;')+'" style="'+inputCss+'"/>')+
        fieldRow('Colore primario','<input type="color" name="theme_primary" value="'+(s.theme_primary||'#7fc29b')+'" style="height:38px;width:80px;border:1px solid var(--line);border-radius:6px"/>')+
        fieldRow('Dominio','<input name="store_domain" value="'+(s.store_domain||'memi.it').replace(/"/g,'&quot;')+'" style="'+inputCss+'"/>'),
        'Salva tema'));
    $('#themeForm').on('submit', function(e){
      e.preventDefault(); if(!apiReady()) return;
      var fd=Object.fromEntries(new FormData(this));
      AdminAPI.settings.update(fd).done(function(saved){ DATA.settings=saved||Object.assign(DATA.settings||{},fd); toast('Tema salvato','success'); closeModal(); renderView('online-store'); })
        .fail(function(){ toast('Errore salvataggio','error'); });
    });
  });

  /* ── Apps: open / app store ── */
  $(document).on('click','.js-open-app', function(){
    var nome=$(this).data('nome'), cat=$(this).data('cat'), stato=$(this).data('stato');
    openModal(nome,
      '<div class="kv" style="grid-template-columns:120px 1fr;gap:8px">'+
        '<div class="k">Categoria</div><div class="v">'+cat+'</div>'+
        '<div class="k">Stato</div><div class="v">'+statusPill(stato)+'</div>'+
      '</div><p style="margin-top:12px;color:var(--muted);font-size:13px">Configurazione e log dell\'app. Gestisci chiavi API e webhook dalla sezione Integrazioni.</p>'+
      '<div style="margin-top:14px;display:flex;justify-content:flex-end"><button class="btn btn-primary btn-sm" onclick="closeModal()">Chiudi</button></div>');
  });
  $(document).on('click','.js-app-store', function(){
    var avail=[['Mailchimp','Marketing'],['Yotpo Reviews','Recensioni'],['ShipStation','Spedizioni'],['QuickBooks','Fatturazione'],['TikTok Pixel','Marketing'],['Algolia Search','Ricerca']];
    openModal('App Store',
      '<p style="color:var(--muted);font-size:13px;margin-bottom:10px">App disponibili da installare:</p><div class="grid grid-2" style="gap:10px">'+
      avail.map(function(a){ return '<div class="card" style="box-shadow:none;border:1px solid var(--line)"><strong>'+a[0]+'</strong><small style="display:block;color:var(--muted)">'+a[1]+'</small><button class="btn btn-soft btn-sm js-install-app" data-nome="'+a[0]+'" style="margin-top:8px">Installa</button></div>'; }).join('')+
      '</div>');
  });
  $(document).on('click','.js-install-app', function(){
    toast('“'+$(this).data('nome')+'” installata','success'); closeModal();
  });

  /* ── Segments: live analysis from customer data ── */
  $(document).on('click','.js-new-segment', function(){
    openModal('Analizza segmento clienti',
      modalForm('segForm',
        fieldRow('Criterio','<select name="rule" style="'+inputCss+'"><option value="vip">VIP (speso &gt; €300)</option><option value="spend100">Speso &gt; €100</option><option value="multi">Più di 1 ordine</option><option value="single">Un solo ordine</option></select>'),
        'Calcola'));
    $('#segForm').on('submit', function(e){
      e.preventDefault();
      var rule=$(this).find('[name=rule]').val();
      var custs=DATA.customers||[];
      var num=function(s){ return parseFloat(String(s||'').replace(/[^0-9,.-]/g,'').replace('.','').replace(',','.'))||0; };
      var match=custs.filter(function(c){
        var spent=num(c.speso), ord=parseInt(c.ordini)||0;
        if(rule==='vip') return c.vip||spent>300;
        if(rule==='spend100') return spent>100;
        if(rule==='multi') return ord>1;
        if(rule==='single') return ord===1;
        return false;
      });
      $('#modalBody').html('<p style="font-size:15px"><strong>'+match.length+'</strong> clienti corrispondono al criterio selezionato'+(custs.length?' (su '+custs.length+' caricati).':'.')+'</p>'+
        (match.length?'<ul class="list-clean" style="margin-top:10px;max-height:220px;overflow:auto">'+match.slice(0,50).map(function(c){ return '<li><span>'+c.nome+'</span><small style="color:var(--muted)">'+c.speso+'</small></li>'; }).join('')+'</ul>':'')+
        '<div style="margin-top:14px;display:flex;justify-content:flex-end"><button class="btn btn-primary btn-sm" onclick="closeModal()">Chiudi</button></div>');
    });
  });

  /* ── Reports: export CSV from already-loaded / freshly-fetched data ── */
  $(document).on('click','.js-run-report', function(){
    if(!apiReady()) return;
    var rep=$(this).data('report');
    toast('Generazione report...','info');
    function go(rows,name){ if(rows.length<2){ toast('Nessun dato per questo report','info'); return; } downloadCSV(rows,'report_'+name); toast('Report esportato','success'); }
    if(rep==='orders'){
      AdminAPI.orders.list({limit:200}).done(function(d){ var l=(d&&d.orders)||[]; var rows=[['Ordine','Cliente','Email','Totale','Pagamento','Stato','Data']]; l.forEach(function(o){ rows.push([o.order_number,(o.customer_nome||'')+' '+(o.customer_cognome||''),o.customer_email,o.total,o.payment_status,o.order_status,new Date(o.created_at).toLocaleDateString('it-IT')]); }); go(rows,'ordini'); }).fail(function(){ toast('Errore report','error'); });
    } else if(rep==='products'){
      AdminAPI.products.listAll().done(function(l){ l=l||[]; var rows=[['ID','Nome','Categoria','Prezzo','Stato']]; l.forEach(function(p){ rows.push([p.id,p.name,p.categoria,p.price,p.status]); }); go(rows,'prodotti'); }).fail(function(){ toast('Errore report','error'); });
    } else if(rep==='customers'){
      AdminAPI.customers.list({limit:200}).done(function(d){ var l=(d&&d.customers)||[]; var rows=[['ID','Nome','Email','Ordini','Speso']]; l.forEach(function(c){ rows.push([c.id,c.nome+' '+(c.cognome||''),c.email,c.total_orders||0,c.total_spent||0]); }); go(rows,'clienti'); }).fail(function(){ toast('Errore report','error'); });
    } else if(rep==='discounts'){
      AdminAPI.discounts.list().done(function(l){ l=l||[]; var rows=[['Codice','Tipo','Valore','Utilizzi','Max','Stato']]; l.forEach(function(d){ rows.push([d.code,d.tipo,d.valore,d.utilizzi||0,d.max_utilizzi||'-',d.stato]); }); go(rows,'sconti'); }).fail(function(){ toast('Errore report','error'); });
    } else if(rep==='inventory'){
      AdminAPI.products.listAll().done(function(l){ l=l||[]; var rows=[['ID','Nome','Categoria','Stock totale']]; l.forEach(function(p){ var st=0; (p.taglie||[]).forEach(function(t){ st+=parseInt(t.stock)||0; }); rows.push([p.id,p.name,p.categoria,st]); }); go(rows,'inventario'); }).fail(function(){ toast('Errore report','error'); });
    } else if(rep==='invoices'){
      AdminAPI.invoices.list({limit:200}).done(function(d){ var l=(d&&d.invoices)||(Array.isArray(d)?d:[]); var rows=[['N°','Ordine','Cliente','Totale','Stato','Data']]; l.forEach(function(i){ rows.push([i.invoice_number,i.order_number||i.order_id,(i.customer_nome||'')+' '+(i.customer_cognome||''),i.total,i.stato,new Date(i.created_at).toLocaleDateString('it-IT')]); }); go(rows,'fatture'); }).fail(function(){ toast('Errore report','error'); });
    }
  });

  /* ── Loyalty: save config + adjust points ── */
  $(document).on('click','.js-save-loyalty', function(){
    if(!apiReady()) return;
    var data={}; $('.loyalty-input').each(function(){ data[$(this).data('key')] = $(this).val(); });
    var $btn=$(this); $btn.prop('disabled',true).text('Salvataggio...');
    AdminAPI.loyalty.updateConfig(data)
      .done(function(){ toast('Configurazione fedeltà salvata','success'); renderView('loyalty'); })
      .fail(function(x){ toast((x.responseJSON&&x.responseJSON.error)||'Errore','error'); $btn.prop('disabled',false).text('💾 Salva configurazione'); });
  });
  $(document).on('click','.js-adjust-points', function(){
    if(!apiReady()) return;
    var id=$(this).data('id'), nome=$(this).data('nome'), cur=$(this).data('points');
    openModal('Rettifica punti — '+nome,
      modalForm('adjPointsForm',
        fieldRow('Saldo attuale','<input value="'+cur+'" disabled style="'+inputCss+'"/>')+
        fieldRow('Variazione (+/-) *','<input type="number" name="delta" required placeholder="es. 50 oppure -20" style="'+inputCss+'"/>')+
        fieldRow('Motivo','<input name="reason" placeholder="es. omaggio compleanno" style="'+inputCss+'"/>'),
        'Applica'));
    $('#adjPointsForm').on('submit', function(e){
      e.preventDefault();
      var fd=Object.fromEntries(new FormData(this));
      AdminAPI.loyalty.adjust(id,{ delta:parseInt(fd.delta,10), reason:fd.reason })
        .done(function(r){ toast('Saldo aggiornato: '+r.points+' punti','success'); closeModal(); renderView('loyalty'); })
        .fail(function(x){ toast((x.responseJSON&&x.responseJSON.error)||'Errore','error'); });
    });
  });

  /* ── Chat quick actions ── */
  $(document).on('click','.js-chat-discount', function(){
    var c=CHATS.find(function(x){ return x.id===activeChatId; });
    if(c){ sendChatMessage('🎁 Ecco un codice sconto del 10% per te: MEMI10'); toast('Sconto inviato in chat','success'); }
  });
  $(document).on('click','.js-chat-goorder', function(){
    var ordId=$(this).data('order');
    if(ordId){ renderView('orders'); setActiveNav('orders'); toast('Apertura ordine '+ordId,'info'); }
    else { toast('Nessun ordine collegato a questa chat','info'); }
  });
  $(document).on('click','.js-chat-block', function(){
    var c=CHATS.find(function(x){ return x.id===activeChatId; });
    if(c && confirm('Bloccare '+c.nome+'? Non potrà più scriverti.')){ toast(c.nome+' bloccato','success'); }
  });

  // ── Sidebar badges driven by real data (no hardcoded numbers) ──
  function setSideBadge(id, n){
    var el = document.getElementById(id);
    if(!el) return;
    if(n && n>0){ el.textContent = n; el.style.display=''; }
    else { el.style.display='none'; }
  }
  function updateSidebarBadges(){
    if(!window.AdminAPI) return;
    // Orders needing attention + drafts (from real orders)
    AdminAPI.orders.list({limit:200}).done(function(d){
      var list = (d && d.orders) ? d.orders : (Array.isArray(d) ? d : []);
      var pending = list.filter(function(o){ return o.order_status==='in_attesa' || o.order_status==='in_preparazione'; }).length;
      var drafts  = list.filter(function(o){ return o.order_status==='in_attesa'; }).length;
      setSideBadge('badgeOrders', pending);
      setSideBadge('badgeDrafts', drafts);
    }).fail(function(){ setSideBadge('badgeOrders',0); setSideBadge('badgeDrafts',0); });
    // Active discount codes
    AdminAPI.discounts.list().done(function(l){
      l = Array.isArray(l) ? l : [];
      setSideBadge('badgeDiscounts', l.filter(function(x){ return x.stato==='attivo'; }).length);
    }).fail(function(){ setSideBadge('badgeDiscounts',0); });
    // Chat (frontend demo data) — count unread; abandoned carts: no data source
    try { setSideBadge('badgeChat', (typeof CHATS!=='undefined'?CHATS:[]).reduce(function(s,c){ return s+(c.unread||0); },0)); } catch(_){}
    setSideBadge('badgeAbandoned', 0);
  }

  // ── Initial data load from API, then render dashboard ──
  function loadDashboardData() {
    var api = window.AdminAPI;
    if (!api) { (typeof _origRenderView === 'function' ? _origRenderView : renderView)('dashboard'); return; }

    $.when(
      api.dashboard.kpis(),
      api.dashboard.recentOrders(),
      api.dashboard.topProducts(),
      api.shipping.shipments(),
      api.dashboard.chart()
    ).done(function(kpiRes, ordersRes, topRes, shipRes, chartRes) {
      var kpi      = kpiRes[0]   || {};
      var recent   = ordersRes[0]|| [];
      var topProds = topRes[0]   || [];
      var shipList = shipRes[0]  || [];
      var chartData= chartRes[0] || [];

      // KPIs
      if (kpi.revenue) {
        DATA.kpi = kpi;
      }
      // Refresh sidebar badges from real data (no hardcoded numbers)
      updateSidebarBadges();

      // Recent orders
      if (Array.isArray(recent) && recent.length) {
        DATA.orders = recent.map(function(o) {
          return {
            id:          o.order_number,
            _db_id:      o.id,
            _raw_status: o.order_status,
            cliente:     ((o.customer_nome||'') + ' ' + (o.customer_cognome||'')).trim(),
            data:        new Date(o.created_at).toLocaleDateString('it-IT'),
            totale:      'EUR ' + parseFloat(o.total).toFixed(2).replace('.', ','),
            pagamento:   AdminAPI.statusLabel(o.payment_status),
            stato:       AdminAPI.statusLabel(o.order_status),
            corriere:    (o.courier_code || '-').toUpperCase(),
            tracking:    o.tracking_number || '-',
          };
        });
      }

      // Top products
      if (Array.isArray(topProds) && topProds.length) {
        DATA.products = topProds.map(function(p) {
          var cat = (p.categoria || '').toLowerCase();
          var _iconMap2 = { vestiti:'👗', gonne:'👗', blazer:'🥻', top:'👕', pantaloni:'👖', borse:'👜', scarpe:'👟', gioielli:'💍', accessori:'✨', set:'✨', cinture:'🪡' };
          return {
            id:     p.product_id || p.id || '',
            nome:   p.product_name || p.name || '-',
            cat:    p.categoria   || '',
            prezzo: p.revenue     ? 'EUR ' + parseFloat(p.revenue).toFixed(2).replace('.', ',') : '-',
            stock:  p.units_sold  || 0,
            status: 'Attivo',
            img:    _iconMap2[cat] || '👗',
          };
        });
      }

      // Chart data
      if (Array.isArray(chartData) && chartData.length) {
        DATA.chartData = chartData;
      }

      // Active shipments
      if (Array.isArray(shipList) && shipList.length) {
        DATA.shipments = shipList.map(function(s) {
          return {
            _db_id:       s.id,
            id:           s.tracking_number || ('SHP' + s.id),
            ordine:       s.order_number || ('#' + s.order_id),
            _order_db_id: s.order_id,
            cliente:      ((s.customer_nome||'') + ' ' + (s.customer_cognome||'')).trim() || '-',
            corriere:     (s.courier_code || '').toLowerCase(),
            destinazione: s.destinazione || '-',
            stato:        AdminAPI.statusLabel(s.stato),
            eta:          s.eta ? new Date(s.eta).toLocaleDateString('it-IT') : '-',
          };
        });
      }

      _origRenderView('dashboard');
    }).fail(function() {
      _origRenderView('dashboard');
    });
  }

  // ── Override renderView to fetch fresh API data per view ──
  var _origRenderView = renderView;
  renderView = function(name) {
    // Permission gate: staff cannot open admin-only sections (defense beyond the hidden nav).
    if (!canAccessView(name)) {
      if (typeof toast === 'function') toast('Sezione riservata agli amministratori', 'error');
      name = 'dashboard';
    }
    var api = window.AdminAPI;
    if (!api) { _origRenderView(name); return; }

    var loading = '<div style="padding:60px;text-align:center;color:var(--muted)">Caricamento...</div>';
    $('#viewContainer').html(loading);

    if (name === 'orders' || name === 'orders-drafts' || name === 'orders-abandoned') {
      api.orders.list({ limit: 100 }).done(function(data) {
        var list = (data && data.orders) ? data.orders : (Array.isArray(data) ? data : []);
        DATA.orders = list.map(function(o) {
          return {
            id:           o.order_number,
            _db_id:       o.id,
            _raw_status:  o.order_status,
            cliente:      ((o.customer_nome||'') + ' ' + (o.customer_cognome||'')).trim(),
            data:         new Date(o.created_at).toLocaleDateString('it-IT'),
            totale:       'EUR ' + parseFloat(o.total).toFixed(2).replace('.', ','),
            pagamento:    AdminAPI.statusLabel(o.payment_status),
            stato:        AdminAPI.statusLabel(o.order_status),
            corriere:     (o.courier_code || '-').toUpperCase(),
            tracking:     o.tracking_number || '-',
          };
        });
        _origRenderView(name);
      }).fail(function() { _origRenderView(name); });

    } else if (name === 'products' || name === 'inventory') {
      api.products.listAll().done(function(list) {
        if (!Array.isArray(list)) list = [];
        DATA.products = list.map(function(p) {
          // The list endpoint returns stock_total (sum across sizes). Fall back to
          // summing per-size stock only if individual sizes carry stock (detail shape).
          var totalStock = (p.stock_total != null) ? (parseInt(p.stock_total) || 0) : 0;
          if (!totalStock && p.taglie && Array.isArray(p.taglie)) {
            p.taglie.forEach(function(t) { totalStock += (parseInt(t && t.stock) || 0); });
          }
          var _iconMap = {
            dress:'👗', bag:'👜', shoe:'👟', ring:'💍', earring:'👂', necklace:'💎',
            top:'👕', blazer:'🥻', cardigan:'🧶', jacket:'🧥', scarf:'🧣',
            pants:'👖', shorts:'🩳', skirt:'👗', sandal:'👡', sneaker:'👟',
            vestiti:'👗', gonne:'👗', pantaloni:'👖', borse:'👜', scarpe:'👟',
            gioielli:'💍', accessori:'✨', set:'✨', cinture:'🪡'
          };
          var icon = _iconMap[p.icon] || _iconMap[p.categoria] || '👗';
          var imgArr = Array.isArray(p.images) ? p.images : [];
          var first  = imgArr[0];
          var thumb  = first ? (typeof first==='string' ? first : (first.thumb||first.card||first.full)) : null;
          return {
            id:     p.id,
            nome:   p.name,
            cat:    p.categoria,
            prezzo: 'EUR ' + parseFloat(p.price).toFixed(2).replace('.', ','),
            stock:  totalStock,
            status: AdminAPI.statusLabel(p.status || 'attivo'),
            img:    icon,
            thumb:  thumb,
            collections: Array.isArray(p.collections) ? p.collections : [],
          };
        });
        _origRenderView(name);
      }).fail(function() { _origRenderView(name); });

    } else if (name === 'customers' || name === 'segments') {
      api.customers.list({ limit: 200 }).done(function(data) {
        var list = (data && data.customers) ? data.customers : [];
        DATA.customers = list.map(function(c) {
          return {
            _db_id:  c.id,
            id:      'C-' + String(c.id).padStart(3, '0'),
            nome:    c.nome + (c.cognome ? ' ' + c.cognome : ''),
            email:   c.email,
            ordini:  c.total_orders || 0,
            speso:   'EUR ' + parseFloat(c.total_spent || 0).toFixed(2).replace('.', ','),
            ultimo:  c.last_login ? new Date(c.last_login).toLocaleDateString('it-IT') : '-',
            vip:     (c.total_spent || 0) > 300,
          };
        });
        _origRenderView(name);
      }).fail(function() { _origRenderView(name); });

    } else if (name === 'discounts') {
      api.discounts.list().done(function(list) {
        if (!Array.isArray(list)) list = [];
        DATA.discounts = list.map(function(d) {
          var tipo = d.tipo === 'percentuale' ? 'Percentuale ' + d.valore + '%' :
                     d.tipo === 'fisso'       ? 'EUR ' + parseFloat(d.valore).toFixed(2) + ' fisso' :
                                               'Spedizione gratuita';
          return {
            _db_id:  d.id,
            code:    d.code,
            tipo:    tipo,
            utilizzi: (d.utilizzi || 0) + '/' + (d.max_utilizzi || '-'),
            scad:    d.scadenza ? new Date(d.scadenza).toLocaleDateString('it-IT') : '-',
            stato:   AdminAPI.statusLabel(d.stato),
          };
        });
        _origRenderView(name);
      }).fail(function() { _origRenderView(name); });

    } else if (name === 'shipping' || name === 'couriers' || name === 'shipping-zones') {
      $.when(api.shipping.couriers(), api.shipping.zones(), api.shipping.shipments()).done(function(courRes, zoneRes, shipRes) {
        var couriers = Array.isArray(courRes[0]) ? courRes[0] : [];
        var zones    = Array.isArray(zoneRes[0]) ? zoneRes[0] : [];
        var ships    = Array.isArray(shipRes[0]) ? shipRes[0] : [];
        // Real per-courier counters (was hardcoded 0/0/0).
        var byCourier = {};
        ships.forEach(function(s) {
          var c = (s.courier_code || '').toLowerCase();
          if (!byCourier[c]) byCourier[c] = { sped: 0, consegnati: 0, ritardi: 0 };
          byCourier[c].sped++;
          if (s.stato === 'consegnato') byCourier[c].consegnati++;
          if (s.stato === 'problema')   byCourier[c].ritardi++;
        });
        DATA.couriers = couriers.map(function(c) {
          var st = byCourier[(c.code || '').toLowerCase()] || { sped: 0, consegnati: 0, ritardi: 0 };
          return { code: c.code, nome: c.nome, slug: c.slug || c.code.toUpperCase(), rate: 'EUR ' + parseFloat(c.rate || 0).toFixed(2), rate_raw: parseFloat(c.rate || 0), attivo: !!c.attivo, tracking_url_template: c.tracking_url_template || '', sped: st.sped, consegnati: st.consegnati, ritardi: st.ritardi };
        });
        DATA.zones = zones.map(function(z) {
          return { _db_id: z.id, nome: z.nome, paesi: z.paesi, metodo: z.metodo, prezzo: 'EUR ' + parseFloat(z.prezzo || 0).toFixed(2), grat: z.spedizione_gratuita_da ? 'EUR ' + z.spedizione_gratuita_da : '-' };
        });
        _origRenderView(name);
      }).fail(function() { _origRenderView(name); });

    } else if (name === 'shipments' || name === 'tracking') {
      api.shipping.shipments().done(function(list) {
        if (!Array.isArray(list)) list = [];
        DATA.shipments = list.map(function(s) {
          return {
            _db_id:       s.id,
            id:           s.tracking_number,
            ordine:       s.order_number || ('#' + s.order_id),
            _order_db_id: s.order_id,
            cliente:      ((s.customer_nome||'') + ' ' + (s.customer_cognome||'')).trim() || '-',
            corriere:     (s.courier_code || '').toLowerCase(),
            destinazione: s.destinazione || '-',
            stato:        AdminAPI.statusLabel(s.stato),
            eta:          s.eta ? new Date(s.eta).toLocaleDateString('it-IT') : '-',
          };
        });
        if (!DATA.couriers || !DATA.couriers.length) {
          api.shipping.couriers().done(function(courRes) {
            var couriers = Array.isArray(courRes) ? courRes : [];
            DATA.couriers = couriers.map(function(c) {
              return { code: c.code, nome: c.nome, slug: c.slug || c.code.toUpperCase(), rate: 'EUR ' + parseFloat(c.rate || 0).toFixed(2), rate_raw: parseFloat(c.rate || 0), attivo: !!c.attivo, tracking_url_template: c.tracking_url_template || '', sped: 0, consegnati: 0, ritardi: 0 };
            });
            _origRenderView(name);
          }).fail(function() { _origRenderView(name); });
        } else {
          _origRenderView(name);
        }
      }).fail(function() { _origRenderView(name); });

    } else if (name === 'invoices') {
      api.invoices.list({ limit: 200 }).done(function(data) {
        DATA.invoices = (data && data.invoices) ? data.invoices : (Array.isArray(data) ? data : []);
        _origRenderView(name);
      }).fail(function() { DATA.invoices = DATA.invoices || []; _origRenderView(name); });

    } else if (name === 'returns') {
      api.resi.list({ limit: 200 }).done(function(data) {
        DATA.resi = (data && data.resi) ? data.resi : (Array.isArray(data) ? data : []);
        _origRenderView(name);
      }).fail(function() { DATA.resi = DATA.resi || []; _origRenderView(name); });

    } else if (name === 'reviews') {
      api.reviews.list({ limit: 200 }).done(function(data) {
        DATA.reviews = {
          list:    (data && data.reviews) ? data.reviews  : (Array.isArray(data) ? data : []),
          total:   (data && data.total)   ? data.total    : 0,
          pending: (data && data.pending) ? data.pending  : 0,
        };
        _origRenderView(name);
      }).fail(function() { DATA.reviews = DATA.reviews || {list:[],total:0,pending:0}; _origRenderView(name); });

    } else if (name === 'newsletter') {
      api.newsletter.list({ limit: 500 }).done(function(data) {
        var subs = (data && data.subscribers) ? data.subscribers : (Array.isArray(data) ? data : []);
        var activeCount = (data && typeof data.total === 'number') ? data.total : subs.filter(function(s){ return !s.unsubscribed; }).length;
        DATA.newsletter = {
          total:        activeCount,
          unsubscribed: subs.filter(function(s){ return !!s.unsubscribed; }).length,
          recent:       subs
        };
        _origRenderView(name);
      }).fail(function() { _origRenderView(name); });

    } else if (name === 'analytics') {
      // Always refresh KPI + chart so analytics reflects current numbers.
      $.when(api.dashboard.kpis(), api.dashboard.chart()).done(function(kpiRes, chartRes) {
        var kpi = kpiRes[0] || {}; if (kpi && kpi.revenue) DATA.kpi = kpi;
        DATA.chartData = chartRes[0] || [];
        _origRenderView(name);
      }).fail(function() { _origRenderView(name); });

    } else if (name === 'staff') {
      api.staff.list().done(function(data) {
        DATA.staff = (data && data.staff) ? data.staff : [];
        _origRenderView(name);
      }).fail(function() { DATA.staff = DATA.staff || []; _origRenderView(name); });

    } else if (name === 'settings' || name === 'taxes') {
      api.settings.get().done(function(data) {
        DATA.settings = data || {};
        _origRenderView(name);
      }).fail(function() { DATA.settings = DATA.settings || {}; _origRenderView(name); });

    } else if (name === 'collections') {
      api.products.listAll().done(function(list) {
        if (!Array.isArray(list)) list = [];
        var map = {};
        list.forEach(function(p) {
          // The API returns collections already parsed (array). Older/raw rows
          // may still be a JSON string — handle both so the list never comes back empty.
          var c = p.collections;
          if (typeof c === 'string') { try { c = JSON.parse(c || '[]'); } catch(_) { c = []; } }
          if (!Array.isArray(c)) c = [];
          c.forEach(function(slug) {
            if (!map[slug]) map[slug] = 0;
            map[slug]++;
          });
        });
        DATA.collections = Object.keys(map).sort().map(function(slug) {
          return { slug: slug, count: map[slug] };
        });
        _origRenderView(name);
      }).fail(function() { DATA.collections = DATA.collections || []; _origRenderView(name); });

    } else if (name === 'categories') {
      api.products.listAll().done(function(list) {
        if (!Array.isArray(list)) list = [];
        var map = {};
        list.forEach(function(p) {
          var cat = (p.categoria || '').toLowerCase().trim();
          if (!cat) return;
          if (!map[cat]) map[cat] = { count: 0, active: 0, esauriti: 0 };
          map[cat].count++;
          if (p.status === 'attivo')    map[cat].active++;
          if (p.status === 'esaurito')  map[cat].esauriti++;
        });
        DATA.categories = Object.keys(map).sort().map(function(slug) {
          return Object.assign({ slug: slug }, map[slug]);
        });
        _origRenderView(name);
      }).fail(function() { DATA.categories = DATA.categories || []; _origRenderView(name); });

    } else if (name === 'giftcards') {
      api.giftcards.list().done(function(data) {
        DATA.giftcards   = (data && data.cards)   ? data.cards   : [];
        DATA.giftSummary = (data && data.summary) ? data.summary : null;
        _origRenderView(name);
      }).fail(function() { DATA.giftcards = DATA.giftcards || []; _origRenderView(name); });

    } else if (name === 'marketing' || name === 'automations') {
      api.campaigns.list().done(function(list) {
        DATA.campaigns = Array.isArray(list) ? list : [];
        _origRenderView(name);
      }).fail(function() { DATA.campaigns = DATA.campaigns || []; _origRenderView(name); });

    } else if (name === 'content') {
      DATA.pages = null;
      api.pages.list().done(function(list) {
        DATA.pages = Array.isArray(list) ? list : ((list && list.pages) || []);
        _origRenderView(name);
      }).fail(function() { DATA.pages = []; _origRenderView(name); });

    } else if (name === 'blog') {
      DATA.blog = null;
      api.blog.list().done(function(list) {
        DATA.blog = Array.isArray(list) ? list : ((list && list.posts) || []);
        _origRenderView(name);
      }).fail(function() { DATA.blog = []; _origRenderView(name); });

    } else if (name === 'files' || name === 'online-store') {
      api.settings.get().done(function(data) {
        DATA.settings = data || {};
        _origRenderView(name);
      }).fail(function() { DATA.settings = DATA.settings || {}; _origRenderView(name); });

    } else if (name === 'loyalty') {
      $.when(api.loyalty.config(), api.loyalty.customers({ limit: 200 })).done(function(cfgRes, custRes) {
        var cfg  = cfgRes[0]  || {};
        var cust = custRes[0] || {};
        DATA.loyalty = { config: cfg, customers: cust.customers || [], summary: cust.summary || {} };
        _origRenderView(name);
      }).fail(function() { DATA.loyalty = DATA.loyalty || { config:{}, customers:[], summary:{} }; _origRenderView(name); });

    } else if (name === 'pickup') {
      api.shipping.pickup().done(function(list) {
        if (Array.isArray(list) && list.length) {
          DATA.pickupPoints = list.map(function(p) {
            return { _db_id: p.id, nome: p.nome, indirizzo: p.indirizzo,
                     corriere: p.corriere || '-', orari: p.orari || '-', attivo: !!p.attivo };
          });
        }
        _origRenderView(name);
      }).fail(function() { _origRenderView(name); });

    } else if (name === 'finance' || name === 'payouts') {
      DATA.finance = DATA.finance || null;
      api.dashboard.finance().done(function(res) {
        DATA.finance = res || { summary: null, by_method: [], recent: [] };
        _origRenderView(name);
      }).fail(function() { DATA.finance = { summary: null, by_method: [], recent: [] }; _origRenderView(name); });

    } else if (name === 'integrations') {
      DATA.integrations = null;
      api.settings.integrations().done(function(res) {
        DATA.integrations = (res && res.integrations) ? res.integrations : [];
        _origRenderView(name);
      }).fail(function() { DATA.integrations = []; _origRenderView(name); });

    } else if (name === 'dashboard') {
      loadDashboardData();
    } else {
      _origRenderView(name);
    }
  };

  // ── Startup auth guard ─────────────────────────────────────
  // Verify the stored token is still valid before rendering anything.
  // admin-api.js already redirects on any 401, but checking here catches
  // an expired token before the first data request fires.
  if (window.AdminAPI && AdminAPI.auth.isLoggedIn()) {
    AdminAPI.auth.me()
      .done(function(me) { window.CURRENT_ADMIN = me || {}; applyRolePermissions(); updateSidebarBadges(); handleRoute(); })
      .fail(function() {
        // redirect is already handled inside admin-api.js request()
        // but belt-and-suspenders: ensure we land on login
        window.location.href = 'index.html?session=expired';
      });
  } else {
    // No token at all — go straight to login
    window.location.href = 'index.html';
  }
});
