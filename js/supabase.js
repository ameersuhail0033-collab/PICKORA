/**
 * supabase.js — Supabase client initialization and helpers
 * Uses the Supabase JS v2 CDN build (loaded via <script> tag).
 */
(function () {
  'use strict';

  var C = window.CONFIG;
  if (!C.supabaseUrl || !C.supabaseAnonKey) {
    console.error('[supabase] Missing supabaseUrl or supabasePublishableKey in CONFIG');
  }

  // Initialize the Supabase client from the global supabase object (CDN)
  var client = window.supabase.createClient(C.supabaseUrl, C.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    db: { schema: 'public' },
  });

  window.db = client;
  window.auth = client.auth;

  /* ── Auth Helpers ──────────────────────────────────────── */

  /** Get current session */
  window.getSession = async function getSession() {
    var result = await auth.getSession();
    return result.data.session;
  };

  /** Get current user */
  window.getUser = async function getUser() {
    var session = await getSession();
    return session ? session.user : null;
  };

  /** Get user profile from profiles table */
  window.getUserProfile = async function getUserProfile(userId) {
    var user = userId || await getUser();
    if (!user) return null;
    var id = user.id || user;
    var result = await db.from('profiles').select('*').eq('id', id).single();
    return result.data;
  };

  /** Check if current user is admin */
  window.isCurrentUserAdmin = async function isCurrentUserAdmin() {
    var profile = await getUserProfile();
    return profile && (profile.role === 'admin' || profile.role === 'super_admin');
  };

  /** Sign up with email/password */
  window.signUp = async function signUp(email, password, fullName) {
    var result = await auth.signUp({
      email: email,
      password: password,
      options: { data: { full_name: fullName } },
    });
    return result;
  };

  /** Sign in with email/password */
  window.signIn = async function signIn(email, password) {
    var result = await auth.signInWithPassword({ email: email, password: password });
    return result;
  };

  /** Sign in with Google */
  window.signInWithGoogle = async function signInWithGoogle() {
    var result = await auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: C.siteUrl },
    });
    return result;
  };

  /** Send magic link */
  window.signInWithMagicLink = async function signInWithMagicLink(email) {
    var result = await auth.signInWithOtp({
      email: email,
      options: { emailRedirectTo: C.siteUrl },
    });
    return result;
  };

  /** Send password reset email */
  window.resetPassword = async function resetPassword(email) {
    var result = await auth.resetPasswordForEmail(email, {
      redirectTo: C.siteUrl + '/pages/reset-password.html',
    });
    return result;
  };

  /** Update password */
  window.updatePassword = async function updatePassword(newPassword) {
    var result = await auth.updateUser({ password: newPassword });
    return result;
  };

  /** Sign out */
  window.signOut = async function signOut() {
    await auth.signOut();
    window.location.href = '/';
  };

  /* ── Storage Helpers ───────────────────────────────────── */

  /** Upload file to storage */
  window.uploadFile = async function uploadFile(bucket, path, file) {
    // Sanitize filename
    var ext = file.name.split('.').pop().toLowerCase();
    var safeName = path + '/' + Date.now() + '-' + Math.random().toString(36).substring(2, 8) + '.' + ext;

    var result = await db.storage.from(bucket).upload(safeName, file, {
      contentType: file.type,
      upsert: false,
    });
    return result;
  };

  /** Get public URL for a storage file */
  window.getPublicUrl = function getPublicUrl(bucket, path) {
    var result = db.storage.from(bucket).getPublicUrl(path);
    return result.data.publicUrl;
  };

  /** Delete file from storage */
  window.deleteFile = async function deleteFile(bucket, paths) {
    var result = await db.storage.from(bucket).remove(Array.isArray(paths) ? paths : [paths]);
    return result;
  };

  /* ── Database Helpers ──────────────────────────────────── */

  /** Generic select */
  window.dbSelect = async function dbSelect(table, query) {
    var q = db.from(table).select(query || '*');
    return q;
  };

  /** Get store settings (cached) */
  var _settingsCache = null;
  var _settingsPromise = null;

  window.getStoreSettings = async function getStoreSettings() {
    if (_settingsCache) return _settingsCache;
    if (_settingsPromise) return _settingsPromise;

    _settingsPromise = db.from('store_settings').select('*').limit(1).single();
    var result = await _settingsPromise;
    _settingsCache = result.data;
    _settingsPromise = null;
    return _settingsCache;
  };

  /** Invalidate settings cache */
  window.invalidateSettingsCache = function invalidateSettingsCache() {
    _settingsCache = null;
    _settingsPromise = null;
  };

  /* ── Cart Helpers (guest = localStorage, user = DB) ────── */

  var CART_KEY = 'pickora_cart';

  window.getCart = async function getCart() {
    var user = await getUser();
    if (user) {
      var result = await db.from('cart_items')
        .select('*, products(id,name,slug,price,compare_at_price,track_inventory,stock_quantity, is_active), product_variants(id,name,price,stock_quantity)')
        .eq('user_id', user.id);
      return result.data || [];
    } else {
      // Guest cart: fetch product data for each item
      var guestCart = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
      var enriched = [];
      for (var i = 0; i < guestCart.length; i++) {
        var item = guestCart[i];
        var productResult = await db.from('products')
          .select('id,name,slug,price,compare_at_price,track_inventory,stock_quantity,is_active')
          .eq('id', item.product_id)
          .single();
        var variantResult = item.variant_id
          ? await db.from('product_variants').select('id,name,price,stock_quantity').eq('id', item.variant_id).single()
          : { data: null };
        enriched.push({
          id: 'guest_' + i,
          product_id: item.product_id,
          variant_id: item.variant_id,
          quantity: item.quantity,
          products: productResult.data || null,
          product_variants: variantResult.data || null,
        });
      }
      return enriched;
    }
  };

  window.addToCart = async function addToCart(productId, variantId, quantity) {
    quantity = quantity || 1;
    var user = await getUser();
    if (user) {
      // Check if already in cart
      var existing = await db.from('cart_items')
        .select('id, quantity')
        .eq('user_id', user.id)
        .eq('product_id', productId)
        .maybeSingle();

      if (existing.data) {
        await db.from('cart_items')
          .update({ quantity: existing.data.quantity + quantity })
          .eq('id', existing.data.id);
      } else {
        await db.from('cart_items').insert({
          user_id: user.id,
          product_id: productId,
          variant_id: variantId || null,
          quantity: quantity,
        });
      }
    } else {
      var cart = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
      var existIdx = cart.findIndex(function (item) {
        return item.product_id === productId && item.variant_id === (variantId || null);
      });
      if (existIdx > -1) {
        cart[existIdx].quantity += quantity;
      } else {
        cart.push({ product_id: productId, variant_id: variantId || null, quantity: quantity });
      }
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    }
    updateCartBadge();
  };

  window.updateCartItem = async function updateCartItem(itemId, quantity) {
    var user = await getUser();
    if (user) {
      if (quantity <= 0) {
        await db.from('cart_items').delete().eq('id', itemId);
      } else {
        await db.from('cart_items').update({ quantity: quantity }).eq('id', itemId);
      }
    } else {
      var cart = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
      if (quantity <= 0) {
        cart = cart.filter(function (_, i) { return i !== parseInt(itemId); });
      } else if (cart[parseInt(itemId)]) {
        cart[parseInt(itemId)].quantity = quantity;
      }
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    }
    updateCartBadge();
  };

  window.removeFromCart = async function removeFromCart(itemId) {
    var user = await getUser();
    if (user) {
      await db.from('cart_items').delete().eq('id', itemId);
    } else {
      var cart = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
      cart = cart.filter(function (_, i) { return i !== parseInt(itemId); });
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    }
    updateCartBadge();
  };

  window.clearCart = async function clearCart() {
    var user = await getUser();
    if (user) {
      await db.from('cart_items').delete().eq('user_id', user.id);
    } else {
      localStorage.removeItem(CART_KEY);
    }
    updateCartBadge();
  };

  window.getCartCount = async function getCartCount() {
    var user = await getUser();
    if (user) {
      var result = await db.from('cart_items').select('quantity', { count: 'exact' }).eq('user_id', user.id);
      return (result.data || []).reduce(function (sum, item) { return sum + item.quantity; }, 0);
    } else {
      var cart = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
      return cart.reduce(function (sum, item) { return sum + item.quantity; }, 0);
    }
  };

  /** Update cart badge in navbar */
  window.updateCartBadge = async function updateCartBadge() {
    var count = await getCartCount();
    document.querySelectorAll('.cart-count').forEach(function (el) {
      el.textContent = count;
      el.style.display = count > 0 ? 'flex' : 'none';
    });
  };

  /* ── Merge guest cart to user cart on login ─────────────── */
  window.mergeGuestCart = async function mergeGuestCart() {
    var user = await getUser();
    if (!user) return;
    var guestCart = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    if (guestCart.length === 0) return;

    for (var i = 0; i < guestCart.length; i++) {
      var item = guestCart[i];
      var existing = await db.from('cart_items')
        .select('id, quantity')
        .eq('user_id', user.id)
        .eq('product_id', item.product_id)
        .maybeSingle();

      if (existing.data) {
        await db.from('cart_items')
          .update({ quantity: existing.data.quantity + item.quantity })
          .eq('id', existing.data.id);
      } else {
        await db.from('cart_items').insert({
          user_id: user.id,
          product_id: item.product_id,
          variant_id: item.variant_id || null,
          quantity: item.quantity,
        });
      }
    }
    localStorage.removeItem(CART_KEY);
    updateCartBadge();
  };

  /* ── Wishlist Helpers ──────────────────────────────────── */

  window.getWishlist = async function getWishlist() {
    var user = await getUser();
    if (!user) return [];
    var result = await db.from('wishlist')
      .select('*, products(id,name,slug,price,compare_at_price, is_active)')
      .eq('user_id', user.id);
    return result.data || [];
  };

  window.toggleWishlist = async function toggleWishlist(productId) {
    var user = await getUser();
    if (!user) { window.location.href = '/pages/login.html'; return; }

    var existing = await db.from('wishlist')
      .select('id')
      .eq('user_id', user.id)
      .eq('product_id', productId)
      .maybeSingle();

    if (existing.data) {
      await db.from('wishlist').delete().eq('id', existing.data.id);
      return false;
    } else {
      await db.from('wishlist').insert({ user_id: user.id, product_id: productId });
      return true;
    }
  };

  window.isInWishlist = async function isInWishlist(productId) {
    var user = await getUser();
    if (!user) return false;
    var result = await db.from('wishlist')
      .select('id')
      .eq('user_id', user.id)
      .eq('product_id', productId)
      .maybeSingle();
    return !!result.data;
  };
})();
