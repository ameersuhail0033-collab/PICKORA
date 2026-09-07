/**
 * components.js — Reusable runtime components (Pickora redesign)
 * Navbar, footer, product cards, toast — all using pk-* design system
 */
(function () {
  'use strict';

  /* ── SVG Icons ──────────────────────────────────────────── */
  window.ICONS = {
    search: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    cart: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="m1 1 4 0 2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>',
    user: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    heart: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
    heartFilled: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
    arrowRight: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>',
    menu: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>',
    close: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    sun: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>',
    moon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
    star: '★',
    starEmpty: '☆',
    compare: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>',
  };

  window.renderStars = function renderStars(rating, size) {
    var html = '<span class="stars" style="font-size:' + (size || '0.85rem') + '">';
    for (var i = 1; i <= 5; i++) html += i <= Math.round(rating) ? ICONS.star : ICONS.starEmpty;
    html += '</span>';
    return html;
  };

  /* ── Navbar ─────────────────────────────────────────────── */
  window.renderNavbar = async function renderNavbar() {
    var settings = await getStoreSettings().catch(function () { return {}; });
    var user = await getUser();
    var isAdmin = false;
    if (user) {
      var profile = await getUserProfile(user.id);
      isAdmin = profile && (profile.role === 'admin' || profile.role === 'super_admin');
    }
    var brandName = (settings && settings.store_name) ? settings.store_name : CONFIG.storeName;
    var logoUrl = (settings && settings.logo_url) ? settings.logo_url : '';

    var nav = document.getElementById('navbar');
    if (!nav) return;

    var logoSrc = logoUrl || '/assets/images/pickora-logo.png';
    var logoHtml = '<img data-store="logo" src="' + esc(logoSrc) + '" alt="' + esc(brandName) + '" style="height:36px;width:auto;">';

    var adminLink = isAdmin ? '<a href="/admin" class="pk-header-nav-link">Admin</a>' : '';

    var userSection = user
      ? '<a href="/pages/wishlist.html" class="pk-header-action" title="Wishlist">' + ICONS.heart + '</a>' +
        '<a href="/pages/cart.html" class="pk-header-action" title="Cart">' + ICONS.cart + '<span class="pk-cart-badge cart-count" style="display:none;">0</span></a>' +
        '<a href="/pages/profile.html" class="pk-header-user" title="Account"><div class="pk-header-user-avatar">' + esc((user.email || 'U').charAt(0).toUpperCase()) + '</div></a>'
      : '<a href="/pages/cart.html" class="pk-header-action" title="Cart">' + ICONS.cart + '<span class="pk-cart-badge cart-count" style="display:none;">0</span></a>' +
        '<a href="/pages/login.html" class="pk-btn pk-btn-primary pk-btn-sm">Sign In</a>';

    nav.innerHTML =
      '<a href="/" class="pk-header-logo">' + logoHtml + '</a>' +
      '<div class="pk-header-search">' +
        '<span class="pk-header-search-icon">' + ICONS.search + '</span>' +
        '<input type="text" id="header-search" placeholder="Search laptops..." autocomplete="off">' +
      '</div>' +
      '<nav class="pk-header-nav pk-nav-sibling">' +
        '<a href="/pages/shop.html">Shop</a>' +
        '<a href="/pages/shop.html?category=gaming-laptops">Gaming</a>' +
        '<a href="/pages/shop.html?category=business-laptops">Business</a>' +
        adminLink +
      '</nav>' +
      '<div class="pk-header-actions">' + userSection +
        '<button class="pk-header-action theme-toggle" onclick="toggleTheme()" title="Toggle theme">' +
          (document.documentElement.getAttribute('data-theme') === 'dark' ? ICONS.sun : ICONS.moon) +
        '</button>' +
      '</div>' +
      '<button class="pk-header-mobile-toggle" onclick="toggleMobileMenu()" aria-label="Menu">' + ICONS.menu + '</button>';

    // Search
    var searchInput = document.getElementById('header-search');
    if (searchInput) {
      searchInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && this.value.trim()) {
          window.location.href = '/pages/shop.html?q=' + encodeURIComponent(this.value.trim());
        }
      });
    }

    updateCartBadge();
  };

  window.toggleMobileMenu = function toggleMobileMenu() {
    var nav = document.querySelector('.pk-header-nav');
    if (nav) nav.classList.toggle('open');
  };

  /* ── Footer ─────────────────────────────────────────────── */
  window.renderFooter = async function renderFooter() {
    var settings = await getStoreSettings().catch(function () { return {}; });
    var brandName = (settings && settings.store_name) ? settings.store_name : CONFIG.storeName;
    var logoUrl = (settings && settings.logo_url) ? settings.logo_url : '';
    var logoSrc = logoUrl || '/assets/images/pickora-logo.png';
    var year = new Date().getFullYear();
    var footer = document.getElementById('footer');
    if (!footer) return;

    footer.innerHTML =
      '<div class="pk-footer"><div class="container"><div class="pk-footer-shell">' +
        '<div class="pk-footer-grid">' +
          '<div class="pk-footer-brand">' +
            '<a href="/" class="pk-header-logo"><img src="' + esc(logoSrc) + '" alt="' + esc(brandName) + '" style="height:32px;width:auto;"></a>' +
            '<p>Premium refurbished and renewed laptops in the UAE. Quality-checked, warranty-backed, ready for work and study.</p>' +
            '<div class="pk-footer-social">' +
              '<a href="' + esc((settings && settings.social_facebook) || '#') + '" target="_blank" rel="noopener" aria-label="Facebook">f</a>' +
              '<a href="' + esc((settings && settings.social_instagram) || '#') + '" target="_blank" rel="noopener" aria-label="Instagram">ig</a>' +
              '<a href="' + esc((settings && settings.social_twitter) || '#') + '" target="_blank" rel="noopener" aria-label="Twitter">x</a>' +
            '</div>' +
          '</div>' +
          '<div class="pk-footer-col"><h5>Shop</h5>' +
            '<a href="/pages/shop.html">All Laptops</a><a href="/pages/shop.html?category=gaming-laptops">Gaming</a><a href="/pages/shop.html?category=business-laptops">Business</a><a href="/pages/shop.html?category=ultrabooks">Ultrabooks</a><a href="/pages/shop.html?category=accessories">Accessories</a>' +
          '</div>' +
          '<div class="pk-footer-col"><h5>Support</h5>' +
            '<a href="mailto:' + esc((settings && settings.support_email) || '') + '">Contact Us</a><a href="#">Shipping Policy</a><a href="#">Returns & Refunds</a><a href="#">Privacy Policy</a>' +
          '</div>' +
          '<div class="pk-footer-col"><h5>Account</h5>' +
            '<a href="/pages/login.html">Sign In</a><a href="/pages/register.html">Create Account</a><a href="/pages/orders.html">Order History</a><a href="/pages/wishlist.html">Wishlist</a>' +
          '</div>' +
        '</div>' +
        '<div class="pk-footer-bottom"><span>© ' + year + ' ' + esc(brandName) + '. All rights reserved.</span><span>Secure payments powered by Nomod</span></div>' +
      '</div></div></div>';
  };

  /* ── Product Card ───────────────────────────────────────── */
  window.renderProductCard = function renderProductCard(product, index) {
    var imgUrl = '';
    if (product.product_images && product.product_images.length > 0) {
      var primary = product.product_images.find(function (img) { return img.is_primary; });
      imgUrl = primary ? primary.url : product.product_images[0].url;
    }
    imgUrl = productImageUrl(imgUrl);

    var discount = 0;
    if (product.compare_at_price && product.compare_at_price > product.price) {
      discount = Math.round(((product.compare_at_price - product.price) / product.compare_at_price) * 100);
    }

    var badgeHtml = '';
    if (discount > 0) badgeHtml = '<span class="pk-badge pk-badge-discount">-' + discount + '%</span>';
    else if (product.is_featured) badgeHtml = '<span class="pk-badge pk-badge-new">New</span>';

    // Extract spec chips from product variants or parse from name/description
    var specs = [];
    // Try to get specs from variant names first
    if (product.product_variants && product.product_variants.length > 0) {
      var v = product.product_variants[0];
      if (v.name) {
        var vparts = v.name.split(/[|\/]/).map(function (s) { return s.trim(); }).filter(Boolean);
        specs = vparts.slice(0, 3);
      }
    }
    // Fallback: parse common spec patterns from name
    if (specs.length === 0 && product.name) {
      var ramMatch = product.name.match(/(\d+\s*GB)\s*(RAM)?/i);
      var storageMatch = product.name.match(/(\d+\s*(?:GB|TB)(?:\s*\+\s*\d+\s*(?:GB|TB))?)/i);
      if (ramMatch) specs.push(ramMatch[0]);
      if (storageMatch && storageMatch[0] !== ramMatch?.[0]) specs.push(storageMatch[0]);
    }
    // Final fallback: use category name
    if (specs.length === 0 && product.category_name) {
      specs.push(product.category_name);
    }

    var specsHtml = specs.slice(0, 3).map(function (s) {
      return '<span class="pk-product-card-spec">' + esc(s) + '</span>';
    }).join('');

    var starsHtml = renderStars(product.avg_rating || 0);

    var fallbackBg = product.brand ? esc(product.brand.charAt(0)) : '💻';
    return '<div class="pk-product-card pk-reveal" style="transition-delay:' + (index * 0.06) + 's">' +
      '<div class="pk-product-card-img">' +
        '<a href="/pages/product?slug=' + esc(product.slug) + '">' +
          '<img data-src="' + esc(imgUrl) + '" src="' + esc(imgUrl) + '" alt="' + esc(product.name) + '" loading="lazy" onerror="this.onerror=null;this.style.display=\'none\';this.parentElement.insertAdjacentHTML(\'beforeend\',\'<div class=pk-product-img-fallback><span>' + fallbackBg + '</span></div>\');">' +
        '</a>' +
        badgeHtml +
        '<div class="pk-product-card-actions">' +
          '<button class="pk-product-card-action" onclick="event.preventDefault();toggleWishlistUI(\'' + esc(product.id) + '\',this)" title="Wishlist">' + ICONS.heart + '</button>' +
          '<a href="/pages/product?slug=' + esc(product.slug) + '" class="pk-product-card-action" title="View">' + ICONS.arrowRight + '</a>' +
        '</div>' +
      '</div>' +
      '<div class="pk-product-card-body">' +
        '<div class="pk-product-card-brand">' + esc(product.brand || product.category_name || '') + '</div>' +
        '<h4 class="pk-product-card-title"><a href="/pages/product?slug=' + esc(product.slug) + '">' + esc(product.name) + '</a></h4>' +
        '<div class="pk-product-card-specs">' + specsHtml + '</div>' +
        '<div class="pk-product-card-rating">' + starsHtml + '<span class="count">(' + (product.review_count || 0) + ')</span></div>' +
        '<div class="pk-product-card-footer">' +
          '<div class="pk-product-card-price">' +
            (function() {
              var variants = product.product_variants || [];
              if (variants.length > 1) {
                // Multiple variants: show lowest price with 'From'
                var prices = variants.map(function(v) { return v.price; }).filter(function(p) { return p > 0; });
                var minPrice = prices.length > 0 ? Math.min.apply(null, prices) : product.price;
                return '<span class="pk-price-from">From</span> ' + formatPrice(minPrice);
              } else if (variants.length === 1) {
                return formatPrice(variants[0].price);
              } else {
                return formatPrice(product.price);
              }
            })() +
            (product.compare_at_price > product.price ? '<span class="compare">' + formatPrice(product.compare_at_price) + '</span>' : '') +
          '</div>' +
          '<button class="pk-product-card-add" onclick="event.preventDefault();addToCart(\'' + esc(product.id) + '\',null,1).then(function(){showToast(\'Added to cart\',\'success\')})" title="Add to Cart">+</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  };

  window.toggleWishlistUI = async function toggleWishlistUI(productId, btn) {
    var added = await toggleWishlist(productId);
    if (btn) {
      btn.innerHTML = added ? ICONS.heartFilled : ICONS.heart;
      btn.style.color = added ? '#EF4444' : '';
    }
    showToast(added ? 'Added to wishlist' : 'Removed from wishlist', added ? 'success' : 'info');
  };

  /* ── Toast (updated class names) ────────────────────────── */
  window.showToast = function showToast(message, type) {
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
    setTimeout(function () { toast.classList.remove('pk-toast-show'); setTimeout(function () { toast.remove(); }, 300); }, 4000);
  };

  /* ── Modal (updated class names) ────────────────────────── */
  window.showModal = function showModal(title, content, onClose) {
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
      if (e.target === overlay) { overlay.classList.remove('pk-modal-active'); setTimeout(function () { overlay.remove(); }, 300); if (onClose) onClose(); }
    });
    return overlay;
  };

  window.confirmDialog = function confirmDialog(message) {
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
      function close(val) { overlay.classList.remove('pk-modal-active'); setTimeout(function () { overlay.remove(); }, 300); resolve(val); }
      overlay.querySelector('[data-action="cancel"]').addEventListener('click', function () { close(false); });
      overlay.querySelector('[data-action="confirm"]').addEventListener('click', function () { close(true); });
      overlay.addEventListener('click', function (e) { if (e.target === overlay) close(false); });
    });
  };

  /* ── Scroll Reveal (GSAP-enhanced fallback) ─────────────── */
  function initScrollReveal() {
    var reveals = document.querySelectorAll('.pk-reveal:not(.pk-revealed), .reveal:not(.revealed)');
    if (!('IntersectionObserver' in window)) {
      reveals.forEach(function (el) { el.classList.add('pk-revealed', 'revealed'); });
      return;
    }
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('pk-revealed', 'revealed');
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
    reveals.forEach(function (el) { obs.observe(el); });
  }

  /* ── Header scroll ──────────────────────────────────────── */
  function initHeaderScroll() {
    var header = document.querySelector('.pk-header');
    if (!header) return;
    window.addEventListener('scroll', debounce(function () {
      header.classList.toggle('scrolled', window.scrollY > 40);
    }, 50));
  }

  /* ── Init ───────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', async function () {
    await Promise.all([
      renderNavbar().catch(function (e) { console.warn('[components] navbar:', e.message); }),
      renderFooter().catch(function (e) { console.warn('[components] footer:', e.message); }),
    ]);
    initHeaderScroll();
    initScrollReveal();
  });
})();
