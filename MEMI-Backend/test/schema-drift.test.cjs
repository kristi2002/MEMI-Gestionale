'use strict';
/* Schema-drift guard.
   schema.sql is the CORE SEED; db/migrations.js ensureSchema() is canonical for the
   EXTENDED tables (self-healed on boot). That split is fine — but a BRAND-NEW table
   sneaking into migrations.js with no acknowledgement anywhere is how drift starts.
   This test fails when a migrations.js CREATE TABLE is neither in schema.sql nor in
   the acknowledged EXTENDED allow-list below. Fix a failure by either adding the
   table to schema.sql or adding its name here (a deliberate, reviewable act).
   Run: node test/schema-drift.test.cjs                                              */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const dbDir = path.join(__dirname, '..', 'src', 'db');
const read = (f) => fs.readFileSync(path.join(dbDir, f), 'utf8');

/** Extract table names from every `CREATE TABLE IF NOT EXISTS [`]name[`]`.
    `IF NOT EXISTS` is required so prose in comments ("CREATE TABLE statements…")
    is never mistaken for a real definition (both files use it for every table). */
function tables(sql) {
  const set = new Set();
  const re = /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+`?([a-z_][a-z0-9_]*)`?/gi;
  let m;
  while ((m = re.exec(sql))) set.add(m[1].toLowerCase());
  return set;
}

const schema = tables(read('schema.sql'));
const migrations = tables(read('migrations.js'));

// Extended tables intentionally defined ONLY in migrations.js (self-healed on boot).
// Adding a new table to migrations.js requires adding it here (or to schema.sql).
const EXTENDED = new Set([
  'audit_log', 'automations', 'blog_posts', 'campaigns', 'carts', 'cms_pages',
  'conversations', 'customer_segments', 'email_events', 'gift_cards',
  'loyalty_transactions', 'messages', 'page_views', 'pickup_points', 'po_items',
  'popups', 'product_categories', 'product_collections', 'product_colors',
  'product_variants', 'purchase_orders', 'shipment_events', 'stock_transfers',
  'store_expenses', 'suppliers', 'supplier_invoices',
]);

let pass = 0;
const ok = (m) => { pass++; console.log('  ✓ ' + m); };

// 1. Every migrations.js table is acknowledged (in schema.sql OR in EXTENDED).
const unacknowledged = [...migrations].filter((t) => !schema.has(t) && !EXTENDED.has(t));
assert.deepStrictEqual(
  unacknowledged, [],
  `New table(s) in migrations.js not acknowledged: ${unacknowledged.join(', ')}. ` +
  `Add them to schema.sql, or to the EXTENDED allow-list in test/schema-drift.test.cjs.`,
);
ok(`all ${migrations.size} migrations.js tables acknowledged (schema.sql or allow-list)`);

// 2. The allow-list has no stale entries (every EXTENDED name still exists in migrations.js).
const stale = [...EXTENDED].filter((t) => !migrations.has(t));
assert.deepStrictEqual(stale, [], `Stale EXTENDED allow-list entries (no longer in migrations.js): ${stale.join(', ')}`);
ok('EXTENDED allow-list has no stale entries');

// 3. Sanity: a couple of core tables really are in schema.sql.
for (const core of ['orders', 'products', 'discount_codes', 'invoices']) {
  assert.ok(schema.has(core), `core table ${core} missing from schema.sql`);
}
ok('core tables present in schema.sql');

console.log(`\nALL ${pass} schema-drift checks passed.`);
