'use strict';

/**
 * Structured logging (pino) — replaces console.log/console.error at the highest-value
 * call sites (payments, orders, refunds) with JSON logs carrying a per-request id, so
 * multiple concurrent requests can be told apart in production logs. Not a mechanical
 * rewrite of every console.log in the codebase — see docs/PRODUCTION-ROADMAP.md Phase 5.
 */

const pino = require('pino');
const crypto = require('crypto');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  // Pretty-print in local dev only; plain JSON lines in production (what log
  // aggregators / `docker compose logs` actually want to parse).
  transport: process.env.NODE_ENV === 'production'
    ? undefined
    : { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } },
});

/**
 * Express middleware: assigns req.id (from an inbound X-Request-Id header if present,
 * so it survives a reverse-proxy hop, or a fresh UUID otherwise), attaches req.log (a
 * child logger with that id baked in), and logs one line per request on completion.
 */
function requestLogger(req, res, next) {
  req.id = req.headers['x-request-id'] || crypto.randomUUID();
  req.log = logger.child({ reqId: req.id });
  res.setHeader('X-Request-Id', req.id);

  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    req.log.info({
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Math.round(durationMs * 10) / 10,
    }, 'request');
  });
  next();
}

module.exports = { logger, requestLogger };
