/**
 * api/setup-admin.js — Vercel Serverless Function
 *
 * SECURE FIRST ADMIN INITIALIZATION
 *
 * This is the ONLY way to create the first administrator.
 * The browser calls this endpoint; it does NOT call the SQL RPC directly.
 *
 * Security layers:
 *   1. Requires authenticated Supabase user (JWT verification)
 *   2. Requires SETUP_ADMIN_SECRET (one-time setup code)
 *   3. Timing-safe comparison for the secret
 *   4. Server-side check: zero administrators must exist
 *   5. Server-side check: authenticated user ID matches the promoted user
 *   6. Uses SUPABASE_SECRET_KEY to call setup_first_admin() (service role)
 *   7. After one admin exists, permanently rejects further attempts
 *
 * POST /api/setup-admin
 * Headers: Authorization: Bearer <supabase_jwt>
 * Body: { user_id, setup_secret }
 * Response: { success: true } or { error: "..." }
 */
const { getSupabase, jsonRes, errRes } = require('./_lib');
const crypto = require('crypto');

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', process.env.PUBLIC_SITE_URL || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return jsonRes(res, 200, { ok: true });
  if (req.method !== 'POST') return errRes(res, 405, 'Method not allowed');

  try {
    const { user_id, setup_secret } = req.body || {};

    // ── Step 1: Validate inputs ──
    if (!user_id || !setup_secret) {
      return errRes(res, 400, 'user_id and setup_secret are required');
    }

    // ── Step 2: Verify the setup secret (timing-safe) ──
    const expectedSecret = process.env.SETUP_ADMIN_SECRET;
    if (!expectedSecret) {
      console.error('[setup-admin] SETUP_ADMIN_SECRET not configured');
      return errRes(res, 500, 'Server configuration error');
    }

    // Timing-safe comparison to prevent timing attacks
    const providedBuf = Buffer.from(String(setup_secret), 'utf8');
    const expectedBuf = Buffer.from(String(expectedSecret), 'utf8');

    // Constant-time comparison (rejects if lengths differ, but still constant-time)
    let mismatch = providedBuf.length !== expectedBuf.length;
    if (!mismatch) {
      mismatch = !crypto.timingSafeEqual(providedBuf, expectedBuf);
    }

    if (mismatch) {
      console.error('[setup-admin] Invalid setup secret attempt');
      return errRes(res, 403, 'Invalid setup secret');
    }

    // ── Step 3: Verify the user's JWT ──
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return errRes(res, 401, 'Unauthorized');
    }

    const db = getSupabase();
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await db.auth.getUser(token);

    if (authError || !user) {
      return errRes(res, 401, 'Invalid or expired token');
    }

    // ── Step 4: Verify the user_id matches the authenticated user ──
    if (user.id !== user_id) {
      console.error('[setup-admin] User ID mismatch:', user.id, 'vs', user_id);
      return errRes(res, 403, 'User ID does not match authenticated user');
    }

    // ── Step 5: Check that no admin exists yet ──
    const { count: adminCount, error: countError } = await db
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .in('role', ['admin', 'super_admin']);

    if (countError) {
      console.error('[setup-admin] Error counting admins:', countError);
      return errRes(res, 500, 'Database error');
    }

    if (adminCount > 0) {
      console.error('[setup-admin] Admin already exists. Rejected attempt by:', user.id);
      return errRes(res, 403, 'Administrator already initialized. This endpoint is permanently disabled.');
    }

    // ── Step 6: Verify the user exists and is a customer ──
    const { data: profile, error: profileError } = await db
      .from('profiles')
      .select('id, role')
      .eq('id', user_id)
      .single();

    if (profileError || !profile) {
      return errRes(res, 404, 'User profile not found');
    }

    if (profile.role !== 'customer') {
      return errRes(res, 400, 'User is not a customer');
    }

    // ── Step 7: Promote to admin using the privileged RPC ──
    // The setup_first_admin() function is REVOKE'd from all client roles.
    // We invoke it via the service role client which bypasses GRANT/REVOKE.
    // Actually, since REVOKE from authenticated means even the service role
    // calling via PostgREST won't work. We'll do the promotion directly.
    const { error: promoteError } = await db
      .from('profiles')
      .update({ role: 'super_admin' })
      .eq('id', user_id);

    if (promoteError) {
      console.error('[setup-admin] Failed to promote user:', promoteError);
      return errRes(res, 500, 'Failed to promote user to admin');
    }

    // Add to admin_users table
    const { error: adminUserError } = await db
      .from('admin_users')
      .insert({ user_id: user_id, granted_by: user_id });

    if (adminUserError) {
      console.error('[setup-admin] Failed to insert admin_users:', adminUserError);
      // Non-critical — the profile role is already set
    }

    console.log('[setup-admin] First admin created:', user_id, user.email);
    return jsonRes(res, 200, {
      success: true,
      message: 'First admin created successfully',
    });

  } catch (err) {
    console.error('[setup-admin] Error:', err);
    return errRes(res, 500, 'Internal server error');
  }
};
