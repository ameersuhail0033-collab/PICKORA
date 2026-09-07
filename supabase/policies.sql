-- =============================================================
-- PICKORA STORE — Row Level Security Policies
-- Run AFTER functions.sql
-- =============================================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE wishlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- ── profiles ─────────────────────────────────────────────────
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT USING (id = auth.uid());

-- SECURITY: customers may update their own profile but NEVER the role column
-- (self-promotion is a critical vulnerability). Role changes go through the
-- admin_set_user_role() RPC or the service role.
CREATE POLICY "Users can update own profile (not role)"
  ON profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = (SELECT role FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT USING (is_admin());

-- Admins may edit other profiles' data, but changing their OWN role is
-- reserved for the service role / admin_set_user_role() RPC.
CREATE POLICY "Admins can update all profiles (not own role)"
  ON profiles FOR UPDATE
  USING (is_admin())
  WITH CHECK (
    is_admin()
    AND (id <> auth.uid()
         OR role = (SELECT role FROM profiles WHERE id = auth.uid()))
  );

CREATE POLICY "Insert own profile on signup"
  ON profiles FOR INSERT WITH CHECK (id = auth.uid());

-- ── store_settings ───────────────────────────────────────────
CREATE POLICY "Anyone can read store_settings"
  ON store_settings FOR SELECT USING (true);

CREATE POLICY "Admins can insert store_settings"
  ON store_settings FOR INSERT WITH CHECK (is_admin());

CREATE POLICY "Admins can update store_settings"
  ON store_settings FOR UPDATE USING (is_admin());

-- ── categories ───────────────────────────────────────────────
CREATE POLICY "Anyone can read active categories"
  ON categories FOR SELECT USING (is_active = true AND deleted_at IS NULL);

CREATE POLICY "Admins can manage categories"
  ON categories FOR ALL USING (is_admin());

-- ── products ─────────────────────────────────────────────────
CREATE POLICY "Anyone can read active products"
  ON products FOR SELECT USING (is_active = true AND deleted_at IS NULL);

CREATE POLICY "Admins can manage products"
  ON products FOR ALL USING (is_admin());

-- ── product_images ───────────────────────────────────────────
CREATE POLICY "Anyone can read product images"
  ON product_images FOR SELECT USING (true);

CREATE POLICY "Admins can manage product images"
  ON product_images FOR ALL USING (is_admin());

-- ── product_variants ─────────────────────────────────────────
CREATE POLICY "Anyone can read active variants"
  ON product_variants FOR SELECT USING (is_active = true);

CREATE POLICY "Admins can manage variants"
  ON product_variants FOR ALL USING (is_admin());

-- ── addresses ────────────────────────────────────────────────
CREATE POLICY "Users can view own addresses"
  ON addresses FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own addresses"
  ON addresses FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own addresses"
  ON addresses FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete own addresses"
  ON addresses FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "Admins can view all addresses"
  ON addresses FOR SELECT USING (is_admin());

-- ── cart_items ───────────────────────────────────────────────
CREATE POLICY "Users can view own cart"
  ON cart_items FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can manage own cart"
  ON cart_items FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Admins can view all carts"
  ON cart_items FOR SELECT USING (is_admin());

-- ── wishlist ─────────────────────────────────────────────────
CREATE POLICY "Users can view own wishlist"
  ON wishlist FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can add to own wishlist"
  ON wishlist FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can remove from own wishlist"
  ON wishlist FOR DELETE USING (user_id = auth.uid());

-- ── orders ───────────────────────────────────────────────────
CREATE POLICY "Users can view own orders"
  ON orders FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create own orders"
  ON orders FOR INSERT WITH CHECK (user_id = auth.uid());

-- SECURITY: customers can update operational fields on their own orders but
-- NEVER payment_status / totals — those change only via the verified server-side
-- Nomod webhook flow (service role). Column-level protection is enforced by the
-- trg_protect_order_payment_fields trigger (see functions.sql).
CREATE POLICY "Users can update own orders (no payment fields)"
  ON orders FOR UPDATE
  USING (user_id = auth.uid() AND payment_status <> 'paid')
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can manage all orders"
  ON orders FOR ALL USING (is_admin());

-- NOTE: The Supabase service_role key bypasses RLS entirely.
-- No explicit service role policy is needed for webhook updates.
-- The webhook handler uses the service_role client which has full access.

-- ── order_items ──────────────────────────────────────────────
CREATE POLICY "Users can view own order items"
  ON order_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM orders WHERE orders.id = order_items.order_id
    AND orders.user_id = auth.uid()
  ));

CREATE POLICY "Users can create order items for own orders"
  ON order_items FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM orders WHERE orders.id = order_items.order_id
    AND orders.user_id = auth.uid()
  ));

CREATE POLICY "Admins can manage all order items"
  ON order_items FOR ALL USING (is_admin());

-- ── reviews ──────────────────────────────────────────────────
CREATE POLICY "Anyone can read approved reviews"
  ON reviews FOR SELECT USING (is_approved = true AND deleted_at IS NULL);

CREATE POLICY "Users can view own reviews"
  ON reviews FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create reviews"
  ON reviews FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own reviews"
  ON reviews FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete own reviews"
  ON reviews FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all reviews"
  ON reviews FOR ALL USING (is_admin());

-- ── coupons ──────────────────────────────────────────────────
CREATE POLICY "Anyone can validate coupons"
  ON coupons FOR SELECT USING (is_active = true);

CREATE POLICY "Admins can manage coupons"
  ON coupons FOR ALL USING (is_admin());

-- ── payments ─────────────────────────────────────────────────
CREATE POLICY "Users can view own payments"
  ON payments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM orders WHERE orders.id = payments.order_id
    AND orders.user_id = auth.uid()
  ));

CREATE POLICY "Admins can manage all payments"
  ON payments FOR ALL USING (is_admin());

-- NOTE: The Supabase service_role key bypasses RLS entirely.
-- No explicit service role policies are needed for payment updates.
-- The webhook handler uses the service_role client which has full access.

-- ── admin_users ──────────────────────────────────────────────
CREATE POLICY "Admins can manage admin_users"
  ON admin_users FOR ALL USING (is_admin());

-- ── Storage Policies ─────────────────────────────────────────
-- store-assets bucket (logos, favicons, general store files)
CREATE POLICY "Anyone can read store assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'store-assets');

CREATE POLICY "Admins can upload store assets"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'store-assets'
    AND is_admin()
    AND (storage.extension(name) IN ('png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico'))
  );

CREATE POLICY "Admins can delete store assets"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'store-assets' AND is_admin());

-- product-images bucket
CREATE POLICY "Anyone can read product images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-images');

CREATE POLICY "Admins can upload product images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'product-images'
    AND is_admin()
    AND (storage.extension(name) IN ('png', 'jpg', 'jpeg', 'gif', 'webp', 'avif'))
  );

CREATE POLICY "Admins can delete product images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'product-images' AND is_admin());

-- avatars bucket
CREATE POLICY "Anyone can read avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.extension(name) IN ('png', 'jpg', 'jpeg', 'gif', 'webp'))
    AND (name LIKE auth.uid() || '/%')
  );

CREATE POLICY "Users can update own avatar"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND (name LIKE auth.uid() || '/%')
  );

CREATE POLICY "Users can delete own avatar"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND (name LIKE auth.uid() || '/%')
  );
