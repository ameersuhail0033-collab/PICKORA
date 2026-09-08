#!/usr/bin/env node
/**
 * server.js — Pickora production HTTP server
 * ===========================================
 * Runtime target: Hostinger Node.js Web App (from GitHub), production
 * domain https://pickoraonline.com.
 *
 * Responsibilities:
 *   1. Load local .env into process.env when present (dev convenience).
 *      On Hostinger the platform injects env vars directly, so .env is
 *      simply absent there and process.env is used as-is.
 *   2. Serve all static files (/, /pages, /css, /js, /assets, /admin).
 *   3. Mount the existing API business logic at the exact production
 *      routes (handlers in api/*.js are plain (req, res) functions and
 *      are reused unchanged — no payment logic is duplicated here).
 *
 * CRITICAL — Webhook raw body:
 *   POST /api/nomad-webhook verifies a Svix (HMAC-SHA256) signature over
 *   the EXACT raw request bytes. The handler itself streams the request
 *   body (svix verification must happen before JSON parsing), matching
 *   Vercel's `bodyParser: false`. Therefore this route is mounted with
 *   NO body-parsing middleware: any body parser (express.json /
 *   express.raw) would consume the request stream before the handler can
 *   read it and every signature would fail. The route is registered
 *   before the JSON routes so raw bytes are always available.
 *
 * Start: npm start   (runs scripts/generate-env.js then this file)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const express = require('express');

const ROOT = path.resolve(__dirname);
const PORT = process.env.PORT || 3000;

/* ── Local .env loader (dev only; Hostinger injects real env) ── */
// Loaded BEFORE requiring api/* so secrets are available. Values already
// present in process.env (platform-provided) are never overwritten.
try {
  const envFile = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
  envFile.split(/\r?\n/).forEach((line) => {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  });
} catch (e) {
  // No .env — running on Hostinger with platform env vars. Nothing to do.
}

/* ── Express app ─────────────────────────────────────────────── */
const app = express();
app.disable('x-powered-by');

/* Security headers (kept in parity with the previous vercel.json) */
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');

  // API responses must never be cached
  if (req.path === '/api' || req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  }
  next();
});

/**
 * Mount an existing api/*.js handler at a route.
 * Handlers are async (req, res) functions; this wrapper forwards any
 * uncaught rejection to a 500 instead of hanging the request.
 */
function mountApi(routePath, handler, bodyParser) {
  const stack = [];
  if (bodyParser) stack.push(bodyParser);
  stack.push((req, res) => {
    Promise.resolve(handler(req, res)).catch((err) => {
      console.error(`[server] ${routePath} unhandled error:`, err);
      if (res.headersSent) {
        res.end();
      } else {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    });
  });
  app.use(routePath, ...stack);
}

/* ══════════════════════════════════════════════════════════════
 * 1) API ROUTES — registered BEFORE any static / fallback handling
 *    so /api/* can never be served index.html.
 * ══════════════════════════════════════════════════════════════ */

// POST /api/nomad-webhook — RAW body, NO body parser (see header note).
// The handler rejects non-POST methods, verifies the Svix signature over
// the exact bytes, and returns JSON errors for invalid requests.
const webhookHandler = require('./api/nomad-webhook.js');
mountApi('/api/nomad-webhook', webhookHandler);

// JSON-bodied API handlers (they each perform their own auth/method/CORS
// checks). initialize-store accepts base64 logos, so allow a large body.
const createOrderHandler = require('./api/create-order.js');
mountApi('/api/create-order', createOrderHandler, express.json({ limit: '10mb' }));

const setupAdminHandler = require('./api/setup-admin.js');
mountApi('/api/setup-admin', setupAdminHandler, express.json({ limit: '10mb' }));

const initializeStoreHandler = require('./api/initialize-store.js');
mountApi('/api/initialize-store', initializeStoreHandler, express.json({ limit: '10mb' }));

// GET /api/sitemap — dynamic XML sitemap (no body needed)
const sitemapHandler = require('./api/sitemap.js');
mountApi('/api/sitemap', sitemapHandler);

/* ══════════════════════════════════════════════════════════════
 * 2) CLEAN-URL REWRITES — map short URLs to the real .html files,
 *    mirroring the previous vercel.json rewrites.
 * ══════════════════════════════════════════════════════════════ */

const sendPage = (file) => (req, res) => {
  res.sendFile(path.join(ROOT, file));
};

app.get('/', sendPage('index.html'));

/* Short clean-URL routes */
app.get('/shop', sendPage('pages/shop.html'));
app.get('/product/:slug', sendPage('pages/product.html'));
app.get('/cart', sendPage('pages/cart.html'));
app.get('/checkout', sendPage('pages/checkout.html'));
app.get('/wishlist', sendPage('pages/wishlist.html'));
app.get('/orders', sendPage('pages/orders.html'));
app.get('/profile', sendPage('pages/profile.html'));
app.get('/login', sendPage('pages/login.html'));
app.get('/register', sendPage('pages/register.html'));
app.get('/forgot-password', sendPage('pages/forgot-password.html'));
app.get('/reset-password', sendPage('pages/reset-password.html'));
app.get('/setup', sendPage('setup.html'));

/* /pages/* clean-URL routes (preserve query strings) */
app.get('/pages/shop', sendPage('pages/shop.html'));
app.get('/pages/product', sendPage('pages/product.html'));
app.get('/pages/cart', sendPage('pages/cart.html'));
app.get('/pages/checkout', sendPage('pages/checkout.html'));
app.get('/pages/wishlist', sendPage('pages/wishlist.html'));
app.get('/pages/orders', sendPage('pages/orders.html'));
app.get('/pages/profile', sendPage('pages/profile.html'));
app.get('/pages/login', sendPage('pages/login.html'));
app.get('/pages/register', sendPage('pages/register.html'));
app.get('/pages/forgot-password', sendPage('pages/forgot-password.html'));
app.get('/pages/reset-password', sendPage('pages/reset-password.html'));
app.get('/pages/account', sendPage('pages/account.html'));

/* Account order tracking: /pages/account/orders/:id/tracking */
app.get('/pages/account/orders/:id/tracking', sendPage('pages/account/orders/[id]/tracking.html'));

/* Checkout success */
app.get('/pages/checkout/success', sendPage('pages/checkout/success.html'));

/* Admin routes */
app.get('/admin', (req, res) => res.redirect(302, '/admin/dashboard'));
app.get('/admin/', (req, res) => res.redirect(302, '/admin/dashboard'));
app.get('/admin/dashboard', sendPage('admin/dashboard.html'));
app.get('/admin/products', sendPage('admin/products.html'));
app.get('/admin/categories', sendPage('admin/categories.html'));
app.get('/admin/orders', sendPage('admin/orders.html'));
app.get('/admin/customers', sendPage('admin/customers.html'));
app.get('/admin/coupons', sendPage('admin/coupons.html'));
app.get('/admin/analytics', sendPage('admin/analytics.html'));
app.get('/admin/settings', sendPage('admin/settings.html'));

/* ══════════════════════════════════════════════════════════════
 * 3) STATIC FILES — everything under the project root. redirect:false
 *    keeps directory requests (e.g. /admin) flowing to our handlers.
 * ══════════════════════════════════════════════════════════════ */
app.use(express.static(ROOT, { redirect: false }));

/* ══════════════════════════════════════════════════════════════
 * 4) FALLBACKS
 *    - unknown /api/*  → JSON 404 (never index.html)
 *    - other unknown paths → the site's 404 page
 * ══════════════════════════════════════════════════════════════ */
app.use((req, res) => {
  const isApi = req.path === '/api' || req.path.startsWith('/api/');
  if (isApi) {
    res.setHeader('Content-Type', 'application/json');
    return res.status(404).end(JSON.stringify({ error: 'Not found' }));
  }
  res.status(404).sendFile(path.join(ROOT, 'pages', '404.html'));
});

/* ══════════════════════════════════════════════════════════════
 * 5) LISTEN
 * ══════════════════════════════════════════════════════════════ */
const server = http.createServer(app);
server.listen(PORT, () => {
  console.log(`[server] Pickora listening on http://0.0.0.0:${PORT}`);
  console.log(`[server] Root: ${ROOT}`);
});

// Graceful shutdown (Hostinger sends SIGTERM on restart/deploy)
function shutdown(signal) {
  console.log(`[server] ${signal} received — shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
