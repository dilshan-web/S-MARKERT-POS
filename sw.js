const CACHE_NAME = 'lankapos-v3.5.0-offline-pwa';

// Core essential static assets
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './styles.css',
  './db.js',
  './app.js',
  './auth.js',
  './pos.js',
  './inventory.js',
  './customers.js',
  './suppliers.js',
  './dashboard.js',
  './reports.js',
  './expenses.js',
  './grn.js',
  './shifts.js',
  './backup.js',
  './audio.js',
  './i18n.js',
  './dexie.min.js'
];

// External CDN assets to pre-cache for offline UI rendering
const CDN_ASSETS = [
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Noto+Sans+Sinhala:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Pre-cache all core & CDN assets with error isolation
      const allAssets = [...CORE_ASSETS, ...CDN_ASSETS];
      return Promise.allSettled(
        allAssets.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[ServiceWorker] Optional precache notice:', url, err);
          })
        )
      );
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            console.log('[ServiceWorker] Clearing old cache:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Stale-While-Revalidate / Network-First with Cache Fallback for All GET requests
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);

  // Special handling for Firestore / Google APIs WebSocket or Realtime transport
  if (requestUrl.hostname.includes('firestore.googleapis.com') ||
      requestUrl.hostname.includes('firebaseio.com')) {
    return; // Let browser/Firebase handle its own network & offline sync
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      try {
        // Try network fetch first (always fresh when online)
        const networkResponse = await fetch(event.request);
        if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
          cache.put(event.request, networkResponse.clone()).catch(() => {});
        }
        return networkResponse;
      } catch (fetchErr) {
        // Network failed (device is offline) -> serve from cache
        const cachedResponse = await cache.match(event.request);
        if (cachedResponse) {
          return cachedResponse;
        }

        // If user navigates or refreshes any HTML page offline, return cached index.html
        if (event.request.mode === 'navigate' || event.request.headers.get('accept')?.includes('text/html')) {
          const indexCached = await cache.match('./index.html') || await cache.match('./') || await cache.match('/index.html');
          if (indexCached) return indexCached;
        }

        // Return empty JS fallback for external scripts if not in cache so nothing crashes
        if (event.request.destination === 'script' || requestUrl.pathname.endsWith('.js')) {
          return new Response('/* offline script fallback */', {
            status: 200,
            headers: { 'Content-Type': 'application/javascript' }
          });
        }

        throw fetchErr;
      }
    })
  );
});
