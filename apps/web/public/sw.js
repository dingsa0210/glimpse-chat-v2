const CACHE_VERSION = "glimpse-pwa-v2";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const APP_SHELL_URL = "/";
const PRECACHE_URLS = [
  APP_SHELL_URL,
  "/offline",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-192.png",
  "/icons/icon-maskable-512.png"
];

async function cacheAppShell() {
  const cache = await caches.open(STATIC_CACHE);
  await Promise.all(PRECACHE_URLS.map((url) => cache.add(url).catch(() => undefined)));
  try {
    const response = await fetch(APP_SHELL_URL, { cache: "no-store" });
    if (!response.ok) return;
    await cache.put(APP_SHELL_URL, response.clone());
    const html = await response.text();
    const assetUrls = Array.from(html.matchAll(/(?:src|href)="([^"]+)"/g), (match) => match[1])
      .filter((url) => url && url.startsWith("/_next/static/"));
    await Promise.all(Array.from(new Set(assetUrls)).map((url) => cache.add(url).catch(() => undefined)));
  } catch {
    // A later online navigation will refresh the shell cache.
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheAppShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("glimpse-pwa-") && key !== STATIC_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function networkNavigation(request) {
  const cache = await caches.open(STATIC_CACHE);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  try {
    const response = await fetch(request, { signal: controller.signal });
    if (response.ok) await cache.put(APP_SHELL_URL, response.clone());
    return response;
  } catch {
    return (await cache.match(APP_SHELL_URL)) || (await cache.match("/offline")) || Response.error();
  } finally {
    clearTimeout(timeout);
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok && response.type === "basic") {
    const cache = await caches.open(STATIC_CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Chat data, authentication, media and real-time traffic must always remain network-owned.
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/") ||
    url.pathname.startsWith("/media/") ||
    url.pathname.startsWith("/socket.io/") ||
    url.pathname.startsWith("/.well-known/")
  ) return;

  if (request.mode === "navigate") {
    event.respondWith(networkNavigation(request));
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(request));
  }
});
