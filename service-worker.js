const CACHE_NAME = 'nmos-bcc-v2026.04.07';

const FILES_TO_CACHE = [
    './',
    './index.html',
    './manifest.json',
    './favicon.svg',
    './css/style.css',
    './js/app.js',
    './js/nmos-api.js',
    './js/storage.js',
    './js/rds-subscription.js',
    './js/streamdeck-bridge.js'
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

// Detect if the requesting client is an installed PWA (?pwa=1)
async function isPwaClient(clientId, requestUrl) {
    // Navigation request: check the request URL itself
    const url = new URL(requestUrl);
    if (url.searchParams.has('pwa')) return true;

    // Asset request: check the client's page URL
    if (clientId) {
        const client = await self.clients.get(clientId);
        if (client && new URL(client.url).searchParams.has('pwa')) return true;
    }
    return false;
}

// Cache-first (installed PWA): serve from cache, fallback to network
function cacheFirst(request) {
    return caches.match(request).then((response) => response || fetch(request));
}

// Network-first (browser): always try network, fallback to cache
function networkFirst(request) {
    return fetch(request)
        .then((response) => {
            // Update cache with fresh response
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            return response;
        })
        .catch(() => caches.match(request));
}

// Fetch: switch strategy based on whether client is installed PWA or browser
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Let NMOS device requests (cross-origin) pass through uncached
    if (url.origin !== self.location.origin) return;

    event.respondWith(
        isPwaClient(event.clientId, event.request.url).then((isPwa) => {
            return isPwa ? cacheFirst(event.request) : networkFirst(event.request);
        })
    );
});
