// sw.js: makes the site work offline once it has been opened.
// The page's own files are network-first, so an update shows up on the next visit;
// card images and sounds are cache-first, since they never change. The journal API is never cached.

const CACHE = 'tarot-v3';

const SHELL = [
  './',
  'index.html',
  'styles.css',
  'script.js',
  'js/cardData.js',
  'js/rwsData.js',
  'js/spreads.js',
  'manifest.webmanifest',
  'assets/EBGaramond.ttf',
  'assets/favicon.ico',
  'assets/icons/icon-192.png',
  ...Array.from({ length: 79 }, (_, i) => `assets/CardPictures/small/card_${i + 1}.webp`),
  ...Array.from({ length: 78 }, (_, i) => `assets/rws/small/card_${i + 1}.webp`),
  ...['shuffle', 'fan', 'slide-1', 'slide-2', 'slide-3', 'place-1', 'place-2', 'place-3', 'place-4',
    'shove-1', 'shove-2', 'coin-flick', 'coin-land'].map(name => `assets/sounds/${name}.mp3`),
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      // Caches are shared by everything on this origin (the tailnet host also serves other
      // apps), so only this site's own older caches are removed.
      .then(keys => Promise.all(keys.filter(k => k.startsWith('tarot-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/api/')) return;

  const isMedia = url.pathname.includes('/assets/CardPictures/') || url.pathname.includes('/assets/rws/') ||
    url.pathname.includes('/assets/sounds/');
  event.respondWith(isMedia ? cacheFirst(req) : networkFirst(req));
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
