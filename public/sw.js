// Offline support for the web version (the desktop and Android apps already carry their pages).
// Pages: network first, the saved copy when offline. Build files (/_next/static, content-hashed):
// saved on first use and never re-downloaded. Database requests (Supabase) are not handled here;
// the app keeps its own copy of the data and queues changes (lib/offline.ts).
const VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const PAGES = `erp-pages-${VERSION}`;
const ASSETS = "erp-assets";
const BASE = new URL(self.registration.scope).pathname; // "/" or "/all-in-one-ERP/"
const NETWORK_WAIT_MS = 4000;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(PAGES).then((c) => c.add(BASE)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("erp-pages-") && k !== PAGES).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const isAsset = (url) => url.pathname.startsWith(`${BASE}_next/static/`) || /\.(woff2?|svg|png|ico|jpg|webp)$/.test(url.pathname);

async function fromNetworkThenCache(request) {
  const cache = await caches.open(PAGES);
  try {
    const response = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error("slow")), NETWORK_WAIT_MS)),
    ]);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const saved = (await cache.match(request, { ignoreSearch: true })) || (await caches.match(request, { ignoreSearch: true }));
    if (saved) return saved;
    // "/page" and "/page/" are the same page (the server normally redirects between them).
    const url = new URL(request.url);
    if (!/\.\w+$/.test(url.pathname)) {
      url.pathname = url.pathname.endsWith("/") ? url.pathname.slice(0, -1) : `${url.pathname}/`;
      url.search = "";
      const other = await cache.match(url.href);
      if (other) return other;
    }
    // Never opened here before: the start page still loads and the app takes over from there.
    return (await cache.match(BASE)) || Response.error();
  }
}

async function fromCacheThenNetwork(request) {
  const cache = await caches.open(ASSETS);
  const saved = await cache.match(request);
  if (saved) return saved;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;
  if (request.mode === "navigate" || url.pathname.endsWith(".txt")) {
    // Pages and their data files (the .txt files Next.js loads when moving between pages).
    event.respondWith(fromNetworkThenCache(request));
  } else if (isAsset(url)) {
    event.respondWith(fromCacheThenNetwork(request));
  }
});

// After sign-in the app sends the pages this person can open; save them (and the build files they
// use) in the background so they open offline even if they were never visited.
self.addEventListener("message", (event) => {
  if (event.data?.type !== "warm" || !Array.isArray(event.data.pages)) return;
  event.waitUntil((async () => {
    const pages = await caches.open(PAGES);
    const assets = await caches.open(ASSETS);
    for (const path of event.data.pages.slice(0, 80)) {
      try {
        const url = new URL(path.replace(/^\//, ""), self.registration.scope);
        const res = await fetch(url, { credentials: "same-origin" });
        if (!res.ok) continue;
        const html = await res.clone().text();
        await pages.put(url, res);
        const txt = new URL(url.pathname.endsWith("/") ? `${url.pathname}index.txt` : `${url.pathname}.txt`, url);
        fetch(txt).then((r) => r.ok && pages.put(txt, r)).catch(() => {});
        for (const m of html.matchAll(/(?:src|href)="([^"]*\/_next\/static\/[^"]+)"/g)) {
          const asset = new URL(m[1], url);
          if (!(await assets.match(asset))) await fetch(asset).then((r) => r.ok && assets.put(asset, r)).catch(() => {});
        }
      } catch {}
    }
  })());
});
