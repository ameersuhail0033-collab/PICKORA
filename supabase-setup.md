# Supabase Setup Guide

## Create Project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click **New Project**
3. Choose organization, set project name, database password
4. Select a region closest to your users
5. Wait for project to initialize

## Get Your Keys

1. Go to **Settings** (gear icon) → **API**
2. Copy these values to your `.env`:
   - **Project URL** → `PUBLIC_SUPABASE_URL`
   - **publishable / anon** → `PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - **secret / service_role** → `SUPABASE_SECRET_KEY`

⚠️ The `service_role` key bypasses all RLS. **Never expose it to the browser.**

## Run SQL Migrations

Open the **SQL Editor** in Supabase Dashboard.

### 1. Schema (tables, indexes, triggers)

Copy the contents of `supabase/schema.sql` and run it. This creates:
- All tables (profiles, products, orders, etc.)
- Custom types (order_status, payment_status, etc.)
- Indexes (including GIN trigram on product names)
- Updated_at triggers
- Products view with security_invoker

### 2. Functions

Copy `supabase/functions.sql` and run it. This creates:
- `is_admin()` — checks admin role
- `handle_new_user()` — auto-creates profile on signup
- First-user-admin trigger on auth.users
- Search vector trigger for products
- Order number generator (`PKR-000001`)
- Rating recalculation trigger
- `validate_coupon()` RPC
- Stock decrement on paid order
- `admin_kpis`, `revenue_series`, `top_products` RPCs

### 3. Policies (RLS)

Copy `supabase/policies.sql` and run it. This creates:
- RLS enabled on all tables
- User policies (own cart, orders, wishlist, etc.)
- Admin policies (full access)
- Service role policies (webhook updates)
- Storage bucket policies

### 4. Seed Data

Copy `supabase/seed.sql` and run it. This creates:
- Default store settings
- 8 laptop categories
- 10 demo products
- Product images
- 5 coupon codes

## Auth Setup

### Email/Password (Default)
No setup needed. Users can register and sign in immediately.

### Google OAuth
1. Go to **Authentication** → **Providers** → **Google**
2. Enable the provider
3. Enter your Google Client ID and Secret
4. Add to Google Cloud Console authorized redirect URIs:
   ```
   https://your-project.supabase.co/auth/v1/callback
   ```

### Magic Link
Built-in. Users can sign in via email OTP.

## Storage Setup

### Create Buckets

Go to **Storage** and create:

1. **`store-assets`**
   - Public: Yes
   - For: logos, favicons, general store files

2. **`product-images`**
   - Public: Yes
   - For: product photos

3. **`avatars`**
   - Public: Yes
   - For: user profile pictures

### Bucket Policies

Policies are created by `supabase/policies.sql`:
- **store-assets**: Anyone can read, admins can write
- **product-images**: Anyone can read, admins can write
- **avatars**: Anyone can read, users can write to `avatars/<uid>/`

## RPC Functions

### Validate Coupon
```sql
SELECT * FROM validate_coupon('WELCOME10', 500.00);
-- Returns: { valid: true, discount_amount: 50.00, ... }
```

### Admin KPIs
```sql
SELECT * FROM admin_kpis('2024-01-01', '2024-12-31');
-- Returns: { total_revenue, total_orders, avg_order_value, ... }
```

### Revenue Series
```sql
SELECT * FROM revenue_series('2024-01-01', '2024-12-31', 'day');
-- Returns: [{ date, revenue, orders }, ...]
```

### Top Products
```sql
SELECT * FROM top_products(10, '2024-01-01', '2024-12-31');
-- Returns: [{ name, sales, revenue }, ...]
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Permission denied | Check RLS policies, ensure user is authenticated |
| First user not admin | Check trigger `on_auth_user_created` exists |
| Webhook can't update orders | Check service role policies on orders table |
| Storage upload fails | Check bucket policies and file type restrictions |
| Duplicate key error | Tables may already exist; use `IF NOT EXISTS` or drop first |
