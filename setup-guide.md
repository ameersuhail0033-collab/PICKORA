# Setup Guide

Complete step-by-step guide to set up your Pickora store.

## Prerequisites

Before you begin, ensure you have:

- [ ] GitHub account
- [ ] Vercel account ([vercel.com](https://vercel.com))
- [ ] Supabase account ([supabase.com](https://supabase.com))
- [ ] Nomad Payment Gateway account ([nomadpay.com](https://nomadpay.com))
- [ ] Node.js 18+ installed locally (for development)

## Quick Setup (10 minutes)

### Phase 1: Database (3 minutes)

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Open the SQL Editor
3. Run each file in order:

```
supabase/schema.sql     → Creates tables, indexes, triggers
supabase/functions.sql  → Creates functions, RPCs
supabase/policies.sql   → Enables RLS + policies
supabase/seed.sql       → Inserts demo data
```

4. Copy these from Settings → API:
   - Project URL
   - publishable key (`PUBLIC_SUPABASE_PUBLISHABLE_KEY`)
   - secret key (`SUPABASE_SECRET_KEY`)

### Phase 2: Environment (2 minutes)

1. Fork/clone the repository
2. Copy `.env.example` to `.env`
3. Fill in all values:

```env
PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PUBLIC_SUPABASE_PUBLISHABLE_KEY=eyJ...
SUPABASE_SECRET_KEY=eyJ...
NOMOD_HOSTED_CHECKOUT_API_KEY=sk_live_...
NOMOD_WEBHOOK_SECRET=whsec_...
PUBLIC_SITE_URL=https://your-domain.com
PUBLIC_STORE_NAME=Your Store Name
PUBLIC_SUPPORT_EMAIL=support@your-domain.com
PUBLIC_PAYMENT_MODE=test
```

### Phase 3: Payments (2 minutes)

1. Log into Nomad Dashboard
2. Copy Merchant ID, API Key, Webhook Secret
3. Set webhook URL to: `https://your-domain.com/api/nomad-webhook`
4. Enable events: `payment.completed`, `payment.failed`, `payment.refunded`

### Phase 4: Deploy (2 minutes)

1. Push to GitHub
2. Import to Vercel
3. Add all environment variables in Vercel dashboard
4. Deploy

### Phase 5: Configure (1 minute)

1. Visit your site → redirects to `/setup.html`
2. Complete the wizard:
   - Store name, logo, colors
   - Contact info and socials
   - Create admin account
3. Store goes live!

## Detailed Guides

- [Supabase Setup](supabase-setup.md) — Database, auth, storage configuration
- [Nomad Setup](nomad-setup.md) — Payment gateway configuration
- [Deployment](deployment-guide.md) — Vercel deployment details
- [Security](SECURITY.md) — Security architecture and policies
- [Architecture](ARCHITECTURE.md) — System design and data flows

## Post-Setup Checklist

- [ ] Verify store loads with correct branding
- [ ] Test product browsing and search
- [ ] Test account registration and login
- [ ] Test add to cart and checkout
- [ ] Verify Nomad payment (test mode)
- [ ] Check admin dashboard
- [ ] Create your first product
- [ ] Set up Google OAuth (optional)
- [ ] Configure Resend for emails (optional)
- [ ] Switch to live payment mode
- [ ] Add custom domain
- [ ] Test on mobile devices
