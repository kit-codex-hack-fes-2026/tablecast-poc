/// <reference lib="webworker" />
import {
  CacheFirst,
  CacheableResponsePlugin,
  ExpirationPlugin,
  NetworkOnly,
  Serwist,
  type PrecacheEntry,
} from "serwist";
import { preparePwaClients } from "./lib/pwa-update";

declare const self: ServiceWorkerGlobalScope & { tablecastPrecacheManifest: PrecacheEntry[] };
const serwist = new Serwist({
  precacheEntries: self.tablecastPrecacheManifest,
  precacheOptions: { cleanupOutdatedCaches: true },
  skipWaiting: false,
  clientsClaim: true,
  runtimeCaching: [
    {
      matcher: ({ url, request }) =>
        request.method === "GET" &&
        url.origin === self.location.origin &&
        /^\/media\/tablecast\/images\/[a-f0-9]{64}\.png$/.test(url.pathname),
      handler: new CacheFirst({
        cacheName: "tablecast-menu-images-v1",
        plugins: [
          new CacheableResponsePlugin({ statuses: [200] }),
          { handlerDidError: ({ request }) => fetch(request) },
          new ExpirationPlugin({
            maxEntries: 256,
            maxAgeSeconds: 30 * 86400,
            maxAgeFrom: "last-used",
            purgeOnQuotaError: true,
          }),
        ],
      }),
    },
    { matcher: ({ request }) => request.mode === "navigate", handler: new NetworkOnly() },
  ],
  fallbacks: {
    entries: [{ url: "/offline.html", matcher: ({ request }) => request.mode === "navigate" }],
  },
});
serwist.addEventListeners();
let updating = false;
self.addEventListener("message", (event: ExtendableMessageEvent) => {
  if (event.data?.type !== "TABLECAST_REQUEST_UPDATE" || updating) return;
  updating = true;
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      try {
        const ready =
          (await preparePwaClients(clients)) &&
          (await preparePwaClients(clients, "TABLECAST_PREPARE_UPDATE"));
        const current = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        if (
          ready &&
          current.every((client) => clients.some((previous) => previous.id === client.id))
        ) {
          await self.skipWaiting();
        } else {
          for (const client of clients) client.postMessage({ type: "TABLECAST_CANCEL_UPDATE" }, []);
        }
      } finally {
        updating = false;
      }
    })(),
  );
});
