/**
 * admin-guard.js — Shared admin authorization guard (UX layer)
 *
 * The REAL security is Supabase RLS + secure RPCs. This guard:
 *   1. shows a "Verifying admin access..." overlay immediately (before any
 *      admin data is fetched),
 *   2. requires an authenticated Supabase session (else → /pages/login.html),
 *   3. verifies database-backed admin status via the is_admin() RPC
 *      (fallback: the caller's own profiles.role row — both come from the DB,
 *      never from localStorage/URL/frontend variables),
 *   4. on success removes the overlay and invokes the page initializer,
 *   5. on failure shows Access Denied and never initializes admin code.
 *
 * Usage (every /admin/*.html page):
 *   <script src="/js/admin-guard.js"></script>
 *   <script>
 *     document.addEventListener('DOMContentLoaded', function () {
 *       requireAdmin(function () {
 *         initAdminSidebar('products');
 *         loadAdminProducts();
 *       });
 *     });
 *   </script>
 */
(function () {
  'use strict';

  var OVERLAY_ID = 'pk-admin-guard-overlay';

  function createOverlay() {
    if (document.getElementById(OVERLAY_ID)) return;
    var div = document.createElement('div');
    div.id = OVERLAY_ID;
    div.setAttribute('role', 'status');
    div.setAttribute('aria-live', 'polite');
    div.innerHTML =
      '<div style="position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;' +
      'background:var(--bg-primary,#0b1020);color:var(--text-primary,#fff);font-family:Poppins,system-ui,sans-serif;">' +
      '<div style="text-align:center;padding:2rem;">' +
      '<div style="width:36px;height:36px;margin:0 auto 1rem;border:3px solid rgba(139,92,246,.25);border-top-color:#8B5CF6;border-radius:50%;animation:pk-spin 0.8s linear infinite;"></div>' +
      '<div style="font-size:0.95rem;letter-spacing:.02em;">Verifying admin access...</div>' +
      '</div></div>' +
      '<style>@keyframes pk-spin{to{transform:rotate(360deg)}}</style>';
    document.documentElement.appendChild(div);
  }

  function destroyOverlay() {
    var el = document.getElementById(OVERLAY_ID);
    if (el) el.remove();
  }

  function showAccessDenied(message) {
    var el = document.getElementById(OVERLAY_ID);
    if (!el) createOverlay();
    var box = document.getElementById(OVERLAY_ID).firstElementChild;
    if (box) {
      box.innerHTML =
        '<div style="text-align:center;padding:2rem;max-width:420px;">' +
        '<div style="font-size:2.2rem;margin-bottom:.75rem;">🔒</div>' +
        '<h2 style="margin:0 0 .5rem;font-size:1.3rem;color:var(--text-primary,#fff);">Access Denied</h2>' +
        '<p style="margin:0 0 1.25rem;color:var(--text-secondary,rgba(255,255,255,.7));font-size:.9rem;">' +
        (message || 'You need administrator privileges to view this page.') +
        '</p>' +
        '<a href="/" style="display:inline-block;padding:.65rem 1.4rem;border-radius:999px;background:#8B5CF6;color:#fff;text-decoration:none;font-size:.9rem;">Back to Store</a>' +
        '</div>';
    }
  }

  /**
   * Database-backed admin check. Prefers the is_admin() SECURITY DEFINER RPC;
   * falls back to reading the caller's own profiles.role row. Never trusts
   * client-supplied values.
   */
  async function dbIsAdmin() {
    try {
      var rpc = await window.db.rpc('is_admin');
      if (!rpc.error && typeof rpc.data === 'boolean') return rpc.data;
    } catch (e) { /* fall through */ }

    try {
      var session = await window.getSession();
      if (!session) return false;
      var res = await window.db.from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle();
      if (res.error || !res.data) return false;
      return res.data.role === 'admin' || res.data.role === 'super_admin';
    } catch (e) {
      return false;
    }
  }

  /**
   * requireAdmin(onAuthorized)
   * Resolves with true when the current user is a verified admin and
   * onAuthorized() has been called. Resolves with false otherwise
   * (page will have been redirected or shown Access Denied).
   */
  window.requireAdmin = async function requireAdmin(onAuthorized) {
    createOverlay();

    // 1. Authenticated session required
    var session = null;
    try {
      session = await window.getSession();
    } catch (e) { /* handled below */ }

    if (!session || !session.user) {
      var redirect = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = '/pages/login.html?redirect=' + redirect;
      return false;
    }

    // 2. Database-backed admin verification
    var isAdmin = await dbIsAdmin();
    if (!isAdmin) {
      showAccessDenied('Your account does not have administrator access.');
      // don't initialize anything; give the user a moment to read it
      setTimeout(function () { window.location.href = '/'; }, 4000);
      return false;
    }

    // 3. Authorized — release the UI
    destroyOverlay();
    if (typeof onAuthorized === 'function') {
      try { onAuthorized(); } catch (e) { console.error('[admin-guard] init error:', e); }
    }
    return true;
  };
})();