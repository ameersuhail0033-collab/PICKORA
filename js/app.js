/**
 * app.js — Homepage logic with safe GSAP Motion System
 *
 * Lifecycle:
 *   1. DOMContentLoaded
 *   2. Static shell init (header, newsletter, sibling focus, counters)
 *   3. Await ALL async data loaders (products, brands, testimonials, etc.)
 *   4. After DOM injection + requestAnimationFrame settling:
 *      - Initialize hero motion (wave reveal + GSAP timeline)
 *      - Initialize ScrollTrigger reveals for all sections
 *      - Refresh ScrollTrigger with forced recalculation
 *   5. Fail-safe: 2s timeout forces any still-hidden viewport elements visible
 *   6. data-reveal-complete prevents re-hiding on theme toggle / resize
 */
(function () {
  'use strict';

  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var _gsapInitialized = false;
  var _heroMotionDone = false;

  document.addEventListener('DOMContentLoaded', async function () {
    if (window.location.pathname !== '/' && window.location.pathname !== '/index.html') return;

    // Wait for Supabase client to be ready
    if (!window.db) await new Promise(function (r) { setTimeout(r, 300); });

    // Step 1: Initialize static UI immediately
    initHeaderScroll();
    initSiblingFocusNav();
    initNewsletter();
    animateCounters();

    // Step 2: Await ALL async data loaders
    var loadResults = await Promise.allSettled([
      loadFeaturedProducts(),
      loadBestSellers(),
      loadBrands(),
      loadCategories(),
      loadTestimonials(),
      loadBottomCardStats()
    ]);

    // Log any failures for debugging
    loadResults.forEach(function (result, i) {
      if (result.status === 'rejected') {
        console.warn('[app.js] Data loader', i, 'failed:', result.reason);
      }
    });

    // Step 3: Wait for DOM to settle after async injection
    await new Promise(function (resolve) {
      requestAnimationFrame(function () {
        requestAnimationFrame(resolve);
      });
    });

    // Step 4: Mark motion-ready for progressive enhancement
    document.documentElement.classList.add('motion-ready');

    // Step 5: Initialize hero image load with hard timeout
    initHeroImageLoad();

    // Step 6: Initialize all motion systems
    if (prefersReducedMotion || typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') {
      forceAllRevealsVisible();
    } else {
      initScrollReveals();
      startHeroMotion();
      // Refresh after all ScrollTriggers are created
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          if (typeof ScrollTrigger !== 'undefined') {
            ScrollTrigger.refresh(true);
          }
        });
      });
    }

    // Step 7: Fail-safe timeout
    setTimeout(failSafeRevealCheck, 2000);

    window.addEventListener('resize', function () {
      if (typeof ScrollTrigger !== 'undefined') {
        ScrollTrigger.refresh();
      }
    }, { passive: true });

    window.addEventListener('themechange', function () {
      setTimeout(failSafeRevealCheck, 60);
    });

    window.addEventListener('load', function () {
      setTimeout(failSafeRevealCheck, 120);
    });
  });

  // Hard page-load guarantee
  setTimeout(failSafeRevealCheck, 4500);

  /* ── HERO MOTION ──────────────────────────────────────── */

  function startHeroMotion() {
    if (_heroMotionDone) return;
    _heroMotionDone = true;

    // Trigger wave-reveal on hero elements
    if (window.pkTextReveal) {
      document.querySelectorAll('.pk-hero [data-wave-reveal]').forEach(function (el) {
        window.pkTextReveal.reveal(el, {
          direction: el.getAttribute('data-wave-direction') || 'up',
          blur: el.getAttribute('data-wave-blur') === 'true',
          delay: parseInt(el.getAttribute('data-wave-delay') || '0', 10)
        });
      });
    }

    if (typeof gsap !== 'undefined') {
      initHeroTimeline();
    } else {
      document.querySelectorAll('#hero-shell, .pk-hero-num, .pk-hero-subtitle, .pk-hero-cta, .pk-hero-image, .pk-hero-side-card, .pk-bottom-card, .pk-hero-social').forEach(function (el) {
        el.style.opacity = '1';
        el.style.transform = 'none';
      });
    }
  }

  function initHeroTimeline() {
    gsap.registerPlugin(ScrollTrigger);

    // Mark hero elements as GSAP-controlled
    document.querySelectorAll('.pk-hero .pk-reveal, .pk-hero-image-area').forEach(function (el) {
      el.classList.remove('pk-reveal');
      el.style.opacity = '1';
      el.style.transform = 'none';
    });

    var heroArea = document.querySelector('.pk-hero-image-area');
    if (heroArea) {
      heroArea.style.background = 'var(--pk-surface)';
    }

    var heroTl = gsap.timeline({ defaults: { ease: 'power3.out', duration: 0.8 } });

    heroTl
      .from('#hero-shell', {
        opacity: 0,
        scale: 0.96,
        y: 30,
        duration: 1,
        ease: 'power4.out',
        onComplete: function () {
          var shell = document.getElementById('hero-shell');
          if (shell) {
            gsap.set(shell, { clearProps: 'transform,opacity' });
          }
        }
      })
      .from('.pk-hero-num', {
        opacity: 0,
        x: -30,
        duration: 0.5
      }, '-=0.3')
      .from('.pk-hero-subtitle', {
        opacity: 0,
        y: 20,
        duration: 0.5
      }, '-=0.3')
      .from('.pk-hero-cta', {
        opacity: 0,
        y: 20,
        duration: 0.5
      }, '-=0.2')
      .from('.pk-hero-image-area', {
        opacity: 0,
        scale: 0.92,
        y: 40,
        duration: 1,
        ease: 'power2.out'
      }, '-=0.5')
      .from('.pk-hero-side-card', {
        opacity: 0,
        x: 40,
        stagger: 0.1,
        duration: 0.6
      }, '-=0.7')
      .from('.pk-bottom-card', {
        opacity: 0,
        y: 30,
        stagger: 0.08,
        duration: 0.5
      }, '-=0.4')
      .from('.pk-hero-social', {
        opacity: 0,
        duration: 0.4
      }, '-=0.3');

    // Hero image parallax
    gsap.to('.pk-hero-image', {
      y: -60,
      ease: 'none',
      scrollTrigger: {
        trigger: '.pk-hero',
        start: 'top top',
        end: 'bottom top',
        scrub: 1
      }
    });

    // Hero side card hover micro-interaction
    document.querySelectorAll('.pk-hero-side-card').forEach(function (card) {
      card.addEventListener('mouseenter', function () {
        gsap.to(card, { y: -4, duration: 0.3, ease: 'power2.out' });
      });
      card.addEventListener('mouseleave', function () {
        gsap.to(card, { y: 0, duration: 0.3, ease: 'power2.out' });
      });
    });
  }

  /* ── HERO IMAGE LOAD — never block the page ──────────── */

  function initHeroImageLoad() {
    var img = document.getElementById('hero-image');
    var fallback = document.getElementById('hero-image-fallback');
    if (!img) return;

    // Always use the CSS fallback laptop visual instead of loading
    // a product image from Supabase. Product images have white
    // backgrounds that overlap the hero text and CTA buttons.
    img.style.display = 'none';
    if (fallback) fallback.style.display = 'flex';
  }

  // Hero image loading removed - always use CSS fallback laptop visual
  // Product images from Supabase have white backgrounds that overlap hero text

  /* ── SCROLL REVEALS — Safe Initialization ─────────────── */

  function initScrollReveals() {
    if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;

    if (!_gsapInitialized) {
      gsap.registerPlugin(ScrollTrigger);
      _gsapInitialized = true;
    }

    // Remove .pk-reveal from elements GSAP will animate directly
    document.querySelectorAll('.pk-section-title, .pk-section-subtitle, .pk-pill, .pk-newsletter').forEach(function (el) {
      el.classList.remove('pk-reveal');
      el.dataset.revealComplete = 'true';
    });

    // Section reveals with ScrollTrigger
    var sections = document.querySelectorAll('.pk-section');
    sections.forEach(function (section) {
      // Section titles
      section.querySelectorAll('.pk-section-title').forEach(function (title) {
        if (title.dataset.revealInit === 'true') return;
        title.dataset.revealInit = 'true';
        title.classList.remove('pk-reveal');
        gsap.from(title, {
          opacity: 0,
          y: 50,
          duration: 0.8,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: title,
            start: 'top 85%',
            once: true,
            invalidateOnRefresh: true,
            fastScrollEnd: true,
            onEnter: function () { title.dataset.revealComplete = 'true'; }
          }
        });
      });

      // Subtitles
      section.querySelectorAll('.pk-section-subtitle, .pk-pill').forEach(function (el) {
        if (el.dataset.revealInit === 'true') return;
        el.dataset.revealInit = 'true';
        el.classList.remove('pk-reveal');
        gsap.from(el, {
          opacity: 0,
          y: 30,
          duration: 0.6,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: el,
            start: 'top 85%',
            once: true,
            invalidateOnRefresh: true,
            onEnter: function () { el.dataset.revealComplete = 'true'; }
          }
        });
      });

      // Product/brand/trust/testimonial card stagger
      var cards = section.querySelectorAll('.pk-product-card, .pk-brand-card, .pk-trust-card, .pk-testimonial-card');
      if (cards.length > 0) {
        var parent = cards[0].parentElement;
        if (parent && parent.dataset.revealInit !== 'true') {
          parent.dataset.revealInit = 'true';
          cards.forEach(function (c) { c.classList.remove('pk-reveal'); });
          gsap.from(cards, {
            opacity: 0,
            y: 40,
            stagger: 0.08,
            duration: 0.6,
            ease: 'power2.out',
            scrollTrigger: {
              trigger: parent,
              start: 'top 80%',
              once: true,
              invalidateOnRefresh: true,
              fastScrollEnd: true,
              onEnter: function () {
                cards.forEach(function (c) { c.dataset.revealComplete = 'true'; });
              }
            }
          });
        }
      }
    });

    // Newsletter reveal
    var newsletter = document.querySelector('.pk-newsletter');
    if (newsletter && newsletter.dataset.revealInit !== 'true') {
      newsletter.dataset.revealInit = 'true';
      gsap.from(newsletter, {
        opacity: 0,
        y: 50,
        scale: 0.98,
        duration: 0.8,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: newsletter,
          start: 'top 85%',
          once: true,
          invalidateOnRefresh: true,
          onEnter: function () { newsletter.dataset.revealComplete = 'true'; }
        }
      });
    }

    // View All links
    document.querySelectorAll('.pk-section-link').forEach(function (link) {
      if (link.dataset.revealInit === 'true') return;
      link.dataset.revealInit = 'true';
      gsap.from(link, {
        opacity: 0,
        x: 20,
        duration: 0.5,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: link,
          start: 'top 85%',
          once: true,
          onEnter: function () { link.dataset.revealComplete = 'true'; }
        }
      });
    });
  }

  function animateContainerCards(container) {
    if (prefersReducedMotion || typeof gsap === 'undefined') return;
    var cards = container.querySelectorAll('.pk-product-card, .pk-brand-card, .pk-trust-card, .pk-testimonial-card');
    if (cards.length === 0) return;
    if (container.dataset.revealInit === 'true') return;
    container.dataset.revealInit = 'true';

    cards.forEach(function (c) {
      c.classList.remove('pk-reveal');
    });

    gsap.from(cards, {
      opacity: 0,
      y: 40,
      stagger: 0.08,
      duration: 0.6,
      ease: 'power2.out',
      scrollTrigger: {
        trigger: container,
        start: 'top 80%',
        once: true,
        invalidateOnRefresh: true,
        fastScrollEnd: true,
        onEnter: function () {
          cards.forEach(function (c) { c.dataset.revealComplete = 'true'; });
        }
      }
    });
  }

  /* ── FAIL-SAFE: Force visible any element that should be visible ── */

  function forceAllRevealsVisible() {
    document.querySelectorAll('.pk-reveal, .pk-reveal-scale, .pk-reveal-left, .pk-reveal-right').forEach(function (el) {
      el.style.opacity = '1';
      el.style.transform = 'none';
      el.dataset.revealComplete = 'true';
    });
    document.querySelectorAll('#hero-shell, .pk-hero-num, .pk-hero-subtitle, .pk-hero-cta, .pk-hero-image, .pk-hero-side-card, .pk-bottom-card, .pk-hero-social').forEach(function (el) {
      el.style.opacity = '1';
      el.style.transform = 'none';
    });
  }

  function failSafeRevealCheck() {
    var viewH = window.innerHeight;

    // Clear stale reveal flags
    var stale = document.querySelectorAll('[data-reveal-complete="true"]');
    for (var s = 0; s < stale.length; s++) {
      delete stale[s].dataset.revealComplete;
    }

    // Fail-safe coverage for EVERY reveal class
    var revealEls = document.querySelectorAll(
      '.pk-reveal, .pk-reveal-scale, .pk-reveal-left, .pk-reveal-right,' +
      '.pk-section-title, .pk-section-subtitle, .pk-pill, .pk-newsletter,' +
      '.pk-section-link, .pk-brand-card, .pk-product-card, .pk-testimonial-card,' +
      '.pk-trust-card, .pk-bottom-card, .pk-hero-side-card'
    );

    for (var i = 0; i < revealEls.length; i++) {
      var el = revealEls[i];
      if (el.dataset.revealComplete === 'true') continue;

      var rect = el.getBoundingClientRect();
      if (rect.top < viewH * 1.15) {
        var computed = window.getComputedStyle(el);
        var opacity = parseFloat(computed.opacity);
        if (opacity < 0.6) {
          el.style.opacity = '1';
          el.style.transform = 'none';
          el.dataset.revealComplete = 'true';
          console.warn('[app.js] Fail-safe: forced reveal on', el.className);
        }
      }
    }

    // Also cover the hero-motion elements
    document.querySelectorAll(
      '#hero-shell, .pk-hero-num, .pk-hero-subtitle, .pk-hero-cta,' +
      '.pk-hero-image, .pk-hero-side-card, .pk-bottom-card, .pk-hero-social'
    ).forEach(function (el) {
      var computed = window.getComputedStyle(el);
      if (parseFloat(computed.opacity) < 0.6) {
        el.style.opacity = '1';
        el.style.transform = 'none';
        console.warn('[app.js] Fail-safe: forced hero element visible');
      }
    });
  }

  /* ── DATA LOADERS ────────────────────────────────────── */

  async function loadFeaturedProducts() {
    var container = document.getElementById('featured-products');
    if (!container) return;

    container.innerHTML = skeleton('card', 4);

    var result = await db.from('products')
      .select('*, categories(name,slug), product_images(url,alt,sort_order,is_primary), product_variants(id,price)')
      .eq('is_featured', true)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(8);

    if (result.error || !result.data || result.data.length === 0) {
      container.innerHTML = '<div class="pk-empty"><p>No featured products yet.</p></div>';
      return;
    }

    var html = '';
    result.data.forEach(function (p, i) {
      p.category_name = p.categories ? p.categories.name : '';
      p.category_slug = p.categories ? p.categories.slug : '';
      html += renderProductCard(p, i);
    });
    container.innerHTML = html;

    animateContainerCards(container);
  }

  async function loadCategories() {
    var container = document.getElementById('categories-grid');
    if (!container) return;

    var result = await db.from('categories')
      .select('*')
      .eq('is_active', true)
      .order('sort_order');

    if (result.error || !result.data) return;

    var html = '';
    result.data.forEach(function (cat, i) {
      html += '<a href="/pages/shop.html?category=' + esc(cat.slug) + '" ' +
        'class="pk-category-card pk-reveal" style="transition-delay:' + (i * 0.08) + 's">' +
        '<div class="pk-category-card-icon">' +
          getCategoryEmoji(cat.slug) +
        '</div>' +
        '<h4>' + esc(cat.name) + '</h4>' +
        '<p style="font-size:0.85rem;color:var(--pk-text-muted);">' + esc(cat.description || '') + '</p>' +
      '</a>';
    });
    container.innerHTML = html;
  }

  function getCategoryEmoji(slug) {
    var map = {
      'gaming-laptops': '🎮',
      'business-laptops': '💼',
      'ultrabooks': '✨',
      'workstations': '🖥️',
      'chromebooks': '🌐',
      'accessories': '🎒',
      'components': '🔧',
      'refurbished': '♻️',
    };
    return map[slug] || '💻';
  }

  async function loadBrands() {
    var container = document.getElementById('brand-grid');
    if (!container) return;

    var result = await db.from('products')
      .select('brand')
      .eq('is_active', true)
      .is('deleted_at', null);

    if (result.error || !result.data) {
      container.innerHTML = '<p class="text-muted" style="text-align:center;">Brands unavailable</p>';
      return;
    }

    var brandCounts = {};
    result.data.forEach(function (p) {
      if (p.brand) {
        var b = p.brand.trim();
        if (!b) return;
        var lower = b.toLowerCase();
        if (!brandCounts[lower]) {
          brandCounts[lower] = { name: b, count: 0 };
        }
        brandCounts[lower].count++;
      }
    });

    var brands = Object.values(brandCounts)
      .sort(function (a, b) { return b.count - a.count; });

    if (brands.length === 0) {
      container.innerHTML = '<p class="text-muted" style="text-align:center;">No brands found</p>';
      return;
    }

    var html = '';
    brands.forEach(function (brand, i) {
      html += '<a href="/pages/shop.html?brand=' + encodeURIComponent(brand.name) + '" ' +
        'class="pk-brand-card">' +
        '<div class="pk-brand-card-logo">' + esc(brand.name) + '</div>' +
        '<div class="pk-brand-card-count">' + brand.count + ' laptops</div>' +
      '</a>';
    });
    container.innerHTML = html;

    animateContainerCards(container);
  }

  async function loadBestSellers() {
    var container = document.getElementById('bestsellers');
    if (!container) return;

    container.innerHTML = skeleton('card', 4);

    var result = await db.from('products')
      .select('*, categories(name,slug), product_images(url,alt,sort_order,is_primary), product_variants(id,price)')
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('sales_count', { ascending: false })
      .limit(4);

    if (result.error || !result.data || result.data.length === 0) {
      container.innerHTML = '<div class="pk-empty"><p>No best sellers yet.</p></div>';
      return;
    }

    var html = '';
    result.data.forEach(function (p, i) {
      p.category_name = p.categories ? p.categories.name : '';
      html += renderProductCard(p, i);
    });
    container.innerHTML = html;

    animateContainerCards(container);
  }

  function loadTestimonials() {
    var grid = document.querySelector('.pk-testimonial-grid');
    if (grid && typeof gsap !== 'undefined' && !prefersReducedMotion) {
      animateContainerCards(grid);
    }
    return Promise.resolve();
  }

  async function loadBottomCardStats() {
    var countEl = document.getElementById('product-count');
    var thumbsEl = document.getElementById('product-thumbs');
    var popularEl = document.getElementById('popular-thumb');

    try {
      var countResult = await db.from('products')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true)
        .is('deleted_at', null);

      var totalCount = countResult.count || 0;
      if (countEl) countEl.textContent = totalCount.toLocaleString() + ' laptops available';

      var thumbsResult = await db.from('products')
        .select('id, name, product_images(url, is_primary)')
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(3);

      if (thumbsEl && thumbsResult.data && thumbsResult.data.length > 0) {
        var thumbsHtml = '';
        thumbsResult.data.forEach(function (p) {
          var img = (p.product_images || []).find(function (i) { return i.is_primary; }) || (p.product_images || [])[0];
          var url = img ? productImageUrl(img.url) : '';
          if (url) {
            thumbsHtml += '<img src="' + url + '" alt="' + esc(p.name) + '" class="pk-bottom-card-thumb" loading="lazy" onerror="this.style.display=\'none\'">';
          }
        });
        if (thumbsHtml) thumbsEl.innerHTML = thumbsHtml;
      }
    } catch (e) {
      console.warn('[app.js] Bottom card stats error:', e.message);
      if (countEl) countEl.textContent = '—';
    }

    try {
      var popResult = await db.from('products')
        .select('name, price, product_images(url, is_primary)')
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('sales_count', { ascending: false })
        .limit(1);

      if (popularEl && popResult.data && popResult.data.length > 0) {
        var p = popResult.data[0];
        var img = (p.product_images || []).find(function (i) { return i.is_primary; }) || (p.product_images || [])[0];
        var imgHtml = '';
        if (img) {
          imgHtml = '<img src="' + productImageUrl(img.url) + '" alt="' + esc(p.name) + '" style="height:50px;width:auto;object-fit:contain;border-radius:var(--radius-sm);" loading="lazy" onerror="this.parentElement.innerHTML=\'<span>\' + esc(p.name) + \'</span>\'">';
        }
        popularEl.innerHTML = imgHtml || '<span>' + esc(p.name || 'Popular') + '</span>';
        popularEl.style.background = 'transparent';
      } else if (popularEl) {
        popularEl.textContent = '—';
      }
    } catch (e) {
      console.warn('[app.js] Popular now error:', e.message);
      if (popularEl) popularEl.textContent = '—';
    }
  }

  /* ── Newsletter ─────────────────────────────────────────── */

  function initNewsletter() {
    var form = document.getElementById('newsletter-form');
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = form.querySelector('input[type="email"]').value;
      if (email) {
        showToast('Thanks for subscribing! 🎉', 'success');
        form.reset();
      }
    });
  }

  /* ── Animated Counters ──────────────────────────────────── */

  function animateCounters() {
    var counters = document.querySelectorAll('[data-count]');
    if (!counters.length) return;

    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var el = entry.target;
          var target = parseInt(el.getAttribute('data-count'));
          var suffix = el.getAttribute('data-suffix') || '';
          var prefix = el.getAttribute('data-prefix') || '';

          if (typeof gsap !== 'undefined' && !prefersReducedMotion) {
            var obj = { val: 0 };
            gsap.to(obj, {
              val: target,
              duration: 2,
              ease: 'power2.out',
              onUpdate: function () {
                el.textContent = prefix + Math.floor(obj.val).toLocaleString() + suffix;
              }
            });
          } else {
            el.textContent = prefix + target.toLocaleString() + suffix;
          }
          obs.unobserve(el);
        }
      });
    }, { threshold: 0.5 });

    counters.forEach(function (el) { obs.observe(el); });
  }

  /* ── Header Scroll Effect ──────────────────────────────── */

  function initHeaderScroll() {
    var header = document.querySelector('.pk-header');
    if (!header) return;
    window.addEventListener('scroll', function () {
      var scrollY = window.scrollY || 0;
      if (scrollY > 50) {
        header.classList.add('scrolled');
      } else {
        header.classList.remove('scrolled');
      }
    }, { passive: true });
  }

  /* ── Sibling Focus Navigation ──────────────────────────── */

  function initSiblingFocusNav() {
    if (typeof CSS !== 'undefined' && CSS.supports && CSS.supports('selector(:has(a:hover))')) return;

    var navs = document.querySelectorAll('.pk-nav-sibling');
    navs.forEach(function (nav) {
      var links = nav.querySelectorAll('a, button');
      links.forEach(function (link) {
        link.addEventListener('mouseenter', function () {
          nav.classList.add('pk-sibling-dim');
          link.classList.add('pk-sibling-active');
        });
        link.addEventListener('mouseleave', function () {
          nav.classList.remove('pk-sibling-dim');
          link.classList.remove('pk-sibling-active');
        });
        link.addEventListener('focusin', function () {
          nav.classList.add('pk-sibling-dim');
          link.classList.add('pk-sibling-active');
        });
        link.addEventListener('focusout', function () {
          nav.classList.remove('pk-sibling-dim');
          link.classList.remove('pk-sibling-active');
        });
      });
    });
  }

  /* ── Theme Toggle Safety ────────────────────────────────── */

  window.addEventListener('themechange', function () {
    setTimeout(failSafeRevealCheck, 60);
  });
})();
