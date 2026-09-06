/**
 * setup.js — Setup wizard logic
 * Multi-step form: brand info → colors → contact → admin account
 * First user auto-becomes admin via SQL trigger.
 */
(function () {
  'use strict';

  var currentStep = 1;

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
        // Already configured, redirect to home
        window.location.href = '/';
      }
    } catch (e) {
      // Table might not exist yet
      console.log('[setup] Checking configuration:', e.message);
    }
  }

  window.setupNext = function setupNext(fromStep) {
    // Validate current step
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

  window.submitSetup = async function submitSetup() {
    var errorEl = document.getElementById('setup-error');
    errorEl.style.display = 'none';

    var adminName = document.getElementById('s-admin-name').value.trim();
    var adminEmail = document.getElementById('s-admin-email').value.trim();
    var adminPassword = document.getElementById('s-admin-password').value;

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

      // Wait for the trigger to create the profile
      await new Promise(function (r) { setTimeout(r, 2000); });

      // Sign in to get a session for the RPC call
      var signInResult = await auth.signInWithPassword({ email: adminEmail, password: adminPassword });
      if (signInResult.error) throw new Error(signInResult.error.message);

      // 2. Upload logo if provided
      var logoUrl = '';
      var faviconUrl = '';
      var logoFile = document.getElementById('s-logo').files[0];
      var faviconFile = document.getElementById('s-favicon').files[0];

      if (authData && authData.user) {
        if (logoFile) {
          var logoResult = await uploadFile('store-assets', 'logo', logoFile);
          if (logoResult.data) logoUrl = getPublicUrl('store-assets', logoResult.data.path);
        }
        if (faviconFile) {
          var favResult = await uploadFile('store-assets', 'favicon', faviconFile);
          if (favResult.data) faviconUrl = getPublicUrl('store-assets', favResult.data.path);
        }
      }

      // 3. Create store settings
      var settingsData = {
        store_name: document.getElementById('s-store-name').value.trim(),
        company_name: document.getElementById('s-company-name').value.trim(),
        logo_url: logoUrl,
        favicon_url: faviconUrl,
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

      // Insert settings (first insert is allowed by RLS policy)
      var settingsResult = await db.from('store_settings').insert(settingsData);
      if (settingsResult.error) {
        console.error('[setup] Settings insert error:', settingsResult.error);
        // Try update instead
        var existing = await db.from('store_settings').select('id').limit(1).single();
        if (existing.data) {
          await db.from('store_settings').update(settingsData).eq('id', existing.data.id);
        }
      }

      // 4. Promote this user to super_admin via secure server endpoint
      // The browser NEVER calls setup_first_admin() directly.
      // It POSTs to /api/setup-admin which verifies the secret server-side.
      if (authData && authData.user) {
        var setupSecret = document.getElementById('s-setup-secret');
        var secretValue = setupSecret ? setupSecret.value.trim() : '';

        if (!secretValue) {
          throw new Error('Setup secret is required. Enter the SETUP_ADMIN_SECRET value from your .env file.');
        }

        var session = await auth.getSession();
        var promoteResp = await fetch('/api/setup-admin', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + (session.data.session ? session.data.session.access_token : ''),
          },
          body: JSON.stringify({
            user_id: authData.user.id,
            setup_secret: secretValue,
          }),
        });

        var promoteData = await promoteResp.json();
        if (!promoteResp.ok || promoteData.error) {
          throw new Error(promoteData.error || 'Failed to create admin account');
        }
      }

      // Re-sign in to get fresh token with admin role
      await auth.signInWithPassword({ email: adminEmail, password: adminPassword });

      // 5. Show success
      currentStep = 5;
      updateSetupSteps();

    } catch (err) {
      errorEl.textContent = err.message || 'Setup failed. Please try again.';
      errorEl.style.display = 'block';
      submitBtn.disabled = false;
      submitBtn.textContent = '🚀 Launch Store';
    }
  };
})();
