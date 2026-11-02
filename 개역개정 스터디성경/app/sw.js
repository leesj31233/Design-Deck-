// Network first (revalidating with the server), cache as fallback so the book still opens offline.
const CACHE = "bible-study-v2";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
));

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const sameOrigin = new URL(req.url).origin === location.origin;
  const net = sameOrigin && req.mode !== "navigate" ? fetch(req.url, { cache: "no-cache" }) : fetch(req);
  e.respondWith(
    net.then(res => {
      if (res.ok && sameOrigin) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req))
  );
});
