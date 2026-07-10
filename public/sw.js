// PWA service worker for the hosted web build. Caches the app shell (our own
// origin's HTML/JS/CSS/icons) stale-while-revalidate so Readstand opens offline
// and instantly on repeat visits. Feed/article requests are cross-origin (or go
// through the proxy) and are deliberately not cached here.
//
// This worker is only registered by the hosted web app (see src/main.jsx); the
// Chrome extension uses its own background worker (background.js) and ignores
// this file.
const CACHE = 'readstand-shell-v1'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      await self.clients.claim()
    })()
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return // only our own shell

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE)
      const cached = await cache.match(req)
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) cache.put(req, res.clone())
          return res
        })
        .catch(() => cached)
      return cached || network
    })()
  )
})
