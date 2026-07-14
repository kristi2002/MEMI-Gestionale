'use strict';

/**
 * scheduler.js — in-process daily runner for lifecycle emails.
 * ────────────────────────────────────────────────────────────
 * No external cron dependency: a lightweight hourly tick fires the daily
 * lifecycle batch once per calendar day, at/after LIFECYCLE_SEND_HOUR (local).
 *
 * Safety:
 *   • In-memory `lastRunDate` guard → at most one batch per day per process.
 *   • The batch itself is idempotent (email_events claim-before-send), so even
 *     if two app instances tick on the same day, no customer is double-emailed.
 *   • Skipped entirely when SMTP is unconfigured (nothing would be delivered) or
 *     when DISABLE_EMAIL_SCHEDULER=1 — so local dev and tests stay quiet.
 *
 * This deliberately does NOT try to be a distributed job queue. For a single
 * container (the current deploy) it's correct and self-healing; the idempotency
 * ledger is what makes it safe under restarts and brief multi-instance overlap.
 */

const { runDailyLifecycle } = require('./lifecycle');

const TICK_MS = 60 * 60 * 1000;   // check hourly

function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startScheduler(pool) {
  if (process.env.DISABLE_EMAIL_SCHEDULER === '1') {
    console.log('[lifecycle] scheduler disabled (DISABLE_EMAIL_SCHEDULER=1)');
    return null;
  }
  if (!process.env.SMTP_USER) {
    console.log('[lifecycle] scheduler idle — SMTP not configured (no emails would be sent)');
    return null;
  }
  const sendHour = Math.max(0, Math.min(23, parseInt(process.env.LIFECYCLE_SEND_HOUR || '9', 10) || 9));
  let lastRunDate = null;
  let running = false;

  async function tick() {
    if (running) return;
    const now = new Date();
    const dateStr = localDateStr(now);
    if (dateStr === lastRunDate) return;           // already ran today
    if (now.getHours() < sendHour) return;         // wait until the send hour
    running = true;
    lastRunDate = dateStr;                          // set before await so a slow run can't double-fire
    try {
      const summary = await runDailyLifecycle(pool, { today: now });
      const counts = Object.entries(summary)
        .filter(([, v]) => v && typeof v === 'object' && 'sent' in v)
        .map(([k, v]) => `${k}=${v.sent}`)
        .join(' ');
      console.log(`[lifecycle] daily batch complete (${dateStr}) — ${counts || 'nothing to send'}`);
    } catch (e) {
      console.error('[lifecycle] daily batch error:', e.message);
      lastRunDate = null;                           // allow a retry on the next tick
    } finally {
      running = false;
    }
  }

  const timer = setInterval(() => { tick().catch(() => {}); }, TICK_MS);
  timer.unref();                                    // never keep the process alive just for this
  // Run one tick shortly after boot so a container that starts after the send hour still runs today.
  const kickoff = setTimeout(() => { tick().catch(() => {}); }, 30 * 1000);
  kickoff.unref();
  console.log(`[lifecycle] scheduler armed — daily batch at/after ${sendHour}:00 local`);
  return { tick, stop() { clearInterval(timer); clearTimeout(kickoff); } };
}

module.exports = { startScheduler };
