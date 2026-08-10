'use strict';

/**
 * error-reporter.js — dependency-free crash & error reporting.
 *
 * Before this, an unhandled 500 in production existed only as one line in the
 * container's stdout. Nobody was watching stdout, so the first signal that
 * checkout had broken was a customer complaining.
 *
 * This adds three things, all optional and all no-ops when unconfigured:
 *
 *   1. Structured, deduplicated capture of every unhandled error (pino).
 *   2. An outbound webhook (ERROR_WEBHOOK_URL) — Slack and Discord incoming
 *      webhooks both accept the `{ text }` shape used here, and any generic
 *      JSON endpoint gets the full payload alongside it.
 *   3. process-level handlers for uncaughtException / unhandledRejection, so a
 *      crash is reported before the process dies rather than vanishing.
 *
 * Deliberately not Sentry: adding an SDK means a dependency, an account and a
 * DSN before anything is observable. This works with a Slack webhook in one
 * env var, and does not preclude adding Sentry later.
 */

const { logger } = require('./logger');

const WEBHOOK   = process.env.ERROR_WEBHOOK_URL || '';
const ENVNAME   = process.env.NODE_ENV || 'development';
const SITE      = process.env.FRONTEND_URL || 'memi';

/* ── Throttling ───────────────────────────────────────────────────────────────
 * A failing dependency produces the same error hundreds of times a minute. Without
 * a cap the webhook itself becomes the outage. Each distinct error signature is
 * reported at most once per window; repeats are counted and folded into the next
 * report for that signature. */
const WINDOW_MS = 5 * 60 * 1000;
const MAX_TRACKED = 200;
const seen = new Map();   // signature -> { at, suppressed }

function signatureOf(err, context) {
  const name = (err && err.name) || 'Error';
  const msg  = ((err && err.message) || String(err)).slice(0, 200);
  // First stack frame is usually enough to separate two different call sites
  // that throw the same message.
  const frame = ((err && err.stack) || '').split('\n')[1]?.trim() || '';
  return `${context || ''}|${name}|${msg}|${frame}`;
}

/** @returns {{report: boolean, suppressed: number}} */
function throttle(signature) {
  const now = Date.now();
  const entry = seen.get(signature);
  if (entry && now - entry.at < WINDOW_MS) {
    entry.suppressed += 1;
    return { report: false, suppressed: entry.suppressed };
  }
  const suppressed = entry ? entry.suppressed : 0;
  // Bound the map so a high-cardinality error (unique ids in messages) can't leak.
  if (seen.size >= MAX_TRACKED) {
    const oldest = [...seen.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) seen.delete(oldest[0]);
  }
  seen.set(signature, { at: now, suppressed: 0 });
  return { report: true, suppressed };
}

async function postWebhook(payload) {
  if (!WEBHOOK) return;
  try {
    // Node 18+ global fetch — no dependency. 5s cap so a slow webhook never
    // holds a request handler open.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    await fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
  } catch (_) {
    // Reporting must never throw into the caller — that would turn an error into a crash.
  }
}

/**
 * Report an error. Safe to call from anywhere; never throws, never rejects.
 * @param {Error|unknown} err
 * @param {{context?: string, reqId?: string, method?: string, path?: string, status?: number}} [meta]
 */
function reportError(err, meta = {}) {
  const e = err instanceof Error ? err : new Error(String(err));
  const { report, suppressed } = throttle(signatureOf(e, meta.context));

  const log = logger.child({ reqId: meta.reqId });
  log.error({ err: e, ...meta, suppressed: suppressed || undefined }, meta.context || 'unhandled error');

  if (!report) return;

  const where = [meta.method, meta.path].filter(Boolean).join(' ') || meta.context || 'app';
  const lines = [
    `🔴 *${ENVNAME}* — ${e.name}: ${e.message}`,
    `at \`${where}\`${meta.status ? ` (HTTP ${meta.status})` : ''}`,
    meta.reqId ? `request \`${meta.reqId}\`` : '',
    suppressed ? `_(+${suppressed} occorrenze simili soppresse nei 5 min precedenti)_` : '',
    '```' + String(e.stack || '').split('\n').slice(0, 6).join('\n') + '```',
  ].filter(Boolean);

  postWebhook({
    text: lines.join('\n'),            // Slack / Discord shape
    content: lines.join('\n'),         // Discord accepts `content`
    site: SITE,
    env: ENVNAME,
    error: { name: e.name, message: e.message, stack: e.stack },
    ...meta,
    suppressed,
    ts: new Date().toISOString(),
  });
}

/**
 * Express error-handling middleware. Must be registered LAST, after every route.
 * Keeps the existing behaviour (opaque 500 to the client) and adds the reporting
 * plus the request id, so a customer-reported failure can be found in the logs.
 */
function errorHandler(err, req, res, _next) {
  reportError(err, {
    context: 'express',
    reqId: req.id,
    method: req.method,
    path: req.originalUrl || req.path,
    status: 500,
  });
  if (res.headersSent) return;
  res.status(500).json({ error: 'Errore interno del server', request_id: req.id });
}

/**
 * Catch what Express can't: a throw inside a timer/stream, or a rejected promise
 * nobody awaited. An uncaughtException leaves the process in an undefined state,
 * so it is reported and then re-thrown to the default handler (the container
 * restart policy is what actually recovers the service).
 */
function installProcessHandlers() {
  process.on('unhandledRejection', (reason) => {
    reportError(reason, { context: 'unhandledRejection' });
  });
  process.on('uncaughtException', (err) => {
    reportError(err, { context: 'uncaughtException' });
    // Give the webhook a moment to flush, then exit so the orchestrator restarts us.
    setTimeout(() => process.exit(1), 1000).unref();
  });
}

/** True when outbound reporting is configured — used for the boot-time banner. */
const isConfigured = () => Boolean(WEBHOOK);

module.exports = { reportError, errorHandler, installProcessHandlers, isConfigured };
