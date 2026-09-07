/**
 * split-reveal.js — Premium split shutter reveal preloader
 *
 * Shows on first hard visit per session (sessionStorage: pickora_intro_seen).
 * Waits for GSAP to be available before auto-running.
 * Respects prefers-reduced-motion.
 */
(function () {
  'use strict';

  var SESSION_KEY = 'pickora_intro_seen';
  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function shouldShow() {
    try { return !sessionStorage.getItem(SESSION_KEY); } catch (e) { return true; }
  }

  function markSeen() {
    try { sessionStorage.setItem(SESSION_KEY, '1'); } catch (e) {}
  }

  var savedScroll = 0;
  function lockScroll() {
    savedScroll = window.scrollY || 0;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = -savedScroll + 'px';
    document.body.style.width = '100%';
  }
  function unlockScroll() {
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.width = '';
    window.scrollTo(0, savedScroll);
  }

  function createOverlay() {
    var el = document.createElement('div');
    el.className = 'pk-split-reveal';
    el.innerHTML = '<div class="pk-split-top"></div><div class="pk-split-bottom"></div><div class="pk-split-center"><div class="pk-split-logo">PICKORA</div><div class="pk-split-loader"></div></div>';
    document.body.appendChild(el);
    return el;
  }

  function runReveal(callback) {
    var overlay = document.querySelector('.pk-split-reveal') || createOverlay();
    var topP = overlay.querySelector('.pk-split-top');
    var botP = overlay.querySelector('.pk-split-bottom');
    var center = overlay.querySelector('.pk-split-center');

    if (prefersReducedMotion) {
      overlay.remove();
      markSeen();
      if (callback) callback();
      return;
    }

    lockScroll();

    function animate() {
      if (typeof gsap !== 'undefined') {
        var tl = gsap.timeline({
          onComplete: function () {
            unlockScroll();
            overlay.remove();
            markSeen();
            if (callback) callback();
          }
        });
        tl.set(center, { opacity: 1 })
          .to(center, { opacity: 0, duration: 0.3, delay: 0.5, ease: 'power2.in' })
          .to(topP, { y: '-100%', duration: 0.9, ease: 'power4.inOut' }, 'shutters')
          .to(botP, { y: '100%', duration: 0.9, ease: 'power4.inOut' }, 'shutters');
      } else {
        // CSS fallback without GSAP
        setTimeout(function () { center.style.opacity = '0'; center.style.transition = 'opacity 0.3s'; }, 500);
        setTimeout(function () {
          topP.style.transform = 'translateY(-100%)';
          botP.style.transform = 'translateY(100%)';
          topP.style.transition = 'transform 0.9s cubic-bezier(0.76,0,0.24,1)';
          botP.style.transition = 'transform 0.9s cubic-bezier(0.76,0,0.24,1)';
        }, 800);
        setTimeout(function () { unlockScroll(); overlay.remove(); markSeen(); if (callback) callback(); }, 1800);
      }
    }

    // If GSAP not yet loaded, wait briefly
    if (typeof gsap === 'undefined') {
      var attempts = 0;
      var waiter = setInterval(function () {
        attempts++;
        if (typeof gsap !== 'undefined' || attempts > 20) {
          clearInterval(waiter);
          animate();
        }
      }, 50);
    } else {
      animate();
    }
  }

  window.pkSplitReveal = {
    run: runReveal,
    force: function (cb) { sessionStorage.removeItem(SESSION_KEY); runReveal(cb); },
    skip: function () { markSeen(); var o = document.querySelector('.pk-split-reveal'); if (o) { unlockScroll(); o.remove(); } },
  };

  // Auto-run on first visit
  if (shouldShow()) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        runReveal(function () { window.dispatchEvent(new Event('pk-split-reveal-done')); });
      });
    } else {
      runReveal(function () { window.dispatchEvent(new Event('pk-split-reveal-done')); });
    }
  } else {
    // Already seen — fire event immediately
    window.dispatchEvent(new Event('pk-split-reveal-done'));
  }
})();
