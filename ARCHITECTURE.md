# Architecture

## System Overview

Pickora is a static-front + serverless-back e-commerce platform. The frontend is pure vanilla JavaScript (no build step, no framework) served as static files. Backend logic runs as Vercel Serverless Functions (Node.js). Data lives in Supabase (PostgreSQL). Payments go through Nomad's hosted checkout.

```
┌──────────────────────────────────────────────────────────┐
│                        CLIENT                            │
│  index.html, pages/, admin/, css/, js/                   │
│  Vanilla JS + Supabase JS CDN                            │
│  Reads: window.__ENV (PUBLIC_* only)                     │
└──────────────┬───────────────────────────┬───────────────┘
               │ REST API                  │ Auth
               ▼                           ▼
┌──────────────────────────┐  ┌────────────────────────────┐
│   VERCEL SERVERLESS       │  │   SUPABASE                 │
│   api/create-order.js     │  │   - Auth (JWT)             │
│   api/nomad-webhook.js    │  │   - PostgreSQL + RLS       │
│   api/send-email.js       │  │   - Storage (images)       │
│   api/sitemap.js           │  │   - RPCs (analytics)       │
│                           │  │                            │
│   Env: secret key,        │  │   Env: publishable key     │
│        Nomod API key,     │  │   (safe for browser)       │
│        webhook secret     │  └────────────────────────────┘
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│   NOMOD PAYMENTS          │
│   - Create checkout       │
│   - Webhook callbacks     │
│   - Svix verification     │
└──────────────────────────┘
```

## Data Flow

### Product Browsing
1. Client loads page → Supabase JS CDN initializes
2. `supabase.js` creates client with publishable key
3. Product queries go directly to Supabase (RLS: anyone can read active products)
4. No serverless function needed for reads

### Checkout Flow
1. User fills shipping info → clicks "Place Order"
2. Client creates `pending` order in Supabase (RLS: own only)
3. Client calls `POST /api/create-order` with JWT
4. Server re-reads order from DB (validates amounts server-side)
5. Server calls Nomad API to create hosted checkout session
6. Server stores `nomad_order_id` on order, returns `checkout_url`
7. Client redirects to Nomad's hosted payment page
8. User pays on Nomad's page
9. Nomad POSTs webhook to `/api/nomad-webhook`
10. Server verifies HMAC-SHA256 signature
11. Server marks order as `payment_status='paid'` via service role
12. Server sends confirmation email via Resend

### Admin Operations
1. Admin navigates to `/admin/*`
2. Client checks `is_admin()` on profile (RLS-gated)
3. Admin pages load with service-role-powered RPCs
4. CRUD operations go through Supabase client with admin RLS policies

## White-Label System

The entire site rebrands through two mechanisms:

1. **Environment Variables** (`PUBLIC_*`): Store name, URL, payment mode
2. **Database** (`store_settings` singleton row): Logo, colors, favicon, meta, socials, shipping, tax

`settings.js` loads the singleton row at page load and applies:
- CSS custom properties (`--brand-primary`, `--brand-secondary`, `--brand-accent`)
- Logo/favicon src attributes
- Document title and meta tags
- Navbar and footer content
- `data-store` attribute bindings across all pages

## Design System

Built on CSS custom properties with dark/light mode:

- **Glassmorphism**: `backdrop-filter: blur()` + semi-transparent backgrounds
- **Color tokens**: `--brand-primary/secondary/accent` mapped to CSS vars
- **Typography**: Space Grotesk (display), Inter (body)
- **Spacing**: Consistent scale via rem units
- **Components**: Cards, buttons, badges, modals, toasts, tables, forms
- **Animations**: Scroll reveal (IntersectionObserver), transitions, hover effects

## Security Model

### Row Level Security (RLS)

Every table has RLS enabled with default-deny:

| Table | User Read | User Write | Admin | Service Role |
|-------|-----------|------------|-------|--------------|
| profiles | Own | Own | All | All |
| products | Active only | — | All | All |
| orders | Own | Own (limited) | All | All (webhook) |
| order_items | Own orders | Own orders | All | — |
| cart_items | Own | Own | All | — |
| wishlist | Own | Own | — | — |
| reviews | Approved | Own | All | — |
| payments | Own orders | — | All | Insert/Update |
| store_settings | Public read | — | All | Insert |

### Key Invariants

1. **No client can mark an order as paid** — only the webhook handler
2. **Order amounts are re-verified** server-side before creating Nomad payment
3. **Webhook signatures** verified with HMAC-SHA256 + timing-safe comparison
4. **All user input** escaped before HTML rendering
5. **Service role key** never reaches the browser

## Performance

- **Static files**: Served from Vercel's edge network globally
- **Lazy loading**: Images and components load on demand
- **Debounced search**: 350ms debounce on search inputs
- **Cached settings**: Store settings cached after first load
- **Skeleton loading**: Visual feedback during data fetches
- **Pagination**: 12 items per page on shop, 50 on admin
- **CDN**: Google Fonts, Supabase JS, all from CDN

## Extensibility

The architecture supports easy extension:

- **New product types**: Add fields to `products` table
- **New payment methods**: Add handlers in `api/_lib.js`
- **New admin pages**: Add HTML + JS in `admin/`
- **New email templates**: Add to `emails/` and use `renderTemplate()`
- **Custom analytics**: Add RPCs to `supabase/functions.sql`
- **Multi-language**: Add i18n layer to `js/config.js`
