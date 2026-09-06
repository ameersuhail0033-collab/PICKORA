/**
 * checkout.js — Checkout page logic
 * Handles multi-step checkout, order creation, and Nomad redirect.
 */
(function () {
  'use strict';

  var cartData = [];
  var checkoutStep = 1;
  var orderData = {};

  document.addEventListener('DOMContentLoaded', async function () {
    if (!window.db) await new Promise(function (r) { setTimeout(r, 300); });
    if (!document.getElementById('checkout-form-container')) return;

    // Check auth
    var user = await getUser();
    if (!user) {
      window.location.href = '/pages/login.html?return=/pages/checkout.html';
      return;
    }

    // Check for payment success/failure from redirect
    var paymentStatus = getParam('payment');
    var orderNumber = getParam('order');
    if (paymentStatus === 'success' && orderNumber) {
      showCheckoutSuccess(orderNumber);
      return;
    }

    await loadCheckoutSummary();
    loadSavedAddresses();
  });

  async function loadCheckoutSummary() {
    cartData = await getCart();
    if (!cartData || cartData.length === 0) {
      window.location.href = '/pages/cart.html';
      return;
    }

    var summary = document.getElementById('checkout-summary');
    if (!summary) return;

    var subtotal = 0;
    var itemsHtml = '';

    for (var i = 0; i < cartData.length; i++) {
      var item = cartData[i];
      var product = item.products;
      var variant = item.product_variants;
      if (!product) continue;

      var imgUrl = 'https://picsum.photos/seed/product/80/80';
      var imgResult = await db.from('product_images').select('url').eq('product_id', product.id).eq('is_primary', true).limit(1);
      if (imgResult.data && imgResult.data.length > 0) imgUrl = imgResult.data[0].url;

      var price = variant ? variant.price : product.price;
      subtotal += price * item.quantity;

      itemsHtml += '<div class="checkout-summary-item">' +
        '<div class="checkout-summary-img"><img src="' + esc(imgUrl) + '" alt="' + esc(product.name) + '"></div>' +
        '<div><div class="checkout-summary-name">' + esc(product.name) + '</div>' +
        (variant ? '<div class="checkout-summary-variant">' + esc(variant.name) + '</div>' : '') +
        '<div class="checkout-summary-variant">Qty: ' + item.quantity + '</div></div>' +
        '<div class="checkout-summary-item-price">' + formatPrice(price * item.quantity) + '</div></div>';
    }

    var settings = await getStoreSettings().catch(function () { return {}; });
    var taxRate = (settings && settings.tax_rate) ? parseFloat(settings.tax_rate) : 0;
    var shippingCost = (settings && settings.shipping_cost) ? parseFloat(settings.shipping_cost) : 0;
    var freeShippingThreshold = (settings && settings.free_shipping_threshold) ? parseFloat(settings.free_shipping_threshold) : 0;
    var tax = Math.round(subtotal * taxRate / 100 * 100) / 100;
    var shipping = (freeShippingThreshold > 0 && subtotal >= freeShippingThreshold) ? 0 : shippingCost;
    var total = subtotal + tax + shipping;

    orderData = { subtotal: subtotal, tax: tax, shipping: shipping, discount: 0, total: total, currency: CONFIG.currency };

    summary.innerHTML = '<h3>Order Summary</h3>' + itemsHtml +
      '<div class="checkout-summary-totals">' +
        '<div class="checkout-summary-row"><span>Subtotal</span><span>' + formatPrice(subtotal) + '</span></div>' +
        '<div class="checkout-summary-row"><span>Tax</span><span>' + formatPrice(tax) + '</span></div>' +
        '<div class="checkout-summary-row"><span>Shipping</span><span>' + (shipping > 0 ? formatPrice(shipping) : 'Free') + '</span></div>' +
        '<div class="checkout-summary-row total"><span>Total</span><span>' + formatPrice(total) + '</span></div>' +
      '</div>' +
      '<div class="checkout-secure-note">🔒 Secure checkout powered by Nomad</div>';
  }

  async function loadSavedAddresses() {
    var user = await getUser();
    if (!user) return;
    var result = await db.from('addresses').select('*').eq('user_id', user.id).order('is_default', { ascending: false });
    var container = document.getElementById('saved-addresses');
    if (!container || !result.data || result.data.length === 0) return;

    var html = '<div class="checkout-address-options">';
    result.data.forEach(function (addr) {
      html += '<label class="checkout-address-option ' + (addr.is_default ? 'selected' : '') + '" onclick="fillAddress(' + esc(JSON.stringify(addr).replace(/"/g, '&quot;')) + ')">' +
        '<input type="radio" name="saved_address" ' + (addr.is_default ? 'checked' : '') + '>' +
        '<div><div class="checkout-address-label">' + esc(addr.label) + ' — ' + esc(addr.full_name) + '</div>' +
        '<div class="checkout-address-text">' + esc(addr.line1) + ', ' + esc(addr.city) + ', ' + esc(addr.country) + '</div></div></label>';
    });
    html += '</div>';
    container.innerHTML = html;
  }

  window.fillAddress = function (addr) {
    var form = document.getElementById('step-shipping');
    if (!form) return;
    setField(form, 'shipping_name', addr.full_name);
    setField(form, 'shipping_address', addr.line1);
    setField(form, 'shipping_city', addr.city);
    setField(form, 'shipping_state', addr.state);
    setField(form, 'shipping_postal', addr.postal_code);
    setField(form, 'shipping_country', addr.country);
    setField(form, 'shipping_phone', addr.phone);
  };

  function setField(form, name, value) {
    var el = form.querySelector('[name="' + name + '"]');
    if (el) el.value = value || '';
  }

  window.checkoutNextStep = function (fromStep) {
    // Validate current step
    if (fromStep === 1) {
      var form = document.getElementById('step-shipping');
      var name = form.querySelector('[name="shipping_name"]').value.trim();
      var address = form.querySelector('[name="shipping_address"]').value.trim();
      var city = form.querySelector('[name="shipping_city"]').value.trim();
      var country = form.querySelector('[name="shipping_country"]').value;
      if (!name || !address || !city || !country) {
        showError('Please fill in all required shipping fields');
        return;
      }
    }
    hideError();
    checkoutStep = fromStep + 1;
    updateSteps();
  };

  window.checkoutPrevStep = function (fromStep) {
    checkoutStep = fromStep - 1;
    updateSteps();
  };

  function updateSteps() {
    document.querySelectorAll('.checkout-step').forEach(function (el) {
      var step = parseInt(el.dataset.step);
      el.classList.toggle('active', step === checkoutStep);
      el.classList.toggle('completed', step < checkoutStep);
    });
    document.getElementById('step-shipping').style.display = checkoutStep === 1 ? '' : 'none';
    document.getElementById('step-payment').style.display = checkoutStep === 2 ? '' : 'none';
    document.getElementById('step-confirm').style.display = checkoutStep === 3 ? '' : 'none';

    if (checkoutStep === 3) renderOrderReview();
  }

  function renderOrderReview() {
    var review = document.getElementById('order-review');
    if (!review) return;
    var form = document.getElementById('step-shipping');
    var shipping = {
      name: form.querySelector('[name="shipping_name"]').value,
      address: form.querySelector('[name="shipping_address"]').value,
      city: form.querySelector('[name="shipping_city"]').value,
      state: form.querySelector('[name="shipping_state"]').value,
      postal: form.querySelector('[name="shipping_postal"]').value,
      country: form.querySelector('[name="shipping_country"]').value,
    };
    review.innerHTML =
      '<div style="margin-bottom:1rem;"><strong>Shipping to:</strong><br>' +
      esc(shipping.name) + '<br>' + esc(shipping.address) + '<br>' +
      esc(shipping.city) + (shipping.state ? ', ' + esc(shipping.state) : '') + ' ' + esc(shipping.postal) + '<br>' +
      esc(shipping.country) + '</div>' +
      '<div><strong>Payment:</strong> Credit / Debit Card via Nomad</div>' +
      '<div style="margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border-secondary);"><strong>Total: ' + formatPrice(orderData.total) + '</strong></div>';
  }

  window.placeOrder = async function () {
    var btn = document.getElementById('place-order-btn');
    btn.disabled = true;
    btn.textContent = 'Processing...';
    hideError();

    try {
      var user = await getUser();
      if (!user) throw new Error('Please sign in');

      var form = document.getElementById('step-shipping');
      var shipping = {
        shipping_name: form.querySelector('[name="shipping_name"]').value.trim(),
        shipping_address: form.querySelector('[name="shipping_address"]').value.trim(),
        shipping_city: form.querySelector('[name="shipping_city"]').value.trim(),
        shipping_state: form.querySelector('[name="shipping_state"]').value.trim(),
        shipping_postal: form.querySelector('[name="shipping_postal"]').value.trim(),
        shipping_country: form.querySelector('[name="shipping_country"]').value,
        notes: (form.querySelector('[name="order_notes"]') || {}).value || '',
      };

      // Create order in DB
      var orderResult = await db.from('orders').insert({
        user_id: user.id,
        subtotal: orderData.subtotal,
        tax: orderData.tax,
        shipping: orderData.shipping,
        discount: orderData.discount,
        total: orderData.total,
        currency: orderData.currency,
        status: 'pending',
        payment_status: 'pending',
        ...shipping,
      }).select().single();

      if (orderResult.error) throw new Error('Failed to create order: ' + orderResult.error.message);

      var orderId = orderResult.data.id;

      // Create order items
      for (var i = 0; i < cartData.length; i++) {
        var item = cartData[i];
        var product = item.products;
        var variant = item.product_variants;
        if (!product) continue;

        var price = variant ? variant.price : product.price;
        await db.from('order_items').insert({
          order_id: orderId,
          product_id: product.id,
          variant_id: item.variant_id || null,
          name: product.name,
          sku: product.sku || '',
          price: price,
          quantity: item.quantity,
          total: price * item.quantity,
        });
      }

      // Call create-order API to initiate Nomad checkout
      var session = await getSession();
      var resp = await fetch('/api/create-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + session.access_token,
        },
        body: JSON.stringify({ order_id: orderId }),
      });

      var data = await resp.json();
      if (data.error) throw new Error(data.error);

      // Clear cart
      await clearCart();

      // Redirect to Nomad hosted checkout
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
      } else {
        throw new Error('No checkout URL received');
      }

    } catch (err) {
      showError(err.message);
      btn.disabled = false;
      btn.textContent = '🚀 Place Order & Pay';
    }
  };

  function showCheckoutSuccess(orderNumber) {
    var container = document.getElementById('checkout-form-container');
    container.innerHTML =
      '<div class="checkout-success">' +
        '<div class="checkout-success-icon">✓</div>' +
        '<h2>Order Placed Successfully!</h2>' +
        '<p>Thank you for your purchase. You will receive an email confirmation shortly.</p>' +
        '<div class="order-number-display">Order # ' + esc(orderNumber || '') + '</div>' +
        '<div style="display:flex;gap:0.75rem;justify-content:center;">' +
          '<a href="/pages/orders.html" class="btn btn-primary">View Orders</a>' +
          '<a href="/pages/shop.html" class="btn btn-secondary">Continue Shopping</a>' +
        '</div>' +
      '</div>';
    document.querySelector('.checkout-steps').style.display = 'none';
    document.querySelector('.checkout-summary').style.display = 'none';
  }

  function showError(msg) {
    var el = document.getElementById('checkout-error');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
  }
  function hideError() {
    var el = document.getElementById('checkout-error');
    if (el) el.style.display = 'none';
  }
})();
