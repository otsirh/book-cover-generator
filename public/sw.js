// The service worker: keeps a copy of the app so it opens and works offline.
//
// Every request goes to the network first, so a new release shows at once; the copy answers
// when the network can't. The build (scripts/build.js) fills in the release and the files the
// page needs, kept when the worker installs. On the dev server both stay empty, and files are
// kept as the page loads them.

const RELEASE = 'dev';
/** @type {string[]} */
const FILES = [];
const CACHE = `covers-${RELEASE}`;

const worker = /** @type {ServiceWorkerGlobalScope} */ (/** @type {unknown} */ (self));

worker.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(FILES))
      .then(() => worker.skipWaiting()),
  );
});

worker.addEventListener('activate', (event) => {
  // Drop the copies of earlier releases, and look after the open pages from now on.
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith('covers-') && k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => worker.clients.claim()),
  );
});

worker.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  // (Not the HTTP API: its covers aren't the app, and would fill the copy.)
  if (request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  event.respondWith(networkFirst(request));
});

/** The network's answer (also kept, to stay current), or the kept copy when there is none. @param {Request} request */
async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok && response.type === 'basic' && !response.redirected) {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (err) {
    // Offline. The app is kept as "/", whatever its query; another page (the gallery) as itself.
    const app = new URL(request.url).pathname === '/';
    const kept =
      (await cache.match(request, { ignoreSearch: true })) ??
      (request.mode === 'navigate' && app ? await cache.match('/') : undefined);
    if (kept) return kept;
    throw err;
  }
}
