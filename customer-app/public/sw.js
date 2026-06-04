const CACHE_NAME = 'them-kh-pwa-v4'
const BASE_PATH = new URL(self.registration.scope).pathname
const IS_LOCALHOST = ['localhost', '127.0.0.1', '[::1]'].includes(self.location.hostname)
const withBasePath = (path) => new URL(path, self.registration.scope).pathname
const APP_SHELL = [
  BASE_PATH,
  withBasePath('index.html'),
  withBasePath('favicon.svg'),
  withBasePath('pwa-icon-192.png'),
  withBasePath('pwa-icon-512.png'),
  withBasePath('manifest.webmanifest'),
]

const cacheAppShell = async () => {
  const cache = await caches.open(CACHE_NAME)

  await Promise.allSettled(
    APP_SHELL.map(async (path) => {
      const response = await fetch(path, { cache: 'reload' })
      if (response.ok) {
        await cache.put(path, response)
      }
    }),
  )
}

self.addEventListener('install', (event) => {
  if (IS_LOCALHOST) {
    event.waitUntil(self.skipWaiting())
    return
  }

  event.waitUntil(
    cacheAppShell()
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName)),
      ))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  if (request.method !== 'GET') {
    return
  }

  const requestUrl = new URL(request.url)

  if (requestUrl.origin !== self.location.origin || !requestUrl.pathname.startsWith(BASE_PATH)) {
    return
  }

  if (request.cache === 'no-store') {
    event.respondWith(fetch(request))
    return
  }

  if (IS_LOCALHOST) {
    event.respondWith(fetch(request))
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(withBasePath('index.html'), copy))
          return response
        })
        .catch(() => caches.match(withBasePath('index.html'))),
    )
    return
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse
      }

      return fetch(request).then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response
        }

        const copy = response.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
        return response
      })
    }),
  )
})
