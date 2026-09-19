/* MATE:ON Service Worker — 앱 셸 캐시 (network-first, 오프라인 폴백) */
const CACHE = 'mateon-v2';
const ASSETS = [
  '.', 'index.html',
  'css/tokens.css', 'css/styles.css', 'css/mateon.css',
  'js/data.js', 'js/card.js', 'js/mateon.js',
  'assets/icon-192.png', 'assets/icon-512.png', 'assets/og-image.png',
  'manifest.webmanifest',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() =>
      caches.match(e.request).then((hit) => hit || caches.match('index.html'))
    )
  );
});
