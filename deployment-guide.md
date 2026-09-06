# Deployment Guide

## Prerequisites

- Node.js 18+
- Vercel account ([vercel.com](https://vercel.com))
- Supabase project ([supabase.com](https://supabase.com))
- Nomad Payment Gateway account ([nomadpay.com](https://nomadpay.com))
- GitHub repository (recommended for auto-deploy)

## Step 1: Prepare Environment

```bash
# Clone the repository
git clone https://github.com/your-org/pickora.git
cd pickora

# Copy environment template
cp .env.example .env

# Edit .env with your actual values
nano .env
```

## Step 2: Set Up Supabase

1. Create a new Supabase project
2. Open SQL Editor
3. Run each SQL file in order:
   - `supabase/schema.sql`
   - `supabase/functions.sql`
   - `supabase/policies.sql`
   - `supabase/seed.sql`
4. Create storage buckets:
   - `store-assets` (public read, admin write)
   - `product-images` (public read, admin write)
   - `avatars` (public read, user write to own path)
5. Copy Project URL, publishable key, and secret key to `.env`

## Step 3: Set Up Nomad

1. Get Merchant ID, API Key, Webhook Secret from Nomad dashboard
2. Set webhook URL to `https://your-domain.com/api/nomad-webhook`
3. Enable payment events
4. Add keys to `.env`

## Step 4: Generate Environment File

```bash
npm run generate-env
```

This creates `js/env.js` with only `PUBLIC_*` variables.

## Step 5: Deploy to Vercel

### Option A: GitHub Integration (Recommended)

1. Push code to GitHub
2. Go to [vercel.com/new](https://vercel.com/new)
3. Import your repository
4. Vercel auto-detects the framework (None/Node.js)
5. Add environment variables in Vercel dashboard:
   - Copy all values from `.env`
   - **Important**: Add all variables, not just `PUBLIC_*`
6. Deploy!

### Option B: CLI Deployment

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy
vercel --prod
```

## Step 6: Run Setup Wizard

1. Visit `https://your-domain.com`
2. You'll be redirected to `/setup.html`
3. Complete the wizard:
   - Store name, logo, colors
   - Contact info
   - Create admin account
4. The first user becomes admin automatically

## Step 7: Verify

1. Check the store loads with your branding
2. Browse products, add to cart, checkout
3. Verify Nomad payment flow works
4. Check admin dashboard at `/admin`
5. Test email delivery (if Resend configured)

## Custom Domain

1. In Vercel Dashboard → Settings → Domains
2. Add your custom domain
3. Update DNS as instructed by Vercel
4. Update `PUBLIC_SITE_URL` in environment variables
5. Update webhook URL in Nomad dashboard

## Environment Variables in Vercel

Go to Vercel Dashboard → Settings → Environment Variables.

Add each variable from your `.env`:

| Variable | Environment |
|----------|-------------|
| `PUBLIC_SUPABASE_URL` | Production + Preview |
| `PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Production + Preview |
| `SUPABASE_SECRET_KEY` | Production only |
| `NOMOD_HOSTED_CHECKOUT_API_KEY` | Production only |
| `NOMOD_WEBHOOK_SECRET` | Production only |
| `PUBLIC_SITE_URL` | Production |
| `PUBLIC_STORE_NAME` | Production |
| `PUBLIC_SUPPORT_EMAIL` | Production |
| `PUBLIC_PAYMENT_MODE` | Production |
| `RESEND_API_KEY` | Production (optional) |
| `EMAIL_FROM` | Production (optional) |

## Redeploy

After changing environment variables:

```bash
vercel --prod
```

Or trigger a redeploy from the Vercel dashboard.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| 404 on API routes | Ensure `api/` directory is at project root |
| Webhook not working | Check env vars are set, body parser is off |
| Setup wizard loops | Ensure `store_settings` table is empty |
| Images not loading | Check storage bucket policies and names |
| Styles not applying | Ensure `js/env.js` is generated (`npm run generate-env`) |
