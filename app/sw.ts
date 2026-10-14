import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope & typeof globalThis;

// Android share sheet → "share to app" (manifest share_target). Stash the
// shared receipt files (or link) in a cache, then open the app, which picks
// them up and starts the receipt import. Registered before Serwist so this
// POST never reaches its router.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'POST' || url.pathname !== '/share-receipt') return;
  event.respondWith((async () => {
    const form = await event.request.formData();
    const cache = await caches.open('shared-receipts');
    for (const key of await cache.keys()) await cache.delete(key);
    const files = form.getAll('receipt').filter((f): f is File => f instanceof File && f.size > 0);
    await Promise.all(files.map((f, i) => cache.put(`/shared-receipt/${i}`, new Response(f, {
      headers: { 'content-type': f.type, 'x-file-name': encodeURIComponent(f.name) },
    }))));
    if (!files.length) {
      const text = [form.get('url'), form.get('text'), form.get('title')].filter(Boolean).join(' ');
      if (text) await cache.put('/shared-receipt/link', new Response(String(text)));
    }
    return Response.redirect('/?shared-receipt=1', 303);
  })());
});

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();
