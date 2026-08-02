const CACHE_VERSION = 'yonote-shell-v6';
const SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/apple-touch-icon.png',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/plantuml/plantuml.js',
  '/plantuml/viz-global.js',
];

async function cacheAppShell() {
  const cache = await caches.open(CACHE_VERSION);
  await cache.addAll(SHELL_URLS);

  // Vite emits hashed JS/CSS filenames. Discover them from the built HTML so
  // the installed app can start without a network connection.
  try {
    const response = await fetch('/index.html', { cache: 'no-store' });
    if (!response.ok) return;
    const html = await response.clone().text();
    await cache.put('/index.html', response.clone());
    await cache.put('/', response);

    const assetUrls = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
      .map((match) => new URL(match[1], self.location.origin))
      .filter((url) => url.origin === self.location.origin && !url.pathname.startsWith('/api/'))
      .map((url) => url.pathname);

    await Promise.allSettled([...new Set(assetUrls)].map((url) => cache.add(url)));
  } catch {
    // Core shell files are already cached by cache.addAll.
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(cacheAppShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API calls are never intercepted, cached, replayed or queued.
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(CACHE_VERSION);
            await cache.put('/', response.clone());
          }
          return response;
        })
        .catch(async () => (await caches.match('/')) || (await caches.match('/index.html'))),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then(async (response) => {
        if (response.ok) {
          const cache = await caches.open(CACHE_VERSION);
          await cache.put(request, response.clone());
        }
        return response;
      });
    }),
  );
});
