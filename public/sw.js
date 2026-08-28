// Bump to invalidate the cache on deploy.
const CACHE = 'timegraph-v2'

// The app is served under a base path (GitHub Pages subpath in production),
// so resolve everything relative to the registration scope.
const BASE = self.registration.scope

// Navigations go to the network first so a deploy is picked up immediately,
// falling back to the cached shell when offline. Hashed build assets never
// change under a given URL, so those are safe to serve cache-first.
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll([BASE, `${BASE}index.html`])))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return // never cache the time sources

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(`${BASE}index.html`, copy))
          return res
        })
        .catch(() => caches.match(`${BASE}index.html`).then((r) => r ?? Response.error())),
    )
    return
  }

  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ??
        fetch(request).then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(request, copy))
          }
          return res
        }),
    ),
  )
})
