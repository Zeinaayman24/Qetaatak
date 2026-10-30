// ضغطة service worker: makes the site installable and keeps the app shell available when the network drops.
// Data always comes live from the server; only the page shell and built files are cached.
const CACHE = 'daghta-shell-v1';
const SHELL = '/Qetaatak/';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.add(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // Supabase, fonts, Paymob: always network
  if (req.mode === 'navigate') {
    // pages: try the network, fall back to the cached shell (the app routes itself)
    e.respondWith(fetch(req).catch(() => caches.match(SHELL)));
    return;
  }
  if (url.pathname.includes('/_expo/static/') || url.pathname.includes('/icons/') || url.pathname.includes('/assets/')) {
    // built files have hashed names: cache first
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
      return res;
    })));
  }
});
