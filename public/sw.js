/* Sutra ERP service worker: offline app shell for the salesman order screen.
 * - Never caches API responses (all data stays server-authoritative).
 * - Static Next.js assets: cache-first (they are content-hashed).
 * - Navigations: network-first; only the salesman screens (/dashboard, /orders/new) are kept for
 *   offline use, everything else falls back to /offline.
 * Orders captured offline live in localStorage and are synced by the page with an idempotency key.
 */
const VERSION = "sutra-v1";
const SHELL = ["/offline", "/manifest.webmanifest", "/icon.svg", "/icons/icon-192.png"];
const OFFLINE_PAGES = ["/dashboard", "/orders/new"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
        return res;
      })),
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && OFFLINE_PAGES.includes(url.pathname)) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(url.pathname, copy));
          }
          return res;
        })
        .catch(() => caches.match(url.pathname).then((hit) => hit || caches.match("/offline"))),
    );
  }
});
