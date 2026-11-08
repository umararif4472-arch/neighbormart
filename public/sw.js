/*
 * NeighborMart service worker (Phase 8) — deliberately simple:
 * - Precache the app shell essentials + offline page on install.
 * - Navigations: network-first, falling back to the cached shell for
 *   SPA routes and to /offline.html when there's no cache at all.
 * - Same-origin static assets (hashed JS/CSS, icons): cache-first.
 * - Cross-origin (Firebase, Cloudinary): network only — live data is
 *   never served stale from here.
 * Bump SW_VERSION to invalidate old caches on deploy.
 */
const SW_VERSION = 'neighbormart-v1'
const SHELL_CACHE = `${SW_VERSION}-shell`
const SHELL_URLS = ['/', '/offline.html', '/manifest.webmanifest', '/icon-192.png', '/favicon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(SW_VERSION)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(SHELL_CACHE).then((cache) => cache.put('/', copy))
          return response
        })
        .catch(async () => {
          const cache = await caches.open(SHELL_CACHE)
          return (await cache.match('/')) ?? (await cache.match('/offline.html'))
        }),
    )
    return
  }

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ??
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        }),
    ),
  )
})
