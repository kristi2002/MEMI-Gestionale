/* ============================================================
   ACCOUNT.JS — Memi Abbigliamento · Area Personale
   Renders the customer dashboard: Panoramica, Ordini, Lista
   desideri, Punti fedeltà, Carta fedeltà, I miei dati.
   Requires api-client.js + app.js loaded first.
   ============================================================ */
(function () {
  'use strict';

  var TOKEN_KEY = 'memi_token';
  var main = document.getElementById('accountMain');
  var loadedOrders = [];
  var loyaltyConfig = { pointValueEur: 0.01, minRedeem: 100 };

  /* ── Redirect if not logged in ─────────────────────── */
  var token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    main.innerHTML = '<div class="acc-redirect">' +
      '<p>Devi essere registrata per accedere alla tua area personale.</p>' +
      '<a href="/" onclick="window.openAuthDrawer&&window.openAuthDrawer(\'login\');return false;">Accedi al tuo account ›</a>' +
      '</div>';
    return;
  }

  /* ── Helpers ─────────────────────────────────────────── */
  function el(id){ return document.getElementById(id); }
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }

  function statusLabel(code) {
    var map = { in_attesa:'In attesa', in_preparazione:'In preparazione',
      spedito:'Spedita', consegnato:'Consegnato', annullato:'Annullato',
      pagato:'Pagato', non_pagato:'Da pagare', rimborsato:'Rimborsato' };
    return map[code] || code || '—';
  }
  function fmtDate(iso){ if(!iso) return '—';
    return new Date(iso).toLocaleDateString('it-IT',{day:'2-digit',month:'long',year:'numeric'}); }
  function fmtPrice(n){ return '€' + parseFloat(n||0).toFixed(2).replace('.',','); }

  /* ── Tiers (flower theme) ───────────────────────────── */
  var TIERS = [
    { key:'petalo',  name:'Petalo',   min:0,   color:'#C4A8B0' },
    { key:'fiore',   name:'Fiore',    min:200, color:'#A89BC4' },
    { key:'giardino',name:'Giardino', min:500, color:'#85A884' }
  ];
  function tierFor(points){
    var t = TIERS[0];
    for (var i=0;i<TIERS.length;i++){ if (points >= TIERS[i].min) t = TIERS[i]; }
    return t;
  }
  function nextTier(points){
    for (var i=0;i<TIERS.length;i++){ if (points < TIERS[i].min) return TIERS[i]; }
    return null;
  }

  /* ── Deterministic member number from user ──────────── */
  function memberNumber(user){
    var seed = String(user.id || user.email || user.nome || 'memi');
    var h = 0;
    for (var i=0;i<seed.length;i++){ h = (h*31 + seed.charCodeAt(i)) >>> 0; }
    var base = ('0000000000' + (h % 1e10)).slice(-10);
    return '2026' + base.slice(0,3) + base.slice(3);
  }
  function groupNumber(num){
    return num.replace(/(.{4})/g, '$1 ').trim();
  }

  /* ── Visual barcode (decorative, deterministic) ─────── */
  function barcodeSVG(num){
    var bars = [], x = 2, digits = num.replace(/\D/g,'');
    for (var i=0;i<digits.length;i++){
      var d = parseInt(digits.charAt(i),10);
      var widths = [ (d%3)+1, ((d+1)%3)+1, (d%2)+1, ((d>>1)%3)+1 ];
      for (var b=0;b<widths.length;b++){
        var w = widths[b];
        if (b % 2 === 0){ bars.push('<rect x="'+x+'" y="0" width="'+w+'" height="52" fill="#2b2130"/>'); }
        x += w + (b%2===0 ? 0 : 1);
      }
      x += 1;
    }
    var total = x + 2;
    return '<svg viewBox="0 0 '+total+' 52" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">'+bars.join('')+'</svg>';
  }

  function fidelityCardHTML(user, points){
    var t = tierFor(points);
    var num = memberNumber(user);
    var display = (user.nome || user.name || 'Cliente') + (user.cognome ? ' ' + user.cognome : '');
    return '<div class="fcard">' +
      '<div class="fcard-top">' +
        '<div class="fcard-logo">Memi<span>.</span></div>' +
        '<div class="fcard-tier">✦ ' + t.name + '</div>' +
      '</div>' +
      '<div class="fcard-chip"></div>' +
      '<div class="fcard-name">' +
        '<div class="lbl">Socia dal 2026</div>' +
        '<div class="val">' + esc(display) + '</div>' +
      '</div>' +
      '<div class="fcard-num">' + groupNumber(num).replace(/\d(?=(?:\D*\d){4})/g,'•') + '</div>' +
    '</div>';
  }

  /* ── Order rendering ───────────────────────────────── */
  function renderOrder(o){
    var items = (o.items||[]).map(function(i){ return i.product_name; }).join(', ') || '—';
    var trackingRow = '';
    if ((o.order_status==='spedito'||o.order_status==='consegnato') && o.tracking_number){
      trackingRow = '<div class="order-tracking">' +
        '<svg viewBox="0 0 24 24"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>' +
        '<strong>' + esc(o.courier_code||'Corriere') + ':</strong> <span>' + esc(o.tracking_number) + '</span></div>';
    }
    return '<div class="order-row"' + (trackingRow?' style="grid-template-rows:auto auto;"':'') + '>' +
      '<div><div class="order-number">' + esc(o.order_number) + '</div>' +
        '<div class="order-date">' + fmtDate(o.created_at) + '</div></div>' +
      '<div class="order-items-summary">' + esc(items) + '</div>' +
      '<div class="order-total">' + fmtPrice(o.total) + '</div>' +
      '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">' +
        '<span class="order-status ' + o.order_status + '">' + statusLabel(o.order_status) + '</span>' +
        '<button class="order-detail-btn" data-id="' + o.id + '">Dettaglio ›</button>' +
      '</div>' + trackingRow + '</div>';
  }
  function renderOrdersPanel(orders){
    if (!orders || !orders.length){
      return '<div class="ap-empty">' +
        '<svg viewBox="0 0 24 24"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>' +
        '<h3>Nessun ordine ancora</h3><p>Quando farai il tuo primo ordine, lo troverai qui.</p>' +
        '<a href="shop.html" class="btn-shop">Inizia lo shopping</a></div>';
    }
    return '<div class="orders-list">' + orders.map(renderOrder).join('') + '</div>';
  }

  /* Order detail modal */
  function showOrderDetail(orderId){
    var o = loadedOrders.filter(function(x){ return String(x.id)===String(orderId); })[0];
    var overlay = document.createElement('div');
    overlay.style.cssText='position:fixed;inset:0;background:rgba(30,20,35,.45);z-index:9000;display:flex;align-items:center;justify-content:center;padding:20px';
    var rows = o ? (o.items||[]).map(function(i){
      return '<tr><td style="padding:8px 0;font-size:.875rem">' + esc(i.product_name||'—') +
        (i.taglia?' <span style="color:var(--brown-light);font-size:.75rem">/ '+esc(i.taglia)+'</span>':'') + '</td>' +
        '<td style="text-align:center;font-size:.875rem;color:var(--brown-mid)">' + (i.qty||1) + '</td>' +
        '<td style="text-align:right;font-size:.875rem">' + fmtPrice(i.price) + '</td></tr>';
    }).join('') : '';
    overlay.innerHTML = '<div style="background:#fff;border-radius:14px;padding:26px 30px;max-width:560px;width:100%;max-height:82vh;overflow-y:auto">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">' +
        '<h3 style="font-family:var(--font-serif);font-size:1.3rem;font-weight:300">Ordine ' + (o?esc(o.order_number):'') + '</h3>' +
        '<button class="apCloseModal" style="background:none;border:none;font-size:20px;cursor:pointer;color:#999">✕</button></div>' +
      (o ? ('<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;margin-bottom:16px;font-size:.85rem">' +
          '<div><span style="color:var(--brown-light)">Data</span><br>' + fmtDate(o.created_at) + '</div>' +
          '<div><span style="color:var(--brown-light)">Stato</span><br><span class="order-status ' + o.order_status + '">' + statusLabel(o.order_status) + '</span></div>' +
          '<div><span style="color:var(--brown-light)">Pagamento</span><br>' + statusLabel(o.payment_status) + '</div>' +
          (o.tracking_number?'<div><span style="color:var(--brown-light)">Tracking</span><br>'+esc(o.courier_code||'')+' '+esc(o.tracking_number)+'</div>':'') +
        '</div>' +
        (rows ? '<table style="width:100%;border-collapse:collapse;border-top:1px solid var(--beige)">' +
          '<thead><tr style="font-size:.75rem;color:var(--brown-light);text-transform:uppercase;letter-spacing:.05em">' +
          '<th style="padding:8px 0;text-align:left;font-weight:500">Prodotto</th><th style="text-align:center;font-weight:500">Qtà</th><th style="text-align:right;font-weight:500">Prezzo</th></tr></thead>' +
          '<tbody>' + rows + '</tbody><tfoot><tr><td colspan="2" style="padding:10px 0;font-size:.85rem;font-weight:500;border-top:1px solid var(--beige)">Totale</td>' +
          '<td style="text-align:right;font-size:.95rem;font-weight:600;border-top:1px solid var(--beige)">' + fmtPrice(o.total) + '</td></tr></tfoot></table>' : '') +
        '<div style="margin-top:16px;text-align:right"><a href="returns.html" style="font-size:.8rem;color:var(--espresso);text-decoration:underline">Richiedi un reso ›</a></div>')
        : '<p style="color:var(--brown-light)">Impossibile caricare il dettaglio.</p>') +
      '</div>';
    document.body.appendChild(overlay);
    function close(){ overlay.remove(); }
    overlay.addEventListener('click', function(e){ if (e.target===overlay || e.target.classList.contains('apCloseModal')) close(); });
  }

  /* ── Wishlist ──────────────────────────────────────── */
  var catalogMap = {};
  function loadWishlist(){
    try { return JSON.parse(localStorage.getItem('memi_wishlist')) || []; } catch(_){ return []; }
  }
  function wishlistCount(){ return loadWishlist().length; }
  function renderWishlistPanel(){
    var items = loadWishlist();
    if (!items.length){
      return '<div class="ap-empty">' +
        '<svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>' +
        '<h3>La tua lista è vuota</h3><p>Salva i capi che ami con il cuoricino e ritrovali qui.</p>' +
        '<a href="shop.html" class="btn-shop">Scopri la collezione</a></div>';
    }
    return '<div class="wl-grid">' + items.map(function(item){
      var baseId = item.productId || item.id;
      var prod = catalogMap[baseId];
      if (!prod){ Object.keys(catalogMap).forEach(function(k){ if (String(item.id).indexOf(k)===0) prod = catalogMap[k]; }); }
      var href = prod ? '/product?id=' + baseId : '/product';
      var thumb = (prod && prod.img)
        ? '<img src="' + prod.img + '" alt="" loading="lazy">'
        : '<div class="ph ' + (item.colorKey||'ph-blush') + '"><svg viewBox="0 0 60 80" fill="none"><ellipse cx="30" cy="14" rx="10" ry="11" fill="white" opacity=".4"/><path d="M8 80 C8 55 52 55 52 80" fill="white" opacity=".4"/><rect x="14" y="26" width="32" height="34" rx="5" fill="white" opacity=".4"/></svg></div>';
      return '<div class="wl-card" data-id="' + esc(item.id) + '">' +
        '<a class="wl-thumb" href="' + href + '">' + thumb +
          '<button class="wl-remove" title="Rimuovi" data-wl-remove="' + esc(item.id) + '" aria-label="Rimuovi dai desideri">' +
          '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>' +
        '</a>' +
        '<div class="wl-body">' +
          '<a class="wl-name" href="' + href + '">' + esc(item.name||'Capo Memi') + '</a>' +
          '<div class="wl-meta">' + esc(item.color||'') + (item.taglia?' · '+esc(item.taglia):'') + '</div>' +
          '<div class="wl-actions">' +
            '<button class="wl-btn primary" data-wl-cart="' + esc(item.id) + '">Nel carrello</button>' +
            '<a class="wl-btn ghost" href="' + href + '">Vedi</a>' +
          '</div>' +
        '</div></div>';
    }).join('') + '</div>';
  }

  /* ── Loyalty ledger ────────────────────────────────── */
  function renderLoyaltyPanel(user, loy){
    var points = (loy && loy.points != null) ? loy.points : (user.points||0);
    var cfg = (loy && loy.config) || loyaltyConfig;
    var t = tierFor(points), nt = nextTier(points);
    var progHTML;
    if (nt){
      var span = nt.min - t.min, into = points - t.min;
      var pct = Math.max(4, Math.min(100, Math.round(into/span*100)));
      progHTML = '<div class="ap-tier-prog"><div class="ap-tier-prog-bar"><div class="ap-tier-prog-fill" style="width:' + pct + '%"></div></div>' +
        '<p class="ap-tier-prog-txt">Ti mancano <strong>' + (nt.min-points) + ' punti</strong> per il livello ' + nt.name + ' ✦</p></div>';
    } else {
      progHTML = '<div class="ap-tier-prog"><div class="ap-tier-prog-bar"><div class="ap-tier-prog-fill" style="width:100%"></div></div>' +
        '<p class="ap-tier-prog-txt">Hai raggiunto il livello massimo, <strong>Giardino</strong> 🌿 Grazie!</p></div>';
    }
    var ledger = (loy && loy.transactions && loy.transactions.length)
      ? '<div class="ap-block" style="margin-top:1.25rem"><h3>Movimenti recenti</h3>' +
        loy.transactions.slice(0,12).map(function(tx){
          return '<div class="loy-ledger-row"><span class="r">' + esc(tx.reason||'—') + '<br><span style="font-size:.7rem;color:var(--brown-light)">' + fmtDate(tx.created_at) + '</span></span>' +
            '<span class="d" style="color:' + (tx.delta>=0?'#3a7a55':'#b4607a') + '">' + (tx.delta>=0?'+':'') + tx.delta + '</span></div>';
        }).join('') + '</div>'
      : '';
    return '<div class="ap-block">' +
        '<h3>Il tuo saldo</h3>' +
        '<p style="font-size:1.1rem;margin-bottom:.2rem">Hai <strong style="font-family:var(--font-serif);font-size:1.7rem;color:var(--espresso)" id="loyBalance">' + points + '</strong> punti</p>' +
        progHTML +
        '<p style="font-size:.82rem;color:var(--brown-mid);margin:.9rem 0 .3rem">Ogni punto vale € ' + Number(cfg.pointValueEur||0.01).toFixed(2).replace('.',',') + '. Minimo ' + (cfg.minRedeem||100) + ' punti per un buono sconto.</p>' +
        '<div class="loy-redeem">' +
          '<input class="field-input" type="number" id="redeemPoints" min="0" placeholder="Punti da riscattare" style="max-width:200px" />' +
          '<button type="button" class="btn-outline" id="redeemBtn">Riscatta in buono</button>' +
        '</div>' +
        '<p id="redeemMsg" class="ap-msg" style="margin-top:.6rem"></p>' +
      '</div>' + ledger;
  }

  /* ── Card panel ────────────────────────────────────── */
  function renderCardPanel(user, points){
    var num = memberNumber(user);
    var t = tierFor(points);
    return '<div class="ap-two">' +
      '<div>' + fidelityCardHTML(user, points) +
        '<div class="fcard-barcode">' + barcodeSVG(num) + '<div class="code">' + num + '</div></div>' +
        '<p class="fcard-hint"><svg viewBox="0 0 24 24"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>' +
          'Mostra questo codice in negozio per accumulare punti sui tuoi acquisti e accedere ai vantaggi del livello ' + t.name + '.</p>' +
      '</div>' +
      '<div class="ap-block">' +
        '<h3>Come funziona</h3>' +
        '<div style="font-size:.86rem;color:var(--brown-mid);line-height:1.7">' +
          '<p style="margin-bottom:.7rem"><strong style="color:var(--espresso)">1 · Accumula</strong><br>Guadagni punti a ogni acquisto, online e in negozio.</p>' +
          '<p style="margin-bottom:.7rem"><strong style="color:var(--espresso)">2 · Sali di livello</strong><br>Petalo → Fiore → Giardino, con vantaggi crescenti.</p>' +
          '<p><strong style="color:var(--espresso)">3 · Riscatta</strong><br>Trasforma i punti in buoni sconto dalla sezione Punti fedeltà.</p>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  /* ── Overview ──────────────────────────────────────── */
  function greeting(){
    var h = new Date().getHours();
    if (h < 12) return 'Buongiorno';
    if (h < 18) return 'Buon pomeriggio';
    return 'Buonasera';
  }
  function renderOverview(user, orders, points){
    var wc = wishlistCount();
    var recent = orders && orders.length ? renderOrder(orders[0]) : '<p style="font-size:.85rem;color:var(--brown-light)">Nessun ordine ancora. <a href="shop.html" style="color:var(--espresso);text-decoration:underline">Inizia lo shopping ›</a></p>';
    var t = tierFor(points), nt = nextTier(points);
    var progTxt = nt ? ('Ti mancano <strong>' + (nt.min-points) + ' punti</strong> per il livello ' + nt.name)
                     : 'Sei al livello massimo, <strong>Giardino</strong> 🌿';
    var span = nt ? (nt.min - t.min) : 1, into = nt ? (points - t.min) : 1;
    var pct = nt ? Math.max(4, Math.min(100, Math.round(into/span*100))) : 100;
    return '<div class="ap-stats">' +
        '<button class="ap-stat" data-goto="loyalty"><span class="ap-stat-ic blush"><svg viewBox="0 0 24 24"><polygon points="12 2 15 8.5 22 9.3 17 14 18.2 21 12 17.5 5.8 21 7 14 2 9.3 9 8.5 12 2"/></svg></span>' +
          '<span><span class="ap-stat-num">' + points + '</span><span class="ap-stat-lbl">Punti fedeltà</span></span></button>' +
        '<button class="ap-stat" data-goto="orders"><span class="ap-stat-ic sage"><svg viewBox="0 0 24 24"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg></span>' +
          '<span><span class="ap-stat-num">' + (orders?orders.length:0) + '</span><span class="ap-stat-lbl">Ordini</span></span></button>' +
        '<button class="ap-stat" data-goto="wishlist"><span class="ap-stat-ic lav"><svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></span>' +
          '<span><span class="ap-stat-num">' + wc + '</span><span class="ap-stat-lbl">Nella lista desideri</span></span></button>' +
      '</div>' +
      '<div class="ap-two">' +
        '<div class="ap-block"><h3>Ordine più recente <a href="#" data-goto="orders">Tutti ›</a></h3>' + recent + '</div>' +
        '<div>' +
          fidelityCardHTML(user, points) +
          '<div class="ap-block" style="margin-top:1.25rem"><h3 style="margin-bottom:.6rem">Livello ' + t.name + '</h3>' +
            '<div class="ap-tier-prog-bar"><div class="ap-tier-prog-fill" style="width:' + pct + '%"></div></div>' +
            '<p class="ap-tier-prog-txt" style="margin-top:.5rem">' + progTxt + ' ✦</p></div>' +
        '</div>' +
      '</div>';
  }

  /* ── Profile ───────────────────────────────────────── */
  function renderProfile(user){
    function v(x){ return esc(x||''); }
    return '<form class="profile-form" id="profileForm">' +
        '<div><label class="field-label">Nome</label><input class="field-input" type="text" id="pfNome" value="' + v(user.nome) + '" /></div>' +
        '<div><label class="field-label">Cognome</label><input class="field-input" type="text" id="pfCognome" value="' + v(user.cognome) + '" /></div>' +
        '<div class="field-full"><label class="field-label">Email</label><input class="field-input" type="email" id="pfEmail" value="' + v(user.email) + '" /></div>' +
        '<div class="field-full"><label class="field-label">Telefono</label><input class="field-input" type="tel" id="pfTel" value="' + v(user.telefono) + '" /></div>' +
        '<div class="field-full"><label class="field-label">Indirizzo</label><input class="field-input" type="text" id="pfAddr" value="' + v(user.indirizzo) + '" /></div>' +
        '<div><label class="field-label">Città</label><input class="field-input" type="text" id="pfCitta" value="' + v(user.citta) + '" /></div>' +
        '<div><label class="field-label">CAP</label><input class="field-input" type="text" id="pfCap" value="' + v(user.cap) + '" /></div>' +
        '<div><label class="field-label">Paese</label><input class="field-input" type="text" id="pfPaese" value="' + v(user.paese||'Italia') + '" /></div>' +
        '<div class="profile-form-footer"><button type="submit" class="btn-primary-solid">Salva modifiche</button><span id="profileMsg" class="ap-msg"></span></div>' +
      '</form>' +
      '<div style="margin-top:1.75rem;padding-top:1.5rem;border-top:1px solid var(--beige)">' +
        '<h3 style="font-family:var(--font-serif);font-size:1.2rem;font-weight:400;margin-bottom:.35rem">Cambia password</h3>' +
        '<p style="font-size:.8rem;color:var(--brown-light);margin-bottom:1rem">Lascia vuoto per non modificarla.</p>' +
        '<form class="profile-form" id="passwordForm">' +
          '<div><label class="field-label">Nuova password</label><input class="field-input" type="password" id="pfPassNew" placeholder="Minimo 8 caratteri" /></div>' +
          '<div><label class="field-label">Conferma password</label><input class="field-input" type="password" id="pfPassConf" placeholder="Ripeti la password" /></div>' +
          '<div class="profile-form-footer"><button type="submit" class="btn-outline">Aggiorna password</button><span id="passMsg" class="ap-msg"></span></div>' +
        '</form></div>';
  }

  /* ── Nav config ────────────────────────────────────── */
  var NAV = [
    { key:'overview', label:'Panoramica',    icon:'<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>' },
    { key:'orders',   label:'I miei ordini', icon:'<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>' },
    { key:'wishlist', label:'Lista desideri', icon:'<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>' },
    { key:'loyalty',  label:'Punti fedeltà',  icon:'<polygon points="12 2 15 8.5 22 9.3 17 14 18.2 21 12 17.5 5.8 21 7 14 2 9.3 9 8.5 12 2"/>' },
    { key:'card',     label:'Carta fedeltà',  icon:'<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>' },
    { key:'profile',  label:'I miei dati',    icon:'<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>' }
  ];

  function navMarkup(activeKey, counts){
    var side = NAV.map(function(n){
      var c = counts[n.key];
      return '<button class="ap-nav-item' + (n.key===activeKey?' active':'') + '" data-panel="' + n.key + '">' +
        '<svg viewBox="0 0 24 24">' + n.icon + '</svg>' + n.label +
        (c ? '<span class="ap-nav-count">' + c + '</span>' : '') + '</button>';
    }).join('');
    var mob = NAV.map(function(n){
      return '<button class="ap-mobnav-item' + (n.key===activeKey?' active':'') + '" data-panel="' + n.key + '">' +
        '<svg viewBox="0 0 24 24">' + n.icon + '</svg>' + n.label + '</button>';
    }).join('');
    return { side:side, mob:mob };
  }

  /* ── Main render ───────────────────────────────────── */
  function renderPage(user, orders, loy){
    var points = (loy && loy.points != null) ? loy.points : (user.points||0);
    if (loy && loy.config) loyaltyConfig = loy.config;
    var initials = (user.nome || user.name || 'M').charAt(0).toUpperCase();
    var t = tierFor(points);
    var counts = { orders: (orders?orders.length:0)||'', wishlist: wishlistCount()||'' };
    var nav = navMarkup('overview', counts);

    var headTitles = {
      overview: ['<h1>' + greeting() + ', <em>' + esc(user.nome||user.name||'') + '</em></h1>', 'Ecco un riepilogo della tua area personale.'],
      orders:   ['<h1>I miei <em>ordini</em></h1>', 'Consulta lo stato e i dettagli dei tuoi ordini.'],
      wishlist: ['<h1>Lista dei <em>desideri</em></h1>', 'I capi che hai salvato con il cuoricino.'],
      loyalty:  ['<h1>Punti <em>fedeltà</em></h1>', 'Accumula punti e riscattali in buoni sconto.'],
      card:     ['<h1>La mia <em>carta</em></h1>', 'La tua carta fedeltà Memi, sempre con te.'],
      profile:  ['<h1>I miei <em>dati</em></h1>', 'Gestisci i tuoi dati personali e la password.']
    };
    function headFor(k){ var h=headTitles[k]; return '<div class="ap-panel-head">' + h[0] + '<p>' + h[1] + '</p></div>'; }

    main.innerHTML =
      '<nav class="ap-breadcrumb"><a href="index.html">Home</a>' +
        '<svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg><span>Area personale</span></nav>' +
      '<div class="ap-layout">' +
        '<aside class="ap-side">' +
          '<div class="ap-side-card">' +
            '<div class="ap-avatar">' + initials + '</div>' +
            '<div class="ap-side-name">' + esc(user.nome||user.name||'') + (user.cognome?' '+esc(user.cognome):'') + '</div>' +
            '<div class="ap-side-email">' + esc(user.email||'') + '</div>' +
            '<div class="ap-tier-badge"><span class="dot" style="background:' + t.color + '"></span>Livello ' + t.name + '</div>' +
          '</div>' +
          '<nav class="ap-nav" id="apNav">' + nav.side + '</nav>' +
          '<button class="ap-side-logout" id="logoutBtn"><svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>Esci</button>' +
        '</aside>' +
        '<div class="ap-content">' +
          '<div class="ap-mobnav" id="apMobNav">' + nav.mob + '</div>' +
          '<div class="ap-panel active" id="panel-overview">' + headFor('overview') + renderOverview(user, orders, points) + '</div>' +
          '<div class="ap-panel" id="panel-orders">' + headFor('orders') + renderOrdersPanel(orders) + '</div>' +
          '<div class="ap-panel" id="panel-wishlist">' + headFor('wishlist') + '<div id="wishlistMount">' + renderWishlistPanel() + '</div></div>' +
          '<div class="ap-panel" id="panel-loyalty">' + headFor('loyalty') + renderLoyaltyPanel(user, loy) + '</div>' +
          '<div class="ap-panel" id="panel-card">' + headFor('card') + renderCardPanel(user, points) + '</div>' +
          '<div class="ap-panel" id="panel-profile">' + headFor('profile') + renderProfile(user) + '</div>' +
        '</div>' +
      '</div>';

    wireEverything(user, points);
  }

  /* ── Wiring ────────────────────────────────────────── */
  function switchPanel(key){
    main.querySelectorAll('.ap-panel').forEach(function(p){ p.classList.remove('active'); });
    var panel = el('panel-' + key);
    if (panel) panel.classList.add('active');
    main.querySelectorAll('.ap-nav-item, .ap-mobnav-item').forEach(function(b){
      b.classList.toggle('active', b.dataset.panel === key);
    });
    if (key === 'wishlist'){ var m = el('wishlistMount'); if (m) m.innerHTML = renderWishlistPanel(); }
    window.scrollTo({ top:0, behavior:'smooth' });
  }

  function wireEverything(user, points){
    main.addEventListener('click', function(e){
      var nav = e.target.closest('[data-panel]');
      if (nav){ switchPanel(nav.dataset.panel); return; }
      var goto = e.target.closest('[data-goto]');
      if (goto){ e.preventDefault(); switchPanel(goto.dataset.goto); return; }
      var det = e.target.closest('.order-detail-btn');
      if (det){ showOrderDetail(det.dataset.id); return; }
      var rm = e.target.closest('[data-wl-remove]');
      if (rm){ e.preventDefault();
        if (window.appRemoveWishlist) window.appRemoveWishlist(rm.getAttribute('data-wl-remove'));
        else { var w = loadWishlist().filter(function(i){ return i.id !== rm.getAttribute('data-wl-remove'); });
               localStorage.setItem('memi_wishlist', JSON.stringify(w)); }
        var m = el('wishlistMount'); if (m) m.innerHTML = renderWishlistPanel();
        refreshCounts();
        return;
      }
      var cart = e.target.closest('[data-wl-cart]');
      if (cart){ e.preventDefault();
        if (window.appMoveToCart) window.appMoveToCart(cart.getAttribute('data-wl-cart'));
        setTimeout(function(){ var m = el('wishlistMount'); if (m) m.innerHTML = renderWishlistPanel(); refreshCounts(); }, 60);
        return;
      }
    });

    var lo = el('logoutBtn');
    if (lo) lo.addEventListener('click', function(){
      if (window.MemiAPI) window.MemiAPI.auth.logout();
      window.location.href = 'index.html';
    });

    var rbtn = el('redeemBtn');
    if (rbtn) rbtn.addEventListener('click', function(){
      var pts = parseInt((el('redeemPoints')||{}).value, 10) || 0;
      var msg = el('redeemMsg');
      if (!pts){ msg.className='ap-msg err'; msg.textContent='Inserisci i punti da riscattare.'; return; }
      rbtn.disabled = true; msg.className='ap-msg'; msg.textContent='Riscatto in corso…';
      window.MemiAPI.auth.redeemPoints(pts).then(function(r){
        msg.className='ap-msg ok';
        msg.innerHTML = 'Fatto! Codice <strong>' + esc(r.code) + '</strong> da € ' + Number(r.value).toFixed(2).replace('.',',') + ' — usalo al checkout.';
        var bal = el('loyBalance'); if (bal) bal.textContent = Math.max(0,(parseInt(bal.textContent,10)||0)-pts);
        rbtn.disabled = false;
      }).catch(function(err){ msg.className='ap-msg err'; msg.textContent=(err&&err.error)||'Errore nel riscatto.'; rbtn.disabled=false; });
    });

    var pf = el('profileForm');
    if (pf) pf.addEventListener('submit', function(e){
      e.preventDefault();
      var msgEl = el('profileMsg'), btn = pf.querySelector('[type=submit]');
      btn.disabled = true;
      window.MemiAPI.auth.updateMe({
        nome:el('pfNome').value.trim(), cognome:el('pfCognome').value.trim(), email:el('pfEmail').value.trim(),
        telefono:el('pfTel').value.trim(), indirizzo:el('pfAddr').value.trim(), citta:el('pfCitta').value.trim(),
        cap:el('pfCap').value.trim(), paese:el('pfPaese').value.trim()
      }).then(function(){ msgEl.className='ap-msg ok'; msgEl.textContent='Modifiche salvate ✓'; setTimeout(function(){msgEl.textContent='';},3000); })
        .catch(function(err){ msgEl.className='ap-msg err'; msgEl.textContent=(err&&err.error)||'Errore. Riprova.'; })
        .finally(function(){ btn.disabled=false; });
    });

    var pw = el('passwordForm');
    if (pw) pw.addEventListener('submit', function(e){
      e.preventDefault();
      var np=el('pfPassNew').value, cp=el('pfPassConf').value, msgEl=el('passMsg'), btn=pw.querySelector('[type=submit]');
      if (!np) return;
      if (np.length<8){ msgEl.className='ap-msg err'; msgEl.textContent='Minimo 8 caratteri.'; return; }
      if (np!==cp){ msgEl.className='ap-msg err'; msgEl.textContent='Le password non coincidono.'; return; }
      btn.disabled=true;
      window.MemiAPI.auth.updateMe({ password:np })
        .then(function(){ msgEl.className='ap-msg ok'; msgEl.textContent='Password aggiornata ✓'; pw.reset(); setTimeout(function(){msgEl.textContent='';},3000); })
        .catch(function(err){ msgEl.className='ap-msg err'; msgEl.textContent=(err&&err.error)||'Errore. Riprova.'; })
        .finally(function(){ btn.disabled=false; });
    });

    var hash = (location.hash||'').replace('#','');
    if (hash && NAV.some(function(n){ return n.key===hash; })) switchPanel(hash);
  }

  function refreshCounts(){
    var wc = wishlistCount();
    var navItem = main.querySelector('.ap-nav-item[data-panel="wishlist"]');
    if (navItem){
      var badge = navItem.querySelector('.ap-nav-count');
      if (wc){ if (badge) badge.textContent = wc; else navItem.insertAdjacentHTML('beforeend','<span class="ap-nav-count">'+wc+'</span>'); }
      else if (badge) badge.remove();
    }
    var stat = main.querySelector('.ap-stat[data-goto="wishlist"] .ap-stat-num');
    if (stat) stat.textContent = wc;
  }

  /* ── Load catalog (for wishlist images) ────────────── */
  function loadCatalog(){
    return fetch('/api/products?limit=300').then(function(r){ return r.json(); })
      .then(function(res){
        var products = Array.isArray(res) ? res : (res && res.products) || [];
        products.forEach(function(p){
          var img = '';
          if (Array.isArray(p.images) && p.images.length){
            var x = p.images[0]; img = (typeof x==='string') ? x : (x && (x.card||x.full||x.thumb)) || '';
          }
          catalogMap[p.id] = { img:img, name:p.name||'' };
        });
      }).catch(function(){ /* offline → placeholders */ });
  }

  /* ── Init ──────────────────────────────────────────── */
  if (!window.MemiAPI || !window.MemiAPI.auth.isLoggedIn()){
    window.location.href = 'index.html?login=required';
    return;
  }

  Promise.all([
    window.MemiAPI.auth.me(),
    window.MemiAPI.orders.myOrders().catch(function(){ return []; }),
    window.MemiAPI.auth.loyalty().catch(function(){ return null; }),
    loadCatalog()
  ]).then(function(results){
    var user   = results[0].user || results[0];
    var orders = Array.isArray(results[1]) ? results[1] : (results[1].orders || []);
    var loy    = results[2];
    loadedOrders = orders;
    renderPage(user, orders, loy);
  }).catch(function(){
    window.MemiAPI.auth.logout();
    window.location.href = 'index.html?session=expired';
  });

})();
