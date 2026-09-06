-- =============================================================
-- PICKORA STORE — Seed Data
-- Run LAST. Inserts default settings, categories, products.
-- =============================================================

-- NOTE: store_settings is intentionally NOT inserted here.
-- The setup wizard inserts the first row after the admin account is created.
-- This ensures the setup wizard triggers on a fresh deployment.

-- ── Categories ───────────────────────────────────────────────
INSERT INTO categories (name, slug, description, sort_order) VALUES
  ('Gaming Laptops', 'gaming-laptops', 'High-performance gaming laptops with powerful GPUs', 1),
  ('Business Laptops', 'business-laptops', 'Professional laptops for work and productivity', 2),
  ('Ultrabooks', 'ultrabooks', 'Thin and lightweight laptops for everyday use', 3),
  ('Workstations', 'workstations', 'Powerful workstations for creative professionals', 4),
  ('Chromebooks', 'chromebooks', 'Affordable Chrome OS laptops', 5),
  ('Accessories', 'accessories', 'Laptop accessories — bags, stands, peripherals', 6),
  ('Components', 'components', 'RAM, SSDs, and other upgrade components', 7),
  ('Refurbished', 'refurbished', 'Certified refurbished laptops at great prices', 8)
ON CONFLICT (slug) DO NOTHING;

-- ── Products (Laptop-focused) ────────────────────────────────
INSERT INTO products (name, slug, description, short_description, category_id, brand, sku, price, compare_at_price, stock_quantity, is_featured, is_active) VALUES
  (
    'Alienware m16 R2 Gaming Laptop',
    'alienware-m16-r2',
    'The Alienware m16 R2 features an Intel Core Ultra 9 processor paired with an NVIDIA GeForce RTX 4070 GPU. Its 16-inch QHD+ 240Hz display delivers stunning visuals, while 32GB DDR5 RAM and 1TB NVMe SSD ensure blazing-fast performance. Advanced cooling with Cryo-tech technology keeps things cool under pressure.',
    'Intel Core Ultra 9, RTX 4070, 32GB DDR5, 1TB SSD, 16" QHD+ 240Hz',
    (SELECT id FROM categories WHERE slug = 'gaming-laptops'),
    'Alienware', 'ALW-M16R2-001', 2199.99, 2499.99, 15, true, true
  ),
  (
    'MacBook Pro 16" M3 Max',
    'macbook-pro-16-m3-max',
    'Apple MacBook Pro 16-inch with M3 Max chip. 36-core GPU, 48GB unified memory, 1TB SSD. Features an stunning Liquid Retina XDR display, up to 22 hours of battery life, and the power of Apple Silicon for demanding professional workflows.',
    'M3 Max, 48GB Unified Memory, 1TB SSD, 16.2" Liquid Retina XDR',
    (SELECT id FROM categories WHERE slug = 'workstations'),
    'Apple', 'MBP-16-M3MAX-001', 3499.00, 0, 10, true, true
  ),
  (
    'Dell XPS 15 (2024)',
    'dell-xps-15-2024',
    'The Dell XPS 15 features Intel Core Ultra 7, NVIDIA RTX 4060, 32GB RAM, and a gorgeous 15.6" OLED 3.5K InfinityEdge display. Premium build quality with CNC-machined aluminum and carbon fiber. Perfect for creators and professionals.',
    'Intel Ultra 7, RTX 4060, 32GB, 15.6" OLED 3.5K InfinityEdge',
    (SELECT id FROM categories WHERE slug = 'ultrabooks'),
    'Dell', 'DELL-XPS15-001', 1799.99, 1999.99, 20, true, true
  ),
  (
    'ASUS ROG Strix G16 (2024)',
    'asus-rog-strix-g16',
    'The ASUS ROG Strix G16 packs an Intel Core i9-14900HX and NVIDIA RTX 4080 GPU with 175W TGP. Its 16" QHD 240Hz panel with 3ms response time is ideal for competitive gaming. 32GB DDR5-5600 RAM, 2TB PCIe Gen4 SSD.',
    'i9-14900HX, RTX 4080, 32GB DDR5, 2TB SSD, 16" QHD 240Hz',
    (SELECT id FROM categories WHERE slug = 'gaming-laptops'),
    'ASUS', 'ASUS-ROG-G16-001', 2499.99, 2799.99, 12, true, true
  ),
  (
    'Lenovo ThinkPad X1 Carbon Gen 12',
    'lenovo-thinkpad-x1-carbon-gen12',
    'The legendary ThinkPad X1 Carbon Gen 12 with Intel Core Ultra 7, 32GB LPDDR5x RAM, 1TB SSD, and a 14" 2.8K OLED display. Ultra-light at 2.48 lbs with legendary ThinkPad reliability, keyboard, and security features.',
    'Intel Ultra 7, 32GB, 1TB SSD, 14" 2.8K OLED, 2.48 lbs',
    (SELECT id FROM categories WHERE slug = 'business-laptops'),
    'Lenovo', 'LNV-X1C-G12-001', 1849.00, 2099.00, 18, true, true
  ),
  (
    'HP Spectre x360 16 (2024)',
    'hp-spectre-x360-16',
    'HP Spectre x360 16 convertible laptop with Intel Core Ultra 7, Intel Arc GPU, 32GB RAM, 1TB SSD. Features a stunning 16" 3K OLED touchscreen with 120Hz, stylus support, and 360° hinge for tablet mode.',
    'Intel Ultra 7, 32GB, 1TB SSD, 16" 3K OLED Touch, Convertible',
    (SELECT id FROM categories WHERE slug = 'ultrabooks'),
    'HP', 'HP-SPEC-X360-001', 1699.99, 1899.99, 14, false, true
  ),
  (
    'Razer Blade 16 (2024)',
    'razer-blade-16',
    'The Razer Blade 16 features dual-mode Mini LED display (4K 120Hz / FHD+ 240Hz), Intel Core i9-14900HX, NVIDIA RTX 4090, 32GB DDR5, 2TB SSD. CNC aluminum unibody with per-key RGB lighting.',
    'i9-14900HX, RTX 4090, 32GB, 2TB SSD, 16" Dual-Mode Mini LED',
    (SELECT id FROM categories WHERE slug = 'gaming-laptops'),
    'Razer', 'RAZ-B16-2024-001', 3999.99, 0, 8, true, true
  ),
  (
    'ASUS Zenbook 14 OLED',
    'asus-zenbook-14-oled',
    'Ultra-thin ASUS Zenbook 14 with Intel Core Ultra 5, 16GB RAM, 512GB SSD, and a beautiful 14" 2.8K OLED display. Weighs just 2.82 lbs with all-day battery life. Perfect for students and professionals.',
    'Intel Ultra 5, 16GB, 512GB SSD, 14" 2.8K OLED, 2.82 lbs',
    (SELECT id FROM categories WHERE slug = 'ultrabooks'),
    'ASUS', 'ASUS-ZEN-14-001', 999.99, 1199.99, 25, false, true
  ),
  (
    'MSI Titan 18 HX',
    'msi-titan-18-hx',
    'The MSI Titan 18 HX is the ultimate desktop replacement: Intel Core i9-14900HX, NVIDIA RTX 4090, 64GB DDR5, 2TB NVMe SSD. Features an 18" Mini LED 4K 120Hz display and Cherry MX mechanical keyboard.',
    'i9-14900HX, RTX 4090, 64GB, 2TB SSD, 18" Mini LED 4K 120Hz',
    (SELECT id FROM categories WHERE slug = 'gaming-laptops'),
    'MSI', 'MSI-T18HX-001', 4499.99, 0, 5, true, true
  ),
  (
    'Framework Laptop 16',
    'framework-laptop-16',
    'The modular Framework Laptop 16 with AMD Ryzen 9 7940HS, configurable GPU module (AMD RX 7700S), up to 96GB DDR5 RAM. Fully repairable and upgradeable. A laptop designed to last.',
    'Ryzen 9 7940HS, RX 7700S GPU Module, Modular, Repairable',
    (SELECT id FROM categories WHERE slug = 'workstations'),
    'Framework', 'FW-16-001', 1899.00, 0, 10, false, true
  )
ON CONFLICT (slug) DO NOTHING;

-- ── Product Images (placeholder URLs using picsum) ───────────
INSERT INTO product_images (product_id, url, alt, sort_order, is_primary)
SELECT p.id,
  'https://picsum.photos/seed/' || p.slug || '-1/800/600',
  p.name || ' - Main',
  0,
  true
FROM products p
WHERE NOT EXISTS (SELECT 1 FROM product_images WHERE product_id = p.id)
ON CONFLICT DO NOTHING;

INSERT INTO product_images (product_id, url, alt, sort_order, is_primary)
SELECT p.id,
  'https://picsum.photos/seed/' || p.slug || '-2/800/600',
  p.name || ' - Side',
  1,
  false
FROM products p
WHERE p.slug IN ('alienware-m16-r2', 'macbook-pro-16-m3-max', 'dell-xps-15-2024', 'asus-rog-strix-g16')
  AND NOT EXISTS (SELECT 1 FROM product_images WHERE product_id = p.id AND sort_order = 1)
ON CONFLICT DO NOTHING;

-- ── Coupons ──────────────────────────────────────────────────
INSERT INTO coupons (code, discount_type, discount_value, min_order, max_uses, is_active) VALUES
  ('WELCOME10', 'percentage', 10.00, 0, 1000, true),
  ('SAVE50', 'fixed', 50.00, 500, 500, true),
  ('SUMMER2024', 'percentage', 15.00, 200, 200, true),
  ('FREESHIP', 'fixed', 9.99, 0, 0, true),
  ('LAPTOP200', 'fixed', 200.00, 1000, 100, true)
ON CONFLICT (code) DO NOTHING;

-- ── Product Variants ─────────────────────────────────────────
INSERT INTO product_variants (product_id, name, price, stock_quantity, option1) VALUES
  ((SELECT id FROM products WHERE slug = 'alienware-m16-r2'), '32GB / 1TB', 2199.99, 10, '32GB'),
  ((SELECT id FROM products WHERE slug = 'alienware-m16-r2'), '64GB / 2TB', 2599.99, 5, '64GB'),
  ((SELECT id FROM products WHERE slug = 'macbook-pro-16-m3-max'), '36GB / 1TB', 3499.00, 8, '36GB'),
  ((SELECT id FROM products WHERE slug = 'macbook-pro-16-m3-max'), '48GB / 2TB', 3999.00, 4, '48GB'),
  ((SELECT id FROM products WHERE slug = 'dell-xps-15-2024'), '16GB / 512GB', 1499.99, 12, '16GB'),
  ((SELECT id FROM products WHERE slug = 'dell-xps-15-2024'), '32GB / 1TB', 1799.99, 8, '32GB'),
  ((SELECT id FROM products WHERE slug = 'asus-rog-strix-g16'), '16GB / 1TB', 2099.99, 6, '16GB'),
  ((SELECT id FROM products WHERE slug = 'asus-rog-strix-g16'), '32GB / 2TB', 2499.99, 6, '32GB'),
  ((SELECT id FROM products WHERE slug = 'lenovo-thinkpad-x1-carbon-gen12'), '16GB / 512GB', 1549.00, 10, '16GB'),
  ((SELECT id FROM products WHERE slug = 'lenovo-thinkpad-x1-carbon-gen12'), '32GB / 1TB', 1849.00, 8, '32GB')
ON CONFLICT DO NOTHING;
