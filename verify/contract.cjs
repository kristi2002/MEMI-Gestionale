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

ok(adminApi.includes("/send-tracking"),                 "admin orders.sendTracking() -> /orders/admin/:id/send-tracking");
ok(orders.includes("router.post('/admin/:id/send-tracking'"), "backend defines POST /orders/admin/:id/send-tracking");

const cms      = read('MEMI-Backend/src/routes/cms.js');
const blogHtml = read('Memi Abbigliamento/blog.html');
const artHtml  = read('Memi Abbigliamento/articolo.html');
const pagHtml  = read('Memi Abbigliamento/pagina.html');
console.log('Storefront CMS/blog contract:');
ok(blogHtml.includes("/api/cms/published/blog"),        "blog.html fetches /api/cms/published/blog");
ok(cms.includes("router.get('/published/blog'"),         "backend defines GET /cms/published/blog");
ok(artHtml.includes("/api/cms/published/blog/"),         "articolo.html fetches /api/cms/published/blog/:slug");
ok(cms.includes("router.get('/published/blog/:slug'"),   "backend defines GET /cms/published/blog/:slug");
ok(pagHtml.includes("/api/cms/published/pages/"),        "pagina.html fetches /api/cms/published/pages/:slug");
ok(cms.includes("router.get('/published/pages/:slug'"),  "backend defines GET /cms/published/pages/:slug");
ok(/<\/html>\s*$/.test(blogHtml) && /<\/html>\s*$/.test(artHtml), "blog + articolo are complete files (anti-truncation)");

const dashboard = read('MEMI-Backend/src/routes/dashboard.js');
console.log('Dashboard catalog-KPI contract:');
ok(adminApi.includes("/admin/dashboard/catalog-kpis"),        "admin dashboard.catalogKpis() -> /admin/dashboard/catalog-kpis");
ok(dashboard.includes("router.get('/catalog-kpis'"),           "backend defines GET /admin/dashboard/catalog-kpis");

const adminAuth = read('MEMI-Backend/src/routes/admin-auth.js');
const serverJs  = read('MEMI-Backend/src/server.js');
const productsR = read('MEMI-Backend/src/routes/products.js');
console.log('Hardening (Phase C) contract:');
ok(adminApi.includes("/admin/auth/password"),                 "admin auth.changePassword() -> /admin/auth/password");
ok(adminAuth.includes("router.put('/password'"),               "backend defines PUT /admin/auth/password");
ok(serverJs.includes("publicWriteLimiter"),                    "rate limit on public writes (reviews/newsletter/resi)");
ok(serverJs.includes("codeProbeLimiter"),                      "rate limit on gift-card code validation");
ok(productsR.includes("validateBody(createProductSchema)"),    "zod validation on product create");
ok(productsR.includes("logAdminAction"),                       "audit logging on product mutations");

const productsImport = read('MEMI-Backend/src/routes/products-import.js');
console.log('Bulk product photos (ZIP) contract:');
ok(adminApi.includes("/admin/products/bulk-images"),           "admin bulkImagesZip() -> /admin/products/bulk-images");
ok(productsImport.includes("router.post('/bulk-images'"),      "backend defines POST /admin/products/bulk-images");

console.log('Order-lifecycle correctness invariants:');
ok(orders.includes("paymentStatus = 'pagato'"),         "verified Stripe payment sets payment_status=pagato");
ok(orders.includes("Number(pi.amount) !== expected"),   "Stripe amount is verified against the order total");
ok(orders.includes('FROM products WHERE id = ?'),       "line prices are re-resolved from the catalog");

console.log('Area Personale (account) contract:');
const account = read('MEMI-Backend/src/routes/account.js');
const server  = read('MEMI-Backend/src/server.js');
const authRt  = read('MEMI-Backend/src/routes/auth.js');
const custRt  = read('MEMI-Backend/src/routes/customers.js');
ok(server.includes("require('./routes/account')"),      "server requires account routes");
ok(/app\.use\('\/api\/auth',\s*accountRoutes\)/.test(server), "account routes mounted at /api/auth");
ok(apiClient.includes("get('/auth/wishlist')"),         "wishlist.get() -> GET /auth/wishlist");
ok(account.includes("router.get('/wishlist'"),          "backend defines GET /auth/wishlist");
ok(account.includes("router.put('/wishlist'"),          "backend defines PUT /auth/wishlist");
ok(apiClient.includes("get('/auth/addresses')"),        "addresses.list() -> GET /auth/addresses");
ok(account.includes("router.get('/addresses'"),         "backend defines GET /auth/addresses");
ok(account.includes("router.post('/addresses'"),        "backend defines POST /auth/addresses");
ok(account.includes("router.put('/addresses/:id/default'"), "backend defines PUT /auth/addresses/:id/default");
ok(account.includes("router.delete('/addresses/:id'"),  "backend defines DELETE /auth/addresses/:id");
ok(apiClient.includes("get('/auth/newsletter')"),       "newsletter.get() -> GET /auth/newsletter");
ok(account.includes("router.get('/newsletter'"),        "backend defines GET /auth/newsletter");
ok(account.includes("router.put('/newsletter'"),        "backend defines PUT /auth/newsletter");
ok(/wishlist,\s*sizes,\s*preferences,\s*lang/.test(authRt), "GET /auth/me returns wishlist/sizes/preferences/lang");
ok(authRt.includes("addJson('sizes'"),                  "PUT /auth/me accepts sizes JSON");
ok(custRt.includes('addresses') && custRt.includes('newsletter'), "admin customer detail returns addresses + newsletter");

console.log('Order-compensation invariants (Luglio 2026):');
const resiRt    = read('MEMI-Backend/src/routes/resi.js');
const payRt     = read('MEMI-Backend/src/routes/payments.js');
const comp      = read('MEMI-Backend/src/order-compensation.js');
const invoic    = read('MEMI-Backend/src/invoicing.js');
const adminApp  = read('MEMI/js/app.js');
const adminHtml = read('MEMI/dashboard.html');
ok(/router\.delete\('\/admin\/:id'[\s\S]{0,900}compensateOrder/.test(orders), 'DELETE order compensates (stock/gift/discount/points)');
ok(/annullato[\s\S]{0,600}compensateOrder\(conn, order, 'cancel'\)/.test(orders), 'cancel (annullato) compensates');
ok(orders.includes('non può essere riattivato'),                 'annullato is terminal (409 on reactivation)');
ok(/stock >= \?/.test(orders) && /affectedRows === 0/.test(orders), 'checkout stock decrement is atomic (no oversell)');
ok(orders.includes('ensureInvoiceForOrder(pool, orderId)'),      'auto-invoice on paid checkout/admin order');
ok(/payment_status === 'pagato'[\s\S]{0,200}ensureInvoiceForOrder/.test(orders), 'auto-invoice on pagato transition');
ok(resiRt.includes("compensateOrder(conn, orderRow, 'refund')"), 'Stripe refund restocks goods');
ok(/manual === true/.test(resiRt) && /if \(!stripe && !manual && !providers\.sumupConfigured\(\)\)/.test(resiRt), 'manual refund path (PayPal/bonifico) + SumUp-aware provider guard');
ok(resiRt.includes('sendRefundNotification'),                    'refund notifies the customer by email');
ok(/payment_status = 'pagato' WHERE id = \?", \[existing\.id\]/.test(payRt), 'webhook reconciles late payments to pagato');
const provRt = read('MEMI-Backend/src/payment-providers.js');
ok(/sumupConfigured/.test(provRt) && /v0\.1\/checkouts/.test(provRt), 'SumUp provider implemented (config-gated)');
ok(/sumup\/create-checkout/.test(payRt), 'payments router exposes /sumup/create-checkout');
const ordRt = read('MEMI-Backend/src/routes/orders.js');
ok(/getSumupCheckout/.test(ordRt) && /sumup_checkout_id/.test(ordRt), 'orders verify SumUp checkouts server-side');
ok(comp.includes('reverseOrderPoints') && comp.includes('GREATEST(0, utilizzi - 1)'), 'compensation module reverses points + frees discount');
ok(invoic.includes("payment_status !== 'pagato'"),               'invoicing only fires for paid orders');
ok(adminApp.includes('_apiFail'),                                'admin shows API-offline banner (no silent mock data)');
ok(adminApp.includes('data-manual="1"'),                         'admin UI exposes manual refund');
ok(adminHtml.includes('id="notifBtn"') && adminApp.includes("'#notifBtn'"), 'notification bell wired to real counts');

if (fail) { console.error(`\n${fail} contract check(s) FAILED`); process.exit(1); }
console.log('\nAll contract checks passed.');
