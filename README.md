# Pickora — Premium White-Label E-Commerce Platform

A production-grade, white-label e-commerce platform specializing in laptops. Built with vanilla JavaScript, Supabase (PostgreSQL + Auth + Storage), and Nomad Payment Gateway. Rebrands entirely via environment variables and database settings — zero code changes.

## Features

- **White-Label Design**: Full rebranding via `.env` + `store_settings` DB row. Colors, logo, favicon, meta, social links — all runtime.
- **Premium UI**: Glassmorphism design, dark/light mode, scroll animations, responsive mobile-first layout.
- **Supabase Backend**: PostgreSQL with RLS, auth (email/password, Google OAuth, magic link), storage, real-time.
- **Nomad Payments**: Hosted checkout model. Server-side order verification, HMAC webhook validation, timing-safe comparison.
- **Admin Dashboard**: KPIs, revenue charts (canvas), product/order/coupon/category/customer CRUD, analytics.
- **Full E-Commerce**: Shop with filters/search/pagination, product detail with gallery/variants/reviews, cart, wishlist, checkout, order tracking.
- **Setup Wizard**: Auto-redirects on first run. Creates admin account, stores settings, uploads logo.
- **Email System**: Order confirmation & invoice templates via Resend (optional, no-ops without key).
- **SEO**: Dynamic meta/OG, JSON-LD, sitemap.xml, robots.txt, canonical URLs.
- **Security**: RLS on every table, XSS-safe escaping, secrets server-side only, security headers, HMAC webhook verification.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla JavaScript (ES6+), CSS3 (custom properties, glassmorphism) |
| Backend | Vercel Serverless Functions (Node.js) |
| Database | Supabase (PostgreSQL + pgcrypto, pg_trgm, citext) |
| Auth | Supabase Auth (email/password, Google OAuth, magic link) |
| Payments | Nomad Payment Gateway (hosted checkout) |
| Email | Resend API (optional) |
| Hosting | Vercel (static + serverless) |
| CDN | Google Fonts (Inter, Space Grotesk) |

## Quick Start (~10 minutes)

### 1. Clone & Install

```bash
git clone https://github.com/your-org/pickora.git
cd pickora
cp .env.example .env
# Edit .env with your values (see Environment Variables below)
```

### 2. Create Supabase Project

1. Go to [supabase.com](https://supabase.com) → New Project
2. Copy your **Project URL**, **publishable key**, and **secret key**
3. Open SQL Editor and run these files **in order**:
   1. `supabase/schema.sql` — tables, indexes, triggers
   2. `supabase/functions.sql` — functions, RPCs
   3. `supabase/policies.sql` — RLS policies
   4. `supabase/seed.sql` — demo data
4. Create Storage buckets (see Storage Setup below)

### 3. Set Up Nomad Payments

1. Go to [Nomad Payment Gateway](https://nomadpay.com) → Dashboard
2. Get your **Merchant ID**, **API Key**, and **Webhook Secret**
3. Set webhook URL to: `https://your-domain.com/api/nomad-webhook`
4. Enable events: `payment.completed`, `payment.failed`, `payment.refunded`

### 4. Deploy to Vercel

```bash
npm run build  # generates js/env.js with PUBLIC_ vars
vercel deploy
```

Or connect your GitHub repo to Vercel for auto-deploy.

### 5. Run Setup Wizard

Visit your site → auto-redirects to `/setup.html` → complete the wizard.

---

## Environment Variables

All variables are explained in `.env.example`. Here's a complete reference:

| Variable | Required | Description |
|----------|----------|-------------|
| `PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL (Settings → API → Project URL) |
| `PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ✅ | Supabase publishable/anon key (Settings → API → publishable). Safe for browser. |
| `SUPABASE_SECRET_KEY` | ✅ | Supabase secret/service-role key (Settings → API → secret). **NEVER expose to browser.** |
| `NOMOD_HOSTED_CHECKOUT_API_KEY` | ✅ | Nomod Hosted Checkout API key (Settings → Apps & APIs). **Server-side only.** |
| `NOMOD_WEBHOOK_SECRET` | ✅ | Nomod webhook signing secret (Settings → Webhooks). **Server-side only.** |
| `PUBLIC_PAYMENT_MODE` | ✅ | `test` or `live` — switches Nomad endpoint |
| `PUBLIC_SITE_URL` | ✅ | Full site URL, no trailing slash (e.g., `https://pickoraonline.com`) |
| `PUBLIC_STORE_NAME` | ✅ | Store display name |
| `PUBLIC_SUPPORT_EMAIL` | ✅ | Support email for contact & emails |
| `RESEND_API_KEY` | ❌ | Resend API key for transactional emails (optional) |
| `EMAIL_FROM` | ❌ | From address for emails (requires verified Resend domain) |
| `PUBLIC_STORE_CURRENCY` | ❌ | Default currency (USD, AED, EUR, GBP) |

### Where to Find Supabase Keys

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Select your project
3. Go to **Settings** (gear icon) → **API**
4. **Project URL** → `PUBLIC_SUPABASE_URL`
5. **anon / publishable** → `PUBLIC_SUPABASE_PUBLISHABLE_KEY`
6. **service_role / secret** → `SUPABASE_SECRET_KEY` ⚠️ Keep secret!

---

## Storage Setup

Create these buckets in Supabase Storage:

1. **`store-assets`** — for logos, favicons
   - Public read
   - Admin-only write
2. **`product-images`** — for product photos
   - Public read
   - Admin-only write
3. **`avatars`** — for user avatars
   - Public read
   - Users can write only to `avatars/<uid>/` path

Policies are defined in `supabase/policies.sql`.

---

## Database Migration Order

Run these SQL files in the Supabase SQL Editor **in order**:

1. **`supabase/schema.sql`** — Extensions, tables, types, indexes, triggers, views
2. **`supabase/functions.sql`** — `is_admin()`, `handle_new_user()`, search vector, order number generator, rating recalc, `validate_coupon()`, stock decrement, analytics RPCs
3. **`supabase/policies.sql`** — RLS policies for all tables + storage
4. **`supabase/seed.sql`** — Default store settings, categories, demo products, coupons

---

## Auth Setup

### Email/Password
Built-in via Supabase Auth. No additional setup needed.

### Google OAuth
1. Go to Supabase Dashboard → Authentication → Providers → Google
2. Enable and add your Google Client ID + Secret
3. Add authorized redirect URI: `https://your-project.supabase.co/auth/v1/callback`

### Magic Link
Built-in via Supabase Auth OTP. No additional setup needed.

---

## Nomad Payment Integration

### Architecture

```
Client → POST /api/create-order → Server validates order → Creates Nomad payment → Returns checkout URL
Client → Redirects to Nomad hosted checkout → Customer pays
Nomad → POST /api/nomad-webhook → Server verifies HMAC signature → Marks order paid
```

### Webhook Signature Verification

Nomad signs every webhook with HMAC-SHA256:

- **Header**: `X-Nomad-Signature`
- **Algorithm**: `HMAC-SHA256(rawBody, NOMAD_WEBHOOK_SECRET)`
- **Encoding**: Hex digest
- **Verification**: Timing-safe comparison via `crypto.timingSafeEqual()`

The server disables body parsing (`bodyParser: false`) to access the raw request body for verification.

---

## Local Development

```bash
# 1. Install dependencies (optional, for serverless)
npm install

# 2. Generate env.js from .env
npm run generate-env

# 3. Start local server
npm run dev
# Opens at http://localhost:3000
```

For the API serverless functions, use `vercel dev` (requires Vercel CLI):

```bash
npx vercel dev
```

---

## Deployment to Vercel

### Automatic (GitHub Integration)
1. Push to GitHub
2. Go to [vercel.com](https://vercel.com) → Import Project
3. Select your repo
4. Set environment variables in Vercel dashboard
5. Deploy!

### Manual
```bash
npm run build
vercel --prod
```

---

## Security

- **Secrets**: Only `PUBLIC_*` vars reach the browser. `SUPABASE_SECRET_KEY`, `NOMOD_HOSTED_CHECKOUT_API_KEY`, `NOMOD_WEBHOOK_SECRET`, and `RESEND_API_KEY` stay server-side only.
- **RLS**: Every table has Row Level Security with default deny. Users access only their own data.
- **XSS**: All user/DB strings escaped via `esc()` before HTML insertion.
- **Payments**: Order amounts re-verified server-side. No client can self-mark as paid.
- **Webhooks**: HMAC-SHA256 signature verification with timing-safe comparison.
- **Headers**: `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`, `Permissions-Policy`, `HSTS`.

See [SECURITY.md](SECURITY.md) for full details.

---

## Project Structure

```
/
├── index.html              # Homepage
├── setup.html              # Setup wizard
├── robots.txt
├── vercel.json             # Vercel config + security headers
├── package.json
├── .env.example
├── .gitignore
│
├── pages/                  # Customer pages
│   ├── shop.html
│   ├── product.html
│   ├── cart.html
│   ├── checkout.html
│   ├── wishlist.html
│   ├── orders.html
│   ├── profile.html
│   ├── login.html
│   ├── register.html
│   ├── forgot-password.html
│   └── reset-password.html
│
├── admin/                  # Admin pages
│   ├── dashboard.html
│   ├── products.html
│   ├── categories.html
│   ├── orders.html
│   ├── customers.html
│   ├── coupons.html
│   ├── analytics.html
│   └── settings.html
│
├── css/                    # Stylesheets
│   ├── main.css            # Design system
│   ├── auth.css
│   ├── admin.css
│   ├── shop.css
│   ├── product.css
│   ├── cart.css
│   └── checkout.css
│
├── js/                     # JavaScript
│   ├── env.js              # Generated PUBLIC_ vars
│   ├── config.js           # Global config + utilities
│   ├── supabase.js         # Supabase client + helpers
│   ├── settings.js         # White-label settings
│   ├── components.js       # Navbar, footer, product cards
│   ├── app.js              # Homepage logic
│   ├── auth.js             # Auth pages
│   ├── products.js         # Shop + product detail
│   ├── cart.js             # Cart page
│   ├── checkout.js         # Checkout flow
│   ├── admin.js            # Admin panel
│   ├── analytics.js        # Analytics charts
│   └── setup.js            # Setup wizard
│
├── api/                    # Vercel serverless functions
│   ├── _lib.js             # Shared helpers (Supabase, Nomad, email)
│   ├── create-order.js     # Create Nomad checkout session
│   ├── nomad-webhook.js    # Handle Nomad webhooks
│   ├── send-email.js       # Send emails via Resend
│   └── sitemap.js          # Dynamic XML sitemap
│
├── emails/                 # Email templates
│   ├── order-confirmation.html
│   └── invoice.html
│
├── supabase/               # SQL files
│   ├── schema.sql
│   ├── functions.sql
│   ├── policies.sql
│   └── seed.sql
│
├── scripts/
│   └── generate-env.js     # Build script
│
├── assets/
│   └── icons/favicon.svg
│
├── README.md
├── SECURITY.md
├── ARCHITECTURE.md
├── setup-guide.md
├── supabase-setup.md
├── nomad-setup.md
└── deployment-guide.md
```

---

## License

MIT
