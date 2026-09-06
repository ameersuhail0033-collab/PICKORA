#!/usr/bin/env node
// Minimal static file server using Node.js built-in http module
// No dependencies needed
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = 3000;

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.xml': 'application/xml', '.txt': 'text/plain',
};

const server = http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);

  // Rewrite /pages/foo.html → /pages/foo.html (no change needed for static)
  // Serve index.html for root
  if (url === '/') url = '/index.html';

  // If no extension, try .html
  if (!path.extname(url)) {
    if (fs.existsSync(path.join(ROOT, url + '.html'))) url += '.html';
    else if (fs.existsSync(path.join(ROOT, url, 'index.html'))) url += '/index.html';
  }

  const filePath = path.join(ROOT, url);
  const ext = path.extname(filePath).toLowerCase();

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // Try index.html for SPA-like routes
      const indexPath = path.join(ROOT, 'index.html');
      fs.readFile(indexPath, (err2, fallback) => {
        if (err2) { res.writeHead(404); res.end('Not Found'); return; }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(fallback);
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Pickora dev server running at http://localhost:${PORT}`);
});
