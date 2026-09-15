/* Lexicon service worker.
 *
 * Strategy is deliberately network-first for the page itself. The whole app —
 * words included — lives in index.html, so a cache-first worker would leave
 * people staring at last week's list until they cleared their browser. With
 * network-first they get the newest push whenever they have signal, and the
 * cached copy the moment they don't.
 *
 * Bump CACHE when the shipped files change.
 */
const CACHE = 'lexicon-app-v7';

const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './config.js',
  './sync.js',
  './native-auth.js',
  './vendor/supabase.js',
  './data/words.js',
  './data/questions.js',
  './data/sheets.js',
  './data/tricky.js',
  './data/zh-Hans.js',
  './data/zh-Hant.js',
  './data/ko.js',
  './data/ja.js',
  './data/es.js',
  './data/pt.js',
  './data/vi.js',
  './data/ar.js',
  './data/ru.js',
  './data/hi.js',
  './fonts/fonts.css',
  './fonts/fraunces-normal-latin-ext.woff2',
  './fonts/fraunces-normal-latin.woff2',
  './fonts/manrope-normal-cyrillic.woff2',
  './fonts/manrope-normal-latin-ext.woff2',
  './fonts/manrope-normal-latin.woff2',
  './fonts/manrope-normal-vietnamese.woff2',
  './fonts/newsreader-italic-latin-ext.woff2',
  './fonts/newsreader-italic-latin.woff2',
  './fonts/newsreader-italic-vietnamese.woff2',
  './fonts/newsreader-normal-latin-ext.woff2',
  './fonts/newsreader-normal-latin.woff2',
  './fonts/newsreader-normal-vietnamese.woff2',
  './fonts/source-serif-4-italic-cyrillic.woff2',
  './fonts/source-serif-4-italic-latin-ext.woff2',
  './fonts/source-serif-4-italic-latin.woff2',
  './fonts/source-serif-4-italic-vietnamese.woff2',
  './fonts/source-serif-4-normal-cyrillic.woff2',
  './fonts/source-serif-4-normal-latin-ext.woff2',
  './fonts/source-serif-4-normal-latin.woff2',
  './fonts/source-serif-4-normal-vietnamese.woff2',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
];

// How long to wait for the network before serving the cached page.
const NET_TIMEOUT = 3500;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // addAll is all-or-nothing; one 404 would leave us with no offline copy
      // at all, so add them individually and tolerate misses.
      .then((cache) => Promise.all(PRECACHE.map((u) => cache.add(u).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function fromNetwork(request, timeout) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), timeout);
    fetch(request).then(
      (response) => {
        clearTimeout(timer);
        resolve(response);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // The page, the scripts and the word data: freshest wins, cache is the
  // safety net. (Scripts change with every release; icons never do.)
  if (request.mode === 'navigate' || request.destination === 'document' || request.destination === 'script') {
    event.respondWith(
      fromNetwork(request, NET_TIMEOUT)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((c) => c.put(request.destination === 'script' ? request : './index.html', copy));
          }
          return response;
        })
        .catch(() =>
          caches
            .match(request.destination === 'script' ? request : './index.html')
            .then((hit) => hit || (request.destination === 'script' ? null : caches.match('./')))
            .then(
              (hit) =>
                hit ||
                new Response('<h1>Offline</h1><p>Open Lexicon once with a connection.</p>', {
                  headers: { 'Content-Type': 'text/html; charset=utf-8' },
                  status: 503,
                })
            )
        )
    );
    return;
  }

  // Icons, manifest: cache first, they barely change.
  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return response;
        })
    )
  );
});

// Lets the page ask for an immediate takeover after an update.
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
