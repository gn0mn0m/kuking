/* Service worker «Жарко»: офлайн и обновления. Версия кэша = хэш файлов сборки. */
var CACHE = 'kuking-__VERSION__';
var ASSETS = __ASSETS__;
/* ставим свежие файлы мимо HTTP-кэша (GitHub держит старьё 10 минут) и сразу становимся главными — без «закрой и открой» */
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
  // шрифты Google: из кэша, а нет — скачать и запомнить
  if (url.host === 'fonts.googleapis.com' || url.host === 'fonts.gstatic.com') {
    e.respondWith(caches.open(CACHE + '-fonts').then(function (c) {
      return c.match(req).then(function (hit) { return hit || fetch(req).then(function (r) { c.put(req, r.clone()); return r; }); });
    }));
    return;
  }
  if (url.origin !== location.origin) return; // облако и нейросеть — всегда в сеть, мимо кэша
  // своё: сначала кэш (мгновенный старт и офлайн), обновления приходят новой версией воркера
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(function (hit) {
    return hit || fetch(req).then(function (r) {
      if (r.ok) { var cp = r.clone(); caches.open(CACHE).then(function (c) { c.put(req, cp); }); }
      return r;
    }).catch(function () { return req.mode === 'navigate' ? caches.match('./') : Response.error(); });
  }));
});

/* пуши: дни рождения друзей и напоминания */
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
    var chat = /[?&]chat=([\w-]+)/.exec(url);
    for (var i = 0; i < cs.length; i++) { if (cs[i].url.indexOf(self.registration.scope) === 0 && 'focus' in cs[i]) { if (chat) cs[i].postMessage({ chat: chat[1] }); return cs[i].focus(); } }
    return self.clients.openWindow(url);
  }));
});
