/* Service worker «Жарко»: офлайн и обновления. Версия кэша = хэш файлов сборки. */
var CACHE = 'kuking-509d09e011';
var ASSETS = [
"./",
"css/app.css",
"icons/favicon-16.png",
"icons/favicon-32.png",
"icons/icon-180.png",
"icons/icon-192.png",
"icons/icon-512.png",
"icons/icon.svg",
"icons/maskable-512.png",
"index.html",
"js/app.js",
"js/core.js",
"js/data.js",
"js/gen.js",
"js/img.js",
"js/lib/ai.js",
"js/lib/config.js",
"js/lib/store.js",
"js/recipes/buckwheat-merchant.js",
"js/recipes/chashushuli-pasta.js",
"js/recipes/chicken-potato-tray.js",
"js/recipes/shawarma-bowl.js",
"js/recipes/sichuan-beef.js",
"js/recipes/smash-night.js",
"js/recipes/stroganoff.js",
"js/recipes/taco-night.js",
"js/recipes/teriyaki-chicken.js",
"js/recipes/tikka-masala.js",
"js/social.js",
"js/ui/book.js",
"js/ui/cook.js",
"js/ui/friends.js",
"js/ui/plan.js",
"js/ui/recipe.js",
"js/ui/settings.js",
"js/ui/today.js",
"manifest.webmanifest"
];
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
  // страница — сначала сеть (свежая версия сразу), нет сети за 2,5 с — из кэша
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

/* пуши: напоминания плана, сообщения, дни рождения */
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
