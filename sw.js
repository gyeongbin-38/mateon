const CACHE = 'mateon-v26';
const VERSION = '20261010-01';
const ASSETS = [
  '.',
  'index.html',
  'brand.html',
  'css/tokens.css',
  'css/styles.css',
  'css/mateon.css',
  'css/home.css',
  'css/pretendard.css',
  'js/config.js',
  'js/data.js',
  'js/card.js',
  'js/vendor/qrcode.js',
  'js/vendor/driver.js',
  'js/vendor/driver.css',
  'js/vendor/tinybase.js',
  'js/vendor/modern-screenshot.js',
  'js/vendor/tesseract.min.js',
  'js/lifetools.js',
  'js/secure.js',
  'js/i18n.js',
  'js/household.js',
  'js/appviews.js',
  'js/mateon.js',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'assets/og-image.png',
  'assets/logo-symbol.svg',
  'assets/logo-lockup.svg',
  'assets/app-icon.svg',
  'assets/together-home.svg',
  'manifest.webmanifest',
];
ASSETS.push('assets/character-sheet.png', 'assets/character-sheet-cutout-v2.png', 'assets/character-sheet.webp', 'assets/character-sheet-cutout-v2.webp');
for (let fi = 0; fi < 92; fi++) ASSETS.push('fonts/pretendard/PretendardVariable.subset.' + fi + '.woff2');
const SHELL = ASSETS.map((p) => (/\.(js|css)$/.test(p) ? p + '?v=' + VERSION : p));
self.addEventListener('install', (e) =>
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL.map((p) => new Request(p, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  )
);
self.addEventListener('activate', (e) =>
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('mateon-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
);
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Do not retain personal results encoded in invitation URLs.
  const versionedAsset = url.search === '?v=' + VERSION && /\.(js|css)$/.test(url.pathname);
  if (url.search && !versionedAsset) {
    if (e.request.mode === 'navigate') e.respondWith(fetch(e.request, { cache: 'no-cache' }).catch(() => caches.match('index.html')));
    return;
  }
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          e.waitUntil(caches.open(CACHE).then((c) => c.put(e.request, copy)));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || (e.request.mode === 'navigate' ? caches.match('index.html') : Response.error())))
  );
});
