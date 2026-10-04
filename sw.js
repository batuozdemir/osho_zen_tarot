// sw.js: makes the site work offline once it has been opened.
// The page's own files are network-first, so an update shows up on the next visit;
// card images are cache-first, since they never change. The journal API is never cached.

const CACHE = 'tarot-v1';

const SHELL = [
  './',
  'index.html',
  'styles.css',
  'script.js',
  'js/cardData.js',
  'js/spreads.js',
  'manifest.webmanifest',
  'assets/EBGaramond.ttf',
  'assets/favicon.ico',
  'assets/icons/icon-192.png',
  ...Array.from({ length: 79 }, (_, i) => `assets/CardPictures/small/card_${i + 1}.webp`),
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/api/')) return;

  const isImage = url.pathname.includes('/assets/CardPictures/');
  event.respondWith(isImage ? cacheFirst(req) : networkFirst(req));
});

async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  try {
    const res = await fetch(req);
    if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
    return res;
  } catch {
    return (await caches.match(req, { ignoreSearch: true })) ||
      (req.mode === 'navigate' ? caches.match('./') : Response.error());
  }
}
