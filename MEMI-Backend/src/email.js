'use strict';

/**
 * Email notifications  —  nodemailer
 *
 * Requires env vars:
 *   SMTP_HOST   (default: smtp.gmail.com)
 *   SMTP_PORT   (default: 587)
 *   SMTP_SECURE (default: false  — set to "true" for port 465)
 *   SMTP_USER   (your sending email address)
 *   SMTP_PASS   (app password / SMTP password)
 *   SMTP_FROM   (optional display sender — defaults to SMTP_USER)
 *
 * If SMTP_USER is not set, all send functions are no-ops (safe to call).
 */

const nodemailer = require('nodemailer');

let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;
  if (!process.env.SMTP_USER) return null;
  _transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST   || 'smtp.gmail.com',
    port:   parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return _transporter;
}

/**
 * Send order confirmation to customer.
 * @param {object} order
 * @param {string} order.order_number
 * @param {string} order.nome
 * @param {string} order.cognome
 * @param {string} order.email
 * @param {Array}  order.items  — [{product_name, taglia, qty, price}]
 * @param {number} order.total
 */
async function sendOrderConfirmation(order) {
  const t = getTransporter();
  if (!t) return; // SMTP not configured — skip silently

  const { order_number, nome, email, items = [], total } = order;
  const from = `"Memi Abbigliamento" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`;

  const itemRows = items.map(i =>
    `<tr>
      <td style="padding:6px 8px;border-bottom:1px solid #f0e8e0;">${i.product_name || ''}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f0e8e0;color:#888;">${i.taglia || 'unica'}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f0e8e0;text-align:center;">×${i.qty || 1}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f0e8e0;text-align:right;">€${parseFloat(i.price || 0).toFixed(2)}</td>
    </tr>`
  ).join('');

  const textItems = items.map(i =>
    `  - ${i.product_name} (${i.taglia || 'unica'}) × ${i.qty}  →  €${parseFloat(i.price || 0).toFixed(2)}`
  ).join('\n');

  const html = `
<!DOCTYPE html>
<html lang="it">
<head><meta charset="UTF-8"><title>Conferma ordine ${order_number}</title></head>
<body style="margin:0;padding:0;background:#faf7f4;font-family:'Helvetica Neue',Arial,sans-serif;color:#3B2B2B;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,.06);">
    <div style="background:#3B2B2B;padding:32px 40px;text-align:center;">
      <h1 style="color:#fff;font-size:28px;font-weight:300;letter-spacing:.12em;margin:0;">Memi<span style="color:#c9897a;">.</span></h1>
    </div>
    <div style="padding:36px 40px;">
      <p style="font-size:18px;font-weight:500;margin:0 0 8px;">Ciao ${nome},</p>
      <p style="color:#7a6060;margin:0 0 24px;">Grazie per il tuo ordine! Lo stiamo preparando con cura.</p>
      <div style="background:#faf7f4;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
        <p style="font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#a89090;margin:0 0 4px;">Numero ordine</p>
        <p style="font-size:22px;font-family:Georgia,serif;font-weight:400;margin:0;color:#3B2B2B;">${order_number}</p>
      </div>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:24px;">
        <thead>
          <tr style="background:#faf7f4;">
            <th style="padding:8px;font-size:11px;text-align:left;text-transform:uppercase;letter-spacing:.08em;color:#a89090;font-weight:500;">Articolo</th>
            <th style="padding:8px;font-size:11px;text-align:left;text-transform:uppercase;letter-spacing:.08em;color:#a89090;font-weight:500;">Taglia</th>
            <th style="padding:8px;font-size:11px;text-align:center;text-transform:uppercase;letter-spacing:.08em;color:#a89090;font-weight:500;">Qtà</th>
            <th style="padding:8px;font-size:11px;text-align:right;text-transform:uppercase;letter-spacing:.08em;color:#a89090;font-weight:500;">Prezzo</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
        <tfoot>
          <tr>
            <td colspan="3" style="padding:12px 8px;text-align:right;font-weight:600;font-size:15px;">Totale</td>
            <td style="padding:12px 8px;text-align:right;font-size:18px;font-family:Georgia,serif;">€${parseFloat(total || 0).toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>
      <p style="color:#7a6060;font-size:14px;line-height:1.6;">Riceverai un'email separata con il numero di tracciamento non appena il pacco viene preso in carico dal corriere.</p>
    </div>
    <div style="background:#faf7f4;padding:20px 40px;text-align:center;font-size:12px;color:#a89090;">
      © 2026 Memi Abbigliamento · Milano, Italia
    </div>
  </div>
</body>
</html>`;

  const text = `Ciao ${nome},\n\nGrazie per il tuo ordine ${order_number}!\n\nArticoli:\n${textItems}\n\nTotale: €${parseFloat(total || 0).toFixed(2)}\n\nLo spediremo al più presto.\n\nCordiali saluti,\nMemi Abbigliamento`;

  try {
    await t.sendMail({ from, to: email, subject: `Conferma ordine ${order_number} — Memi`, text, html });
    console.log(`[email] Sent order confirmation ${order_number} → ${email}`);
  } catch (err) {
    // Never fail the order because of email — just log
    console.error('[email] Failed to send confirmation:', err.message);
  }
}

/**
 * Send shipping notification to customer when order is marked "spedito".
 * @param {object} order
 * @param {string} order.order_number
 * @param {string} order.nome
 * @param {string} order.email
 * @param {string} order.courier_code   e.g. "SDA", "BRT", "DHL"
 * @param {string} order.tracking_number
 * @param {string} [order.eta]          estimated delivery date (optional)
 */
async function sendShippingConfirmation(order) {
  const t = getTransporter();
  if (!t) return;

  const { order_number, nome, email, courier_code, tracking_number, eta, tracking_url } = order;
  const from = `"Memi Abbigliamento" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`;

  const etaLine = eta
    ? `<p style="color:#7a6060;font-size:14px;margin:0 0 12px;"><strong>Consegna prevista:</strong> ${eta}</p>`
    : '';

  // Clickable courier deep-link (only when the courier has a tracking URL template configured)
  const trackButton = tracking_url
    ? `<div style="text-align:center;margin:8px 0 24px;"><a href="${tracking_url}" style="display:inline-block;background:#3B2B2B;color:#fff;text-decoration:none;font-size:14px;letter-spacing:.06em;padding:13px 30px;border-radius:8px;">Traccia il pacco →</a></div>`
    : '';

  const html = `
<!DOCTYPE html>
<html lang="it">
<head><meta charset="UTF-8"><title>Il tuo ordine è in viaggio!</title></head>
<body style="margin:0;padding:0;background:#faf7f4;font-family:'Helvetica Neue',Arial,sans-serif;color:#3B2B2B;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,.06);">
    <div style="background:#3B2B2B;padding:32px 40px;text-align:center;">
      <h1 style="color:#fff;font-size:28px;font-weight:300;letter-spacing:.12em;margin:0;">Memi<span style="color:#c9897a;">.</span></h1>
    </div>
    <div style="padding:36px 40px;">
      <p style="font-size:20px;font-weight:300;font-family:Georgia,serif;margin:0 0 8px;">Il tuo pacco è in viaggio!</p>
      <p style="color:#7a6060;margin:0 0 24px;">Ciao ${nome}, il tuo ordine <strong>${order_number}</strong> è stato affidato al corriere.</p>
      <div style="background:#ecf8f0;border-radius:8px;padding:20px 24px;margin-bottom:24px;">
        <p style="font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#2d7a4f;margin:0 0 6px;">Tracciamento spedizione</p>
        <p style="font-size:18px;font-family:'Courier New',monospace;font-weight:600;margin:0 0 4px;color:#3B2B2B;">${tracking_number}</p>
        <p style="font-size:12px;color:#888;margin:0;">Corriere: ${courier_code}</p>
      </div>
      ${etaLine}
      ${trackButton}
      <p style="color:#7a6060;font-size:14px;line-height:1.6;">${tracking_url ? 'Clicca il pulsante qui sopra per seguire il pacco in tempo reale.' : 'Usa il codice di tracciamento sul sito del corriere per seguire il pacco in tempo reale.'}</p>
    </div>
    <div style="background:#faf7f4;padding:20px 40px;text-align:center;font-size:12px;color:#a89090;">
      © 2026 Memi Abbigliamento · Milano, Italia
    </div>
  </div>
</body>
</html>`;

  const text = `Ciao ${nome},\n\nIl tuo ordine ${order_number} è stato spedito!\n\nTracking: ${tracking_number}\nCorriere: ${courier_code}${tracking_url ? '\nTraccia il pacco: ' + tracking_url : ''}${eta ? '\nConsegna prevista: ' + eta : ''}\n\nCordiali saluti,\nMemi Abbigliamento`;

  try {
    await t.sendMail({ from, to: email, subject: `Il tuo ordine ${order_number} è in viaggio — Memi`, text, html });
    console.log(`[email] Sent shipping confirmation ${order_number} → ${email}`);
  } catch (err) {
    console.error('[email] Failed to send shipping confirmation:', err.message);
  }
}

/**
 * Send welcome email after successful registration.
 * @param {object} user
 * @param {string} user.nome
 * @param {string} user.email
 */
async function sendWelcomeEmail(user) {
  const t = getTransporter();
  if (!t) return;

  const { nome, email } = user;
  const from = `"Memi Abbigliamento" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`;

  const html = `
<!DOCTYPE html>
<html lang="it">
<head><meta charset="UTF-8"><title>Benvenuta da Memi!</title></head>
<body style="margin:0;padding:0;background:#faf7f4;font-family:'Helvetica Neue',Arial,sans-serif;color:#3B2B2B;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,.06);">
    <div style="background:#3B2B2B;padding:32px 40px;text-align:center;">
      <h1 style="color:#fff;font-size:28px;font-weight:300;letter-spacing:.12em;margin:0;">Memi<span style="color:#c9897a;">.</span></h1>
    </div>
    <div style="padding:36px 40px;">
      <p style="font-size:22px;font-weight:300;font-family:Georgia,serif;margin:0 0 16px;">Benvenuta, ${nome}!</p>
      <p style="color:#7a6060;font-size:15px;line-height:1.7;margin:0 0 20px;">Siamo felici di averti nel mondo Memi. Qui troverai capi selezionati con cura, pensati per ogni momento della giornata.</p>
      <a href="${process.env.FRONTEND_URL || 'https://memiabbigliamento.it'}/shop" style="display:inline-block;padding:14px 32px;background:#3B2B2B;color:#fff;text-decoration:none;font-size:13px;letter-spacing:.1em;text-transform:uppercase;border-radius:4px;margin-bottom:24px;">Scopri la nuova collezione</a>
      <p style="color:#a89090;font-size:12px;line-height:1.6;">Il tuo account ti permette di tracciare gli ordini, salvare i preferiti e velocizzare il checkout.</p>
    </div>
    <div style="background:#faf7f4;padding:20px 40px;text-align:center;font-size:12px;color:#a89090;">
      © 2026 Memi Abbigliamento · Milano, Italia
    </div>
  </div>
</body>
</html>`;

  const text = `Benvenuta, ${nome}!\n\nGrazie per esserti registrata su Memi Abbigliamento.\nScopri la nostra collezione su ${process.env.FRONTEND_URL || 'https://memiabbigliamento.it'}/shop\n\nCordiali saluti,\nMemi Abbigliamento`;

  try {
    await t.sendMail({ from, to: email, subject: `Benvenuta da Memi, ${nome}!`, text, html });
    console.log(`[email] Sent welcome email → ${email}`);
  } catch (err) {
    console.error('[email] Failed to send welcome email:', err.message);
  }
}

/**
 * Send password reset link.
 * @param {object} user
 * @param {string} user.nome
 * @param {string} user.email
 * @param {string} resetToken   short-lived JWT to embed in URL
 */
async function sendPasswordReset(user, resetToken) {
  const t = getTransporter();
  if (!t) return;

  const { nome, email } = user;
  const from = `"Memi Abbigliamento" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`;
  const baseUrl  = (process.env.FRONTEND_URL || 'https://memiabbigliamento.it').replace(/\/+$/, '');
  const resetUrl  = `${baseUrl}/reset-password.html?token=${resetToken}`;

  const html = `
<!DOCTYPE html>
<html lang="it">
<head><meta charset="UTF-8"><title>Reimposta la password</title></head>
<body style="margin:0;padding:0;background:#faf7f4;font-family:'Helvetica Neue',Arial,sans-serif;color:#3B2B2B;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,.06);">
    <div style="background:#3B2B2B;padding:32px 40px;text-align:center;">
      <h1 style="color:#fff;font-size:28px;font-weight:300;letter-spacing:.12em;margin:0;">Memi<span style="color:#c9897a;">.</span></h1>
    </div>
    <div style="padding:36px 40px;">
      <p style="font-size:18px;font-weight:500;margin:0 0 8px;">Ciao ${nome},</p>
      <p style="color:#7a6060;font-size:15px;line-height:1.7;margin:0 0 24px;">Hai richiesto di reimpostare la tua password. Clicca il pulsante qui sotto — il link è valido per <strong>1 ora</strong>.</p>
      <a href="${resetUrl}" style="display:inline-block;padding:14px 32px;background:#3B2B2B;color:#fff;text-decoration:none;font-size:13px;letter-spacing:.1em;text-transform:uppercase;border-radius:4px;margin-bottom:24px;">Reimposta password</a>
      <p style="color:#a89090;font-size:12px;line-height:1.6;">Se non hai richiesto questo, ignora questa email. La tua password rimane invariata.</p>
    </div>
    <div style="background:#faf7f4;padding:20px 40px;text-align:center;font-size:12px;color:#a89090;">
      © 2026 Memi Abbigliamento · Milano, Italia
    </div>
  </div>
</body>
</html>`;

  const text = `Ciao ${nome},\n\nHai richiesto di reimpostare la password per il tuo account Memi.\n\nClicca questo link (valido 1 ora):\n${resetUrl}\n\nSe non hai fatto questa richiesta, ignora questa email.\n\nCordiali saluti,\nMemi Abbigliamento`;

  try {
    await t.sendMail({ from, to: email, subject: 'Reimposta la tua password — Memi', text, html });
    console.log(`[email] Sent password reset → ${email}`);
  } catch (err) {
    console.error('[email] Failed to send password reset:', err.message);
  }
}

/**
 * Send a gift card to its recipient when an admin issues one with a `recipient_email`.
 * @param {object} card
 * @param {string} card.code
 * @param {number} card.initial_amount
 * @param {string} card.recipient_email
 * @param {string} [card.note]
 */
async function sendGiftCardDelivery(card) {
  const t = getTransporter();
  if (!t) return;

  const { code, initial_amount, recipient_email, note } = card;
  const from = `"Memi Abbigliamento" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`;
  const amount = parseFloat(initial_amount || 0).toFixed(2);
  const noteBlock = note
    ? `<p style="color:#7a6060;font-size:14px;font-style:italic;margin:0 0 20px;">"${note}"</p>`
    : '';
  const noteText = note ? `\n"${note}"\n` : '';

  const html = `
<!DOCTYPE html>
<html lang="it">
<head><meta charset="UTF-8"><title>Hai ricevuto una gift card Memi!</title></head>
<body style="margin:0;padding:0;background:#faf7f4;font-family:'Helvetica Neue',Arial,sans-serif;color:#3B2B2B;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,.06);">
    <div style="background:#3B2B2B;padding:32px 40px;text-align:center;">
      <h1 style="color:#fff;font-size:28px;font-weight:300;letter-spacing:.12em;margin:0;">Memi<span style="color:#c9897a;">.</span></h1>
    </div>
    <div style="padding:36px 40px;">
      <p style="font-size:20px;font-weight:300;font-family:Georgia,serif;margin:0 0 8px;">Hai ricevuto una gift card!</p>
      <p style="color:#7a6060;margin:0 0 24px;">Qualcuno ha pensato a te — ecco il tuo codice regalo Memi.</p>
      ${noteBlock}
      <div style="background:#ecf8f0;border-radius:8px;padding:20px 24px;margin-bottom:24px;text-align:center;">
        <p style="font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#2d7a4f;margin:0 0 6px;">Codice gift card</p>
        <p style="font-size:20px;font-family:'Courier New',monospace;font-weight:600;margin:0 0 8px;color:#3B2B2B;">${code}</p>
        <p style="font-size:24px;font-family:Georgia,serif;margin:0;color:#3B2B2B;">€ ${amount}</p>
      </div>
      <p style="color:#7a6060;font-size:14px;line-height:1.6;">Inseriscilo nel campo "Gift card" al checkout su memiabbigliamento.it per usarlo sul tuo prossimo ordine.</p>
    </div>
    <div style="background:#faf7f4;padding:20px 40px;text-align:center;font-size:12px;color:#a89090;">
      © 2026 Memi Abbigliamento · Milano, Italia
    </div>
  </div>
</body>
</html>`;

  const text = `Hai ricevuto una gift card Memi!\n${noteText}\nCodice: ${code}\nValore: €${amount}\n\nUsalo nel campo "Gift card" al checkout su memiabbigliamento.it.\n\nCordiali saluti,\nMemi Abbigliamento`;

  try {
    await t.sendMail({ from, to: recipient_email, subject: 'Hai ricevuto una gift card Memi! 🎁', text, html });
    console.log(`[email] Sent gift card delivery ${code} → ${recipient_email}`);
  } catch (err) {
    console.error('[email] Failed to send gift card delivery:', err.message);
  }
}

/* ── Refund confirmation ─────────────────────────────────────── */
async function sendRefundNotification(data) {
  const t = getTransporter();
  if (!t) return;

  const { order_number, nome, email, amount } = data;
  if (!email) return;
  const from = `"Memi Abbigliamento" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`;
  const amountStr = (Number(amount) || 0).toFixed(2).replace('.', ',');

  const html = `
<!DOCTYPE html>
<html lang="it">
<head><meta charset="UTF-8"><title>Rimborso effettuato</title></head>
<body style="margin:0;padding:0;background:#faf7f4;font-family:'Helvetica Neue',Arial,sans-serif;color:#3B2B2B;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,.06);">
    <div style="background:#3B2B2B;padding:32px 40px;text-align:center;">
      <h1 style="color:#fff;font-size:28px;font-weight:300;letter-spacing:.12em;margin:0;">Memi<span style="color:#c9897a;">.</span></h1>
    </div>
    <div style="padding:36px 40px;">
      <h2 style="font-size:20px;font-weight:400;margin:0 0 8px;">Rimborso effettuato ✓</h2>
      <p style="color:#7a6060;font-size:14px;line-height:1.6;margin:0 0 20px;">
        Ciao ${nome || ''}, il rimborso per l'ordine <strong>${order_number}</strong> è stato elaborato.
      </p>
      <div style="background:#faf7f4;border-radius:8px;padding:18px 22px;margin:0 0 20px;">
        <p style="margin:0;font-size:15px;"><strong>Importo rimborsato:</strong> € ${amountStr}</p>
      </div>
      <p style="color:#7a6060;font-size:13px;line-height:1.6;margin:0;">
        A seconda del metodo di pagamento, l'accredito può richiedere 5–10 giorni lavorativi.
        Per qualsiasi domanda rispondi a questa email.
      </p>
    </div>
    <div style="background:#faf7f4;padding:20px 40px;text-align:center;">
      <p style="color:#b5a0a0;font-size:12px;margin:0;">Memi Abbigliamento · Grazie per aver scelto Memi</p>
    </div>
  </div>
</body>
</html>`;

  try {
    await t.sendMail({ from, to: email, subject: `Rimborso ordine ${order_number} — Memi`, html });
    console.log(`[email] refund notification sent to ${email} for ${order_number}`);
  } catch (err) {
    console.error('[email] refund notification failed:', err.message);
  }
}

/**
 * Generic email sender for automations. No-ops silently when SMTP is not
 * configured (same guard as the typed senders), and never throws to the caller
 * beyond the awaited promise.
 */
async function sendGenericEmail(opts) {
  const t = getTransporter();
  if (!t) return;                       // SMTP not configured — skip silently
  const { to, subject, html, text } = opts || {};
  if (!to) return;
  const from = `"Memi Abbigliamento" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`;
  await t.sendMail({ from, to, subject: subject || 'Notifica Memi', html: html || undefined, text: text || undefined });
}

module.exports = { sendOrderConfirmation, sendShippingConfirmation, sendWelcomeEmail, sendPasswordReset, sendGiftCardDelivery, sendRefundNotification, sendGenericEmail };
