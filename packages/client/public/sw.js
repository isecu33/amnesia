/* Service worker de TÓTEM (D-043). Escrito a mano, sin dependencias.
 *
 * - Precache del app shell (index, manifest, iconos y los assets con hash del build).
 * - Navegación: network-first con respaldo al shell cacheado (arranque offline).
 * - /assets/* (nombre con hash): cache-first.
 * - Todo lo demás (WebSocket, matchmaking, otros orígenes, no-GET) NO se intercepta.
 * - Actualización controlada: el SW nuevo queda en espera hasta que la app, desde
 *   `src/pwa.ts`, le manda SKIP_WAITING en un momento seguro (nunca a media partida).
 *
 * `__BUILD_ID__` y `__PRECACHE__` los sustituye el plugin de `vite.config.ts` al
 * construir; así la caché cambia con cada build y las viejas se purgan en `activate`.
 */
const BUILD_ID = '__BUILD_ID__';
const PRECACHE = /** @type {string[]} */ (JSON.parse('__PRECACHE__'));
const CACHE = `totem-${BUILD_ID}`;
const SHELL = '/index.html';
const NAV_TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      // Sin skipWaiting: el SW nuevo espera a que la app lo autorice.
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith('totem-') && k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

/** Red con tope de tiempo; si falla o tarda, rechaza para caer a caché. */
function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(request).then(
      (res) => {
        clearTimeout(timer);
        resolve(res);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

async function navigate(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetchWithTimeout(request, NAV_TIMEOUT_MS);
    if (res.ok) await cache.put(SHELL, res.clone());
    return res;
  } catch {
    const cached = await cache.match(SHELL);
    return cached || Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) await cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(navigate(request));
    return;
  }
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (url.pathname === '/manifest.webmanifest') {
    event.respondWith(cacheFirst(request));
  }
  // Cualquier otra petición sigue su camino normal (servidor de juego incluido).
});
