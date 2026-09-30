const CACHE_NAME = 'lankapos-v3.4.0-offline';

// Cache all local JS/CSS assets so app loads fully offline
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
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
  './dexie.min.js',
  './styles.css',
  './js/app.js',
  './js/auth.js',
  './js/pos.js',
  './js/inventory.js',
  './js/customers.js',
  './js/suppliers.js',
  './js/dashboard.js',
  './js/reports.js',
  './js/expenses.js',
  './js/grn.js',
  './js/shifts.js',
  './js/backup.js',
  './js/audio.js',
  './js/i18n.js',
  './js/db.js',
  './js/dexie.min.js'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Cache each asset individually so one failure doesn't block others
      return Promise.allSettled(
        STATIC_ASSETS.map(url =>
          cache.add(url).catch(() => {}) // ignore missing files
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

// Network-First Strategy: Serve from network, fallback to cache if offline
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // Skip Firebase / CDN requests - let them fail gracefully offline
  const url = event.request.url;
  if (url.includes('firebasejs') || url.includes('gstatic.com') ||
      url.includes('googleapis.com') || url.includes('tailwindcss.com') ||
      url.includes('jsdelivr.net') || url.includes('unpkg.com')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        // Return empty 200 for scripts so the page doesn't break
        return new Response('', { status: 200, headers: { 'Content-Type': 'application/javascript' } });
      })
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const resClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone));
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match('./index.html');
          }
        });
      })
  );
});
