/**
 * admin-dashboard.js — Pickora Admin Dashboard
 * Real-time analytics with Supabase data, canvas charts, and premium animations
 */

(function () {
  'use strict';

  // ── State ──
  let currentPeriod = 30;
  let salesData = [];
  let brandData = [];
  let orderStatusData = [];

  var db = window.db;

  // ── Format helpers ──
  var fmt = {
    currency: function (v) {
      return 'AED ' + Number(v || 0).toLocaleString('en-AE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    },
    currencyShort: function (v) {
      v = Number(v || 0);
      if (v >= 1000000) return 'AED ' + (v / 1000000).toFixed(1) + 'M';
      if (v >= 1000) return 'AED ' + (v / 1000).toFixed(1) + 'K';
      return 'AED ' + v.toLocaleString('en-AE');
    },
    number: function (v) {
      return Number(v || 0).toLocaleString('en-AE');
    },
    pct: function (v) {
      return (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
    }
  };

  // ── Skeleton helpers ──
  function showError(el, msg) {
    if (!el) return;
    el.innerHTML = '<div style="padding:12px;color:var(--admin-text-secondary);font-size:13px;">' + (msg || 'No data available') + '</div>';
  }

  // ── Greeting ──
  function setGreeting() {
    var el = document.getElementById('dashGreeting');
    if (!el) return;
    var h = new Date().getHours();
    var greeting = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    el.innerHTML = greeting + '! <span class="wave">&#x1F44B;</span>';
  }

  // ── KPI Loading ──
  async function loadKPIs() {
    try {
      // Fetch all orders — columns: id, order_number, total, payment_status, status, created_at
      var result = await db
        .from('orders')
        .select('id, total, payment_status, status, created_at');

      if (result.error) throw result.error;
      var orders = result.data || [];

      var now = new Date();
      var thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      var sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

      // Current period (last 30 days)
      var recent = orders.filter(function (o) { return new Date(o.created_at) >= thirtyDaysAgo; });
      // Previous period (30-60 days ago)
      var prev = orders.filter(function (o) { return new Date(o.created_at) >= sixtyDaysAgo && new Date(o.created_at) < thirtyDaysAgo; });

      // Revenue (paid orders only)
      var recentRevenue = recent.filter(function (o) { return o.payment_status === 'paid'; }).reduce(function (s, o) { return s + (o.total || 0); }, 0);
      var prevRevenue = prev.filter(function (o) { return o.payment_status === 'paid'; }).reduce(function (s, o) { return s + (o.total || 0); }, 0);

      // Total orders
      var recentOrders = recent.length;
      var prevOrders = prev.length;

      // Average order value
      var recentPaid = recent.filter(function (o) { return o.payment_status === 'paid'; });
      var aov = recentPaid.length > 0 ? recentRevenue / recentPaid.length : 0;
      var prevPaid = prev.filter(function (o) { return o.payment_status === 'paid'; });
      var prevAov = prevPaid.length > 0 ? prevRevenue / prevPaid.length : 0;

      // Pending orders
      var pending = orders.filter(function (o) { return o.payment_status === 'pending'; }).length;

      // Update KPIs
      updateKPI('kpiRevenueValue', fmt.currency(recentRevenue));
      updateKPI('kpiOrdersValue', fmt.number(recentOrders));
      updateKPI('kpiAOVValue', fmt.currency(aov));
      updateKPI('kpiPendingValue', fmt.number(pending));

      // Changes
      var revChange = prevRevenue > 0 ? ((recentRevenue - prevRevenue) / prevRevenue * 100) : 0;
      var ordChange = prevOrders > 0 ? ((recentOrders - prevOrders) / prevOrders * 100) : 0;
      var aovChange = prevAov > 0 ? ((aov - prevAov) / prevAov * 100) : 0;

      setKPIChange('kpiRevenueChange', revChange, 'vs prior 30 days');
      setKPIChange('kpiOrdersChange', ordChange, 'vs prior 30 days');
      setKPIChange('kpiAOVChange', aovChange, 'vs prior 30 days');
      setKPIChange('kpiPendingChange', null, 'currently awaiting payment');

    } catch (e) {
      console.error('[dashboard] KPI load error:', e);
    }
  }

  function updateKPI(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function setKPIChange(id, change, label) {
    var el = document.getElementById(id);
    if (!el) return;
    if (change === null) {
      el.innerHTML = '<span style="color:var(--admin-text-secondary);">' + label + '</span>';
      return;
    }
    var cls = change >= 0 ? 'up' : 'down';
    var arrow = change >= 0 ? '&#9650;' : '&#9660;';
    el.innerHTML = '<span class="kpi-change ' + cls + '">' + arrow + ' ' + fmt.pct(Math.abs(change)) + '</span> <span style="color:var(--admin-text-secondary);">' + label + '</span>';
  }

  // ── Sales Chart ──
  async function loadSalesChart(days) {
    try {
      var now = new Date();
      var startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

      var result = await db
        .from('orders')
        .select('id, total, payment_status, status, created_at')
        .gte('created_at', startDate.toISOString());

      if (result.error) throw result.error;
      var orders = result.data || [];

      // Group by day
      var daily = {};
      for (var d = 0; d < days; d++) {
        var date = new Date(startDate.getTime() + d * 24 * 60 * 60 * 1000);
        var key = date.toISOString().slice(0, 10);
        daily[key] = { paid: 0, pending: 0, refunded: 0, count: 0 };
      }

      orders.forEach(function (o) {
        var key = o.created_at.slice(0, 10);
        if (!daily[key]) daily[key] = { paid: 0, pending: 0, refunded: 0, count: 0 };
        daily[key].count++;
        if (o.payment_status === 'paid') daily[key].paid += o.total || 0;
        else if (o.payment_status === 'refunded') daily[key].refunded += o.total || 0;
        else daily[key].pending += o.total || 0;
      });

      salesData = Object.keys(daily).map(function (k) {
        return { date: k, paid: daily[k].paid, pending: daily[k].pending, refunded: daily[k].refunded, count: daily[k].count };
      });

      drawSalesChart();

    } catch (e) {
      console.error('[dashboard] Sales chart error:', e);
      var canvas = document.getElementById('salesChart');
      if (canvas) {
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#666';
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('No order data yet', canvas.width / 2, canvas.height / 2);
      }
    }
  }

  function drawSalesChart() {
    var canvas = document.getElementById('salesChart');
    if (!canvas || !salesData.length) return;

    var ctx = canvas.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    var rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = 200 * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = '200px';
    ctx.scale(dpr, dpr);

    var w = rect.width;
    var h = 200;
    var padding = { top: 10, right: 10, bottom: 30, left: 50 };
    var chartW = w - padding.left - padding.right;
    var chartH = h - padding.top - padding.bottom;

    ctx.clearRect(0, 0, w, h);

    // Find max
    var maxVal = 0;
    salesData.forEach(function (d) {
      var total = d.paid + d.pending + d.refunded;
      if (total > maxVal) maxVal = total;
    });
    if (maxVal === 0) maxVal = 1;

    // Draw bars
    var barWidth = Math.max(2, (chartW / salesData.length) - 2);
    var gap = 2;

    salesData.forEach(function (d, i) {
      var x = padding.left + (i / salesData.length) * chartW + gap / 2;
      var total = d.paid + d.pending + d.refunded;
      var barH = (total / maxVal) * chartH;
      var y = padding.top + chartH - barH;

      // Refunded (bottom)
      if (d.refunded > 0) {
        var rH = (d.refunded / maxVal) * chartH;
        ctx.fillStyle = '#f87171';
        ctx.fillRect(x, y + barH - rH, barWidth, rH);
      }

      // Pending (middle)
      if (d.pending > 0) {
        var pH = (d.pending / maxVal) * chartH;
        var pY = d.refunded > 0 ? y + barH - (d.refunded / maxVal) * chartH - pH : y + barH - pH;
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(x, pY, barWidth, pH);
      }

      // Paid (top)
      if (d.paid > 0) {
        var payH = (d.paid / maxVal) * chartH;
        ctx.fillStyle = '#8b5cf6';
        ctx.fillRect(x, y, barWidth, payH);
      }
    });

    // Y-axis labels
    ctx.fillStyle = '#64748b';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';
    for (var i = 0; i <= 4; i++) {
      var val = (maxVal / 4) * i;
      var yPos = padding.top + chartH - (chartH / 4) * i;
      ctx.fillText(fmt.currencyShort(val), padding.left - 8, yPos + 4);
    }

    // X-axis labels
    ctx.textAlign = 'center';
    var labelInterval = Math.ceil(salesData.length / 8);
    salesData.forEach(function (d, i) {
      if (i % labelInterval === 0) {
        var xPos = padding.left + (i / salesData.length) * chartW + barWidth / 2;
        ctx.fillText(d.date.slice(5), xPos, h - 8);
      }
    });
  }

  // ── Brand Revenue Chart ──
  async function loadBrandChart() {
    try {
      // Get products with brands
      var pResult = await db
        .from('products')
        .select('id, brand')
        .is('deleted_at', null);

      if (pResult.error) throw pResult.error;
      var products = pResult.data || [];

      // Get order items to calculate revenue by brand
      var oResult = await db
        .from('order_items')
        .select('product_id, quantity, price');

      if (oResult.error) throw oResult.error;
      var orderItems = oResult.data || [];

      // Build brand -> revenue map
      var productMap = {};
      products.forEach(function (p) { productMap[p.id] = p; });

      var brandRevenue = {};
      orderItems.forEach(function (item) {
        var product = productMap[item.product_id];
        if (!product || !product.brand) return;
        var brand = product.brand;
        if (!brandRevenue[brand]) brandRevenue[brand] = 0;
        brandRevenue[brand] += (item.price || 0) * (item.quantity || 0);
      });

      // Sort by revenue
      brandData = Object.keys(brandRevenue)
        .map(function (b) { return { brand: b, revenue: brandRevenue[b] }; })
        .sort(function (a, b) { return b.revenue - a.revenue; })
        .slice(0, 5);

      // If no order data, show product brands as a fallback
      if (brandData.length === 0) {
        var brandCounts = {};
        products.forEach(function (p) {
          if (p.brand) brandCounts[p.brand] = (brandCounts[p.brand] || 0) + 1;
        });
        brandData = Object.keys(brandCounts)
          .map(function (b) { return { brand: b, revenue: brandCounts[b] }; })
          .sort(function (a, b) { return b.revenue - a.revenue; })
          .slice(0, 5);
      }

      drawBrandChart();

    } catch (e) {
      console.error('[dashboard] Brand chart error:', e);
    }
  }

  function drawBrandChart() {
    var canvas = document.getElementById('brandChart');
    if (!canvas || !brandData.length) return;

    var ctx = canvas.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    var rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = 200 * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = '200px';
    ctx.scale(dpr, dpr);

    var w = rect.width;
    var h = 200;
    var padding = { top: 10, right: 10, bottom: 40, left: 10 };
    var chartW = w - padding.left - padding.right;
    var chartH = h - padding.top - padding.bottom;

    ctx.clearRect(0, 0, w, h);

    var maxVal = Math.max.apply(null, brandData.map(function (d) { return d.revenue; }));
    if (maxVal === 0) maxVal = 1;

    var barWidth = Math.min(60, (chartW / brandData.length) - 16);
    var colors = ['#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe', '#ede9fe'];

    brandData.forEach(function (d, i) {
      var x = padding.left + (i / brandData.length) * chartW + (chartW / brandData.length - barWidth) / 2;
      var barH = (d.revenue / maxVal) * chartH;
      var y = padding.top + chartH - barH;

      // Bar
      ctx.fillStyle = colors[i % colors.length];
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(x, y, barWidth, barH, 4);
      } else {
        ctx.rect(x, y, barWidth, barH);
      }
      ctx.fill();

      // Value on top
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      var label = fmt.currencyShort(d.revenue);
      ctx.fillText(label, x + barWidth / 2, y - 6);

      // Brand label
      ctx.fillStyle = '#64748b';
      ctx.font = '11px sans-serif';
      ctx.fillText(d.brand || 'Unknown', x + barWidth / 2, h - 10);
    });
  }

  // ── Order Funnel ──
  async function loadFunnel() {
    try {
      var result = await db
        .from('orders')
        .select('id, payment_status, status');

      if (result.error) throw result.error;
      var orders = result.data || [];

      var total = orders.length;
      var pending = orders.filter(function (o) { return o.payment_status === 'pending'; }).length;
      var paid = orders.filter(function (o) { return o.payment_status === 'paid'; }).length;
      var completed = orders.filter(function (o) { return o.status === 'completed'; }).length;

      var stages = [
        { label: 'Orders Created', value: total, pct: 100 },
        { label: 'Payment Pending', value: pending, pct: total > 0 ? Math.round(pending / total * 100) : 0 },
        { label: 'Paid', value: paid, pct: total > 0 ? Math.round(paid / total * 100) : 0 },
        { label: 'Completed', value: completed, pct: total > 0 ? Math.round(completed / total * 100) : 0 }
      ];

      drawFunnel(stages);

    } catch (e) {
      console.error('[dashboard] Funnel error:', e);
      showError(document.getElementById('funnelChart'), 'No order data yet');
    }
  }

  function drawFunnel(stages) {
    var container = document.getElementById('funnelChart');
    if (!container) return;

    container.innerHTML = '';
    var maxVal = stages[0].value || 1;

    stages.forEach(function (stage, i) {
      var row = document.createElement('div');
      row.className = 'funnel-row';

      var width = Math.max(20, (stage.value / maxVal) * 100);

      row.innerHTML =
        '<div class="funnel-label">' + stage.label + '</div>' +
        '<div class="funnel-bar">' +
          '<div class="funnel-fill" style="width:' + width + '%;background:' + getFunnelColor(i) + ';">' +
            fmt.number(stage.value) +
          '</div>' +
        '</div>' +
        '<div class="funnel-value">' + stage.pct + '%</div>';

      container.appendChild(row);
    });
  }

  function getFunnelColor(i) {
    var colors = ['#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe'];
    return colors[i % colors.length];
  }

  // ── Order Distribution Donut ──
  async function loadDonut() {
    try {
      var result = await db
        .from('orders')
        .select('id, status');

      if (result.error) throw result.error;
      var orders = result.data || [];

      var statusCounts = {};
      orders.forEach(function (o) {
        var s = o.status || 'pending';
        statusCounts[s] = (statusCounts[s] || 0) + 1;
      });

      orderStatusData = Object.keys(statusCounts).map(function (s) {
        return { status: s, count: statusCounts[s] };
      }).sort(function (a, b) { return b.count - a.count; });

      drawDonut();

    } catch (e) {
      console.error('[dashboard] Donut error:', e);
    }
  }

  function drawDonut() {
    var container = document.getElementById('donutChart');
    if (!container || !orderStatusData.length) return;

    var total = orderStatusData.reduce(function (s, d) { return s + d.count; }, 0);
    if (total === 0) {
      container.innerHTML = '<div style="padding:20px;color:var(--admin-text-secondary);font-size:13px;text-align:center;">No orders yet</div>';
      return;
    }

    container.innerHTML = '';

    // Canvas
    var canvas = document.createElement('canvas');
    canvas.className = 'donut-canvas';
    canvas.width = 160;
    canvas.height = 160;
    container.appendChild(canvas);

    var ctx = canvas.getContext('2d');
    var cx = 80, cy = 80, radius = 60, lineWidth = 20;

    var colors = ['#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe', '#f87171', '#fbbf24', '#34d399'];
    var startAngle = -Math.PI / 2;

    orderStatusData.forEach(function (d, i) {
      var sliceAngle = (d.count / total) * 2 * Math.PI;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, startAngle, startAngle + sliceAngle);
      ctx.strokeStyle = colors[i % colors.length];
      ctx.lineWidth = lineWidth;
      ctx.stroke();
      startAngle += sliceAngle;
    });

    // Center text
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fmt.number(total), cx, cy - 8);
    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText('Total Orders', cx, cy + 12);

    // Legend
    var legend = document.createElement('div');
    legend.className = 'donut-legend';

    orderStatusData.forEach(function (d, i) {
      var item = document.createElement('div');
      item.className = 'donut-legend-item';
      item.innerHTML =
        '<div class="donut-legend-color" style="background:' + colors[i % colors.length] + ';"></div>' +
        '<div class="donut-legend-label">' + capitalize(d.status) + '</div>' +
        '<div class="donut-legend-value">' + fmt.number(d.count) + '</div>' +
        '<div class="donut-legend-pct">' + Math.round(d.count / total * 100) + '%</div>';
      legend.appendChild(item);
    });

    container.appendChild(legend);
  }

  function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // ── Top Products ──
  async function loadTopProducts() {
    var container = document.getElementById('topProducts');
    if (!container) return;

    try {
      var oResult = await db
        .from('order_items')
        .select('product_id, quantity, price');

      if (oResult.error) throw oResult.error;
      var orderItems = oResult.data || [];

      if (orderItems.length === 0) {
        // Fallback: show top products by review count / sales_count
        var pResult = await db
          .from('products')
          .select('id, name, brand, sales_count')
          .is('deleted_at', null)
          .order('sales_count', { ascending: false })
          .limit(5);

        if (pResult.error) throw pResult.error;
        var products = pResult.data || [];

        container.innerHTML = '';
        if (products.length === 0) {
          showError(container, 'No products yet');
          return;
        }

        // Get primary images
        var pIds = products.map(function (p) { return p.id; });
        var imgResult = await db
          .from('product_images')
          .select('product_id, url')
          .eq('is_primary', true)
          .in('product_id', pIds);
        var imgMap = {};
        if (imgResult.data) imgResult.data.forEach(function (img) { imgMap[img.product_id] = img.url; });

        products.forEach(function (p) {
          var row = document.createElement('div');
          row.className = 'product-row';
          var imgUrl = imgMap[p.id] ? window.productImageUrl(imgMap[p.id]) : '/assets/placeholder-laptop.png';
          row.innerHTML =
            '<img class="product-thumb" src="' + imgUrl + '" alt="" onerror="this.src=\'/assets/placeholder-laptop.png\'">' +
            '<div class="product-info">' +
              '<div class="product-name">' + escapeHtml(p.name) + '</div>' +
              '<div class="product-brand">' + escapeHtml(p.brand || '') + '</div>' +
            '</div>' +
            '<div class="product-stats">' +
              '<div class="product-revenue">' + fmt.number(p.sales_count || 0) + ' sold</div>' +
            '</div>';
          container.appendChild(row);
        });
        return;
      }

      // Aggregate by product
      var productStats = {};
      orderItems.forEach(function (item) {
        if (!productStats[item.product_id]) {
          productStats[item.product_id] = { units: 0, revenue: 0 };
        }
        productStats[item.product_id].units += item.quantity || 0;
        productStats[item.product_id].revenue += (item.price || 0) * (item.quantity || 0);
      });

      // Get top 5 product IDs
      var topIds = Object.keys(productStats)
        .sort(function (a, b) { return productStats[b].revenue - productStats[a].revenue; })
        .slice(0, 5);

      if (topIds.length === 0) {
        showError(container, 'No order data yet');
        return;
      }

      // Fetch product details
      var pResult = await db
        .from('products')
        .select('id, name, brand')
        .in('id', topIds);

      if (pResult.error) throw pResult.error;

      // Get primary images
      var imgResult = await db
        .from('product_images')
        .select('product_id, url')
        .eq('is_primary', true)
        .in('product_id', topIds);
      var imgMap = {};
      if (imgResult.data) imgResult.data.forEach(function (img) { imgMap[img.product_id] = img.url; });

      container.innerHTML = '';
      topIds.forEach(function (pid) {
        var product = (pResult.data || []).find(function (p) { return p.id === pid; });
        var stats = productStats[pid];
        if (!product) return;

        var imgUrl = imgMap[pid] ? window.productImageUrl(imgMap[pid]) : '/assets/placeholder-laptop.png';
        var row = document.createElement('div');
        row.className = 'product-row';
        row.innerHTML =
          '<img class="product-thumb" src="' + imgUrl + '" alt="" onerror="this.src=\'/assets/placeholder-laptop.png\'">' +
          '<div class="product-info">' +
            '<div class="product-name">' + escapeHtml(product.name) + '</div>' +
            '<div class="product-brand">' + escapeHtml(product.brand || '') + '</div>' +
          '</div>' +
          '<div class="product-stats">' +
            '<div class="product-revenue">' + fmt.currency(stats.revenue) + '</div>' +
            '<div class="product-units">' + fmt.number(stats.units) + ' units</div>' +
          '</div>';
        container.appendChild(row);
      });

    } catch (e) {
      console.error('[dashboard] Top products error:', e);
      showError(container, 'Unable to load product data');
    }
  }

  // ── Low Stock ──
  async function loadLowStock() {
    var container = document.getElementById('lowStock');
    if (!container) return;

    try {
      var result = await db
        .from('product_variants')
        .select('id, product_id, name, sku, stock_quantity')
        .lte('stock_quantity', 5)
        .order('stock_quantity', { ascending: true })
        .limit(5);

      if (result.error) throw result.error;
      var variants = result.data || [];

      if (variants.length === 0) {
        container.innerHTML = '<div style="padding:12px;color:var(--admin-success);font-size:13px;">All products well stocked &#10003;</div>';
        return;
      }

      // Get product names
      var productIds = variants.map(function (v) { return v.product_id; });
      var pResult = await db
        .from('products')
        .select('id, name')
        .in('id', productIds);

      var productMap = {};
      if (pResult.data) pResult.data.forEach(function (p) { productMap[p.id] = p.name; });

      container.innerHTML = '';
      variants.forEach(function (v) {
        var row = document.createElement('div');
        row.className = 'stock-row';
        row.innerHTML =
          '<div class="stock-product">' +
            '<div>' + escapeHtml(productMap[v.product_id] || 'Unknown') + '</div>' +
            '<div class="stock-variant">' + escapeHtml(v.name || v.sku || '') + '</div>' +
          '</div>' +
          '<div class="stock-qty">' + fmt.number(v.stock_quantity) + ' left</div>';
        container.appendChild(row);
      });

    } catch (e) {
      console.error('[dashboard] Low stock error:', e);
      showError(container, 'Unable to load stock data');
    }
  }

  // ── Recent Orders ──
  async function loadRecentOrders() {
    var container = document.getElementById('recentOrders');
    if (!container) return;

    try {
      var result = await db
        .from('orders')
        .select('id, order_number, total, payment_status, status, created_at, user_id')
        .order('created_at', { ascending: false })
        .limit(5);

      if (result.error) throw result.error;
      var orders = result.data || [];

      if (orders.length === 0) {
        showError(container, 'No orders yet');
        return;
      }

      // Get customer names from profiles
      var userIds = orders.map(function (o) { return o.user_id; }).filter(Boolean);
      var profileMap = {};
      if (userIds.length > 0) {
        var pResult = await db
          .from('profiles')
          .select('id, full_name')
          .in('id', userIds);
        if (pResult.data) pResult.data.forEach(function (p) { profileMap[p.id] = p.full_name; });
      }

      container.innerHTML = '';
      orders.forEach(function (o) {
        var row = document.createElement('div');
        row.className = 'order-row';
        row.onclick = function () { window.location.href = '/admin/orders.html?id=' + o.id; };

        var customerName = o.user_id ? (profileMap[o.user_id] || 'Customer') : 'Guest';
        var statusClass = o.status || 'pending';

        row.innerHTML =
          '<div class="order-id">#' + (o.order_number || o.id.slice(0, 8)) + '</div>' +
          '<div class="order-customer">' + escapeHtml(customerName) + '</div>' +
          '<div class="order-amount">' + fmt.currency(o.total) + '</div>' +
          '<div class="order-status ' + statusClass + '">' + capitalize(statusClass) + '</div>';

        container.appendChild(row);
      });

    } catch (e) {
      console.error('[dashboard] Recent orders error:', e);
      showError(container, 'Unable to load orders');
    }
  }

  // ── Period Tabs ──
  function initPeriodTabs() {
    var tabs = document.querySelectorAll('.period-tab');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        currentPeriod = parseInt(tab.dataset.days) || 30;
        loadSalesChart(currentPeriod);
      });
    });
  }

  // ── GSAP Animations ──
  function animateDashboard() {
    if (typeof gsap === 'undefined') return;

    gsap.from('.kpi-card', {
      opacity: 0,
      y: 20,
      duration: 0.5,
      stagger: 0.1,
      ease: 'power2.out'
    });

    gsap.from('.admin-card', {
      opacity: 0,
      y: 15,
      duration: 0.4,
      stagger: 0.05,
      ease: 'power2.out',
      delay: 0.3
    });
  }

  // ── Resize handler ──
  var resizeTimer;
  function handleResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (salesData.length) drawSalesChart();
      if (brandData.length) drawBrandChart();
      if (orderStatusData.length) drawDonut();
    }, 200);
  }

  // ── Utility ──
  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Initialize ──
  async function init() {
    if (!db) {
      console.error('[dashboard] Supabase client not initialized');
      return;
    }

    setGreeting();
    initPeriodTabs();
    window.addEventListener('resize', handleResize);

    // Load all data in parallel
    await Promise.all([
      loadKPIs(),
      loadSalesChart(currentPeriod),
      loadBrandChart(),
      loadFunnel(),
      loadDonut(),
      loadTopProducts(),
      loadLowStock(),
      loadRecentOrders()
    ]);

    // Animate after data loads
    animateDashboard();
  }

  // ── Logout ──
  function setupLogout() {
    var btn = document.getElementById('logoutBtn');
    if (btn) {
      btn.addEventListener('click', async function () {
        await db.auth.signOut();
        window.location.href = '/pages/login.html';
      });
    }
  }

  // ── Export for admin guard callback ──
  window.initDashboard = function () {
    setupLogout();
    init();
  };

  // Fallback if guard isn't used
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      if (!window.initDashboard) { setupLogout(); init(); }
    });
  }

})();
