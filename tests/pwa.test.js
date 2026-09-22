import { app } from '../server.js';
import http from 'http';
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runPwaTests() {
  console.log('--- Starting PWA Verification Tests ---');

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Verify Manifest JSON endpoint
    console.log('1. Testing /manifest.json endpoint & headers...');
    const manifestRes = await fetch(`${baseUrl}/manifest.json`);
    assert.strictEqual(manifestRes.status, 200, 'manifest.json must return 200 OK');
    const contentType = manifestRes.headers.get('content-type');
    assert(contentType.includes('json'), 'manifest.json content-type must be JSON');
    
    const manifest = await manifestRes.json();
    assert.strictEqual(manifest.name, 'CampusFix - College Maintenance Management System');
    assert.strictEqual(manifest.short_name, 'CampusFix');
    assert.strictEqual(manifest.display, 'standalone');
    assert.strictEqual(manifest.theme_color, '#1e3a8a');
    assert.strictEqual(manifest.background_color, '#0f172a');
    assert.strictEqual(manifest.start_url, '/');
    assert(Array.isArray(manifest.icons) && manifest.icons.length >= 4, 'Manifest must include standard icon set');
    
    // Check maskable icon in manifest
    const hasMaskable = manifest.icons.some(icon => icon.purpose && icon.purpose.includes('maskable'));
    assert(hasMaskable, 'Manifest must specify a maskable icon for Android adaptive icons');

    // 2. Verify Service Worker endpoint & headers
    console.log('2. Testing /sw.js endpoint & headers...');
    const swRes = await fetch(`${baseUrl}/sw.js`);
    assert.strictEqual(swRes.status, 200, 'sw.js must return 200 OK');
    assert.strictEqual(swRes.headers.get('service-worker-allowed'), '/', 'Service-Worker-Allowed header must be set to /');
    const swText = await swRes.text();
    assert(swText.includes('STATIC_CACHE'), 'Service worker must define static cache');
    assert(swText.includes('stale-while-revalidate') || swText.includes('caches.match'), 'Service worker must implement caching');

    // 3. Verify Offline Fallback Page
    console.log('3. Testing /offline.html fallback page...');
    const offlineRes = await fetch(`${baseUrl}/offline.html`);
    assert.strictEqual(offlineRes.status, 200, 'offline.html must return 200 OK');
    const offlineHtml = await offlineRes.text();
    assert(offlineHtml.includes('CampusFix is currently offline'), 'offline.html must display user-friendly offline message');

    // 4. Verify PWA Icons accessibility
    console.log('4. Testing PWA icon asset endpoints...');
    const iconUrls = [
      '/icon-192.png',
      '/icon-512.png',
      '/icon-maskable-512.png',
      '/apple-touch-icon.png',
      '/favicon.png',
      '/icon.svg'
    ];

    for (const url of iconUrls) {
      const res = await fetch(`${baseUrl}${url}`);
      assert.strictEqual(res.status, 200, `Icon asset ${url} must return 200 OK`);
      const len = parseInt(res.headers.get('content-length') || '0', 10);
      assert(len > 100, `Icon asset ${url} must have valid non-empty payload`);
    }

    // 5. Verify index.html contains proper PWA links and tags
    console.log('5. Testing index.html PWA tags & meta links...');
    const indexRes = await fetch(`${baseUrl}/`);
    assert.strictEqual(indexRes.status, 200);
    const indexHtml = await indexRes.text();
    assert(indexHtml.includes('rel="manifest"'), 'index.html must link manifest.json');
    assert(indexHtml.includes('theme-color'), 'index.html must declare theme-color');
    assert(indexHtml.includes('apple-touch-icon'), 'index.html must link apple-touch-icon');
    assert(indexHtml.includes('pwaInstallTopbarBtn'), 'index.html must provide install UI trigger');
    assert(indexHtml.includes('offlineIndicator'), 'index.html must provide offline UI indicator');

    console.log('All PWA verification tests passed successfully!');
  } finally {
    server.close();
  }
}

runPwaTests().catch(err => {
  console.error('PWA Test Failure:', err);
  process.exit(1);
});
