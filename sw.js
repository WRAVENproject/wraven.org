const CACHE_VERSION = 'wraven-v1.1.0';

const PRECACHE = [
  '/manifest.json',
  '/imgs/littlelogo.png',
  '/imgs/icon-192x192.png',
  '/imgs/icon-512x512.png',
  '/imgs/widelogo.png',
  '/imgs/og-image.png'
];

const BYPASS_HOSTS = [
  'dashboard.wraven.org',
  'api.ipify.org',
  'ipapi.co',
  'httpbin.org',
  'ipinfo.io'
];

const FONT_HOSTS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;
  if (BYPASS_HOSTS.some((h) => url.hostname.includes(h))) return;

  if (FONT_HOSTS.some((h) => url.hostname.includes(h))) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (url.origin === self.location.origin) {
    const isAsset = /\.(png|jpg|jpeg|webp|gif|svg|ico|woff2?|ttf|eot)$/i.test(url.pathname);
    event.respondWith(isAsset ? staleWhileRevalidate(request) : networkFirst(request));
    return;
  }

  event.respondWith(networkFirst(request));
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.destination === 'document') {
      return new Response('WRAVEN — Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
    }
    return Response.error();
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_VERSION);
    cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);
  const fetched = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  });
  return cached || fetched;
}

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'CLEAR_CACHE') {
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith('wraven-')).map((k) => caches.delete(k)))
    );
  }
});
