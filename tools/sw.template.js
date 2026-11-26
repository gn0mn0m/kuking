/* Service worker «Жарко»: офлайн и обновления. Версия кэша = хэш файлов сборки. */
var CACHE = 'kuking-__VERSION__';
var ASSETS = __ASSETS__;
var FONTS = 'zharko-fonts'; // не начинается с kuking- — activate его не чистит
/* ставим свежие файлы мимо HTTP-кэша и сразу становимся главными — без «закрой и открой» */
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS.map(function (u) { return new Request(u, { cache: 'reload' }); })); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('message', function (e) { if (e.data === 'skip') self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k.indexOf('kuking-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (url.origin !== location.origin) return; // чужие адреса — мимо воркера
  // API своего сервера (вход, таблицы, нейросеть) — всегда в сеть, мимо кэша
  if (/\/(auth|rest|functions)\/v1\//.test(url.pathname)) return;
  // шрифты со своего сервера (fonts/*.woff2): в списке ASSETS их нет (папка есть только на сервере) —
  // кэшируются при первом запросе в отдельный кэш, который переживает обновления версий. Нет файла (404) — не кэшируем,
  // браузер возьмёт запасной шрифт.
  if (/\/fonts\/[^/]+\.woff2$/.test(url.pathname)) {
    e.respondWith(caches.open(FONTS).then(function (c) {
      return c.match(req).then(function (hit) { return hit || fetch(req).then(function (r) { if (r.ok) c.put(req, r.clone()); return r; }); });
    }));
    return;
  }
  // другие страницы (legal/*.html) — из сети, офлайн из кэша; в кэш оболочки «./» их не кладём
  if (req.mode === 'navigate' && url.pathname !== new URL('./', self.registration.scope).pathname && !/\/index\.html$/.test(url.pathname)) {
    e.respondWith(fetch(req).catch(function () { return caches.match(req, { ignoreSearch: true }).then(function (h) { return h || caches.match('./'); }); }));
    return;
  }
  // оболочка приложения — сначала сеть (свежая версия сразу), нет сети за 2,5 с — из кэша
  if (req.mode === 'navigate') {
    e.respondWith(new Promise(function (ok) {
      var done = false, t = setTimeout(function () { caches.match('./').then(function (h) { if (!done && h) { done = true; ok(h); } }); }, 2500);
      fetch(req, { cache: 'no-store' }).then(function (r) { if (done) return; done = true; clearTimeout(t); if (r.ok) { var cp = r.clone(); caches.open(CACHE).then(function (c) { c.put('./', cp); }); } ok(r); })
        .catch(function () { caches.match('./').then(function (h) { if (!done) { done = true; ok(h || Response.error()); } }); });
    }));
    return;
  }
  // остальное своё: из кэша этой версии (мгновенно и офлайн), новая версия воркера приносит новые файлы
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(function (hit) {
    return hit || fetch(req).then(function (r) {
      if (r.ok) { var cp = r.clone(); caches.open(CACHE).then(function (c) { c.put(req, cp); }); }
      return r;
    }).catch(function () { return req.mode === 'navigate' ? caches.match('./') : Response.error(); });
  }));
});

/* пуши: напоминания плана, дни рождения */
self.addEventListener('push', function (e) {
  var d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Жарко', {
    body: d.body || '', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: d.tag || 'kuking', data: { url: d.url || './' }
  }));
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) {
    for (var i = 0; i < cs.length; i++) { if (cs[i].url.indexOf(self.registration.scope) === 0 && 'focus' in cs[i]) return cs[i].focus(); }
    return self.clients.openWindow(url);
  }));
});
