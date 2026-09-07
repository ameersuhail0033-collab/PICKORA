-- =============================================================
-- PICKORA — PRODUCTION ADMIN SECURITY FIX (CORRECTED v2)
-- =============================================================
-- This migration patches security vulnerabilities in the live
-- production database (kqqwsyhg...).
--
-- CORRECTIONS FROM v1:
--   1. protect_order_payment_fields() — ONLY service_role bypasses,
--      NOT browser admins (admins manage via RLS, not payment fields)
--   2. revenue_series — supports day/week/month bucketing
--   3. top_products — includes date filter parameter
--   4. Avatars storage — all DROP statements present
--   5. All DROP/CREATE pairs verified
--
-- RULES:
--   - Idempotent where practical (uses IF NOT EXISTS / OR REPLACE)
--   - NO destructive table drops
--   - NO data truncation
--   - NO auth.users deletion
--   - NO product/order/payment deletion
--   - Safe to run against existing production
--
-- BEFORE RUNNING:
--   1. Open Supabase Dashboard → SQL Editor
--   2. Select the CORRECT project (kqqwsyhg...)
--   3. Paste this entire file
--   4. Review each section
--   5. Execute
--   6. Run the verification queries at the bottom
-- =============================================================


-- =============================================================
-- 1. FUNCTION HARDENING
-- =============================================================

-- 1a. is_admin() — SECURITY DEFINER with fixed search_path
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  _uid uuid;
  _role text;
BEGIN
  _uid := auth.uid();
  IF _uid IS NULL THEN
    RETURN false;
  END IF;

  -- Check admin_users table first (fast path)
  IF EXISTS (
    SELECT 1 FROM public.admin_users AS au
    WHERE au.user_id = _uid
  ) THEN
    RETURN true;
  END IF;

  -- Fallback to profiles.role
  SELECT p.role INTO _role
  FROM public.profiles AS p
  WHERE p.id = _uid;

  RETURN _role IN ('admin', 'super_admin');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;


-- 1b. admin_set_user_role() — secure role management RPC
-- PARAMETER NAMES MUST MATCH FRONTEND: p_target_user, p_new_role
CREATE OR REPLACE FUNCTION public.admin_set_user_role(
  p_target_user uuid,
  p_new_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller_id uuid;
  _valid_roles text[] := ARRAY['customer', 'admin', 'super_admin'];
BEGIN
  _caller_id := auth.uid();

  IF _caller_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'Not authorized');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_target_user) THEN
    RETURN jsonb_build_object('error', 'Target user not found');
  END IF;

  IF p_new_role != ALL(_valid_roles) THEN
    RETURN jsonb_build_object('error', 'Invalid role: ' || p_new_role);
  END IF;

  -- Prevent removing the last super_admin
  IF p_new_role != 'super_admin' THEN
    IF (
      SELECT count(*) FROM public.profiles
      WHERE role = 'super_admin' AND id != p_target_user
    ) = 0 THEN
      RETURN jsonb_build_object('error', 'Cannot remove the last super_admin');
    END IF;
  END IF;

  UPDATE public.profiles
  SET role = p_new_role, updated_at = now()
  WHERE id = p_target_user;

  RETURN jsonb_build_object('success', true, 'user_id', p_target_user, 'new_role', p_new_role);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_user_role(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_set_user_role(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(uuid, text) TO authenticated;


-- 1c. protect_order_payment_fields() — trigger to block payment escalation
-- CORRECTED: ONLY service_role bypasses. Admins do NOT bypass this trigger.
-- Admins manage fulfillment status through orders_admin_update policy,
-- but they cannot directly set payment_status='paid' via browser UPDATE.
-- Payment status transitions MUST go through the Nomod webhook (service_role).
CREATE OR REPLACE FUNCTION public.protect_order_payment_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- ONLY service_role (Nomod webhook) can modify payment fields
  -- This is the ONLY bypass — not even admins can set payment_status directly
  IF current_setting('role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Block payment_status changes (except service_role above)
  IF OLD.payment_status IS DISTINCT FROM NEW.payment_status THEN
    RAISE EXCEPTION 'Payment status cannot be modified directly. Use the Nomod webhook.';
  END IF;

  -- Block paid_at changes
  IF OLD.paid_at IS DISTINCT FROM NEW.paid_at THEN
    RAISE EXCEPTION 'Paid timestamp cannot be modified directly.';
  END IF;

  -- Block nomod order id changes
  IF OLD.nomad_order_id IS DISTINCT FROM NEW.nomad_order_id THEN
    RAISE EXCEPTION 'Nomod order ID cannot be modified directly.';
  END IF;

  -- Block nomad checkout url changes
  IF OLD.nomad_checkout_url IS DISTINCT FROM NEW.nomad_checkout_url THEN
    RAISE EXCEPTION 'Nomod checkout URL cannot be modified directly.';
  END IF;

  -- Block total/subtotal/tax/shipping/discount changes
  IF OLD.total IS DISTINCT FROM NEW.total
     OR OLD.subtotal IS DISTINCT FROM NEW.subtotal
     OR OLD.tax IS DISTINCT FROM NEW.tax
     OR OLD.shipping IS DISTINCT FROM NEW.shipping
     OR OLD.discount IS DISTINCT FROM NEW.discount THEN
    RAISE EXCEPTION 'Order totals cannot be modified directly.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_order_payment ON public.orders;
CREATE TRIGGER trg_protect_order_payment
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_order_payment_fields();


-- =============================================================
-- 2. ROLE / PROFILE POLICIES
-- =============================================================

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_self_update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_self_update_safe" ON public.profiles;

CREATE POLICY "profiles_self_update_safe" ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Admins can manage profiles" ON public.profiles;
DROP POLICY IF EXISTS "admin_manage_profiles" ON public.profiles;
CREATE POLICY "admin_manage_profiles" ON public.profiles
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Public can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "profiles_public_read" ON public.profiles;
CREATE POLICY "profiles_public_read" ON public.profiles
  FOR SELECT
  USING (true);

-- CRITICAL: Revoke direct role column UPDATE from authenticated/anon
REVOKE UPDATE (role) ON public.profiles FROM authenticated;
REVOKE UPDATE (role) ON public.profiles FROM anon;


-- =============================================================
-- 3. STORE_SETTINGS POLICIES
-- =============================================================

DROP POLICY IF EXISTS "Anyone can read store settings" ON public.store_settings;
DROP POLICY IF EXISTS "Authenticated can manage settings" ON public.store_settings;
DROP POLICY IF EXISTS "store_settings_public_read" ON public.store_settings;
DROP POLICY IF EXISTS "store_settings_admin_write" ON public.store_settings;
DROP POLICY IF EXISTS "store_settings_insert" ON public.store_settings;
DROP POLICY IF EXISTS "store_settings_update" ON public.store_settings;
DROP POLICY IF EXISTS "store_settings_delete" ON public.store_settings;
DROP POLICY IF EXISTS "store_settings_admin_all" ON public.store_settings;

CREATE POLICY "store_settings_public_read" ON public.store_settings
  FOR SELECT
  USING (true);

CREATE POLICY "store_settings_admin_all" ON public.store_settings
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());


-- =============================================================
-- 4. PRODUCTS POLICIES
-- =============================================================

DROP POLICY IF EXISTS "Public can view active products" ON public.products;
DROP POLICY IF EXISTS "Authenticated can manage products" ON public.products;
DROP POLICY IF EXISTS "Admins can manage products" ON public.products;
DROP POLICY IF EXISTS "products_select_public" ON public.products;
DROP POLICY IF EXISTS "products_insert_admin" ON public.products;
DROP POLICY IF EXISTS "products_update_admin" ON public.products;
DROP POLICY IF EXISTS "products_delete_admin" ON public.products;
DROP POLICY IF EXISTS "products_admin_all" ON public.products;
DROP POLICY IF EXISTS "products_admin_insert" ON public.products;
DROP POLICY IF EXISTS "products_admin_update" ON public.products;
DROP POLICY IF EXISTS "products_admin_delete" ON public.products;

CREATE POLICY "products_select_public" ON public.products
  FOR SELECT
  USING (
    is_active = true
    AND deleted_at IS NULL
  );

CREATE POLICY "products_admin_insert" ON public.products
  FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "products_admin_update" ON public.products
  FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "products_admin_delete" ON public.products
  FOR DELETE
  USING (public.is_admin());


-- =============================================================
-- 5. PRODUCT_VARIANTS POLICIES
-- =============================================================

DROP POLICY IF EXISTS "Public can view product variants" ON public.product_variants;
DROP POLICY IF EXISTS "Authenticated can manage variants" ON public.product_variants;
DROP POLICY IF EXISTS "variants_select_public" ON public.product_variants;
DROP POLICY IF EXISTS "variants_admin_all" ON public.product_variants;
DROP POLICY IF EXISTS "variants_admin_insert" ON public.product_variants;
DROP POLICY IF EXISTS "variants_admin_update" ON public.product_variants;
DROP POLICY IF EXISTS "variants_admin_delete" ON public.product_variants;

CREATE POLICY "variants_select_public" ON public.product_variants
  FOR SELECT
  USING (is_active = true);

CREATE POLICY "variants_admin_insert" ON public.product_variants
  FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "variants_admin_update" ON public.product_variants
  FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "variants_admin_delete" ON public.product_variants
  FOR DELETE
  USING (public.is_admin());


-- =============================================================
-- 6. PRODUCT_IMAGES POLICIES
-- =============================================================

DROP POLICY IF EXISTS "Public can view product images" ON public.product_images;
DROP POLICY IF EXISTS "Authenticated can manage product images" ON public.product_images;
DROP POLICY IF EXISTS "images_select_public" ON public.product_images;
DROP POLICY IF EXISTS "images_admin_all" ON public.product_images;
DROP POLICY IF EXISTS "images_admin_insert" ON public.product_images;
DROP POLICY IF EXISTS "images_admin_update" ON public.product_images;
DROP POLICY IF EXISTS "images_admin_delete" ON public.product_images;

CREATE POLICY "images_select_public" ON public.product_images
  FOR SELECT
  USING (true);

CREATE POLICY "images_admin_insert" ON public.product_images
  FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "images_admin_update" ON public.product_images
  FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "images_admin_delete" ON public.product_images
  FOR DELETE
  USING (public.is_admin());


-- =============================================================
-- 7. CATEGORIES POLICIES
-- =============================================================

DROP POLICY IF EXISTS "Public can view categories" ON public.categories;
DROP POLICY IF EXISTS "Authenticated can manage categories" ON public.categories;
DROP POLICY IF EXISTS "categories_select_public" ON public.categories;
DROP POLICY IF EXISTS "categories_admin_all" ON public.categories;
DROP POLICY IF EXISTS "categories_admin_insert" ON public.categories;
DROP POLICY IF EXISTS "categories_admin_update" ON public.categories;
DROP POLICY IF EXISTS "categories_admin_delete" ON public.categories;

CREATE POLICY "categories_select_public" ON public.categories
  FOR SELECT
  USING (true);

CREATE POLICY "categories_admin_insert" ON public.categories
  FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "categories_admin_update" ON public.categories
  FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "categories_admin_delete" ON public.categories
  FOR DELETE
  USING (public.is_admin());


-- =============================================================
-- 8. COUPONS POLICIES
-- =============================================================

DROP POLICY IF EXISTS "Public can view active coupons" ON public.coupons;
DROP POLICY IF EXISTS "Authenticated can manage coupons" ON public.coupons;
DROP POLICY IF EXISTS "coupons_select_public" ON public.coupons;
DROP POLICY IF EXISTS "coupons_admin_all" ON public.coupons;
DROP POLICY IF EXISTS "coupons_admin_insert" ON public.coupons;
DROP POLICY IF EXISTS "coupons_admin_update" ON public.coupons;
DROP POLICY IF EXISTS "coupons_admin_delete" ON public.coupons;

CREATE POLICY "coupons_select_public" ON public.coupons
  FOR SELECT
  USING (
    is_active = true
    AND (expires_at IS NULL OR expires_at > now())
  );

CREATE POLICY "coupons_admin_insert" ON public.coupons
  FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "coupons_admin_update" ON public.coupons
  FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "coupons_admin_delete" ON public.coupons
  FOR DELETE
  USING (public.is_admin());


-- =============================================================
-- 9. ORDERS POLICIES
-- =============================================================

DROP POLICY IF EXISTS "Users can view own orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated can create orders" ON public.orders;
DROP POLICY IF EXISTS "Users can update own pending orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can manage orders" ON public.orders;
DROP POLICY IF EXISTS "orders_select_own" ON public.orders;
DROP POLICY IF EXISTS "orders_insert_auth" ON public.orders;
DROP POLICY IF EXISTS "orders_update_own_pending" ON public.orders;
DROP POLICY IF EXISTS "orders_admin_all" ON public.orders;
DROP POLICY IF EXISTS "orders_service_role" ON public.orders;
DROP POLICY IF EXISTS "orders_update_own_limited" ON public.orders;
DROP POLICY IF EXISTS "orders_admin_select" ON public.orders;
DROP POLICY IF EXISTS "orders_admin_update" ON public.orders;
DROP POLICY IF EXISTS "orders_admin_delete" ON public.orders;

-- Customers: read own orders only
CREATE POLICY "orders_select_own" ON public.orders
  FOR SELECT
  USING (auth.uid() = user_id);

-- Customers: create new orders (safe initial values only)
CREATE POLICY "orders_insert_auth" ON public.orders
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND status = 'pending'
    AND payment_status = 'pending'
    AND total >= 0
    AND subtotal >= 0
    AND paid_at IS NULL
    AND nomad_order_id = ''
    AND nomad_checkout_url = ''
  );

-- Customers: update own pending orders (very limited — no payment fields)
CREATE POLICY "orders_update_own_limited" ON public.orders
  FOR UPDATE
  USING (
    auth.uid() = user_id
    AND status = 'pending'
    AND payment_status = 'pending'
  )
  WITH CHECK (
    auth.uid() = user_id
    AND payment_status = 'pending'
    AND paid_at IS NULL
    AND nomad_order_id = ''
    AND nomad_checkout_url = ''
  );

-- Admin: full access
CREATE POLICY "orders_admin_select" ON public.orders
  FOR SELECT
  USING (public.is_admin());

CREATE POLICY "orders_admin_update" ON public.orders
  FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "orders_admin_delete" ON public.orders
  FOR DELETE
  USING (public.is_admin());


-- =============================================================
-- 10. ORDER_ITEMS POLICIES
-- =============================================================

DROP POLICY IF EXISTS "Users can view own order items" ON public.order_items;
DROP POLICY IF EXISTS "Authenticated can manage order items" ON public.order_items;
DROP POLICY IF EXISTS "order_items_select_own" ON public.order_items;
DROP POLICY IF EXISTS "order_items_insert_auth" ON public.order_items;
DROP POLICY IF EXISTS "order_items_admin_all" ON public.order_items;
DROP POLICY IF EXISTS "order_items_insert_own" ON public.order_items;
DROP POLICY IF EXISTS "order_items_admin_select" ON public.order_items;
DROP POLICY IF EXISTS "order_items_admin_update" ON public.order_items;
DROP POLICY IF EXISTS "order_items_admin_delete" ON public.order_items;

CREATE POLICY "order_items_select_own" ON public.order_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders AS o
      WHERE o.id = order_items.order_id
        AND o.user_id = auth.uid()
    )
  );

CREATE POLICY "order_items_insert_own" ON public.order_items
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders AS o
      WHERE o.id = order_items.order_id
        AND o.user_id = auth.uid()
        AND o.status = 'pending'
        AND o.payment_status = 'pending'
    )
    AND price >= 0
    AND quantity > 0
    AND total >= 0
  );

CREATE POLICY "order_items_admin_select" ON public.order_items
  FOR SELECT
  USING (public.is_admin());

CREATE POLICY "order_items_admin_update" ON public.order_items
  FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "order_items_admin_delete" ON public.order_items
  FOR DELETE
  USING (public.is_admin());


-- =============================================================
-- 11. PAYMENTS POLICIES
-- =============================================================

DROP POLICY IF EXISTS "Users can view own payments" ON public.payments;
DROP POLICY IF EXISTS "Authenticated can manage payments" ON public.payments;
DROP POLICY IF EXISTS "payments_select_own" ON public.payments;
DROP POLICY IF EXISTS "payments_admin_all" ON public.payments;
DROP POLICY IF EXISTS "Admins can manage all payments" ON public.payments;
DROP POLICY IF EXISTS "payments_admin_insert" ON public.payments;
DROP POLICY IF EXISTS "payments_admin_update" ON public.payments;
DROP POLICY IF EXISTS "payments_admin_delete" ON public.payments;

CREATE POLICY "payments_select_own" ON public.payments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders AS o
      WHERE o.id = payments.order_id
        AND o.user_id = auth.uid()
    )
  );

CREATE POLICY "payments_admin_insert" ON public.payments
  FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "payments_admin_update" ON public.payments
  FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "payments_admin_delete" ON public.payments
  FOR DELETE
  USING (public.is_admin());


-- =============================================================
-- 12. ADMIN_USERS POLICIES
-- =============================================================

DROP POLICY IF EXISTS "Authenticated can view admin_users" ON public.admin_users;
DROP POLICY IF EXISTS "admin_users_select_admin" ON public.admin_users;
DROP POLICY IF EXISTS "admin_users_admin_all" ON public.admin_users;
DROP POLICY IF EXISTS "admin_users_admin_insert" ON public.admin_users;
DROP POLICY IF EXISTS "admin_users_admin_delete" ON public.admin_users;

CREATE POLICY "admin_users_select_admin" ON public.admin_users
  FOR SELECT
  USING (public.is_admin());

CREATE POLICY "admin_users_admin_insert" ON public.admin_users
  FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "admin_users_admin_delete" ON public.admin_users
  FOR DELETE
  USING (public.is_admin());


-- =============================================================
-- 13. ANALYTICS RPC GRANTS
-- =============================================================

-- 13a. admin_kpis — must enforce admin internally
CREATE OR REPLACE FUNCTION public.admin_kpis()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;

  RETURN jsonb_build_object(
    'total_revenue', (SELECT COALESCE(sum(total), 0) FROM public.orders WHERE payment_status = 'paid'),
    'total_orders', (SELECT count(*) FROM public.orders),
    'total_products', (SELECT count(*) FROM public.products WHERE deleted_at IS NULL),
    'total_customers', (SELECT count(*) FROM public.profiles),
    'pending_orders', (SELECT count(*) FROM public.orders WHERE payment_status = 'pending'),
    'revenue_30d', (SELECT COALESCE(sum(total), 0) FROM public.orders WHERE payment_status = 'paid' AND created_at > now() - interval '30 days')
  );
END;
$$;

-- 13b. revenue_series — supports day/week/month bucketing
-- PARAMETER NAME MUST MATCH FRONTEND: p_interval (not p_bucket)
CREATE OR REPLACE FUNCTION public.revenue_series(
  p_days integer DEFAULT 30,
  p_interval text DEFAULT 'day'
)
RETURNS TABLE(date_label text, revenue numeric, order_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  _interval interval;
  _format text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;

  -- Validate interval parameter (frontend uses p_interval)
  IF p_interval NOT IN ('day', 'week', 'month') THEN
    p_interval := 'day';
  END IF;

  -- Set interval and format based on bucket
  CASE p_interval
    WHEN 'day' THEN
      _interval := (p_days || ' days')::interval;
      _format := 'YYYY-MM-DD';
    WHEN 'week' THEN
      _interval := (p_days || ' days')::interval;
      _format := 'IYYY-IW';
    WHEN 'month' THEN
      _interval := (p_days || ' days')::interval;
      _format := 'YYYY-MM';
  END CASE;

  RETURN QUERY
  SELECT
    to_char(o.created_at, _format) AS date_label,
    COALESCE(sum(o.total), 0)::numeric AS revenue,
    count(*)::bigint AS order_count
  FROM public.orders AS o
  WHERE o.created_at > now() - _interval
  GROUP BY to_char(o.created_at, _format)
  ORDER BY date_label;
END;
$$;

-- 13c. top_products — paid orders only, with date filter
CREATE OR REPLACE FUNCTION public.top_products(
  p_limit integer DEFAULT 10,
  p_days integer DEFAULT 0
)
RETURNS TABLE(product_id uuid, product_name text, brand text, units_sold bigint, revenue numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;

  RETURN QUERY
  SELECT
    p.id AS product_id,
    p.name AS product_name,
    p.brand,
    COALESCE(SUM(oi.quantity), 0)::bigint AS units_sold,
    COALESCE(SUM(oi.total), 0)::numeric AS revenue
  FROM public.products AS p
  LEFT JOIN public.order_items AS oi ON oi.product_id = p.id
    AND EXISTS (
      SELECT 1 FROM public.orders AS o
      WHERE o.id = oi.order_id
        AND o.payment_status = 'paid'
        AND (p_days = 0 OR o.created_at > now() - (p_days || ' days')::interval)
    )
  WHERE p.deleted_at IS NULL
  GROUP BY p.id, p.name, p.brand
  ORDER BY revenue DESC
  LIMIT p_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_kpis() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_kpis() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_kpis() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.revenue_series(integer, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.revenue_series(integer, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.revenue_series(integer, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.top_products(integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.top_products(integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.top_products(integer, integer) TO authenticated;


-- =============================================================
-- 14. STORAGE POLICIES
-- =============================================================

-- 14a. product-images bucket — public read, admin write only
DROP POLICY IF EXISTS "Anyone can view product images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can upload product images" ON storage.objects;
DROP POLICY IF EXISTS "product_images_public_read" ON storage.objects;
DROP POLICY IF EXISTS "product_images_admin_write" ON storage.objects;
DROP POLICY IF EXISTS "product_images_admin_insert" ON storage.objects;
DROP POLICY IF EXISTS "product_images_admin_update" ON storage.objects;
DROP POLICY IF EXISTS "product_images_admin_delete" ON storage.objects;

CREATE POLICY "product_images_public_read" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'product-images');

CREATE POLICY "product_images_admin_insert" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'product-images'
    AND public.is_admin()
  );

CREATE POLICY "product_images_admin_update" ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'product-images'
    AND public.is_admin()
  )
  WITH CHECK (
    bucket_id = 'product-images'
    AND public.is_admin()
  );

CREATE POLICY "product_images_admin_delete" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'product-images'
    AND public.is_admin()
  );


-- 14b. store-assets bucket — public read, admin write only
DROP POLICY IF EXISTS "store_assets_public_read" ON storage.objects;
DROP POLICY IF EXISTS "store_assets_admin_write" ON storage.objects;
DROP POLICY IF EXISTS "store_assets_admin_insert" ON storage.objects;
DROP POLICY IF EXISTS "store_assets_admin_update" ON storage.objects;
DROP POLICY IF EXISTS "store_assets_admin_delete" ON storage.objects;

CREATE POLICY "store_assets_public_read" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'store-assets');

CREATE POLICY "store_assets_admin_insert" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'store-assets'
    AND public.is_admin()
  );

CREATE POLICY "store_assets_admin_update" ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'store-assets'
    AND public.is_admin()
  )
  WITH CHECK (
    bucket_id = 'store-assets'
    AND public.is_admin()
  );

CREATE POLICY "store_assets_admin_delete" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'store-assets'
    AND public.is_admin()
  );


-- 14c. avatars bucket — customer can manage own path, admin can manage all
DROP POLICY IF EXISTS "avatars_select_public" ON storage.objects;
DROP POLICY IF EXISTS "avatars_insert_auth" ON storage.objects;
DROP POLICY IF EXISTS "avatars_update_own" ON storage.objects;
DROP POLICY IF EXISTS "avatars_delete_own" ON storage.objects;
DROP POLICY IF EXISTS "avatars_admin_all" ON storage.objects;
DROP POLICY IF EXISTS "avatars_insert_own" ON storage.objects;

CREATE POLICY "avatars_select_public" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "avatars_insert_own" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "avatars_update_own" ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "avatars_delete_own" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "avatars_admin_all" ON storage.objects
  FOR ALL
  USING (
    bucket_id = 'avatars'
    AND public.is_admin()
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND public.is_admin()
  );


-- =============================================================
-- 15. VERIFICATION QUERIES
-- =============================================================

-- 15a. Check RLS is enabled on all critical tables
SELECT
  schemaname,
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'profiles', 'orders', 'order_items', 'payments',
    'products', 'product_variants', 'product_images',
    'categories', 'coupons', 'store_settings', 'admin_users'
  )
ORDER BY tablename;

-- 15b. Count active policies per table
SELECT
  schemaname,
  tablename,
  count(*) AS policy_count
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY schemaname, tablename
ORDER BY tablename;

-- 15c. Check is_admin() is SECURITY DEFINER
SELECT
  proname,
  prokind,
  prosecdef AS security_definer,
  proconfig
FROM pg_proc
WHERE proname = 'is_admin'
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- 15d. Check analytics RPCs have is_admin() guard
SELECT
  proname,
  prosrc LIKE '%is_admin%' AS has_admin_check
FROM pg_proc
WHERE proname IN ('admin_kpis', 'revenue_series', 'top_products')
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- 15e. Check role column is protected (should return 0 rows)
SELECT
  grantee,
  privilege_type,
  column_name
FROM information_schema.column_privileges
WHERE table_schema = 'public'
  AND table_name = 'profiles'
  AND column_name = 'role'
  AND grantee IN ('anon', 'authenticated');

-- 15f. Check storage policies exist
SELECT
  bucketid::text,
  name AS policy_name,
  operation,
  qual IS NOT NULL AS has_using,
  with_check IS NOT NULL AS has_with_check
FROM storage.policies
WHERE bucketid IN (
  SELECT id FROM storage.buckets WHERE name IN ('product-images', 'store-assets', 'avatars')
)
ORDER BY bucketid, name;

-- 15g. Check trigger exists on orders
SELECT
  trigger_name,
  event_manipulation,
  action_timing
FROM information_schema.triggers
WHERE event_object_table = 'orders'
  AND event_object_schema = 'public';

-- 15h. Verify protect_order_payment_fields only allows service_role
-- Should show: current_setting('role', true) = 'service_role'
-- Should NOT show: is_admin() in the bypass section
SELECT
  proname,
  prosrc LIKE '%service_role%' AS has_service_role_bypass,
  prosrc NOT LIKE '%is_admin%RETURN NEW%' AS admin_does_not_bypass
FROM pg_proc
WHERE proname = 'protect_order_payment_fields'
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- =============================================================
-- END OF MIGRATION
-- =============================================================
