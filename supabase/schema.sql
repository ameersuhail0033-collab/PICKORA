-- =============================================================
-- PICKORA STORE — Database Schema
-- Run this FIRST. Creates all tables, types, indexes, triggers.
-- =============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;

-- ── Custom Types ─────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE order_status AS ENUM ('pending','confirmed','processing','shipped','delivered','cancelled','refunded');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('pending','paid','failed','refunded','quarantined');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('customer','admin','super_admin');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE discount_type AS ENUM ('percentage','fixed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ── Updated At Trigger ───────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── Tables ───────────────────────────────────────────────────

-- profiles
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email CITEXT NOT NULL,
  full_name TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  role user_role DEFAULT 'customer',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- admin_users (super-admin management)
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- store_settings (singleton row)
CREATE TABLE IF NOT EXISTS store_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_name TEXT DEFAULT 'Pickora',
  company_name TEXT DEFAULT '',
  logo_url TEXT DEFAULT '',
  favicon_url TEXT DEFAULT '',
  primary_color TEXT DEFAULT '#8B5CF6',
  secondary_color TEXT DEFAULT '#261A66',
  accent_color TEXT DEFAULT '#84CC16',
  currency TEXT DEFAULT 'USD',
  support_email TEXT DEFAULT '',
  support_phone TEXT DEFAULT '',
  address TEXT DEFAULT '',
  city TEXT DEFAULT '',
  country TEXT DEFAULT '',
  website TEXT DEFAULT '',
  meta_description TEXT DEFAULT '',
  og_image_url TEXT DEFAULT '',
  social_facebook TEXT DEFAULT '',
  social_instagram TEXT DEFAULT '',
  social_twitter TEXT DEFAULT '',
  social_youtube TEXT DEFAULT '',
  social_tiktok TEXT DEFAULT '',
  maintenance_mode BOOLEAN DEFAULT false,
  tax_rate NUMERIC(5,2) DEFAULT 0,
  shipping_cost NUMERIC(10,2) DEFAULT 0,
  free_shipping_threshold NUMERIC(10,2) DEFAULT 0,
  currency_position TEXT DEFAULT 'before',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TRIGGER trg_store_settings_updated_at BEFORE UPDATE ON store_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- categories
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  image_url TEXT DEFAULT '',
  parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TRIGGER trg_categories_updated_at BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- products
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  short_description TEXT DEFAULT '',
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  brand TEXT DEFAULT '',
  sku TEXT DEFAULT '',
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  compare_at_price NUMERIC(10,2) DEFAULT 0,
  cost_price NUMERIC(10,2) DEFAULT 0,
  stock_quantity INT DEFAULT 0,
  track_inventory BOOLEAN DEFAULT true,
  weight NUMERIC(8,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  is_featured BOOLEAN DEFAULT false,
  is_digital BOOLEAN DEFAULT false,
  meta_title TEXT DEFAULT '',
  meta_description TEXT DEFAULT '',
  search_vector tsvector,
  avg_rating NUMERIC(3,2) DEFAULT 0,
  review_count INT DEFAULT 0,
  sales_count INT DEFAULT 0,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- product_images
CREATE TABLE IF NOT EXISTS product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  alt TEXT DEFAULT '',
  sort_order INT DEFAULT 0,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- product_variants
CREATE TABLE IF NOT EXISTS product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sku TEXT DEFAULT '',
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  compare_at_price NUMERIC(10,2) DEFAULT 0,
  stock_quantity INT DEFAULT 0,
  option1 TEXT DEFAULT '',
  option2 TEXT DEFAULT '',
  option3 TEXT DEFAULT '',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TRIGGER trg_product_variants_updated_at BEFORE UPDATE ON product_variants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- addresses
CREATE TABLE IF NOT EXISTS addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  label TEXT DEFAULT 'Home',
  full_name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  line1 TEXT NOT NULL,
  line2 TEXT DEFAULT '',
  city TEXT NOT NULL,
  state TEXT DEFAULT '',
  postal_code TEXT DEFAULT '',
  country TEXT NOT NULL DEFAULT 'US',
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TRIGGER trg_addresses_updated_at BEFORE UPDATE ON addresses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- cart_items
CREATE TABLE IF NOT EXISTS cart_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  session_id TEXT DEFAULT '',
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
  quantity INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TRIGGER trg_cart_items_updated_at BEFORE UPDATE ON cart_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- wishlist
CREATE TABLE IF NOT EXISTS wishlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, product_id)
);

-- orders
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  order_number TEXT NOT NULL UNIQUE,
  status order_status DEFAULT 'pending',
  payment_status payment_status DEFAULT 'pending',
  subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax NUMERIC(10,2) DEFAULT 0,
  shipping NUMERIC(10,2) DEFAULT 0,
  discount NUMERIC(10,2) DEFAULT 0,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  coupon_id UUID,
  nomad_order_id TEXT DEFAULT '',
  nomad_checkout_url TEXT DEFAULT '',
  shipping_name TEXT DEFAULT '',
  shipping_address TEXT DEFAULT '',
  shipping_city TEXT DEFAULT '',
  shipping_state TEXT DEFAULT '',
  shipping_postal TEXT DEFAULT '',
  shipping_country TEXT DEFAULT '',
  billing_name TEXT DEFAULT '',
  billing_address TEXT DEFAULT '',
  billing_city TEXT DEFAULT '',
  billing_state TEXT DEFAULT '',
  billing_postal TEXT DEFAULT '',
  billing_country TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  paid_at TIMESTAMPTZ,
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TRIGGER trg_orders_updated_at BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- order_items
CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  sku TEXT DEFAULT '',
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  quantity INT NOT NULL DEFAULT 1,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- payments
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  nomad_payment_id TEXT DEFAULT '',
  nomad_event_id TEXT DEFAULT '',
  method TEXT DEFAULT 'nomad',
  amount NUMERIC(10,2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  status payment_status DEFAULT 'pending',
  raw_response JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_event_id ON payments(nomad_event_id) WHERE nomad_event_id != '';
CREATE TRIGGER trg_payments_updated_at BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- reviews
CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title TEXT DEFAULT '',
  body TEXT DEFAULT '',
  is_approved BOOLEAN DEFAULT false,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, product_id)
);
CREATE TRIGGER trg_reviews_updated_at BEFORE UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- coupons
CREATE TABLE IF NOT EXISTS coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  discount_type discount_type DEFAULT 'percentage',
  discount_value NUMERIC(10,2) NOT NULL DEFAULT 0,
  min_order NUMERIC(10,2) DEFAULT 0,
  max_uses INT DEFAULT 0,
  used_count INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TRIGGER trg_coupons_updated_at BEFORE UPDATE ON coupons
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Indexes ──────────────────────────────────────────────────

-- Product search (GIN trigram on name)
CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON products USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_search_vector ON products USING gin(search_vector);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand);
CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_products_featured ON products(is_featured) WHERE is_featured = true;
CREATE INDEX IF NOT EXISTS idx_products_price ON products(price);
CREATE INDEX IF NOT EXISTS idx_products_deleted ON products(deleted_at) WHERE deleted_at IS NULL;

-- Categories
CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_active ON categories(is_active) WHERE is_active = true;

-- Orders
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);

-- Order items
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- Cart
CREATE INDEX IF NOT EXISTS idx_cart_user ON cart_items(user_id);
CREATE INDEX IF NOT EXISTS idx_cart_session ON cart_items(session_id);

-- Wishlist
CREATE INDEX IF NOT EXISTS idx_wishlist_user ON wishlist(user_id);

-- Reviews
CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user ON reviews(user_id);

-- Payments
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);

-- Addresses
CREATE INDEX IF NOT EXISTS idx_addresses_user ON addresses(user_id);

-- Profiles
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

-- Product images
CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images(product_id);

-- Product variants
CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants(product_id);

-- Coupons
CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);

-- ── Products View (security_invoker) ─────────────────────────
CREATE OR REPLACE VIEW products_view
WITH (security_invoker = true)
AS
SELECT
  p.id, p.name, p.slug, p.description, p.short_description,
  p.category_id, p.brand, p.sku, p.price, p.compare_at_price,
  p.stock_quantity, p.track_inventory, p.weight,
  p.is_active, p.is_featured, p.is_digital,
  p.meta_title, p.meta_description,
  p.avg_rating, p.review_count, p.sales_count,
  p.created_at, p.updated_at,
  c.name AS category_name, c.slug AS category_slug
FROM products p
LEFT JOIN categories c ON c.id = p.category_id
WHERE p.is_active = true AND p.deleted_at IS NULL;
