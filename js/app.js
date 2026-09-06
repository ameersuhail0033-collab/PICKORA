/**
 * app.js — Homepage logic with GSAP Motion System
 * Hero entrance animation, ScrollTrigger reveals, text animations, parallax
 */
(function () {
  'use strict';

  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.addEventListener('DOMContentLoaded', async function () {
    if (window.location.pathname !== '/' && window.location.pathname !== '/index.html') return;

    if (!window.db) await new Promise(function (r) { setTimeout(r, 300); });

    loadFeaturedProducts();
    loadCategories();
    loadBestSellers();
    loadTestimonials();
    initNewsletter();
    animateCounters();

    if (!prefersReducedMotion && typeof gsap !== 'undefined') {
      initGSAPAnimations();
    } else {
      // Fallback: just show everything
      document.querySelectorAll('.pk-reveal, .pk-reveal-scale').forEach(function (el) {
        el.style.opacity = '1';
        el.style.transform = 'none';
      });
    }
  });

  /* ── GSAP Motion System ─────────────────────────────────── */
  function initGSAPAnimations() {
    if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;

    gsap.registerPlugin(ScrollTrigger);

    // Hero entrance timeline
    // First: clear CSS reveal states so GSAP controls opacity
    gsap.set('#hero-shell, .pk-hero-pill, .pk-hero-title, .pk-hero-num, .pk-hero-subtitle, .pk-hero-cta, .pk-hero-image, .pk-hero-side-card, .pk-bottom-card, .pk-hero-social', { opacity: 1, x: 0, y: 0, scale: 1 });

    var heroTl = gsap.timeline({ defaults: { ease: 'power3.out', duration: 0.8 } });

    heroTl
      .from('#hero-shell', {
        opacity: 0,
        scale: 0.96,
        y: 30,
        duration: 1,
        ease: 'power4.out'
      })
      .from('.pk-hero-pill', {
        opacity: 0,
        y: 20,
        duration: 0.5
      }, '-=0.5')
      .from('.pk-hero-title', {
        opacity: 0,
        y: 40,
        duration: 0.7
      }, '-=0.3')
      .from('.pk-hero-num', {
        opacity: 0,
        x: -30,
        duration: 0.5
      }, '-=0.4')
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
      .from('.pk-hero-image', {
        opacity: 0,
        scale: 0.92,
        y: 40,
        duration: 1,
        ease: 'power2.out'
      }, '-=0.6')
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

    // Hero image parallax on scroll
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

    // Section reveals with ScrollTrigger
    var sections = document.querySelectorAll('.pk-section');
    sections.forEach(function (section) {
      // Section title text animation
      var titles = section.querySelectorAll('.pk-section-title');
      titles.forEach(function (title) {
        gsap.from(title, {
          opacity: 0,
          y: 50,
          duration: 0.8,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: title,
            start: 'top 85%',
            toggleActions: 'play none none none'
          }
        });
      });

      // Subtitle reveals
      var subtitles = section.querySelectorAll('.pk-section-subtitle, .pk-pill');
      subtitles.forEach(function (el) {
        gsap.from(el, {
          opacity: 0,
          y: 30,
          duration: 0.6,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: el,
            start: 'top 85%',
            toggleActions: 'play none none none'
          }
        });
      });

      // Product cards stagger
      var cards = section.querySelectorAll('.pk-product-card, .pk-brand-card, .pk-trust-card, .pk-testimonial-card');
      if (cards.length > 0) {
        gsap.from(cards, {
          opacity: 0,
          y: 40,
          stagger: 0.08,
          duration: 0.6,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: cards[0].parentElement,
            start: 'top 80%',
            toggleActions: 'play none none none'
          }
        });
      }
    });

    // Newsletter reveal
    var newsletter = document.querySelector('.pk-newsletter');
    if (newsletter) {
      gsap.from(newsletter, {
        opacity: 0,
        y: 50,
        scale: 0.98,
        duration: 0.8,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: newsletter,
          start: 'top 85%',
          toggleActions: 'play none none none'
        }
      });
    }

    // View All link slide
    var viewAllLinks = document.querySelectorAll('.pk-section-link');
    viewAllLinks.forEach(function (link) {
      gsap.from(link, {
        opacity: 0,
        x: 20,
        duration: 0.5,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: link,
          start: 'top 85%',
          toggleActions: 'play none none none'
        }
      });
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

  /* ── Featured Products ──────────────────────────────────── */
  async function loadFeaturedProducts() {
    var container = document.getElementById('featured-products');
    if (!container) return;

    container.innerHTML = skeleton('card', 4);

    var result = await db.from('products')
      .select('*, categories(name,slug), product_images(url,alt,sort_order,is_primary)')
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

    // Animate new cards with GSAP if available
    if (typeof gsap !== 'undefined') {
      gsap.from(container.querySelectorAll('.pk-product-card'), {
        opacity: 0,
        y: 40,
        stagger: 0.08,
        duration: 0.6,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: container,
          start: 'top 80%',
          toggleActions: 'play none none none'
        }
      });
    }
  }

  /* ── Categories ─────────────────────────────────────────── */
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

  /* ── Best Sellers ───────────────────────────────────────── */
  async function loadBestSellers() {
    var container = document.getElementById('bestsellers');
    if (!container) return;

    container.innerHTML = skeleton('card', 4);

    var result = await db.from('products')
      .select('*, categories(name,slug), product_images(url,alt,sort_order,is_primary)')
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('sales_count', { ascending: false })
      .limit(4);

    if (result.error || !result.data || result.data.length === 0) {
      container.innerHTML = '';
      return;
    }

    var html = '';
    result.data.forEach(function (p, i) {
      p.category_name = p.categories ? p.categories.name : '';
      html += renderProductCard(p, i);
    });
    container.innerHTML = html;

    // Animate with GSAP
    if (typeof gsap !== 'undefined') {
      gsap.from(container.querySelectorAll('.pk-product-card'), {
        opacity: 0,
        y: 40,
        stagger: 0.08,
        duration: 0.6,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: container,
          start: 'top 80%',
          toggleActions: 'play none none none'
        }
      });
    }
  }

  /* ── Testimonials ───────────────────────────────────────── */
  function loadTestimonials() {
    // Testimonials are static in the HTML
    // Just initialize GSAP for them
    if (typeof gsap !== 'undefined') {
      var cards = document.querySelectorAll('.pk-testimonial-card');
      if (cards.length > 0) {
        gsap.from(cards, {
          opacity: 0,
          y: 40,
          stagger: 0.1,
          duration: 0.6,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: cards[0].parentElement,
            start: 'top 80%',
            toggleActions: 'play none none none'
          }
        });
      }
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

          if (typeof gsap !== 'undefined') {
            // Use GSAP for smooth counter
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
            // Fallback
            var duration = 1500;
            var startTime = null;
            function step(timestamp) {
              if (!startTime) startTime = timestamp;
              var progress = Math.min((timestamp - startTime) / duration, 1);
              var eased = 1 - Math.pow(1 - progress, 3);
              el.textContent = prefix + Math.floor(eased * target).toLocaleString() + suffix;
              if (progress < 1) requestAnimationFrame(step);
            }
            requestAnimationFrame(step);
          }
          obs.unobserve(el);
        }
      });
    }, { threshold: 0.5 });

    counters.forEach(function (el) { obs.observe(el); });
  }
})();
