'use strict';
/* Frontend<->backend route-contract guard. Ensures the storefront/admin API clients
   call paths that actually exist in the backend (catches the class of bug where
   account history, reviews and returns silently 404'd). Pure string checks — no runtime. */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
let fail = 0;
function ok(cond, msg){ console.log((cond?'  ✓ ':'  ✗ ')+msg); if(!cond) fail++; }

const apiClient = read('Memi Abbigliamento/api-client.js');
const adminApi  = read('MEMI/js/admin-api.js');
const orders    = read('MEMI-Backend/src/routes/orders.js');
const reviews   = read('MEMI-Backend/src/routes/reviews.js');
const resiPub   = read('MEMI-Backend/src/routes/resi-public.js');

console.log('Storefront api-client -> backend contract:');
ok(apiClient.includes("get('/orders/my')"),            "myOrders() calls /orders/my");
ok(orders.includes("router.get('/my'"),                 "backend defines GET /orders/my");
ok(apiClient.includes("get('/reviews/product/'"),       "reviews.forProduct() calls /reviews/product/:id");
ok(reviews.includes("'/product/:product_id'"),          "backend defines GET /reviews/product/:product_id");
ok(apiClient.includes("post('/resi/request'"),          "resi.request() calls /resi/request");
ok(resiPub.includes("router.post('/request'"),          "backend defines POST /resi/request");

console.log('Regression guards (old broken paths must be gone):');
ok(!apiClient.includes("get('/orders')"),               "no bare GET /orders");
ok(!apiClient.includes("/reviews?product_id="),         "no /reviews?product_id= query form");
ok(!/post\('\/resi',/.test(apiClient),                  "no bare POST /resi");

console.log('Admin api-client -> backend contract:');
ok(adminApi.includes("/orders/admin/list"),             "admin orders.list() -> /orders/admin/list");
ok(orders.includes("router.get('/admin/list'"),         "backend defines GET /orders/admin/list");

console.log('Order-lifecycle correctness invariants:');
ok(orders.includes("paymentStatus = 'pagato'"),         "verified Stripe payment sets payment_status=pagato");
ok(orders.includes("Number(pi.amount) !== expected"),   "Stripe amount is verified against the order total");
ok(orders.includes('FROM products WHERE id = ?'),       "line prices are re-resolved from the catalog");

if (fail) { console.error(`\n${fail} contract check(s) FAILED`); process.exit(1); }
console.log('\nAll contract checks passed.');
