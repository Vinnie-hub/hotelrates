const CACHE_NAME = "hotelrate-app-v12";

const FILES_TO_CACHE = [
  "./",
  "index.html",
  "css/styles.css",
  "js/data.js",
  "js/app.js",
  "manifest.json",
  "assets/hotel%20review%20logo.webp",
  "assets/favicon-192.webp",
  "assets/hotelrate-hero.webp",
  "assets/apple-touch-icon.png",
  "assets/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(FILES_TO_CACHE)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // fonts etc. use the browser cache

  // Pages: network first, fall back to the cached shell when offline
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("index.html")));
    return;
  }

  // Everything else: serve cached copy fast, refresh it in the background
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
