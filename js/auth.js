/**
 * auth.js — Authentication page logic
 * Handles login, register, forgot-password, reset-password forms.
 */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    var page = window.location.pathname;

    // ── Login Page ──
    if (page.indexOf('login') !== -1) {
      initLoginPage();
    }
    // ── Register Page ──
    if (page.indexOf('register') !== -1) {
      initRegisterPage();
    }
    // ── Forgot Password Page ──
    if (page.indexOf('forgot-password') !== -1) {
      initForgotPasswordPage();
    }
    // ── Reset Password Page ──
    if (page.indexOf('reset-password') !== -1) {
      initResetPasswordPage();
    }

    // Handle OAuth callback (hash in URL)
    handleOAuthCallback();
  });

  /* ── Login ──────────────────────────────────────────────── */
  function initLoginPage() {
    var form = document.getElementById('login-form');
    if (!form) return;

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var email = form.querySelector('[name="email"]').value.trim();
      var password = form.querySelector('[name="password"]').value;
      var btn = form.querySelector('button[type="submit"]');
      var errorEl = document.getElementById('login-error');

      if (!email || !password) {
        showError(errorEl, 'Please fill in all fields');
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Signing in...';
      hideError(errorEl);

      var result = await signIn(email, password);

      btn.disabled = false;
      btn.textContent = 'Sign In';

      if (result.error) {
        showError(errorEl, result.error.message);
      } else {
        await mergeGuestCart();
        var returnTo = getParam('return') || '/';
        window.location.href = returnTo;
      }
    });

    // Google sign-in
    var googleBtn = document.getElementById('google-signin');
    if (googleBtn) {
      googleBtn.addEventListener('click', async function () {
        await signInWithGoogle();
      });
    }

    // Magic link
    var magicBtn = document.getElementById('magic-link-btn');
    if (magicBtn) {
      magicBtn.addEventListener('click', async function () {
        var email = form.querySelector('[name="email"]').value.trim();
        if (!email) {
          showError(errorEl, 'Enter your email above, then click Magic Link');
          return;
        }
        magicBtn.disabled = true;
        magicBtn.textContent = 'Sending...';
        var result = await signInWithMagicLink(email);
        magicBtn.disabled = false;
        magicBtn.textContent = 'Send Magic Link';
        if (result.error) {
          showError(errorEl, result.error.message);
        } else {
          showToast('Magic link sent! Check your email.', 'success');
        }
      });
    }
  }

  /* ── Register ───────────────────────────────────────────── */
  function initRegisterPage() {
    var form = document.getElementById('register-form');
    if (!form) return;

    // Password strength indicator
    var passwordInput = form.querySelector('[name="password"]');
    if (passwordInput) {
      passwordInput.addEventListener('input', function () {
        updatePasswordStrength(this.value);
      });
    }

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var name = form.querySelector('[name="full_name"]').value.trim();
      var email = form.querySelector('[name="email"]').value.trim();
      var password = form.querySelector('[name="password"]').value;
      var confirm = form.querySelector('[name="confirm_password"]').value;
      var btn = form.querySelector('button[type="submit"]');
      var errorEl = document.getElementById('register-error');

      if (!name || !email || !password) {
        showError(errorEl, 'Please fill in all fields');
        return;
      }
      if (password.length < 8) {
        showError(errorEl, 'Password must be at least 8 characters');
        return;
      }
      if (password !== confirm) {
        showError(errorEl, 'Passwords do not match');
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Creating account...';
      hideError(errorEl);

      var result = await signUp(email, password, name);

      btn.disabled = false;
      btn.textContent = 'Create Account';

      if (result.error) {
        showError(errorEl, result.error.message);
      } else {
        if (result.data && result.data.user && result.data.user.identities && result.data.user.identities.length === 0) {
          showError(errorEl, 'An account with this email already exists');
        } else {
          showToast('Account created! Check your email to verify.', 'success');
          setTimeout(function () {
            window.location.href = '/pages/login.html';
          }, 2000);
        }
      }
    });

    // Google sign-in
    var googleBtn = document.getElementById('google-signin');
    if (googleBtn) {
      googleBtn.addEventListener('click', async function () {
        await signInWithGoogle();
      });
    }
  }

  /* ── Forgot Password ────────────────────────────────────── */
  function initForgotPasswordPage() {
    var form = document.getElementById('forgot-form');
    if (!form) return;

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var email = form.querySelector('[name="email"]').value.trim();
      var btn = form.querySelector('button[type="submit"]');
      var errorEl = document.getElementById('forgot-error');
      var successEl = document.getElementById('forgot-success');

      if (!email) {
        showError(errorEl, 'Please enter your email');
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Sending...';
      hideError(errorEl);

      var result = await resetPassword(email);

      btn.disabled = false;
      btn.textContent = 'Send Reset Link';

      if (result.error) {
        showError(errorEl, result.error.message);
      } else {
        if (successEl) successEl.style.display = 'block';
        showToast('Reset link sent! Check your email.', 'success');
      }
    });
  }

  /* ── Reset Password ─────────────────────────────────────── */
  function initResetPasswordPage() {
    var form = document.getElementById('reset-form');
    if (!form) return;

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var password = form.querySelector('[name="password"]').value;
      var confirm = form.querySelector('[name="confirm_password"]').value;
      var btn = form.querySelector('button[type="submit"]');
      var errorEl = document.getElementById('reset-error');

      if (!password || password.length < 8) {
        showError(errorEl, 'Password must be at least 8 characters');
        return;
      }
      if (password !== confirm) {
        showError(errorEl, 'Passwords do not match');
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Updating...';
      hideError(errorEl);

      var result = await updatePassword(password);

      btn.disabled = false;
      btn.textContent = 'Update Password';

      if (result.error) {
        showError(errorEl, result.error.message);
      } else {
        showToast('Password updated!', 'success');
        setTimeout(function () {
          window.location.href = '/pages/profile.html';
        }, 1500);
      }
    });
  }

  /* ── OAuth Callback ─────────────────────────────────────── */
  async function handleOAuthCallback() {
    // Check if we have a hash (from OAuth redirect)
    if (window.location.hash && window.location.hash.indexOf('access_token') !== -1) {
      // Supabase handles this automatically via detectSessionInUrl
      var session = await getSession();
      if (session) {
        await mergeGuestCart();
        showToast('Welcome!', 'success');
        window.location.href = getParam('return') || '/';
      }
    }
  }

  /* ── Helpers ────────────────────────────────────────────── */
  function showError(el, msg) {
    if (el) {
      el.textContent = msg;
      el.style.display = 'block';
    }
  }
  function hideError(el) {
    if (el) {
      el.textContent = '';
      el.style.display = 'none';
    }
  }

  function updatePasswordStrength(password) {
    var bars = document.querySelectorAll('.password-strength-bar');
    if (!bars.length) return;

    var strength = 0;
    if (password.length >= 8) strength++;
    if (password.length >= 12) strength++;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;

    var level = strength <= 2 ? 'weak' : strength <= 3 ? 'medium' : 'strong';

    bars.forEach(function (bar, i) {
      bar.className = 'password-strength-bar';
      if (i < Math.min(strength, 4)) {
        bar.classList.add('active-' + level);
      }
    });
  }
})();
