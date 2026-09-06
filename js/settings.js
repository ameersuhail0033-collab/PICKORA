/**
 * settings.js — White-label settings system
 * Loads store_settings singleton row and applies branding across the site:
 * CSS vars (colors), logo, favicon, title, meta/OG, navbar, footer, data-store bindings.
 */
(function () {
  'use strict';

  /** Apply store settings to the page */
  window.applyStoreSettings = async function applyStoreSettings(settings) {
    if (!settings) return;
    var s = settings;

    // ── CSS Custom Properties (Brand Colors) ──
    if (s.primary_color) document.documentElement.style.setProperty('--brand-primary', s.primary_color);
    if (s.secondary_color) document.documentElement.style.setProperty('--brand-secondary', s.secondary_color);
    if (s.accent_color) document.documentElement.style.setProperty('--brand-accent', s.accent_color);

    // ── Title & Meta ──
    if (s.store_name) {
      document.title = document.title.replace(/{{STORE_NAME}}/g, esc(s.store_name));
      // Replace any {{STORE_NAME}} placeholders in existing title
      var baseTitle = document.title.split(' | ')[0].split(' — ')[0].trim();
      if (baseTitle.indexOf('Pickora') === 0 || baseTitle.indexOf('{{') !== -1) {
        document.title = s.store_name + (document.title.indexOf('|') !== -1 ? ' |' : ' —') + document.title.split(/[\|–—]/)[1];
      }
    }

    // Meta description
    if (s.meta_description) {
      var metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) metaDesc.setAttribute('content', s.meta_description);
    }

    // Open Graph
    setMetaProperty('og:title', (s.store_name || 'Pickora') + ' — Premium Laptops');
    setMetaProperty('og:description', s.meta_description || 'Premium laptops and accessories');
    setMetaProperty('og:site_name', s.store_name || 'Pickora');
    if (s.og_image_url) setMetaProperty('og:image', s.og_image_url);
    setMetaProperty('og:url', window.location.href);

    // ── Favicon ──
    if (s.favicon_url) {
      var favicon = document.querySelector('link[rel="icon"], link[rel="shortcut icon"]');
      if (favicon) favicon.href = s.favicon_url;
    }

    // ── Logo ──
    document.querySelectorAll('[data-store="logo"]').forEach(function (el) {
      if (s.logo_url) {
        el.src = s.logo_url;
        el.alt = s.store_name || 'Store Logo';
        el.style.display = '';
      }
    });

    document.querySelectorAll('[data-store="logo-text"]').forEach(function (el) {
      el.textContent = s.store_name || 'Pickora';
    });

    // ── Brand color badges ──
    document.querySelectorAll('[data-store="primary-color"]').forEach(function (el) {
      el.style.background = s.primary_color || '#8B5CF6';
    });
    document.querySelectorAll('[data-store="accent-color"]').forEach(function (el) {
      el.style.background = s.accent_color || '#84CC16';
    });

    // ── Support info ──
    document.querySelectorAll('[data-store="support-email"]').forEach(function (el) {
      el.textContent = s.support_email || '';
      el.href = 'mailto:' + (s.support_email || '');
    });
    document.querySelectorAll('[data-store="support-phone"]').forEach(function (el) {
      el.textContent = s.support_phone || '';
      el.href = 'tel:' + (s.support_phone || '').replace(/[^+\d]/g, '');
    });
    document.querySelectorAll('[data-store="address"]').forEach(function (el) {
      el.textContent = s.address || '';
    });

    // ── Social links ──
    var socialMap = {
      facebook: s.social_facebook,
      instagram: s.social_instagram,
      twitter: s.social_twitter,
      youtube: s.social_youtube,
      tiktok: s.social_tiktok,
    };
    Object.keys(socialMap).forEach(function (platform) {
      var url = socialMap[platform];
      document.querySelectorAll('[data-store="social-' + platform + '"]').forEach(function (el) {
        if (url) {
          el.href = url;
          el.style.display = '';
        } else {
          el.style.display = 'none';
        }
      });
    });

    // ── Currency ──
    if (s.currency) CONFIG.currency = s.currency;

    // ── Maintenance mode banner ──
    if (s.maintenance_mode) {
      showMaintenanceBanner(s.store_name);
    }

    // ── Any generic data-store bindings ──
    document.querySelectorAll('[data-store]').forEach(function (el) {
      var field = el.getAttribute('data-store');
      if (field && s[field] && !el.hasAttribute('data-store-handled')) {
        el.textContent = s[field];
      }
    });
  };

  /** Helper: set meta property */
  function setMetaProperty(property, content) {
    var el = document.querySelector('meta[property="' + property + '"]');
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute('property', property);
      document.head.appendChild(el);
    }
    el.setAttribute('content', content);
  }

  /** Show maintenance mode banner */
  function showMaintenanceBanner(storeName) {
    if (window.location.pathname.indexOf('/admin') === 0) return; // Admin can still access
    var banner = document.createElement('div');
    banner.className = 'maintenance-banner';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#F59E0B;color:#000;text-align:center;padding:0.5rem;font-weight:600;font-size:0.9rem;';
    banner.textContent = (storeName || 'Store') + ' is currently under maintenance. Some features may be unavailable.';
    document.body.prepend(banner);
  }

  /** Auto-apply on DOMContentLoaded if settings are available */
  var applied = false;
  document.addEventListener('DOMContentLoaded', async function () {
    if (applied) return;
    applied = true;
    try {
      // Wait a short time for supabase.js to initialize
      if (!window.db) {
        await new Promise(function (resolve) { setTimeout(resolve, 200); });
      }
      if (window.getStoreSettings) {
        var settings = await getStoreSettings();
        if (settings) await applyStoreSettings(settings);
      }
    } catch (e) {
      console.warn('[settings] Failed to apply store settings:', e.message);
    }
  });
})();
