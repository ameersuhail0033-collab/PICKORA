/**
 * analytics.js — Admin analytics page with dependency-free canvas charts
 */
(function () {
  'use strict';

  // NOTE: page init is gated behind requireAdmin() in admin/analytics.html;
  // this file only provides the loader + charts.

  window.loadAnalytics = async function loadAnalytics() {
    // Revenue chart
    var revResult = await db.rpc('revenue_series', { p_interval: 'day' });
    if (revResult.error) {
      window.adminErrorState && window.adminErrorState('analytics-top-products', 'Analytics failed to load: ' + revResult.error.message);
      console.error('[analytics] revenue_series error:', revResult.error);
      return;
    }
    drawLineChart('analytics-revenue', revResult.data || [], 'revenue', 'AED ');

    // Orders chart
    drawBarChart('analytics-orders', revResult.data || [], 'orders', '');

    // Top products
    var topResult = await db.rpc('top_products', { p_limit: 10 });
    var tbody = document.getElementById('analytics-top-products');
    if (topResult.error) {
      window.adminErrorState && window.adminErrorState('analytics-top-products', 'Analytics failed to load: ' + topResult.error.message);
      console.error('[analytics] top_products error:', topResult.error);
      return;
    }
    if (topResult.data && topResult.data.length > 0) {
      tbody.innerHTML = topResult.data.map(function (p) {
        return '<tr><td><strong>' + esc(p.name) + '</strong></td><td>' + (p.sales || 0) + '</td><td>' + formatPrice(p.revenue || 0) + '</td></tr>';
      }).join('');
    }
  };

  function drawLineChart(canvasId, data, key, prefix) {
    var canvas = document.getElementById(canvasId);
    if (!canvas || data.length === 0) return;
    var ctx = canvas.getContext('2d');
    var wrap = canvas.parentElement;
    canvas.width = wrap.offsetWidth;
    canvas.height = wrap.offsetHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    var values = data.map(function (d) { return d[key] || 0; });
    var maxVal = Math.max.apply(null, values) || 100;
    var padding = { top: 20, right: 20, bottom: 40, left: 60 };
    var chartW = canvas.width - padding.left - padding.right;
    var chartH = canvas.height - padding.top - padding.bottom;
    var stepX = chartW / (data.length - 1 || 1);
    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    var gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    var textColor = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)';
    var primary = getComputedStyle(document.documentElement).getPropertyValue('--brand-primary').trim() || '#8B5CF6';

    // Grid
    ctx.strokeStyle = gridColor; ctx.lineWidth = 1;
    for (var i = 0; i <= 4; i++) {
      var y = padding.top + (chartH / 4) * i;
      ctx.beginPath(); ctx.moveTo(padding.left, y); ctx.lineTo(canvas.width - padding.right, y); ctx.stroke();
      ctx.fillStyle = textColor; ctx.font = '11px Poppins, sans-serif'; ctx.textAlign = 'right';
      ctx.fillText(prefix + Math.round(maxVal * (1 - i / 4)).toLocaleString(), padding.left - 8, y + 4);
    }

    // Area + Line
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top + chartH);
    data.forEach(function (d, idx) {
      ctx.lineTo(padding.left + idx * stepX, padding.top + chartH - ((d[key] || 0) / maxVal) * chartH);
    });
    ctx.lineTo(padding.left + (data.length - 1) * stepX, padding.top + chartH);
    ctx.closePath();
    var grad = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
    grad.addColorStop(0, primary + '30'); grad.addColorStop(1, primary + '05');
    ctx.fillStyle = grad; ctx.fill();

    ctx.beginPath();
    data.forEach(function (d, idx) {
      var x = padding.left + idx * stepX, y = padding.top + chartH - ((d[key] || 0) / maxVal) * chartH;
      idx === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.strokeStyle = primary; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.stroke();

    // X labels
    ctx.fillStyle = textColor; ctx.font = '10px Poppins, sans-serif'; ctx.textAlign = 'center';
    var labelStep = Math.ceil(data.length / 7);
    data.forEach(function (d, idx) {
      if (idx % labelStep === 0 || idx === data.length - 1) {
        var label = d.date ? new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
        ctx.fillText(label, padding.left + idx * stepX, canvas.height - 10);
      }
    });
  }

  function drawBarChart(canvasId, data, key, prefix) {
    var canvas = document.getElementById(canvasId);
    if (!canvas || data.length === 0) return;
    var ctx = canvas.getContext('2d');
    var wrap = canvas.parentElement;
    canvas.width = wrap.offsetWidth;
    canvas.height = wrap.offsetHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    var values = data.map(function (d) { return d[key] || 0; });
    var maxVal = Math.max.apply(null, values) || 100;
    var padding = { top: 20, right: 20, bottom: 40, left: 60 };
    var chartW = canvas.width - padding.left - padding.right;
    var chartH = canvas.height - padding.top - padding.bottom;
    var barW = Math.max(4, (chartW / data.length) - 4);
    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    var gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    var textColor = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)';
    var accent = getComputedStyle(document.documentElement).getPropertyValue('--brand-accent').trim() || '#84CC16';

    // Grid
    ctx.strokeStyle = gridColor; ctx.lineWidth = 1;
    for (var i = 0; i <= 4; i++) {
      var y = padding.top + (chartH / 4) * i;
      ctx.beginPath(); ctx.moveTo(padding.left, y); ctx.lineTo(canvas.width - padding.right, y); ctx.stroke();
      ctx.fillStyle = textColor; ctx.font = '11px Poppins, sans-serif'; ctx.textAlign = 'right';
      ctx.fillText(prefix + Math.round(maxVal * (1 - i / 4)).toLocaleString(), padding.left - 8, y + 4);
    }

    // Bars
    var gap = chartW / data.length;
    data.forEach(function (d, idx) {
      var val = d[key] || 0;
      var barH = (val / maxVal) * chartH;
      var x = padding.left + idx * gap + (gap - barW) / 2;
      var y = padding.top + chartH - barH;

      var grad = ctx.createLinearGradient(0, y, 0, padding.top + chartH);
      grad.addColorStop(0, accent);
      grad.addColorStop(1, accent + '40');
      ctx.fillStyle = grad;

      // Rounded top
      var r = Math.min(barW / 2, 4);
      ctx.beginPath();
      ctx.moveTo(x, padding.top + chartH);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.lineTo(x + barW - r, y);
      ctx.quadraticCurveTo(x + barW, y, x + barW, y + r);
      ctx.lineTo(x + barW, padding.top + chartH);
      ctx.closePath();
      ctx.fill();
    });

    // X labels
    ctx.fillStyle = textColor; ctx.font = '10px Poppins, sans-serif'; ctx.textAlign = 'center';
    var labelStep = Math.ceil(data.length / 7);
    data.forEach(function (d, idx) {
      if (idx % labelStep === 0 || idx === data.length - 1) {
        var label = d.date ? new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
        ctx.fillText(label, padding.left + idx * gap + gap / 2, canvas.height - 10);
      }
    });
  }
})();
