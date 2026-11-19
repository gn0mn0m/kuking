/* Library — главный экран «Кукинга»: книга рецептов, рандом, оценки 1–10 с комментариями,
   правка (убрать/вернуть). Выбирает активный рецепт (window.MENU) до запуска app.js.
   Оценки и комментарии хранятся в db артефакта (коллекция reviews, doc = id рецепта),
   чтобы Claude читал их при подготовке новых рецептов; без db — в браузере. */
(function () {
  'use strict';
  var R = (window.RECIPES || []).slice();
  var KEY = 'kuking:active', HKEY = 'kuking:hidden', editing = false;
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function set(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }
  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function load(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }

  /* убранные: { id: время }. Больше суток — удалён насовсем (gone). */
  var DAY = 24 * 60 * 60 * 1000, GKEY = 'kuking:gone';
  var hidden = load(HKEY, {});
  if (Array.isArray(hidden)) { var o = {}; hidden.forEach(function (id) { o[id] = Date.now(); }); hidden = o; }
  var gone = load(GKEY, []);
  function kill(id) { delete hidden[id]; if (gone.indexOf(id) < 0) gone.push(id); }
  Object.keys(hidden).forEach(function (id) { if (Date.now() - hidden[id] > DAY) kill(id); });
  function saveHidden() { try { localStorage.setItem(HKEY, JSON.stringify(hidden)); localStorage.setItem(GKEY, JSON.stringify(gone)); } catch (e) {} }
  saveHidden();
  R = R.filter(function (r) { return gone.indexOf(r.id) < 0; });
  if (window.Fresh) gone.forEach(function (id) { if (id.indexOf('ai-') === 0) window.Fresh.forget(id); });
  if (!R.length) R = window.RECIPES || [];
  function isHid(id) { return Object.prototype.hasOwnProperty.call(hidden, id); }

  /* оценки: { id: { score, comment } } */
  var SKEY = 'kuking:reviews', reviews = load(SKEY, {});
  var old = load('kuking:scores', null);
  if (old) { Object.keys(old).forEach(function (id) { if (!reviews[id]) reviews[id] = { score: old[id], comment: '' }; }); try { localStorage.removeItem('kuking:scores'); } catch (e) {} }
  var drafts = {}, rating = {}, edit = {}, db = null;
  function saveLocal() { try { localStorage.setItem(SKEY, JSON.stringify(reviews)); } catch (e) {} }
  saveLocal();
  function rv(id) { return reviews[id] || { score: 0, comment: '' }; }
  function titleOf(id) { var r = R.filter(function (x) { return x.id === id; })[0]; return r ? r.title : id; }
  function persist(id) {
    saveLocal();
    if (!db) return;
    var v = reviews[id], ref = db.collection('reviews').doc(id);
    (v ? ref.set({ score: v.score, comment: v.comment || '', title: titleOf(id), at: v.at || today(), updatedAt: new Date().toISOString() }) : ref.delete())
      .catch(function () { /* без прав на запись — останется в браузере */ });
  }

  var shown = R.filter(function (r) { return !isHid(r.id); });
  var active = R.filter(function (r) { return r.id === get(); })[0] || shown[shown.length - 1] || R[R.length - 1];
  window.MENU = active;

  var ov = document.getElementById('library');
  var btn = document.getElementById('libBtn');

  var opens = load('kuking:opens', {}), lastOpen = load('kuking:last', {});
  function choose(id) {
    opens[id] = (opens[id] || 0) + 1; lastOpen[id] = today();
    try { localStorage.setItem('kuking:opens', JSON.stringify(opens)); localStorage.setItem('kuking:last', JSON.stringify(lastOpen)); } catch (e) {}
    if (id === active.id) { close(); return; }
    set(id);
    try { sessionStorage.setItem('kuking:skipHome', '1'); } catch (e) {}
    location.reload();
  }
  function open() { render(); ov.hidden = false; ov.scrollTop = 0; }
  function close() { editing = false; ov.hidden = true; if (btn) btn.focus(); }

  function scCls(n) { return n >= 9 ? 'sc-top' : n >= 7 ? 'sc-good' : n >= 5 ? 'sc-mid' : n >= 3 ? 'sc-low' : 'sc-bad'; } // цвет оценки
  function rateBlock(r) {
    var v = rv(r.id), sc = v.score || 0, id = esc(r.id);
    if (sc && !rating[r.id]) return '';
    var h = '<div class="lib-rate" role="group" aria-label="Оценка рецепта ' + esc(r.title) + '">';
    if (!sc || edit[r.id]) {
      var txt = drafts[r.id] != null ? drafts[r.id] : (v.comment || '');
      h += '<span class="label">Оценка</span><div class="lib-stars">' +
        [1,2,3,4,5,6,7,8,9,10].map(function (n) {
          return '<button type="button" class="lib-pt' + (n === sc ? ' cur' : '') + '" data-id="' + id + '" data-n="' + n + '" aria-pressed="' + (n === sc) + '" aria-label="' + n + ' из 10">' + n + '</button>';
        }).join('') + '</div>';
      if (sc) h += '<div class="lib-note"><textarea class="lib-ta" data-id="' + id + '" rows="3" placeholder="Что зашло, что нет: количество, вкус, время, шаги…" aria-label="Комментарий к оценке">' + esc(txt) + '</textarea>' +
        '<button type="button" class="ghost-btn lib-save" data-id="' + id + '">Сохранить</button></div>';
    } else {
      h += '<div class="lib-score-line"><span class="label">Оценка</span><b class="lib-score ' + scCls(sc) + '">' + sc + '<small>/10</small></b>' +
        '<button type="button" class="lib-link lib-change" data-id="' + id + '">изменить</button></div>';
      if (v.comment) h += '<div class="lib-note-view"><p class="lib-cm">' + esc(v.comment) + '</p>' +
        '<button type="button" class="lib-more" hidden aria-expanded="false" aria-label="Показать весь комментарий"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button></div>';
    }
    return h + '</div>';
  }

  function render() {
    autoPurge();
    var list = R.slice().reverse().filter(function (r) { return !isHid(r.id); });
    ov.innerHTML =
      '<div class="lib-panel' + (editing ? ' is-editing' : '') + '" aria-labelledby="libTitle">' +
      '<div class="lib-head"><h2 id="libTitle" class="lib-title">Кукинг</h2>' +
      '<div class="lib-actions"><button type="button" class="ghost-btn lib-gear" id="libSettings" aria-label="Настройки" title="Настройки"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></button>' +
      '<button type="button" class="ghost-btn' + (editing ? ' lib-edit-on' : '') + '" id="libEdit" aria-pressed="' + editing + '">' + (editing ? 'Готово' : 'Править') + '</button>' +
      '<button type="button" class="ghost-btn" id="libClose" aria-label="К рецепту"><span class="lr-wide">К рецепту</span><span class="lr-narrow">Рецепт</span> →</button></div></div>' +
      '<div class="lib-rand">' + (editing ? '<span class="lib-hint">Убрал лишнее — вернуть можно внизу</span>' :
        '<span class="label">Не знаешь, что жрать?</span><button type="button" class="mode-btn lib-fresh">Крутить свежак</button>' +
        '<button type="button" class="mode-btn lib-themes" aria-expanded="' + themesOpen + '">Темы рулетки · ' + (window.Fresh ? window.Fresh.themes.length : 0) + '</button>') + '</div>' +
      (themesOpen && !editing ? themesBlock() : '') +
      (editing ? '' : sortBar()) +
      shelf('Проверено', 'Приготовили и оценили', sorted(list.filter(proven)), 'Оцени рецепт после готовки — он переедет сюда.', list.filter(proven).length) +
      shelf('Свежак', 'Ещё не готовили', sorted(list.filter(function (r) { return !proven(r); })), 'Пусто. Крути свежак — нейросеть придумает новый.', list.filter(function (r) { return !proven(r); }).length) +
      hiddenBlock() + '</div>';
    bind();
  }

  var MODE_NAME = { self: 'Для себя', romance: 'Романтика', friends: 'Друзья' };
  var SORTS = [['fast', 'Быстрее'], ['slow', 'Дольше'], ['hi', 'Оценка выше'], ['lo', 'Оценка ниже'], ['new', 'Новее'], ['old', 'Старше']];
  var FOR = [['self', 'Для себя'], ['romance', 'Романтика'], ['friends', 'Друзья']];
  function lget(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function lset(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  var sortBy = lget('kuking:sort2'), forMode = lget('kuking:for'), sortOpen = false;
  function mins(r) {
    var t = String(r.totalTime || ''), h = /(\d+(?:[.,]\d+)?)\s*ч/.exec(t), m = /(\d+)\s*мин/.exec(t);
    var v = (h ? parseFloat(h[1].replace(',', '.')) * 60 : 0) + (m ? +m[1] : 0);
    return v || 9999;
  }
  function sorted(items) { // items приходят от новых к старым
    var a = items.filter(function (r) { return !forMode || r.mode === forMode; });
    var by = {
      fast: function (x, y) { return mins(x) - mins(y); },
      slow: function (x, y) { return mins(y) - mins(x); },
      hi: function (x, y) { return rv(y.id).score - rv(x.id).score; },
      lo: function (x, y) { return (rv(x.id).score || 99) - (rv(y.id).score || 99); }
    }[sortBy];
    if (by) a.sort(by);
    if (sortBy === 'old') a.reverse();
    return a;
  }
  function chips(list, cur, cls) {
    return list.map(function (o) { return '<button type="button" class="lib-so ' + cls + (cls === 'so-for' ? ' m-' + o[0] : '') + '" data-s="' + o[0] + '" aria-pressed="' + (cur === o[0]) + '">' + o[1] + '</button>'; }).join('');
  }
  function sortBar() {
    var n = (sortBy ? 1 : 0) + (forMode ? 1 : 0);
    return '<div class="lib-sort-wrap"><button type="button" class="lib-sort-t" aria-expanded="' + sortOpen + '">Сортировка' + (n ? ' · ' + n : '') +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>' +
      (n ? '<button type="button" class="lib-link lib-sort-x">сбросить</button>' : '') + '</div>' +
      (sortOpen ? '<div class="lib-sort"><div class="lib-sort-row"><span class="label">Для кого</span>' + chips(FOR, forMode, 'so-for') + '</div>' +
        '<div class="lib-sort-row"><span class="label">Порядок</span>' + chips(SORTS, sortBy, 'so-by') + '</div></div>' : '');
  }
  var themesOpen = false, themesLoading = '', themesErr = '', themesCtl = null;
  function loadThemes() {
    if (themesLoading) return;
    themesLoading = '…'; themesErr = ''; render();
    themesCtl = new AbortController();
    var sub = { set textContent(v) { themesLoading = v; var n = ov.querySelector('.th-note'); if (n) n.textContent = 'Подбираю 10 блюд под ваш вкус… ' + v; } };
    window.Fresh.refresh(freshCtx, { sub: sub, signal: themesCtl.signal }).then(function () { themesLoading = ''; render(); })
      .catch(function (e) {
        themesLoading = '';
        var c = e && e.code;
        themesErr = c === 'cancelled' ? '' : (window.KukingAIMsg ? window.KukingAIMsg(e) : 'Не вышло обновить идеи') + '.';
        render();
      });
  }
  function themesBlock() {
    if (themesLoading) return '<div class="th-box"><p class="small th-note" style="margin:0">Подбираю 10 блюд под ваш вкус… ' + esc(themesLoading) + '</p></div>';
    if (!window.Fresh.themes.length) return '<div class="th-box"><p class="small th-note" style="margin:0">' + esc(themesErr || 'Идей пока нет.') + '</p></div>';
    return '<div class="th-box"><p class="small th-note">10 блюд на одну тарелку, которые нейросеть подобрала под ваши оценки и комменты. Любая оценка, коммент или открытый рецепт — и список пересоберётся. Ткни идею — сразу сгенерю рецепт.</p><ul class="th-list">' +
      window.Fresh.themes.map(function (t, i) {
        return '<li><button type="button" class="th-go" data-i="' + i + '"><b>' + esc(t[0]) + '</b><span>' + esc(t[1]) + '</span>' + (t[2] ? '<em>' + esc(t[2]) + '</em>' : '') + '</button></li>';
      }).join('') + '</ul></div>';
  }
  var newRate = {};
  /* оценки друзей: средняя на карточке и вкус компании для нейросети */
  var avgs = {}, friendRev = [];
  function loadFriends() {
    if (!window.KukingStore || !window.KukingStore.user()) return;
    var me = window.KukingStore.user().id;
    window.KukingStore.allReviews().then(function (rows) {
      var acc = {}; friendRev = [];
      rows.forEach(function (r) {
        var d = r.data || {}; if (!d.score) return;
        (acc[r.id] = acc[r.id] || []).push(d.score);
        if (r.user_id !== me) friendRev.push({ id: r.id, score: d.score, comment: d.comment });
      });
      avgs = {};
      Object.keys(acc).forEach(function (id) { var a = acc[id]; avgs[id] = { n: a.length, avg: Math.round(a.reduce(function (x, y) { return x + y; }, 0) / a.length * 10) / 10 }; });
      if (!ov.hidden && !(document.activeElement && document.activeElement.tagName === 'TEXTAREA')) render();
    }).catch(function () {});
  }
  function proven(r) { return rv(r.id).score > 0 && !newRate[r.id]; }
  function shelf(name, sub, items, empty, raw) {
    return '<section class="lib-shelf"><h3 class="lib-shelf-h">' + name + ' <span>· ' + items.length + '</span><small>' + sub + '</small></h3>' +
      (items.length ? '<div class="lib-grid">' + items.map(card).join('') + '</div>' : '<p class="small lib-empty">' + (forMode && raw ? 'Под этот фильтр тут пусто.' : empty) + '</p>') + '</section>';
  }
  function card(r) {
        var on = r.id === active.id, sc = rv(r.id).score;
        return '<article class="card lib-card' + (on ? ' on' : '') + '">' +
          (editing ? '<button type="button" class="lib-del" data-id="' + esc(r.id) + '" aria-label="Убрать рецепт ' + esc(r.title) + '" title="Убрать">✕</button>' : '') +
          '<p class="eyebrow">' + (r.ai ? '<span class="lib-ai">нейросеть</span> ' : '') + esc(r.totalTime || '') + (sc ? ' · <button type="button" class="lib-sc ' + scCls(sc) + '" data-id="' + esc(r.id) + '" aria-expanded="' + !!rating[r.id] + '" aria-label="Оценка ' + sc + ' из 10, ' + (rating[r.id] ? 'свернуть' : 'изменить') + '">' + sc + '/10<svg class="sc-ico" viewBox="0 0 24 24" aria-hidden="true">' + (rating[r.id] ? '<path d="M6 15l6-6 6 6"/>' : '<path d="M6 9l6 6 6-6"/>') + '</svg></button>' : '') +
          (MODE_NAME[r.mode] ? ' · <span class="lib-for m-' + r.mode + '">' + MODE_NAME[r.mode] + '</span>' : '') +
          (avgs[r.id] && avgs[r.id].n > 1 ? ' · <span class="lib-avg" title="Средняя у всех">все ' + avgs[r.id].avg + ' · ' + avgs[r.id].n + '</span>' : '') + '</p>' +
          '<h3 class="lib-name">' + esc(r.title) + '</h3>' +
          '<p class="dish-desc">' + esc(r.tagline || '') + '</p>' +
          '<ul class="lib-dishes">' + (r.dishes || []).map(function (d) { return '<li>' + esc(d.name) + '</li>'; }).join('') + '</ul>' +
          rateBlock(r) +
          '<button type="button" class="nav-btn ' + (on ? '' : 'primary') + ' lib-go" data-id="' + esc(r.id) + '">' + (on ? 'Открыт сейчас →' : 'Готовим это') + '</button>' +
          '</article>';
  }

  function bind() {
    ov.querySelector('#libClose').addEventListener('click', close);
    var gear = ov.querySelector('#libSettings'); if (gear) gear.addEventListener('click', function () { if (window.KukingSettings) window.KukingSettings.open(); });
    ov.querySelector('#libEdit').addEventListener('click', function () { editing = !editing; render(); ov.querySelector('#libEdit').focus(); });
    ov.querySelectorAll('.lib-del').forEach(function (b) { b.addEventListener('click', function () { var id = b.getAttribute('data-id'); if (!isHid(id)) hidden[id] = Date.now(); saveHidden(); render(); }); });
    ov.querySelectorAll('.lib-kill').forEach(function (b) { b.addEventListener('click', function () { armed(b, 'Точно?', function () { purge([b.getAttribute('data-id')]); render(); }); }); });
    var cl = ov.querySelector('.lib-clear'); if (cl) cl.addEventListener('click', function () { armed(cl, 'Тапни ещё раз — удалю все', function () { purge(Object.keys(hidden)); render(); }); });
    ov.querySelectorAll('.lib-back').forEach(function (b) { b.addEventListener('click', function () { delete hidden[b.getAttribute('data-id')]; saveHidden(); render(); }); });
    ov.querySelectorAll('.lib-go').forEach(function (b) { b.addEventListener('click', function () { choose(b.getAttribute('data-id')); }); });
    ov.querySelectorAll('.lib-pt').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-id'), n = +b.getAttribute('data-n'), v = rv(id);
        if (!v.score) newRate[id] = true;
        reviews[id] = { score: n, comment: v.comment || '', at: v.at || today() }; rating[id] = true; edit[id] = true;
        persist(id); render();
        var f = ov.querySelector('.lib-ta[data-id="' + id + '"]') || ov.querySelector('.lib-pt[data-id="' + id + '"][data-n="' + n + '"]'); if (f) f.focus();
      });
    });
    ov.querySelectorAll('.lib-ta').forEach(function (t) { t.addEventListener('input', function () { drafts[t.getAttribute('data-id')] = t.value; }); });
    ov.querySelectorAll('.lib-save').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-id'), t = ov.querySelector('.lib-ta[data-id="' + id + '"]');
        if (!reviews[id]) return;
        reviews[id].comment = t.value.trim();
        delete drafts[id]; delete rating[id]; delete edit[id]; delete newRate[id];
        persist(id); render();
      });
    });
    ov.querySelectorAll('.lib-sc').forEach(function (b) { b.addEventListener('click', function () { var id = b.getAttribute('data-id'); rating[id] = !rating[id]; if (!rating[id]) { delete edit[id]; delete drafts[id]; } render(); }); });
    ov.querySelectorAll('.lib-note-view').forEach(function (box) {
      var p = box.querySelector('.lib-cm'), m = box.querySelector('.lib-more');
      if (!p || !m) return;
      if (p.scrollHeight > p.clientHeight + 1) m.hidden = false;
      function tog() {
        var full = p.classList.toggle('full');
        m.setAttribute('aria-expanded', full);
        m.setAttribute('aria-label', full ? 'Свернуть комментарий' : 'Показать весь комментарий');
      }
      if (!m.hidden) { box.classList.add('can-open'); box.addEventListener('click', tog); }
    });
    ov.querySelectorAll('.lib-change').forEach(function (b) { b.addEventListener('click', function () { edit[b.getAttribute('data-id')] = true; render(); }); });
    if (ov.querySelector('.lib-fresh')) ov.querySelector('.lib-fresh').addEventListener('click', function () { window.Fresh.spin(freshCtx); });
    ov.querySelectorAll('.so-by').forEach(function (b) { b.addEventListener('click', function () { var v = b.getAttribute('data-s'); sortBy = sortBy === v ? '' : v; lset('kuking:sort2', sortBy); render(); }); });
    ov.querySelectorAll('.so-for').forEach(function (b) { b.addEventListener('click', function () { var v = b.getAttribute('data-s'); forMode = forMode === v ? '' : v; lset('kuking:for', forMode); render(); }); });
    var st = ov.querySelector('.lib-sort-t'); if (st) st.addEventListener('click', function () { sortOpen = !sortOpen; render(); });
    var sx = ov.querySelector('.lib-sort-x'); if (sx) sx.addEventListener('click', function () { sortBy = ''; forMode = ''; lset('kuking:sort2', ''); lset('kuking:for', ''); render(); });
    if (ov.querySelector('.lib-themes')) ov.querySelector('.lib-themes').addEventListener('click', function () { themesOpen = !themesOpen; render(); if (themesOpen && window.Fresh.stale(freshCtx)) loadThemes(); });
    ov.querySelectorAll('.th-go').forEach(function (b) { b.addEventListener('click', function () { window.Fresh.spin(freshCtx, +b.getAttribute('data-i')); }); });
  }

  /* удалить насовсем: из книги в этом браузере, свежак — ещё и из базы */
  function purge(ids) {
    ids.forEach(function (id) {
      kill(id);
      if (id.indexOf('ai-') === 0) {
        if (window.Fresh) window.Fresh.forget(id);
        if (db) db.collection('fresh').doc(id).delete().catch(function () {});
      }
    });
    saveHidden();
    R = R.filter(function (r) { return gone.indexOf(r.id) < 0; });
  }
  function autoPurge() { // сутки в «Убранных» — и привет
    var old = Object.keys(hidden).filter(function (id) { return Date.now() - hidden[id] > DAY; });
    if (old.length) purge(old);
  }
  function hiddenBlock() {
    var hs = R.filter(function (r) { return isHid(r.id); });
    if (!hs.length) return '';
    return '<div class="lib-hidden"><div class="lib-hid-head"><p class="label">Убранные · ' + hs.length + '</p>' +
      '<button type="button" class="lib-link lib-clear">Очистить всё</button></div><div class="lib-hid-list">' + hs.map(function (r) {
      return '<div class="lib-hid"><span>' + esc(r.title) + '</span><button type="button" class="ghost-btn lib-back" data-id="' + esc(r.id) + '">Вернуть</button>' +
        '<button type="button" class="ghost-btn lib-kill" data-id="' + esc(r.id) + '">Удалить</button></div>';
    }).join('') + '</div></div>';
  }
  function armed(b, label, go) { // второй тап подтверждает, confirm() в артефакте не работает
    if (b.getAttribute('data-armed')) { go(); return; }
    b.setAttribute('data-armed', '1'); b.classList.add('armed'); var t = b.textContent; b.textContent = label;
    setTimeout(function () { if (b.isConnected) { b.removeAttribute('data-armed'); b.classList.remove('armed'); b.textContent = t; } }, 3000);
  }

  /* свежак: контекст для генерации */
  var freshCtx = {
    choose: choose,
    signals: function () { // всё, по чему нейросеть понимает вкус хаты
      function t(id) { return titleOf(id); }
      return {
        today: today(),
        recipes: R.filter(function (r) { return gone.indexOf(r.id) < 0; }).map(function (r) {
          var rv0 = reviews[r.id];
          return { title: r.title, mode: r.mode, ai: !!r.ai, dishes: (r.dishes || []).map(function (d) { return d.name; }), hidden: isHid(r.id) || undefined, opened: opens[r.id] || undefined,
            lastOpened: lastOpen[r.id] || undefined, cookedAndRated: rv0 && rv0.at || undefined };
        }),
        reviews: Object.keys(reviews).sort().map(function (id) { return { recipe: t(id), score: reviews[id].score, comment: reviews[id].comment || undefined }; }),
        removedForever: gone.map(function (id) { return id.indexOf('ai-') === 0 ? 'рецепт от нейросети' : t(id); }),
        friendsReviews: friendRev.map(function (x) { return { recipe: t(x.id), score: x.score, comment: x.comment || undefined }; })
      };
    },
    ideasChanged: function (st) {
      if (db) db.collection('meta').doc('ideas').set({ items: st.items, sig: st.sig, updatedAt: new Date().toISOString() }).catch(function () {});
      if (!ov.hidden) render();
    },
    reviews: function () { var o = {}; Object.keys(reviews).forEach(function (id) { o[id] = { score: reviews[id].score, comment: reviews[id].comment, title: titleOf(id) }; }); return o; },
    added: function (r) {
      R.push(r); render();
      if (db) db.collection('fresh').doc(r.id).set(window.Fresh.toDoc(r)).catch(function () {});
    }
  };

  /* db: подтянуть оценки, подписка один раз */
  if (window.claude && typeof window.claude.use === 'function') {
    window.claude.use('db').then(function (d) {
      if (!d) return;
      db = d;
      db.collection('fresh').onSnapshot(function (snap) {
        if (snap.metadata.fromCache || !window.Fresh) return;
        var add = window.Fresh.merge(snap.docs.map(function (d) { return { id: d.id, data: d.data() }; }))
          .filter(function (r) { return gone.indexOf(r.id) < 0; });
        if (!add.length) return;
        add.forEach(function (r) { R.push(r); });
        var typing = document.activeElement && document.activeElement.tagName === 'TEXTAREA' && ov.contains(document.activeElement);
        if (!ov.hidden && !typing) render();
      }, function () {});
      db.collection('meta').doc('ideas').get().then(function (d) {
        var x = d && d.exists && d.data();
        if (x && Array.isArray(x.items) && !window.Fresh.themes.length) { window.Fresh.setIdeas(x.items, x.sig || ''); if (!ov.hidden) render(); }
      }).catch(function () {});
      var migrated = false;
      db.collection('reviews').onSnapshot(function (snap) {
        if (snap.metadata.fromCache) return;
        var fresh = {};
        snap.docs.forEach(function (doc) { var x = doc.data(); if (x && x.score) fresh[doc.id] = { score: x.score, comment: x.comment || '', at: x.at || String(x.updatedAt || '').slice(0, 10) }; });
        if (!migrated) { // оценки, поставленные до базы, — перенести
          migrated = true;
          var local = Object.keys(reviews).filter(function (id) { return !fresh[id]; });
          local.forEach(function (id) { fresh[id] = reviews[id]; persist(id); });
        }
        reviews = fresh; saveLocal(); loadFriends();
        var typing = document.activeElement && document.activeElement.tagName === 'TEXTAREA' && ov.contains(document.activeElement);
        if (!ov.hidden && !typing) render();
      }, function () {});
    }).catch(function () {});
  }

  if (btn) btn.addEventListener('click', open);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !ov.hidden) close(); });

  /* главный экран при входе; после «Готовим это» сразу в рецепт */
  var skip = false;
  try { skip = sessionStorage.getItem('kuking:skipHome') === '1'; sessionStorage.removeItem('kuking:skipHome'); } catch (e) {}
  if (!skip) open();
})();
