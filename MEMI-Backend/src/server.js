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
const { testConnection } = require('./db');

// ── Route modules ──────────────────────────────────────────────
const authRoutes       = require('./routes/auth');
const adminAuthRoutes  = require('./routes/admin-auth');
const productsRoutes   = require('./routes/products');
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
const campaignsRoutes     = require('./routes/campaigns');
const cmsRoutes           = require('./routes/cms');
const loyaltyRoutes       = require('./routes/loyalty');
const { ensureDir: ensureUploadsDir, UPLOADS_DIR } = require('./images');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Fail fast if critical secrets are missing ─────────────────
// jwt.sign/verify throw at request time if these are undefined, which
// turns every login into an opaque 500. Catch it at boot instead.
const requiredSecrets = ['JWT_SECRET', 'JWT_ADMIN_SECRET'];
const missingSecrets  = requiredSecrets.filter(k => !process.env[k]);
if (missingSecrets.length) {
  console.error(`❌  Missing required environment variables: ${missingSecrets.join(', ')}`);
  console.error('    Set them in your .env / deployment config before starting.');
  process.exit(1);
}

// ── Trust proxy (required behind Traefik / nginx / Coolify) ───
// Without this, express-rate-limit throws on X-Forwarded-For headers.
app.set('trust proxy', 1);

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
}));

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
  setHeaders(res) { res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'); },
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

app.use('/api', apiLimiter);
app.use('/api/auth/login',           authLimiter);
app.use('/api/auth/register',        authLimiter);
app.use('/api/auth/forgot-password', authLimiter);
app.use('/api/auth/reset-password',  authLimiter);
app.use('/api/admin/auth/login',     authLimiter);

// ── Health check ───────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ── API routes ─────────────────────────────────────────────────
app.use('/api/auth',              authRoutes);
app.use('/api/admin/auth',        adminAuthRoutes);
app.use('/api/products',          productsRoutes);
app.use('/api/orders',            ordersRoutes);
app.use('/api/admin/customers',   customersRoutes);
app.use('/api/admin/discounts',   discountsRoutes);
app.use('/api/shipping',          shippingRoutes);
app.use('/api/admin/dashboard',   dashboardRoutes);
app.use('/api/payments',          paymentsRoutes);
app.use('/api/newsletter',        newsletterRoutes);
app.use('/api/admin/invoices',    invoicesRoutes);
app.use('/api/admin/resi',        resiRoutes);
app.use('/api/resi',              resiPublicRoutes);
app.use('/api/reviews',           reviewsRoutes);
app.use('/api/admin/settings',    settingsRoutes);
app.use('/api/admin/staff',       staffRoutes);
app.use('/api/admin/giftcards',   giftcardsRoutes);
app.use('/api/admin/campaigns',   campaignsRoutes);
app.use('/api/admin/cms',         cmsRoutes);
app.use('/api/cms',               cmsRoutes);   // public /published/* routes for the storefront
app.use('/api/admin/loyalty',     loyaltyRoutes);

// ── 404 catch-all ─────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'Endpoint non trovato' }));

// ── Global error handler ───────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Errore interno del server' });
});

// ── Startup ───────────────────────────────────────────────────
(async () => {
  try {
    await testConnection();
    // Ensure feature tables added after the initial schema exist (idempotent)
    try {
      const { pool } = require('./db');
      const { runMigrations } = require('./db/migrations');
      await runMigrations(pool);
    } catch (mErr) {
      console.error('⚠️  Migrations failed (continuing):', mErr.message);
    }
    const server = app.listen(PORT, () => {
      console.log(`🚀  MEMI API running on port ${PORT}`);
      console.log(`    NODE_ENV = ${process.env.NODE_ENV || 'development'}`);
    });

    // ── Graceful shutdown on SIGTERM (Coolify rolling deploys) ──
    // Give in-flight requests up to 10s to complete before the process exits.
    const { pool } = require('./db');
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
