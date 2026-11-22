/* Фото подачи: нейросеть рисует реалистичную фотографию готовой тарелки по подаче рецепта.
   Рисуется по кнопке (это дорого), хранится в телефоне (IndexedDB) и в облаке (docs/img) — второй раз не рисуем. */
(function () {
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var MEM = {}, BUSY = {}, ERR = {}, dbp = null, loaded = false, Q = [], queued = {};
  function idb() {
    if (dbp) return dbp;
    dbp = new Promise(function (ok, no) {
      try { var r = indexedDB.open('zharko-img', 1); r.onupgradeneeded = function () { r.result.createObjectStore('img'); }; r.onsuccess = function () { ok(r.result); }; r.onerror = function () { no(r.error); }; } catch (e) { no(e); }
    });
    return dbp;
  }
  function put(k, v) { MEM[k] = v; idb().then(function (d) { d.transaction('img', 'readwrite').objectStore('img').put(v, k); }).catch(function () {}); }
  function del(k) { delete MEM[k]; idb().then(function (d) { d.transaction('img', 'readwrite').objectStore('img').delete(k); }).catch(function () {}); var S = window.KukingStore; if (S && S.user && S.user() && S.req) S.req('DELETE', 'docs?collection=eq.img&id=eq.' + encodeURIComponent(k) + '&user_id=eq.' + S.user().id).catch(function () {}); }
  /* при старте поднимаем всё из телефона, потом добираем из облака то, чего нет */
  idb().then(function (d) {
    var st = d.transaction('img').objectStore('img'), rq = st.openCursor();
    rq.onsuccess = function () { var c = rq.result; if (c) { MEM[c.key] = c.value; c.continue(); } else { loaded = true; refresh(); pump(); } };
  }).catch(function () { loaded = true; pump(); });
  setTimeout(function () {
    var S = window.KukingStore; if (!S || !S.user || !S.user() || !S.req) return;
    S.req('GET', 'docs?select=id&collection=eq.img&user_id=eq.' + S.user().id).then(function (rows) {
      (rows || []).forEach(function (r) { var k = r.id; if (MEM[k]) return;
        S.req('GET', 'docs?select=data&collection=eq.img&id=eq.' + encodeURIComponent(k) + '&user_id=eq.' + S.user().id).then(function (x) { var v = x && x[0] && x[0].data && x[0].data.src; if (v) { put(k, v); refresh(); } }).catch(function () {}); });
    }).catch(function () {});
  }, 5000);
  function save(k, v) {
    put(k, v);
    var S = window.KukingStore; if (S && S.user && S.user() && S.req) S.req('POST', 'docs?on_conflict=collection,id,user_id', [{ collection: 'img', id: k, user_id: S.user().id, data: { src: v, at: new Date().toISOString() }, updated_at: new Date().toISOString() }], 'resolution=merge-duplicates,return=minimal').catch(function () {});
  }
  function shrink(src, max, q) {
    return new Promise(function (ok) {
      var im = new Image(); im.onload = function () { var k = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k); var g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(im, 0, 0, c.width, c.height); ok(c.toDataURL('image/jpeg', q)); };
      im.onerror = function () { ok(src); }; im.src = src;
    });
  }

  /* ---------- описание кадра ---------- */
  function clean(t) { return String(t || '').replace(/\{[^}]+\}/g, '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim(); }
  function serveOf(r, idx) { var s = (r.slides || []).filter(function (x) { return x.type === 'serve'; }); return idx != null ? (r.slides || [])[idx] : s[0]; }
  function vibe(r) { return r.mode === 'romance' ? 'тёплый приглушённый вечерний свет, свеча на заднем плане в боке, бокал вина на краю кадра' : r.mode === 'friends' ? 'дружеский стол, рядом другие тарелки и напитки в мягком боке, живой естественный свет' : 'дневной свет из окна, деревянный стол, уютная домашняя кухня'; }
  function prompt(r, s) {
    s = s || serveOf(r) || {};
    var layers = s.plate && s.plate.layers ? s.plate.layers.map(function (l) { return clean(l.what); }).filter(Boolean) : [];
    var parts = [
      'Реалистичная ресторанная фуд-фотография готового блюда «' + r.title + '»' + (r.tagline ? ' (' + clean(r.tagline).slice(0, 160) + ')' : '') + '.',
      s.photo ? clean(s.photo) : '',
      (s.dishes || []).length ? 'Посуда: ' + s.dishes.map(clean).join(', ') + '.' : '',
      layers.length ? 'На тарелке, как разложено: ' + layers.join('; ') + '.' : '',
      (s.points || []).length ? 'Подача: ' + s.points.slice(0, 5).map(clean).join(' ') : '',
      'Ракурс сверху под 45°, блюдо в центре кадра, малая глубина резкости, ' + vibe(r) + '. Аппетитные текстуры, лёгкий блеск соуса, пар от горячего. Без текста, надписей, людей и рук.'
    ];
    return parts.filter(Boolean).join(' ').slice(0, 1500);
  }

  /* ---------- рисуем ---------- */
  function make(k, r, s, done) {
    done = done || function () {};
    if (BUSY[k]) return done(); if (!(window.KukingAI && KukingAI.image)) return done();
    BUSY[k] = 1; delete ERR[k]; refresh();
    KukingAI.image(prompt(r, s)).then(function (src) { return shrink(src, 1080, 0.82); })
      .then(function (src) { delete BUSY[k]; save(k, src); refresh(); if (window.kHaptic) window.kHaptic(12); done(); })
      .catch(function (e) { delete BUSY[k]; ERR[k] = e && e.message || 'Фото не получилось'; refresh(); done(); });
  }
  /* блок фото: на слайде подачи и в карточке */
  function block(k, cls) {
    var v = MEM[k], b = BUSY[k] || queued[k], e = ERR[k], can = window.KukingAI && KukingAI.canImage && KukingAI.canImage();
    if (v) return '<figure class="dp ' + (cls || '') + '" data-dpk="' + esc(k) + '"><img src="' + v + '" alt="Фото подачи" loading="lazy"><figcaption><span>✦ Так это выглядит</span><button type="button" class="dp-re" data-dp="redo" data-dpk="' + esc(k) + '"' + (b ? ' disabled' : '') + '>' + (b ? 'Перерисовываю…' : 'Другое фото') + '</button></figcaption></figure>';
    if (b) return '<div class="dp dp-wait ' + (cls || '') + '" data-dpk="' + esc(k) + '"><div class="dp-shim"></div><p>Фотограф снимает подачу… обычно 20–60 секунд</p></div>';
    if (!can) return '';
    return '<button type="button" class="dp dp-btn ' + (cls || '') + '" data-dp="make" data-dpk="' + esc(k) + '"><span class="dp-cam" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg></span><b>Показать, как это выглядит</b><small>' + (e ? esc(e) : 'Нейросеть нарисует реалистичное фото этой подачи') + '</small></button>';
  }
  var ctxR = {}; // ключ → {r, s}
  function serveHTML(r, idx) { var k = r.id + ':s' + idx; ctxR[k] = { r: r, s: (r.slides || [])[idx] }; return block(k, 'dp-serve'); }
  function heroKey(r) { var i = (r.slides || []).map(function (x) { return x.type; }).indexOf('serve'); return r.id + ':s' + i; }
  function heroSrc(r) { return MEM[heroKey(r)] || null; }
  function cardHTML(r) { var i = (r.slides || []).map(function (x) { return x.type; }).indexOf('serve'); if (i < 0) return ''; return serveHTML(r, i); }
  function refresh() {
    document.querySelectorAll('[data-dpk]').forEach(function (el) {
      if (el.classList.contains('dp-re')) return;
      var k = el.getAttribute('data-dpk'), cls = el.classList.contains('dp-serve') ? 'dp-serve' : '';
      var w = document.createElement('div'); w.innerHTML = block(k, cls); var n = w.firstChild;
      if (n) el.replaceWith(n); else el.remove();
    });
    document.querySelectorAll('[data-dp-hero]').forEach(function (el) { var k = el.getAttribute('data-dp-hero'), src = MEM[k]; el.classList.toggle('ph-wait', !!(BUSY[k] || queued[k])); if (src) { el.classList.add('has-ph'); el.style.setProperty('--ph', 'url("' + src + '")'); } var rb = el.querySelector('.hero-re'); if (rb) { rb.disabled = !!BUSY[k]; rb.textContent = BUSY[k] ? 'Рисую…' : src ? 'Другое фото' : 'Нарисовать фото'; } });
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-dp]'); if (!b) return; e.stopPropagation();
    var k = b.getAttribute('data-dpk'), c = ctxR[k]; if (!c) return;
    delete ERR[k]; make(k, c.r, c.s);
  }, true);

  /* фото — основная часть рецепта: рисуем само, как только рецепт появился или открылся без фото. По одному за раз. */
  function auto(r) {
    if (!r || !r.id) return; var i = (r.slides || []).map(function (x) { return x.type; }).indexOf('serve'); if (i < 0) return;
    var k = r.id + ':s' + i; if (MEM[k] || BUSY[k] || queued[k] || ERR[k]) return;
    if (!(window.KukingAI && KukingAI.canImage && KukingAI.canImage())) return;
    ctxR[k] = { r: r, s: r.slides[i] }; queued[k] = 1; Q.push(k); pump();
  }
  var pumping = false;
  function pump() {
    if (!loaded || pumping || !Q.length) return;
    var k = Q.shift(); if (MEM[k]) { delete queued[k]; return pump(); }
    pumping = true;
    var S = window.KukingStore, u = S && S.user && S.user();
    var check = u && S.req ? S.req('GET', 'docs?select=data&collection=eq.img&id=eq.' + encodeURIComponent(k) + '&user_id=eq.' + u.id).then(function (x) { return x && x[0] && x[0].data && x[0].data.src; }).catch(function () { return null; }) : Promise.resolve(null);
    check.then(function (src) {
      if (src) { delete queued[k]; put(k, src); refresh(); pumping = false; return pump(); }
      var c = ctxR[k]; if (!c) { delete queued[k]; pumping = false; return pump(); }
      make(k, c.r, c.s, function () { delete queued[k]; pumping = false; refresh(); setTimeout(pump, 400); });
    });
  }
  function state(r) { var k = heroKey(r); var si = +k.split(':s')[1]; if (!ctxR[k] && r.slides && r.slides[si]) ctxR[k] = { r: r, s: r.slides[si] }; return MEM[k] ? 'ready' : (BUSY[k] || queued[k]) ? 'busy' : 'none'; }
  window.KDish = { state: state, can: function () { return !!(window.KukingAI && KukingAI.canImage && KukingAI.canImage()); }, auto: auto, serveHTML: serveHTML, cardHTML: cardHTML, heroSrc: heroSrc, heroKey: heroKey, prompt: prompt, refresh: refresh, forget: del };
})();
