/**
 * api/sitemap.js — Vercel Serverless Function
 *
 * Generates a dynamic XML sitemap listing all active products.
 *
 * GET /api/sitemap → XML sitemap
 */
const { getSupabase, jsonRes } = require('./_lib');

module.exports = async function handler(req, res) {
  const siteUrl = process.env.PUBLIC_SITE_URL || 'https://pickoraonline.com';

  try {
    const db = getSupabase();

    // Get all active products
    const { data: products } = await db
      .from('products')
      .select('slug, updated_at, created_at')
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false });

    // Get categories
    const { data: categories } = await db
      .from('categories')
      .select('slug, updated_at')
      .eq('is_active', true)
      .order('sort_order');

    const pages = [
      { url: '/', priority: '1.0', changefreq: 'daily' },
      { url: '/pages/shop.html', priority: '0.9', changefreq: 'daily' },
      { url: '/pages/login.html', priority: '0.3', changefreq: 'monthly' },
      { url: '/pages/register.html', priority: '0.3', changefreq: 'monthly' },
    ];

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    // Static pages
    pages.forEach(function (page) {
      xml += '  <url>\n';
      xml += '    <loc>' + siteUrl + page.url + '</loc>\n';
      xml += '    <changefreq>' + page.changefreq + '</changefreq>\n';
      xml += '    <priority>' + page.priority + '</priority>\n';
      xml += '  </url>\n';
    });

    // Categories
    if (categories) {
      categories.forEach(function (cat) {
        xml += '  <url>\n';
        xml += '    <loc>' + siteUrl + '/pages/shop.html?category=' + cat.slug + '</loc>\n';
        xml += '    <changefreq>weekly</changefreq>\n';
        xml += '    <priority>0.7</priority>\n';
        xml += '  </url>\n';
      });
    }

    // Products
    if (products) {
      products.forEach(function (product) {
        const lastmod = product.updated_at || product.created_at;
        const date = lastmod ? new Date(lastmod).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
        xml += '  <url>\n';
        xml += '    <loc>' + siteUrl + '/product/' + product.slug + '</loc>\n';
        xml += '    <lastmod>' + date + '</lastmod>\n';
        xml += '    <changefreq>weekly</changefreq>\n';
        xml += '    <priority>0.8</priority>\n';
        xml += '  </url>\n';
      });
    }

    xml += '</urlset>';

    res.writeHead(200, { 'Content-Type': 'application/xml' });
    res.end(xml);

  } catch (err) {
    console.error('[sitemap] Error:', err);
    // Return minimal valid sitemap on error
    res.writeHead(200, { 'Content-Type': 'application/xml' });
    res.end('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>' + siteUrl + '</loc></url></urlset>');
  }
};
