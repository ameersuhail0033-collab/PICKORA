/**
 * cart.js — Cart page logic (v2)
 * Displays cart items, quantity controls, promo code, and order summary.
 */
(function () {
  'use strict';

  var cartData = [];
  var discount = 0;
  var promoApplied = false;

  document.addEventListener('DOMContentLoaded', async function () {
    if (!window.db) await new Promise(function (r) { setTimeout(r, 300); });
    if (!document.getElementById('cart-items')) return;
    await loadCartPage();
  });

  async function loadCartPage() {
    cartData = await getCart();
    renderCart();
  }

  function renderCart() {
    var itemsContainer = document.getElementById('cart-items');
    var summaryContainer = document.getElementById('order-summary');
    var emptyState = document.getElementById('cart-empty-state');
    var layout = document.getElementById('cart-layout');
    var countText = document.getElementById('cart-count-text');

    var validItems = (cartData || []).filter(function (item) {
      return item.products && item.products.is_active;
    });

    if (validItems.length === 0) {
      emptyState.style.display = '';
      layout.style.display = 'none';
      countText.textContent = 'Your cart is empty';
      return;
    }

    emptyState.style.display = 'none';
    layout.style.display = '';
    countText.textContent = validItems.length + ' item' + (validItems.length !== 1 ? 's' : '') + ' in your cart';

    renderItems(validItems);
    renderSummary(validItems);
  }

  async function renderItems(items) {
    var container = document.getElementById('cart-items');
    var html = '';

    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var product = item.products;
      var variant = item.product_variants;

      // Get image
      var imgUrl = '/assets/placeholder-laptop.png';
      var imgResult = await db.from('product_images').select('url').eq('product_id', product.id).eq('is_primary', true).limit(1);
      if (imgResult.data && imgResult.data.length > 0) {
        imgUrl = productImageUrl(imgResult.data[0].url);
      }

      var unitPrice = variant ? variant.price : product.price;
      var total = unitPrice * item.quantity;

      // Build spec chips
      var specs = '';
      if (variant && variant.name) {
        var parts = variant.name.split('/').map(function(s) { return s.trim(); });
        parts.forEach(function(p) { if (p) specs += '<span class="cart-item-spec">' + esc(p) + '</span>'; });
      }
      if (product.brand) specs = '<span class="cart-item-spec">' + esc(product.brand) + '</span>' + specs;

      html += '<div class="cart-item-card" data-id="' + esc(item.id) + '">' +
        '<div class="cart-item-img"><img src="' + esc(imgUrl) + '" alt="' + esc(product.name) + '" onerror="this.src=\'/assets/placeholder-laptop.png\'"></div>' +
        '<div class="cart-item-info">' +
          '<div class="cart-item-brand">' + esc(product.brand || '') + '</div>' +
          '<div class="cart-item-name">' + esc(product.name) + '</div>' +
          '<div class="cart-item-specs">' + specs + '</div>' +
          '<div class="cart-item-qty-price">' +
            '<div class="qty-stepper">' +
              '<button class="qty-btn" onclick="updateCartQty(\'' + esc(item.id) + '\',' + (item.quantity - 1) + ')" ' + (item.quantity <= 1 ? 'disabled' : '') + '>&minus;</button>' +
              '<span class="qty-val">' + item.quantity + '</span>' +
              '<button class="qty-btn" onclick="updateCartQty(\'' + esc(item.id) + '\',' + (item.quantity + 1) + ')">+</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="cart-item-pricing">' +
          '<div class="cart-item-unit">' + formatPrice(unitPrice) + ' each</div>' +
          '<div class="cart-item-total">' + formatPrice(total) + '</div>' +
        '</div>' +
        '<button class="cart-item-remove" onclick="removeCartItem(\'' + esc(item.id) + '\')" title="Remove item">&#128465;</button>' +
      '</div>';
    }

    container.innerHTML = html;
  }

  function renderSummary(items) {
    var container = document.getElementById('order-summary');
    var subtotal = 0;
    var itemCount = 0;

    items.forEach(function (item) {
      var product = item.products;
      var variant = item.product_variants;
      var price = variant ? variant.price : product.price;
      subtotal += price * item.quantity;
      itemCount += item.quantity;
    });

    var shipping = subtotal >= 500 ? 0 : 50;
    var total = subtotal + shipping - discount;

    var html = '<h3>Order Summary</h3>' +
      '<div class="summary-row"><span class="label">Subtotal (' + itemCount + ' item' + (itemCount !== 1 ? 's' : '') + ')</span><span class="value">' + formatPrice(subtotal) + '</span></div>' +
      '<div class="summary-row"><span class="label">Estimated Shipping</span><span class="value">' + (shipping === 0 ? 'Free' : formatPrice(shipping)) + '</span></div>';

    if (discount > 0) {
      html += '<div class="summary-row"><span class="label">Discount</span><span class="value" style="color:#10B981;">-' + formatPrice(discount) + '</span></div>';
    }

    html += '<hr class="summary-divider">' +
      '<div class="summary-total"><span>Total</span><span>' + formatPrice(total) + '</span></div>' +
      '<div class="promo-row">' +
        '<input type="text" class="promo-input" placeholder="Enter promo code" id="promo-input">' +
        '<button class="promo-btn" onclick="applyPromo()">Apply</button>' +
      '</div>' +
      '<a href="/pages/checkout.html" class="checkout-btn" id="checkout-btn">Proceed to Checkout &rarr;</a>' +
      '<div class="trust-row">' +
        '<div class="trust-item"><i class="fas fa-shield-alt"></i><div>12-Month<br>Warranty</div></div>' +
        '<div class="trust-item"><i class="fas fa-truck"></i><div>2-4 Day<br>UAE Delivery</div></div>' +
      '</div>';

    container.innerHTML = html;
  }

  window.updateCartQty = async function (itemId, newQty) {
    if (newQty < 1) {
      await removeCartItem(itemId);
      return;
    }
    await updateCartItem(itemId, newQty);
    cartData = await getCart();
    renderCart();
  };

  window.removeCartItem = async function (itemId) {
    await removeFromCart(itemId);
    cartData = await getCart();
    renderCart();
  };

  window.applyPromo = function () {
    var input = document.getElementById('promo-input');
    var code = input ? input.value.trim().toUpperCase() : '';
    if (!code) return;

    // Simulated promo validation
    if (code === 'PICKORA10') {
      discount = 10;
      promoApplied = true;
      alert('Promo code applied! AED 10 discount.');
    } else if (code === 'WELCOME20') {
      discount = 20;
      promoApplied = true;
      alert('Promo code applied! AED 20 discount.');
    } else {
      alert('Invalid promo code.');
      return;
    }
    renderCart();
  };

  function esc(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

})();
