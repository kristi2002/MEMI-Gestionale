'use strict';
/*
 * Env passthrough guard.
 * ─────────────────────────────────────────────────────────────────────────────
 * Written after PAYPAL_WEBHOOK_ID shipped documented-but-dead: it was listed in
 * .env.example, read by src/routes/payments.js, and described in docs/07 as
 * "required for live PayPal" — but docker-compose.yml never forwarded it to the
 * backend container. Setting it in Coolify did nothing, so the PayPal webhook
 * signature check could not be switched on at all. A security control that is
 * documented but unreachable is worse than one that is absent, because everyone
 * believes it is on.
 *
 * Two directions, both failures:
 *   A. declared in .env.example  ->  must be interpolated by docker-compose.yml
 *      (otherwise operators set a value that never reaches the container)
 *   B. interpolated by docker-compose.yml  ->  must be mentioned in .env.example
 *      (otherwise a knob exists that nobody deploying knows about)
 *
 * Run: node verify/env-passthrough.cjs
 */
const fs = require('fs');

const EXAMPLE = '.env.example';
const COMPOSE = 'docker-compose.yml';

/* Vars intentionally exempt from direction A — e.g. tooling-only values that are
 * never meant to reach a container. Keep this empty unless there is a real reason;
 * an entry here is a promise that the var does not need to be in compose. */
const NOT_CONTAINER_VARS = new Set([]);

const example = fs.readFileSync(EXAMPLE, 'utf8');
const compose = fs.readFileSync(COMPOSE, 'utf8');

// Uncommented assignments: VAR=...
const declared = [];
// Any mention at all, including "# VAR=" doc lines
const mentioned = new Set();
for (const line of example.split(/\r?\n/)) {
  const active = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=/);
  if (active) { declared.push(active[1]); mentioned.add(active[1]); continue; }
  const doc = line.match(/^\s*#\s*([A-Z][A-Z0-9_]*)\s*=/);
  if (doc) mentioned.add(doc[1]);
}

// ${VAR} and ${VAR:-default}
const interpolated = new Set(
  [...compose.matchAll(/\$\{([A-Z][A-Z0-9_]*)(?::-[^}]*)?\}/g)].map((m) => m[1])
);

let fail = 0;

const notForwarded = declared.filter((v) => !interpolated.has(v) && !NOT_CONTAINER_VARS.has(v));
if (notForwarded.length) {
  fail = 1;
  console.log('  FAIL: declared in ' + EXAMPLE + ' but never forwarded by ' + COMPOSE + ':');
  notForwarded.forEach((v) => console.log('        ' + v + '  — add "' + v + ': ${' + v + ':-}" to the service env, or allow-list it'));
} else {
  console.log('  ok  all ' + declared.length + ' documented vars are forwarded by compose');
}

const undocumented = [...interpolated].filter((v) => !mentioned.has(v));
if (undocumented.length) {
  fail = 1;
  console.log('  FAIL: used by ' + COMPOSE + ' but undocumented in ' + EXAMPLE + ':');
  undocumented.forEach((v) => console.log('        ' + v + '  — add it (commented is fine) so operators know it exists'));
} else {
  console.log('  ok  all ' + interpolated.size + ' compose vars are documented');
}

process.exit(fail);
