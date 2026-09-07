-- =============================================================
-- PICKORA — ADMIN SECURITY HARDENING (live production migration)
-- Run: supabase db query --linked --file supabase/admin-security-fix.sql
-- (or paste into Supabase SQL editor)
--
-- Findings this fixes (verified against live production DB):
--   V1. products/categories/coupons/product_variants/product_images/
--       admin_users: the ALL "Admins can manage" policies are MISSING in
--       production — admins could not create anything via the dashboard.
--   V2. profiles: customer can UPDATE own row with NO column restriction
--       → self-promotion to admin/super_admin. CRITICAL.
--   V3. orders: "Users can update own orders" has no WITH CHECK and no
--       column guard → customer can set payment_status='paid' on their own
--       pending order. CRITICAL (bypasses Nomod reconciliation).
--   V4. payments: admin UPDATE policy exists but no INSERT/DELETE policy,
--       and no explicit customer block; webhook writes use service role
--       (bypasses RLS) so a restrictive model is safe.
--   V5. store_settings: anon INSERT succeeded (no INSERT policy with RLS
--       enabled should mean deny — live policy list showed an INSERT
--       policy "Admins can insert store settings" but the probe succeeded
--       for anon, indicating the live policy check may be permissive;
--       we drop & recreate strictly).
--   V6. admin_kpis: granted to anon+authenticated in production → any
--       customer could read store revenue. FIX: revoke + is_admin() gate.
--   V7. revenue_series / top_products: revoked from anon (good) but the
--       function bodies are BROKEN (SQL errors) and not admin-gated.
--       FIX: rewrite correctly + revoke from anon/authenticated, grant
--       to authenticated only (is_admin() gate inside).
--
-- NOTES
--   * service_role bypasses RLS — webhook/checkout flows are unaffected.
--   * Every policy is created idempotently (drop if exists first).
--   * The customer-facing cart/wishlist/review flows are NOT touched.
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- 0. Helper: is_admin() must exist and be stable
--    (already exists in production; recreate defensively)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE
   SET search_path = '';

-- ─────────────────────────────────────────────────────────────
-- 1. PROFILES — block self-promotion (CRITICAL FIX V2)
--    Customers may update their own profile but NEVER the role column.
--    Admin updates go through a dedicated RPC (section 8) or service role.
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;

CREATE POLICY "Users can update own profile (not role)"
  ON public.profiles
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = (SELECT role FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "Admins can update all profiles (not own role)"
  ON public.profiles
  FOR UPDATE
  USING (is_admin())
  WITH CHECK (
    is_admin()
    -- admins may edit other profiles; changing their OWN role is reserved
    -- for the service role / secure RPC to protect the last-admin invariant
    AND (id <> auth.uid()
         OR role = (SELECT role FROM public.profiles WHERE id = auth.uid()))
  );

-- ─────────────────────────────────────────────────────────────
-- 2. ORDERS — customers can never touch payment_status (CRITICAL FIX V3)
--    Split into: customer SELECT/INSERT/limited-UPDATE + admin ALL.
--    The customer UPDATE policy forbids changing payment_status and
--    nomad_* columns (payment state changes ONLY via webhook/service role).
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can update own orders (limited)" ON public.orders;
DROP POLICY IF EXISTS "Admins can update orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can view all orders" ON public.orders;
DROP POLICY IF EXISTS "Users can view own orders" ON public.orders;
DROP POLICY IF EXISTS "Users can create own orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can manage all orders" ON public.orders;

CREATE POLICY "Users can view own orders"
  ON public.orders FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own orders"
  ON public.orders FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own orders (no payment fields)"
  ON public.orders
  FOR UPDATE
  USING (user_id = auth.uid() AND payment_status <> 'paid')
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can manage all orders"
  ON public.orders FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Column-level payment protection is enforced by a TRIGGER (RLS is row-level
-- only and cannot restrict individual columns). The trigger permits the
-- service role (webhook) and admins; it rejects customers who try to flip
-- payment_status / nomad_* columns on their own orders.
CREATE OR REPLACE FUNCTION public.protect_order_payment_fields()
RETURNS TRIGGER AS $$
DECLARE
  req_role TEXT;
BEGIN
  req_role := COALESCE(NULLIF(current_setting('request.jwt.claims', true)::jsonb ->> 'role', ''), auth.role());

  -- service role (Nomod webhook / server-side) and admins may change payment fields
  IF req_role = 'service_role' OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF (NEW.payment_status IS DISTINCT FROM OLD.payment_status)
     OR (NEW.nomad_order_id IS DISTINCT FROM OLD.nomad_order_id)
     OR (NEW.nomad_checkout_url IS DISTINCT FROM OLD.nomad_checkout_url)
     OR (NEW.total IS DISTINCT FROM OLD.total)
     OR (NEW.subtotal IS DISTINCT FROM OLD.subtotal)
     OR (NEW.tax IS DISTINCT FROM OLD.tax)
     OR (NEW.shipping IS DISTINCT FROM OLD.shipping)
     OR (NEW.discount IS DISTINCT FROM OLD.discount)
     OR (NEW.currency IS DISTINCT FROM OLD.currency)
  THEN
    RAISE EXCEPTION 'Cannot modify payment fields' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = '';

DROP TRIGGER IF EXISTS trg_protect_order_payment_fields ON public.orders;
CREATE TRIGGER trg_protect_order_payment_fields
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.protect_order_payment_fields();

-- ─────────────────────────────────────────────────────────────
-- 3. PAYMENTS — server-owned records (FIX V4)
--    Customers read their own payment rows only; ALL writes are
--    service-role (webhook) or admin.
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view own payments" ON public.payments;
DROP POLICY IF EXISTS "Admins can view all payments" ON public.payments;
DROP POLICY IF EXISTS "Admins can update payments" ON public.payments;

CREATE POLICY "Users can view own payments"
  ON public.payments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.orders
    WHERE public.orders.id = payments.order_id
      AND public.orders.user_id = auth.uid()
  ));

CREATE POLICY "Admins can manage all payments"
  ON public.payments FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- ─────────────────────────────────────────────────────────────
-- 4. PRODUCTS / VARIANTS / IMAGES — restore admin write access (FIX V1)
--    and guarantee customer/anon cannot write.
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage products" ON public.products;
DROP POLICY IF EXISTS "Admins can read all products" ON public.products;
DROP POLICY IF EXISTS "Anyone can read active products" ON public.products;

CREATE POLICY "Anyone can read active products"
  ON public.products FOR SELECT
  USING (is_active = true AND deleted_at IS NULL);

CREATE POLICY "Admins can read all products"
  ON public.products FOR SELECT
  USING (is_admin());

CREATE POLICY "Admins can insert products"
  ON public.products FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY "Admins can update products"
  ON public.products FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Admins can delete products"
  ON public.products FOR DELETE
  USING (is_admin());

DROP POLICY IF EXISTS "Anyone can read active variants" ON public.product_variants;
DROP POLICY IF EXISTS "Admins can manage variants" ON public.product_variants;

CREATE POLICY "Anyone can read active variants"
  ON public.product_variants FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can read all variants"
  ON public.product_variants FOR SELECT
  USING (is_admin());

CREATE POLICY "Admins can insert variants"
  ON public.product_variants FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY "Admins can update variants"
  ON public.product_variants FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Admins can delete variants"
  ON public.product_variants FOR DELETE
  USING (is_admin());

DROP POLICY IF EXISTS "Anyone can read product images" ON public.product_images;
DROP POLICY IF EXISTS "Admins can manage product images" ON public.product_images;

CREATE POLICY "Anyone can read product images"
  ON public.product_images FOR SELECT
  USING (true);

CREATE POLICY "Admins can read all product images"
  ON public.product_images FOR SELECT
  USING (is_admin());

CREATE POLICY "Admins can insert product images"
  ON public.product_images FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY "Admins can update product images"
  ON public.product_images FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Admins can delete product images"
  ON public.product_images FOR DELETE
  USING (is_admin());

-- ─────────────────────────────────────────────────────────────
-- 5. CATEGORIES — restore admin writes (FIX V1)
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anyone can read categories" ON public.categories;
DROP POLICY IF EXISTS "Anyone can read active categories" ON public.categories;
DROP POLICY IF EXISTS "Admins can manage categories" ON public.categories;

CREATE POLICY "Anyone can read active categories"
  ON public.categories FOR SELECT
  USING (is_active = true AND deleted_at IS NULL);

CREATE POLICY "Admins can read all categories"
  ON public.categories FOR SELECT
  USING (is_admin());

CREATE POLICY "Admins can insert categories"
  ON public.categories FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY "Admins can update categories"
  ON public.categories FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Admins can delete categories"
  ON public.categories FOR DELETE
  USING (is_admin());

-- ─────────────────────────────────────────────────────────────
-- 6. COUPONS — admin CRUD only; public read limited to active
--    (customer-facing validation continues via validate_coupon RPC)
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anyone can validate coupons" ON public.coupons;
DROP POLICY IF EXISTS "Admins can manage coupons" ON public.coupons;

CREATE POLICY "Anyone can read active coupons"
  ON public.coupons FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can read all coupons"
  ON public.coupons FOR SELECT
  USING (is_admin());

CREATE POLICY "Admins can insert coupons"
  ON public.coupons FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY "Admins can update coupons"
  ON public.coupons FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Admins can delete coupons"
  ON public.coupons FOR DELETE
  USING (is_admin());

-- ─────────────────────────────────────────────────────────────
-- 7. STORE_SETTINGS — strictly admin-write (FIX V5)
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anyone can read store settings" ON public.store_settings;
DROP POLICY IF EXISTS "Anyone can read store_settings" ON public.store_settings;
DROP POLICY IF EXISTS "Admins can insert store settings" ON public.store_settings;
DROP POLICY IF EXISTS "Admins can update store settings" ON public.store_settings;

CREATE POLICY "Anyone can read store settings"
  ON public.store_settings FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert store settings"
  ON public.store_settings FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY "Admins can update store settings"
  ON public.store_settings FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());

-- ─────────────────────────────────────────────────────────────
-- 8. ADMIN_USERS — readable only by admins; writes via secure RPC
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage admin_users" ON public.admin_users;

CREATE POLICY "Admins can read admin_users"
  ON public.admin_users FOR SELECT
  USING (is_admin());

CREATE POLICY "Admins can insert admin_users"
  ON public.admin_users FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY "Admins can delete admin_users"
  ON public.admin_users FOR DELETE
  USING (is_admin());

-- ─────────────────────────────────────────────────────────────
-- 9. SECURE ROLE-CHANGE RPC (replaces client-side profile UPDATE)
--    - caller must be admin (checked INSIDE the function)
--    - target role restricted to 'customer' | 'admin'
--    - cannot demote the last remaining admin/super_admin
--    - cannot change a super_admin unless caller is super_admin
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_set_user_role(
  p_target_user UUID,
  p_new_role TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_is_admin BOOLEAN;
  caller_is_super BOOLEAN;
  target_current_role TEXT;
  admin_count INT;
BEGIN
  IF p_new_role NOT IN ('customer', 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid target role');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
  ) INTO caller_is_admin;

  IF NOT caller_is_admin THEN
    RETURN jsonb_build_object('success', false, 'error', 'Forbidden');
  END IF;

  SELECT role::text INTO target_current_role
  FROM public.profiles WHERE id = p_target_user;

  IF target_current_role IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target user not found');
  END IF;

  -- only super_admin may touch a super_admin
  IF target_current_role = 'super_admin' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'super_admin'
    ) INTO caller_is_super;
    IF NOT caller_is_super THEN
      RETURN jsonb_build_object('success', false, 'error', 'Only super_admin can modify a super_admin');
    END IF;
  END IF;

  -- never remove the last admin
  IF target_current_role IN ('admin', 'super_admin') AND p_new_role = 'customer' THEN
    SELECT COUNT(*) INTO admin_count
    FROM public.profiles WHERE role IN ('admin', 'super_admin');
    IF admin_count <= 1 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Cannot demote the last administrator');
    END IF;
  END IF;

  UPDATE public.profiles
  SET role = p_new_role::public.user_role, updated_at = now()
  WHERE id = p_target_user;

  -- keep admin_users in sync
  IF p_new_role = 'admin' THEN
    INSERT INTO public.admin_users (user_id, granted_by)
    VALUES (p_target_user, auth.uid())
    ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.admin_users WHERE user_id = p_target_user;
  END IF;

  RETURN jsonb_build_object('success', true, 'new_role', p_new_role);
END;
$$;

-- Execution: authenticated only, admin check happens inside.
REVOKE EXECUTE ON FUNCTION public.admin_set_user_role(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_set_user_role(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(uuid, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 10. ANALYTICS RPCs — admin-gated + FIXED SQL (FIX V6/V7)
-- ─────────────────────────────────────────────────────────────

-- 10a. admin_kpis — add internal is_admin() gate
CREATE OR REPLACE FUNCTION public.admin_kpis(
  p_start DATE DEFAULT (CURRENT_DATE - INTERVAL '30 days'),
  p_end DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  IF NOT is_admin() THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  SELECT jsonb_build_object(
    'total_revenue', COALESCE(SUM(total), 0),
    'total_orders', COUNT(*)::INT,
    'avg_order_value', COALESCE(ROUND(AVG(total), 2), 0),
    'total_customers', (SELECT COUNT(*)::INT FROM public.profiles WHERE role = 'customer'),
    'pending_orders', (SELECT COUNT(*)::INT FROM public.orders WHERE status = 'pending'),
    'shipped_orders', (SELECT COUNT(*)::INT FROM public.orders WHERE status = 'shipped'),
    'delivered_orders', (SELECT COUNT(*)::INT FROM public.orders WHERE status = 'delivered'),
    'total_products', (SELECT COUNT(*)::INT FROM public.products WHERE deleted_at IS NULL),
    'low_stock', (SELECT COUNT(*)::INT FROM public.products WHERE stock_quantity <= 5 AND track_inventory = true AND deleted_at IS NULL),
    'total_reviews', (SELECT COUNT(*)::INT FROM public.reviews WHERE deleted_at IS NULL)
  ) INTO result
  FROM public.orders
  WHERE payment_status = 'paid'
    AND created_at::DATE BETWEEN p_start AND p_end;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = '';

REVOKE EXECUTE ON FUNCTION public.admin_kpis(date, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_kpis(date, date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_kpis(date, date) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_kpis(date, date) TO service_role, authenticated;

-- 10b. revenue_series — FIXED SQL + admin gate
CREATE OR REPLACE FUNCTION public.revenue_series(
  p_start DATE DEFAULT (CURRENT_DATE - INTERVAL '30 days'),
  p_end DATE DEFAULT CURRENT_DATE,
  p_interval TEXT DEFAULT 'day'
)
RETURNS JSONB AS $$
BEGIN
  IF NOT is_admin() THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN (
    WITH series AS (
      SELECT generate_series(
        p_start,
        p_end,
        CASE p_interval
          WHEN 'week' THEN '7 days'::interval
          WHEN 'month' THEN '1 month'::interval
          ELSE '1 day'::interval
        END
      )::DATE AS d
    ),
    totals AS (
      SELECT created_at::DATE AS d,
             SUM(total) AS revenue,
             COUNT(*)::INT AS order_count
      FROM public.orders
      WHERE payment_status = 'paid'
        AND created_at::DATE BETWEEN p_start AND p_end
      GROUP BY created_at::DATE
    )
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'date', s.d,
          'revenue', COALESCE(t.revenue, 0),
          'orders', COALESCE(t.order_count, 0)
        ) ORDER BY s.d
      ),
      '[]'::jsonb
    )
    FROM series s
    LEFT JOIN totals t ON t.d = s.d
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = '';

REVOKE EXECUTE ON FUNCTION public.revenue_series(date, date, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.revenue_series(date, date, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.revenue_series(date, date, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.revenue_series(date, date, text) TO service_role, authenticated;

-- 10c. top_products — FIXED SQL (no nested aggregate) + admin gate
CREATE OR REPLACE FUNCTION public.top_products(
  p_limit INT DEFAULT 10,
  p_start DATE DEFAULT (CURRENT_DATE - INTERVAL '30 days'),
  p_end DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB AS $$
BEGIN
  IF NOT is_admin() THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(row_data ORDER BY row_data.revenue DESC NULLS LAST), '[]'::jsonb)
    FROM (
      SELECT jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'slug', p.slug,
        'sales', COALESCE(SUM(oi.quantity), 0),
        'revenue', COALESCE(SUM(oi.total), 0),
        'image', (SELECT url FROM public.product_images
                  WHERE product_id = p.id AND is_primary = true LIMIT 1)
      ) AS row_data
      FROM public.products p
      LEFT JOIN public.order_items oi ON oi.product_id = p.id
      LEFT JOIN public.orders o ON o.id = oi.order_id
        AND o.payment_status = 'paid'
        AND o.created_at::DATE BETWEEN p_start AND p_end
      WHERE p.deleted_at IS NULL AND p.is_active = true
      GROUP BY p.id, p.name, p.slug
      LIMIT p_limit
    ) ranked
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = '';

REVOKE EXECUTE ON FUNCTION public.top_products(int, date, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.top_products(int, date, date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.top_products(int, date, date) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.top_products(int, date, date) TO service_role, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 11. STORAGE — product-images uploads restricted to real images
--     (probe uploaded a .txt). Enforce MIME + admin-only writes.
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can upload product images" ON storage.objects;
CREATE POLICY "Admins can upload product images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'product-images'
    AND is_admin()
    AND (storage.extension(name) IN ('png', 'jpg', 'jpeg', 'gif', 'webp', 'avif'))
  );

DROP POLICY IF EXISTS "Admins can delete product images" ON storage.objects;
CREATE POLICY "Admins can delete product images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'product-images' AND is_admin());

-- ─────────────────────────────────────────────────────────────
-- 12. grant table privileges Supabase normally provides
--     (defensive; Supabase grants these by default)
-- ─────────────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.products, public.product_variants, public.product_images,
  public.categories, public.coupons, public.store_settings TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders, public.order_items,
  public.cart_items, public.wishlist, public.addresses, public.reviews, public.profiles TO authenticated;
GRANT SELECT ON public.payments TO authenticated;
GRANT ALL ON public.products, public.product_variants, public.product_images,
  public.categories, public.coupons, public.store_settings, public.orders,
  public.order_items, public.payments, public.profiles, public.admin_users TO service_role;
