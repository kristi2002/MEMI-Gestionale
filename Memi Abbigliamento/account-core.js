/* ============================================================
   ACCOUNT-CORE.JS — Memi Abbigliamento · Area Personale
   Customer dashboard: Panoramica, Dati, Indirizzi, Taglie,
   Preferenze, Ordini, Reso, Punti, Carta, Desideri,
   Newsletter, Aiuto. Bilingual (IT/EN) ready.
   Requires api-client.js + app.js loaded first.
   ============================================================ */
(function () {
  'use strict';

  /* ══════════════════════════════════════════════════════════
     I18N — Italian (default) + English. Toggle is code-ready via
     window.MemiSetLang('en'|'it'); no visible switch is placed.
     ══════════════════════════════════════════════════════════ */
  var I18N = {
    it: {
      'crumb.home':'Home','crumb.area':'Area personale',
      'sec.account':'Il mio account','sec.orders':'Ordini & resi',
      'sec.loyalty':'Fedeltà & desideri','sec.support':'Assistenza',
      'nav.overview':'Panoramica','nav.profilo':'I miei dati','nav.indirizzi':'Indirizzi',
      'nav.taglie':'Le mie taglie','nav.preferenze':'Le mie preferenze',
      'nav.ordini':'I miei ordini','nav.reso':'Effettua un reso',
      'nav.loyalty':'Punti fedeltà','nav.carta':'Carta fedeltà','nav.wishlist':'Lista desideri',
      'nav.newsletter':'Newsletter','nav.aiuto':'Aiuto e contatti',
      'logout':'Esci','esc':'Esci',
      'head.overview.p':'Ecco un riepilogo della tua area personale.',
      'head.profilo.t':'I miei <em>dati</em>','head.profilo.p':'I tuoi dati personali e di accesso.',
      'head.indirizzi.t':'I miei <em>indirizzi</em>','head.indirizzi.p':'Gestisci i tuoi indirizzi di spedizione.',
      'head.taglie.t':'Le mie <em>taglie</em>','head.taglie.p':'Salva le tue taglie per trovare subito la vestibilità giusta.',
      'head.preferenze.t':'Le mie <em>preferenze</em>','head.preferenze.p':'Personalizza la tua esperienza Memi.',
      'head.ordini.t':'I miei <em>ordini</em>','head.ordini.p':'Consulta lo stato e i dettagli dei tuoi ordini.',
      'head.reso.t':'Effettua un <em>reso</em>','head.reso.p':'Hai 30 giorni per restituire i tuoi capi.',
      'head.loyalty.t':'Punti <em>fedeltà</em>','head.loyalty.p':'Accumula punti e riscattali in buoni sconto.',
      'head.carta.t':'La mia <em>carta</em>','head.carta.p':'La tua carta fedeltà Memi, sempre con te.',
      'head.wishlist.t':'Lista dei <em>desideri</em>','head.wishlist.p':'I capi che hai salvato con il cuoricino.',
      'head.newsletter.t':'<em>Newsletter</em>','head.newsletter.p':'Scegli cosa e quanto spesso ricevere.',
      'head.aiuto.t':'Aiuto e <em>contatti</em>','head.aiuto.p':'Siamo qui per aiutarti.',
      'stat.points':'Punti fedeltà','stat.orders':'Ordini','stat.wishlist':'Nella lista desideri',
      'ov.recent':'Ordine più recente','ov.all':'Tutti','ov.level':'Livello','ov.noorders':'Nessun ordine ancora.','ov.startshop':'Inizia lo shopping',
      'tier.next':'Ti mancano','tier.points_to':'punti per il livello','tier.max':'Sei al livello massimo,','tier.max2':'Grazie!',
      'field.nome':'Nome','field.cognome':'Cognome','field.email':'Email','field.tel':'Telefono','field.birthday':'Data di nascita',
      'field.indirizzo':'Indirizzo','field.citta':'Città','field.cap':'CAP','field.paese':'Paese',
      'btn.edit':'Modifica','btn.save':'Salva modifiche','btn.cancel':'Annulla','btn.add':'Aggiungi',
      'msg.saved':'Modifiche salvate ✓','msg.err':'Errore. Riprova.',
      'pwd.title':'Password','pwd.change':'Cambia password','pwd.new':'Nuova password','pwd.conf':'Conferma password',
      'pwd.hint':'Lascia vuoto per non modificarla.','pwd.min':'Minimo 8 caratteri.','pwd.nomatch':'Le password non coincidono.',
      'pwd.updated':'Password aggiornata ✓','pwd.update':'Aggiorna password','pwd.ph':'Minimo 8 caratteri','pwd.phc':'Ripeti la password',
      'addr.default':'Predefinito','addr.setdefault':'Rendi predefinito','addr.delete':'Elimina','addr.new':'Nuovo indirizzo',
      'addr.empty':'Nessun indirizzo salvato.','addr.label':'Etichetta (es. Casa, Ufficio)',
      'addr.civico':'Numero civico','addr.piano':'Piano (opzionale)','addr.campanello':'Nome sul campanello (opzionale)','addr.via.ph':'Inizia a digitare la via…','addr.via.hint':'Cerca e seleziona la via, il resto si compila da solo.',
      'sizes.top':'Taglia top','sizes.bottom':'Taglia pantaloni/gonne','sizes.dress':'Taglia vestiti','sizes.shoe':'Numero di scarpe',
      'sizes.notes':'Note sulla vestibilità','sizes.notes.ph':'Es. preferisco vestibilità morbida…','sizes.pick':'Seleziona','sizes.intro':'Salviamo le tue taglie per suggerirti la misura giusta e velocizzare gli acquisti.',
      'pref.cats':'Categorie preferite','pref.colors':'Colori preferiti','pref.contact':'Come vuoi essere contattata','pref.email':'Email','pref.sms':'SMS','pref.lang':'Lingua preferita',
      'pref.intro':'Le tue preferenze ci aiutano a mostrarti ciò che ami.',
      'news.sub':'Iscrizione newsletter','news.subscribed':'Sei iscritta ✓','news.unsub':'Non sei iscritta.','news.toggle_on':'Iscrivimi','news.toggle_off':'Disiscrivimi',
      'news.freq':'Frequenza','news.freq.weekly':'Settimanale','news.freq.biweekly':'Ogni 2 settimane','news.freq.monthly':'Mensile',
      'news.topics':'Argomenti','news.t.novita':'Novità','news.t.saldi':'Saldi & promo','news.t.editoriali':'Editoriali','news.t.eventi':'Eventi',
      'news.intro':'Ricevi in anteprima novità, offerte e ispirazioni di stile.',
      'reso.eligible':'Ordini idonei al reso','reso.none':'Nessun ordine idoneo al reso al momento.','reso.cta':'Richiedi reso','reso.info':'Il reso è gratuito entro 30 giorni dalla consegna. Prepara il pacco, applica l\'etichetta e affidalo al corriere.','reso.window':'Entro 30 giorni',
      'carta.show':'Mostra questo codice in negozio per accumulare punti sui tuoi acquisti e accedere ai vantaggi del livello',
      'carta.how':'Come funziona','carta.how1t':'1 · Accumula','carta.how1':'Guadagni punti a ogni acquisto, online e in negozio.',
      'carta.how2t':'2 · Sali di livello','carta.how2':'Petalo → Fiore → Giardino, con vantaggi crescenti.',
      'carta.how3t':'3 · Riscatta','carta.how3':'Trasforma i punti in buoni sconto dalla sezione Punti fedeltà.',
      'carta.benefits':'Vantaggi per livello','carta.current':'Il tuo livello','carta.member':'Socia dal 2026',
      'loy.balance':'Il tuo saldo','loy.have':'Hai','loy.points':'punti','loy.worth':'Ogni punto vale €','loy.min':'. Minimo','loy.min2':'punti per un buono sconto.',
      'loy.redeem':'Riscatta in buono','loy.redeem.ph':'Punti da riscattare','loy.redeem.empty':'Inserisci i punti da riscattare.','loy.redeem.wait':'Riscatto in corso…','loy.redeem.done':'Fatto! Codice','loy.redeem.use':'— usalo al checkout.','loy.redeem.err':'Errore nel riscatto.',
      'loy.movs':'Movimenti recenti',
      'wl.empty.t':'La tua lista è vuota','wl.empty.p':'Salva i capi che ami con il cuoricino e ritrovali qui.','wl.browse':'Scopri la collezione',
      'wl.tocart':'Nel carrello','wl.view':'Vedi','wl.remove':'Rimuovi','wl.page':'Pagina','wl.of':'di','wl.prev':'Precedente','wl.next':'Successivo',
      'ord.empty.t':'Nessun ordine ancora','ord.empty.p':'Quando farai il tuo primo ordine, lo troverai qui.','ord.shop':'Inizia lo shopping','ord.detail':'Dettaglio','ord.total':'Totale','ord.date':'Data','ord.status':'Stato','ord.pay':'Pagamento','ord.track':'Tracking','ord.product':'Prodotto','ord.qty':'Qtà','ord.price':'Prezzo','ord.reso':'Richiedi un reso','ord.nodetail':'Impossibile caricare il dettaglio.','ord.order':'Ordine',
      'ord.cancel':'Annulla ordine','ord.cancel.q':'Vuoi annullare questo ordine? Se già pagato, il rimborso verrà accreditato sul metodo di pagamento originale.','ord.cancel.yes':'Sì, annulla','ord.cancel.no':'No, mantieni','ord.cancelling':'Annullamento…','ord.cancel.ok':'Ordine annullato.','ord.cancel.okr':'Ordine annullato — rimborso emesso.','ord.cancel.err':'Impossibile annullare l\'ordine. Riprova o contatta l\'assistenza.',
      'reso.myreq':'Le mie richieste di reso','reso.rma':'RMA','reso.reqnone':'Nessuna richiesta di reso inviata.',
      'rst.aperto':'In attesa','rst.in_analisi':'In analisi','rst.approvato':'Approvato','rst.rifiutato':'Rifiutato','rst.rimborsato':'Rimborsato',
      'aiuto.contact':'Contattaci','aiuto.contact.p':'Scrivici, rispondiamo entro 24 ore nei giorni lavorativi.','aiuto.email':'Scrivi una email','aiuto.faq':'Domande frequenti','aiuto.q1':'Spedizioni & consegne','aiuto.q2':'Resi & rimborsi','aiuto.q3':'Guida alle taglie','aiuto.q4':'Traccia il tuo ordine',
      'st.in_attesa':'In attesa','st.in_preparazione':'In preparazione','st.spedito':'Spedita','st.consegnato':'Consegnato','st.annullato':'Annullato','st.pagato':'Pagato','st.non_pagato':'Da pagare','st.rimborsato':'Rimborsato',
      'greet.morning':'Buongiorno','greet.afternoon':'Buon pomeriggio','greet.evening':'Buonasera',
      'redirect':'Devi essere registrata per accedere alla tua area personale.','redirect.link':'Accedi al tuo account ›'
    },
    en: {
      'crumb.home':'Home','crumb.area':'My account',
      'sec.account':'My account','sec.orders':'Orders & returns',
      'sec.loyalty':'Loyalty & wishlist','sec.support':'Support',
      'nav.overview':'Overview','nav.profilo':'My details','nav.indirizzi':'Addresses',
      'nav.taglie':'My sizes','nav.preferenze':'My preferences',
      'nav.ordini':'My orders','nav.reso':'Start a return',
      'nav.loyalty':'Loyalty points','nav.carta':'Loyalty card','nav.wishlist':'Wishlist',
      'nav.newsletter':'Newsletter','nav.aiuto':'Help & contact',
      'logout':'Log out','esc':'Log out',
      'head.overview.p':'Here is an overview of your account.',
      'head.profilo.t':'My <em>details</em>','head.profilo.p':'Your personal and login details.',
      'head.indirizzi.t':'My <em>addresses</em>','head.indirizzi.p':'Manage your shipping addresses.',
      'head.taglie.t':'My <em>sizes</em>','head.taglie.p':'Save your sizes to find the right fit faster.',
      'head.preferenze.t':'My <em>preferences</em>','head.preferenze.p':'Personalise your Memi experience.',
      'head.ordini.t':'My <em>orders</em>','head.ordini.p':'Check the status and details of your orders.',
      'head.reso.t':'Start a <em>return</em>','head.reso.p':'You have 30 days to return your items.',
      'head.loyalty.t':'Loyalty <em>points</em>','head.loyalty.p':'Earn points and redeem them for vouchers.',
      'head.carta.t':'My <em>card</em>','head.carta.p':'Your Memi loyalty card, always with you.',
      'head.wishlist.t':'My <em>wishlist</em>','head.wishlist.p':'The pieces you saved with the little heart.',
      'head.newsletter.t':'<em>Newsletter</em>','head.newsletter.p':'Choose what and how often you receive.',
      'head.aiuto.t':'Help & <em>contact</em>','head.aiuto.p':'We are here to help.',
      'stat.points':'Loyalty points','stat.orders':'Orders','stat.wishlist':'In your wishlist',
      'ov.recent':'Most recent order','ov.all':'All','ov.level':'Level','ov.noorders':'No orders yet.','ov.startshop':'Start shopping',
      'tier.next':'You need','tier.points_to':'points to reach','tier.max':'You are at the top level,','tier.max2':'Thank you!',
      'field.nome':'First name','field.cognome':'Last name','field.email':'Email','field.tel':'Phone','field.birthday':'Date of birth',
      'field.indirizzo':'Address','field.citta':'City','field.cap':'ZIP','field.paese':'Country',
      'btn.edit':'Edit','btn.save':'Save changes','btn.cancel':'Cancel','btn.add':'Add',
      'msg.saved':'Changes saved ✓','msg.err':'Error. Please try again.',
      'pwd.title':'Password','pwd.change':'Change password','pwd.new':'New password','pwd.conf':'Confirm password',
      'pwd.hint':'Leave blank to keep it unchanged.','pwd.min':'Minimum 8 characters.','pwd.nomatch':'Passwords do not match.',
      'pwd.updated':'Password updated ✓','pwd.update':'Update password','pwd.ph':'Minimum 8 characters','pwd.phc':'Repeat the password',
      'addr.default':'Default','addr.setdefault':'Set as default','addr.delete':'Delete','addr.new':'New address',
      'addr.empty':'No saved addresses.','addr.label':'Label (e.g. Home, Office)',
      'addr.civico':'Street number','addr.piano':'Floor (optional)','addr.campanello':'Doorbell name (optional)','addr.via.ph':'Start typing the street…','addr.via.hint':'Search and pick the street — the rest fills in automatically.',
      'sizes.top':'Top size','sizes.bottom':'Trousers/skirt size','sizes.dress':'Dress size','sizes.shoe':'Shoe size',
      'sizes.notes':'Fit notes','sizes.notes.ph':'E.g. I prefer a relaxed fit…','sizes.pick':'Select','sizes.intro':'We save your sizes to suggest the right fit and speed up checkout.',
      'pref.cats':'Favourite categories','pref.colors':'Favourite colours','pref.contact':'How you want to be contacted','pref.email':'Email','pref.sms':'SMS','pref.lang':'Preferred language',
      'pref.intro':'Your preferences help us show you what you love.',
      'news.sub':'Newsletter subscription','news.subscribed':'You are subscribed ✓','news.unsub':'You are not subscribed.','news.toggle_on':'Subscribe','news.toggle_off':'Unsubscribe',
      'news.freq':'Frequency','news.freq.weekly':'Weekly','news.freq.biweekly':'Every 2 weeks','news.freq.monthly':'Monthly',
      'news.topics':'Topics','news.t.novita':'New in','news.t.saldi':'Sales & promos','news.t.editoriali':'Editorials','news.t.eventi':'Events',
      'news.intro':'Get early access to new arrivals, offers and style inspiration.',
      'reso.eligible':'Orders eligible for return','reso.none':'No orders eligible for return right now.','reso.cta':'Request return','reso.info':'Returns are free within 30 days of delivery. Pack your parcel, apply the label and hand it to the courier.','reso.window':'Within 30 days',
      'carta.show':'Show this code in store to earn points on your purchases and unlock the benefits of the level',
      'carta.how':'How it works','carta.how1t':'1 · Earn','carta.how1':'Earn points on every purchase, online and in store.',
      'carta.how2t':'2 · Level up','carta.how2':'Petalo → Fiore → Giardino, with growing benefits.',
      'carta.how3t':'3 · Redeem','carta.how3':'Turn points into discount vouchers from the Loyalty points section.',
      'carta.benefits':'Benefits by level','carta.current':'Your level','carta.member':'Member since 2026',
      'loy.balance':'Your balance','loy.have':'You have','loy.points':'points','loy.worth':'Each point is worth €','loy.min':'. Minimum','loy.min2':'points for a voucher.',
      'loy.redeem':'Redeem for voucher','loy.redeem.ph':'Points to redeem','loy.redeem.empty':'Enter the points to redeem.','loy.redeem.wait':'Redeeming…','loy.redeem.done':'Done! Code','loy.redeem.use':'— use it at checkout.','loy.redeem.err':'Redemption error.',
      'loy.movs':'Recent activity',
      'wl.empty.t':'Your wishlist is empty','wl.empty.p':'Save the pieces you love with the heart and find them here.','wl.browse':'Explore the collection',
      'wl.tocart':'Add to cart','wl.view':'View','wl.remove':'Remove','wl.page':'Page','wl.of':'of','wl.prev':'Previous','wl.next':'Next',
      'ord.empty.t':'No orders yet','ord.empty.p':'When you place your first order, it will appear here.','ord.shop':'Start shopping','ord.detail':'Details','ord.total':'Total','ord.date':'Date','ord.status':'Status','ord.pay':'Payment','ord.track':'Tracking','ord.product':'Product','ord.qty':'Qty','ord.price':'Price','ord.reso':'Request a return','ord.nodetail':'Unable to load details.','ord.order':'Order',
      'ord.cancel':'Cancel order','ord.cancel.q':'Cancel this order? If it was already paid, the refund will be credited to your original payment method.','ord.cancel.yes':'Yes, cancel','ord.cancel.no':'No, keep it','ord.cancelling':'Cancelling…','ord.cancel.ok':'Order cancelled.','ord.cancel.okr':'Order cancelled — refund issued.','ord.cancel.err':'Could not cancel the order. Try again or contact support.',
      'reso.myreq':'My return requests','reso.rma':'RMA','reso.reqnone':'No return requests submitted.',
      'rst.aperto':'Pending','rst.in_analisi':'Under review','rst.approvato':'Approved','rst.rifiutato':'Rejected','rst.rimborsato':'Refunded',
      'aiuto.contact':'Contact us','aiuto.contact.p':'Write to us, we reply within 24h on business days.','aiuto.email':'Send an email','aiuto.faq':'FAQ','aiuto.q1':'Shipping & delivery','aiuto.q2':'Returns & refunds','aiuto.q3':'Size guide','aiuto.q4':'Track your order',
      'st.in_attesa':'Pending','st.in_preparazione':'Preparing','st.spedito':'Shipped','st.consegnato':'Delivered','st.annullato':'Cancelled','st.pagato':'Paid','st.non_pagato':'Unpaid','st.rimborsato':'Refunded',
      'greet.morning':'Good morning','greet.afternoon':'Good afternoon','greet.evening':'Good evening',
      'redirect':'You must be registered to access your account.','redirect.link':'Sign in to your account ›'
    }
  };

  var LANG_KEY = 'memi_lang';
  var lang = (function(){ try { var l = localStorage.getItem(LANG_KEY); return (l==='en'||l==='it') ? l : 'it'; } catch(_){ return 'it'; } })();
  function t(key){ var d = I18N[lang] || I18N.it; return (key in d) ? d[key] : (I18N.it[key] || key); }
  function locale(){ return lang === 'en' ? 'en-GB' : 'it-IT'; }

  var TOKEN_KEY = 'memi_token';
  var main = document.getElementById('accountMain');
  var loadedOrders = [];
  var loadedUser = null;
  var loadedLoy = null;
  var loadedReturns = [];
  var loyaltyConfig = { pointValueEur: 0.01, minRedeem: 100 };
  var wishlistPage = 1;
  var WL_PER_PAGE = 6;

  /* ── Redirect if not logged in ─────────────────────── */
  var token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    main.innerHTML = '<div class="acc-redirect">' +
      '<p>' + t('redirect') + '</p>' +
      '<a href="/" onclick="window.openAuthDrawer&&window.openAuthDrawer(\'login\');return false;">' + t('redirect.link') + '</a>' +
      '</div>';
    return;
  }

  /* ── Helpers ─────────────────────────────────────────── */
  function el(id){ return document.getElementById(id); }
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function statusLabel(code){ return t('st.' + code) !== 'st.' + code ? t('st.' + code) : (code || '—'); }
  function fmtDate(iso){ if(!iso) return '—';
    return new Date(iso).toLocaleDateString(locale(),{day:'2-digit',month:'long',year:'numeric'}); }
  function fmtPrice(n){ return '€' + parseFloat(n||0).toFixed(2).replace('.', lang==='en'?'.':','); }

  /* local store helpers */
  function lget(key, def){ try { var v = JSON.parse(localStorage.getItem(key)); return v==null?def:v; } catch(_){ return def; } }
  function lset(key, val){ try { localStorage.setItem(key, JSON.stringify(val)); } catch(_){ } }

  /* ── Tiers (flower theme) + benefits ────────────────── */
  var TIERS = [
    { key:'petalo',  name:'Petalo',   min:0,   color:'#8F8FC1' },
    { key:'fiore',   name:'Fiore',    min:200, color:'#6B6BA3' },
    { key:'giardino',name:'Giardino', min:500, color:'#5F7A3F' }
  ];
  var BENEFITS = {
    it: {
      petalo:['1 punto ogni € speso','Sorpresa di compleanno','Storico ordini e resi'],
      fiore:['Tutto di Petalo','Spedizione sempre gratuita','Accesso anticipato ai saldi','Buono di benvenuto nel livello'],
      giardino:['Tutto di Fiore','Punti x1,5 su ogni acquisto','Anteprime esclusive','Resi sempre gratuiti','Regalo stagionale']
    },
    en: {
      petalo:['1 point per € spent','Birthday surprise','Order & return history'],
      fiore:['Everything in Petalo','Free shipping always','Early access to sales','Level welcome voucher'],
      giardino:['Everything in Fiore','1.5× points on every purchase','Exclusive previews','Free returns always','Seasonal gift']
    }
  };
  function tierFor(points){ var x = TIERS[0]; for (var i=0;i<TIERS.length;i++){ if (points >= TIERS[i].min) x = TIERS[i]; } return x; }
  function nextTier(points){ for (var i=0;i<TIERS.length;i++){ if (points < TIERS[i].min) return TIERS[i]; } return null; }

  /* ── Member number + barcode ────────────────────────── */
  function memberNumber(user){
    var seed = String(user.id || user.email || user.nome || 'memi'); var h = 0;
    for (var i=0;i<seed.length;i++){ h = (h*31 + seed.charCodeAt(i)) >>> 0; }
    var base = ('0000000000' + (h % 1e10)).slice(-10);
    return '2026' + base.slice(0,3) + base.slice(3);
  }
  function groupNumber(num){ return num.replace(/(.{4})/g, '$1 ').trim(); }
  function barcodeSVG(num){
    var bars = [], x = 2, digits = num.replace(/\D/g,'');
    for (var i=0;i<digits.length;i++){
      var d = parseInt(digits.charAt(i),10);
      var widths = [ (d%3)+1, ((d+1)%3)+1, (d%2)+1, ((d>>1)%3)+1 ];
      for (var b=0;b<widths.length;b++){ var w = widths[b];
        if (b % 2 === 0){ bars.push('<rect x="'+x+'" y="0" width="'+w+'" height="52" fill="#2b2130"/>'); }
        x += w + (b%2===0 ? 0 : 1); }
      x += 1;
    }
    return '<svg viewBox="0 0 '+(x+2)+' 52" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">'+bars.join('')+'</svg>';
  }
  function fidelityCardHTML(user, points){
    var tr = tierFor(points), num = memberNumber(user);
    var display = (user.nome || user.name || 'Cliente') + (user.cognome ? ' ' + user.cognome : '');
    return '<div class="fcard">' +
      '<div class="fcard-top"><div class="fcard-logo">Memi<span>.</span></div><div class="fcard-tier">✦ ' + tr.name + '</div></div>' +
      '<div class="fcard-chip"></div>' +
      '<div class="fcard-name"><div class="lbl">' + t('carta.member') + '</div><div class="val">' + esc(display) + '</div></div>' +
      '<div class="fcard-num">' + groupNumber(num).replace(/\d(?=(?:\D*\d){4})/g,'•') + '</div>' +
    '</div>';
  }

  /* ══════════════════ ORDERS ══════════════════ */
  function renderOrder(o){
    var items = (o.items||[]).map(function(i){ return i.product_name; }).join(', ') || '—';
    var trackingRow = '';
    if ((o.order_status==='spedito'||o.order_status==='consegnato') && o.tracking_number){
      trackingRow = '<div class="order-tracking">' +
        '<svg viewBox="0 0 24 24"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>' +
        '<strong>' + esc(o.courier_code||'Corriere') + ':</strong> <span>' + esc(o.tracking_number) + '</span></div>';
    }
    return '<div class="order-row"' + (trackingRow?' style="grid-template-rows:auto auto;"':'') + '>' +
      '<div><div class="order-number">' + esc(o.order_number) + '</div><div class="order-date">' + fmtDate(o.created_at) + '</div></div>' +
      '<div class="order-items-summary">' + esc(items) + '</div>' +
      '<div class="order-total">' + fmtPrice(o.total) + '</div>' +
      '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">' +
        '<span class="order-status ' + o.order_status + '">' + statusLabel(o.order_status) + '</span>' +
        '<button class="order-detail-btn" data-id="' + o.id + '">' + t('ord.detail') + ' ›</button>' +
      '</div>' + trackingRow + '</div>';
  }
  function renderOrdersPanel(orders){
    if (!orders || !orders.length){
      return '<div class="ap-empty">' +
        '<svg viewBox="0 0 24 24"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>' +
        '<h3>' + t('ord.empty.t') + '</h3><p>' + t('ord.empty.p') + '</p>' +
        '<a href="shop.html" class="btn-shop">' + t('ord.shop') + '</a></div>';
    }
    return '<div class="orders-list">' + orders.map(renderOrder).join('') + '</div>';
  }
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
        '<h3 style="font-family:var(--font-serif);font-size:1.3rem;font-weight:300">' + t('ord.order') + ' ' + (o?esc(o.order_number):'') + '</h3>' +
        '<button class="apCloseModal" style="background:none;border:none;font-size:20px;cursor:pointer;color:#999">✕</button></div>' +
      (o ? ('<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;margin-bottom:16px;font-size:.85rem">' +
          '<div><span style="color:var(--brown-light)">' + t('ord.date') + '</span><br>' + fmtDate(o.created_at) + '</div>' +
          '<div><span style="color:var(--brown-light)">' + t('ord.status') + '</span><br><span class="order-status ' + o.order_status + '">' + statusLabel(o.order_status) + '</span></div>' +
          '<div><span style="color:var(--brown-light)">' + t('ord.pay') + '</span><br>' + statusLabel(o.payment_status) + '</div>' +
          (o.tracking_number?'<div><span style="color:var(--brown-light)">' + t('ord.track') + '</span><br>'+esc(o.courier_code||'')+' '+esc(o.tracking_number)+'</div>':'') +
        '</div>' +
        (rows ? '<table style="width:100%;border-collapse:collapse;border-top:1px solid var(--beige)">' +
          '<thead><tr style="font-size:.75rem;color:var(--brown-light);text-transform:uppercase;letter-spacing:.05em">' +
          '<th style="padding:8px 0;text-align:left;font-weight:500">' + t('ord.product') + '</th><th style="text-align:center;font-weight:500">' + t('ord.qty') + '</th><th style="text-align:right;font-weight:500">' + t('ord.price') + '</th></tr></thead>' +
          '<tbody>' + rows + '</tbody><tfoot><tr><td colspan="2" style="padding:10px 0;font-size:.85rem;font-weight:500;border-top:1px solid var(--beige)">' + t('ord.total') + '</td>' +
          '<td style="text-align:right;font-size:.95rem;font-weight:600;border-top:1px solid var(--beige)">' + fmtPrice(o.total) + '</td></tr></tfoot></table>' : '') +
        '<div style="margin-top:16px;display:flex;justify-content:space-between;align-items:center;gap:12px">' +
          ((o.order_status==='in_attesa'||o.order_status==='in_preparazione')
            ? '<button type="button" id="apCancelOrderBtn" data-oid="'+esc(String(o.id))+'" style="font-size:.8rem;color:#b91c1c;background:none;border:1px solid #f0d0d0;border-radius:6px;padding:6px 12px;cursor:pointer">'+t('ord.cancel')+'</button>'
            : '<span></span>') +
          '<a href="returns.html?order='+encodeURIComponent(o.order_number)+'" style="font-size:.8rem;color:var(--espresso);text-decoration:underline">' + t('ord.reso') + ' ›</a>' +
        '</div>' +
        '<div id="apCancelConfirm" style="display:none;margin-top:12px;padding:14px 16px;background:#fff6f6;border:1px solid #f0d0d0;border-radius:8px">' +
          '<p style="font-size:.82rem;color:#7a3b3b;margin:0 0 10px">'+t('ord.cancel.q')+'</p>' +
          '<div id="apCancelMsg" style="font-size:.8rem;margin:0 0 10px;display:none"></div>' +
          '<div style="display:flex;gap:8px;justify-content:flex-end">' +
            '<button type="button" id="apCancelNo" style="font-size:.8rem;background:none;border:1px solid var(--beige,#e6ddd4);border-radius:6px;padding:6px 12px;cursor:pointer">'+t('ord.cancel.no')+'</button>' +
            '<button type="button" id="apCancelYes" style="font-size:.8rem;background:#b91c1c;color:#fff;border:none;border-radius:6px;padding:6px 14px;cursor:pointer">'+t('ord.cancel.yes')+'</button>' +
          '</div>' +
        '</div>')
        : '<p style="color:var(--brown-light)">' + t('ord.nodetail') + '</p>') +
      '</div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function(e){ if (e.target===overlay || e.target.classList.contains('apCloseModal')) overlay.remove(); });
    // Cancel-order flow: reveal a styled inline confirmation, then call the API.
    (function(){
      var openBtn = overlay.querySelector('#apCancelOrderBtn');
      if (!openBtn) return;
      var box = overlay.querySelector('#apCancelConfirm');
      var noBtn = overlay.querySelector('#apCancelNo');
      var yesBtn = overlay.querySelector('#apCancelYes');
      var msg = overlay.querySelector('#apCancelMsg');
      openBtn.addEventListener('click', function(){ box.style.display='block'; openBtn.style.display='none'; });
      noBtn.addEventListener('click', function(){ box.style.display='none'; openBtn.style.display=''; });
      yesBtn.addEventListener('click', function(){
        yesBtn.disabled=true; noBtn.disabled=true; yesBtn.textContent=t('ord.cancelling');
        window.MemiAPI.orders.cancel(openBtn.dataset.oid).then(function(res){
          var ord = loadedOrders.filter(function(x){ return String(x.id)===String(openBtn.dataset.oid); })[0];
          if (ord){ ord.order_status='annullato'; if (res && res.refunded) ord.payment_status='rimborsato'; }
          msg.style.display='block'; msg.style.color='#5F7A3F';
          msg.textContent = (res && res.refunded) ? t('ord.cancel.okr') : t('ord.cancel.ok');
          setTimeout(function(){ overlay.remove(); if (typeof rerenderPanel==='function') rerenderPanel(); if (typeof refreshCounts==='function') refreshCounts(); }, 1100);
        }).catch(function(err){
          yesBtn.disabled=false; noBtn.disabled=false; yesBtn.textContent=t('ord.cancel.yes');
          msg.style.display='block'; msg.style.color='#b91c1c';
          msg.textContent = (err && err.error) || t('ord.cancel.err');
        });
      });
    })();
  }

  /* ══════════════════ RESO ══════════════════ */
  function renderResoPanel(orders){
    var eligible = (orders||[]).filter(function(o){ return o.order_status==='spedito'||o.order_status==='consegnato'; });
    var list = eligible.length ? eligible.map(function(o){
      return '<div class="order-row" style="grid-template-columns:1fr auto">' +
        '<div><div class="order-number">' + esc(o.order_number) + '</div>' +
          '<div class="order-date">' + fmtDate(o.created_at) + ' · ' + fmtPrice(o.total) + '</div></div>' +
        '<a class="btn-shop" style="align-self:center" href="returns.html?order=' + encodeURIComponent(o.order_number) + '">' + t('reso.cta') + '</a>' +
      '</div>';
    }).join('') : '<p style="font-size:.85rem;color:var(--brown-light)">' + t('reso.none') + '</p>';

    // Persisted return requests the customer has already submitted (from /resi/my).
    var reqList = (loadedReturns && loadedReturns.length) ? loadedReturns.map(function(r){
      var st = r.stato || 'aperto';
      var label = t('rst.' + st) !== 'rst.' + st ? t('rst.' + st) : st;
      var amount = (r.rimborso_amount != null) ? (' · ' + fmtPrice(r.rimborso_amount)) : '';
      return '<div class="order-row" style="grid-template-columns:1fr auto">' +
        '<div><div class="order-number">' + t('reso.rma') + ' ' + esc(r.rma_number || '—') + '</div>' +
          '<div class="order-date">' + esc(r.order_number || '') + ' · ' + fmtDate(r.created_at) + ' · ' + esc(r.motivo || '') + amount + '</div></div>' +
        '<span class="reso-status ' + esc(st) + '" style="align-self:center;font-size:.72rem;padding:4px 10px;border-radius:999px;background:var(--beige,#f0e9e2);color:var(--espresso,#3b2b2b)">' + esc(label) + '</span>' +
      '</div>';
    }).join('') : '<p style="font-size:.85rem;color:var(--brown-light)">' + t('reso.reqnone') + '</p>';

    return '<div class="ap-block" style="margin-bottom:1.25rem"><div class="ap-hint"><svg viewBox="0 0 24 24"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg><span>' + t('reso.info') + '</span></div></div>' +
      '<h3 class="ap-subhead">' + t('reso.myreq') + '</h3>' +
      '<div class="orders-list" style="margin-bottom:1.75rem">' + reqList + '</div>' +
      '<h3 class="ap-subhead">' + t('reso.eligible') + '</h3>' +
      '<div class="orders-list">' + list + '</div>';
  }

  /* ══════════════════ WISHLIST (bigger cards + pagination) ══════════════════ */
  var catalogMap = {};
  function loadWishlist(){ return lget('memi_wishlist', []) || []; }
  function wishlistCount(){ return loadWishlist().length; }
  function renderWishlistPanel(){
    var items = loadWishlist();
    if (!items.length){
      return '<div class="ap-empty">' +
        '<svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>' +
        '<h3>' + t('wl.empty.t') + '</h3><p>' + t('wl.empty.p') + '</p>' +
        '<a href="shop.html" class="btn-shop">' + t('wl.browse') + '</a></div>';
    }
    var pages = Math.ceil(items.length / WL_PER_PAGE);
    if (wishlistPage > pages) wishlistPage = pages;
    if (wishlistPage < 1) wishlistPage = 1;
    var start = (wishlistPage-1)*WL_PER_PAGE;
    var pageItems = items.slice(start, start + WL_PER_PAGE);
    var grid = '<div class="wl-grid">' + pageItems.map(function(item){
      var baseId = item.productId || item.id;
      var prod = catalogMap[baseId];
      if (!prod){ Object.keys(catalogMap).forEach(function(k){ if (String(item.id).indexOf(k)===0) prod = catalogMap[k]; }); }
      var href = prod ? '/product?id=' + baseId : '/product';
      var thumb = (prod && prod.img)
        ? '<img src="' + prod.img + '" alt="" loading="lazy">'
        : '<div class="ph ' + (item.colorKey||'ph-blush') + '"><svg viewBox="0 0 60 80" fill="none"><ellipse cx="30" cy="14" rx="10" ry="11" fill="white" opacity=".4"/><path d="M8 80 C8 55 52 55 52 80" fill="white" opacity=".4"/><rect x="14" y="26" width="32" height="34" rx="5" fill="white" opacity=".4"/></svg></div>';
      return '<div class="wl-card" data-id="' + esc(item.id) + '">' +
        '<a class="wl-thumb" href="' + href + '">' + thumb +
          '<button class="wl-remove" title="' + t('wl.remove') + '" data-wl-remove="' + esc(item.id) + '" aria-label="' + t('wl.remove') + '">' +
          '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>' +
        '</a>' +
        '<div class="wl-body">' +
          '<a class="wl-name" href="' + href + '">' + esc(item.name||'Capo Memi') + '</a>' +
          '<div class="wl-meta">' + esc(item.color||'') + (item.taglia?' · '+esc(item.taglia):'') + '</div>' +
          '<div class="wl-actions">' +
            '<button class="wl-btn primary" data-wl-cart="' + esc(item.id) + '">' + t('wl.tocart') + '</button>' +
            '<a class="wl-btn ghost" href="' + href + '">' + t('wl.view') + '</a>' +
          '</div>' +
        '</div></div>';
    }).join('') + '</div>';
    var pager = pages > 1 ? '<div class="wl-pager">' +
      '<button class="wl-page-btn" data-wl-page="' + (wishlistPage-1) + '"' + (wishlistPage<=1?' disabled':'') + '>‹ ' + t('wl.prev') + '</button>' +
      '<span class="wl-page-info">' + t('wl.page') + ' ' + wishlistPage + ' ' + t('wl.of') + ' ' + pages + '</span>' +
      '<button class="wl-page-btn" data-wl-page="' + (wishlistPage+1) + '"' + (wishlistPage>=pages?' disabled':'') + '>' + t('wl.next') + ' ›</button>' +
    '</div>' : '';
    return grid + pager;
  }

  /* ══════════════════ LOYALTY ══════════════════ */
  function renderLoyaltyPanel(user, loy){
    var points = (loy && loy.points != null) ? loy.points : (user.points||0);
    var cfg = (loy && loy.config) || loyaltyConfig;
    var tr = tierFor(points), nt = nextTier(points);
    var progHTML;
    if (nt){
      var span = nt.min - tr.min, into = points - tr.min;
      var pct = Math.max(4, Math.min(100, Math.round(into/span*100)));
      progHTML = '<div class="ap-tier-prog"><div class="ap-tier-prog-bar"><div class="ap-tier-prog-fill" style="width:' + pct + '%"></div></div>' +
        '<p class="ap-tier-prog-txt">' + t('tier.next') + ' <strong>' + (nt.min-points) + ' ' + t('loy.points') + '</strong> ' + t('tier.points_to') + ' ' + nt.name + ' ✦</p></div>';
    } else {
      progHTML = '<div class="ap-tier-prog"><div class="ap-tier-prog-bar"><div class="ap-tier-prog-fill" style="width:100%"></div></div>' +
        '<p class="ap-tier-prog-txt">' + t('tier.max') + ' <strong>Giardino</strong> 🌿 ' + t('tier.max2') + '</p></div>';
    }
    var ledger = (loy && loy.transactions && loy.transactions.length)
      ? '<div class="ap-block" style="margin-top:1.25rem"><h3>' + t('loy.movs') + '</h3>' +
        loy.transactions.slice(0,12).map(function(tx){
          return '<div class="loy-ledger-row"><span class="r">' + esc(tx.reason||'—') + '<br><span style="font-size:.7rem;color:var(--brown-light)">' + fmtDate(tx.created_at) + '</span></span>' +
            '<span class="d" style="color:' + (tx.delta>=0?'#3a7a55':'#b4607a') + '">' + (tx.delta>=0?'+':'') + tx.delta + '</span></div>';
        }).join('') + '</div>'
      : '';
    return '<div class="ap-block">' +
        '<h3>' + t('loy.balance') + '</h3>' +
        '<p style="font-size:1.1rem;margin-bottom:.2rem">' + t('loy.have') + ' <strong style="font-family:var(--font-serif);font-size:1.7rem;color:var(--espresso)" id="loyBalance">' + points + '</strong> ' + t('loy.points') + '</p>' +
        progHTML +
        '<p style="font-size:.82rem;color:var(--brown-mid);margin:.9rem 0 .3rem">' + t('loy.worth') + ' ' + Number(cfg.pointValueEur||0.01).toFixed(2).replace('.', lang==='en'?'.':',') + t('loy.min') + ' ' + (cfg.minRedeem||100) + ' ' + t('loy.min2') + '</p>' +
        '<div class="loy-redeem">' +
          '<input class="field-input" type="number" id="redeemPoints" min="0" placeholder="' + t('loy.redeem.ph') + '" style="max-width:200px" />' +
          '<button type="button" class="btn-outline" id="redeemBtn">' + t('loy.redeem') + '</button>' +
        '</div>' +
        '<p id="redeemMsg" class="ap-msg" style="margin-top:.6rem"></p>' +
      '</div>' + ledger;
  }

  /* ══════════════════ CARTA + BENEFITS ══════════════════ */
  function benefitsHTML(points){
    var cur = tierFor(points).key;
    var b = BENEFITS[lang] || BENEFITS.it;
    return '<div class="tier-cards">' + TIERS.map(function(tr){
      var active = tr.key===cur;
      return '<div class="tier-card' + (active?' active':'') + '">' +
        '<div class="tier-card-head"><span class="tier-dot" style="background:' + tr.color + '"></span>' +
          '<span class="tier-card-name">' + tr.name + '</span>' +
          (active ? '<span class="tier-badge-now">' + t('carta.current') + '</span>' : '') +
          '<span class="tier-card-min">' + tr.min + '+ ' + t('loy.points') + '</span></div>' +
        '<ul class="tier-benefits">' + (b[tr.key]||[]).map(function(x){ return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' +
      '</div>';
    }).join('') + '</div>';
  }
  function renderCardPanel(user, points){
    var num = memberNumber(user), tr = tierFor(points);
    return '<div class="ap-two">' +
      '<div>' + fidelityCardHTML(user, points) +
        '<div class="fcard-barcode">' + barcodeSVG(num) + '<div class="code">' + num + '</div></div>' +
        '<p class="fcard-hint"><svg viewBox="0 0 24 24"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>' + t('carta.show') + ' ' + tr.name + '.</p>' +
      '</div>' +
      '<div class="ap-block">' +
        '<h3>' + t('carta.how') + '</h3>' +
        '<div style="font-size:.86rem;color:var(--brown-mid);line-height:1.7">' +
          '<p style="margin-bottom:.7rem"><strong style="color:var(--espresso)">' + t('carta.how1t') + '</strong><br>' + t('carta.how1') + '</p>' +
          '<p style="margin-bottom:.7rem"><strong style="color:var(--espresso)">' + t('carta.how2t') + '</strong><br>' + t('carta.how2') + '</p>' +
          '<p><strong style="color:var(--espresso)">' + t('carta.how3t') + '</strong><br>' + t('carta.how3') + '</p>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<h3 class="ap-subhead" style="margin-top:1.75rem">' + t('carta.benefits') + '</h3>' +
    benefitsHTML(points);
  }

  /* ══════════════════ OVERVIEW ══════════════════ */
  function greeting(){ var h = new Date().getHours(); return h<12?t('greet.morning'):(h<18?t('greet.afternoon'):t('greet.evening')); }
  function renderOverview(user, orders, points){
    var wc = wishlistCount();
    var recent = orders && orders.length ? renderOrder(orders[0]) : '<p style="font-size:.85rem;color:var(--brown-light)">' + t('ov.noorders') + ' <a href="shop.html" style="color:var(--espresso);text-decoration:underline">' + t('ov.startshop') + ' ›</a></p>';
    var tr = tierFor(points), nt = nextTier(points);
    var progTxt = nt ? (t('tier.next') + ' <strong>' + (nt.min-points) + ' ' + t('loy.points') + '</strong> ' + t('tier.points_to') + ' ' + nt.name)
                     : (t('tier.max') + ' <strong>Giardino</strong> 🌿');
    var span = nt ? (nt.min - tr.min) : 1, into = nt ? (points - tr.min) : 1;
    var pct = nt ? Math.max(4, Math.min(100, Math.round(into/span*100))) : 100;
    return '<div class="ap-stats">' +
        '<button class="ap-stat" data-goto="loyalty"><span class="ap-stat-ic blush"><svg viewBox="0 0 24 24"><polygon points="12 2 15 8.5 22 9.3 17 14 18.2 21 12 17.5 5.8 21 7 14 2 9.3 9 8.5 12 2"/></svg></span>' +
          '<span class="ap-stat-txt"><span class="ap-stat-num">' + points + '</span><span class="ap-stat-lbl">' + t('stat.points') + '</span></span></button>' +
        '<button class="ap-stat" data-goto="ordini"><span class="ap-stat-ic sage"><svg viewBox="0 0 24 24"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg></span>' +
          '<span class="ap-stat-txt"><span class="ap-stat-num">' + (orders?orders.length:0) + '</span><span class="ap-stat-lbl">' + t('stat.orders') + '</span></span></button>' +
        '<button class="ap-stat" data-goto="wishlist"><span class="ap-stat-ic lav"><svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></span>' +
          '<span class="ap-stat-txt"><span class="ap-stat-num">' + wc + '</span><span class="ap-stat-lbl">' + t('stat.wishlist') + '</span></span></button>' +
      '</div>' +
      '<div class="ap-two">' +
        '<div class="ap-block"><h3>' + t('ov.recent') + ' <a href="#" data-goto="ordini">' + t('ov.all') + ' ›</a></h3>' + recent + '</div>' +
        '<div>' + fidelityCardHTML(user, points) +
          '<div class="ap-block" style="margin-top:1.25rem"><h3 style="margin-bottom:.6rem">' + t('ov.level') + ' ' + tr.name + '</h3>' +
            '<div class="ap-tier-prog-bar"><div class="ap-tier-prog-fill" style="width:' + pct + '%"></div></div>' +
            '<p class="ap-tier-prog-txt" style="margin-top:.5rem">' + progTxt + ' ✦</p></div>' +
        '</div>' +
      '</div>';
  }

  /* ══════════════════ PROFILE (read-only → edit) ══════════════════ */
  var profileEditing = false;
  var sizesEditing = false;
  var prefsEditing = false;
  var newsEditing = false;
  function dataRow(label, val){ return '<div class="ap-datarow"><span class="ap-datalabel">' + label + '</span><span class="ap-dataval">' + (esc(val)||'—') + '</span></div>'; }
  function renderProfile(user){
    if (!profileEditing){
      return '<div class="ap-block">' +
          dataRow(t('field.nome'), user.nome) +
          dataRow(t('field.cognome'), user.cognome) +
          dataRow(t('field.email'), user.email) +
          dataRow(t('field.tel'), user.telefono) +
          dataRow(t('field.birthday'), fmtBirthday((user.birthday||'').slice(0,10))) +
          '<div class="ap-actions"><button class="btn-primary-solid" id="profileEditBtn"><svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2;vertical-align:-2px;margin-right:6px"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' + t('btn.edit') + '</button></div>' +
        '</div>' +
        passwordBlock();
    }
    function v(x){ return esc(x||''); }
    return '<form class="profile-form" id="profileForm">' +
        '<div><label class="field-label">' + t('field.nome') + '</label><input class="field-input" type="text" id="pfNome" value="' + v(user.nome) + '" /></div>' +
        '<div><label class="field-label">' + t('field.cognome') + '</label><input class="field-input" type="text" id="pfCognome" value="' + v(user.cognome) + '" /></div>' +
        '<div class="field-full"><label class="field-label">' + t('field.email') + '</label><input class="field-input" type="email" id="pfEmail" value="' + v(user.email) + '" /></div>' +
        '<div class="field-full"><label class="field-label">' + t('field.tel') + '</label><input class="field-input" type="tel" id="pfTel" value="' + v(user.telefono) + '" /></div>' +
        '<div class="field-full"><label class="field-label">' + t('field.birthday') + '</label>' + birthdayPickerHtml((user.birthday||'').slice(0,10)) + '</div>' +
        '<div class="profile-form-footer"><button type="submit" class="btn-primary-solid">' + t('btn.save') + '</button>' +
          '<button type="button" class="btn-outline" id="profileCancelBtn">' + t('btn.cancel') + '</button>' +
          '<span id="profileMsg" class="ap-msg"></span></div>' +
      '</form>' + passwordBlock();
  }
  function passwordBlock(){
    return '<div class="ap-block" style="margin-top:1.25rem">' +
        '<h3 style="font-family:var(--font-serif);font-size:1.2rem;font-weight:400;margin-bottom:.35rem">' + t('pwd.change') + '</h3>' +
        '<p style="font-size:.8rem;color:var(--brown-light);margin-bottom:1rem">' + t('pwd.hint') + '</p>' +
        '<form class="profile-form" id="passwordForm" style="border:none;padding:0;background:none">' +
          '<div><label class="field-label">' + t('pwd.new') + '</label><input class="field-input" type="password" id="pfPassNew" placeholder="' + t('pwd.ph') + '" /></div>' +
          '<div><label class="field-label">' + t('pwd.conf') + '</label><input class="field-input" type="password" id="pfPassConf" placeholder="' + t('pwd.phc') + '" /></div>' +
          '<div class="profile-form-footer"><button type="submit" class="btn-outline">' + t('pwd.update') + '</button><span id="passMsg" class="ap-msg"></span></div>' +
        '</form></div>';
  }

  /* ══════════════════ ADDRESSES ══════════════════ */
  function loadAddresses(user){
    var a = lget('memi_addresses', null);
    if (!a){
      a = (user && (user.indirizzo||user.citta)) ? [{ id:'primary', label:'Casa', indirizzo:user.indirizzo||'', citta:user.citta||'', cap:user.cap||'', paese:user.paese||'Italia', telefono:user.telefono||'', def:true }] : [];
      lset('memi_addresses', a);
    }
    return a;
  }
  var addrEditingId = null;
  function renderAddresses(user){
    var list = loadAddresses(user);
    var cards = list.length ? list.map(function(a){
      if (addrEditingId === a.id) return addrForm(a);
      return '<div class="addr-card' + (a.def?' is-default':'') + '">' +
        '<div class="addr-card-top"><span class="addr-label">' + esc(a.label||'—') + '</span>' + (a.def?'<span class="addr-default-badge">' + t('addr.default') + '</span>':'') + '</div>' +
        '<p class="addr-lines">' + esc([a.indirizzo, a.numero_civico].filter(Boolean).join(', ')) +
          (a.piano ? '<br>' + t('addr.piano').replace(/ \(.*\)/,'') + ': ' + esc(a.piano) : '') +
          '<br>' + esc(a.cap) + ' ' + esc(a.citta) + '<br>' + esc(a.paese) +
          (a.nome_campanello ? '<br>' + t('addr.campanello').replace(/ \(.*\)/,'') + ': ' + esc(a.nome_campanello) : '') +
          (a.telefono ? '<br>' + esc(a.telefono) : '') + '</p>' +
        '<div class="addr-actions">' +
          '<button class="ap-link-btn" data-addr-edit="' + esc(a.id) + '"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' + t('btn.edit') + '</button>' +
          (a.def?'':'<button class="ap-link-btn" data-addr-default="' + esc(a.id) + '">' + t('addr.setdefault') + '</button>') +
          (a.def?'':'<button class="ap-link-btn danger" data-addr-del="' + esc(a.id) + '">' + t('addr.delete') + '</button>') +
        '</div>' +
      '</div>';
    }).join('') : '<p style="font-size:.85rem;color:var(--brown-light)">' + t('addr.empty') + '</p>';
    var addBlock = (addrEditingId==='new') ? addrForm(null)
      : '<button class="btn-outline" id="addrAddBtn" style="margin-top:1rem"><svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2;vertical-align:-2px;margin-right:6px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' + t('addr.new') + '</button>';
    return '<div class="addr-grid">' + cards + '</div>' + addBlock;
  }
  function addrForm(a){
    a = a || { id:'new', label:'', indirizzo:'', numero_civico:'', piano:'', nome_campanello:'', citta:'', cap:'', paese:'Italia', telefono:'' };
    function v(x){ return esc(x||''); }
    return '<form class="profile-form addr-form" data-addr-id="' + esc(a.id) + '">' +
      '<div class="field-full"><label class="field-label">' + t('addr.label') + '</label><input class="field-input" name="label" value="' + v(a.label) + '" /></div>' +
      '<div class="field-full addr-ac-wrap">' +
        '<label class="field-label">' + t('field.indirizzo') + '</label>' +
        '<div class="addr-ac-field">' +
          '<input class="field-input" name="indirizzo" id="addrVia" autocomplete="off" placeholder="' + t('addr.via.ph') + '" value="' + v(a.indirizzo) + '" />' +
          '<div class="addr-suggest" id="addrSuggest" role="listbox"></div>' +
        '</div>' +
        '<span class="addr-ac-hint">' + t('addr.via.hint') + '</span>' +
      '</div>' +
      '<div><label class="field-label">' + t('addr.civico') + '</label><input class="field-input" name="numero_civico" value="' + v(a.numero_civico) + '" /></div>' +
      '<div><label class="field-label">' + t('addr.piano') + '</label><input class="field-input" name="piano" value="' + v(a.piano) + '" /></div>' +
      '<div class="field-full"><label class="field-label">' + t('addr.campanello') + '</label><input class="field-input" name="nome_campanello" value="' + v(a.nome_campanello) + '" /></div>' +
      '<div><label class="field-label">' + t('field.citta') + '</label><input class="field-input" name="citta" id="addrCitta" value="' + v(a.citta) + '" /></div>' +
      '<div><label class="field-label">' + t('field.cap') + '</label><input class="field-input" name="cap" id="addrCap" value="' + v(a.cap) + '" /></div>' +
      '<div><label class="field-label">' + t('field.paese') + '</label><input class="field-input" name="paese" id="addrPaese" value="' + v(a.paese) + '" /></div>' +
      '<div><label class="field-label">' + t('field.tel') + '</label><input class="field-input" name="telefono" value="' + v(a.telefono) + '" /></div>' +
      '<div class="profile-form-footer"><button type="submit" class="btn-primary-solid">' + t('btn.save') + '</button>' +
        '<button type="button" class="btn-outline" data-addr-cancel="1">' + t('btn.cancel') + '</button></div>' +
    '</form>';
  }

  /* ══════════════════ SIZES ══════════════════ */
  var SIZE_OPTS = { alpha:['XS','S','M','L','XL','XXL'], shoe:['35','36','37','38','39','40','41','42'] };
  var EDIT_ICON = '<svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2;vertical-align:-2px;margin-right:6px"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
  function renderSizes(){
    var s = lget('memi_sizes', {});
    // Display mode — mirrors "I miei dati": saved values as rows + Edit button.
    if (!sizesEditing){
      return '<p class="ap-intro">' + t('sizes.intro') + '</p>' +
        '<div class="ap-block">' +
          dataRow(t('sizes.top'), s.top) +
          dataRow(t('sizes.bottom'), s.bottom) +
          dataRow(t('sizes.dress'), s.dress) +
          dataRow(t('sizes.shoe'), s.shoe) +
          dataRow(t('sizes.notes'), s.notes) +
          '<div class="ap-actions"><button class="btn-primary-solid" id="sizesEditBtn">' + EDIT_ICON + t('btn.edit') + '</button></div>' +
        '</div>';
    }
    // Edit mode — the form.
    function sel(id, opts, val){
      return '<select class="field-input" id="' + id + '"><option value="">' + t('sizes.pick') + '</option>' +
        opts.map(function(o){ return '<option value="' + o + '"' + (val===o?' selected':'') + '>' + o + '</option>'; }).join('') + '</select>';
    }
    return '<p class="ap-intro">' + t('sizes.intro') + '</p>' +
      '<form class="profile-form" id="sizesForm">' +
        '<div><label class="field-label">' + t('sizes.top') + '</label>' + sel('szTop', SIZE_OPTS.alpha, s.top) + '</div>' +
        '<div><label class="field-label">' + t('sizes.bottom') + '</label>' + sel('szBottom', SIZE_OPTS.alpha, s.bottom) + '</div>' +
        '<div><label class="field-label">' + t('sizes.dress') + '</label>' + sel('szDress', SIZE_OPTS.alpha, s.dress) + '</div>' +
        '<div><label class="field-label">' + t('sizes.shoe') + '</label>' + sel('szShoe', SIZE_OPTS.shoe, s.shoe) + '</div>' +
        '<div class="field-full"><label class="field-label">' + t('sizes.notes') + '</label><input class="field-input" id="szNotes" value="' + esc(s.notes||'') + '" placeholder="' + t('sizes.notes.ph') + '" /></div>' +
        '<div class="profile-form-footer"><button type="submit" class="btn-primary-solid">' + t('btn.save') + '</button>' +
          '<button type="button" class="btn-outline" id="sizesCancelBtn">' + t('btn.cancel') + '</button>' +
          '<span id="sizesMsg" class="ap-msg"></span></div>' +
      '</form>';
  }

  /* ══════════════════ PREFERENCES ══════════════════ */
  var PREF_CATS = ['vestiti','top','gonne','pantaloni','blazer','accessori','scarpe','borse'];
  var PREF_COLORS = [ {k:'rosa',c:'#F3D1D6'},{k:'verde',c:'#CCE2CB'},{k:'viola',c:'#C5BEE2'},{k:'crema',c:'#F7F5F0'},{k:'nero',c:'#3B2B2B'} ];
  function renderPrefs(){
    var p = lget('memi_prefs', { categories:[], colors:[], email:true, sms:false });
    // Display mode — read-only summary + Edit (mirrors "I miei dati").
    if (!prefsEditing){
      var catNames = (p.categories||[]).map(function(c){ return c.charAt(0).toUpperCase()+c.slice(1); }).join(', ');
      var swatches = (p.colors||[]).length
        ? (p.colors||[]).map(function(k){ var o=PREF_COLORS.filter(function(x){return x.k===k;})[0]; return '<span title="' + esc(k) + '" style="width:20px;height:20px;border-radius:50%;display:inline-block;border:1px solid var(--beige,#DBDBEE);background:' + ((o&&o.c)||'#eee') + '"></span>'; }).join('')
        : '';
      var contact = t('pref.email') + ' ' + (p.email?'✓':'✗') + ' · ' + t('pref.sms') + ' ' + (p.sms?'✓':'✗');
      return '<p class="ap-intro">' + t('pref.intro') + '</p>' +
        '<div class="ap-block">' +
          dataRow(t('pref.cats'), catNames) +
          '<div class="ap-datarow"><span class="ap-datalabel">' + t('pref.colors') + '</span><span class="ap-dataval" style="display:flex;gap:6px;align-items:center">' + (swatches || '—') + '</span></div>' +
          dataRow(t('pref.contact'), contact) +
          '<div class="ap-actions"><button class="btn-primary-solid" id="prefEditBtn">' + EDIT_ICON + t('btn.edit') + '</button></div>' +
        '</div>';
    }
    // Edit mode — interactive chips + toggles.
    var cats = PREF_CATS.map(function(c){
      var on = (p.categories||[]).indexOf(c)>-1;
      return '<button type="button" class="chip-toggle' + (on?' on':'') + '" data-pref-cat="' + c + '">' + c.charAt(0).toUpperCase()+c.slice(1) + '</button>';
    }).join('');
    var colors = PREF_COLORS.map(function(o){
      var on = (p.colors||[]).indexOf(o.k)>-1;
      return '<button type="button" class="color-toggle' + (on?' on':'') + '" data-pref-color="' + o.k + '" title="' + o.k + '" style="background:' + o.c + '" aria-label="' + o.k + '"></button>';
    }).join('');
    return '<p class="ap-intro">' + t('pref.intro') + '</p>' +
      '<div class="ap-block">' +
        '<h3 style="font-size:1rem">' + t('pref.cats') + '</h3><div class="chip-row">' + cats + '</div>' +
        '<h3 style="font-size:1rem;margin-top:1.25rem">' + t('pref.colors') + '</h3><div class="chip-row">' + colors + '</div>' +
        '<h3 style="font-size:1rem;margin-top:1.25rem">' + t('pref.contact') + '</h3>' +
        '<label class="switch-row"><input type="checkbox" id="prefEmail"' + (p.email?' checked':'') + '> ' + t('pref.email') + '</label>' +
        '<label class="switch-row"><input type="checkbox" id="prefSms"' + (p.sms?' checked':'') + '> ' + t('pref.sms') + '</label>' +
        '<div class="profile-form-footer" style="padding-top:1rem"><button type="button" class="btn-primary-solid" id="prefSaveBtn">' + t('btn.save') + '</button>' +
          '<button type="button" class="btn-outline" id="prefCancelBtn">' + t('btn.cancel') + '</button>' +
          '<span id="prefMsg" class="ap-msg"></span></div>' +
      '</div>';
  }

  /* ══════════════════ NEWSLETTER ══════════════════ */
  var NEWS_TOPICS = ['novita','saldi','editoriali','eventi'];
  function renderNewsletter(user){
    var n = lget('memi_news', { subscribed:true, freq:'biweekly', topics:['novita','saldi'] });
    var FREQ = { weekly:t('news.freq.weekly'), biweekly:t('news.freq.biweekly'), monthly:t('news.freq.monthly') };
    // Display mode — read-only summary + Edit (mirrors "I miei dati").
    if (!newsEditing){
      var topicNames = (n.topics||[]).map(function(k){ return t('news.t.'+k); }).join(', ');
      return '<p class="ap-intro">' + t('news.intro') + '</p>' +
        '<div class="ap-block">' +
          dataRow(t('news.sub'), n.subscribed ? t('news.subscribed') : t('news.unsub')) +
          (n.subscribed ? dataRow(t('news.freq'), FREQ[n.freq] || FREQ.biweekly) : '') +
          (n.subscribed ? '<div class="ap-datarow"><span class="ap-datalabel">' + t('news.topics') + '</span><span class="ap-dataval">' + (topicNames || '—') + '</span></div>' : '') +
          '<div class="ap-actions"><button class="btn-primary-solid" id="newsEditBtn">' + EDIT_ICON + t('btn.edit') + '</button></div>' +
        '</div>';
    }
    // Edit mode.
    var topics = NEWS_TOPICS.map(function(k){
      var on = (n.topics||[]).indexOf(k)>-1;
      return '<button type="button" class="chip-toggle' + (on?' on':'') + '" data-news-topic="' + k + '">' + t('news.t.'+k) + '</button>';
    }).join('');
    function opt(v,lbl){ return '<option value="' + v + '"' + (n.freq===v?' selected':'') + '>' + lbl + '</option>'; }
    return '<p class="ap-intro">' + t('news.intro') + '</p>' +
      '<div class="ap-block">' +
        '<div class="ap-datarow" style="border:none;padding-top:0"><span class="ap-datalabel">' + t('news.sub') + '</span>' +
          '<span class="ap-dataval">' + (n.subscribed ? t('news.subscribed') : t('news.unsub')) + '</span></div>' +
        '<div style="margin:.5rem 0 1.25rem"><button type="button" class="btn-outline" id="newsToggleBtn">' + (n.subscribed ? t('news.toggle_off') : t('news.toggle_on')) + '</button></div>' +
        '<div id="newsDetails" style="' + (n.subscribed?'':'opacity:.4;pointer-events:none') + '">' +
          '<label class="field-label">' + t('news.freq') + '</label>' +
          '<select class="field-input" id="newsFreq" style="max-width:260px;margin-bottom:1.1rem">' + opt('weekly',t('news.freq.weekly')) + opt('biweekly',t('news.freq.biweekly')) + opt('monthly',t('news.freq.monthly')) + '</select>' +
          '<h3 style="font-size:1rem">' + t('news.topics') + '</h3><div class="chip-row">' + topics + '</div>' +
        '</div>' +
        '<div class="profile-form-footer" style="padding-top:1.1rem"><button type="button" class="btn-primary-solid" id="newsSaveBtn">' + t('btn.save') + '</button>' +
          '<button type="button" class="btn-outline" id="newsCancelBtn">' + t('btn.cancel') + '</button>' +
          '<span id="newsMsg" class="ap-msg"></span></div>' +
      '</div>';
  }

  /* ══════════════════ HELP ══════════════════ */
  function renderAiuto(){
    function faq(icon, label, href){
      return '<a class="help-link" href="' + href + '"><span class="help-ic">' + icon + '</span><span>' + label + '</span><svg class="help-arrow" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg></a>';
    }
    return '<div class="ap-two">' +
      '<div class="ap-block"><h3>' + t('aiuto.contact') + '</h3>' +
        '<p style="font-size:.86rem;color:var(--brown-mid);margin-bottom:1rem">' + t('aiuto.contact.p') + '</p>' +
        '<a class="btn-primary-solid" href="mailto:info@memi.testdemo.it" style="display:inline-block">' + t('aiuto.email') + '</a>' +
        '<p style="font-size:.8rem;color:var(--brown-light);margin-top:1rem">info@memi.testdemo.it</p>' +
      '</div>' +
      '<div class="ap-block"><h3>' + t('aiuto.faq') + '</h3>' +
        faq('<svg viewBox="0 0 24 24"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>', t('aiuto.q1'), 'returns.html') +
        faq('<svg viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>', t('aiuto.q2'), 'returns.html') +
        faq('<svg viewBox="0 0 24 24"><path d="M3 6h18M3 12h18M3 18h18"/></svg>', t('aiuto.q3'), 'size-guide.html') +
        faq('<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>', t('aiuto.q4'), 'order-tracking.html') +
      '</div>' +
    '</div>';
  }

  /* ══════════════════ NAV ══════════════════ */
  var IC = {
    overview:'<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
    profilo:'<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    indirizzi:'<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
    taglie:'<path d="M3 6h18M3 6l2 14h14l2-14M8 6V4a4 4 0 0 1 8 0v2"/>',
    preferenze:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    ordini:'<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>',
    reso:'<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>',
    loyalty:'<polygon points="12 2 15 8.5 22 9.3 17 14 18.2 21 12 17.5 5.8 21 7 14 2 9.3 9 8.5 12 2"/>',
    carta:'<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>',
    wishlist:'<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
    newsletter:'<path d="M4 4h16v16H4z"/><polyline points="22 6 12 13 2 6"/>',
    aiuto:'<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>'
  };
  var NAV_SECTIONS = [
    { title:'sec.account', items:['overview','profilo','indirizzi','taglie','preferenze'] },
    { title:'sec.orders',  items:['ordini','reso'] },
    { title:'sec.loyalty', items:['loyalty','carta','wishlist'] },
    { title:'sec.support', items:['newsletter','aiuto'] }
  ];
  function navMarkup(activeKey, counts){
    var side = NAV_SECTIONS.map(function(sec){
      return '<div class="ap-nav-section"><p class="ap-nav-title">' + t(sec.title) + '</p>' +
        sec.items.map(function(k){
          var c = counts[k];
          return '<button class="ap-nav-item' + (k===activeKey?' active':'') + '" data-panel="' + k + '">' +
            '<svg viewBox="0 0 24 24">' + IC[k] + '</svg><span>' + t('nav.'+k) + '</span>' +
            (c ? '<span class="ap-nav-count">' + c + '</span>' : '') + '</button>';
        }).join('') + '</div>';
    }).join('');
    var flat = [];
    NAV_SECTIONS.forEach(function(sec){ sec.items.forEach(function(k){ flat.push(k); }); });
    var mob = flat.map(function(k){
      return '<button class="ap-mobnav-item' + (k===activeKey?' active':'') + '" data-panel="' + k + '">' +
        '<svg viewBox="0 0 24 24">' + IC[k] + '</svg>' + t('nav.'+k) + '</button>';
    }).join('');
    return { side:side, mob:mob };
  }

  /* ══════════════════ HEADERS ══════════════════ */
  function headFor(k){
    var titles = {
      overview:['<h1>' + greeting() + ', <em>' + esc((loadedUser&&(loadedUser.nome||loadedUser.name))||'') + '</em></h1>', t('head.overview.p')],
      profilo:['<h1>' + t('head.profilo.t') + '</h1>', t('head.profilo.p')],
      indirizzi:['<h1>' + t('head.indirizzi.t') + '</h1>', t('head.indirizzi.p')],
      taglie:['<h1>' + t('head.taglie.t') + '</h1>', t('head.taglie.p')],
      preferenze:['<h1>' + t('head.preferenze.t') + '</h1>', t('head.preferenze.p')],
      ordini:['<h1>' + t('head.ordini.t') + '</h1>', t('head.ordini.p')],
      reso:['<h1>' + t('head.reso.t') + '</h1>', t('head.reso.p')],
      loyalty:['<h1>' + t('head.loyalty.t') + '</h1>', t('head.loyalty.p')],
      carta:['<h1>' + t('head.carta.t') + '</h1>', t('head.carta.p')],
      wishlist:['<h1>' + t('head.wishlist.t') + '</h1>', t('head.wishlist.p')],
      newsletter:['<h1>' + t('head.newsletter.t') + '</h1>', t('head.newsletter.p')],
      aiuto:['<h1>' + t('head.aiuto.t') + '</h1>', t('head.aiuto.p')]
    };
    var h = titles[k] || ['<h1></h1>',''];
    return '<div class="ap-panel-head">' + h[0] + '<p>' + h[1] + '</p></div>';
  }

  function panelBody(k){
    var u = loadedUser, o = loadedOrders, loy = loadedLoy;
    var points = (loy && loy.points != null) ? loy.points : (u.points||0);
    switch(k){
      case 'overview':   return renderOverview(u, o, points);
      case 'profilo':    return renderProfile(u);
      case 'indirizzi':  return renderAddresses(u);
      case 'taglie':     return renderSizes();
      case 'preferenze': return renderPrefs();
      case 'ordini':     return renderOrdersPanel(o);
      case 'reso':       return renderResoPanel(o);
      case 'loyalty':    return renderLoyaltyPanel(u, loy);
      case 'carta':      return renderCardPanel(u, points);
      case 'wishlist':   return '<div id="wishlistMount">' + renderWishlistPanel() + '</div>';
      case 'newsletter': return renderNewsletter(u);
      case 'aiuto':      return renderAiuto();
      default:           return '';
    }
  }

  /* ══════════════════ RENDER PAGE ══════════════════ */
  var currentPanel = 'overview';
  function renderPage(){
    var u = loadedUser, o = loadedOrders, loy = loadedLoy;
    var points = (loy && loy.points != null) ? loy.points : (u.points||0);
    if (loy && loy.config) loyaltyConfig = loy.config;
    var initials = (u.nome || u.name || 'M').charAt(0).toUpperCase();
    var tr = tierFor(points);
    var counts = { ordini:(o?o.length:0)||'', wishlist:wishlistCount()||'' };
    var nav = navMarkup(currentPanel, counts);

    main.innerHTML =
      '<nav class="ap-breadcrumb"><a href="index.html">' + t('crumb.home') + '</a>' +
        '<svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg><span>' + t('crumb.area') + '</span></nav>' +
      '<div class="ap-layout">' +
        '<aside class="ap-side">' +
          '<div class="ap-side-card">' +
            '<div class="ap-avatar">' + initials + '</div>' +
            '<div class="ap-side-name">' + esc(u.nome||u.name||'') + (u.cognome?' '+esc(u.cognome):'') + '</div>' +
            '<div class="ap-side-email">' + esc(u.email||'') + '</div>' +
            '<div class="ap-tier-badge"><span class="dot" style="background:' + tr.color + '"></span>' + t('ov.level') + ' ' + tr.name + '</div>' +
          '</div>' +
          '<nav class="ap-nav" id="apNav">' + nav.side + '</nav>' +
          '<button class="ap-side-logout" id="logoutBtn"><svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>' + t('logout') + '</button>' +
        '</aside>' +
        '<div class="ap-content">' +
          '<div class="ap-mobnav" id="apMobNav">' + nav.mob + '</div>' +
          '<div class="ap-panel active" id="apPanel">' + headFor(currentPanel) + panelBody(currentPanel) + '</div>' +
        '</div>' +
      '</div>';

    wireAll();
    onEnter(currentPanel);
  }

  function rerenderPanel(){
    var panel = el('apPanel');
    if (!panel) { renderPage(); return; }
    panel.innerHTML = headFor(currentPanel) + panelBody(currentPanel);
    wirePanel();
  }

  function switchPanel(key){
    if (!key) return;
    currentPanel = key;
    main.querySelectorAll('.ap-nav-item, .ap-mobnav-item').forEach(function(b){
      b.classList.toggle('active', b.dataset.panel === key);
    });
    rerenderPanel();
    onEnter(key);
    try { history.replaceState(null, '', '#' + key); } catch(_){}
    window.scrollTo({ top:0, behavior:'smooth' });
  }

  // Refresh a panel's data from the backend when it's opened. Renders instantly
  // from the localStorage cache first (in rerenderPanel), then reconciles here.
  function onEnter(key){
    var A = window.MemiAPI && window.MemiAPI.auth;
    if (!A) return;
    if (key === 'indirizzi' && A.addresses){
      A.addresses.list().then(function(res){
        var arr = (res && res.addresses) || [];
        lset('memi_addresses', arr.map(function(r){
          return { id:String(r.id), label:r.label, indirizzo:r.indirizzo, numero_civico:r.numero_civico, piano:r.piano, nome_campanello:r.nome_campanello, citta:r.citta, cap:r.cap, paese:r.paese, telefono:r.telefono, def:r.is_default===1 };
        }));
        if (currentPanel === 'indirizzi' && !addrEditingId) rerenderPanel();
      }).catch(function(){});
    }
    if (key === 'newsletter' && A.newsletter){
      A.newsletter.get().then(function(res){
        lset('memi_news', { subscribed:!!res.subscribed, freq:res.frequenza||'biweekly', topics:res.topics||[] });
        if (currentPanel === 'newsletter') rerenderPanel();
      }).catch(function(){});
    }
    if (key === 'wishlist' && A.wishlist){
      A.wishlist.get().then(function(res){
        if (res && Array.isArray(res.items)){
          lset('memi_wishlist', res.items);
          var m = el('wishlistMount'); if (currentPanel==='wishlist' && m) m.innerHTML = renderWishlistPanel();
          refreshCounts();
        }
      }).catch(function(){});
    }
    if (key === 'reso' && window.MemiAPI.resi && window.MemiAPI.resi.myReturns){
      window.MemiAPI.resi.myReturns().then(function(res){
        loadedReturns = (res && Array.isArray(res.resi)) ? res.resi : loadedReturns;
        if (currentPanel === 'reso') rerenderPanel();
      }).catch(function(){});
    }
  }

  /* ══════════════════ WIRING ══════════════════ */
  function wireAll(){
    main.addEventListener('click', onMainClick);
    var lo = el('logoutBtn');
    if (lo) lo.addEventListener('click', doLogout);
    wirePanel();
  }

  function onMainClick(e){
    var nav = e.target.closest('[data-panel]');
    if (nav){ switchPanel(nav.dataset.panel); return; }
    var goto = e.target.closest('[data-goto]');
    if (goto){ e.preventDefault(); switchPanel(goto.dataset.goto); return; }
    var det = e.target.closest('.order-detail-btn');
    if (det){ showOrderDetail(det.dataset.id); return; }
    var rm = e.target.closest('[data-wl-remove]');
    if (rm){ e.preventDefault();
      if (window.appRemoveWishlist) window.appRemoveWishlist(rm.getAttribute('data-wl-remove'));
      else { lset('memi_wishlist', loadWishlist().filter(function(i){ return i.id !== rm.getAttribute('data-wl-remove'); })); }
      var m = el('wishlistMount'); if (m) m.innerHTML = renderWishlistPanel(); refreshCounts(); return;
    }
    var cart = e.target.closest('[data-wl-cart]');
    if (cart){ e.preventDefault();
      if (window.appMoveToCart) window.appMoveToCart(cart.getAttribute('data-wl-cart'));
      setTimeout(function(){ var m = el('wishlistMount'); if (m) m.innerHTML = renderWishlistPanel(); refreshCounts(); }, 60); return;
    }
    var pg = e.target.closest('[data-wl-page]');
    if (pg){ wishlistPage = parseInt(pg.getAttribute('data-wl-page'),10)||1; var m=el('wishlistMount'); if (m) m.innerHTML = renderWishlistPanel(); return; }
    var ae = e.target.closest('[data-addr-edit]'); if (ae){ addrEditingId = ae.getAttribute('data-addr-edit'); rerenderPanel(); return; }
    var ac = e.target.closest('[data-addr-cancel]'); if (ac){ e.preventDefault(); addrEditingId = null; rerenderPanel(); return; }
    var aadd = e.target.closest('#addrAddBtn'); if (aadd){ addrEditingId = 'new'; rerenderPanel(); return; }
    var ad = e.target.closest('[data-addr-default]'); if (ad){ setDefaultAddress(ad.getAttribute('data-addr-default')); return; }
    var adel = e.target.closest('[data-addr-del]'); if (adel){ deleteAddress(adel.getAttribute('data-addr-del')); return; }
    if (e.target.closest('#profileEditBtn')){ profileEditing = true; rerenderPanel(); return; }
    if (e.target.closest('#profileCancelBtn')){ profileEditing = false; rerenderPanel(); return; }
    if (e.target.closest('#sizesEditBtn')){ sizesEditing = true; rerenderPanel(); return; }
    if (e.target.closest('#sizesCancelBtn')){ sizesEditing = false; rerenderPanel(); return; }
    if (e.target.closest('#prefEditBtn')){ prefsEditing = true; rerenderPanel(); return; }
    if (e.target.closest('#prefCancelBtn')){ prefsEditing = false; rerenderPanel(); return; }
    if (e.target.closest('#newsEditBtn')){ newsEditing = true; rerenderPanel(); return; }
    if (e.target.closest('#newsCancelBtn')){ newsEditing = false; rerenderPanel(); return; }
    var pc = e.target.closest('[data-pref-cat]'); if (pc){ togglePref('categories', pc.getAttribute('data-pref-cat'), pc); return; }
    var pcol = e.target.closest('[data-pref-color]'); if (pcol){ togglePref('colors', pcol.getAttribute('data-pref-color'), pcol); return; }
    var ntp = e.target.closest('[data-news-topic]'); if (ntp){ ntp.classList.toggle('on'); return; }
  }

  /* ══════════════════ BIRTHDAY DATE PICKER (custom, branded) ══════════════════ */
  var DP_L = {
    it:{ months:['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'],
         monthsShort:['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'],
         wd:['lu','ma','me','gi','ve','sa','do'], placeholder:'Seleziona una data', clear:'Cancella', today:'Oggi',
         prev:'Mese precedente', next:'Mese successivo', chooseYear:'Scegli anno' },
    en:{ months:['January','February','March','April','May','June','July','August','September','October','November','December'],
         monthsShort:['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
         wd:['Mo','Tu','We','Th','Fr','Sa','Su'], placeholder:'Select a date', clear:'Clear', today:'Today',
         prev:'Previous month', next:'Next month', chooseYear:'Choose year' }
  };
  function dpL(){ return DP_L[lang] || DP_L.it; }
  function pad2(n){ return (n<10?'0':'')+n; }
  function toISO(y,mo,d){ return y+'-'+pad2(mo+1)+'-'+pad2(d); }
  function parseISO(str){ var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(str||''); return m?{y:+m[1],mo:+m[2]-1,d:+m[3]}:null; }
  function fmtBirthday(iso){ var p=parseISO(iso); if(!p) return ''; var L=dpL();
    return lang==='en' ? (p.d+' '+L.monthsShort[p.mo]+' '+p.y) : (pad2(p.d)+'/'+pad2(p.mo+1)+'/'+p.y); }

  function birthdayPickerHtml(iso){
    var disp = fmtBirthday(iso);
    return '<div class="memi-dp" data-min="1920-01-01" data-max="2020-12-31">' +
        '<input type="hidden" id="pfBirthday" value="' + esc(iso||'') + '" />' +
        '<button type="button" class="field-input memi-dp-trigger" aria-haspopup="dialog" aria-expanded="false">' +
          '<span class="memi-dp-value' + (disp?'':' is-empty') + '">' + (disp || dpL().placeholder) + '</span>' +
          '<svg class="memi-dp-ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/>' +
            '<line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' +
        '</button>' +
      '</div>';
  }

  function initBirthdayPicker(){
    var root = document.querySelector('.memi-dp'); if(!root || root._dpInit) return; root._dpInit = true;
    var hidden = root.querySelector('#pfBirthday');
    var trigger = root.querySelector('.memi-dp-trigger');
    var valEl = root.querySelector('.memi-dp-value');
    var min = parseISO(root.getAttribute('data-min')) || {y:1920,mo:0,d:1};
    var max = parseISO(root.getAttribute('data-max')) || {y:2020,mo:11,d:31};
    var minT = new Date(min.y,min.mo,min.d).getTime();
    var maxT = new Date(max.y,max.mo,max.d).getTime();
    var monMinT = new Date(min.y,min.mo,1).getTime();
    var monMaxT = new Date(max.y,max.mo,1).getTime();
    var pop=null, backdrop=null, view=null, yearMode=false;

    function selected(){ return parseISO(hidden.value); }
    function isMobile(){ return window.matchMedia('(max-width:520px)').matches; }
    function clampView(y,mo){ var t=new Date(y,mo,1).getTime();
      if(t<monMinT) return {y:min.y,mo:min.mo};
      if(t>monMaxT) return {y:max.y,mo:max.mo};
      return {y:y,mo:mo}; }
    function inRange(y,mo,d){ var t=new Date(y,mo,d).getTime(); return t>=minT && t<=maxT; }

    function setValue(iso){
      hidden.value = iso || '';
      var disp = fmtBirthday(iso);
      valEl.textContent = disp || dpL().placeholder;
      valEl.classList.toggle('is-empty', !disp);
    }

    function positionPop(){
      if(!pop) return;
      if(isMobile()){ pop.style.left=pop.style.top=''; return; }
      var r = trigger.getBoundingClientRect();
      var pw = pop.offsetWidth, ph = pop.offsetHeight;
      var left = Math.max(8, Math.min(r.left, window.innerWidth - pw - 8));
      var top = r.bottom + 6;
      if(top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 6);
      pop.style.left = left+'px'; pop.style.top = top+'px';
    }

    function open(){
      if(pop) return;
      var sel = selected();
      view = sel ? {y:sel.y,mo:sel.mo} : clampView(max.y,max.mo);
      yearMode = false;
      backdrop = document.createElement('div'); backdrop.className='memi-dp-backdrop';
      backdrop.addEventListener('click', close);
      document.body.appendChild(backdrop);
      pop = document.createElement('div');
      pop.className='memi-dp-pop';
      pop.setAttribute('role','dialog'); pop.setAttribute('aria-modal','true'); pop.setAttribute('aria-label', dpL().placeholder);
      document.body.appendChild(pop);
      render();
      trigger.setAttribute('aria-expanded','true');
      document.addEventListener('mousedown', onDoc, true);
      document.addEventListener('keydown', onKey, true);
      window.addEventListener('resize', positionPop);
      window.addEventListener('scroll', positionPop);
      var f = pop.querySelector('.memi-dp-day.is-sel, .memi-dp-day:not(.is-disabled)'); if(f) f.focus();
    }
    function close(){
      if(!pop) return;
      document.removeEventListener('mousedown', onDoc, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', positionPop);
      window.removeEventListener('scroll', positionPop);
      pop.remove(); pop=null;
      if(backdrop){ backdrop.remove(); backdrop=null; }
      trigger.setAttribute('aria-expanded','false');
      trigger.focus();
    }
    function onDoc(e){ if(pop && !pop.contains(e.target) && !trigger.contains(e.target)) close(); }
    function onKey(e){
      if(e.key==='Escape'){ e.preventDefault(); close(); return; }
      if(yearMode) return;
      var days = Array.prototype.slice.call(pop.querySelectorAll('.memi-dp-day:not(.is-disabled)'));
      var i = days.indexOf(document.activeElement); if(i<0) return;
      var nx=-1;
      if(e.key==='ArrowRight') nx=i+1; else if(e.key==='ArrowLeft') nx=i-1;
      else if(e.key==='ArrowDown') nx=i+7; else if(e.key==='ArrowUp') nx=i-7;
      else if(e.key==='Enter'||e.key===' '){ e.preventDefault(); document.activeElement.click(); return; }
      else return;
      e.preventDefault();
      if(nx>=0 && nx<days.length) days[nx].focus();
    }

    function render(){
      var L=dpL();
      if(yearMode){ pop.innerHTML = yearHtml(); wireYear(); positionPop(); return; }
      var sel = selected();
      var startDow = (new Date(view.y,view.mo,1).getDay()+6)%7;   // Monday-first
      var dim = new Date(view.y,view.mo+1,0).getDate();
      var prevOff = new Date(view.y,view.mo,1).getTime() <= monMinT;
      var nextOff = new Date(view.y,view.mo,1).getTime() >= monMaxT;
      var h = '<div class="memi-dp-head">' +
          '<button type="button" class="memi-dp-title" aria-label="'+L.chooseYear+'">'+L.months[view.mo]+' '+view.y+
            ' <svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg></button>' +
          '<div class="memi-dp-nav">' +
            '<button type="button" class="memi-dp-arrow" data-nav="-1" '+(prevOff?'disabled':'')+' aria-label="'+L.prev+'"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg></button>' +
            '<button type="button" class="memi-dp-arrow" data-nav="1" '+(nextOff?'disabled':'')+' aria-label="'+L.next+'"><svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg></button>' +
          '</div></div>';
      h += '<div class="memi-dp-grid memi-dp-wd">' + L.wd.map(function(w){return '<span class="memi-dp-wdlbl">'+w+'</span>';}).join('') + '</div>';
      h += '<div class="memi-dp-grid memi-dp-days" role="grid">';
      for(var i=0;i<startDow;i++) h += '<span class="memi-dp-pad" aria-hidden="true"></span>';
      for(var d=1; d<=dim; d++){
        var dis = !inRange(view.y,view.mo,d);
        var isSel = sel && sel.y===view.y && sel.mo===view.mo && sel.d===d;
        h += '<button type="button" class="memi-dp-day'+(isSel?' is-sel':'')+(dis?' is-disabled':'')+'" '+
             (dis?'disabled aria-disabled="true"':'')+' data-d="'+d+'" role="gridcell" aria-selected="'+(isSel?'true':'false')+'">'+d+'</button>';
      }
      h += '</div>';
      h += '<div class="memi-dp-foot">' +
          '<button type="button" class="memi-dp-link" data-act="clear">'+L.clear+'</button>' +
          '<button type="button" class="memi-dp-link" data-act="today">'+L.today+'</button>' +
        '</div>';
      pop.innerHTML = h;
      wireDays();
      positionPop();
    }
    function wireDays(){
      pop.querySelector('.memi-dp-title').addEventListener('click', function(){ yearMode=true; render(); });
      Array.prototype.forEach.call(pop.querySelectorAll('.memi-dp-arrow'), function(b){
        b.addEventListener('click', function(){ if(b.disabled) return;
          view = clampView(view.y, view.mo + parseInt(b.getAttribute('data-nav'),10)); render();
          var f=pop.querySelector('.memi-dp-day:not(.is-disabled)'); if(f) f.focus(); });
      });
      Array.prototype.forEach.call(pop.querySelectorAll('.memi-dp-day:not(.is-disabled)'), function(b){
        b.addEventListener('click', function(){ setValue(toISO(view.y,view.mo,parseInt(b.getAttribute('data-d'),10))); close(); });
      });
      pop.querySelector('[data-act="clear"]').addEventListener('click', function(){ setValue(''); close(); });
      pop.querySelector('[data-act="today"]').addEventListener('click', function(){
        var n=new Date(), y=n.getFullYear(), mo=n.getMonth(), d=n.getDate();
        if(inRange(y,mo,d)){ setValue(toISO(y,mo,d)); close(); } else { view=clampView(y,mo); render(); }
      });
    }
    function yearHtml(){
      var L=dpL(), h='<div class="memi-dp-head"><button type="button" class="memi-dp-title" aria-label="'+L.chooseYear+'">'+view.y+
        ' <svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="18 15 12 9 6 15"/></svg></button></div><div class="memi-dp-years">';
      for(var y=max.y; y>=min.y; y--) h += '<button type="button" class="memi-dp-year'+(y===view.y?' is-sel':'')+'" data-y="'+y+'">'+y+'</button>';
      return h + '</div>';
    }
    function wireYear(){
      Array.prototype.forEach.call(pop.querySelectorAll('.memi-dp-year'), function(b){
        b.addEventListener('click', function(){ view = clampView(parseInt(b.getAttribute('data-y'),10), view.mo); yearMode=false; render(); });
      });
      pop.querySelector('.memi-dp-title').addEventListener('click', function(){ yearMode=false; render(); });
      var cur = pop.querySelector('.memi-dp-year.is-sel'); if(cur) cur.scrollIntoView({block:'center'});
    }

    trigger.addEventListener('click', function(){ if(pop) close(); else open(); });
  }

  function wirePanel(){
    var rbtn = el('redeemBtn');
    if (rbtn) rbtn.addEventListener('click', function(){
      var pts = parseInt((el('redeemPoints')||{}).value, 10) || 0;
      var msg = el('redeemMsg');
      if (!pts){ msg.className='ap-msg err'; msg.textContent=t('loy.redeem.empty'); return; }
      rbtn.disabled = true; msg.className='ap-msg'; msg.textContent=t('loy.redeem.wait');
      window.MemiAPI.auth.redeemPoints(pts).then(function(r){
        msg.className='ap-msg ok';
        msg.innerHTML = t('loy.redeem.done') + ' <strong>' + esc(r.code) + '</strong> € ' + Number(r.value).toFixed(2).replace('.', lang==='en'?'.':',') + ' ' + t('loy.redeem.use');
        var bal = el('loyBalance'); if (bal) bal.textContent = Math.max(0,(parseInt(bal.textContent,10)||0)-pts);
        rbtn.disabled = false;
      }).catch(function(err){ msg.className='ap-msg err'; msg.textContent=(err&&err.error)||t('loy.redeem.err'); rbtn.disabled=false; });
    });

    var pf = el('profileForm');
    if (pf) pf.addEventListener('submit', function(e){
      e.preventDefault();
      var msgEl = el('profileMsg'), btn = pf.querySelector('[type=submit]');
      btn.disabled = true;
      var payload = { nome:el('pfNome').value.trim(), cognome:el('pfCognome').value.trim(), email:el('pfEmail').value.trim(), telefono:el('pfTel').value.trim() };
      if (el('pfBirthday')) payload.birthday = el('pfBirthday').value; // '' clears it server-side
      window.MemiAPI.auth.updateMe(payload).then(function(){
        Object.keys(payload).forEach(function(k){ loadedUser[k] = payload[k]; });
        msgEl.className='ap-msg ok'; msgEl.textContent=t('msg.saved');
        setTimeout(function(){ profileEditing = false; renderPage(); }, 700);
      }).catch(function(err){ msgEl.className='ap-msg err'; msgEl.textContent=(err&&err.error)||t('msg.err'); btn.disabled=false; });
    });

    initBirthdayPicker();

    var pw = el('passwordForm');
    if (pw) pw.addEventListener('submit', function(e){
      e.preventDefault();
      var np=el('pfPassNew').value, cp=el('pfPassConf').value, msgEl=el('passMsg'), btn=pw.querySelector('[type=submit]');
      if (!np) return;
      if (np.length<8){ msgEl.className='ap-msg err'; msgEl.textContent=t('pwd.min'); return; }
      if (np!==cp){ msgEl.className='ap-msg err'; msgEl.textContent=t('pwd.nomatch'); return; }
      btn.disabled=true;
      window.MemiAPI.auth.updateMe({ password:np }).then(function(){
        msgEl.className='ap-msg ok'; msgEl.textContent=t('pwd.updated'); pw.reset(); setTimeout(function(){msgEl.textContent='';},3000);
      }).catch(function(err){ msgEl.className='ap-msg err'; msgEl.textContent=(err&&err.error)||t('msg.err'); }).finally(function(){ btn.disabled=false; });
    });

    var af = el('apPanel') && el('apPanel').querySelector('.addr-form');
    if (af) { af.addEventListener('submit', function(e){ e.preventDefault(); saveAddress(af); }); wireAddrAutocomplete(af); }

    var sf = el('sizesForm');
    if (sf) sf.addEventListener('submit', function(e){
      e.preventDefault();
      var data = { top:el('szTop').value, bottom:el('szBottom').value, dress:el('szDress').value, shoe:el('szShoe').value, notes:el('szNotes').value.trim() };
      lset('memi_sizes', data);
      var p = window.MemiAPI && window.MemiAPI.auth.saveSizes && window.MemiAPI.auth.saveSizes(data);
      apiSave(el('sizesMsg'), p);
      // Return to the read-only view after saving (mirrors "I miei dati").
      if (p && p.then) p.then(function(){ setTimeout(function(){ sizesEditing = false; rerenderPanel(); }, 700); });
      else setTimeout(function(){ sizesEditing = false; rerenderPanel(); }, 700);
    });

    var psb = el('prefSaveBtn');
    if (psb) psb.addEventListener('click', function(){
      var p = lget('memi_prefs', {});
      p.email = el('prefEmail').checked; p.sms = el('prefSms').checked;
      lset('memi_prefs', p);
      var pr = window.MemiAPI && window.MemiAPI.auth.savePreferences && window.MemiAPI.auth.savePreferences(p);
      apiSave(el('prefMsg'), pr);
      if (pr && pr.then) pr.then(function(){ setTimeout(function(){ prefsEditing = false; rerenderPanel(); }, 700); });
      else setTimeout(function(){ prefsEditing = false; rerenderPanel(); }, 700);
    });

    var ntg = el('newsToggleBtn');
    if (ntg) ntg.addEventListener('click', function(){
      var n = lget('memi_news', {}); n.subscribed = !n.subscribed; lset('memi_news', n); rerenderPanel();
    });
    var nsb = el('newsSaveBtn');
    if (nsb) nsb.addEventListener('click', function(){
      var n = lget('memi_news', {});
      if (el('newsFreq')) n.freq = el('newsFreq').value;
      var topics = []; (el('apPanel').querySelectorAll('[data-news-topic].on')||[]).forEach(function(b){ topics.push(b.getAttribute('data-news-topic')); });
      n.topics = topics; lset('memi_news', n);
      var pr = window.MemiAPI && window.MemiAPI.auth.newsletter &&
        window.MemiAPI.auth.newsletter.save({ subscribed:n.subscribed !== false, frequenza:n.freq, topics:topics });
      apiSave(el('newsMsg'), pr);
      if (pr && pr.then) pr.then(function(){ setTimeout(function(){ newsEditing = false; rerenderPanel(); }, 700); });
      else setTimeout(function(){ newsEditing = false; rerenderPanel(); }, 700);
    });
  }

  // Shared save-feedback helper: shows a saving→saved/error message.
  // If `promise` is falsy (endpoint unavailable) the local cache already holds
  // the value, so we still confirm "saved".
  function apiSave(msgEl, promise){
    if (!msgEl) return;
    if (!promise || !promise.then){ msgEl.className='ap-msg ok'; msgEl.textContent=t('msg.saved'); setTimeout(function(){ msgEl.textContent=''; },2500); return; }
    msgEl.className='ap-msg'; msgEl.textContent='…';
    promise.then(function(){ msgEl.className='ap-msg ok'; msgEl.textContent=t('msg.saved'); })
      .catch(function(){ msgEl.className='ap-msg err'; msgEl.textContent=t('msg.err'); })
      .then(function(){ setTimeout(function(){ if (msgEl) msgEl.textContent=''; },2800); });
  }

  function togglePref(kind, val, btn){
    var p = lget('memi_prefs', { categories:[], colors:[] });
    p[kind] = p[kind] || [];
    var i = p[kind].indexOf(val);
    if (i>-1) p[kind].splice(i,1); else p[kind].push(val);
    lset('memi_prefs', p);
    btn.classList.toggle('on');
  }

  /* ── Address autocomplete (OpenStreetMap / Photon — free, no API key) ──
     Type-ahead street lookup biased to Italy. On pick, fills via + civico +
     città + CAP + paese. Fully optional: if offline the fields stay manual. */
  function wireAddrAutocomplete(form){
    var via = el('addrVia'), box = el('addrSuggest');
    if (!via || !box) return;
    var timer = null, controller = null, feats = [], active = -1;
    function close(){ box.innerHTML = ''; box.classList.remove('open'); active = -1; }
    function pick(f){
      if (!f || !f.properties) return;
      var p = f.properties;
      via.value = p.street || p.name || via.value;
      function set(name, val){ var i = form.querySelector('[name="'+name+'"]'); if (i && val) i.value = val; }
      set('numero_civico', p.housenumber);
      set('citta', p.city || p.town || p.village || p.county || p.state);
      set('cap', p.postcode);
      set('paese', p.country || 'Italia');
      close();
    }
    function fmt(p){
      var line = [p.street || p.name, p.housenumber].filter(Boolean).join(' ');
      var loc  = [p.postcode, p.city || p.town || p.village || p.county || p.state].filter(Boolean).join(' ');
      return { line: line || (p.name||''), loc: loc };
    }
    function render(){
      if (!feats.length){ close(); return; }
      box.innerHTML = feats.map(function(f, i){
        var o = fmt(f.properties);
        return '<button type="button" class="addr-suggest-item' + (i===active?' active':'') + '" data-i="'+i+'">' +
          '<svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>' +
          '<span class="al-main">' + esc(o.line) + (o.loc ? '<span class="al-sub">' + esc(o.loc) + '</span>' : '') + '</span></button>';
      }).join('');
      box.classList.add('open');
    }
    function query(q){
      // Photon supports lang: default|de|en|fr — "it" returns HTTP 400, which
      // silently killed the whole autocomplete. "default" gives local (Italian) names.
      var url = 'https://photon.komoot.io/api/?lang=default&limit=6&bbox=6.6,35.4,18.6,47.1&q=' + encodeURIComponent(q);
      try { if (controller) controller.abort(); } catch(_){}
      controller = ('AbortController' in window) ? new AbortController() : null;
      fetch(url, controller ? { signal: controller.signal } : {})
        .then(function(r){ return r.json(); })
        .then(function(res){
          feats = (res.features || []).filter(function(f){ return f.properties && (f.properties.street || f.properties.name); }).slice(0, 6);
          active = -1; render();
        }).catch(function(){ /* offline / rate-limited → silent, manual entry works */ });
    }
    via.addEventListener('input', function(){
      var q = via.value.trim();
      clearTimeout(timer);
      if (q.length < 3){ close(); return; }
      timer = setTimeout(function(){ query(q); }, 300);
    });
    via.addEventListener('keydown', function(e){
      if (!box.classList.contains('open')) return;
      if (e.key === 'ArrowDown'){ e.preventDefault(); active = Math.min(active+1, feats.length-1); render(); }
      else if (e.key === 'ArrowUp'){ e.preventDefault(); active = Math.max(active-1, 0); render(); }
      else if (e.key === 'Enter' && active >= 0){ e.preventDefault(); pick(feats[active]); }
      else if (e.key === 'Escape'){ close(); }
    });
    via.addEventListener('blur', function(){ setTimeout(close, 150); });
    box.addEventListener('mousedown', function(e){
      var btn = e.target.closest('.addr-suggest-item'); if (!btn) return;
      e.preventDefault(); pick(feats[parseInt(btn.getAttribute('data-i'), 10)]);
    });
  }

  function addrApi(){ return window.MemiAPI && window.MemiAPI.auth && window.MemiAPI.auth.addresses; }

  function saveAddress(form){
    var id = form.getAttribute('data-addr-id');
    var data = {};
    form.querySelectorAll('input').forEach(function(inp){ data[inp.name] = inp.value.trim(); });
    var A = addrApi();
    if (A){
      var p = (id === 'new') ? A.create(data) : A.update(id, data);
      p.then(function(){ addrEditingId = null; onEnter('indirizzi'); })
       .catch(function(){ saveAddressLocal(id, data); addrEditingId = null; rerenderPanel(); });
    } else { saveAddressLocal(id, data); addrEditingId = null; rerenderPanel(); }
  }
  function saveAddressLocal(id, data){
    var list = loadAddresses(loadedUser);
    if (id === 'new'){
      list.push({ id:'a'+Date.now(), label:data.label||'Indirizzo', indirizzo:data.indirizzo, numero_civico:data.numero_civico, piano:data.piano, nome_campanello:data.nome_campanello, citta:data.citta, cap:data.cap, paese:data.paese, telefono:data.telefono, def:list.length===0 });
    } else {
      list = list.map(function(a){ return a.id===id ? Object.assign(a, data) : a; });
    }
    lset('memi_addresses', list);
  }
  function setDefaultAddress(id){
    var A = addrApi();
    if (A){ A.setDefault(id).then(function(){ onEnter('indirizzi'); }).catch(function(){ setDefaultLocal(id); rerenderPanel(); }); }
    else { setDefaultLocal(id); rerenderPanel(); }
  }
  function setDefaultLocal(id){
    lset('memi_addresses', loadAddresses(loadedUser).map(function(a){ return Object.assign({}, a, { def:a.id===id }); }));
  }
  function deleteAddress(id){
    var A = addrApi();
    if (A){ A.remove(id).then(function(){ onEnter('indirizzi'); }).catch(function(){ delAddressLocal(id); rerenderPanel(); }); }
    else { delAddressLocal(id); rerenderPanel(); }
  }
  function delAddressLocal(id){
    lset('memi_addresses', loadAddresses(loadedUser).filter(function(a){ return a.id!==id; }));
  }

  function doLogout(){ if (window.MemiAPI) window.MemiAPI.auth.logout(); window.location.href = 'index.html'; }

  function refreshCounts(){
    var wc = wishlistCount();
    main.querySelectorAll('.ap-nav-item[data-panel="wishlist"]').forEach(function(navItem){
      var badge = navItem.querySelector('.ap-nav-count');
      if (wc){ if (badge) badge.textContent = wc; else navItem.insertAdjacentHTML('beforeend','<span class="ap-nav-count">'+wc+'</span>'); }
      else if (badge) badge.remove();
    });
    var stat = main.querySelector('.ap-stat[data-goto="wishlist"] .ap-stat-num');
    if (stat) stat.textContent = wc;
  }

  /* ══════════════════ LANGUAGE (code-ready, no visible toggle) ══════════════════ */
  window.MemiSetLang = function(l){
    if (l!=='en' && l!=='it') return;
    lang = l; try { localStorage.setItem(LANG_KEY, l); } catch(_){}
    document.documentElement.setAttribute('lang', l);
    if (window.MemiAPI && window.MemiAPI.auth && window.MemiAPI.auth.setLang) window.MemiAPI.auth.setLang(l).catch(function(){});
    renderPage();
  };
  window.MemiGetLang = function(){ return lang; };

  /* ══════════════════ CATALOG (wishlist images) ══════════════════ */
  function loadCatalog(){
    return fetch('/api/products?limit=300').then(function(r){ return r.json(); })
      .then(function(res){
        var products = Array.isArray(res) ? res : (res && res.products) || [];
        products.forEach(function(p){
          var img = '';
          if (Array.isArray(p.images) && p.images.length){ var x = p.images[0]; img = (typeof x==='string') ? x : (x && (x.card||x.full||x.thumb)) || ''; }
          catalogMap[p.id] = { img:img, name:p.name||'' };
        });
      }).catch(function(){});
  }

  /* ══════════════════ INIT ══════════════════ */
  document.documentElement.setAttribute('lang', lang);
  if (!window.MemiAPI || !window.MemiAPI.auth.isLoggedIn()){
    window.location.href = 'index.html?login=required';
    return;
  }
  Promise.all([
    window.MemiAPI.auth.me(),
    window.MemiAPI.orders.myOrders().catch(function(){ return []; }),
    window.MemiAPI.auth.loyalty().catch(function(){ return null; }),
    loadCatalog(),
    (window.MemiAPI.resi && window.MemiAPI.resi.myReturns ? window.MemiAPI.resi.myReturns().catch(function(){ return { resi: [] }; }) : Promise.resolve({ resi: [] }))
  ]).then(function(results){
    loadedUser = results[0].user || results[0];
    loadedOrders = Array.isArray(results[1]) ? results[1] : (results[1].orders || []);
    loadedLoy = results[2];
    loadedReturns = (results[4] && Array.isArray(results[4].resi)) ? results[4].resi : [];
    // Hydrate local caches from the server profile (only when the field exists,
    // so an older backend that doesn't return them still works via localStorage).
    if (loadedUser) {
      if (loadedUser.sizes && typeof loadedUser.sizes === 'object' && Object.keys(loadedUser.sizes).length) lset('memi_sizes', loadedUser.sizes);
      if (loadedUser.preferences && typeof loadedUser.preferences === 'object' && Object.keys(loadedUser.preferences).length) lset('memi_prefs', loadedUser.preferences);
      if (loadedUser.lang === 'it' || loadedUser.lang === 'en') { lang = loadedUser.lang; try { localStorage.setItem(LANG_KEY, lang); } catch(_){} }
      if (Array.isArray(loadedUser.wishlist) && loadedUser.wishlist.length && !loadWishlist().length) lset('memi_wishlist', loadedUser.wishlist);
    }
    var hash = (location.hash||'').replace('#','');
    var validKeys = []; NAV_SECTIONS.forEach(function(s){ s.items.forEach(function(k){ validKeys.push(k); }); });
    if (hash && validKeys.indexOf(hash)>-1) currentPanel = hash;
    renderPage();
    window.addEventListener('hashchange', function(){
      var h = (location.hash||'').replace('#','');
      if (h && validKeys.indexOf(h)>-1 && h!==currentPanel) switchPanel(h);
    });
  }).catch(function(){
    window.MemiAPI.auth.logout();
    window.location.href = 'index.html?session=expired';
  });

})();
