/* Фото блюд. Рисует нейросеть «Жарко» на сервере, хранится в телефоне (IndexedDB «zharko-img») и в облаке
   (docs/img — личные, docs/imgpub — общие для встроенных рецептов). Ключ — «id:sN», как в 4.x. */
(function () {
  'use strict';
  var Z = window.Z, D = Z.data;
  var FORCE = {}, MEM = {}, BUSY = {}, ERR = {}, Q = [], loaded = false, pumping = false, dbp = null;
  function S() { return window.KukingStore; }
  function idb() {
    if (dbp) return dbp;
    dbp = new Promise(function (ok, no) { try { var r = indexedDB.open('zharko-img', 1); r.onupgradeneeded = function () { r.result.createObjectStore('img'); }; r.onsuccess = function () { ok(r.result); }; r.onerror = function () { no(r.error); }; } catch (e) { no(e); } });
    return dbp;
  }
  function key(r) { var i = D.serveIdx(r); return i < 0 ? null : r.id + ':s' + i; }
  function put(k, v) { MEM[k] = v; idb().then(function (d) { d.transaction('img', 'readwrite').objectStore('img').put(v, k); }).catch(function () {}); }
  idb().then(function (d) {
    var rq = d.transaction('img').objectStore('img').openCursor();
    rq.onsuccess = function () { var c = rq.result; if (c) { MEM[c.key] = c.value; c.continue(); } else { loaded = true; paint(); pump(); } };
  }).catch(function () { loaded = true; pump(); });

  function builtin(k) { return !/^(ai|my)-/.test(k); }
  function cloudSave(k, v) {
    var s = S(); if (!s || !s.user || !s.user()) return;
    s.req('POST', 'docs?on_conflict=collection,id,user_id', [{ collection: 'img', id: k, user_id: s.user().id, data: { src: v, at: new Date().toISOString() }, updated_at: new Date().toISOString() }], 'resolution=merge-duplicates,return=minimal').catch(function () {});
    if (builtin(k)) s.req('POST', 'docs', [{ collection: 'imgpub', id: k, user_id: null, data: { src: v, at: new Date().toISOString() } }], 'return=minimal').catch(function () {});
  }
  function shrink(src, max, q) {
    return new Promise(function (ok) {
      var im = new Image(); im.onload = function () { var k = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); ok(c.toDataURL('image/jpeg', q)); };
      im.onerror = function () { ok(src); }; im.src = src;
    });
  }
  function mains(r) {
    return (r.ingredients || []).filter(function (i) { return i && i.name && !/соль|перец мол|вода|масло|сахар|специ|сунели|паприк|кориандр мол|куркум|масала|лавров/i.test(i.name); })
      .map(function (i) { var w = i.unit === 'кг' ? i.amount * 1000 : i.unit === 'г' || i.unit === 'мл' ? i.amount : i.unit === 'шт' ? i.amount * 100 : 30; return { n: Z.plain(i.name).toLowerCase(), w: +w || 0 }; })
      .sort(function (a, b) { return b.w - a.w; }).slice(0, 7).map(function (x) { return x.n; });
  }
  function prompt(r) {
    var s = (r.slides || [])[D.serveIdx(r)] || {};
    var layers = s.plate && s.plate.layers ? s.plate.layers.map(function (l) { return Z.plain(l.what); }).filter(Boolean) : [];
    var vibe = D.mode(r) === 'two' ? 'тёплый вечерний свет, бокал вина на краю кадра в боке' : D.mode(r) === 'crew' ? 'дружеский стол, рядом другие тарелки в мягком боке' : 'дневной свет у окна, домашняя кухня';
    return ['Фотография блюда для кулинарного журнала: «' + r.title + '».',
      'В кадре реально только: ' + mains(r).join(', ') + '. Ничего чужого.',
      (s.dishes || []).length ? 'Посуда: ' + s.dishes.map(Z.plain).join(', ') + '.' : '',
      layers.length ? 'Раскладка: ' + layers.join('; ') + '.' : '',
      'Порция большая и сытная, подача аккуратная, чистые борта тарелки, глянец соуса, свежая зелень.',
      'Ракурс 45°, мягкий боковой свет, малая глубина резкости, ' + vibe + '. Фотореализм, без текста и рук.'].filter(Boolean).join(' ').slice(0, 1800);
  }
  function can() { return !!(window.KukingAI && KukingAI.canImage && KukingAI.canImage()); }
  function want(r) { var k = key(r); if (!k || MEM[k] || BUSY[k] || ERR[k] || Q.indexOf(k) >= 0) return; Q.push(k); ctx[k] = r; pump(); }
  var ctx = {};
  function pump() {
    if (!loaded || pumping || !Q.length) return;
    var k = Q.shift(), r = ctx[k]; if (MEM[k] || !r) return pump();
    var s = S(), u = s && s.user && s.user(); if (!u) return;
    pumping = true; BUSY[k] = 1; paint();
    var get1 = function (q) { return s.req('GET', 'docs?select=data&' + q + '&limit=1').then(function (x) { return x && x[0] && x[0].data && x[0].data.src; }).catch(function () { return null; }); };
    (FORCE[k] ? Promise.resolve(null) : get1('collection=eq.img&id=eq.' + encodeURIComponent(k) + '&user_id=eq.' + u.id))
      .then(function (src) { if (FORCE[k]) return null; return src || (builtin(k) ? get1('collection=eq.imgpub&id=eq.' + encodeURIComponent(k) + '&user_id=is.null') : null); })
      .then(function (src) {
        if (src) return src;
        if (!can()) throw new Error('no');
        return KukingAI.image(prompt(r)).then(function (x) { return shrink(x, 1080, 0.82); }).then(function (x) { cloudSave(k, x); return x; });
      })
      .then(function (src) { put(k, src); }, function (e) { ERR[k] = 1; })
      .then(function () { delete BUSY[k]; delete FORCE[k]; pumping = false; paint(); setTimeout(pump, 300); });
  }
  /* разметка фото: <div class="ph" data-img="id"> — сама подставит картинку, когда она будет */
  function html(r, cls, style) {
    var k = key(r), src = k && MEM[k];
    if (!src) want(r);
    return '<div class="ph ' + (cls || '') + (k && BUSY[k] ? ' ph-wait' : '') + '" data-img="' + Z.esc(r.id) + '" style="--ph-c:' + D.color(r) + ';' + (style || '') + '">' + (src ? '<img src="' + src + '" alt="' + Z.esc(r.title) + '" loading="lazy" decoding="async">' : '') + '</div>';
  }
  function paint() {
    document.querySelectorAll('[data-img]').forEach(function (el) {
      var r = D.byId(el.getAttribute('data-img')); if (!r) return; var k = key(r), src = k && MEM[k];
      el.classList.toggle('ph-wait', !!(k && BUSY[k]));
      var old = el.querySelector('img'); if (!src && old) old.remove();
      if (src && !el.querySelector('img')) { var im = new Image(); im.alt = r.title; im.decoding = 'async'; im.src = src; im.style.opacity = '0'; im.style.transition = 'opacity .3s'; el.appendChild(im); im.onload = function () { im.style.opacity = '1'; }; }
    });
  }
  /* через 6 секунд после старта по одному дорисовываем фото ко всей книге */
  setTimeout(function () { D.all().forEach(function (r) { var k = key(r); if (k && !MEM[k]) { ctx[k] = r; if (Q.indexOf(k) < 0) Q.push(k); } }); pump(); }, 6000);
  Z.img = { html: html, paint: paint, has: function (r) { var k = key(r); return !!(k && MEM[k]); }, src: function (r) { var k = key(r); return k ? MEM[k] : null; },
    redo: function (r) { var k = key(r); if (!k) return; delete MEM[k]; delete ERR[k]; idb().then(function (d) { d.transaction('img', 'readwrite').objectStore('img').delete(k); }); var s = S(); if (s && s.user && s.user()) s.req('DELETE', 'docs?collection=eq.img&id=eq.' + encodeURIComponent(k) + '&user_id=eq.' + s.user().id).catch(function () {}); FORCE[k] = 1; ctx[k] = r; Q.unshift(k); paint(); pump(); } };
})();
