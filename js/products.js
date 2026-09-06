/**
 * products.js — Shop page + Product detail page logic
 */
(function () {
  'use strict';

  var PAGE_SIZE = 12;
  var currentPage = 1;
  var currentFilters = { category: '', brand: '', minPrice: '', maxPrice: '', search: '', sort: 'newest' };

  /* ── Shop Page Init ─────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', async function () {
    if (!window.db) await new Promise(function (r) { setTimeout(r, 300); });

    if (document.getElementById('shop-products')) {
      initShopPage();
    }
    if (document.getElementById('product-detail')) {
      initProductDetail();
    }
  });

  async function initShopPage() {
    // Read URL params
    currentFilters.category = getParam('category') || '';
    currentFilters.brand = getParam('brand') || '';
    currentFilters.search = getParam('q') || '';
    currentFilters.minPrice = getParam('min') || '';
    currentFilters.maxPrice = getParam('max') || '';
    currentPage = parseInt(getParam('page')) || 1;

    // Set search input
    var searchInput = document.getElementById('search-input');
    if (searchInput && currentFilters.search) searchInput.value = currentFilters.search;
    if (searchInput) {
      searchInput.addEventListener('input', debounce(function () {
        currentFilters.search = searchInput.value.trim();
        currentPage = 1;
        setParam('q', currentFilters.search);
        loadShopProducts();
      }, 350));
    }

    // Set price inputs
    var priceMin = document.getElementById('price-min');
    var priceMax = document.getElementById('price-max');
    if (priceMin && currentFilters.minPrice) priceMin.value = currentFilters.minPrice;
    if (priceMax && currentFilters.maxPrice) priceMax.value = currentFilters.maxPrice;

    // Load filter options
    await loadFilterOptions();
    loadShopProducts();
  }

  async function loadFilterOptions() {
    // Categories
    var catResult = await db.from('categories').select('*').eq('is_active', true).order('sort_order');
    var catContainer = document.getElementById('filter-categories');
    if (catContainer && catResult.data) {
      var html = '';
      catResult.data.forEach(function (cat) {
        var checked = currentFilters.category === cat.slug ? 'checked' : '';
        html += '<label class="filter-option"><input type="radio" name="cat" value="' + esc(cat.slug) + '" ' + checked + ' onchange="filterByCategory(this.value)">' + esc(cat.name) + '</label>';
      });
      html += '<label class="filter-option"><input type="radio" name="cat" value="" ' + (!currentFilters.category ? 'checked' : '') + ' onchange="filterByCategory(\'\')">All</label>';
      catContainer.innerHTML = html;

      // Also populate category filter dropdown
      var catFilter = document.getElementById('category-filter');
      if (catFilter) {
        catResult.data.forEach(function (cat) {
          var sel = currentFilters.category === cat.slug ? 'selected' : '';
          catFilter.innerHTML += '<option value="' + esc(cat.slug) + '" ' + sel + '>' + esc(cat.name) + '</option>';
        });
      }
    }

    // Brands (from products)
    var brandResult = await db.from('products').select('brand').eq('is_active', true).is('deleted_at', null);
    var brands = [];
    if (brandResult.data) {
      brandResult.data.forEach(function (p) { if (p.brand && brands.indexOf(p.brand) === -1) brands.push(p.brand); });
    }
    brands.sort();
    var brandContainer = document.getElementById('filter-brands');
    if (brandContainer) {
      var bhtml = '';
      brands.forEach(function (brand) {
        var checked = currentFilters.brand === brand ? 'checked' : '';
        bhtml += '<label class="filter-option"><input type="radio" name="brand" value="' + esc(brand) + '" ' + checked + ' onchange="filterByBrand(this.value)">' + esc(brand) + '</label>';
      });
      bhtml += '<label class="filter-option"><input type="radio" name="brand" value="" ' + (!currentFilters.brand ? 'checked' : '') + ' onchange="filterByBrand(\'\')">All</label>';
      brandContainer.innerHTML = bhtml;
    }
  }

  window.filterByCategory = function (slug) {
    currentFilters.category = slug;
    currentPage = 1;
    setParam('category', slug);
    loadShopProducts();
  };

  window.filterByBrand = function (brand) {
    currentFilters.brand = brand;
    currentPage = 1;
    setParam('brand', brand);
    loadShopProducts();
  };

  window.applyPriceFilter = function () {
    currentFilters.minPrice = document.getElementById('price-min').value;
    currentFilters.maxPrice = document.getElementById('price-max').value;
    currentPage = 1;
    setParam('min', currentFilters.minPrice);
    setParam('max', currentFilters.maxPrice);
    loadShopProducts();
  };

  window.clearFilters = function () {
    currentFilters = { category: '', brand: '', minPrice: '', maxPrice: '', search: '', sort: 'newest' };
    currentPage = 1;
    var searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';
    ['category', 'brand', 'min', 'max', 'q', 'page'].forEach(function (p) { setParam(p, ''); });
    loadFilterOptions();
    loadShopProducts();
  };

  window.loadShopProducts = async function loadShopProducts() {
    var container = document.getElementById('shop-products');
    if (!container) return;

    container.innerHTML = skeleton('card', 6);
    document.getElementById('active-filters').innerHTML = '';

    var query = db.from('products')
      .select('*, categories(name,slug), product_images(url,alt,sort_order,is_primary)', { count: 'exact' })
      .eq('is_active', true)
      .is('deleted_at', null);

    // Apply filters
    if (currentFilters.category) {
      // Need to get category ID first
      var catResult = await db.from('categories').select('id').eq('slug', currentFilters.category).single();
      if (catResult.data) query = query.eq('category_id', catResult.data.id);
    }
    if (currentFilters.brand) query = query.ilike('brand', currentFilters.brand);
    if (currentFilters.minPrice) query = query.gte('price', parseFloat(currentFilters.minPrice));
    if (currentFilters.maxPrice) query = query.lte('price', parseFloat(currentFilters.maxPrice));
    if (currentFilters.search) {
      query = query.or('name.ilike.%' + currentFilters.search + '%,brand.ilike.%' + currentFilters.search + '%,short_description.ilike.%' + currentFilters.search + '%');
    }

    // Sort
    var sortVal = document.getElementById('sort-select') ? document.getElementById('sort-select').value : 'newest';
    currentFilters.sort = sortVal;
    switch (sortVal) {
      case 'price-asc': query = query.order('price', { ascending: true }); break;
      case 'price-desc': query = query.order('price', { ascending: false }); break;
      case 'name': query = query.order('name', { ascending: true }); break;
      case 'rating': query = query.order('avg_rating', { ascending: false }); break;
      case 'popular': query = query.order('sales_count', { ascending: false }); break;
      default: query = query.order('created_at', { ascending: false });
    }

    // Pagination
    var from = (currentPage - 1) * PAGE_SIZE;
    var to = from + PAGE_SIZE - 1;
    query = query.range(from, to);

    var result = await query;

    // Update result count
    var countEl = document.getElementById('result-count');
    if (countEl) {
      var total = result.count || (result.data ? result.data.length : 0);
      countEl.textContent = total + ' product' + (total !== 1 ? 's' : '') + ' found';
    }

    if (result.error || !result.data || result.data.length === 0) {
      container.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><div class="empty-state-icon">🔍</div><h3>No products found</h3><p>Try adjusting your filters or search terms.</p></div>';
      document.getElementById('shop-pagination').innerHTML = '';
      renderActiveFilters();
      return;
    }

    var html = '';
    result.data.forEach(function (p, i) {
      p.category_name = p.categories ? p.categories.name : '';
      p.category_slug = p.categories ? p.categories.slug : '';
      html += renderProductCard(p, i);
    });
    container.innerHTML = html;

    // Pagination
    var totalPages = Math.ceil((result.count || result.data.length) / PAGE_SIZE);
    document.getElementById('shop-pagination').innerHTML = renderPagination(currentPage, totalPages);
    document.querySelectorAll('.page-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var page = parseInt(this.dataset.page);
        if (page && page > 0 && page <= totalPages) {
          currentPage = page;
          setParam('page', page);
          loadShopProducts();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      });
    });

    renderActiveFilters();
    initScrollReveal();
  };

  function renderActiveFilters() {
    var container = document.getElementById('active-filters');
    if (!container) return;
    var tags = '';
    if (currentFilters.category) tags += '<span class="active-filter-tag">' + esc(currentFilters.category) + ' <button onclick="filterByCategory(\'\')">×</button></span>';
    if (currentFilters.brand) tags += '<span class="active-filter-tag">' + esc(currentFilters.brand) + ' <button onclick="filterByBrand(\'\')">×</button></span>';
    if (currentFilters.minPrice) tags += '<span class="active-filter-tag">Min: ' + esc(currentFilters.minPrice) + ' <button onclick="document.getElementById(\'price-min\').value=\'\';applyPriceFilter()">×</button></span>';
    if (currentFilters.maxPrice) tags += '<span class="active-filter-tag">Max: ' + esc(currentFilters.maxPrice) + ' <button onclick="document.getElementById(\'price-max\').value=\'\';applyPriceFilter()">×</button></span>';
    if (currentFilters.search) tags += '<span class="active-filter-tag">"' + esc(currentFilters.search) + '" <button onclick="document.getElementById(\'search-input\').value=\'\';currentFilters.search=\'\';loadShopProducts()">×</button></span>';
    container.innerHTML = tags;
  }

  function initScrollReveal() {
    var reveals = document.querySelectorAll('.reveal:not(.revealed)');
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { entry.target.classList.add('revealed'); obs.unobserve(entry.target); }
      });
    }, { threshold: 0.1 });
    reveals.forEach(function (el) { obs.observe(el); });
  }

  /* ── Product Detail Page ─────────────────────────────────── */
  async function initProductDetail() {
    var slug = window.location.pathname.split('/product/')[1];
    if (!slug) { slug = getParam('slug'); }
    if (!slug) {
      document.getElementById('product-detail').innerHTML = '<div class="empty-state"><h3>Product not found</h3><a href="/pages/shop.html" class="btn btn-primary">Back to Shop</a></div>';
      return;
    }

    var result = await db.from('products')
      .select('*, categories(name,slug), product_images(url,alt,sort_order,is_primary), product_variants(*)')
      .eq('slug', slug)
      .single();

    if (result.error || !result.data) {
      document.getElementById('product-detail').innerHTML = '<div class="empty-state"><h3>Product not found</h3><a href="/pages/shop.html" class="btn btn-primary">Back to Shop</a></div>';
      return;
    }

    var p = result.data;
    document.title = p.name + ' — ' + CONFIG.storeName;
    var metaDesc = document.getElementById('meta-description');
    if (metaDesc) metaDesc.setAttribute('content', p.short_description || p.description || '');

    // JSON-LD
    var jsonLd = document.getElementById('json-ld');
    if (jsonLd) {
      jsonLd.textContent = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: p.name,
        description: p.short_description || p.description,
        brand: { '@type': 'Brand', name: p.brand },
        offers: { '@type': 'Offer', price: p.price, priceCurrency: CONFIG.currency, availability: p.stock_quantity > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock' },
        image: p.product_images && p.product_images.length > 0 ? p.product_images[0].url : '',
        aggregateRating: p.review_count > 0 ? { '@type': 'AggregateRating', ratingValue: p.avg_rating, reviewCount: p.review_count } : undefined,
      });
    }

    // Gallery
    var images = p.product_images || [];
    images.sort(function (a, b) { return a.sort_order - b.sort_order; });
    var mainImg = images.length > 0 ? images[0].url : 'https://picsum.photos/seed/' + p.slug + '/800/800';

    var thumbsHtml = '';
    images.forEach(function (img, i) {
      thumbsHtml += '<div class="product-gallery-thumb ' + (i === 0 ? 'active' : '') + '" onclick="switchImage(\'' + esc(img.url) + '\',this)"><img src="' + esc(img.url) + '" alt="' + esc(img.alt || p.name) + '"></div>';
    });
    if (images.length <= 1) thumbsHtml = '';

    var categoryName = p.categories ? p.categories.name : '';
    var discount = p.compare_at_price > p.price ? Math.round(((p.compare_at_price - p.price) / p.compare_at_price) * 100) : 0;
    var stockStatus = p.track_inventory ? (p.stock_quantity <= 0 ? 'out-of-stock' : p.stock_quantity <= 5 ? 'low-stock' : 'in-stock') : 'in-stock';
    var stockText = p.track_inventory ? (p.stock_quantity <= 0 ? 'Out of stock' : p.stock_quantity <= 5 ? 'Only ' + p.stock_quantity + ' left' : 'In stock (' + p.stock_quantity + ' available)') : 'In stock';

    // Variants
    var variants = p.product_variants || [];
    var variantsHtml = '';
    if (variants.length > 0) {
      variantsHtml = '<div class="product-variant-section"><div class="product-variant-label">Configuration:</div><div class="product-variant-options">';
      variants.forEach(function (v, i) {
        if (v.is_active) {
          variantsHtml += '<button class="variant-btn ' + (i === 0 ? 'active' : '') + '" data-id="' + esc(v.id) + '" data-price="' + v.price + '" onclick="selectVariant(this,' + v.price + ')">' + esc(v.name) + ' — ' + formatPrice(v.price) + '</button>';
        }
      });
      variantsHtml += '</div></div>';
    }

    document.getElementById('product-detail').innerHTML =
      '<div class="product-gallery">' +
        '<div class="product-gallery-main" onclick="zoomImage(this)"><img id="main-product-img" src="' + esc(mainImg) + '" alt="' + esc(p.name) + '"></div>' +
        '<div class="product-gallery-thumbnails">' + thumbsHtml + '</div>' +
      '</div>' +
      '<div class="product-info">' +
        '<nav class="breadcrumb"><a href="/">Home</a> <span class="separator">/</span> <a href="/pages/shop.html">Shop</a> <span class="separator">/</span> ' + (categoryName ? '<a href="/pages/shop.html?category=' + esc(p.categories.slug) + '">' + esc(categoryName) + '</a> <span class="separator">/</span> ' : '') + '<span>' + esc(p.name) + '</span></nav>' +
        (p.brand ? '<div class="product-info-brand">' + esc(p.brand) + '</div>' : '') +
        '<h1>' + esc(p.name) + '</h1>' +
        '<div class="product-rating">' + renderStars(p.avg_rating || 0) + '<span class="score">' + (p.avg_rating || 0) + '</span><span class="count">(' + (p.review_count || 0) + ' reviews)</span><a href="#reviews" onclick="switchTab(\'reviews\')">Read reviews</a></div>' +
        '<div class="product-price-block">' +
          '<span class="product-price-current">' + formatPrice(p.price) + '</span>' +
          (p.compare_at_price > p.price ? '<span class="product-price-compare">' + formatPrice(p.compare_at_price) + '</span><span class="product-price-save">Save ' + discount + '%</span>' : '') +
        '</div>' +
        '<p class="product-short-desc">' + esc(p.short_description || '') + '</p>' +
        variantsHtml +
        '<div class="product-stock ' + stockStatus + '">' + stockText + '</div>' +
        '<div class="product-actions">' +
          '<div class="quantity-selector">' +
            '<button onclick="changeQty(-1)">−</button>' +
            '<input type="number" id="qty-input" value="1" min="1" max="' + (p.stock_quantity || 99) + '">' +
            '<button onclick="changeQty(1)">+</button>' +
          '</div>' +
          '<button class="btn btn-accent btn-lg btn-add-to-cart" onclick="addProductToCart()" ' + (p.stock_quantity <= 0 && p.track_inventory ? 'disabled' : '') + '>' +
            (p.stock_quantity <= 0 && p.track_inventory ? 'Out of Stock' : '🛒 Add to Cart') +
          '</button>' +
        '</div>' +
        '<div class="product-meta">' +
          '<div class="product-meta-row"><span class="label">SKU</span><span class="value">' + esc(p.sku || 'N/A') + '</span></div>' +
          '<div class="product-meta-row"><span class="label">Category</span><span class="value">' + esc(categoryName || 'N/A') + '</span></div>' +
          '<div class="product-meta-row"><span class="label">Brand</span><span class="value">' + esc(p.brand || 'N/A') + '</span></div>' +
        '</div>' +
      '</div>';

    // Tabs
    document.getElementById('tab-description').innerHTML = '<div style="line-height:1.8;color:var(--text-secondary);">' + (p.description || '<p>No description available.</p>') + '</div>';
    document.getElementById('tab-specs').innerHTML = '<table class="table" style="max-width:500px;"><tbody>' +
      '<tr><td><strong>Brand</strong></td><td>' + esc(p.brand || '-') + '</td></tr>' +
      '<tr><td><strong>SKU</strong></td><td>' + esc(p.sku || '-') + '</td></tr>' +
      '<tr><td><strong>Weight</strong></td><td>' + (p.weight ? p.weight + ' kg' : '-') + '</td></tr>' +
      '<tr><td><strong>Stock</strong></td><td>' + (p.track_inventory ? p.stock_quantity : 'Unlimited') + '</td></tr>' +
      '</tbody></table>';

    document.getElementById('product-tabs').style.display = '';

    // Load reviews
    loadProductReviews(p.id);

    // Load related products
    loadRelatedProducts(p.category_id, p.id);

    // Store recently viewed
    storeRecentlyViewed(p);
  }

  async function loadProductReviews(productId) {
    var result = await db.from('reviews')
      .select('*, profiles(full_name)')
      .eq('product_id', productId)
      .eq('is_approved', true)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    var container = document.getElementById('tab-reviews');
    if (!container) return;

    if (!result.data || result.data.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>No reviews yet. Be the first to review!</p></div>';
      return;
    }

    var html = '<div class="review-item">';
    result.data.forEach(function (r) {
      var name = r.profiles ? r.profiles.full_name : 'Anonymous';
      html += '<div class="review-item-header"><div class="review-item-author"><div class="review-item-avatar">' + esc(name.charAt(0)) + '</div><div><div class="review-item-name">' + esc(name) + '</div><div class="review-item-date">' + formatDate(r.created_at) + '</div></div></div><div class="review-item-stars">' + renderStars(r.rating) + '</div></div>';
      if (r.title) html += '<div class="review-item-title">' + esc(r.title) + '</div>';
      if (r.body) html += '<div class="review-item-body">' + esc(r.body) + '</div>';
      html += '</div>';
    });
    html += '</div>';
    container.innerHTML = html;
  }

  async function loadRelatedProducts(categoryId, currentId) {
    if (!categoryId) return;
    var result = await db.from('products')
      .select('*, categories(name,slug), product_images(url,alt,sort_order,is_primary)')
      .eq('category_id', categoryId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .neq('id', currentId)
      .limit(4);

    if (result.data && result.data.length > 0) {
      var container = document.getElementById('related-products');
      var section = document.getElementById('related-section');
      if (container && section) {
        section.style.display = '';
        var html = '';
        result.data.forEach(function (p, i) {
          p.category_name = p.categories ? p.categories.name : '';
          html += renderProductCard(p, i);
        });
        container.innerHTML = html;
      }
    }
  }

  function storeRecentlyViewed(product) {
    var key = 'pickora_recently_viewed';
    var items = JSON.parse(localStorage.getItem(key) || '[]');
    items = items.filter(function (item) { return item.id !== product.id; });
    items.unshift({ id: product.id, slug: product.slug, name: product.name, price: product.price, brand: product.brand });
    if (items.length > 10) items = items.slice(0, 10);
    localStorage.setItem(key, JSON.stringify(items));
  }

  /* ── Product Detail Helpers ──────────────────────────────── */
  window.switchImage = function (url, thumbEl) {
    var mainImg = document.getElementById('main-product-img');
    if (mainImg) mainImg.src = url;
    document.querySelectorAll('.product-gallery-thumb').forEach(function (t) { t.classList.remove('active'); });
    if (thumbEl) thumbEl.classList.add('active');
  };

  window.zoomImage = function (el) {
    var img = el.querySelector('img');
    if (!img) return;
    showModal('Zoom', '<img src="' + esc(img.src) + '" style="width:100%;border-radius:var(--radius-md);">');
  };

  window.changeQty = function (delta) {
    var input = document.getElementById('qty-input');
    if (!input) return;
    var val = parseInt(input.value) + delta;
    if (val < 1) val = 1;
    if (val > parseInt(input.max)) val = parseInt(input.max);
    input.value = val;
  };

  var selectedVariantId = null;
  window.selectVariant = function (btn, price) {
    selectedVariantId = btn.dataset.id;
    document.querySelectorAll('.variant-btn').forEach(function (b) { b.classList.remove('active'); });
    btn.classList.add('active');
    var priceEl = document.querySelector('.product-price-current');
    if (priceEl) priceEl.textContent = formatPrice(price);
  };

  window.addProductToCart = async function () {
    var qty = parseInt(document.getElementById('qty-input').value) || 1;
    var slug = window.location.pathname.split('/product/')[1];
    var result = await db.from('products').select('id').eq('slug', slug).single();
    if (result.data) {
      await addToCart(result.data.id, selectedVariantId, qty);
      showToast('Added to cart!', 'success');
    }
  };

  window.switchTab = function (tabName) {
    document.querySelectorAll('.tab-btn').forEach(function (btn) { btn.classList.toggle('active', btn.dataset.tab === tabName); });
    document.querySelectorAll('.tab-content').forEach(function (tc) { tc.classList.toggle('active', tc.dataset.tab === tabName); });
  };

  // Tab button listeners
  document.addEventListener('click', function (e) {
    if (e.target.classList.contains('tab-btn')) {
      switchTab(e.target.dataset.tab);
    }
  });
})();
