const CACHE = 'mateon-v8';
const ASSETS = ['.','index.html','brand.html','css/tokens.css','css/styles.css','css/mateon.css','css/home.css','js/data.js','js/card.js','js/mateon.js','assets/icon-192.png','assets/icon-512.png','assets/og-image.png','assets/logo-symbol.svg','assets/logo-lockup.svg','assets/app-icon.svg','assets/together-home.svg','manifest.webmanifest'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('mateon-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Do not retain personal results encoded in invitation URLs.
  if (url.search) { if (e.request.mode === 'navigate') e.respondWith(fetch(e.request).catch(() => caches.match('index.html'))); return; }
  e.respondWith(fetch(e.request).then(res => {
    if (res.ok) { const copy=res.clone(); e.waitUntil(caches.open(CACHE).then(c => c.put(e.request,copy))); }
    return res;
  }).catch(() => caches.match(e.request).then(hit => hit || (e.request.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
