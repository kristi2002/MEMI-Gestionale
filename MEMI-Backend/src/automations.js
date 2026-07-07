'use strict';

/**
 * automations.js — simple, safe rules engine.
 *
 * A rule = { trigger_event, azione, oggetto, messaggio, attivo }. When an order
 * transitions, runOrderStatusAutomations() finds active rules for the matching
 * trigger and runs their action (send an email to the customer or the store
 * admin). Everything is best-effort and wrapped: a failing rule NEVER affects
 * the order flow that called it.
 *
 * Supported triggers: ordine_pagato, ordine_spedito, ordine_consegnato, ordine_annullato
 * Supported actions:   email_cliente, email_admin
 * Template vars in oggetto/messaggio: {order_number}, {nome}
 */

const { sendGenericEmail } = require('./email');

const TRIGGER_FROM_STATUS = {
  order_status:   { spedito: 'ordine_spedito', consegnato: 'ordine_consegnato', annullato: 'ordine_annullato' },
  payment_status: { pagato: 'ordine_pagato' },
};

const TRIGGERS = ['ordine_pagato', 'ordine_spedito', 'ordine_consegnato', 'ordine_annullato'];
const ACTIONS  = ['email_cliente', 'email_admin'];

function fill(tpl, ctx) {
  return String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (ctx[k] != null ? ctx[k] : m));
}

/** Run all active rules for one trigger against a context. Best-effort. */
async function runTrigger(pool, triggerEvent, ctx) {
  try {
    const [rules] = await pool.execute(
      'SELECT * FROM automations WHERE attivo = 1 AND trigger_event = ?', [triggerEvent]);
    for (const r of rules) {
      try {
        const subject = fill(r.oggetto || 'Aggiornamento ordine {order_number}', ctx);
        const bodyTxt = fill(r.messaggio || '', ctx);
        const html    = '<p>' + bodyTxt.replace(/\n/g, '<br>') + '</p>';
        if (r.azione === 'email_cliente' && ctx.email) {
          await sendGenericEmail({ to: ctx.email, subject, html, text: bodyTxt });
        } else if (r.azione === 'email_admin' && ctx.admin_email) {
          await sendGenericEmail({ to: ctx.admin_email, subject, html, text: bodyTxt });
        }
        await pool.execute('UPDATE automations SET run_count = run_count + 1, last_run = NOW() WHERE id = ?', [r.id]);
      } catch (_) { /* one bad rule must not stop the others */ }
    }
  } catch (_) { /* table missing / db hiccup — ignore */ }
}

/** Hook for the order routes. Never throws. */
async function runOrderStatusAutomations(pool, orderId, changes) {
  try {
    const events = [];
    if (changes.order_status   && TRIGGER_FROM_STATUS.order_status[changes.order_status])
      events.push(TRIGGER_FROM_STATUS.order_status[changes.order_status]);
    if (changes.payment_status && TRIGGER_FROM_STATUS.payment_status[changes.payment_status])
      events.push(TRIGGER_FROM_STATUS.payment_status[changes.payment_status]);
    if (!events.length) return;

    const [[o]] = await pool.execute(
      'SELECT order_number, customer_nome AS nome, customer_email AS email FROM orders WHERE id = ?', [orderId]);
    if (!o) return;

    let adminEmail = null;
    try {
      const [[a]] = await pool.execute("SELECT `value` FROM store_settings WHERE `key` = 'order_notification_email' LIMIT 1");
      adminEmail = a && a.value;
    } catch (_) {}

    const ctx = { order_number: o.order_number, nome: o.nome || '', email: o.email, admin_email: adminEmail };
    for (const ev of events) await runTrigger(pool, ev, ctx);
  } catch (_) {}
}

module.exports = { runTrigger, runOrderStatusAutomations, TRIGGERS, ACTIONS, TRIGGER_FROM_STATUS, fill };
