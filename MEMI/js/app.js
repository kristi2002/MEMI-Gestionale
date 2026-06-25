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
  products: [
    { id:"P-001", nome:"T-Shirt Oversize Cotone", cat:"T-Shirt", prezzo:"€ 29,90", stock:124, status:"Attivo", img:"👕"},
    { id:"P-002", nome:"Felpa Hoodie Pastel Pink",cat:"Felpe",   prezzo:"€ 59,00", stock:42,  status:"Attivo", img:"🧥"},
    { id:"P-003", nome:"Jeans Slim Fit Blu",      cat:"Pantaloni",prezzo:"€ 79,00", stock:18,  status:"Attivo", img:"👖"},
    { id:"P-004", nome:"Giacca Vento Verde",      cat:"Giacche", prezzo:"€ 109,00",stock:7,   status:"Esaurito",img:"🧥"},
    { id:"P-005", nome:"Cappello Bucket",         cat:"Accessori",prezzo:"€ 19,90", stock:65,  status:"Attivo", img:"🧢"},
    { id:"P-006", nome:"Sneaker Low Bianche",     cat:"Scarpe",  prezzo:"€ 89,00", stock:31,  status:"Attivo", img:"👟"},
    { id:"P-007", nome:"Camicia Lino Estate",     cat:"Camicie", prezzo:"€ 49,50", stock:0,   status:"Esaurito",img:"👔"},
    { id:"P-008", nome:"Borsa Tote Naturale",     cat:"Accessori",prezzo:"€ 35,00", stock:88,  status:"Attivo", img:"👜"},
    { id:"P-009", nome:"Vestito Midi Floreale",   cat:"Vestiti", prezzo:"€ 69,00", stock:23,  status:"Attivo", img:"👗"},
    { id:"P-010", nome:"Sciarpa Lana Rosa",       cat:"Accessori",prezzo:"€ 24,90", stock:54,  status:"Bozza",  img:"🧣"},
    { id:"P-011", nome:"Cardigan Maglia Verde",   cat:"Maglieria",prezzo:"€ 65,00", stock:14,  status:"Attivo", img:"🧶"},
    { id:"P-012", nome:"Pantaloncini Sport",      cat:"Sport",   prezzo:"€ 32,00", stock:46,  status:"Attivo", img:"🩳"}
  ],
  orders: [
    { id:"#10254", cliente:"Sofia Bianchi",   data:"15/05/2026",totale:"€ 129,80",pagamento:"Pagato",   stato:"In preparazione",corriere:"SDA",  tracking:"SDA9981200001"},
    { id:"#10253", cliente:"Marco Rossi",     data:"15/05/2026",totale:"€ 59,00", pagamento:"Pagato",   stato:"Spedito",        corriere:"BRT",  tracking:"BRT0029987"},
    { id:"#10252", cliente:"Giulia Verdi",    data:"14/05/2026",totale:"€ 213,40",pagamento:"In attesa",stato:"In attesa",      corriere:"-",    tracking:"-"},
    { id:"#10251", cliente:"Luca Neri",       data:"14/05/2026",totale:"€ 39,90", pagamento:"Pagato",   stato:"Consegnato",     corriere:"GLS",  tracking:"GLS887701"},
    { id:"#10250", cliente:"Anna Greco",      data:"14/05/2026",totale:"€ 88,00", pagamento:"Pagato",   stato:"Spedito",        corriere:"SDA",  tracking:"SDA9981200002"},
    { id:"#10249", cliente:"Paolo Conti",     data:"13/05/2026",totale:"€ 174,50",pagamento:"Pagato",   stato:"Consegnato",     corriere:"DHL",  tracking:"DHL44912"},
    { id:"#10248", cliente:"Chiara Esposito", data:"13/05/2026",totale:"€ 19,90", pagamento:"Rimborsato",stato:"Annullato",     corriere:"-",    tracking:"-"},
    { id:"#10247", cliente:"Davide Romano",   data:"12/05/2026",totale:"€ 245,00",pagamento:"Pagato",   stato:"Spedito",        corriere:"Poste",tracking:"PT7781902"},
    { id:"#10246", cliente:"Sara Marini",     data:"12/05/2026",totale:"€ 49,50", pagamento:"Pagato",   stato:"In preparazione",corriere:"SDA",  tracking:"-"}
  ],
  customers:[
    {id:"C-001",nome:"Sofia Bianchi",   email:"sofia.b@mail.it",  ordini:8, speso:"€ 612,00",ultimo:"15/05/2026",vip:true},
    {id:"C-002",nome:"Marco Rossi",     email:"m.rossi@mail.it",  ordini:3, speso:"€ 178,00",ultimo:"15/05/2026",vip:false},
    {id:"C-003",nome:"Giulia Verdi",    email:"g.verdi@mail.it",  ordini:14,speso:"€ 1.245,00",ultimo:"14/05/2026",vip:true},
    {id:"C-004",nome:"Luca Neri",       email:"luca@mail.it",     ordini:1, speso:"€ 39,90", ultimo:"14/05/2026",vip:false},
    {id:"C-005",nome:"Anna Greco",      email:"anna.g@mail.it",   ordini:6, speso:"€ 489,00",ultimo:"14/05/2026",vip:false},
    {id:"C-006",nome:"Paolo Conti",     email:"p.conti@mail.it",  ordini:2, speso:"€ 198,00",ultimo:"13/05/2026",vip:false},
    {id:"C-007",nome:"Chiara Esposito", email:"chiara@mail.it",   ordini:11,speso:"€ 932,00",ultimo:"13/05/2026",vip:true}
  ],
  couriers:[
    {code:"sda",  nome:"SDA Express Courier",   slug:"SDA",   sped:128, consegnati:115, ritardi:3, attivo:true,  rate:"€ 5,90"},
    {code:"brt",  nome:"BRT - Bartolini",        slug:"BRT",   sped:94,  consegnati:88,  ritardi:5, attivo:true,  rate:"€ 6,50"},
    {code:"gls",  nome:"GLS Italy",              slug:"GLS",   sped:72,  consegnati:69,  ritardi:1, attivo:true,  rate:"€ 6,20"},
    {code:"poste",nome:"Poste Italiane Crono",  slug:"PI",    sped:45,  consegnati:40,  ritardi:4, attivo:false, rate:"€ 4,90"},
    {code:"dhl",  nome:"DHL Express",            slug:"DHL",  sped:34,  consegnati:33,  ritardi:0, attivo:true,  rate:"€ 12,90"}
  ],
  shipments:[
    {id:"SDA9981200001",ordine:"#10254",cliente:"Sofia Bianchi",   corriere:"sda",  destinazione:"Milano (MI)",   stato:"In transito",eta:"16/05/2026"},
    {id:"BRT0029987",  ordine:"#10253",cliente:"Marco Rossi",     corriere:"brt",  destinazione:"Roma (RM)",     stato:"In consegna",eta:"15/05/2026"},
    {id:"SDA9981200002",ordine:"#10250",cliente:"Anna Greco",      corriere:"sda",  destinazione:"Torino (TO)",   stato:"Preso in carico",eta:"17/05/2026"},
    {id:"GLS887701",   ordine:"#10251",cliente:"Luca Neri",       corriere:"gls",  destinazione:"Bologna (BO)",  stato:"Consegnato", eta:"14/05/2026"},
    {id:"PT7781902",   ordine:"#10247",cliente:"Davide Romano",   corriere:"poste",destinazione:"Napoli (NA)",   stato:"In transito",eta:"17/05/2026"},
    {id:"DHL44912",    ordine:"#10249",cliente:"Paolo Conti",     corriere:"dhl",  destinazione:"Firenze (FI)",  stato:"Consegnato", eta:"13/05/2026"}
  ],
  zones:[
    {nome:"Italia - Standard",   paesi:"Italia",                  metodo:"Standard 3-5gg", prezzo:"€ 5,90", grat:"€ 79,00"},
    {nome:"Italia - Express",    paesi:"Italia",                  metodo:"Express 24h",    prezzo:"€ 12,90",grat:"-"},
    {nome:"Italia - Isole",      paesi:"Sicilia, Sardegna",       metodo:"Standard 5-7gg", prezzo:"€ 9,90", grat:"€ 99,00"},
    {nome:"UE - Zona 1",         paesi:"FR, DE, ES, AT",          metodo:"Standard 4-6gg", prezzo:"€ 14,90",grat:"€ 149,00"},
    {nome:"UE - Zona 2",         paesi:"NL, BE, PT, GR",          metodo:"Standard 5-7gg", prezzo:"€ 17,90",grat:"€ 179,00"},
    {nome:"Mondo",               paesi:"Resto del mondo",         metodo:"DHL Express",    prezzo:"€ 29,90",grat:"-"}
  ],
  pickupPoints:[
    {nome:"Edicola Centro",         indirizzo:"Via Roma 12, Milano",          corriere:"SDA",  orari:"Lun-Sab 7:00-19:30"},
    {nome:"Tabacchi San Lorenzo",   indirizzo:"Piazza Garibaldi 4, Roma",     corriere:"BRT",  orari:"Lun-Ven 6:30-20:00"},
    {nome:"PuntoPoste Crono",       indirizzo:"Corso Italia 88, Torino",      corriere:"Poste",orari:"Lun-Sab 8:00-19:00"},
    {nome:"Locker DHL Stazione",    indirizzo:"Stazione Centrale, Bologna",   corriere:"DHL",  orari:"24/7"},
    {nome:"Cartoleria Mazzini",     indirizzo:"Via Mazzini 7, Firenze",       corriere:"GLS",  orari:"Lun-Ven 9:00-13:00 / 16:00-19:30"}
  ],
  discounts:[
    {code:"SUMMER25",tipo:"Percentuale 25%",utilizzi:"148/500",scad:"30/06/2026",stato:"Attivo"},
    {code:"WELCOME10",tipo:"€ 10 sul primo ordine",utilizzi:"492/-",scad:"-",stato:"Attivo"},
    {code:"FREESHIP",tipo:"Spedizione gratuita",utilizzi:"233/1000",scad:"31/12/2026",stato:"Attivo"},
    {code:"BLACK40",tipo:"Percentuale 40%",utilizzi:"0/2000",scad:"30/11/2026",stato:"Pianificato"}
  ],
  apps:[
    {nome:"Klaviyo Email",cat:"Marketing",stato:"Attiva"},
    {nome:"Stripe Payments",cat:"Pagamenti",stato:"Attiva"},
    {nome:"Trustpilot Reviews",cat:"Recensioni",stato:"Attiva"},
    {nome:"Google Analytics 4",cat:"Analytics",stato:"Attiva"},
    {nome:"Meta Pixel",cat:"Marketing",stato:"Attiva"},
    {nome:"Fattura24",cat:"Fatturazione",stato:"Attiva"},
    {nome:"SDA Tracking API",cat:"Spedizioni",stato:"Attiva"},
    {nome:"Loox UGC",cat:"Recensioni",stato:"Disattiva"}
  ],
  newsletter: null
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
  return `<svg viewBox="0 0 600 220" preserveAspectRatio="none">
    <defs>
      <linearGradient id="g1" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="#7fc29b" stop-opacity=".4"/>
        <stop offset="100%" stop-color="#7fc29b" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <path d="M0,180 C60,140 120,160 180,120 C240,90 300,130 360,80 C420,50 480,90 540,60 L600,70 L600,220 L0,220 Z" fill="url(#g1)"/>
    <path d="M0,180 C60,140 120,160 180,120 C240,90 300,130 360,80 C420,50 480,90 540,60 L600,70" fill="none" stroke="#7fc29b" stroke-width="2.5"/>
    <path d="M0,200 C60,180 120,170 180,160 C240,150 300,140 360,150 C420,160 480,140 540,130 L600,135" fill="none" stroke="#e89aae" stroke-width="2" stroke-dasharray="4 3"/>
  </svg>`;
}

function toast(msg, type){
  const $t = $('#toast');
  $t.removeClass('show success error info').text(msg);
  if(type) $t.addClass(type);
  $t.addClass('show');
  setTimeout(()=> $t.removeClass('show'), 2200);
}

function openModal(title, body){
  $('#modalTitle').text(title);
  $('#modalBody').html(body);
  $('#modalBackdrop').addClass('show');
}
function closeModal(){ $('#modalBackdrop').removeClass('show'); }

/* ----------------- VIEWS ----------------- */
const VIEWS = {};

VIEWS.dashboard = function(){
  const k = DATA.kpi;
  return `
    ${pageHead("Buongiorno, Admin 👋","Ecco cosa è successo oggi nel tuo store.",`
      <button class="btn btn-soft btn-sm">Esporta</button>
      <button class="btn btn-primary btn-sm">+ Nuovo ordine</button>
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
      <button class="btn btn-ghost btn-sm">📤 Esporta</button>
      <button class="btn btn-primary btn-sm">+ Crea ordine</button>
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
              <tr data-id="${o.id}">
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
                  <button title="Stampa">🖨</button>
                  <button title="Elimina">🗑</button>
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
  return `
    ${pageHead("Fatture","Documenti fiscali emessi.",`<button class="btn btn-primary btn-sm">+ Nuova fattura</button>`)}
    <div class="table-card"><div class="table-wrap"><table class="data">
      <thead><tr><th>N°</th><th>Cliente</th><th>Data</th><th>Importo</th><th>Stato</th><th></th></tr></thead>
      <tbody>
        ${DATA.orders.slice(0,6).map((o,i)=>`
          <tr>
            <td><strong>F-2026/${1000+i}</strong></td>
            <td>${o.cliente}</td><td>${o.data}</td><td>${o.totale}</td>
            <td>${statusPill(i%3?'Inviata':'In attesa')}</td>
            <td class="row-actions"><button>📥</button><button>✉</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table></div></div>
  `;
};

VIEWS.returns = function(){
  return `
    ${pageHead("Resi","Gestisci richieste di reso e rimborsi.","")}
    <div class="grid grid-3">
      <div class="card kpi pink"><div class="icon-wrap">↩</div><span class="label">Aperti</span><span class="value">7</span></div>
      <div class="card kpi soft"><div class="icon-wrap">⏳</div><span class="label">In analisi</span><span class="value">3</span></div>
      <div class="card kpi green"><div class="icon-wrap">✅</div><span class="label">Rimborsati (mese)</span><span class="value">12</span></div>
    </div>
    <div class="table-card" style="margin-top:16px"><div class="table-wrap"><table class="data">
      <thead><tr><th>RMA</th><th>Ordine</th><th>Cliente</th><th>Motivo</th><th>Stato</th><th></th></tr></thead>
      <tbody>
        <tr><td>R-9921</td><td>#10248</td><td>Chiara Esposito</td><td>Taglia errata</td><td>${statusPill('In analisi')}</td><td class="row-actions"><button>👁</button></td></tr>
        <tr><td>R-9920</td><td>#10245</td><td>Marta Rinaldi</td><td>Difetto cucitura</td><td>${statusPill('Approvato')}</td><td class="row-actions"><button>👁</button></td></tr>
        <tr><td>R-9919</td><td>#10240</td><td>Andrea Russo</td><td>Non gradito</td><td>${statusPill('Rimborsato')}</td><td class="row-actions"><button>👁</button></td></tr>
      </tbody>
    </table></div></div>
  `;
};

/* ---------- PRODOTTI ---------- */
VIEWS.products = function(){
  return `
    ${pageHead("Prodotti","Gestisci catalogo, varianti, prezzi e magazzino.",`
      <button class="btn btn-ghost btn-sm">📥 Importa</button>
      <button class="btn btn-soft btn-sm">📤 Esporta</button>
      <button class="btn btn-primary btn-sm js-new-product">+ Nuovo prodotto</button>
    `)}
    <div class="card" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:14px">
      <input type="text" id="prodSearch" placeholder="Cerca prodotto..." style="flex:1;min-width:200px;padding:8px 12px;border:1px solid var(--line);border-radius:8px;background:#fafafa"/>
      <select class="btn btn-soft btn-sm"><option>Tutte le categorie</option><option>T-Shirt</option><option>Felpe</option><option>Pantaloni</option></select>
      <select class="btn btn-soft btn-sm"><option>Tutti gli stati</option><option>Attivi</option><option>Bozze</option><option>Esauriti</option></select>
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
    ${pageHead("Magazzino","Tracciamento giacenze in tutti i depositi.","")}
    <div class="table-card"><div class="table-wrap"><table class="data">
      <thead><tr><th>SKU</th><th>Prodotto</th><th>Deposito MI</th><th>Deposito RM</th><th>Totale</th><th>Stato</th></tr></thead>
      <tbody>
        ${DATA.products.map(p=>{
          const mi = Math.floor(p.stock*0.6), rm = p.stock-mi;
          return `<tr>
            <td>${p.id}</td><td>${p.nome}</td>
            <td>${mi}</td><td>${rm}</td><td><strong>${p.stock}</strong></td>
            <td>${statusPill(p.stock===0?'Esaurito':p.stock<10?'Scorta bassa':'OK')}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div></div>
  `;
};

VIEWS.collections = function(){
  const colls = ["Saldi Estivi","Nuovi Arrivi","Pastel Edition","Streetwear","Eco-Friendly","Best Seller"];
  return `
    ${pageHead("Collezioni","Raggruppa prodotti per campagne tematiche.",`<button class="btn btn-primary btn-sm">+ Nuova collezione</button>`)}
    <div class="grid grid-3">
      ${colls.map((c,i)=>`
        <div class="card" style="cursor:pointer">
          <div style="height:120px;border-radius:10px;background:linear-gradient(135deg,var(--pink) 0%,var(--green) 100%);margin-bottom:10px;display:flex;align-items:center;justify-content:center;font-size:28px;color:rgba(0,0,0,.3)">📚</div>
          <strong>${c}</strong>
          <p style="color:var(--muted);font-size:12px;margin-top:4px">${(i+3)*4} prodotti · ${i%2?'Pubblicata':'Bozza'}</p>
        </div>
      `).join('')}
    </div>
  `;
};

VIEWS.categories = function(){
  return `
    ${pageHead("Categorie","Struttura ad albero del catalogo.",`<button class="btn btn-primary btn-sm">+ Categoria</button>`)}
    <div class="card">
      <ul class="list-clean">
        <li><strong>👕 Abbigliamento</strong> <span class="badge badge-soft">128</span></li>
        <li style="padding-left:20px">– T-Shirt <span class="badge badge-soft">42</span></li>
        <li style="padding-left:20px">– Felpe & Hoodie <span class="badge badge-soft">28</span></li>
        <li style="padding-left:20px">– Camicie <span class="badge badge-soft">15</span></li>
        <li><strong>👖 Pantaloni</strong> <span class="badge badge-soft">34</span></li>
        <li><strong>👗 Vestiti</strong> <span class="badge badge-soft">27</span></li>
        <li><strong>👟 Scarpe</strong> <span class="badge badge-soft">52</span></li>
        <li><strong>🧢 Accessori</strong> <span class="badge badge-soft">68</span></li>
      </ul>
    </div>
  `;
};

VIEWS.transfers = function(){
  return `
    ${pageHead("Trasferimenti","Movimenti di magazzino tra depositi.","")}
    <div class="table-card"><div class="table-wrap"><table class="data">
      <thead><tr><th>ID</th><th>Origine</th><th>Destinazione</th><th>Articoli</th><th>Stato</th><th>Data</th></tr></thead>
      <tbody>
        <tr><td>T-220</td><td>Deposito MI</td><td>Deposito RM</td><td>48</td><td>${statusPill('In transito')}</td><td>14/05/2026</td></tr>
        <tr><td>T-219</td><td>Fornitore</td><td>Deposito MI</td><td>320</td><td>${statusPill('Consegnato')}</td><td>12/05/2026</td></tr>
        <tr><td>T-218</td><td>Deposito RM</td><td>Deposito MI</td><td>12</td><td>${statusPill('In attesa')}</td><td>10/05/2026</td></tr>
      </tbody>
    </table></div></div>
  `;
};

VIEWS.giftcards = function(){
  return `
    ${pageHead("Gift Card","Card prepagate digitali.",`<button class="btn btn-primary btn-sm">+ Emetti gift card</button>`)}
    <div class="grid grid-3">
      ${[25,50,100,200].map(v=>`
        <div class="card" style="background:linear-gradient(135deg,var(--green),var(--pink))">
          <h3 style="font-size:13px;color:#fff">MEMI Gift Card</h3>
          <div style="font-size:32px;font-weight:700;color:#fff;margin:14px 0">€ ${v}</div>
          <small style="color:#fff;opacity:.85">12 emesse · 4 utilizzate</small>
        </div>
      `).join('')}
    </div>
  `;
};

/* ---------- CLIENTI ---------- */
VIEWS.customers = function(){
  return `
    ${pageHead("Clienti","Anagrafica e cronologia acquisti.",`
      <button class="btn btn-soft btn-sm">📤 Esporta</button>
      <button class="btn btn-primary btn-sm">+ Nuovo cliente</button>
    `)}
    <div class="grid grid-4" style="margin-bottom:16px">
      <div class="card kpi green"><span class="label">Totale clienti</span><span class="value">${DATA.customers.length}</span></div>
      <div class="card kpi pink"><span class="label">VIP</span><span class="value">${DATA.customers.filter(c=>c.vip).length}</span></div>
      <div class="card kpi soft"><span class="label">Nuovi (mese)</span><span class="value">42</span></div>
      <div class="card kpi soft"><span class="label">Tasso ritorno</span><span class="value">38%</span></div>
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
    ${pageHead("Segmenti","Raggruppa i clienti per comportamento.",`<button class="btn btn-primary btn-sm">+ Nuovo segmento</button>`)}
    <div class="grid grid-3">
      ${[
        ["VIP","Speso > €500","18 clienti"],
        ["Nuovi","Primo ordine ultimi 30gg","42 clienti"],
        ["Inattivi","Nessun ordine da 90gg","127 clienti"],
        ["Carrelli abbandonati","Carrello creato non concluso","73 clienti"],
        ["Lover Pastel","Ha comprato collezione Pastel","56 clienti"],
        ["Sconto golosi","Ha usato uno sconto","204 clienti"]
      ].map(s=>`
        <div class="card">
          <h3>${s[0]}</h3>
          <p style="color:var(--muted);font-size:12px">${s[1]}</p>
          <p style="margin-top:10px"><strong>${s[2]}</strong></p>
        </div>
      `).join('')}
    </div>
  `;
};

VIEWS.reviews = function(){
  return `
    ${pageHead("Recensioni","Feedback dei clienti sui prodotti.","")}
    <div class="grid grid-2">
      ${[
        ["Sofia B.","T-Shirt Oversize",5,"Tessuto morbidissimo, vestibilità perfetta!"],
        ["Marco R.","Felpa Hoodie Pink",4,"Bella, taglia un po' grande."],
        ["Luca N.","Sneaker Bianche",5,"Comode da subito, consigliate!"],
        ["Anna G.","Borsa Tote",3,"Carina ma cuciture migliorabili."]
      ].map(r=>`
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <strong>${r[0]}</strong>
            <span style="color:#e89aae">${"★".repeat(r[2])}${"☆".repeat(5-r[2])}</span>
          </div>
          <small style="color:var(--muted);display:block;margin-bottom:8px">${r[1]}</small>
          <p>${r[3]}</p>
        </div>
      `).join('')}
    </div>
  `;
};

/* ---------- MARKETING ---------- */
VIEWS.marketing = function(){
  return `
    ${pageHead("Marketing","Campagne attive e performance.",`<button class="btn btn-primary btn-sm">+ Nuova campagna</button>`)}
    <div class="grid grid-3">
      <div class="card"><h3>Estate Pastel 🌸</h3><p style="color:var(--muted);font-size:12px">Email · 12.340 destinatari</p>
        <div style="margin-top:10px;display:flex;gap:14px"><div><strong>32%</strong><small style="display:block;color:var(--muted)">Open</small></div><div><strong>4,8%</strong><small style="display:block;color:var(--muted)">Click</small></div></div>
      </div>
      <div class="card"><h3>Black Sneakers</h3><p style="color:var(--muted);font-size:12px">Meta Ads · €450 budget</p>
        <div style="margin-top:10px;display:flex;gap:14px"><div><strong>2,1k</strong><small style="display:block;color:var(--muted)">Click</small></div><div><strong>4,2x</strong><small style="display:block;color:var(--muted)">ROAS</small></div></div>
      </div>
      <div class="card"><h3>Welcome Flow</h3><p style="color:var(--muted);font-size:12px">Automazione · 3 step</p>
        <div style="margin-top:10px;display:flex;gap:14px"><div><strong>892</strong><small style="display:block;color:var(--muted)">Iscritti</small></div><div><strong>€ 4.2k</strong><small style="display:block;color:var(--muted)">Generati</small></div></div>
      </div>
    </div>
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
    <div class="grid grid-3">
      <div class="card"><h3>Welcome 10%</h3><p style="color:var(--muted);font-size:12px">Trigger: prima visita</p><p style="margin-top:8px"><strong>1.840</strong> conversioni</p></div>
      <div class="card"><h3>Spedizione gratuita</h3><p style="color:var(--muted);font-size:12px">Trigger: scroll 50%</p><p style="margin-top:8px"><strong>522</strong> conversioni</p></div>
      <div class="card"><h3>Exit intent</h3><p style="color:var(--muted);font-size:12px">Trigger: uscita pagina</p><p style="margin-top:8px"><strong>299</strong> conversioni</p></div>
    </div>`;
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
  return `
    ${pageHead("Statistiche","Performance del tuo store.","")}
    <div class="grid grid-4">
      <div class="card kpi green"><span class="label">Sessioni</span><span class="value">28.450</span><span class="delta up">+9,2%</span></div>
      <div class="card kpi pink"><span class="label">Conversion rate</span><span class="value">2,84%</span><span class="delta up">+0,4pp</span></div>
      <div class="card kpi soft"><span class="label">Carrelli</span><span class="value">1.205</span><span class="delta down">-1,1%</span></div>
      <div class="card kpi green"><span class="label">Bounce</span><span class="value">38%</span><span class="delta up">-2,3pp</span></div>
    </div>
    <div class="card" style="margin-top:16px"><h3>Sessioni & Acquisti</h3><div class="chart-placeholder">${chartSVG()}</div></div>
  `;
};
VIEWS.reports = function(){
  return `${pageHead("Report","Reportistica avanzata.","")}<div class="grid grid-3">
    ${["Vendite per canale","Vendite per prodotto","Vendite per cliente","Sconti utilizzati","Inventario movimenti","Tasse riscosse"].map(r=>`
      <div class="card" style="cursor:pointer"><h3>📊 ${r}</h3><small style="color:var(--muted)">Aggiornato 5 min fa</small></div>
    `).join('')}
    </div>`;
};
VIEWS.liveview = function(){
  return `${pageHead("Live View","Cosa succede in questo momento sul tuo store.","")}
    <div class="grid grid-4">
      <div class="card kpi green"><span class="label">Visitatori ora</span><span class="value">37</span></div>
      <div class="card kpi pink"><span class="label">Carrelli attivi</span><span class="value">12</span></div>
      <div class="card kpi soft"><span class="label">Checkout in corso</span><span class="value">3</span></div>
      <div class="card kpi green"><span class="label">Vendite (1h)</span><span class="value">€ 482</span></div>
    </div>
    <div class="card" style="margin-top:16px;height:300px;background:linear-gradient(180deg,#fff,#fafafa);display:flex;align-items:center;justify-content:center;color:var(--muted)">🌍 Mappa visitatori in tempo reale</div>`;
};

/* ---------- CONTENUTI ---------- */
VIEWS.content = function(){
  return `${pageHead("Pagine","Pagine statiche del sito.",`<button class="btn btn-primary btn-sm">+ Nuova pagina</button>`)}
    <div class="table-card"><div class="table-wrap"><table class="data">
      <thead><tr><th>Titolo</th><th>URL</th><th>Stato</th><th>Modificata</th></tr></thead>
      <tbody>
        <tr><td><strong>Chi siamo</strong></td><td>/chi-siamo</td><td>${statusPill('Pubblicata')}</td><td>10/05/2026</td></tr>
        <tr><td><strong>Spedizioni & Resi</strong></td><td>/spedizioni</td><td>${statusPill('Pubblicata')}</td><td>02/05/2026</td></tr>
        <tr><td><strong>Termini e condizioni</strong></td><td>/termini</td><td>${statusPill('Pubblicata')}</td><td>15/01/2026</td></tr>
        <tr><td><strong>Lavora con noi</strong></td><td>/careers</td><td>${statusPill('Bozza')}</td><td>14/05/2026</td></tr>
      </tbody>
    </table></div></div>`;
};
VIEWS.blog = function(){
  return `${pageHead("Blog","Articoli e contenuti editoriali.",`<button class="btn btn-primary btn-sm">+ Nuovo articolo</button>`)}
    <div class="grid grid-3">
      ${["Guida ai capi pastello 2026","5 outfit per la primavera","Sostenibilità: il nostro impegno","Sneaker bianche: come abbinarle"].map((t,i)=>`
        <div class="card"><div style="height:100px;border-radius:8px;background:linear-gradient(135deg,var(--pink),var(--green));margin-bottom:10px"></div>
        <strong>${t}</strong><p style="color:var(--muted);font-size:12px;margin-top:4px">Pubblicato il 1${i}/05/2026</p></div>
      `).join('')}
    </div>`;
};
VIEWS.files = function(){
  return `${pageHead("File","Asset multimediali del negozio.",`<button class="btn btn-primary btn-sm">+ Carica file</button>`)}
    <div class="grid grid-4">
      ${Array.from({length:8}).map((_,i)=>`<div class="card" style="text-align:center"><div style="height:80px;background:var(--line-2);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:28px">🖼</div><small style="display:block;margin-top:8px">img-${1000+i}.jpg</small></div>`).join('')}
    </div>`;
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
      <button class="btn btn-ghost btn-sm">📥 Importa tariffe</button>
      <button class="btn btn-primary btn-sm">+ Aggiungi corriere</button>
    `)}

    <div class="grid grid-4" style="margin-bottom:16px">
      <div class="card kpi green"><div class="icon-wrap">📦</div><span class="label">Spedizioni totali</span><span class="value">${DATA.couriers.reduce((a,c)=>a+c.sped,0)}</span></div>
      <div class="card kpi pink"><div class="icon-wrap">⏱</div><span class="label">In transito</span><span class="value">42</span></div>
      <div class="card kpi soft"><div class="icon-wrap">⚠</div><span class="label">Ritardi</span><span class="value">${DATA.couriers.reduce((a,c)=>a+c.ritardi,0)}</span></div>
      <div class="card kpi green"><div class="icon-wrap">✓</div><span class="label">Consegnati (mese)</span><span class="value">${DATA.couriers.reduce((a,c)=>a+c.consegnati,0)}</span></div>
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
              <small style="color:var(--muted)">Ultimo ping: 2 min fa</small>
              ${c.attivo?'<span class="status-pill ok">Connesso</span>':'<span class="status-pill neutral">Non attivo</span>'}
            </div>
          </li>
        `).join('')}
      </ul>
    </div>
  `;
};

VIEWS.shipments = function(){
  return `
    ${pageHead("Spedizioni in corso","Monitora ogni pacco in tempo reale.",`
      <button class="btn btn-ghost btn-sm">📤 Esporta CSV</button>
      <button class="btn btn-primary btn-sm">+ Nuova spedizione</button>
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
            const courier = DATA.couriers.find(c=>c.code===s.corriere);
            return `<tr data-courier="${s.corriere}" data-status="${s.stato}">
              <td><strong>${s.id}</strong></td>
              <td>${s.ordine}</td>
              <td>${s.cliente}</td>
              <td><div style="display:flex;align-items:center;gap:6px"><div class="courier-logo ${s.corriere}" style="width:26px;height:26px;font-size:10px;border-radius:6px">${courier.slug}</div>${courier.nome.split(' ')[0]}</div></td>
              <td>${s.destinazione}</td>
              <td>${statusPill(s.stato)}</td>
              <td>${s.eta}</td>
              <td class="row-actions"><button class="js-track-detail" data-id="${s.id}" title="Dettaglio">📍</button><button title="Etichetta">🏷</button></td>
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
        <h3>Regole automatiche</h3>
        <ul class="list-clean">
          <li>Spedizione gratuita sopra <strong>€ 79</strong> in Italia <span class="badge badge-green">attiva</span></li>
          <li>Express gratuito per clienti VIP <span class="badge badge-green">attiva</span></li>
          <li>Consegna in giornata a Milano centro <span class="badge badge-soft">disattiva</span></li>
        </ul>
      </div>
      <div class="card">
        <h3>Pesi & Dimensioni</h3>
        <div class="kv">
          <div class="k">Peso default</div><div class="v">0,5 kg</div>
          <div class="k">Dim. default</div><div class="v">25 × 20 × 8 cm</div>
          <div class="k">Sovrapprezzo +1kg</div><div class="v">€ 1,20</div>
          <div class="k">Imballo personalizzato</div><div class="v">€ 0,90</div>
        </div>
      </div>
    </div>
  `;
};

VIEWS.pickup = function(){
  return `
    ${pageHead("Punti di ritiro","Network di pickup point per consegna alternativa.",`<button class="btn btn-primary btn-sm">+ Aggiungi punto</button>`)}
    <div class="table-card"><div class="table-wrap"><table class="data">
      <thead><tr><th>Nome</th><th>Indirizzo</th><th>Corriere</th><th>Orari</th><th></th></tr></thead>
      <tbody>
        ${DATA.pickupPoints.map(p=>`
          <tr>
            <td><strong>${p.nome}</strong></td>
            <td>${p.indirizzo}</td>
            <td><span class="badge badge-green">${p.corriere}</span></td>
            <td>${p.orari}</td>
            <td class="row-actions"><button>✏</button><button>🗺</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table></div></div>
    <div class="card" style="margin-top:16px;height:280px;background:linear-gradient(180deg,#f0f5f2,#fff);display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:14px">🗺 Mappa interattiva dei punti di ritiro (placeholder)</div>
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
      <button class="btn btn-soft btn-sm">📊 Statistiche</button>
      <button class="btn btn-ghost btn-sm">⚙ Impostazioni chat</button>
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
      <button class="btn btn-soft btn-sm" style="width:100%;margin-bottom:6px">🎁 Invia sconto -10%</button>
      <button class="btn btn-soft btn-sm" style="width:100%;margin-bottom:6px">📦 Vai all'ordine</button>
      <button class="btn btn-ghost btn-sm" style="width:100%">🚫 Blocca cliente</button>
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
  return `${pageHead("Finanza","Panoramica economica del negozio.","")}
    <div class="grid grid-4">
      <div class="card kpi green"><span class="label">Saldo disponibile</span><span class="value">€ 8.452</span></div>
      <div class="card kpi pink"><span class="label">In attesa</span><span class="value">€ 1.230</span></div>
      <div class="card kpi soft"><span class="label">Spese (mese)</span><span class="value">€ 2.140</span></div>
      <div class="card kpi green"><span class="label">Margine medio</span><span class="value">42%</span></div>
    </div>
    <div class="card" style="margin-top:16px"><h3>Cash flow ultimi 30 giorni</h3><div class="chart-placeholder">${chartSVG()}</div></div>`;
};
VIEWS.payouts = function(){
  return `${pageHead("Pagamenti ricevuti","Bonifici dal gateway al tuo conto.","")}
    <div class="table-card"><div class="table-wrap"><table class="data">
      <thead><tr><th>Data</th><th>Importo</th><th>Metodo</th><th>Stato</th></tr></thead>
      <tbody>
        <tr><td>14/05/2026</td><td><strong>€ 4.382,00</strong></td><td>Stripe → IBAN</td><td>${statusPill('Pagato')}</td></tr>
        <tr><td>07/05/2026</td><td><strong>€ 3.928,00</strong></td><td>Stripe → IBAN</td><td>${statusPill('Pagato')}</td></tr>
        <tr><td>30/04/2026</td><td><strong>€ 5.120,00</strong></td><td>Stripe → IBAN</td><td>${statusPill('Pagato')}</td></tr>
      </tbody>
    </table></div></div>`;
};
VIEWS.bills = function(){
  return `${pageHead("Fatture & Spese","Spese del negozio (piano, app, dominio).","")}
    <div class="table-card"><div class="table-wrap"><table class="data">
      <thead><tr><th>Descrizione</th><th>Categoria</th><th>Data</th><th>Importo</th></tr></thead>
      <tbody>
        <tr><td>Piano Pro mensile</td><td>Abbonamento</td><td>01/05/2026</td><td>€ 79,00</td></tr>
        <tr><td>App Klaviyo</td><td>Marketing</td><td>03/05/2026</td><td>€ 45,00</td></tr>
        <tr><td>Dominio memi.it (rinnovo)</td><td>Dominio</td><td>10/05/2026</td><td>€ 12,00</td></tr>
      </tbody>
    </table></div></div>`;
};
VIEWS.taxes = function(){
  return `${pageHead("Tasse","Configurazione IVA e regimi fiscali.","")}
    <div class="grid grid-2">
      <div class="card"><h3>IVA Italia</h3><div class="kv">
        <div class="k">Aliquota standard</div><div class="v">22%</div>
        <div class="k">Aliquota ridotta</div><div class="v">10%</div>
        <div class="k">Inclusa nel prezzo</div><div class="v">Sì</div>
      </div></div>
      <div class="card"><h3>UE OSS</h3><div class="kv">
        <div class="k">Stato</div><div class="v"><span class="badge badge-green">Attivo</span></div>
        <div class="k">Soglia annuale</div><div class="v">€ 10.000</div>
        <div class="k">Venduto YTD</div><div class="v">€ 7.840</div>
      </div></div>
    </div>`;
};

/* ---------- CANALI ---------- */
VIEWS["online-store"] = function(){
  return `${pageHead("Negozio online","Tema, dominio e configurazione del sito.",`<button class="btn btn-primary btn-sm">🎨 Personalizza tema</button>`)}
    <div class="grid grid-3">
      <div class="card"><h3>Tema attivo</h3><p>Pastel Minimal v2.4</p><small style="color:var(--muted)">Aggiornato 3 giorni fa</small></div>
      <div class="card"><h3>Dominio</h3><p>memi.it</p><small style="color:var(--muted)">SSL attivo · Scade 12/02/2027</small></div>
      <div class="card"><h3>Velocità</h3><p>Score: <strong>92/100</strong></p><small style="color:var(--muted)">Ultima analisi ieri</small></div>
    </div>`;
};
VIEWS.pos = function(){
  return `${pageHead("Punto Vendita","Configura POS fisici collegati allo store.","")}
    <div class="grid grid-2">
      <div class="card"><h3>📍 MEMI Milano - Brera</h3><p style="color:var(--muted)">Via Brera 14, Milano</p><p style="margin-top:8px"><span class="badge badge-green">Online</span> · 3 staff connessi</p></div>
      <div class="card"><h3>📍 MEMI Roma - Trastevere</h3><p style="color:var(--muted)">Vicolo del Cinque 8, Roma</p><p style="margin-top:8px"><span class="badge badge-green">Online</span> · 2 staff connessi</p></div>
    </div>`;
};
VIEWS.social = function(){
  return `${pageHead("Social & Marketplace","Vendi sui canali esterni.","")}
    <div class="grid grid-3">
      ${[["Instagram Shopping","Connesso","green"],["Facebook Shop","Connesso","green"],["TikTok Shop","Da configurare","soft"],["Amazon","Disconnesso","soft"],["Zalando","Da configurare","soft"],["Google Shopping","Connesso","green"]].map(s=>`
        <div class="card"><h3>${s[0]}</h3><span class="badge badge-${s[2]==='green'?'green':'soft'}">${s[1]}</span></div>
      `).join('')}
    </div>`;
};

/* ---------- SISTEMA ---------- */
VIEWS.apps = function(){
  return `${pageHead("App installate","Estendi le funzionalità del tuo store.",`<button class="btn btn-primary btn-sm">+ App Store</button>`)}
    <div class="grid grid-3">
      ${DATA.apps.map(a=>`
        <div class="card">
          <div style="display:flex;align-items:center;gap:10px">
            <div style="width:42px;height:42px;border-radius:10px;background:var(--line-2);display:flex;align-items:center;justify-content:center;font-size:18px">🧩</div>
            <div><strong>${a.nome}</strong><small style="display:block;color:var(--muted)">${a.cat}</small></div>
          </div>
          <div style="margin-top:10px;display:flex;justify-content:space-between;align-items:center">
            ${statusPill(a.stato)}
            <button class="btn btn-soft btn-sm">Apri</button>
          </div>
        </div>
      `).join('')}
    </div>`;
};
VIEWS.integrations = function(){
  return `${pageHead("Integrazioni","Webhook e API esterne.","")}
    <div class="card"><h3>Webhook attivi</h3>
      <ul class="list-clean">
        <li><span>order.created → https://hook.memi.it/orders</span> <span class="badge badge-green">attivo</span></li>
        <li><span>order.fulfilled → https://erp.memi.it/api/ship</span> <span class="badge badge-green">attivo</span></li>
        <li><span>customer.created → https://crm.memi.it/leads</span> <span class="badge badge-soft">disattivo</span></li>
      </ul>
    </div>`;
};
VIEWS.staff = function(){
  return `${pageHead("Staff & Permessi","Account collaboratori del negozio.",`<button class="btn btn-primary btn-sm">+ Invita staff</button>`)}
    <div class="table-card"><div class="table-wrap"><table class="data">
      <thead><tr><th>Nome</th><th>Email</th><th>Ruolo</th><th>Ultimo accesso</th></tr></thead>
      <tbody>
        <tr><td><div style="display:flex;align-items:center;gap:8px"><div class="avatar small">A</div><strong>Admin Owner</strong></div></td><td>admin@memi.it</td><td><span class="badge badge-pink">Owner</span></td><td>ora</td></tr>
        <tr><td><div style="display:flex;align-items:center;gap:8px"><div class="avatar small">G</div><strong>Giulia Magazziniere</strong></div></td><td>g.magazz@memi.it</td><td><span class="badge badge-green">Magazzino</span></td><td>2h fa</td></tr>
        <tr><td><div style="display:flex;align-items:center;gap:8px"><div class="avatar small">M</div><strong>Mario CSM</strong></div></td><td>m.cs@memi.it</td><td><span class="badge badge-soft">Customer Care</span></td><td>ieri</td></tr>
      </tbody>
    </table></div></div>`;
};

VIEWS.settings = function(){
  return `${pageHead("Impostazioni","Configurazione generale del negozio.","")}
    <div class="grid grid-3">
      ${[
        ["🏬","Generale","Nome, indirizzo, fuso orario"],
        ["💳","Pagamenti","Gateway e metodi accettati"],
        ["🚚","Spedizioni","Zone, tariffe, imballi"],
        ["💶","Tasse","IVA, regimi fiscali"],
        ["📧","Email","Template e notifiche"],
        ["🔔","Notifiche","Push, email, sms"],
        ["🌍","Lingue","Multi-lingua e valute"],
        ["🔐","Sicurezza","2FA, log accessi"],
        ["🗂","Dati & Privacy","GDPR, esportazione dati"]
      ].map(s=>`
        <div class="card" style="cursor:pointer">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
            <div style="width:40px;height:40px;border-radius:10px;background:var(--green);display:flex;align-items:center;justify-content:center;font-size:18px">${s[0]}</div>
            <strong>${s[1]}</strong>
          </div>
          <p style="color:var(--muted);font-size:12px">${s[2]}</p>
        </div>
      `).join('')}
    </div>`;
};

/* ----------------- ROUTING ----------------- */
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
          <div class="prod-thumb">${p.img}</div>
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
            <td><div style="display:flex;align-items:center;gap:8px"><span style="font-size:18px">${p.img}</span>${p.nome}</div></td>
            <td>${p.cat}</td><td><strong>${p.prezzo}</strong></td><td>${p.stock}</td>
            <td>${statusPill(p.status)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table></div></div>`;
    $('#productsArea').html(html);
  }
}

/* ----------------- TRACKING SIMULATION ----------------- */
function runTracking(){
  const code = $('#trackInput').val();
  const courier = $('#trackCourier').val();
  if(!code) return;
  const c = DATA.couriers.find(c=>c.code===courier) || DATA.couriers[0];
  const $r = $('#trackingResult');
  $r.html('<div class="card"><p style="text-align:center;color:var(--muted)">⏳ Caricamento dati corriere...</p></div>');
  setTimeout(()=>{
    $r.html(`
      <div class="card">
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px">
          <div class="courier-logo ${c.code}">${c.slug}</div>
          <div>
            <h3>${c.nome}</h3>
            <small style="color:var(--muted)">Tracking: <strong>${code}</strong></small>
          </div>
          <div style="margin-left:auto">${statusPill('In transito')}</div>
        </div>

        <div class="kv" style="margin-bottom:14px">
          <div class="k">Mittente</div><div class="v">MEMI Store - Magazzino Milano</div>
          <div class="k">Destinatario</div><div class="v">Sofia Bianchi - Milano (MI)</div>
          <div class="k">Peso</div><div class="v">1,2 kg</div>
          <div class="k">Consegna stimata</div><div class="v">16/05/2026 entro le 18:00</div>
        </div>

        <h3>Tracciamento</h3>
        <div class="timeline">
          <div class="timeline-item current">
            <div class="ts">15/05/2026 · 14:32 · Hub Milano Linate</div>
            <div class="ev">📍 In transito verso filiale di destinazione</div>
          </div>
          <div class="timeline-item done">
            <div class="ts">15/05/2026 · 09:18 · Centro smistamento Bologna</div>
            <div class="ev">✓ Pacco smistato</div>
          </div>
          <div class="timeline-item done">
            <div class="ts">14/05/2026 · 22:04 · Hub Bologna</div>
            <div class="ev">✓ Arrivato al centro di smistamento</div>
          </div>
          <div class="timeline-item done">
            <div class="ts">14/05/2026 · 17:45 · Filiale Roma Sud</div>
            <div class="ev">✓ Spedizione presa in carico</div>
          </div>
          <div class="timeline-item done">
            <div class="ts">14/05/2026 · 11:30 · MEMI Store</div>
            <div class="ev">✓ Etichetta generata e affidata al corriere</div>
          </div>
        </div>

        <div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-soft btn-sm">📥 Scarica etichetta</button>
          <button class="btn btn-ghost btn-sm">📧 Invia tracking al cliente</button>
          <button class="btn btn-ghost btn-sm">📞 Contatta corriere</button>
        </div>
      </div>
    `);
  }, 600);
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
      setActiveNav(view);
      renderView(view);
    }
  });

  // Modal
  $('#modalClose, #modalBackdrop').on('click', function(e){
    if(e.target.id==='modalClose' || e.target.id==='modalBackdrop') closeModal();
  });

  // Search top
  $('#topSearch').on('keypress', function(e){
    if(e.which===13){
      toast(`Ricerca per "${$(this).val()}" (demo)`, 'info');
    }
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
    openModal(`Configurazione - ${c.nome}`, `
      <div class="kv">
        <div class="k">API Key</div><div class="v">••••••••••••${c.code.toUpperCase()}9F2</div>
        <div class="k">Endpoint</div><div class="v">https://api.${c.code}.it/v2</div>
        <div class="k">Mittente</div><div class="v">MEMI Store SRL</div>
        <div class="k">Account ID</div><div class="v">MEMI-${c.code.toUpperCase()}-001</div>
        <div class="k">Pickup automatico</div><div class="v"><label class="switch"><input type="checkbox" checked><span class="slider"></span></label></div>
        <div class="k">Notifiche cliente</div><div class="v"><label class="switch"><input type="checkbox" checked><span class="slider"></span></label></div>
      </div>
      <div style="margin-top:18px;display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-ghost btn-sm">🔄 Test connessione</button>
        <button class="btn btn-primary btn-sm">💾 Salva</button>
      </div>
    `);
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
    const c = DATA.couriers.find(c=>c.code===s.corriere);
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
        <button class="btn btn-soft btn-sm">📍 Apri tracking completo</button>
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
          ${dbId ? `<button class="btn btn-soft btn-sm js-open-ship-modal" data-id="${dbId}" data-order="${o.id}">🚚 Spedisci</button>` : ''}
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
  $(document).on('click','.js-edit-product', function(){
    const id = $(this).data('id');
    if (!id || !window.AdminAPI) return;
    AdminAPI.products.get(id).done(function(p){
      openModal(`Modifica: ${p.name}`, `
        <form id="editProductForm">
          <div class="kv" style="grid-template-columns:120px 1fr;gap:10px">
            <div class="k">Nome *</div><div class="v"><input class="field-input" type="text" name="name" value="${p.name||''}" required style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px"/></div>
            <div class="k">Categoria *</div><div class="v"><input class="field-input" type="text" name="categoria" value="${p.categoria||''}" required style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px"/></div>
            <div class="k">Prezzo €</div><div class="v"><input class="field-input" type="number" name="price" step="0.01" value="${p.price||''}" style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px"/></div>
            <div class="k">Stato</div><div class="v">
              <select name="status" style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px">
                ${['attivo','bozza','esaurito'].map(s=>`<option value="${s}" ${p.status===s?'selected':''}>${AdminAPI.statusLabel(s)}</option>`).join('')}
              </select>
            </div>
            <div class="k">Descrizione</div><div class="v"><textarea name="description" rows="3" style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px">${p.description||''}</textarea></div>
          </div>
          <div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">
            <button type="button" class="btn btn-ghost btn-sm" onclick="closeModal()">Annulla</button>
            <button type="submit" class="btn btn-primary btn-sm" data-id="${id}">💾 Salva modifiche</button>
          </div>
        </form>
      `);
      $('#editProductForm').on('submit', function(e){
        e.preventDefault();
        const fd = Object.fromEntries(new FormData(this));
        const $btn = $(this).find('[type=submit]');
        $btn.prop('disabled',true).text('Salvataggio…');
        AdminAPI.products.update(id, {
          name: fd.name, categoria: fd.categoria,
          price: parseFloat(fd.price), status: fd.status,
          description: fd.description
        }).done(function(){
          toast('Prodotto aggiornato','success');
          closeModal();
          renderView('products');
        }).fail(function(){ toast('Errore aggiornamento','error'); $btn.prop('disabled',false).text('💾 Salva modifiche'); });
      });
    }).fail(function(){ toast('Errore caricamento prodotto','error'); });
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
      const txt = $(this).text().toLowerCase();
      if(f==='tutti') $(this).show();
      else if(f==='non pagati') $(this).toggle(txt.includes('attesa'));
      else if(f==='da spedire') $(this).toggle(txt.includes('preparaz'));
      else if(f==='spediti') $(this).toggle(txt.includes('spedit') || txt.includes('consegnato'));
      else if(f==='annullati') $(this).toggle(txt.includes('annul') || txt.includes('rimbors'));
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
          <div class="k">Categoria *</div><div class="v"><input class="field-input" type="text" name="categoria" placeholder="es. Vestiti" required style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px"/></div>
          <div class="k">Prezzo € *</div><div class="v"><input class="field-input" type="number" name="price" step="0.01" min="0" placeholder="0.00" required style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px"/></div>
          <div class="k">Prezzo orig. €</div><div class="v"><input class="field-input" type="number" name="original_price" step="0.01" min="0" placeholder="(se scontato)" style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px"/></div>
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
      AdminAPI.products.create({
        id: fd.id.trim().toLowerCase().replace(/\s+/g, '-'),
        name: fd.name, categoria: fd.categoria,
        price: parseFloat(fd.price),
        original_price: fd.original_price ? parseFloat(fd.original_price) : null,
        status: fd.status, description: fd.description, taglie: taglie,
      }).done(function(){
        toast('Prodotto creato', 'success');
        closeModal();
        renderView('products');
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
              <option value="bozza">Bozza / Pianificato</option>
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

  /* SHIP ORDER */
  $(document).on('click','.js-open-ship-modal', function(){
    const dbId    = $(this).data('id');
    const orderNr = $(this).data('order');
    const couriers = DATA.couriers && DATA.couriers.length ? DATA.couriers : [
      {code:'sda',nome:'SDA'},{code:'brt',nome:'BRT'},{code:'gls',nome:'GLS'},
      {code:'poste',nome:'Poste Italiane'},{code:'dhl',nome:'DHL'}
    ];
    const courierOpts = couriers.map(function(c){ return '<option value="' + c.code + '">' + c.nome + '</option>'; }).join('');
    openModal('Spedisci ordine ' + orderNr, `
      <form id="shipForm">
        <div class="kv" style="grid-template-columns:130px 1fr;gap:10px">
          <div class="k">Corriere *</div><div class="v">
            <select name="courier_code" required style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px">
              ${courierOpts}
            </select>
          </div>
          <div class="k">Tracking # *</div><div class="v"><input type="text" name="tracking_number" required placeholder="es. SDA1234567890" style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px"/></div>
          <div class="k">Destinazione</div><div class="v"><input type="text" name="destinazione" placeholder="es. Roma (RM)" style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px"/></div>
          <div class="k">ETA</div><div class="v"><input type="date" name="eta" style="width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px"/></div>
        </div>
        <p style="margin-top:12px;font-size:12px;color:var(--muted)">Lo stato ordine verra impostato a <strong>Spedito</strong> e il pagamento a <strong>Pagato</strong>.</p>
        <div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">
          <button type="button" class="btn btn-ghost btn-sm" onclick="closeModal()">Annulla</button>
          <button type="submit" class="btn btn-primary btn-sm">Conferma spedizione</button>
        </div>
      </form>
    `);
    $('#shipForm').on('submit', function(e){
      e.preventDefault();
      if (!window.AdminAPI) return;
      const fd   = Object.fromEntries(new FormData(this));
      const $btn = $(this).find('[type=submit]');
      $btn.prop('disabled', true).text('Invio...');
      AdminAPI.orders.ship(dbId, {
        courier_code:    fd.courier_code,
        tracking_number: fd.tracking_number,
        destinazione:    fd.destinazione || null,
        eta:             fd.eta || null,
      }).done(function(){
        toast('Ordine spedito', 'success');
        closeModal();
        renderView('orders');
      }).fail(function(xhr){
        const msg = (xhr.responseJSON && xhr.responseJSON.error) || 'Errore spedizione';
        toast(msg, 'error');
        $btn.prop('disabled', false).text('Conferma spedizione');
      });
    });
  });

  // ── Initial data load from API, then render dashboard ──
  // NOTE: calls _origRenderView (not renderView) to avoid the infinite loop
  // where overridden renderView('dashboard') would re-trigger loadDashboardData.
  function loadDashboardData() {
    const api = window.AdminAPI;
    if (!api) { (typeof _origRenderView === 'function' ? _origRenderView : renderView)('dashboard'); return; }

    $.when(
      api.dashboard.kpis(),
      api.dashboard.recentOrders(),
      api.dashboard.topProducts(),
      api.shipping.shipments()
    ).done(function(kpiRes, ordersRes, topRes, shipRes) {
      var kpi      = kpiRes[0]   || {};
      var recent   = ordersRes[0]|| [];
      var topProds = topRes[0]   || [];
      var shipList = shipRes[0]  || [];

      // KPIs — backend returns {revenue:{value,delta,up}, orders:{...}, visitors:{...}, aov:{...}}
      if (kpi.revenue) {
        DATA.kpi = kpi;
        // Update sidebar orders badge with real pending orders count
        var pendingCount = parseInt((kpi.orders && kpi.orders.value) || 0);
        if (pendingCount > 0) $('.sidebar .badge-pink').first().text(pendingCount);
      }

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

      // Top products (from dashboard endpoint — lightweight name+
      // Top products (from dashboard endpoint — lightweight name+revenue data)
      if (Array.isArray(topProds) && topProds.length) {
        DATA.products = topProds.map(function(p) {
          var cat = (p.categoria || '').toLowerCase();
          var _iconMap2 = { vestiti:'👗', gonne:'👗', blazer:'🥻', top:'👕', pantaloni:'👖', borse:'👜', scarpe:'👟', gioielli:'💍', accessori:'✨', set:'✨', cinture:'🪡' };
          return {
            id:     p.product_id || p.id || '',
            nome:   p.product_name || p.name || '—',
            cat:    p.categoria   || '',
            prezzo: p.revenue     ? '€ ' + parseFloat(p.revenue).toFixed(2).replace('.', ',') : '—',
            stock:  p.units_sold  || 0,
            status: 'Attivo',
            img:    _iconMap2[cat] || '👗',
          };
        });
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
    const api = window.AdminAPI;
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
          var totalStock = 0;
          if (p.taglie && Array.isArray(p.taglie)) {
            p.taglie.forEach(function(t) { totalStock += (parseInt(t.stock) || 0); });
          }
          var _iconMap = {
            dress:'👗', bag:'👜', shoe:'👟', ring:'💍', earring:'👂', necklace:'💎',
            top:'👕', blazer:'🥻', cardigan:'🧶', jacket:'🧥', scarf:'🧣',
            pants:'👖', shorts:'🩳', skirt:'👗', sandal:'👡', sneaker:'👟',
            vestiti:'👗', gonne:'👗', pantaloni:'👖', borse:'👜', scarpe:'👟',
            gioielli:'💍', accessori:'✨', set:'✨', cinture:'🪡'
          };
          var icon = _iconMap[p.icon] || _iconMap[p.categoria] || '👗';
          return {
            id:     p.id,
            nome:   p.name,
            cat:    p.categoria,
            prezzo: 'EUR ' + parseFloat(p.price).toFixed(2).replace('.', ','),
            stock:  totalStock,
            status: AdminAPI.statusLabel(p.status || 'attivo'),
            img:    icon,
          };
        });
        _origRenderView(name);
      }).fail(function() { _origRenderView(name); });

    } else if (name === 'customers') {
      api.customers.list({ limit: 100 }).done(function(data) {
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
      $.when(api.shipping.couriers(), api.shipping.zones()).done(function(courRes, zoneRes) {
        var couriers = Array.isArray(courRes[0]) ? courRes[0] : [];
        var zones    = Array.isArray(zoneRes[0]) ? zoneRes[0] : [];
        DATA.couriers = couriers.map(function(c) {
          return { code: c.code, nome: c.nome, slug: c.slug || c.code.toUpperCase(), rate: 'EUR ' + parseFloat(c.rate || 0).toFixed(2), attivo: !!c.attivo, sped: 0, consegnati: 0, ritardi: 0 };
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
              return { code: c.code, nome: c.nome, slug: c.slug || c.code.toUpperCase(), rate: 'EUR ' + parseFloat(c.rate || 0).toFixed(2), attivo: !!c.attivo, sped: 0, consegnati: 0, ritardi: 0 };
            });
            _origRenderView(name);
          }).fail(function() { _origRenderView(name); });
        } else {
          _origRenderView(name);
        }
      }).fail(function() { _origRenderView(name); });

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

    } else if (name === 'dashboard') {
      loadDashboardData();
    } else {
      _origRenderView(name);
    }
  };

  // First load
  loadDashboardData();
});
