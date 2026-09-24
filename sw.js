// ─────────────────────────────────────────────
// sw.js - Mi Biblioteca
//
// App (html, css, js): network-first con cache: 'no-cache'.
//   Así cada carga con conexión pregunta al servidor si hay versión nueva,
//   aunque GitHub Pages mande Cache-Control: max-age=600. Sin esto el
//   navegador puede servir HTML nuevo con JS viejo durante 10 minutos
//   (lo que pasó en Control-cocina). No hace falta subir versión a mano.
//
// Fuentes e iconos: cache-first (no cambian).
// Las portadas NO se cachean aquí: llegan como respuesta opaca y Chrome
// cuenta cada una como ~7 MB de cuota. Las guarda la caché HTTP normal.
// APIs (Open Library, Wikidata, Apps Script): no se tocan.
// ─────────────────────────────────────────────

const CACHE_APP    = 'biblioteca-app';
const CACHE_STATIC = 'biblioteca-static-v1';

const APP_SHELL = ['./', './index.html', './style.css', './script.js', './sagas.js', './manifest.json', './icons/icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_APP).then(c => c.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(k => k !== CACHE_APP && k !== CACHE_STATIC).map(k => caches.delete(k))
  )));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  const estatico =
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com' ||
    (url.origin === location.origin && url.pathname.includes('/icons/'));

  if (estatico) { e.respondWith(cacheFirst(req)); return; }
  if (url.origin !== location.origin) return; // APIs: directo a la red

  e.respondWith(networkFirst(req));
});

async function networkFirst(req) {
  try {
    const res = await fetch(req, { cache: 'no-cache' });
    if (res.ok) {
      const copia = res.clone();
      caches.open(CACHE_APP).then(c => c.put(req, copia));
    }
    return res;
  } catch (err) {
    const cacheada = await caches.match(req, { ignoreSearch: true });
    return cacheada || caches.match('./index.html');
  }
}

async function cacheFirst(req) {
  const cacheada = await caches.match(req);
  if (cacheada) return cacheada;
  const res = await fetch(req);
  // El CSS de Google Fonts se pide sin CORS (respuesta opaca): también se guarda
  if (res.ok || res.type === 'opaque') {
    const copia = res.clone();
    caches.open(CACHE_STATIC).then(c => c.put(req, copia));
  }
  return res;
}
