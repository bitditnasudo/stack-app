/* ============================================================================
   SERVICE WORKER — the home notifications fire from (and an offline shell).
   ============================================================================
   THIS FILE SURVIVED THE PWA REMOVAL AND OUTLIVED IT. STACK is installable
   again (see index.html for why that reversed), but this worker never depended
   on that either way: a service worker is not an install feature. Reminders go
   out through
   `navigator.serviceWorker.ready` → `registration.showNotification()`, because
   the plain `new Notification()` constructor is unsupported on Android Chrome
   and throws. Delete this file and reminders stop working in a browser tab too.

   The caching below is now a bonus rather than the point: it makes a repeat
   load fast and a flaky connection survivable.

   Deliberately different from the old one, which was cache-first over a fixed
   ASSETS list under a hand-bumped `stack-v2` cache name. That meant every
   deploy needed the cache string bumped by hand, and forgetting left an
   installed PWA serving stale HTML with no way to tell from the phone.

   What changed, and why:

   1. NAVIGATIONS ARE NETWORK-FIRST. index.html is the one file that must never
      be stale, because it carries the <script src> pointing at the current
      hashed bundle. Cache is the offline fallback, not the default.

   2. HASHED ASSETS ARE CACHE-FIRST. Vite fingerprints /assets/*, so a given URL
      is immutable by construction — if the name matches, the bytes match. No
      revalidation needed, and no version string to bump.

   3. THE CACHE NAME IS BUILD-STAMPED, not hand-edited. vite.config.js has the
      commit; here the version is replaced at build time. Old caches are dropped
      on activate. Nothing to remember at deploy time.

   Keep this file in public/ so Vite copies it verbatim to the origin root — a
   worker served from /assets/ would have a scope of /assets/ and control
   nothing.
   ========================================================================== */

const VERSION = '__SW_VERSION__'          // replaced by vite.config.js at build
const CACHE = `stack-${VERSION}`
// icon-192 is referenced by the notifications AND by the manifest now.
/* The manifest is back in the shell: an installed app that cannot read its own
   manifest offline loses its name and icons on a cold, offline launch. */
const SHELL = ['/', '/index.html', '/icon-192.png', '/site.webmanifest']

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      // addAll rejects the whole install if any one entry 404s; individual puts
      // let the shell cache partially rather than leaving the SW uninstalled.
      .then(c => Promise.allSettled(SHELL.map(u => c.add(u))))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', e => {
  const { request } = e
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return   // let the network handle fonts etc.

  // 1. Navigations: network first, cached shell as the offline fallback.
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request)
        .then(res => {
          const copy = res.clone()
          caches.open(CACHE).then(c => c.put('/index.html', copy))
          return res
        })
        .catch(() => caches.match('/index.html').then(r => r || caches.match('/'))),
    )
    return
  }

  // 2. Fingerprinted assets: cache first, they can never change under a name.
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(
      caches.match(request).then(hit => hit || fetch(request).then(res => {
        const copy = res.clone()
        caches.open(CACHE).then(c => c.put(request, copy))
        return res
      })),
    )
    return
  }

  // 3. Everything else (icons, manifest): cache, revalidating in the background.
  e.respondWith(
    caches.match(request).then(hit => {
      const net = fetch(request).then(res => {
        const copy = res.clone()
        caches.open(CACHE).then(c => c.put(request, copy))
        return res
      }).catch(() => hit)
      return hit || net
    }),
  )
})

/* Focus an open window if there is one, rather than opening a second copy. */
self.addEventListener('notificationclick', e => {
  e.notification.close()
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const open = list.find(c => 'focus' in c)
      return open ? open.focus() : self.clients.openWindow('/')
    }),
  )
})
