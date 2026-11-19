/* Service worker «Кукинга»: офлайн и обновления. Версия кэша = хэш файлов сборки. */
var CACHE = 'kuking-f1d1b78f45';
var ASSETS = [
"./",
"icons/icon-180.png",
"icons/icon-192.png",
"icons/icon-512.png",
"icons/maskable-512.png",
"index.html",
"js/ai.js",
"js/app.js",
"js/confetti.js",
"js/config.js",
"js/fresh.js",
"js/library.js",
"js/progress-bar.js",
"js/recipes/chashushuli-pasta.js",
"js/recipes/shawarma-bowl.js",
"js/recipes/sichuan-beef.js",
"js/recipes/smash-night.js",
"js/recipes/stroganoff.js",
"js/recipes/taco-night.js",
"js/recipes/tikka-masala.js",
"js/ring-timer.js",
"js/settings.js",
"js/slide-transition.js",
"js/store.js",
"manifest.webmanifest"
];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }));
});
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
