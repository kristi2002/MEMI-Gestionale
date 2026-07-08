/* MEMI Admin — extracted module. Loaded as a classic <script> AFTER app.js;
   shares the global scope (VIEWS, DATA, renderView, AdminAPI, helpers). */

/* ═══════════════════════════════════════════════════════════════════════════
   REAL CHAT (overrides the earlier mock renderConvList/renderActiveChat/
   sendChatMessage/VIEWS.chat — later top-level declarations win). API-backed:
   DATA.chat = { conversations, unread_total }, DATA.chatActive = { conversation, messages }.
   ═══════════════════════════════════════════════════════════════════════════ */
function renderConvList(filter){
  filter = filter || 'all';
  var convs = (DATA.chat && DATA.chat.conversations) || [];
  var list = convs.slice();
  if (filter === 'unread') list = list.filter(function(c){ return c.unread_admin > 0; });
  if (filter === 'open')   list = list.filter(function(c){ return c.status === 'aperta'; });
  var html = list.map(function(c){
    var name = (c.name || 'Cliente');
    var last = c.last_message ? (c.last_message.length > 34 ? c.last_message.slice(0,34)+'…' : c.last_message) : '';
    var when = c.last_message_at ? new Date(c.last_message_at).toLocaleDateString('it-IT') : '';
    return '<div class="chat-conv '+(c.id===activeChatId?'active':'')+'" data-id="'+c.id+'">'+
      '<div class="avatar">'+name.charAt(0).toUpperCase()+'</div>'+
      '<div class="info"><div class="top"><strong>'+String(name).replace(/</g,'&lt;')+'</strong><small>'+when+'</small></div>'+
      '<p>'+String(last).replace(/</g,'&lt;')+'</p></div>'+
      (c.unread_admin ? '<span class="unread">'+c.unread_admin+'</span>' : '')+
      '</div>';
  }).join('');
  $('#chatConvList').html(html || '<div class="empty">Nessuna conversazione</div>');
}

function renderActiveChat(){
  var d = DATA.chatActive;
  if (!d || !d.conversation){
    $('#chatHeader').html('<div style="color:var(--muted);padding:6px 2px">Seleziona una conversazione</div>');
    $('#chatBody').html('<div class="empty" style="margin:auto">Nessuna conversazione selezionata</div>');
    $('#chatInfo').html('');
    return;
  }
  var c = d.conversation; var name = (c.name || 'Cliente');
  $('#chatHeader').html(
    '<div class="avatar">'+name.charAt(0).toUpperCase()+'</div>'+
    '<div><h4>'+String(name).replace(/</g,'&lt;')+'</h4><small>'+(c.email||'')+' · '+(c.status==='chiusa'?'Chiusa':'Aperta')+'</small></div>'+
    '<div class="actions"><button class="btn btn-ghost btn-sm js-chat-toggle-status" data-status="'+c.status+'">'+(c.status==='chiusa'?'Riapri':'Chiudi')+'</button></div>'
  );
  var body = '';
  (d.messages || []).forEach(function(m){
    var t = (m.sender === 'admin') ? 'out' : 'in';
    var ts = m.created_at ? new Date(m.created_at).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'}) : '';
    body += '<div class="chat-msg '+t+'">'+String(m.body||'').replace(/</g,'&lt;').replace(/\n/g,'<br>')+'<span class="ts">'+ts+'</span></div>';
  });
  $('#chatBody').html(body || '<div class="chat-day">Nessun messaggio</div>');
  scrollChatToBottom();
  $('#chatInfo').html(
    '<div class="ci-section" style="text-align:center;padding-bottom:10px;border-bottom:1px solid var(--line-2);margin-bottom:14px">'+
      '<div class="avatar" style="width:64px;height:64px;font-size:24px;margin:0 auto 10px">'+name.charAt(0).toUpperCase()+'</div>'+
      '<strong style="font-size:14px">'+String(name).replace(/</g,'&lt;')+'</strong>'+
      '<small style="display:block;color:var(--muted);margin-top:2px">'+(c.email||'—')+'</small>'+
      (c.customer_id?'<span class="badge badge-green" style="margin-top:6px;display:inline-block">Cliente registrato</span>':'<span class="badge badge-soft" style="margin-top:6px;display:inline-block">Ospite</span>')+
    '</div>'+
    (c.customer_id?('<div class="ci-section"><h4>Dettagli cliente</h4><div class="kv" style="grid-template-columns:90px 1fr"><div class="k">Ordini</div><div class="v">'+(c.total_orders||0)+'</div><div class="k">Totale</div><div class="v">€ '+(Number(c.total_spent)||0).toFixed(2).replace('.',',')+'</div></div></div>'):'')+
    '<div class="ci-section"><h4>Azioni rapide</h4><button class="btn btn-soft btn-sm js-chat-discount" style="width:100%"><i class="ti ti-gift"></i> Invia sconto -10%</button></div>'
  );
}

function openConversation(id){
  activeChatId = id;
  if (!window.AdminAPI) return;
  $('#chatBody').html('<div class="empty" style="margin:auto">Caricamento…</div>');
  AdminAPI.chat.get(id).done(function(res){
    DATA.chatActive = res || null;
    renderActiveChat();
    if (DATA.chat && DATA.chat.conversations){
      var c = DATA.chat.conversations.find(function(x){ return x.id === id; });
      if (c) c.unread_admin = 0;
    }
    renderConvList($('.chat-tabs button.active').data('tab') || 'all');
    if (window.refreshNotifCounters) window.refreshNotifCounters();
  }).fail(function(){ toast('Errore caricamento conversazione','error'); });
}
window.openConversation = openConversation;

function sendChatMessage(text){
  if (!text || !text.trim() || !activeChatId || !window.AdminAPI) return;
  AdminAPI.chat.reply(activeChatId, { body: text.trim() }).done(function(){
    openConversation(activeChatId);
    AdminAPI.chat.list().done(function(res){ DATA.chat = res || { conversations: [] }; renderConvList($('.chat-tabs button.active').data('tab') || 'all'); });
  }).fail(function(x){ toast((x.responseJSON && x.responseJSON.error) || 'Errore invio','error'); });
}

VIEWS.chat = function(){
  var convs = (DATA.chat && DATA.chat.conversations) || [];
  var unread = convs.filter(function(c){ return c.unread_admin > 0; }).length;
  var open   = convs.filter(function(c){ return c.status === 'aperta'; }).length;
  var QR = ['Ciao! Come posso aiutarti?','Grazie per averci contattato.','Il tuo ordine è in preparazione.','Puoi indicarmi il numero ordine?'];
  return pageHead('Chat clienti','Conversazioni con i clienti dal negozio.','')+
    '<div class="chat-wrap">'+
      '<div class="chat-list">'+
        '<div class="chat-search"><input type="text" id="chatSearch" placeholder="Cerca conversazione..."/></div>'+
        '<div class="chat-tabs">'+
          '<button class="active" data-tab="all">Tutte ('+convs.length+')</button>'+
          '<button data-tab="unread">Non lette ('+unread+')</button>'+
          '<button data-tab="open">Aperte ('+open+')</button>'+
        '</div>'+
        '<div class="chat-conversations" id="chatConvList">'+(DATA.chat===undefined?'<div class="empty">Caricamento…</div>':'')+'</div>'+
      '</div>'+
      '<div class="chat-main">'+
        '<div class="chat-header" id="chatHeader"></div>'+
        '<div class="chat-body" id="chatBody"></div>'+
        '<div class="quick-replies" id="quickReplies">'+QR.map(function(r){ return '<span class="qr">'+r+'</span>'; }).join('')+'</div>'+
        '<form class="chat-input" id="chatForm"><input type="text" id="chatInput" placeholder="Scrivi una risposta..." autocomplete="off"/><button type="submit" class="send" title="Invia">➤</button></form>'+
      '</div>'+
      '<div class="chat-info" id="chatInfo"></div>'+
    '</div>';
};
