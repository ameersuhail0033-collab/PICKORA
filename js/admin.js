/**
 * admin.js — Admin panel logic
 * Sidebar navigation, dashboard KPIs, CRUD for products/categories/coupons/orders/customers, settings.
 */
(function () {
  'use strict';

  var _allCategories = [];

  /* ── Admin Sidebar ──────────────────────────────────────── */
  window.initAdminSidebar = function initAdminSidebar(activePage) {
    var sidebar = document.getElementById('admin-sidebar');
    if (!sidebar) return;
    var pages = [
      { id: 'dashboard', label: 'Dashboard', icon: '📊', url: '/admin/dashboard.html' },
      { id: 'products', label: 'Products', icon: '💻', url: '/admin/products.html' },
      { id: 'categories', label: 'Categories', icon: '📁', url: '/admin/categories.html' },
      { id: 'orders', label: 'Orders', icon: '📦', url: '/admin/orders.html' },
      { id: 'customers', label: 'Customers', icon: '👥', url: '/admin/customers.html' },
      { id: 'coupons', label: 'Coupons', icon: '🏷️', url: '/admin/coupons.html' },
      { id: 'analytics', label: 'Analytics', icon: '📈', url: '/admin/analytics.html' },
      { id: 'settings', label: 'Settings', icon: '⚙️', url: '/admin/settings.html' },
    ];

    sidebar.innerHTML =
      '<div class="admin-sidebar-header">' +
        '<a href="/" class="admin-sidebar-brand"><span data-store="logo-text">Pickora</span> <span class="admin-badge">Admin</span></a>' +
      '</div>' +
      '<nav class="admin-nav">' +
        '<div class="admin-nav-section">' +
          '<div class="admin-nav-label">Main</div>' +
          pages.slice(0, 1).map(function (p) { return '<a href="' + p.url + '" class="admin-nav-item ' + (activePage === p.id ? 'active' : '') + '"><span class="icon">' + p.icon + '</span>' + p.label + '</a>'; }).join('') +
        '</div>' +
        '<div class="admin-nav-section">' +
          '<div class="admin-nav-label">Catalog</div>' +
          pages.slice(1, 3).map(function (p) { return '<a href="' + p.url + '" class="admin-nav-item ' + (activePage === p.id ? 'active' : '') + '"><span class="icon">' + p.icon + '</span>' + p.label + '</a>'; }).join('') +
        '</div>' +
        '<div class="admin-nav-section">' +
          '<div class="admin-nav-label">Sales</div>' +
          pages.slice(3, 6).map(function (p) { return '<a href="' + p.url + '" class="admin-nav-item ' + (activePage === p.id ? 'active' : '') + '"><span class="icon">' + p.icon + '</span>' + p.label + '</a>'; }).join('') +
        '</div>' +
        '<div class="admin-nav-section">' +
          '<div class="admin-nav-label">Insights</div>' +
          pages.slice(6).map(function (p) { return '<a href="' + p.url + '" class="admin-nav-item ' + (activePage === p.id ? 'active' : '') + '"><span class="icon">' + p.icon + '</span>' + p.label + '</a>'; }).join('') +
        '</div>' +
      '</nav>' +
      '<div style="padding:1rem 1.25rem;margin-top:auto;border-top:1px solid var(--border-secondary);">' +
        '<a href="/" class="admin-nav-item"><span class="icon">🏪</span>View Store</a>' +
        '<button class="admin-nav-item" onclick="signOut()" style="width:100%;text-align:left;"><span class="icon">🚪</span>Sign Out</button>' +
      '</div>';
  };

  /* ── Dashboard ──────────────────────────────────────────── */
  window.loadDashboard = async function loadDashboard() {
    try {
      var result = await db.rpc('admin_kpis');
      if (result.data) {
        document.getElementById('kpi-revenue').textContent = formatPrice(result.data.total_revenue || 0);
        document.getElementById('kpi-orders').textContent = (result.data.total_orders || 0).toLocaleString();
        document.getElementById('kpi-aov').textContent = formatPrice(result.data.avg_order_value || 0);
        document.getElementById('kpi-customers').textContent = (result.data.total_customers || 0).toLocaleString();
        document.getElementById('kpi-pending').textContent = (result.data.pending_orders || 0).toLocaleString();
        document.getElementById('kpi-lowstock').textContent = (result.data.low_stock || 0).toLocaleString();
      }

      // Revenue chart
      await loadChart('day');

      // Recent orders
      var orders = await db.from('orders').select('*, profiles(full_name,email)').order('created_at', { ascending: false }).limit(10);
      var tbody = document.getElementById('recent-orders');
      if (orders.data && orders.data.length > 0) {
        var statusMap = { pending: 'status-pending', confirmed: 'status-confirmed', processing: 'status-processing', shipped: 'status-shipped', delivered: 'status-delivered', cancelled: 'status-cancelled' };
        tbody.innerHTML = orders.data.map(function (o) {
          var customer = o.profiles ? o.profiles.full_name || o.profiles.email : 'Guest';
          return '<tr><td><strong>' + esc(o.order_number) + '</strong></td><td>' + esc(customer) + '</td><td>' + formatPrice(o.total) + '</td><td><span class="status-badge ' + (statusMap[o.status] || '') + '">' + esc(o.status) + '</span></td><td><span class="status-badge ' + (o.payment_status === 'paid' ? 'status-paid' : 'status-pending') + '">' + esc(o.payment_status) + '</span></td><td>' + formatDate(o.created_at) + '</td></tr>';
        }).join('');
      } else {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text-muted);">No orders yet</td></tr>';
      }

      // Top products
      var topProducts = await db.rpc('top_products', { p_limit: 5 });
      var tpTbody = document.getElementById('top-products');
      if (topProducts.data && topProducts.data.length > 0) {
        tpTbody.innerHTML = topProducts.data.map(function (p) {
          return '<tr><td><strong>' + esc(p.name) + '</strong></td><td>' + (p.sales || 0) + '</td><td>' + formatPrice(p.revenue || 0) + '</td></tr>';
        }).join('');
      } else {
        tpTbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:1rem;color:var(--text-muted);">No data yet</td></tr>';
      }
    } catch (e) {
      console.error('[admin] Dashboard error:', e);
    }
  };

  /* ── Revenue Chart (dependency-free canvas) ──────────────── */
  window.loadChart = async function loadChart(interval, btnEl) {
    if (btnEl) {
      btnEl.parentElement.querySelectorAll('button').forEach(function (b) { b.classList.remove('active'); });
      btnEl.classList.add('active');
    }

    var result = await db.rpc('revenue_series', { p_interval: interval });
    var data = result.data || [];

    var canvas = document.getElementById('revenue-chart');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var wrap = canvas.parentElement;
    canvas.width = wrap.offsetWidth;
    canvas.height = wrap.offsetHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (data.length === 0) return;

    var maxRevenue = Math.max.apply(null, data.map(function (d) { return d.revenue || 0; }));
    if (maxRevenue === 0) maxRevenue = 100;

    var padding = { top: 20, right: 20, bottom: 40, left: 60 };
    var chartW = canvas.width - padding.left - padding.right;
    var chartH = canvas.height - padding.top - padding.bottom;

    // Get theme colors
    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    var gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    var textColor = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)';
    var primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--brand-primary').trim() || '#8B5CF6';

    // Draw grid lines
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    for (var i = 0; i <= 4; i++) {
      var y = padding.top + (chartH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(canvas.width - padding.right, y);
      ctx.stroke();

      // Y-axis labels
      ctx.fillStyle = textColor;
      ctx.font = '11px Poppins, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(formatPrice(maxRevenue * (1 - i / 4)), padding.left - 8, y + 4);
    }

    // Draw line + area
    var stepX = chartW / (data.length - 1 || 1);

    // Area fill
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top + chartH);
    data.forEach(function (d, idx) {
      var x = padding.left + idx * stepX;
      var y = padding.top + chartH - ((d.revenue || 0) / maxRevenue) * chartH;
      ctx.lineTo(x, y);
    });
    ctx.lineTo(padding.left + (data.length - 1) * stepX, padding.top + chartH);
    ctx.closePath();
    var grad = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
    grad.addColorStop(0, primaryColor + '30');
    grad.addColorStop(1, primaryColor + '05');
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    data.forEach(function (d, idx) {
      var x = padding.left + idx * stepX;
      var y = padding.top + chartH - ((d.revenue || 0) / maxRevenue) * chartH;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Dots
    data.forEach(function (d, idx) {
      var x = padding.left + idx * stepX;
      var y = padding.top + chartH - ((d.revenue || 0) / maxRevenue) * chartH;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = primaryColor;
      ctx.fill();
      ctx.strokeStyle = isDark ? '#151229' : '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    // X-axis labels
    ctx.fillStyle = textColor;
    ctx.font = '10px Poppins, sans-serif';
    ctx.textAlign = 'center';
    var labelStep = Math.ceil(data.length / 7);
    data.forEach(function (d, idx) {
      if (idx % labelStep === 0 || idx === data.length - 1) {
        var x = padding.left + idx * stepX;
        var label = d.date ? new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
        ctx.fillText(label, x, canvas.height - 10);
      }
    });
  };

  /* ── Products CRUD ──────────────────────────────────────── */
  window.loadAdminProducts = async function loadAdminProducts() {
    await loadCategoriesList();
    var result = await db.from('products')
      .select('*, categories(name), product_images(url,is_primary)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    var tbody = document.getElementById('products-tbody');
    if (!result.data || result.data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;">No products</td></tr>';
      return;
    }

    tbody.innerHTML = result.data.map(function (p) {
      var img = p.product_images && p.product_images.find(function (i) { return i.is_primary; });
      var imgUrl = img ? img.url : 'https://picsum.photos/seed/prod/60/60';
      var catName = p.categories ? p.categories.name : '-';
      return '<tr>' +
        '<td><img src="' + esc(imgUrl) + '" style="width:48px;height:48px;border-radius:8px;object-fit:cover;"></td>' +
        '<td><strong>' + esc(p.name) + '</strong><br><small style="color:var(--text-muted);">' + esc(p.sku || '') + '</small></td>' +
        '<td>' + esc(catName) + '</td>' +
        '<td>' + formatPrice(p.price) + '</td>' +
        '<td>' + p.stock_quantity + '</td>' +
        '<td><span class="status-badge ' + (p.is_active ? 'status-active status-paid' : 'status-cancelled') + '">' + (p.is_active ? 'Active' : 'Draft') + '</span></td>' +
        '<td><button class="btn btn-ghost btn-sm" onclick="editProduct(\'' + p.id + '\')">Edit</button> <button class="btn btn-ghost btn-sm" style="color:#EF4444;" onclick="deleteProduct(\'' + p.id + '\')">Del</button></td>' +
      '</tr>';
    }).join('');
  };

  async function loadCategoriesList() {
    var result = await db.from('categories').select('*').order('sort_order');
    _allCategories = result.data || [];
  }

  window.showProductForm = function showProductForm(product) {
    document.getElementById('product-modal').style.display = '';
    document.getElementById('product-form-title').textContent = product ? 'Edit Product' : 'Add Product';
    var pf = document.getElementById('product-form');
    pf.reset();
    if (product) {
      document.getElementById('pf-id').value = product.id;
      document.getElementById('pf-name').value = product.name;
      document.getElementById('pf-brand').value = product.brand || '';
      document.getElementById('pf-sku').value = product.sku || '';
      document.getElementById('pf-price').value = product.price;
      document.getElementById('pf-compare').value = product.compare_at_price || '';
      document.getElementById('pf-cost').value = product.cost_price || '';
      document.getElementById('pf-stock').value = product.stock_quantity;
      document.getElementById('pf-weight').value = product.weight || '';
      document.getElementById('pf-short').value = product.short_description || '';
      document.getElementById('pf-desc').value = product.description || '';
      document.getElementById('pf-active').checked = product.is_active;
      document.getElementById('pf-featured').checked = product.is_featured;
      document.getElementById('pf-track').checked = product.track_inventory;
    }
    // Populate category dropdown
    var catSelect = document.getElementById('pf-category');
    catSelect.innerHTML = '<option value="">None</option>' + _allCategories.map(function (c) {
      return '<option value="' + c.id + '" ' + (product && product.category_id === c.id ? 'selected' : '') + '>' + esc(c.name) + '</option>';
    }).join('');
  };

  window.closeProductForm = function closeProductForm() { document.getElementById('product-modal').style.display = 'none'; };

  window.editProduct = async function editProduct(id) {
    var result = await db.from('products').select('*').eq('id', id).single();
    if (result.data) showProductForm(result.data);
  };

  window.saveProduct = async function saveProduct(e) {
    e.preventDefault();
    var id = document.getElementById('pf-id').value;
    var form = new FormData(document.getElementById('product-form'));
    var data = {
      name: form.get('name'),
      slug: form.get('name').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      brand: form.get('brand'),
      sku: form.get('sku'),
      price: parseFloat(form.get('price')) || 0,
      compare_at_price: parseFloat(form.get('compare_at_price')) || 0,
      cost_price: parseFloat(form.get('cost_price')) || 0,
      stock_quantity: parseInt(form.get('stock_quantity')) || 0,
      weight: parseFloat(form.get('weight')) || 0,
      short_description: form.get('short_description'),
      description: form.get('description'),
      category_id: form.get('category_id') || null,
      is_active: document.getElementById('pf-active').checked,
      is_featured: document.getElementById('pf-featured').checked,
      track_inventory: document.getElementById('pf-track').checked,
    };

    if (id) {
      await db.from('products').update(data).eq('id', id);
      showToast('Product updated', 'success');
    } else {
      await db.from('products').insert(data);
      showToast('Product created', 'success');
    }
    closeProductForm();
    loadAdminProducts();
  };

  window.deleteProduct = async function deleteProduct(id) {
    var ok = await confirmDialog('Delete this product?');
    if (!ok) return;
    await db.from('products').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    showToast('Product deleted', 'info');
    loadAdminProducts();
  };

  window.searchProducts = debounce(function (q) {
    // Simple client-side filter
    var rows = document.querySelectorAll('#products-tbody tr');
    rows.forEach(function (row) {
      var text = row.textContent.toLowerCase();
      row.style.display = text.indexOf(q.toLowerCase()) > -1 ? '' : 'none';
    });
  }, 300);

  window.filterProductsByCategory = function (catSlug) {
    // Reload with filter
    loadAdminProducts();
  };

  /* ── Categories CRUD ────────────────────────────────────── */
  window.loadAdminCategories = async function loadAdminCategories() {
    var result = await db.from('categories').select('*, products:products(count)').order('sort_order');
    var tbody = document.getElementById('categories-tbody');
    if (!result.data || result.data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:2rem;">No categories</td></tr>';
      return;
    }
    tbody.innerHTML = result.data.map(function (c) {
      return '<tr><td><strong>' + esc(c.name) + '</strong></td><td>' + esc(c.slug) + '</td><td>' + (c.products ? c.products.length : 0) + '</td><td><span class="status-badge ' + (c.is_active ? 'status-paid' : 'status-cancelled') + '">' + (c.is_active ? 'Active' : 'Inactive') + '</span></td><td><button class="btn btn-ghost btn-sm" onclick="editCategory(\'' + c.id + '\')">Edit</button> <button class="btn btn-ghost btn-sm" style="color:#EF4444;" onclick="deleteCategory(\'' + c.id + '\')">Del</button></td></tr>';
    }).join('');
  };

  window.showCategoryForm = function showCategoryForm(cat) {
    document.getElementById('category-modal').style.display = '';
    document.getElementById('cat-form-title').textContent = cat ? 'Edit Category' : 'Add Category';
    document.getElementById('cf-id').value = cat ? cat.id : '';
    document.getElementById('cf-name').value = cat ? cat.name : '';
    document.getElementById('cf-desc').value = cat ? cat.description || '' : '';
    document.getElementById('cf-sort').value = cat ? cat.sort_order || 0 : 0;
    document.getElementById('cf-active').checked = cat ? cat.is_active : true;
  };

  window.closeCategoryForm = function closeCategoryForm() { document.getElementById('category-modal').style.display = 'none'; };

  window.editCategory = async function editCategory(id) {
    var result = await db.from('categories').select('*').eq('id', id).single();
    if (result.data) showCategoryForm(result.data);
  };

  window.saveCategory = async function saveCategory(e) {
    e.preventDefault();
    var id = document.getElementById('cf-id').value;
    var name = document.getElementById('cf-name').value.trim();
    var data = {
      name: name,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      description: document.getElementById('cf-desc').value,
      sort_order: parseInt(document.getElementById('cf-sort').value) || 0,
      is_active: document.getElementById('cf-active').checked,
    };
    if (id) { await db.from('categories').update(data).eq('id', id); }
    else { await db.from('categories').insert(data); }
    closeCategoryForm();
    loadAdminCategories();
    showToast('Category saved', 'success');
  };

  window.deleteCategory = async function deleteCategory(id) {
    var ok = await confirmDialog('Delete this category?');
    if (!ok) return;
    await db.from('categories').update({ deleted_at: new Date().toISOString(), is_active: false }).eq('id', id);
    showToast('Category deleted', 'info');
    loadAdminCategories();
  };

  /* ── Orders ─────────────────────────────────────────────── */
  window.loadAdminOrders = async function loadAdminOrders() {
    var result = await db.from('orders').select('*, profiles(full_name,email)').order('created_at', { ascending: false }).limit(50);
    var tbody = document.getElementById('orders-tbody');
    if (!result.data || result.data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;">No orders</td></tr>';
      return;
    }
    var statusMap = { pending: 'status-pending', confirmed: 'status-confirmed', processing: 'status-processing', shipped: 'status-shipped', delivered: 'status-delivered', cancelled: 'status-cancelled' };
    tbody.innerHTML = result.data.map(function (o) {
      var customer = o.profiles ? o.profiles.full_name || o.profiles.email : 'Guest';
      var items = o.order_items ? o.order_items.reduce(function (s, i) { return s + i.quantity; }, 0) : 0;
      return '<tr><td><strong>' + esc(o.order_number) + '</strong></td><td>' + esc(customer) + '</td><td>' + items + '</td><td>' + formatPrice(o.total) + '</td><td><span class="status-badge ' + (o.payment_status === 'paid' ? 'status-paid' : 'status-pending') + '">' + esc(o.payment_status) + '</span></td><td><select class="form-select" onchange="updateOrderStatus(\'' + o.id + '\',this.value)" style="padding:0.3rem 1.5rem 0.3rem 0.5rem;font-size:0.8rem;"><option value="pending" ' + (o.status === 'pending' ? 'selected' : '') + '>Pending</option><option value="confirmed" ' + (o.status === 'confirmed' ? 'selected' : '') + '>Confirmed</option><option value="processing" ' + (o.status === 'processing' ? 'selected' : '') + '>Processing</option><option value="shipped" ' + (o.status === 'shipped' ? 'selected' : '') + '>Shipped</option><option value="delivered" ' + (o.status === 'delivered' ? 'selected' : '') + '>Delivered</option><option value="cancelled" ' + (o.status === 'cancelled' ? 'selected' : '') + '>Cancelled</option></select></td><td>' + formatDate(o.created_at) + '</td><td><button class="btn btn-ghost btn-sm" onclick="viewOrder(\'' + o.id + '\')">View</button></td></tr>';
    }).join('');
  };

  window.updateOrderStatus = async function updateOrderStatus(orderId, status) {
    var data = { status: status };
    if (status === 'cancelled') data.cancelled_at = new Date().toISOString();
    if (status === 'shipped') data.shipped_at = new Date().toISOString();
    if (status === 'delivered') data.delivered_at = new Date().toISOString();
    await db.from('orders').update(data).eq('id', orderId);
    showToast('Order updated', 'success');
  };

  window.viewOrder = async function viewOrder(id) {
    var result = await db.from('orders').select('*, order_items(*), profiles(full_name,email)').eq('id', id).single();
    if (!result.data) return;
    var o = result.data;
    var modal = document.getElementById('order-modal');
    var content = document.getElementById('order-detail-content');
    var customer = o.profiles ? o.profiles.full_name + ' (' + o.profiles.email + ')' : 'Guest';
    var itemsHtml = (o.order_items || []).map(function (item) {
      return '<tr><td>' + esc(item.name) + '</td><td>' + item.quantity + '</td><td>' + formatPrice(item.price) + '</td><td>' + formatPrice(item.total) + '</td></tr>';
    }).join('');
    content.innerHTML =
      '<div style="margin-bottom:1rem;"><strong>Order:</strong> ' + esc(o.order_number) + '</div>' +
      '<div style="margin-bottom:1rem;"><strong>Customer:</strong> ' + esc(customer) + '</div>' +
      '<div style="margin-bottom:1rem;"><strong>Date:</strong> ' + formatDateTime(o.created_at) + '</div>' +
      '<div style="margin-bottom:1rem;"><strong>Status:</strong> <span class="status-badge status-' + o.status + '">' + esc(o.status) + '</span></div>' +
      '<div style="margin-bottom:1rem;"><strong>Payment:</strong> <span class="status-badge ' + (o.payment_status === 'paid' ? 'status-paid' : '') + '">' + esc(o.payment_status) + '</span></div>' +
      (o.shipping_name ? '<div style="margin-bottom:1rem;"><strong>Shipping:</strong> ' + esc(o.shipping_name) + '<br>' + esc(o.shipping_address) + '<br>' + esc(o.shipping_city) + ', ' + esc(o.shipping_country) + '</div>' : '') +
      '<table class="table"><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead><tbody>' + itemsHtml + '</tbody></table>' +
      '<div style="margin-top:1rem;text-align:right;"><strong>Subtotal: ' + formatPrice(o.subtotal) + '</strong><br><strong>Tax: ' + formatPrice(o.tax) + '</strong><br><strong>Shipping: ' + formatPrice(o.shipping) + '</strong><br><strong style="font-size:1.1rem;">Total: ' + formatPrice(o.total) + '</strong></div>';
    modal.style.display = '';
  };

  window.closeOrderDetail = function closeOrderDetail() { document.getElementById('order-modal').style.display = 'none'; };

  window.searchOrders = debounce(function (q) {
    var rows = document.querySelectorAll('#orders-tbody tr');
    rows.forEach(function (row) { row.style.display = row.textContent.toLowerCase().indexOf(q.toLowerCase()) > -1 ? '' : 'none'; });
  }, 300);

  window.filterOrders = function () {
    // Reload with status filter
    loadAdminOrders();
  };

  /* ── Customers ──────────────────────────────────────────── */
  window.loadAdminCustomers = async function loadAdminCustomers() {
    var result = await db.from('profiles').select('*').order('created_at', { ascending: false }).limit(100);
    var tbody = document.getElementById('customers-tbody');
    if (!result.data || result.data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;">No customers</td></tr>';
      return;
    }
    tbody.innerHTML = result.data.map(function (c) {
      return '<tr><td><strong>' + esc(c.full_name || 'Unnamed') + '</strong></td><td>' + esc(c.email) + '</td><td><span class="badge ' + (c.role === 'admin' || c.role === 'super_admin' ? 'badge-primary' : 'badge-info') + '">' + esc(c.role) + '</span></td><td>-</td><td>' + formatDate(c.created_at) + '</td><td><button class="btn btn-ghost btn-sm" onclick="toggleCustomerRole(\'' + c.id + '\',\'' + esc(c.role) + '\')">' + (c.role === 'customer' ? 'Make Admin' : 'Remove Admin') + '</button></td></tr>';
    }).join('');
  };

  window.toggleCustomerRole = async function toggleCustomerRole(userId, currentRole) {
    var newRole = currentRole === 'customer' ? 'admin' : 'customer';
    var ok = await confirmDialog('Change role to ' + newRole + '?');
    if (!ok) return;
    await db.from('profiles').update({ role: newRole }).eq('id', userId);
    showToast('Role updated', 'success');
    loadAdminCustomers();
  };

  window.searchCustomers = debounce(function (q) {
    var rows = document.querySelectorAll('#customers-tbody tr');
    rows.forEach(function (row) { row.style.display = row.textContent.toLowerCase().indexOf(q.toLowerCase()) > -1 ? '' : 'none'; });
  }, 300);

  /* ── Coupons CRUD ───────────────────────────────────────── */
  window.loadAdminCoupons = async function loadAdminCoupons() {
    var result = await db.from('coupons').select('*').order('created_at', { ascending: false });
    var tbody = document.getElementById('coupons-tbody');
    if (!result.data || result.data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;">No coupons</td></tr>';
      return;
    }
    tbody.innerHTML = result.data.map(function (c) {
      return '<tr><td><strong style="font-family:var(--font-mono);">' + esc(c.code) + '</strong></td><td>' + esc(c.discount_type) + '</td><td>' + (c.discount_type === 'percentage' ? c.discount_value + '%' : formatPrice(c.discount_value)) + '</td><td>' + (c.min_order > 0 ? formatPrice(c.min_order) : '-') + '</td><td>' + c.used_count + '</td><td>' + (c.max_uses > 0 ? c.max_uses : '∞') + '</td><td><span class="status-badge ' + (c.is_active ? 'status-paid' : 'status-cancelled') + '">' + (c.is_active ? 'Active' : 'Inactive') + '</span></td><td><button class="btn btn-ghost btn-sm" onclick="editCoupon(\'' + c.id + '\')">Edit</button> <button class="btn btn-ghost btn-sm" style="color:#EF4444;" onclick="deleteCoupon(\'' + c.id + '\')">Del</button></td></tr>';
    }).join('');
  };

  window.showCouponForm = function showCouponForm(coupon) {
    document.getElementById('coupon-modal').style.display = '';
    document.getElementById('coupon-form-title').textContent = coupon ? 'Edit Coupon' : 'Add Coupon';
    document.getElementById('cpf-id').value = coupon ? coupon.id : '';
    document.getElementById('cpf-code').value = coupon ? coupon.code : '';
    document.getElementById('cpf-type').value = coupon ? coupon.discount_type : 'percentage';
    document.getElementById('cpf-value').value = coupon ? coupon.discount_value : '';
    document.getElementById('cpf-min').value = coupon ? coupon.min_order : 0;
    document.getElementById('cpf-max').value = coupon ? coupon.max_uses : 0;
    document.getElementById('cpf-expires').value = coupon && coupon.expires_at ? coupon.expires_at.slice(0, 16) : '';
    document.getElementById('cpf-active').checked = coupon ? coupon.is_active : true;
  };

  window.closeCouponForm = function closeCouponForm() { document.getElementById('coupon-modal').style.display = 'none'; };

  window.editCoupon = async function editCoupon(id) {
    var result = await db.from('coupons').select('*').eq('id', id).single();
    if (result.data) showCouponForm(result.data);
  };

  window.saveCoupon = async function saveCoupon(e) {
    e.preventDefault();
    var id = document.getElementById('cpf-id').value;
    var data = {
      code: document.getElementById('cpf-code').value.trim().toUpperCase(),
      discount_type: document.getElementById('cpf-type').value,
      discount_value: parseFloat(document.getElementById('cpf-value').value) || 0,
      min_order: parseFloat(document.getElementById('cpf-min').value) || 0,
      max_uses: parseInt(document.getElementById('cpf-max').value) || 0,
      expires_at: document.getElementById('cpf-expires').value || null,
      is_active: document.getElementById('cpf-active').checked,
    };
    if (id) { await db.from('coupons').update(data).eq('id', id); }
    else { await db.from('coupons').insert(data); }
    closeCouponForm();
    loadAdminCoupons();
    showToast('Coupon saved', 'success');
  };

  window.deleteCoupon = async function deleteCoupon(id) {
    var ok = await confirmDialog('Delete this coupon?');
    if (!ok) return;
    await db.from('coupons').delete().eq('id', id);
    showToast('Coupon deleted', 'info');
    loadAdminCoupons();
  };

  /* ── Settings ───────────────────────────────────────────── */
  window.loadSettingsForm = async function loadSettingsForm() {
    var settings = await getStoreSettings();
    if (!settings) return;
    var fields = ['name', 'company', 'logo', 'favicon', 'primary', 'secondary', 'accent', 'email', 'phone', 'address', 'currency', 'tax', 'shipping', 'freeship', 'facebook', 'instagram', 'twitter', 'youtube', 'meta', 'og'];
    var keys = ['store_name', 'company_name', 'logo_url', 'favicon_url', 'primary_color', 'secondary_color', 'accent_color', 'support_email', 'support_phone', 'address', 'currency', 'tax_rate', 'shipping_cost', 'free_shipping_threshold', 'social_facebook', 'social_instagram', 'social_twitter', 'social_youtube', 'meta_description', 'og_image_url'];
    fields.forEach(function (f, i) {
      var el = document.getElementById('sf-' + f);
      if (el) el.value = settings[keys[i]] || '';
    });
    document.getElementById('sf-maintenance').checked = settings.maintenance_mode || false;
  };

  window.saveSettings = async function saveSettings(e) {
    e.preventDefault();
    var form = new FormData(document.getElementById('settings-form'));
    var data = {};
    form.forEach(function (value, key) { data[key] = value; });
    data.maintenance_mode = document.getElementById('sf-maintenance').checked;

    // Update singleton row
    var existing = await db.from('store_settings').select('id').limit(1).single();
    if (existing.data) {
      await db.from('store_settings').update(data).eq('id', existing.data.id);
    } else {
      await db.from('store_settings').insert(data);
    }
    invalidateSettingsCache();
    showToast('Settings saved! Branding applied.', 'success');
  };
})();
