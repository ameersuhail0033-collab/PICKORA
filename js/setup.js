/**
 * setup.js — Setup wizard logic
 * Multi-step form: brand info → colors → contact → admin account
 *
 * SECURE FLOW:
 * 1. Collect store details (steps 1-3)
 * 2. Create/authenticate admin account (step 4)
 * 3. Handle email confirmation if needed
 * 4. POST to /api/initialize-store (server-side)
 * 5. Server handles: admin promotion, file uploads, store_settings
 */
(function () {
  'use strict';

  var currentStep = 1;
  var pendingSetupData = null;

  // Color preview listeners
  document.addEventListener('DOMContentLoaded', function () {
    var inputs = ['s-primary', 's-secondary', 's-accent'];
    inputs.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', function () {
          var key = id.replace('s-', 'preview-');
          var preview = document.getElementById(key);
          if (preview) preview.style.background = el.value;
        });
      }
    });

    // Check if already configured
    checkIfConfigured();
  });

  async function checkIfConfigured() {
    if (!window.db) await new Promise(function (r) { setTimeout(r, 500); });
    try {
      var result = await db.from('store_settings').select('id').limit(1);
      if (result.data && result.data.length > 0) {
        window.location.href = '/';
      }
    } catch (e) {
      console.log('[setup] Checking configuration:', e.message);
    }
  }

  window.setupNext = function setupNext(fromStep) {
    if (fromStep === 1) {
      var name = document.getElementById('s-store-name').value.trim();
      if (!name) { alert('Please enter a store name'); return; }
    }
    if (fromStep === 3) {
      var email = document.getElementById('s-support-email').value.trim();
      if (!email) { alert('Please enter a support email'); return; }
    }
    currentStep = fromStep + 1;
    updateSetupSteps();
  };

  window.setupBack = function setupBack(fromStep) {
    currentStep = fromStep - 1;
    updateSetupSteps();
  };

  function updateSetupSteps() {
    document.querySelectorAll('.setup-step').forEach(function (el) {
      el.classList.toggle('active', parseInt(el.dataset.step) === currentStep);
    });
    document.querySelectorAll('.setup-step-dot').forEach(function (dot) {
      var step = parseInt(dot.dataset.step);
      dot.classList.toggle('active', step === currentStep);
      dot.classList.toggle('completed', step < currentStep);
    });
  }

  /** Convert file to base64 */
  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var base64 = reader.result.split(',')[1];
        resolve({ base64: base64, type: file.type.split('/')[1] || 'png' });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  window.submitSetup = async function submitSetup() {
    var errorEl = document.getElementById('setup-error');
    var successEl = document.getElementById('setup-email-sent');
    errorEl.style.display = 'none';
    if (successEl) successEl.style.display = 'none';

    var adminName = document.getElementById('s-admin-name').value.trim();
    var adminEmail = document.getElementById('s-admin-email').value.trim();
    var adminPassword = document.getElementById('s-admin-password').value;
    var setupSecret = document.getElementById('s-setup-secret');
    var secretValue = setupSecret ? setupSecret.value.trim() : '';

    if (!adminName || !adminEmail || !adminPassword) {
      errorEl.textContent = 'Please fill in all fields';
      errorEl.style.display = 'block';
      return;
    }
    if (adminPassword.length < 8) {
      errorEl.textContent = 'Password must be at least 8 characters';
      errorEl.style.display = 'block';
      return;
    }
    if (!secretValue) {
      errorEl.textContent = 'Setup secret is required. Enter the SETUP_ADMIN_SECRET from your .env file.';
      errorEl.style.display = 'block';
      return;
    }

    var submitBtn = document.getElementById('setup-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Setting up...';

    try {
      // 1. Create Supabase auth user
      var { data: authData, error: authError } = await auth.signUp({
        email: adminEmail,
        password: adminPassword,
        options: { data: { full_name: adminName } },
      });

      if (authError) throw new Error(authError.message);

      // 2. Check if email confirmation is required
      // If signUp returns no session, email confirmation is needed
      var session = null;
      if (authData && authData.session) {
        session = authData.session;
      } else if (authData && authData.user) {
        // User created but no session — email confirmation required
        // Show verification state and preserve setup data
        pendingSetupData = {
          user_id: authData.user.id,
          adminEmail: adminEmail,
          adminPassword: adminPassword,
        };

        submitBtn.disabled = false;
        submitBtn.textContent = '🚀 Launch Store';

        if (successEl) {
          successEl.innerHTML = '<strong>Verify your email</strong><br>' +
            'A verification link has been sent to <strong>' + esc(adminEmail) + '</strong>. ' +
            'Click the link to verify your email, then return to this page and sign in normally. ' +
            'After signing in, run the setup wizard again with the same setup secret.';
          successEl.style.display = 'block';
        }
        return;
      }

      // 3. We have a session — proceed with initialization
      await initializeStore(session.access_token, authData.user.id, secretValue);

    } catch (err) {
      errorEl.textContent = err.message || 'Setup failed. Please try again.';
      errorEl.style.display = 'block';
      submitBtn.disabled = false;
      submitBtn.textContent = '🚀 Launch Store';
    }
  };

  async function initializeStore(accessToken, userId, setupSecret) {
    var errorEl = document.getElementById('setup-error');
    var submitBtn = document.getElementById('setup-submit');

    try {
      // Collect store data
      var logoFile = document.getElementById('s-logo').files[0];
      var faviconFile = document.getElementById('s-favicon').files[0];

      var payload = {
        user_id: userId,
        setup_secret: setupSecret,
        store_name: document.getElementById('s-store-name').value.trim(),
        company_name: document.getElementById('s-company-name').value.trim(),
        primary_color: document.getElementById('s-primary').value,
        secondary_color: document.getElementById('s-secondary').value,
        accent_color: document.getElementById('s-accent').value,
        currency: document.getElementById('s-currency').value,
        support_email: document.getElementById('s-support-email').value.trim(),
        support_phone: document.getElementById('s-support-phone').value.trim(),
        address: document.getElementById('s-address').value.trim(),
        social_facebook: document.getElementById('s-facebook').value.trim(),
        social_instagram: document.getElementById('s-instagram').value.trim(),
      };

      // Convert files to base64 if provided
      if (logoFile) {
        var logoData = await fileToBase64(logoFile);
        payload.logo_base64 = logoData.base64;
        payload.logo_type = logoData.type;
      }
      if (faviconFile) {
        var favData = await fileToBase64(faviconFile);
        payload.favicon_base64 = favData.base64;
        payload.favicon_type = favData.type;
      }

      // Call server-side initialization endpoint
      var resp = await fetch('/api/initialize-store', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + accessToken,
        },
        body: JSON.stringify(payload),
      });

      var data = await resp.json();
      if (!resp.ok || data.error) {
        throw new Error(data.error || 'Failed to initialize store');
      }

      // Re-sign in to get fresh token with admin role
      await auth.signInWithPassword({
        email: document.getElementById('s-admin-email').value.trim(),
        password: document.getElementById('s-admin-password').value,
      });

      // Show success
      currentStep = 5;
      updateSetupSteps();

    } catch (err) {
      errorEl.textContent = err.message || 'Setup failed. Please try again.';
      errorEl.style.display = 'block';
      submitBtn.disabled = false;
      submitBtn.textContent = '🚀 Launch Store';
    }
  }

  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
})();
