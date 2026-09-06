/**
 * config.js — Global configuration and helper utilities
 * Loaded after env.js. Provides: CONFIG, esc(), debounce(), formatPrice(), etc.
 */
(function () {
  'use strict';

  const E = window.__ENV || {};

  window.CONFIG = {
    supabaseUrl: E.PUBLIC_SUPABASE_URL || '',
    supabaseAnonKey: E.PUBLIC_SUPABASE_PUBLISHABLE_KEY || E.PUBLIC_SUPABASE_ANON_KEY || '',
    // Nomod uses X-API-KEY auth, no merchant ID needed in browser
    siteUrl: E.PUBLIC_SITE_URL || window.location.origin,
    storeName: E.PUBLIC_STORE_NAME || 'Pickora',
    supportEmail: E.PUBLIC_SUPPORT_EMAIL || '',
    paymentMode: E.PUBLIC_PAYMENT_MODE || 'test',
    currency: E.PUBLIC_STORE_CURRENCY || 'USD',
    currencySymbols: { USD: '$', AED: 'د.إ', EUR: '€', GBP: '£', SAR: '﷼', QAR: '﷼', KWD: 'د.ك', BHD: 'د.ب' },
    currencyDecimals: { USD: 2, AED: 2, EUR: 2, GBP: 2, SAR: 2, QAR: 2, KWD: 3, BHD: 3 },
  };

  /* ── Utility Functions ──────────────────────────────────── */

  /** Escape HTML entities to prevent XSS */
  window.esc = function esc(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  /** Debounce a function */
  window.debounce = function debounce(fn, ms) {
    let t;
    return function () {
      clearTimeout(t);
      const args = arguments;
      const ctx = this;
      t = setTimeout(function () { fn.apply(ctx, args); }, ms);
    };
  };

  /** Format a number as currency */
  window.formatPrice = function formatPrice(amount, currency) {
    currency = currency || CONFIG.currency;
    var sym = CONFIG.currencySymbols[currency] || '$';
    var dec = CONFIG.currencyDecimals[currency] != null ? CONFIG.currencyDecimals[currency] : 2;
    var num = Number(amount) || 0;
    return sym + num.toFixed(dec).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };

  /** Parse a price string to cents integer */
  window.priceToCents = function priceToCents(amount) {
    return Math.round(Number(amount) * 100);
  };

  /** Format a date string */
  window.formatDate = function formatDate(d, opts) {
    if (!d) return '';
    var date = new Date(d);
    if (opts) return date.toLocaleDateString(undefined, opts);
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };

  /** Format a datetime string */
  window.formatDateTime = function formatDateTime(d) {
    if (!d) return '';
    var date = new Date(d);
    return date.toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  /** Get URL query parameter */
  window.getParam = function getParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  };

  /** Set URL query parameter without reload */
  window.setParam = function setParam(name, value) {
    var url = new URL(window.location);
    if (value === null || value === undefined || value === '') {
      url.searchParams.delete(name);
    } else {
      url.searchParams.set(name, value);
    }
    window.history.replaceState({}, '', url);
  };

  /** Show a toast notification */
  // Toast is now defined in components.js with pk-* classes
  // This is a fallback in case components.js hasn't loaded yet
  window.showToast = window.showToast || function showToast(message, type) {
    type = type || 'info';
    var container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'pk-toast-container';
      document.body.appendChild(container);
    }
    var toast = document.createElement('div');
    toast.className = 'pk-toast pk-toast-' + type;
    var icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
    toast.innerHTML = '<span>' + (icons[type] || icons.info) + '</span>' +
      '<span class="pk-toast-msg">' + esc(message) + '</span>' +
      '<button class="pk-toast-close" onclick="this.parentElement.remove()" aria-label="Close">&times;</button>';
    container.appendChild(toast);
    setTimeout(function () { toast.classList.add('pk-toast-show'); }, 10);
    setTimeout(function () {
      toast.classList.remove('pk-toast-show');
      setTimeout(function () { toast.remove(); }, 300);
    }, 4000);
  };

  /** Simple modal */
  // Modal and confirmDialog are now defined in components.js with pk-* classes
  window.showModal = window.showModal || function showModal(title, content, onClose) {
    var overlay = document.createElement('div');
    overlay.className = 'pk-modal-overlay';
    overlay.innerHTML = '<div class="pk-modal-content">' +
      '<div class="pk-modal-header"><h3>' + esc(title) + '</h3>' +
      '<button class="pk-modal-close" aria-label="Close">&times;</button></div>' +
      '<div>' + content + '</div></div>';
    document.body.appendChild(overlay);
    setTimeout(function () { overlay.classList.add('pk-modal-active'); }, 10);
    overlay.querySelector('.pk-modal-close').addEventListener('click', function () {
      overlay.classList.remove('pk-modal-active');
      setTimeout(function () { overlay.remove(); }, 300);
      if (onClose) onClose();
    });
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) {
        overlay.classList.remove('pk-modal-active');
        setTimeout(function () { overlay.remove(); }, 300);
        if (onClose) onClose();
      }
    });
    return overlay;
  };

  window.confirmDialog = window.confirmDialog || function confirmDialog(message) {
    return new Promise(function (resolve) {
      var overlay = document.createElement('div');
      overlay.className = 'pk-modal-overlay';
      overlay.innerHTML = '<div class="pk-modal-content" style="max-width:400px;">' +
        '<div style="text-align:center;"><p style="margin-bottom:24px;">' + esc(message) + '</p>' +
        '<div style="display:flex;gap:10px;justify-content:center;">' +
        '<button class="pk-btn pk-btn-outline" data-action="cancel">Cancel</button>' +
        '<button class="pk-btn pk-btn-primary" data-action="confirm">Confirm</button>' +
        '</div></div></div>';
      document.body.appendChild(overlay);
      setTimeout(function () { overlay.classList.add('pk-modal-active'); }, 10);
      function close(val) {
        overlay.classList.remove('pk-modal-active');
        setTimeout(function () { overlay.remove(); }, 300);
        resolve(val);
      }
      overlay.querySelector('[data-action="cancel"]').addEventListener('click', function () { close(false); });
      overlay.querySelector('[data-action="confirm"]').addEventListener('click', function () { close(true); });
      overlay.addEventListener('click', function (e) { if (e.target === overlay) close(false); });
    });
  };

  /** Lazy-load images with IntersectionObserver */
  window.lazyImages = function lazyImages() {
    var imgs = document.querySelectorAll('img[data-src]');
    if (!('IntersectionObserver' in window)) {
      imgs.forEach(function (img) { img.src = img.dataset.src; img.removeAttribute('data-src'); });
      return;
    }
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var img = entry.target;
          img.src = img.dataset.src;
          if (img.dataset.srcset) img.srcset = img.dataset.srcset;
          img.removeAttribute('data-src');
          obs.unobserve(img);
        }
      });
    }, { rootMargin: '200px' });
    imgs.forEach(function (img) { obs.observe(img); });
  };

  /** Initialize theme (dark/light) */
  window.initTheme = function initTheme() {
    var saved = localStorage.getItem('pickora-theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var dark = saved ? saved === 'dark' : prefersDark;
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  };

  /** Toggle theme */
  window.toggleTheme = function toggleTheme() {
    var current = document.documentElement.getAttribute('data-theme');
    var next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('pickora-theme', next);
    // Update toggle icons
    document.querySelectorAll('.theme-toggle').forEach(function (btn) {
      btn.innerHTML = next === 'dark' ? '<i class="icon-sun"></i>' : '<i class="icon-moon"></i>';
    });
  };

  /** Generate skeleton HTML */
  window.skeleton = function skeleton(type, count) {
    count = count || 1;
    var html = '';
    if (type === 'card') {
      for (var i = 0; i < count; i++) {
        html += '<div class="pk-skeleton-card"><div class="pk-skeleton pk-skeleton-img"></div>' +
          '<div class="pk-skeleton pk-skeleton-line" style="width:70%"></div>' +
          '<div class="pk-skeleton pk-skeleton-line" style="width:50%"></div>' +
          '<div class="pk-skeleton pk-skeleton-line" style="width:30%"></div></div>';
      }
    } else if (type === 'text') {
      for (var j = 0; j < count; j++) {
        html += '<div class="pk-skeleton pk-skeleton-line" style="width:100%"></div>';
      }
    }
    return html;
  };

  /** Pagination helper */
  window.renderPagination = function renderPagination(page, totalPages, onChange) {
    if (totalPages <= 1) return '';
    var html = '<div class="pagination">';
    html += '<button class="page-btn" data-page="' + (page - 1) + '" ' + (page <= 1 ? 'disabled' : '') + ' aria-label="Previous">&laquo;</button>';
    var start = Math.max(1, page - 2);
    var end = Math.min(totalPages, page + 2);
    if (start > 1) {
      html += '<button class="page-btn" data-page="1">1</button>';
      if (start > 2) html += '<span class="page-ellipsis">…</span>';
    }
    for (var i = start; i <= end; i++) {
      html += '<button class="page-btn ' + (i === page ? 'active' : '') + '" data-page="' + i + '">' + i + '</button>';
    }
    if (end < totalPages) {
      if (end < totalPages - 1) html += '<span class="page-ellipsis">…</span>';
      html += '<button class="page-btn" data-page="' + totalPages + '">' + totalPages + '</button>';
    }
    html += '<button class="page-btn" data-page="' + (page + 1) + '" ' + (page >= totalPages ? 'disabled' : '') + ' aria-label="Next">&raquo;</button>';
    html += '</div>';
    return html;
  };

  /** Init: theme + lazy images on DOMContentLoaded */
  document.addEventListener('DOMContentLoaded', function () {
    initTheme();
    lazyImages();
  });
})();
