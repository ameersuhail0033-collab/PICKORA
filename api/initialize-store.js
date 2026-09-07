/**
 * api/initialize-store.js — Vercel Serverless Function
 *
 * SECURE STORE INITIALIZATION
 *
 * This is the ONLY way to initialize the store for the first time.
 * Everything happens server-side using SUPABASE_SECRET_KEY (bypasses RLS).
 *
 * Flow:
 *   1. Verify JWT (authenticated user)
 *   2. Verify SETUP_ADMIN_SECRET (timing-safe)
 *   3. Check zero admins exist
 *   4. Check store_settings is not initialized
 *   5. Promote user to super_admin
 *   6. Create admin_users record
 *   7. Upload logo/favicon to store-assets (using service role)
 *   8. Create store_settings row (using service role)
 *   9. Return success
 *
 * POST /api/initialize-store
 * Headers: Authorization: Bearer <supabase_jwt>
 * Body: { user_id, setup_secret, store_name, company_name, logo_base64, favicon_base64, ... }
 * Response: { success: true, logo_url, favicon_url } or { error: "..." }
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
    const body = req.body || {};

    // ── Step 1: Verify JWT ──
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

    const user_id = body.user_id;
    if (!user_id || user_id !== user.id) {
      return errRes(res, 403, 'User ID mismatch');
    }

    // ── Step 2: Verify SETUP_ADMIN_SECRET (timing-safe) ──
    const setup_secret = body.setup_secret;
    const expectedSecret = process.env.SETUP_ADMIN_SECRET;
    if (!expectedSecret) {
      return errRes(res, 500, 'Server configuration error');
    }

    const providedBuf = Buffer.from(String(setup_secret || ''), 'utf8');
    const expectedBuf = Buffer.from(String(expectedSecret), 'utf8');
    let mismatch = providedBuf.length !== expectedBuf.length;
    if (!mismatch) {
      mismatch = !crypto.timingSafeEqual(providedBuf, expectedBuf);
    }
    if (mismatch) {
      return errRes(res, 403, 'Invalid setup secret');
    }

    // ── Step 3: Check zero admins ──
    const { count: adminCount } = await db
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .in('role', ['admin', 'super_admin']);

    if (adminCount > 0) {
      return errRes(res, 403, 'Administrator already initialized');
    }

    // ── Step 4: Check store_settings not initialized ──
    const { count: settingsCount } = await db
      .from('store_settings')
      .select('*', { count: 'exact', head: true });

    if (settingsCount > 0) {
      return errRes(res, 403, 'Store settings already initialized');
    }

    // ── Step 5: Promote user to super_admin ──
    const { error: promoteError } = await db
      .from('profiles')
      .update({ role: 'super_admin' })
      .eq('id', user_id);

    if (promoteError) {
      console.error('[initialize-store] Failed to promote:', promoteError);
      return errRes(res, 500, 'Failed to promote user');
    }

    // ── Step 6: Create admin_users record ──
    await db.from('admin_users').insert({ user_id, granted_by: user_id });

    // ── Step 7: Upload logo/favicon if provided (base64) ──
    let logoUrl = '';
    let faviconUrl = '';

    if (body.logo_base64) {
      try {
        const logoBuffer = Buffer.from(body.logo_base64, 'base64');
        const logoExt = body.logo_type || 'png';
        const logoPath = `logo-${Date.now()}.${logoExt}`;
        const { error: logoErr } = await db.storage
          .from('store-assets')
          .upload(logoPath, logoBuffer, {
            contentType: `image/${logoExt}`,
            upsert: false,
          });
        if (!logoErr) {
          const { data: urlData } = db.storage.from('store-assets').getPublicUrl(logoPath);
          logoUrl = urlData.publicUrl;
        }
      } catch (e) {
        console.error('[initialize-store] Logo upload error:', e.message);
      }
    }

    if (body.favicon_base64) {
      try {
        const favBuffer = Buffer.from(body.favicon_base64, 'base64');
        const favExt = body.favicon_type || 'png';
        const favPath = `favicon-${Date.now()}.${favExt}`;
        const { error: favErr } = await db.storage
          .from('store-assets')
          .upload(favPath, favBuffer, {
            contentType: `image/${favExt}`,
            upsert: false,
          });
        if (!favErr) {
          const { data: urlData } = db.storage.from('store-assets').getPublicUrl(favPath);
          faviconUrl = urlData.publicUrl;
        }
      } catch (e) {
        console.error('[initialize-store] Favicon upload error:', e.message);
      }
    }

    // ── Step 8: Create store_settings ──
    const settingsData = {
      store_name: body.store_name || 'Pickora',
      company_name: body.company_name || '',
      logo_url: logoUrl,
      favicon_url: faviconUrl,
      primary_color: body.primary_color || '#061A3D',
      secondary_color: body.secondary_color || '#8B5CF6',
      accent_color: body.accent_color || '#C4A3FF',
      currency: body.currency || 'AED',
      support_email: body.support_email || '',
      support_phone: body.support_phone || '',
      address: body.address || '',
      social_facebook: body.social_facebook || '',
      social_instagram: body.social_instagram || '',
    };

    const { error: settingsError } = await db.from('store_settings').insert(settingsData);
    if (settingsError) {
      console.error('[initialize-store] Settings insert error:', settingsError);
      return errRes(res, 500, 'Failed to create store settings');
    }

    console.log('[initialize-store] Store initialized by:', user_id, user.email);
    return jsonRes(res, 200, {
      success: true,
      message: 'Store initialized successfully',
      logo_url: logoUrl,
      favicon_url: faviconUrl,
    });

  } catch (err) {
    console.error('[initialize-store] Error:', err);
    return errRes(res, 500, 'Internal server error');
  }
};
