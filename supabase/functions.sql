-- =============================================================
-- PICKORA STORE — Database Functions & Triggers
-- Run AFTER schema.sql
-- =============================================================

-- ═══════════════════════════════════════════════════════════════
-- SECURITY DEFINER FUNCTIONS
-- All privileged functions use:
--   SET search_path = ''  (prevents search_path hijacking)
--   Explicit schema qualification on all table references
--   Explicit EXECUTE permission control
-- ═══════════════════════════════════════════════════════════════

-- ── is_admin() — checks if current user has admin role ───────
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

-- ── Handle new user (auto-create profile on signup) ──────────
-- SECURITY: ALL new users are created as 'customer'.
-- Admin promotion is handled exclusively by /api/setup-admin endpoint.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'customer'::public.user_role
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = '';

-- Trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── Setup first admin (one-time initialization) ──────────────
-- SECURITY: This function is REVOKE'd from PUBLIC, anon, and authenticated.
-- It can ONLY be called server-side via /api/setup-admin using the service role.
-- The browser never has direct access to this function.
CREATE OR REPLACE FUNCTION public.setup_first_admin(
  p_user_id UUID
)
RETURNS JSONB AS $$
DECLARE
  admin_count INT;
  user_role_val public.user_role;
BEGIN
  -- Count existing admins
  SELECT COUNT(*) INTO admin_count FROM public.profiles WHERE role IN ('admin', 'super_admin');

  IF admin_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin already exists. Cannot create another first admin.');
  END IF;

  -- Verify the user exists
  SELECT role INTO user_role_val FROM public.profiles WHERE id = p_user_id;
  IF user_role_val IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found.');
  END IF;

  -- Promote to super_admin
  UPDATE public.profiles SET role = 'super_admin' WHERE id = p_user_id;

  -- Add to admin_users
  INSERT INTO public.admin_users (user_id, granted_by) VALUES (p_user_id, p_user_id);

  RETURN jsonb_build_object('success', true, 'message', 'First admin created successfully.');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = '';

-- CRITICAL: Revoke direct execution from all client roles
-- This function can ONLY be invoked by the service_role (which bypasses RLS/permissions)
REVOKE EXECUTE ON FUNCTION public.setup_first_admin(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.setup_first_admin(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.setup_first_admin(uuid) FROM authenticated;

-- ── Search vector trigger for products ────────────────────────
CREATE OR REPLACE FUNCTION public.products_search_vector_update()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.brand, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.short_description, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.sku, '')), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
   SET search_path = '';

DROP TRIGGER IF EXISTS trg_products_search_vector ON public.products;
CREATE TRIGGER trg_products_search_vector
  BEFORE INSERT OR UPDATE OF name, brand, short_description, description, sku
  ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.products_search_vector_update();

-- ── Order number generator ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS TRIGGER AS $$
DECLARE
  seq INT;
  prefix TEXT;
BEGIN
  prefix := 'PKR';
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(order_number FROM 5) AS INT)
  ), 0) + 1 INTO seq
  FROM public.orders
  WHERE order_number LIKE prefix || '-%';

  NEW.order_number := prefix || '-' || LPAD(seq::TEXT, 6, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
   SET search_path = '';

DROP TRIGGER IF EXISTS trg_orders_number ON public.orders;
CREATE TRIGGER trg_orders_number
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  WHEN (NEW.order_number IS NULL OR NEW.order_number = '')
  EXECUTE FUNCTION public.generate_order_number();

-- ── Rating recalculation ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.recalculate_product_rating()
RETURNS TRIGGER AS $$
DECLARE
  pid UUID;
BEGIN
  pid := COALESCE(NEW.product_id, OLD.product_id);

  UPDATE public.products SET
    avg_rating = COALESCE((
      SELECT ROUND(AVG(rating)::NUMERIC, 2)
      FROM public.reviews
      WHERE product_id = pid AND deleted_at IS NULL AND is_approved = true
    ), 0),
    review_count = (
      SELECT COUNT(*)::INT
      FROM public.reviews
      WHERE product_id = pid AND deleted_at IS NULL AND is_approved = true
    )
  WHERE id = pid;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = '';

DROP TRIGGER IF EXISTS trg_reviews_rating ON public.reviews;
CREATE TRIGGER trg_reviews_rating
  AFTER INSERT OR UPDATE OR DELETE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.recalculate_product_rating();

-- ── validate_coupon RPC ──────────────────────────────────────
-- SAFE: Read-only coupon validation, accessible to authenticated users
CREATE OR REPLACE FUNCTION public.validate_coupon(
  p_code TEXT,
  p_total NUMERIC
)
RETURNS JSONB AS $$
DECLARE
  c RECORD;
  result JSONB;
BEGIN
  SELECT * INTO c FROM public.coupons
  WHERE UPPER(code) = UPPER(p_code) AND is_active = true;

  IF c IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Invalid coupon code');
  END IF;

  IF c.expires_at IS NOT NULL AND c.expires_at < now() THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Coupon has expired');
  END IF;

  IF c.max_uses > 0 AND c.used_count >= c.max_uses THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Coupon usage limit reached');
  END IF;

  IF c.min_order > 0 AND p_total < c.min_order THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Minimum order amount not met');
  END IF;

  result := jsonb_build_object(
    'valid', true,
    'coupon_id', c.id,
    'code', c.code,
    'discount_type', c.discount_type,
    'discount_value', c.discount_value,
    'discount_amount',
      CASE WHEN c.discount_type = 'percentage'
        THEN ROUND(p_total * c.discount_value / 100, 2)
        ELSE LEAST(c.discount_value, p_total)
      END
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = '';

-- Revoke PUBLIC execute on validate_coupon — only authenticated users should call it
REVOKE EXECUTE ON FUNCTION public.validate_coupon(text, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_coupon(text, numeric) FROM anon;

-- ── Decrement stock on paid order ────────────────────────────
-- SECURITY: Only fires via trigger on orders table.
-- The trigger's SECURITY DEFINER context runs with the function owner's privileges.
-- Stock decrement is idempotent: the guard checks payment_status transition.
CREATE OR REPLACE FUNCTION public.decrement_stock_on_paid()
RETURNS TRIGGER AS $$
BEGIN
  -- CRITICAL: Only decrement on ACTUAL state transition to 'paid'
  -- This prevents duplicate stock decrements from replayed webhooks
  IF NEW.payment_status = 'paid' AND (OLD.payment_status IS DISTINCT FROM 'paid') THEN
    -- Decrement product stock (with floor at 0 to prevent overselling)
    UPDATE public.products p SET
      stock_quantity = GREATEST(0, stock_quantity - oi.quantity),
      sales_count = sales_count + oi.quantity
    FROM public.order_items oi
    WHERE oi.order_id = NEW.id AND oi.product_id = p.id AND p.track_inventory = true;

    -- Decrement variant stock (with floor at 0)
    UPDATE public.product_variants pv SET
      stock_quantity = GREATEST(0, stock_quantity - oi.quantity)
    FROM public.order_items oi
    WHERE oi.order_id = NEW.id AND oi.variant_id = pv.id;

    -- Increment coupon usage
    UPDATE public.coupons SET used_count = used_count + 1
    WHERE id = NEW.coupon_id AND NEW.coupon_id IS NOT NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = '';

DROP TRIGGER IF EXISTS trg_orders_decrement_stock ON public.orders;
CREATE TRIGGER trg_orders_decrement_stock
  AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.decrement_stock_on_paid();

-- ── Admin KPIs RPC ───────────────────────────────────────────
-- SECURITY: Only accessible by admins. Revoke from PUBLIC/anon.
CREATE OR REPLACE FUNCTION public.admin_kpis(
  p_start DATE DEFAULT (CURRENT_DATE - INTERVAL '30 days'),
  p_end DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  -- SECURITY: admin-only (checked inside the SECURITY DEFINER function)
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

-- ── Revenue series RPC (for charts) ─────────────────────────
CREATE OR REPLACE FUNCTION public.revenue_series(
  p_start DATE DEFAULT (CURRENT_DATE - INTERVAL '30 days'),
  p_end DATE DEFAULT CURRENT_DATE,
  p_interval TEXT DEFAULT 'day'
)
RETURNS JSONB AS $$
BEGIN
  -- SECURITY: admin-only
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

-- ── Top products RPC ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.top_products(
  p_limit INT DEFAULT 10,
  p_start DATE DEFAULT (CURRENT_DATE - INTERVAL '30 days'),
  p_end DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB AS $$
BEGIN
  -- SECURITY: admin-only
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

-- ═══════════════════════════════════════════════════════════════
-- ADMIN SECURITY (sync with supabase/admin-security-fix.sql)
-- ═══════════════════════════════════════════════════════════════

-- ── Protect order payment fields (customers can never change them) ──
-- RLS is row-level only, so payment-field protection is enforced by a
-- BEFORE UPDATE trigger. The service role (Nomod webhook) and admins pass;
-- customers who try to flip payment_status/totals are rejected.
CREATE OR REPLACE FUNCTION public.protect_order_payment_fields()
RETURNS TRIGGER AS $$
DECLARE
  req_role TEXT;
BEGIN
  req_role := COALESCE(NULLIF(current_setting('request.jwt.claims', true)::jsonb ->> 'role', ''), auth.role());

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

-- ── Secure role-change RPC (replaces direct client-side profile UPDATE) ──
-- Caller must be an admin (checked inside). Validates the target user and
-- role, protects the last admin, and only super_admin can touch super_admin.
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

  IF target_current_role = 'super_admin' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'super_admin'
    ) INTO caller_is_super;
    IF NOT caller_is_super THEN
      RETURN jsonb_build_object('success', false, 'error', 'Only super_admin can modify a super_admin');
    END IF;
  END IF;

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

REVOKE EXECUTE ON FUNCTION public.admin_set_user_role(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_set_user_role(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(uuid, text) TO authenticated;

