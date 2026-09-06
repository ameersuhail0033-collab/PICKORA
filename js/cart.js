/**
 * cart.js — Cart page logic
 * Displays cart items, quantity controls, coupon, and summary.
 */
(function () {
  'use strict';

  var cartData = [];

  document.addEventListener('DOMContentLoaded', async function () {
    if (!window.db) await new Promise(function (r) { setTimeout(r, 300); });
    if (!document.getElementById('cart-items-list')) return;
    await loadCartPage();
  });

  async function loadCartPage() {
    cartData = await getCart();
    renderCartItems();
    renderCartSummary();
  }

  async function renderCartItems() {
    var container = document.getElementById('cart-items-list');
    if (!container) return;

    if (!cartData || cartData.length === 0) {
      container.innerHTML = '';
      document.querySelector('.cart-items-header').style.display = 'none';
      document.getElementById('cart-summary-card').innerHTML = '<div class="cart-empty"><div class="cart-empty-icon">🛒</div><h3>Your cart is empty</h3><p>Add some laptops!</p><a href="/pages/shop.html" class="btn btn-primary mt-2">Start Shopping</a></div>';
      return;
    }

    document.querySelector('.cart-items-header').style.display = '';
    var html = '';
    for (var i = 0; i < cartData.length; i++) {
      var item = cartData[i];
      var product = item.products;
      var variant = item.product_variants;

      if (!product || !product.is_active) continue;

      var imgUrl = 'https://picsum.photos/seed/product/120/120';
      // Get primary image
      var imgResult = await db.from('product_images').select('url').eq('product_id', product.id).eq('is_primary', true).limit(1);
      if (imgResult.data && imgResult.data.length > 0) imgUrl = imgResult.data[0].url;

      var unitPrice = variant ? variant.price : product.price;
      var total = unitPrice * item.quantity;

      html += '<div class="cart-item" data-id="' + esc(item.id) + '">' +
        '<div class="cart-item-product">' +
          '<div class="cart-item-img"><img src="' + esc(imgUrl) + '" alt="' + esc(product.name) + '"></div>' +
          '<div><div class="cart-item-name">' + esc(product.name) + '</div>' +
          (variant ? '<div class="cart-item-variant">' + esc(variant.name) + '</div>' : '') +
          '</div>' +
        '</div>' +
        '<div class="cart-item-price">' + formatPrice(unitPrice) + '</div>' +
        '<div class="cart-item-qty">' +
          '<div class="quantity-selector">' +
            '<button onclick="updateCartQty(\'' + esc(item.id) + '\',' + (item.quantity - 1) + ')">−</button>' +
            '<input type="number" value="' + item.quantity + '" min="1" readonly>' +
            '<button onclick="updateCartQty(\'' + esc(item.id) + '\',' + (item.quantity + 1) + ')">+</button>' +
          '</div>' +
        '</div>' +
        '<div class="cart-item-total">' + formatPrice(total) + '</div>' +
        '<button class="cart-item-remove" onclick="removeCartItem(\'' + esc(item.id) + '\')" title="Remove">✕</button>' +
      '</div>';
    }

    container.innerHTML = html;
  }

  async function renderCartSummary() {
    var card = document.getElementById('cart-summary-card');
    if (!card) return;

    var subtotal = 0;
    for (var i = 0; i < cartData.length; i++) {
      var item = cartData[i];
      var product = item.products;
      var variant = item.product_variants;
      if (product && product.is_active) {
        var price = variant ? variant.price : product.price;
        subtotal += price * item.quantity;
      }
    }

    var settings = await getStoreSettings().catch(function () { return {}; });
    var taxRate = (settings && settings.tax_rate) ? parseFloat(settings.tax_rate) : 0;
    var shippingCost = (settings && settings.shipping_cost) ? parseFloat(settings.shipping_cost) : 0;
    var freeShippingThreshold = (settings && settings.free_shipping_threshold) ? parseFloat(settings.free_shipping_threshold) : 0;
    var tax = Math.round(subtotal * taxRate / 100 * 100) / 100;
    var shipping = (freeShippingThreshold > 0 && subtotal >= freeShippingThreshold) ? 0 : shippingCost;
    var total = subtotal + tax + shipping;

    card.innerHTML =
      '<h3>Order Summary</h3>' +
      '<div class="cart-summary-row"><span class="label">Subtotal</span><span>' + formatPrice(subtotal) + '</span></div>' +
      '<div class="cart-summary-row"><span class="label">Tax (' + taxRate + '%)</span><span>' + formatPrice(tax) + '</span></div>' +
      '<div class="cart-summary-row"><span class="label">Shipping</span><span>' + (shipping > 0 ? formatPrice(shipping) : '<span style="color:#10B981;">Free</span>') + '</span></div>' +
      '<div id="discount-row" style="display:none;" class="cart-summary-row"><span class="label" style="color:#10B981;">Discount</span><span id="discount-amount" style="color:#10B981;">-$0.00</span></div>' +
      '<div class="cart-summary-total"><span>Total</span><span id="cart-total">' + formatPrice(total) + '</span></div>' +
      '<div class="cart-coupon">' +
        '<input type="text" id="coupon-input" placeholder="Coupon code">' +
        '<button class="btn btn-secondary btn-sm" onclick="applyCoupon()">Apply</button>' +
      '</div>' +
      '<div id="coupon-message" style="display:none;margin-bottom:1rem;font-size:0.85rem;"></div>' +
      '<a href="/pages/checkout.html" class="btn btn-accent w-full" style="font-size:1rem;">Proceed to Checkout</a>' +
      '<a href="/pages/shop.html" class="cart-continue-shopping">← Continue Shopping</a>' +
      (freeShippingThreshold > 0 && subtotal < freeShippingThreshold
        ? '<p style="text-align:center;font-size:0.8rem;color:var(--text-muted);margin-top:0.75rem;">Add ' + formatPrice(freeShippingThreshold - subtotal) + ' more for free shipping!</p>'
        : '');

    // Store for coupon
    window._cartSubtotal = subtotal;
    window._cartTax = tax;
    window._cartShipping = shipping;
  }

  window.updateCartQty = async function (itemId, newQty) {
    if (newQty <= 0) {
      await removeFromCart(itemId);
    } else {
      var user = await getUser();
      if (user) {
        await db.from('cart_items').update({ quantity: newQty }).eq('id', itemId);
      } else {
        var cart = JSON.parse(localStorage.getItem('pickora_cart') || '[]');
        var idx = cart.findIndex(function (c) { return c.product_id === itemId; });
        if (idx > -1) cart[idx].quantity = newQty;
        localStorage.setItem('pickora_cart', JSON.stringify(cart));
      }
    }
    await loadCartPage();
  };

  window.removeCartItem = async function (itemId) {
    var ok = await confirmDialog('Remove this item from cart?');
    if (!ok) return;
    await removeFromCart(itemId);
    await loadCartPage();
    showToast('Item removed', 'info');
  };

  window.applyCoupon = async function () {
    var code = document.getElementById('coupon-input').value.trim();
    if (!code) return;
    var result = await db.rpc('validate_coupon', { p_code: code, p_total: window._cartSubtotal || 0 });
    var msgEl = document.getElementById('coupon-message');
    if (result.error || !result.data || !result.data.valid) {
      msgEl.style.display = 'block';
      msgEl.style.color = '#EF4444';
      msgEl.textContent = (result.data && result.data.error) || 'Invalid coupon';
    } else {
      msgEl.style.display = 'block';
      msgEl.style.color = '#10B981';
      msgEl.textContent = 'Coupon applied! You save ' + formatPrice(result.data.discount_amount);
      document.getElementById('discount-row').style.display = '';
      document.getElementById('discount-amount').textContent = '-' + formatPrice(result.data.discount_amount);
      var newTotal = (window._cartSubtotal || 0) + (window._cartTax || 0) + (window._cartShipping || 0) - result.data.discount_amount;
      document.getElementById('cart-total').textContent = formatPrice(Math.max(0, newTotal));
      window._cartDiscount = result.data.discount_amount;
      window._couponId = result.data.coupon_id;
    }
  };
})();
