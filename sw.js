/* WebLobster service worker: cache core assets, runtime cache for assets & JSON */
const VERSION = 'v1.0.0';
const CACHE_CORE = `weblobster-core-${VERSION}`;
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/data/devices.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_CORE).then((cache) => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((key) => {
      if (!key.startsWith('weblobster-core-')) return Promise.resolve();
      if (key !== CACHE_CORE) return caches.delete(key);
      return Promise.resolve();
    }))).then(() => self.clients.claim())
  );
});

function isAssetRequest(url) {
  return url.pathname.startsWith('/assets/');
}

function isDataRequest(url) {
  return url.pathname.startsWith('/data/');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // Only handle same-origin GET requests
  if (req.method !== 'GET' || url.origin !== location.origin) return;

  // HTML navigations: network-first with cache fallback (so updates show up)
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_CORE).then((cache) => cache.put('/index.html', copy));
        return res;
      }).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Assets: cache-first
  if (isAssetRequest(url)) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_CORE).then((cache) => cache.put(req, copy));
        return res;
      }))
    );
    return;
  }

  // Data (e.g., devices.json): stale-while-revalidate
  if (isDataRequest(url) || url.pathname.endsWith('/app.js') || url.pathname.endsWith('/styles.css')) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE_CORE).then((cache) => cache.put(req, copy));
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // Default: try cache, fall back to network
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req))
  );
});
