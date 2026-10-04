'use strict';

const VERSION = 'v1.0.0';
const STATIC_CACHE = 'marje-static-' + VERSION;
const RUNTIME_CACHE = 'marje-runtime-' + VERSION;
const OFFLINE_FALLBACK = new URL('./index.html', self.location.href).href;
const PRECACHE_URLS = [
  './',
  './index.html',
  './HowToUse.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-192-maskable.png',
  './icons/icon-512-maskable.png'
];
const NAVIGATION_KEYS = [OFFLINE_FALLBACK, new URL('./', self.location.href).href];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await cache.addAll(PRECACHE_URLS.map((url) => new Request(url, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
        .map((key) => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if (request.headers.has('range')) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }

  event.respondWith(
    staleWhileRevalidate(request, url.origin === self.location.origin ? STATIC_CACHE : RUNTIME_CACHE)
  );
});

async function handleNavigation(request) {
  const cache = await caches.open(STATIC_CACHE);

  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    for (const key of NAVIGATION_KEYS) {
      const cached = await cache.match(key);
      if (cached) return cached;
    }
    return offlineResponse();
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const revalidate = fetch(request)
    .then((response) => {
      if (isCacheable(response)) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  if (cached) {
    revalidate;
    return cached;
  }

  const response = await revalidate;
  return response || offlineResponse();
}

function isCacheable(response) {
  if (!response) return false;
  return response.ok || response.type === 'opaque';
}

function offlineResponse() {
  return new Response(
    '<!DOCTYPE html><html lang="ar" dir="rtl"><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>غير متصل</title>' +
      '<body style="font-family:system-ui,Tahoma,sans-serif;background:#fdfaf3;color:#2c2a26;' +
      'display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center">' +
      '<div><h1 style="color:#b45309;margin:0 0 .5rem">لا يوجد اتصال</h1>' +
      '<p>افتح التطبيق مرة واحدة وأنت متصل، وسيعمل بعدها دون إنترنت.</p></div>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}