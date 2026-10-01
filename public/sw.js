/* Lyra service worker — makes the app installable and gives it an offline shell.
 *
 * Scope is deliberately narrow:
 *  - /api/* is NEVER touched. Chat, sync (SSE), file access and code execution must always reach the
 *    live server; a cached API response would be stale data or, worse, a replayed action.
 *  - Only same-origin GET requests are handled.
 *  - HTML pages are not cached (the bundle they reference embeds the access token); when the network
 *    is down a navigation gets /offline.html instead.
 *  - Hashed build assets (/_next/static/*) are cache-first: their URLs change whenever content changes.
 *
 * Bump VERSION when this file's behaviour changes; old caches are deleted on activate.
 */
const VERSION = "lyra-sw-v1";
const STATIC_CACHE = VERSION + "-static";
const SHELL_CACHE = VERSION + "-shell";
const OFFLINE_URL = "/offline.html";
const SHELL_ASSETS = [OFFLINE_URL, "/favicon.svg", "/icon.svg", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("lyra-sw-") && !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/** Decides how (and whether) a request is handled. Returns "network-first" | "cache-first" | "swr" | null (= hands off). */
function strategyFor(request, url) {
  if (request.method !== "GET") return null;
  if (url.origin !== self.location.origin) return null;
  if (url.pathname.startsWith("/api/")) return null;
  if (request.headers && request.headers.has && request.headers.has("range")) return null; // media seeking
  if (request.mode === "navigate") return "network-first";
  if (url.pathname.startsWith("/_next/static/")) return "cache-first";
  if (SHELL_ASSETS.indexOf(url.pathname) !== -1) return "swr";
  return null;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  const strategy = strategyFor(request, url);
  if (!strategy) return; // let the browser handle it normally

  if (strategy === "network-first") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
  } else if (strategy === "cache-first") {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) =>
        cache.match(request).then(
          (hit) =>
            hit ||
            fetch(request).then((response) => {
              if (response && response.ok) cache.put(request, response.clone());
              return response;
            })
        )
      )
    );
  } else {
    event.respondWith(
      caches.open(SHELL_CACHE).then((cache) =>
        cache.match(request).then((hit) => {
          const refresh = fetch(request)
            .then((response) => {
              if (response && response.ok) cache.put(request, response.clone());
              return response;
            })
            .catch(() => hit);
          return hit || refresh;
        })
      )
    );
  }
});
