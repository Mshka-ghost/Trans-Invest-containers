/*
  Учёт контейнеров — Транс Инвест
  Service worker: делает приложение открываемым офлайн.

  Стратегия:
  - index.html и manifest.json — "network first": если есть интернет,
    всегда берём свежую версию (чтобы обновления сайта долетали сразу),
    и только при отсутствии сети отдаём последнюю сохранённую копию.
  - Всё остальное (шрифты, Firebase SDK и т.п.) — "cache first": один раз
    загрузили — дальше берём из кэша, не дёргая сеть зря.

  Сами данные (контейнеры, склад, журнал) хранятся не здесь, а в
  Firestore offline-persistence (это включено в самом index.html) —
  этот файл отвечает только за то, чтобы САЙТ открылся без интернета.
*/

const CACHE_VERSION = 'ti-containers-v1';
const APP_SHELL = ['./', './index.html', './manifest.json'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(names.filter(n => n !== CACHE_VERSION).map(n => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return; // Firestore-запросы и т.п. не трогаем

  const isAppShell = req.mode === 'navigate' || APP_SHELL.some(p => req.url.endsWith(p.replace('./', '')));

  if (isAppShell) {
    // network first, cache fallback
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then(cached => cached || caches.match('./index.html')))
    );
    return;
  }

  // cache first, network fallback (шрифты, Firebase SDK, картинки и т.п.)
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then(cache => cache.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => cached);
    })
  );
});
