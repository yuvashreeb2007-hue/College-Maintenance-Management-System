/* ========================================================================= */
/* CampusFix Progressive Web App Service Worker                              */
/* Strategy: Stale-While-Revalidate for App Shell, Network-First for API data*/
/* ========================================================================= */

const VERSION = 'v1.0.1';
const STATIC_CACHE = `campusfix-static-${VERSION}`;
const DATA_CACHE = `campusfix-data-${VERSION}`;

// Pre-cached App Shell Assets
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/manifest.json',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png',
  '/favicon.png',
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Space+Grotesk:wght@500;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css'
];

// Install Event: Precaches App Shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(async (cache) => {
      // Add local assets reliably; fetch external with catch to prevent install failure
      for (const asset of PRECACHE_ASSETS) {
        try {
          await cache.add(asset);
        } catch (err) {
          console.warn(`[CampusFix SW] Failed to pre-cache ${asset}:`, err.message);
        }
      }
    }).then(() => self.skipWaiting())
  );
});

// Activate Event: Cleans up obsolete caches and claims active clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== STATIC_CACHE && key !== DATA_CACHE) {
            console.log(`[CampusFix SW] Deleting obsolete cache: ${key}`);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event: Intelligent routing based on request type
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Bypass non-GET requests (POST, PUT, DELETE should never be cached)
  if (request.method !== 'GET') {
    return;
  }

  // 2. Bypass chrome-extension or other non-http schemes
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // 3. API Requests
  if (url.pathname.startsWith('/api/')) {
    // Network-only for Auth, AI Assistant Chat, and Database status
    if (
      url.pathname.startsWith('/api/auth/') ||
      url.pathname.startsWith('/api/chat/') ||
      url.pathname.startsWith('/api/db-status')
    ) {
      event.respondWith(
        fetch(request).catch(() => {
          return new Response(
            JSON.stringify({ error: 'You are currently offline. Please check your internet connection.' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          );
        })
      );
      return;
    }

    // Network-First with Cache Fallback for general GET API data (Complaints, Categories, Profile, Reports)
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(DATA_CACHE).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(async () => {
          // Fallback to cached API response if available
          const cachedResponse = await caches.match(request);
          if (cachedResponse) {
            return cachedResponse;
          }
          return new Response(
            JSON.stringify({ 
              error: 'Offline mode: Network request failed and no cached data is available.',
              offline: true 
            }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          );
        })
    );
    return;
  }

  // 4. HTML Navigation Requests: Network-First with cached index.html fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          const fallback = await caches.match('/index.html');
          if (fallback) return fallback;
          return caches.match('/');
        })
    );
    return;
  }

  // 5. Static Assets (CSS, JS, Fonts, Images): Stale-While-Revalidate
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
          }
          return networkResponse;
        })
        .catch((err) => {
          // If offline and no cached asset, return nothing or let it fail
          return cachedResponse;
        });

      return cachedResponse || fetchPromise;
    })
  );
});

// Client Message Listener
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
