'use strict';
/**
 * stock-alerts.test.cjs — low-stock alerting (src/stock-alerts.js).
 *
 * The alert must be useful without becoming noise, so the behaviour that matters is
 * mostly about what it does NOT send:
 *   1. a size at or below the threshold alerts once, with the real remaining count
 *   2. a size above the threshold never alerts
 *   3. the same size does not re-alert within the same day (email_events dedup)
 *   4. two lines hitting the same product+size produce one alert, not two
 *   5. no recipient configured → nothing is sent (and nothing throws)
 *   6. a failing transport never propagates into the caller (order flow is sacred)
 * The DB and the sender are both fakes; no SMTP, no MySQL.
 */
const assert = require('assert');
const { checkLowStock } = require('../src/stock-alerts.js');

let pass = 0;
const ok = (label) => { console.log('  ✓ ' + label); pass++; };

/**
 * Fake pool: `stock` maps 'productId taglia' → { stock, name }; `claimed` emulates the
 * UNIQUE (type, dedup_key, email) constraint on email_events.
 */
function fakePool({ stock = {}, settings = {} }) {
  const claimed = new Set();
  return {
    claimed,
    async query() {
      return [Object.entries(settings).map(([k, v]) => ({ setting_key: k, setting_value: v }))];
    },
    async execute(sql, params) {
      if (/INSERT INTO email_events/i.test(sql)) {
        const key = params[1] + '|' + params[2] + '|' + params[0];
        if (claimed.has(key)) {
          const e = new Error('dup'); e.code = 'ER_DUP_ENTRY'; throw e;
        }
        claimed.add(key);
        return [{ affectedRows: 1 }];
      }
      const row = stock[params[0] + ' ' + params[1]];
      return [row ? [row] : []];
    },
  };
}

function recorder(impl) {
  const sent = [];
  const send = async (mail) => { sent.push(mail); if (impl) return impl(mail); };
  return { sent, send };
}

const SETTINGS = { low_stock_threshold: '3', low_stock_alert_email: 'magazzino@memi.it' };

(async () => {
  /* 1. At threshold → alerts, with the real count. */
  {
    const pool = fakePool({ settings: SETTINGS, stock: { 'p1 M': { stock: 2, name: 'Gonna Bloom' } } });
    const { sent, send } = recorder();
    const r = await checkLowStock(pool, [{ product_id: 'p1', taglia: 'M' }], { send });

    assert.strictEqual(r.alerted, 1, 'one alert');
    assert.strictEqual(sent.length, 1);
    assert.strictEqual(sent[0].to, 'magazzino@memi.it');
    assert.ok(/Gonna Bloom/.test(sent[0].text), 'names the product');
    assert.ok(/2 rimasti/.test(sent[0].text), 'states the remaining count');
    ok('size at threshold alerts once, with product name and count');
  }

  /* 2. Above threshold → silence. */
  {
    const pool = fakePool({ settings: SETTINGS, stock: { 'p1 M': { stock: 9, name: 'Gonna Bloom' } } });
    const { sent, send } = recorder();
    const r = await checkLowStock(pool, [{ product_id: 'p1', taglia: 'M' }], { send });

    assert.strictEqual(r.alerted, 0);
    assert.strictEqual(sent.length, 0, 'healthy stock must not email');
    ok('size above threshold stays silent');
  }

  /* 3. Same size, same day → claimed once. */
  {
    const pool = fakePool({ settings: SETTINGS, stock: { 'p1 M': { stock: 1, name: 'Gonna Bloom' } } });
    const a = recorder();
    await checkLowStock(pool, [{ product_id: 'p1', taglia: 'M' }], { send: a.send });
    const b = recorder();
    const r2 = await checkLowStock(pool, [{ product_id: 'p1', taglia: 'M' }], { send: b.send });

    assert.strictEqual(a.sent.length, 1, 'first order alerts');
    assert.strictEqual(b.sent.length, 0, 'second order in the same day does not');
    assert.strictEqual(r2.skipped, 1);
    ok('no re-alert for the same size within the day');
  }

  /* 4. Duplicate lines in one order → one alert. */
  {
    const pool = fakePool({ settings: SETTINGS, stock: { 'p1 M': { stock: 1, name: 'Gonna Bloom' } } });
    const { sent, send } = recorder();
    const r = await checkLowStock(
      pool,
      [{ product_id: 'p1', taglia: 'M' }, { product_id: 'p1', taglia: 'M' }],
      { send },
    );

    assert.strictEqual(r.checked, 1, 'the pair is de-duplicated before the DB lookup');
    assert.strictEqual(sent.length, 1);
    ok('two lines of the same product+size produce one alert');
  }

  /* 5. Nobody to tell → no send, no throw. */
  {
    const pool = fakePool({ settings: {}, stock: { 'p1 M': { stock: 0, name: 'Gonna Bloom' } } });
    const prev = process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_EMAIL;
    const { sent, send } = recorder();
    const r = await checkLowStock(pool, [{ product_id: 'p1', taglia: 'M' }], { send });
    if (prev !== undefined) process.env.ADMIN_EMAIL = prev;

    assert.strictEqual(sent.length, 0);
    assert.strictEqual(r.alerted, 0);
    ok('no recipient configured → silent, no throw');
  }

  /* 6. Transport failure is contained. */
  {
    const pool = fakePool({ settings: SETTINGS, stock: { 'p1 M': { stock: 0, name: 'Gonna Bloom' } } });
    const { send } = recorder(() => { throw new Error('SMTP down'); });
    const r = await checkLowStock(pool, [{ product_id: 'p1', taglia: 'M' }], { send });

    assert.strictEqual(r.alerted, 0, 'not counted as delivered');
    ok('a failing transport never propagates to the order flow');
  }

  /* 7. Lines with no tracked size are ignored rather than mis-queried. */
  {
    const pool = fakePool({ settings: SETTINGS, stock: {} });
    const { sent, send } = recorder();
    const r = await checkLowStock(pool, [{ product_id: 'p1', taglia: null }], { send });

    assert.strictEqual(r.checked, 0);
    assert.strictEqual(sent.length, 0);
    ok('untracked (size-less legacy) lines are skipped');
  }

  console.log(`\nALL ${pass} low-stock alert checks passed.`);
})().catch((e) => {
  console.error('\nFAIL:', e && e.message);
  process.exit(1);
});
