const CACHE_NAME = 'nmos-bcc-v2026.03.13';

const FILES_TO_CACHE = [
    './',
    './index.html',
    './manifest.json',
    './favicon.svg',
    './css/style.css',
    './js/app.js',
    './js/nmos-api.js',
    './js/storage.js',
    './js/rds-subscription.js'
];

// Install: cache all app files
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(FILES_TO_CACHE))
    );
    self.skipWaiting();
});

// Activate: remove old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keyList) =>
            Promise.all(
                keyList
                    .filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            )
        )
    );
    self.clients.claim();
});

// Message: force update
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// Fetch: cache-first for app files, network-only for external (NMOS devices)
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) {
        return; // Let NMOS device requests pass through uncached
    }

    event.respondWith(
        caches.match(event.request).then((response) => response || fetch(event.request))
    );
});
