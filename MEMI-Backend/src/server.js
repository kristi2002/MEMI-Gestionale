'use strict';

/**
 * MEMI Backend  —  Express REST API
 * ─────────────────────────────────
 * Base URL: /api
 *
 * Routes:
 *   /api/auth            Customer register / login / profile
 *   /api/admin/auth      Admin login / profile
 *   /api/products        Product catalog (public read, admin CRUD)
 *   /api/orders          Place orders, validate discounts, admin management
 *   /api/admin/customers Admin customer management
 *   /api/admin/discounts Admin discount code CRUD
 *   /api/shipping        Zones, couriers, shipments
 *   /api/admin/dashboard KPIs + analytics
 *   /api/admin/invoices   Invoice (fatture) CRUD
 *   /api/admin/resi       Returns (resi) CRUD
 *   /api/reviews          Product reviews (public submit + admin moderation)
 */

require('dotenv').config();

const express     = require('express');
const helmet      = require('helmet');
const cors        = require('cors');
const rateLimit   = require('express-rate-limit');
const { pool, testConnection } = require('./db');

// ── Route modules ──────────────────────────────────────────────
const authRoutes       = require('./routes/auth');
const accountRoutes    = require('./routes/account');
const adminAuthRoutes  = require('./routes/admin-auth');
const productsRoutes   = require('./routes/products');
const productsImportRoutes = require('./routes/products-import');
const categoriesRoutes  = require('./routes/categories');
const collectionsRoutes = require('./routes/collections');
const collectionsPublicRoutes = require('./routes/collections-public');
const colorsRoutes      = require('./routes/colors');
const ordersRoutes     = require('./routes/orders');
const customersRoutes  = require('./routes/customers');
const discountsRoutes  = require('./routes/discounts');
const shippingRoutes   = require('./routes/shipping');
const dashboardRoutes  = require('./routes/dashboard');
const paymentsRoutes      = require('./routes/payments');
const newsletterRoutes    = require('./routes/newsletter');
const invoicesRoutes      = require('./routes/invoices');
const resiRoutes          = require('./routes/resi');
const resiPublicRoutes    = require('./routes/resi-public');
const reviewsRoutes       = require('./routes/reviews');
const settingsRoutes      = require('./routes/settings');
const staffRoutes         = require('./routes/staff');
const giftcardsRoutes     = require('./routes/giftcards');
const giftcardsPublicRoutes = require('./routes/giftcards-public');
const campaignsRoutes     = require('./routes/campaigns');
const cmsRoutes           = require('./routes/cms');
const loyaltyRoutes       = require('./routes/loyalty');
const auditLogRoutes      = require('./routes/audit-log');
const expensesRoutes      = require('./routes/expenses');
const supplierInvoicesRoutes = require('./routes/supplier-invoices');
const segmentsRoutes      = require('./routes/segments');
const transfersRoutes     = require('./routes/transfers');
const popupsRoutes        = require('./routes/popups');
const analyticsTrackRoutes = require('./routes/analytics-track');
const automationsRoutes   = require('./routes/automations');
const lifecycleRoutes     = require('./routes/lifecycle');
const chatRoutes          = require('./routes/chat');
const chatPublicRoutes    = require('./routes/chat-public');
const feedRoutes          = require('./routes/feed');
const cartsRoutes         = require('./routes/carts');
const cartPublicRoutes    = require('./routes/cart-public');
const productVariantsRoutes = require('./routes/product-variants');
const purchasingRoutes    = require('./routes/purchasing');
const reportsRoutes       = require('./routes/reports');
const onlineStoreRoutes   = require('./routes/online-store');
const socialRoutes        = require('./routes/social');
const posRoutes           = require('./routes/pos');
const appsRoutes          = require('./routes/apps');
const { ensureDir: ensureUploadsDir, UPLOADS_DIR } = require('./images');
const { requestLogger }  = require('./logger');
const { requireAdmin, requirePermission } = require('./middleware/auth');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Fail fast if critical secrets are missing, placeholder, or weak ──
// jwt.sign/verify throw at request time if these are undefined, which
// turns every login into an opaque 500. Catch it at boot instead.
//
// Presence alone is not enough: docker-compose.yml ships placeholder defaults so the
// stack boots with no setup. A presence-only check passes on those, and every customer
// and admin JWT then gets signed with a secret that is public in this repo.
const PLACEHOLDER_RE = /^(replace_me|changeme|your_|placeholder)/i;
const MIN_SECRET_LEN = 32;

const secretProblems = [];
for (const key of ['JWT_SECRET', 'JWT_ADMIN_SECRET']) {
  const val = process.env[key];
  if (!val) secretProblems.push(`${key} is not set`);
  else if (PLACEHOLDER_RE.test(val)) secretProblems.push(`${key} is still a placeholder value`);
  else if (val.length < MIN_SECRET_LEN) secretProblems.push(`${key} is only ${val.length} chars (minimum ${MIN_SECRET_LEN})`);
}
// Identical secrets collapse the customer/admin trust boundary: a customer token would
// verify as an admin token.
if (process.env.JWT_SECRET && process.env.JWT_SECRET === process.env.JWT_ADMIN_SECRET) {
  secretProblems.push('JWT_SECRET and JWT_ADMIN_SECRET are identical — a customer token would validate as an admin token');
}
if (secretProblems.length) {
  console.error('❌  Refusing to start — JWT secret configuration is unsafe:');
  for (const p of secretProblems) console.error(`      • ${p}`);
  console.error('    Generate one:  openssl rand -hex 64');
  console.error('    Set JWT_SECRET and JWT_ADMIN_SECRET to two DIFFERENT values in your deployment config.');
  process.exit(1);
}

// ── Loud (not silent) warnings in production for optional-but-important config ──
// These features degrade gracefully (503 / no-op) rather than crashing, which is right for
// local dev — but in production a misconfigured deploy should be obvious at boot, not
// discovered when a customer's checkout or a password reset silently fails.
if (process.env.NODE_ENV === 'production') {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_PUBLISHABLE_KEY) {
    console.error('🔴  WARNING: STRIPE_SECRET_KEY/STRIPE_PUBLISHABLE_KEY not set — card checkout is disabled.');
  }
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error('🔴  WARNING: STRIPE_WEBHOOK_SECRET not set — /api/payments/webhook will reject all events (503).');
  }
  if (!process.env.SMTP_USER) {
    console.error('🔴  WARNING: SMTP_USER not set — all transactional emails (order confirmation, shipping, welcome, password reset) are silent no-ops.');
  }
  // Test keys accept card numbers and issue receipts, so a test-key deploy looks healthy
  // from the outside while taking exactly zero real money.
  if ((process.env.STRIPE_SECRET_KEY || '').startsWith('sk_test_')) {
    console.error('🔴  WARNING: STRIPE_SECRET_KEY is a TEST key — checkout cannot take real payments.');
  }
  if (process.env.DB_PASSWORD && (PLACEHOLDER_RE.test(process.env.DB_PASSWORD) || process.env.DB_PASSWORD.length < 12)) {
    console.error('🔴  WARNING: DB_PASSWORD is weak or still a placeholder — rotate it (see docs/GO-LIVE-PLAN-2026-07.md).');
  }
  if (process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.length < 12) {
    console.error('🔴  WARNING: ADMIN_PASSWORD is shorter than 12 chars — the admin panel is internet-facing.');
  }
}

// ── Trust proxy (required behind Traefik / nginx / Coolify) ───
// Without this, express-rate-limit throws on X-Forwarded-For headers.
app.set('trust proxy', 1);

// ── Structured request logging (assigns req.id / req.log to every request) ───
app.use(requestLogger);

// ── Security headers ───────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// ── CORS ───────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, cb) {
    // Allow requests with no origin (server-to-server, curl, Coolify health checks)
    if (!origin) return cb(null, true);
    if (process.env.NODE_ENV !== 'production') return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['X-Total-Count'],   // pagination total for the products list
}));

// ── Stripe webhook (needs the RAW body for signature verification) ────────────
// Must be registered before the global express.json() below, or the body would already
// be parsed/consumed by the time it reaches the handler and signature checks would fail.
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), paymentsRoutes.stripeWebhookHandler);

// ── Tracking webhook (also needs the RAW body for HMAC signature verification) ──
const trackingWebhook = require('./routes/tracking-webhook');
app.post('/api/shipping/tracking/webhook', express.raw({ type: 'application/json' }), trackingWebhook.handler);

// ── Body parsing ───────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Uploaded product images (persistent volume) ───────────────
// Mounted BEFORE rate limiting so image requests are never throttled.
// Content-hashed filenames → safe to cache "immutable" forever.
ensureUploadsDir();
app.use('/api/uploads', express.static(UPLOADS_DIR, {
  immutable: true,
  maxAge:    '365d',
  index:     false,
  setHeaders(res) {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    // Serve exactly the declared type — never let a browser MIME-sniff an uploaded file
    // into something executable (defence-in-depth alongside the upload-time type whitelist).
    res.setHeader('X-Content-Type-Options', 'nosniff');
  },
}));

// ── Rate limiting ──────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 min
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,  // Stricter for auth endpoints
  message: { error: 'Troppi tentativi, riprova tra 15 minuti' },
});
// Dedicated, stricter limiter for the two checkout-money-movement endpoints — the
// general apiLimiter (300/15min) is generous enough for browsing, but placing orders
// and creating PaymentIntents are exactly the actions worth throttling harder.
const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Troppi tentativi di checkout, riprova tra qualche minuto' },
});

app.use('/api', apiLimiter);
app.use('/api/auth/login',           authLimiter);
app.use('/api/auth/register',        authLimiter);
app.use('/api/auth/forgot-password', authLimiter);
app.use('/api/auth/reset-password',  authLimiter);
app.use('/api/admin/auth/login',     authLimiter);
// Registered as bare middleware (falls through via next()) BEFORE the routers below are
// mounted, so it layers on top of the routes' own handlers rather than replacing them.
app.post('/api/orders', checkoutLimiter);
app.post('/api/payments/create-intent', checkoutLimiter);
// Public write endpoints — small budget stops review/newsletter bot floods
// without ever bothering a real shopper.
const publicWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Troppe richieste, riprova più tardi' },
});
// Gift-card code validation — throttled hard to make code enumeration impractical.
const codeProbeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Troppi tentativi, riprova più tardi' },
});
app.post('/api/reviews', publicWriteLimiter);
app.post('/api/newsletter/subscribe', publicWriteLimiter);
app.post('/api/resi/request', publicWriteLimiter);
app.use('/api/giftcards/validate', codeProbeLimiter);

// ── Health check ───────────────────────────────────────────────
// Checks DB connectivity, not just "the process is alive" — a Docker/Coolify healthcheck
// that only pings this endpoint should actually catch a dead DB connection.
app.get('/health', async (req, res) => {
  try {
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    return res.json({ status: 'ok', db: 'ok', ts: new Date().toISOString() });
  } catch (err) {
    console.error('[health] DB check failed:', err.message);
    return res.status(503).json({ status: 'degraded', db: 'unreachable', ts: new Date().toISOString() });
  }
});

// ── API routes ─────────────────────────────────────────────────
// Server-side RBAC: pure-admin mounts below are gated with `requireAdmin, requirePermission(view)`
// so a staff account can only reach the sections its assigned permission set (the same one the
// UI uses) allows — this is what stops, e.g., a "marketing" staffer from hitting the returns/refund
// or audit-log endpoints. The mount → view map lives here, in one auditable place. Routers that
// also serve PUBLIC routes (products, orders, shipping, newsletter, reviews, cms/popups public
// mounts, analytics /track) are NOT gated at the mount — they keep their own per-route requireAdmin,
// and their admin-only sub-routes are gated internally where needed (e.g. liveview below).
app.use('/api/auth',              authRoutes);
app.use('/api/auth',              accountRoutes);   // wishlist, addresses, newsletter (customer)
app.use('/api/admin/auth',        adminAuthRoutes);
app.use('/api/products',          productVariantsRoutes);   // /:id/variants* (before flat products router)
app.use('/api/products',          productsRoutes);
app.use('/api/collections',       collectionsPublicRoutes);   // public read-only collection metadata (storefront hero/title)
app.use('/api/admin/products',    requireAdmin, requirePermission('products'), productsImportRoutes);   // bulk CSV import (admin)
app.use('/api/admin/categories',  requireAdmin, requirePermission('categories'), categoriesRoutes);    // managed product categories
app.use('/api/admin/collections', requireAdmin, requirePermission('collections'), collectionsRoutes);  // managed product collections
app.use('/api/colors',            colorsRoutes.publicRouter);                                          // public colour palette (storefront swatches)
app.use('/api/admin/colors',      requireAdmin, requirePermission('products'), colorsRoutes.adminRouter); // managed colour palette
app.use('/api/orders',            ordersRoutes);
app.use('/api/admin/customers',   requireAdmin, requirePermission('customers'), customersRoutes);
app.use('/api/admin/discounts',   requireAdmin, requirePermission('discounts'), discountsRoutes);
app.use('/api/shipping',          shippingRoutes);
app.use('/api/admin/dashboard',   dashboardRoutes);   // /finance is admin-only internally; other KPIs are the shared 'dashboard' view
app.use('/api/payments',          paymentsRoutes);
app.use('/api/newsletter',        newsletterRoutes);
app.use('/api/admin/invoices',    requireAdmin, requirePermission('invoices'), invoicesRoutes);
app.use('/api/admin/resi',        requireAdmin, requirePermission('returns'), resiRoutes);   // gates the Stripe refund endpoint to returns-permitted staff
app.use('/api/resi',              resiPublicRoutes);
app.use('/api/reviews',           reviewsRoutes);
app.use('/api/admin/settings',    requireAdmin, requirePermission('settings'), settingsRoutes);
app.use('/api/admin/staff',       requireAdmin, requirePermission('staff'), staffRoutes);
app.use('/api/admin/giftcards',   requireAdmin, requirePermission('giftcards'), giftcardsRoutes);
app.use('/api/giftcards',         giftcardsPublicRoutes);   // public validate for checkout
app.use('/api/admin/campaigns',   requireAdmin, requirePermission('marketing'), campaignsRoutes);
app.use('/api/admin/cms',         requireAdmin, requirePermission('content', 'blog'), cmsRoutes);
app.use('/api/cms',               cmsRoutes);   // public /published/* routes for the storefront
app.use('/api/admin/loyalty',     requireAdmin, requirePermission('loyalty'), loyaltyRoutes);
app.use('/api/admin/audit-log',   requireAdmin, requirePermission('audit-log'), auditLogRoutes);
app.use('/api/admin/expenses',    requireAdmin, requirePermission('bills'), expensesRoutes);
app.use('/api/admin/supplier-invoices', requireAdmin, requirePermission('bills'), supplierInvoicesRoutes);
app.use('/api/admin/segments',    requireAdmin, requirePermission('segments'), segmentsRoutes);
app.use('/api/admin/transfers',   requireAdmin, requirePermission('transfers'), transfersRoutes);
app.use('/api/admin/popups',      requireAdmin, requirePermission('popups'), popupsRoutes);
app.use('/api/popups',            popupsRoutes);   // public /published for storefront
app.use('/api',                   analyticsTrackRoutes);   // POST /api/track (public) + GET /api/admin/liveview (gated internally)
app.use('/api/admin/automations', requireAdmin, requirePermission('automations'), automationsRoutes);
app.use('/api/admin/lifecycle',   requireAdmin, requirePermission('marketing'), lifecycleRoutes);   // automated lifecycle/marketing emails
app.use('/api/admin/chat',        requireAdmin, requirePermission('chat'), chatRoutes);
app.use('/api/chat',              chatPublicRoutes);   // public storefront widget
app.use('/api/feed',              feedRoutes);         // public product feed (Meta/Google)
app.use('/api/admin/carts',       requireAdmin, requirePermission('orders-abandoned'), cartsRoutes);
app.use('/api/cart',              cartPublicRoutes);   // public cart beacon (storefront)
app.use('/api/admin',             requireAdmin, requirePermission('inventory'), purchasingRoutes);   // /suppliers* + /purchase-orders* (procurement ~ inventory)
app.use('/api/admin/reports',      requireAdmin, requirePermission('reports'), reportsRoutes);
app.use('/api/admin/online-store', requireAdmin, requirePermission('online-store'), onlineStoreRoutes);
app.use('/api/admin/social',       requireAdmin, requirePermission('social'), socialRoutes);
app.use('/api/admin/pos',          requireAdmin, requirePermission('pos'), posRoutes);
app.use('/api/admin/apps',         requireAdmin, requirePermission('apps'), appsRoutes);

// ── 404 catch-all ─────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'Endpoint non trovato' }));

// ── Global error handler ───────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Errore interno del server' });
});

// ── Startup ───────────────────────────────────────────────────
// Wait for MySQL instead of dying on the first refused connection. On a FRESH
// volume, mysql reports "healthy" (mysqladmin ping) before its initdb.d seed
// finishes and while its entrypoint bounces the temp init-server — so the very
// first connection attempts can be refused. Without this retry the backend
// exit(1)'d, its restart policy brought it back, but `docker compose up` had
// already reported "dependency backend failed to start" (a scary failed first
// boot needing a manual retry). Retrying here makes the first boot clean.
async function connectWithRetry(maxAttempts = 30, delayMs = 2000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await testConnection();
      return;
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      console.log(`⏳  MySQL not ready (attempt ${attempt}/${maxAttempts}: ${err.code || err.message}), retrying in ${delayMs}ms...`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

(async () => {
  try {
    await connectWithRetry();
    // Ensure feature tables added after the initial schema exist (idempotent)
    try {
      const { runMigrations } = require('./db/migrations');
      await runMigrations(pool);
    } catch (mErr) {
      console.error('⚠️  Migrations failed (continuing):', mErr.message);
    }
    // ── Lifecycle email scheduler ──────────────────────────────
    // In-process daily runner for birthday / win-back / points / anniversary emails.
    // No-op when SMTP is unset or DISABLE_EMAIL_SCHEDULER=1 (see src/scheduler.js).
    try {
      require('./scheduler').startScheduler(pool);
    } catch (sErr) {
      console.error('⚠️  Lifecycle scheduler not started:', sErr.message);
    }
    // ── Daily maintenance (loyalty point expiry) — not SMTP-gated; no-op unless configured.
    try {
      require('./scheduler').startMaintenanceScheduler(pool);
    } catch (mErr2) {
      console.error('⚠️  Maintenance scheduler not started:', mErr2.message);
    }
    // ── SMTP readiness check (best-effort, non-blocking) ───────
    // Surfaces a broken / half-configured mail setup once at boot with a clear
    // ✅ / 🔴 line, instead of failing silently on every transactional email.
    try {
      require("./email").verifyEmailTransport();
    } catch (eErr) {
      console.error("⚠️  SMTP verification skipped:", eErr.message);
    }
    const server = app.listen(PORT, () => {
      console.log(`🚀  MEMI API running on port ${PORT}`);
      console.log(`    NODE_ENV = ${process.env.NODE_ENV || 'development'}`);
    });

    // ── Graceful shutdown on SIGTERM (Coolify rolling deploys) ──
    // Give in-flight requests up to 10s to complete before the process exits.
    process.on('SIGTERM', () => {
      console.log('SIGTERM received — closing HTTP server...');
      server.close(() => {
        console.log('HTTP server closed. Draining DB pool...');
        pool.end().finally(() => {
          console.log('DB pool drained. Exiting.');
          process.exit(0);
        });
      });
      // Force-exit after 10s if something hangs
      setTimeout(() => process.exit(1), 10_000).unref();
    });
  } catch (err) {
    console.error('❌  Failed to start:', err.message);
    process.exit(1);
  }
})();

module.exports = app;
