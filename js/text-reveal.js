/**
 * text-reveal.js — Wave/line text reveal animation system
 *
 * Data attributes:
 *   data-wave-reveal           — enable on element
 *   data-wave-mode="word|letter" — split mode (default: word)
 *   data-wave-direction="up|down" — reveal direction (default: up)
 *   data-wave-blur="true|false" — blur mode (default: false)
 *   data-wave-delay="0" — base delay in ms
 *   data-wave-defer            — wait for pk-split-reveal-done event before animating
 *
 * Uses IntersectionObserver. Respects prefers-reduced-motion.
 */
(function () {
  'use strict';

  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var splitRevealDone = !window.pkSplitReveal; // If no split reveal exists, already done
  var deferredElements = [];

  function splitWords(text) {
    return text.trim().split(/\s+/).map(function (w) { return w; });
  }

  function splitLetters(text) {
    var chars = [];
    for (var i = 0; i < text.length; i++) {
      chars.push(text[i] === ' ' ? '\u00A0' : text[i]);
    }
    return chars;
  }

  function prepareElement(el) {
    // Don't re-prepare elements already split
    if (el.classList.contains('pk-wave-reveal')) return null;

    var mode = el.getAttribute('data-wave-mode') || 'word';
    var direction = el.getAttribute('data-wave-direction') || 'up';
    var blur = el.getAttribute('data-wave-blur') === 'true';
    var baseDelay = parseInt(el.getAttribute('data-wave-delay') || '0', 10);
    var originalText = el.textContent;

    if (prefersReducedMotion) return;

    var segments = mode === 'letter' ? splitLetters(originalText) : splitWords(originalText);

    el.setAttribute('aria-label', originalText);
    el.classList.add('pk-wave-reveal');
    el.style.overflow = 'hidden';

    el.innerHTML = '';
    segments.forEach(function (seg, i) {
      var text = (typeof seg === 'string') ? seg : seg.text;
      var wrapper = document.createElement('span');
      wrapper.className = 'pk-wave-segment';
      wrapper.style.display = 'inline-block';
      wrapper.style.overflow = 'hidden';

      var inner = document.createElement('span');
      inner.className = 'pk-wave-inner';
      inner.textContent = text;
      inner.style.display = 'block';
      inner.style.transition = 'none';
      inner.style.willChange = 'transform, opacity, filter';

      var startY = direction === 'up' ? '80%' : '-80%';
      inner.style.transform = 'translateY(' + startY + ')';
      inner.style.opacity = '0';
      if (blur) inner.style.filter = 'blur(4px)';

      wrapper.appendChild(inner);
      el.appendChild(wrapper);

      if (mode === 'word' && i < segments.length - 1 && text !== ' ') {
        el.appendChild(document.createTextNode(' '));
      }
    });

    return { el: el, direction: direction, blur: blur, baseDelay: baseDelay };
  }

  function animateElement(el, direction, blur, baseDelay) {
    var inners = el.querySelectorAll('.pk-wave-inner');
    var stagger = 0.04;
    var maxDur = 0.8 + (inners.length * stagger);

    // Force reflow to clear 'none' transition from prepare phase
    inners.forEach(function (inner) { inner.offsetHeight; });

    inners.forEach(function (inner, i) {
      var delay = baseDelay / 1000 + (i * stagger);
      inner.style.transition = [
        'transform ' + maxDur + 's cubic-bezier(0.16, 1, 0.3, 1) ' + delay + 's',
        'opacity ' + (maxDur * 0.6) + 's ease ' + delay + 's',
        blur ? ('filter ' + maxDur + 's ease ' + delay + 's') : '',
      ].filter(Boolean).join(', ');
    });

    // Second frame: trigger the actual animation
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        inners.forEach(function (inner) {
          inner.style.transform = 'translateY(0)';
          inner.style.opacity = '1';
          inner.style.filter = 'none';
        });
      });
    });

    // Clean up text-reveal artifacts once the animation has run.
    // This removes the ghosting/chromatic outline reported on the
    // "Stay in the Loop" heading: filter and will-change are torn
    // down and the element is returned to a plain text state.
    setTimeout(function () {
      inners.forEach(function (inner) {
        inner.style.transition = 'none';
        inner.style.willChange = 'auto';
        inner.style.filter = 'none';
        inner.style.transform = 'translateY(0)';
        inner.style.opacity = '1';
      });
    }, maxDur * 1000 + 120);
  }

  function init() {
    var elements = document.querySelectorAll('[data-wave-reveal]');
    if (!elements.length) return;

    var heroElements = [];
    var scrollElements = [];

    elements.forEach(function (el) {
      if (prefersReducedMotion) {
        el.style.opacity = '1';
        return;
      }

      var info = prepareElement(el);
      if (!info) return;

      // Hero elements (inside .pk-hero) should defer until split reveal done
      if (el.closest && el.closest('.pk-hero')) {
        heroElements.push(info);
      } else {
        scrollElements.push(info);
      }
    });

    // Scroll-triggered elements (non-hero)
    scrollElements.forEach(function (info) {
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            observer.unobserve(info.el);
            animateElement(info.el, info.direction, info.blur, info.baseDelay);
          }
        });
      }, { threshold: 0.15 });
      observer.observe(info.el);
    });

    // Hero elements — animate after split reveal (or immediately if no split reveal)
    function animateHeroElements() {
      heroElements.forEach(function (info, i) {
        var delay = i * 150; // Stagger hero elements
        setTimeout(function () {
          animateElement(info.el, info.direction, info.blur, info.baseDelay);
        }, delay);
      });
    }

    if (splitRevealDone) {
      // Split reveal already done, animate with small delay for page load
      setTimeout(animateHeroElements, 300);
    } else {
      // Wait for split reveal to complete
      window.addEventListener('pk-split-reveal-done', function handler() {
        window.removeEventListener('pk-split-reveal-done', handler);
        setTimeout(animateHeroElements, 100);
      });
      // Safety fallback
      setTimeout(animateHeroElements, 5000);
    }
  }

  window.pkTextReveal = {
    reveal: function (el, opts) {
      opts = opts || {};
      // If not yet prepared, prepare first
      if (!el.classList.contains('pk-wave-reveal')) {
        prepareElement(el);
      }
      animateElement(el, opts.direction || 'up', opts.blur || false, opts.delay || 0);
    },
    markSplitDone: function () { splitRevealDone = true; },
  };

  window.addEventListener('pk-split-reveal-done', function () {
    splitRevealDone = true;
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
