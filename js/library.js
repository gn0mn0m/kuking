/* Library — главная «Кукинга» в духе Telegram: список рецептов строками, поиск, фильтры,
   карточка рецепта (оценка, коммент, обсуждение), создание (нейросеть по идее, 10 идей, вручную),
   шторка ☰. Выбирает активный рецепт (window.MENU) до запуска app.js.
   Встроенные рецепты книги видит только шеф; у остальных аккаунт с нуля. */
(function () {
  'use strict';
  var KEY = 'kuking:active', HKEY = 'kuking:hidden';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function lget(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function lset(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function load(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }
  function own(r) { return r.ai || /^(ai|my)-/.test(r.id); }

  /* аккаунт с нуля: книжные рецепты — только у шефа (или без облака вообще) */
  var S0 = window.KukingStore;
  var CHEF = !(S0 && S0.enabled) || lget('kuking:chef') === '1';
  var R = (window.RECIPES || []).filter(function (r) { return CHEF || own(r); });

  /* убранные: { id: время }. Больше суток — удалён насовсем (gone). */
  var DAY = 24 * 60 * 60 * 1000, GKEY = 'kuking:gone';
  var hidden = load(HKEY, {});
  if (Array.isArray(hidden)) { var o0 = {}; hidden.forEach(function (id) { o0[id] = Date.now(); }); hidden = o0; }
  var gone = load(GKEY, []);
  function kill(id) { delete hidden[id]; if (gone.indexOf(id) < 0) gone.push(id); }
  Object.keys(hidden).forEach(function (id) { if (Date.now() - hidden[id] > DAY) kill(id); });
  function saveHidden() { lset(HKEY, JSON.stringify(hidden)); lset(GKEY, JSON.stringify(gone)); }
  saveHidden();
  R = R.filter(function (r) { return gone.indexOf(r.id) < 0; });
  if (window.Fresh) gone.forEach(function (id) { if (/^(ai|my)-/.test(id)) window.Fresh.forget(id); });
  function isHid(id) { return Object.prototype.hasOwnProperty.call(hidden, id); }

  /* оценки: { id: { score, comment, at } } */
  var SKEY = 'kuking:reviews', reviews = load(SKEY, {});
  var drafts = {}, edit = {}, db = null;
  function saveLocal() { lset(SKEY, JSON.stringify(reviews)); }
  function rv(id) { return reviews[id] || { score: 0, comment: '' }; }
  function byId(id) { return R.filter(function (x) { return x.id === id; })[0]; }
  function titleOf(id) { var r = byId(id); return r ? r.title : id; }
  function persist(id) {
    saveLocal();
    if (!db) return;
    var v = reviews[id], ref = db.collection('reviews').doc(id);
    (v ? ref.set({ score: v.score, comment: v.comment || '', title: titleOf(id), at: v.at || today(), updatedAt: new Date().toISOString() }) : ref.delete()).catch(function () {});
  }

  var shown = R.filter(function (r) { return !isHid(r.id); });
  var active = byId(lget(KEY)) || shown[shown.length - 1] || null;
  window.MENU = active;

  var ov = document.getElementById('library');
  var btn = document.getElementById('libBtn');
  var opens = load('kuking:opens', {}), lastOpen = load('kuking:last', {});
  function choose(id) {
    opens[id] = (opens[id] || 0) + 1; lastOpen[id] = today();
    lset('kuking:opens', JSON.stringify(opens)); lset('kuking:last', JSON.stringify(lastOpen));
    if (active && id === active.id) { close(); return; }
    lset(KEY, id);
    try { sessionStorage.setItem('kuking:skipHome', '1'); } catch (e) {}
    location.reload();
  }
  function open() { view = 'list'; render(); ov.hidden = false; ov.scrollTop = 0; }
  function close() { if (!active) return; ov.hidden = true; if (btn) btn.focus(); }

  function SOC() { return window.KukingSocial || { enabled: false, badge: function () { return 0; }, thread: function () { return ''; }, bindThreads: function () {}, admin: function () { return null; }, me: function () { return null; }, open: function () {} }; }
  var CROWN = '<svg class="soc-crown" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 11H5z"/></svg>';
  function scCls(n) { return n >= 9 ? 'sc-top' : n >= 7 ? 'sc-good' : n >= 5 ? 'sc-mid' : n >= 3 ? 'sc-low' : 'sc-bad'; }
  function chefOf(id) { // оценка шефа — у всех, кроме самого шефа
    var a = SOC().admin(), m = SOC().me();
    if (!a || (m && m.id === a.id) || !window.KukingSocial.reviewsOf) return 0;
    var d = window.KukingSocial.reviewsOf(a.id)[id]; return d && d.score || 0;
  }

  /* аватарка рецепта: эмодзи по смыслу */
  var EMO = [[/бургер|смэш|смеш/i, '🍔'], [/тако|мексик|буррито|кесадиль/i, '🌮'], [/паст|спагет|лингвин|феттуч|чашушули/i, '🍝'], [/масал|карри|тикк|дал\b/i, '🍛'],
    [/шаурм|шаверм|лаваш|ролл/i, '🌯'], [/сычуан|остр|чили|мала/i, '🌶️'], [/пицц/i, '🍕'], [/суп|бульон|борщ|рамен|фо\b/i, '🍲'], [/плов|рис|ризотт/i, '🍚'],
    [/салат|боул/i, '🥗'], [/стейк|говяд|строганов|бефстр|ребр/i, '🥩'], [/куриц|курин|крыл|бёдр|бедр/i, '🍗'], [/яйц|омлет|шакшук/i, '🍳'], [/рыб|лосос|форел/i, '🐟'], [/пельмен|хинкал|вареник/i, '🥟']];
  function emoji(r) { var s = r.title + ' ' + (r.tags || []).join(' ') + ' ' + (r.tagline || ''); for (var i = 0; i < EMO.length; i++) if (EMO[i][0].test(s)) return EMO[i][1]; return '🍽️'; }
  var MODE_NAME = { self: 'Для себя', romance: 'Романтика', friends: 'Друзья' };
  var MODE_SHORT = { self: 'себя', romance: 'романт', friends: 'друзья' };

  /* ---------- фильтры и порядок ---------- */
  var SORTS = [['', 'Новые сверху'], ['old', 'Старые сверху'], ['fast', 'Быстрее'], ['slow', 'Дольше'], ['hi', 'Оценка выше'], ['lo', 'Оценка ниже']];
  var sortBy = lget('kuking:sort2'), forMode = lget('kuking:for'), query = '', sortOpen = false;
  function mins(r) {
    var t = String(r.totalTime || ''), h = /(\d+(?:[.,]\d+)?)\s*ч/.exec(t), m = /(\d+)\s*мин/.exec(t);
    var v = (h ? parseFloat(h[1].replace(',', '.')) * 60 : 0) + (m ? +m[1] : 0);
    return v || 9999;
  }
  function visible() {
    var q = query.trim().toLowerCase();
    var a = R.slice().reverse().filter(function (r) {
      if (isHid(r.id)) return false;
      if (forMode === 'new') { if (rv(r.id).score) return false; } else if (forMode && r.mode !== forMode) return false;
      if (q && (r.title + ' ' + (r.tagline || '') + ' ' + (r.tags || []).join(' ') + ' ' + (r.dishes || []).map(function (d) { return d.name; }).join(' ')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var by = { fast: function (x, y) { return mins(x) - mins(y); }, slow: function (x, y) { return mins(y) - mins(x); },
      hi: function (x, y) { return rv(y.id).score - rv(x.id).score; }, lo: function (x, y) { return (rv(x.id).score || 99) - (rv(y.id).score || 99); } }[sortBy];
    if (by) a.sort(by);
    if (sortBy === 'old') a.reverse();
    return a;
  }

  /* ---------- экраны: list | detail | create | edit ---------- */
  var view = 'list', detailId = null, listY = 0, dir = '';
  function go(v, id, back) {
    if (view === 'list') listY = ov.scrollTop;
    dir = back ? 'back' : 'fwd'; view = v; if (id !== undefined) detailId = id;
    render(); ov.scrollTop = v === 'list' ? listY : 0;
  }

  function render() {
    autoPurge();
    var html = view === 'detail' && byId(detailId) ? detailHTML(byId(detailId)) : view === 'create' ? createHTML() : view === 'edit' ? editHTML() : listHTML();
    ov.innerHTML = '<div class="tg-screen' + (dir ? ' in-' + dir : '') + '">' + html + '</div>';
    dir = '';
    bind();
  }
  function burger() {
    var n = SOC().badge();
    return '<button type="button" class="tg-ic tg-burger" id="libMenu" aria-label="Меню' + (n ? ', заявок: ' + n : '') + '"><i></i>' + (n ? '<span class="tg-dot">' + n + '</span>' : '') + '</button>';
  }
  function listHTML() {
    var list = visible(), all = R.filter(function (r) { return !isHid(r.id); });
    var h = '<header class="tg-head">' + burger() + '<h2 class="lib-title" id="libTitle">Кукинг</h2>' +
      '<button type="button" class="tg-ic lib-fresh" aria-label="Крутить свежак" title="Свежак: рулетка идей">🎲</button></header>';
    h += '<div class="tg-tools"><label class="tg-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>' +
      '<input id="libQ" type="search" placeholder="Поиск по рецептам" autocomplete="off" value="' + esc(query) + '" aria-label="Поиск по рецептам"></label>' +
      '<div class="tg-chips" role="toolbar" aria-label="Фильтры">' +
      [['', 'Все · ' + all.length], ['self', 'Для себя'], ['romance', 'Романтика'], ['friends', 'Друзья'], ['new', 'Не готовил']].map(function (c) {
        return '<button type="button" class="tg-chip' + (c[0] && c[0] !== 'new' ? ' m-' + c[0] : '') + '" data-for="' + c[0] + '" aria-pressed="' + (forMode === c[0]) + '">' + c[1] + '</button>';
      }).join('') +
      '<button type="button" class="tg-chip tg-sort" aria-expanded="' + sortOpen + '" aria-label="Порядок">⇅ ' + esc((SORTS.filter(function (s) { return s[0] === sortBy; })[0] || SORTS[0])[1]) + '</button></div>' +
      (sortOpen ? '<div class="tg-pop" role="menu">' + SORTS.map(function (s) { return '<button type="button" role="menuitemradio" data-sort="' + s[0] + '" aria-checked="' + (sortBy === s[0]) + '">' + s[1] + '</button>'; }).join('') + '</div>' : '') + '</div>';
    if (active && !isHid(active.id)) h += '<button type="button" class="tg-pin" id="libClose"><span class="tg-pin-bar"></span><span class="tg-pin-t"><small>Сейчас готовишь</small><b>' + esc(active.title) + '</b></span><span class="tg-pin-go">Открыть →</span></button>';
    if (!all.length) h += emptyHTML();
    else if (!list.length) h += '<p class="small tg-none">Ничего не нашёл. Попробуй другое слово или сбрось фильтр.</p>';
    else h += '<ul class="tg-list">' + list.map(row).join('') + '</ul>';
    h += hiddenBlock();
    h += '<button type="button" class="tg-fab" data-a="create" aria-label="Новый рецепт"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>';
    return h;
  }
  function emptyHTML() {
    var S = window.KukingStore, signed = S && S.user && S.user();
    return '<div class="tg-empty"><div class="tg-empty-pic" aria-hidden="true">🍳</div><h3>Книга пустая — и это норм</h3>' +
      '<p class="small">Тут будут твои рецепты: придумай с нейросетью, напиши сам или забери у кентов.</p>' +
      '<button type="button" class="nav-btn primary" data-a="create">Создать первый рецепт</button>' +
      (S && S.enabled && !signed ? '<button type="button" class="ghost-btn" data-a="login">Войти в аккаунт</button>' : '') + '</div>';
  }
  function scoreHTML(id) {
    var sc = rv(id).score, ch = chefOf(id);
    if (!sc && !ch) return '';
    return '<span class="tg-score">' + (ch ? '<span class="tg-chef ' + scCls(ch) + '" title="Оценка шефа">' + CROWN + ch + '</span>' : '') +
      (sc ? '<span class="tg-mine ' + scCls(sc) + '" title="Твоя оценка">' + sc + '<small>/10</small></span>' : '') + '</span>';
  }
  function row(r) {
    var on = active && r.id === active.id, sc = rv(r.id).score;
    return '<li><button type="button" class="tg-row' + (on ? ' on' : '') + '" data-open="' + esc(r.id) + '">' +
      '<span class="tg-av m-' + esc(r.mode || 'self') + '" aria-hidden="true">' + emoji(r) + '</span>' +
      '<span class="tg-body"><span class="tg-l1"><b class="tg-name">' + esc(r.title) + '</b><small class="tg-time">' + esc(String(r.totalTime || '').replace('≈ ', '')) + '</small></span>' +
      '<span class="tg-l2"><span class="tg-sub">' + (MODE_SHORT[r.mode] ? '<span class="tg-mode m-' + r.mode + '">' + MODE_SHORT[r.mode] + '</span>' : '') + esc(r.tagline || '') + '</span>' +
      (scoreHTML(r.id) || (!sc ? '<span class="tg-new" title="Ещё не готовил" aria-label="Новый"></span>' : '')) + '</span></span></button></li>';
  }

  /* карточка рецепта */
  function rateBlock(r) {
    var v = rv(r.id), sc = v.score || 0, id = esc(r.id), h = '<section class="tg-sec lib-rate" aria-label="Твоя оценка">';
    if (!sc || edit[r.id]) {
      var txt = drafts[r.id] != null ? drafts[r.id] : (v.comment || '');
      h += '<h3 class="tg-sec-h">' + (sc ? 'Твоя оценка' : 'Приготовил? Оцени') + '</h3><div class="lib-stars">' +
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(function (n) {
          return '<button type="button" class="lib-pt' + (n === sc ? ' cur' : '') + '" data-id="' + id + '" data-n="' + n + '" aria-pressed="' + (n === sc) + '" aria-label="' + n + ' из 10">' + n + '</button>';
        }).join('') + '</div>';
      if (sc) h += '<div class="lib-note"><textarea class="lib-ta" data-id="' + id + '" rows="3" placeholder="Что зашло, что нет: количество, вкус, время, шаги…" aria-label="Комментарий к оценке">' + esc(txt) + '</textarea>' +
        '<button type="button" class="nav-btn primary lib-save" data-id="' + id + '">Сохранить</button></div>';
    } else {
      h += '<div class="lib-score-line"><h3 class="tg-sec-h">Твоя оценка</h3><b class="lib-score ' + scCls(sc) + '">' + sc + '<small>/10</small></b>' +
        '<button type="button" class="lib-link lib-change" data-id="' + id + '">изменить</button></div>';
      if (v.comment) h += '<p class="lib-cm full">' + esc(v.comment) + '</p>';
    }
    return h + '</section>';
  }
  function detailHTML(r) {
    var on = active && r.id === active.id, ch = chefOf(r.id), adm = SOC().admin();
    var h = '<header class="tg-head tg-head-sub"><button type="button" class="tg-back" data-a="back" aria-label="Назад к рецептам"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>Рецепты</button></header>';
    h += '<div class="tg-hero"><span class="tg-av big m-' + esc(r.mode || 'self') + '" aria-hidden="true">' + emoji(r) + '</span>' +
      '<h2 class="tg-title">' + esc(r.title) + '</h2>' +
      '<p class="tg-meta">' + [esc(String(r.totalTime || '').replace('≈ ', '≈ ')), MODE_NAME[r.mode] ? '<span class="tg-mode m-' + r.mode + '">' + MODE_NAME[r.mode] + '</span>' : '', r.baseGuests ? r.baseGuests + ' порц.' : '', r.ai ? 'от нейросети' : r.manual ? 'твой рецепт' : ''].filter(Boolean).join(' · ') + '</p>' +
      (r.tagline ? '<p class="tg-lede">' + esc(r.tagline) + '</p>' : '') + '</div>';
    h += '<div class="tg-acts"><button type="button" class="nav-btn primary lib-go" data-id="' + esc(r.id) + '">' + (on ? 'Продолжить готовку →' : 'Готовим это') + '</button></div>';
    if ((r.dishes || []).length) h += '<section class="tg-sec"><h3 class="tg-sec-h">На тарелке</h3><ul class="tg-dishes">' + r.dishes.map(function (d) {
      return '<li><b>' + esc(d.name) + '</b>' + (d.kcal ? '<small>' + d.kcal + ' ккал · Б ' + d.p + ' · Ж ' + d.f + ' · У ' + d.c + '</small>' : '') + '</li>';
    }).join('') + '</ul></section>';
    if (ch && adm) h += '<section class="tg-sec tg-chefrow">' + CROWN + '<span>Шеф <b>' + esc(adm.nick) + '</b> поставил</span><b class="lib-score ' + scCls(ch) + '">' + ch + '<small>/10</small></b></section>';
    h += rateBlock(r);
    var thr = SOC().thread(r.id, reviews[r.id]); if (thr) h += '<section class="tg-sec">' + thr + '</section>';
    h += '<div class="tg-more">' + (r.manual ? '<button type="button" class="ghost-btn" data-a="editme" data-id="' + esc(r.id) + '">Изменить</button>' : '') +
      '<button type="button" class="ghost-btn tg-del" data-id="' + esc(r.id) + '">Убрать из книги</button></div>';
    return h;
  }

  /* создание */
  var idea = '', ideaMode = 'self';
  function createHTML() {
    var ai = window.KukingAI && window.KukingAI.ready();
    var h = '<header class="tg-head tg-head-sub"><button type="button" class="tg-back" data-a="back"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>Рецепты</button><span class="tg-head-t">Новый рецепт</span></header>';
    h += '<section class="tg-sec tg-make"><h3 class="tg-sec-h">✨ Нейросеть по твоей идее</h3>' +
      '<form id="libIdea" class="tg-idea"><input id="libIdeaIn" type="text" maxlength="120" placeholder="Например: сочная шаурма как в Стамбуле" value="' + esc(idea) + '" aria-label="Идея блюда" required>' +
      '<div class="tg-chips">' + [['self', 'Для себя'], ['romance', 'Романтика'], ['friends', 'Друзья']].map(function (m) { return '<button type="button" class="tg-chip m-' + m[0] + '" data-im="' + m[0] + '" aria-pressed="' + (ideaMode === m[0]) + '">' + m[1] + '</button>'; }).join('') + '</div>' +
      '<button type="submit" class="nav-btn primary">Сгенерировать</button></form>' +
      (ai ? '' : '<p class="small">Нужен ключ к нейросети — <button type="button" class="lib-link" data-a="setup">подключить</button>.</p>') + '</section>';
    h += '<section class="tg-sec tg-make"><h3 class="tg-sec-h">🎲 10 идей под твой вкус</h3>' +
      (themesOpen ? themesBlock() : '<p class="small">Нейросеть посмотрит оценки, комменты и анкеты и предложит 10 блюд.</p><button type="button" class="nav-btn lib-themes">Показать идеи</button>') + '</section>';
    h += '<section class="tg-sec tg-make"><h3 class="tg-sec-h">✍️ Написать самому</h3><p class="small">Продукты, посуда, шаги с таймерами и подача — соберётся такое же слайд-шоу.</p>' +
      '<button type="button" class="nav-btn" data-a="editnew">Открыть редактор</button></section>';
    return h;
  }
  var themesOpen = false, themesLoading = '', themesErr = '', themesCtl = null;
  function loadThemes() {
    if (themesLoading) return;
    themesLoading = '…'; themesErr = ''; render();
    themesCtl = new AbortController();
    var sub = { set textContent(v) { themesLoading = v; var n = ov.querySelector('.th-note'); if (n) n.textContent = 'Подбираю 10 блюд под твой вкус… ' + v; } };
    window.Fresh.refresh(freshCtx, { sub: sub, signal: themesCtl.signal }).then(function () { themesLoading = ''; render(); })
      .catch(function (e) { themesLoading = ''; themesErr = e && e.code === 'cancelled' ? '' : (window.KukingAIMsg ? window.KukingAIMsg(e) : 'Не вышло обновить идеи') + '.'; render(); });
  }
  function themesBlock() {
    if (themesLoading) return '<p class="small th-note">Подбираю 10 блюд под твой вкус… ' + esc(themesLoading) + '</p>';
    if (!window.Fresh.themes.length) return '<p class="small th-note">' + esc(themesErr || 'Идей пока нет.') + '</p><button type="button" class="nav-btn lib-themes-re">Ещё раз</button>';
    return '<ul class="th-list">' + window.Fresh.themes.map(function (t, i) {
      return '<li><button type="button" class="th-go" data-i="' + i + '"><b>' + esc(t[0]) + '</b><span>' + esc(t[1]) + '</span>' + (t[2] ? '<em>' + esc(t[2]) + '</em>' : '') + '</button></li>';
    }).join('') + '</ul>';
  }

  /* редактор */
  var draft = null;
  function blankDraft() { return { title: '', mode: 'self', totalTime: '', baseGuests: 2, ing: [{ n: '', a: '', u: 'г' }, { n: '', a: '', u: 'г' }, { n: '', a: '', u: 'г' }], tools: [''], steps: [{ t: '', m: '' }], serve: '' }; }
  var UNITS = ['г', 'кг', 'мл', 'л', 'шт', 'ч.л.', 'ст.л.', 'зубч.', 'пучок', 'щепотка', 'по вкусу'];
  function editHTML() {
    var d = draft;
    var h = '<header class="tg-head tg-head-sub"><button type="button" class="tg-back" data-a="back"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>Назад</button><span class="tg-head-t">' + (d.id ? 'Правка' : 'Свой рецепт') + '</span></header>';
    h += '<form id="libEd" class="tg-ed" novalidate>';
    h += '<section class="tg-sec"><label class="set-f"><span>Название</span><input name="title" maxlength="60" value="' + esc(d.title) + '" placeholder="Паста как у бабушки" required></label>' +
      '<div class="tg-chips">' + [['self', 'Для себя'], ['romance', 'Романтика'], ['friends', 'Друзья']].map(function (m) { return '<button type="button" class="tg-chip m-' + m[0] + '" data-em="' + m[0] + '" aria-pressed="' + (d.mode === m[0]) + '">' + m[1] + '</button>'; }).join('') + '</div>' +
      '<div class="tg-2"><label class="set-f"><span>Время</span><input name="time" maxlength="20" value="' + esc(d.totalTime) + '" placeholder="40 мин"></label>' +
      '<label class="set-f"><span>Порций</span><input name="guests" type="number" inputmode="numeric" min="1" max="12" value="' + esc(d.baseGuests) + '"></label></div></section>';
    h += '<section class="tg-sec"><h3 class="tg-sec-h">Продукты</h3>' + d.ing.map(function (x, i) {
      return '<div class="tg-ing"><input data-ing="' + i + '" data-k="n" value="' + esc(x.n) + '" placeholder="Продукт" aria-label="Продукт ' + (i + 1) + '">' +
        '<input data-ing="' + i + '" data-k="a" value="' + esc(x.a) + '" inputmode="decimal" placeholder="0" aria-label="Количество">' +
        '<select data-ing="' + i + '" data-k="u" aria-label="Единица">' + UNITS.map(function (u) { return '<option' + (u === x.u ? ' selected' : '') + '>' + u + '</option>'; }).join('') + '</select>' +
        '<button type="button" class="tg-x" data-del="ing" data-i="' + i + '" aria-label="Убрать продукт">✕</button></div>';
    }).join('') + '<button type="button" class="lib-link" data-add="ing">+ продукт</button></section>';
    h += '<section class="tg-sec"><h3 class="tg-sec-h">Посуда</h3>' + d.tools.map(function (x, i) {
      return '<div class="tg-ing one"><input data-tool="' + i + '" value="' + esc(x) + '" placeholder="Большая сковорода" aria-label="Посуда ' + (i + 1) + '"><button type="button" class="tg-x" data-del="tool" data-i="' + i + '" aria-label="Убрать">✕</button></div>';
    }).join('') + '<button type="button" class="lib-link" data-add="tool">+ посуда</button></section>';
    h += '<section class="tg-sec"><h3 class="tg-sec-h">Шаги</h3>' + d.steps.map(function (x, i) {
      return '<div class="tg-step"><span class="tg-step-n">' + (i + 1) + '</span><textarea data-step="' + i + '" data-k="t" rows="3" placeholder="Что делаем" aria-label="Шаг ' + (i + 1) + '">' + esc(x.t) + '</textarea>' +
        '<label class="tg-timer">⏱ <input data-step="' + i + '" data-k="m" value="' + esc(x.m) + '" inputmode="numeric" placeholder="—" aria-label="Таймер, минут"> мин</label>' +
        '<button type="button" class="tg-x" data-del="step" data-i="' + i + '" aria-label="Убрать шаг">✕</button></div>';
    }).join('') + '<button type="button" class="lib-link" data-add="step">+ шаг</button></section>';
    h += '<section class="tg-sec"><h3 class="tg-sec-h">Подача</h3><textarea name="serve" rows="3" placeholder="Каждый пункт с новой строки">' + esc(d.serve) + '</textarea></section>';
    h += '<p class="set-msg" id="edMsg" role="alert"></p><div class="tg-acts"><button type="submit" class="nav-btn primary">Сохранить рецепт</button></div></form>';
    return h;
  }
  function readDraft() {
    var f = ov.querySelector('#libEd'); if (!f) return;
    draft.title = f.title.value; draft.totalTime = f.time.value; draft.baseGuests = f.guests.value; draft.serve = f.serve.value;
    f.querySelectorAll('[data-ing]').forEach(function (e) { draft.ing[+e.getAttribute('data-ing')][e.getAttribute('data-k')] = e.value; });
    f.querySelectorAll('[data-tool]').forEach(function (e) { draft.tools[+e.getAttribute('data-tool')] = e.value; });
    f.querySelectorAll('[data-step]').forEach(function (e) { draft.steps[+e.getAttribute('data-step')][e.getAttribute('data-k')] = e.value; });
  }
  function saveDraft() {
    readDraft();
    var d = draft, ing = d.ing.filter(function (x) { return x.n.trim(); }), tools = d.tools.filter(function (x) { return x.trim(); }), steps = d.steps.filter(function (x) { return x.t.trim(); });
    var err = !d.title.trim() ? 'Дай рецепту название' : ing.length < 3 ? 'Нужно хотя бы 3 продукта' : !tools.length ? 'Добавь хотя бы одну посуду' : !steps.length ? 'Опиши хотя бы один шаг' : '';
    if (err) { ov.querySelector('#edMsg').textContent = err; return; }
    var g = Math.max(1, Math.min(12, parseInt(d.baseGuests, 10) || 2)), t = d.totalTime.trim();
    var loose = {
      title: d.title.trim(), mode: d.mode, tagline: ing.slice(0, 4).map(function (x) { return x.n.trim(); }).join(' · '),
      baseGuests: g, totalTime: t ? (/^≈/.test(t) ? t : '≈ ' + t) : '', groups: ['Продукты'],
      ingredients: ing.map(function (x, i) {
        var a = parseFloat(String(x.a).replace(',', '.'));
        return a > 0 && x.u !== 'по вкусу' ? { id: 'i' + i, g: 0, name: x.n.trim(), amount: a, unit: x.u, round: /^(г|мл)$/.test(x.u) ? 'g10' : x.u === 'шт' ? 'ceil' : 'dec1' } : { id: 'i' + i, g: 0, name: x.n.trim(), unitText: x.u === 'по вкусу' ? 'по вкусу' : (x.a ? x.a + ' ' + x.u : '') };
      }),
      dishes: [{ name: d.title.trim() }],
      tools: [{ zone: 'Посуда', items: tools.map(function (x, i) { return { id: 't' + i, icon: /сковор/i.test(x) ? 'pan' : /кастр|сотейн/i.test(x) ? 'pot' : /доск|нож/i.test(x) ? 'board' : /блендер/i.test(x) ? 'blender' : /противен|духов/i.test(x) ? 'oven' : /тарел/i.test(x) ? 'plate' : 'bowl', name: x.trim() }; }) }],
      slides: steps.map(function (x, i) { var m = parseInt(x.m, 10); return { type: 'step', short: 'Шаг ' + (i + 1), title: 'Шаг ' + (i + 1), both: [m > 0 ? { t: x.t.trim(), timer: { min: m, label: 'Шаг ' + (i + 1) } } : { t: x.t.trim() }] }; })
        .concat(d.serve.trim() ? [{ type: 'serve', short: 'Подача', title: 'Подача', dishes: [d.title.trim()], points: d.serve.split('\n').map(function (s) { return s.trim(); }).filter(Boolean) }] : []),
      _draft: JSON.parse(JSON.stringify(d))
    };
    try {
      var r = window.Fresh.manual(freshCtx, loose, d.id);
      draft = null; detailId = r.id; go('detail', r.id);
    } catch (e) { ov.querySelector('#edMsg').textContent = 'Не собралось: ' + (e && e.message); }
  }

  /* ---------- корзина ---------- */
  function purge(ids) {
    ids.forEach(function (id) {
      kill(id);
      if (/^(ai|my)-/.test(id)) { if (window.Fresh) window.Fresh.forget(id); if (db) db.collection('fresh').doc(id).delete().catch(function () {}); }
    });
    saveHidden();
    R = R.filter(function (r) { return gone.indexOf(r.id) < 0; });
  }
  function autoPurge() { var old = Object.keys(hidden).filter(function (id) { return Date.now() - hidden[id] > DAY; }); if (old.length) purge(old); }
  function hiddenBlock() {
    var hs = R.filter(function (r) { return isHid(r.id); });
    if (!hs.length) return '';
    return '<div class="lib-hidden"><div class="lib-hid-head"><p class="label">Убранные · ' + hs.length + '</p>' +
      '<button type="button" class="lib-link lib-clear">Очистить всё</button></div><div class="lib-hid-list">' + hs.map(function (r) {
      return '<div class="lib-hid"><span>' + esc(r.title) + '</span><button type="button" class="ghost-btn lib-back" data-id="' + esc(r.id) + '">Вернуть</button>' +
        '<button type="button" class="ghost-btn lib-kill" data-id="' + esc(r.id) + '">Удалить</button></div>';
    }).join('') + '</div></div>';
  }
  function armed(b, label, fn) {
    if (b.getAttribute('data-armed')) { fn(); return; }
    b.setAttribute('data-armed', '1'); b.classList.add('armed'); var t = b.textContent; b.textContent = label;
    setTimeout(function () { if (b.isConnected) { b.removeAttribute('data-armed'); b.classList.remove('armed'); b.textContent = t; } }, 3000);
  }

  /* ---------- события ---------- */
  function $$(s, f) { ov.querySelectorAll(s).forEach(f); }
  function on(s, f) { $$(s, function (b) { b.addEventListener('click', function (e) { f(b, e); }); }); }
  function bind() {
    on('#libMenu', function () { if (window.KukingDrawer) window.KukingDrawer.open(); });
    on('#libClose', close);
    on('.lib-fresh', function () { window.Fresh.spin(freshCtx); });
    on('[data-open]', function (b) { go('detail', b.getAttribute('data-open')); });
    on('[data-a=back]', function () { if (view === 'edit' && draft && draft.id) go('detail', draft.id, true); else go('list', undefined, true); });
    on('[data-a=create]', function () { go('create'); });
    on('[data-a=login]', function () { if (window.KukingSettings) window.KukingSettings.open('account'); });
    on('[data-a=setup]', function () { if (window.KukingSettings) window.KukingSettings.open('ai'); });
    on('[data-a=editnew]', function () { draft = blankDraft(); go('edit'); });
    on('[data-a=editme]', function (b) { var r = byId(b.getAttribute('data-id')); draft = JSON.parse(JSON.stringify(r.manual._draft || blankDraft())); draft.id = r.id; go('edit'); });
    var q = ov.querySelector('#libQ');
    if (q) q.addEventListener('input', function () { query = q.value; var l = ov.querySelector('.tg-list'), list = visible(); if (l) l.outerHTML = list.length ? '<ul class="tg-list">' + list.map(row).join('') + '</ul>' : '<ul class="tg-list"><li class="small tg-none">Ничего не нашёл.</li></ul>'; else render(); on('[data-open]', function (b) { go('detail', b.getAttribute('data-open')); }); });
    on('[data-for]', function (b) { forMode = b.getAttribute('data-for'); lset('kuking:for', forMode); render(); });
    on('.tg-sort', function () { sortOpen = !sortOpen; render(); });
    on('[data-sort]', function (b) { sortBy = b.getAttribute('data-sort'); sortOpen = false; lset('kuking:sort2', sortBy); render(); });
    on('.lib-go', function (b) { choose(b.getAttribute('data-id')); });
    on('.tg-del', function (b) { armed(b, 'Точно убрать?', function () { var id = b.getAttribute('data-id'); hidden[id] = Date.now(); saveHidden(); go('list', undefined, true); }); });
    on('.lib-kill', function (b) { armed(b, 'Точно?', function () { purge([b.getAttribute('data-id')]); render(); }); });
    on('.lib-clear', function (b) { armed(b, 'Тапни ещё раз — удалю все', function () { purge(Object.keys(hidden)); render(); }); });
    on('.lib-back', function (b) { delete hidden[b.getAttribute('data-id')]; saveHidden(); render(); });
    on('.lib-pt', function (b) {
      var id = b.getAttribute('data-id'), n = +b.getAttribute('data-n'), v = rv(id);
      reviews[id] = { score: n, comment: v.comment || '', at: v.at || today() }; edit[id] = true;
      persist(id); keepY(render);
      var f = ov.querySelector('.lib-ta[data-id="' + id + '"]'); if (f) f.focus({ preventScroll: true });
    });
    $$('.lib-ta', function (t) { t.addEventListener('input', function () { drafts[t.getAttribute('data-id')] = t.value; }); });
    on('.lib-save', function (b) {
      var id = b.getAttribute('data-id'), t = ov.querySelector('.lib-ta[data-id="' + id + '"]');
      if (!reviews[id]) return;
      reviews[id].comment = t.value.trim(); delete drafts[id]; delete edit[id];
      persist(id); keepY(render);
    });
    on('.lib-change', function (b) { edit[b.getAttribute('data-id')] = true; keepY(render); });
    SOC().bindThreads(ov, function () { keepY(render); });
    on('.lib-themes', function () { themesOpen = true; if (window.Fresh.stale(freshCtx)) loadThemes(); else render(); });
    on('.lib-themes-re', loadThemes);
    on('.th-go', function (b) { window.Fresh.spin(freshCtx, +b.getAttribute('data-i')); });
    on('[data-im]', function (b) { idea = ov.querySelector('#libIdeaIn').value; ideaMode = b.getAttribute('data-im'); render(); });
    var fi = ov.querySelector('#libIdea');
    if (fi) fi.addEventListener('submit', function (e) {
      e.preventDefault(); idea = ov.querySelector('#libIdeaIn').value.trim(); if (!idea) return;
      if (!(window.KukingAI && window.KukingAI.ready())) { if (window.KukingSettings) window.KukingSettings.open('ai'); return; }
      window.Fresh.custom(freshCtx, idea, ideaMode);
    });
    var ef = ov.querySelector('#libEd');
    if (ef) {
      ef.addEventListener('submit', function (e) { e.preventDefault(); saveDraft(); });
      on('[data-em]', function (b) { readDraft(); draft.mode = b.getAttribute('data-em'); keepY(render); });
      on('[data-add]', function (b) { readDraft(); var k = b.getAttribute('data-add'); if (k === 'ing') draft.ing.push({ n: '', a: '', u: 'г' }); if (k === 'tool') draft.tools.push(''); if (k === 'step') draft.steps.push({ t: '', m: '' }); keepY(render); var l = ov.querySelectorAll(k === 'ing' ? '[data-ing][data-k=n]' : k === 'tool' ? '[data-tool]' : 'textarea[data-step]'); if (l.length) l[l.length - 1].focus(); });
      on('[data-del]', function (b) { readDraft(); var k = b.getAttribute('data-del'), i = +b.getAttribute('data-i'), a = k === 'ing' ? draft.ing : k === 'tool' ? draft.tools : draft.steps; if (a.length > 1) a.splice(i, 1); keepY(render); });
    }
  }
  function keepY(fn) { var y = ov.scrollTop; fn(); ov.scrollTop = y; }

  /* ---------- контекст для нейросети ---------- */
  var friendRev = [];
  function loadFriends() {
    if (!window.KukingStore || !window.KukingStore.user()) return;
    var me = window.KukingStore.user().id;
    window.KukingStore.allReviews().then(function (rows) {
      friendRev = [];
      rows.forEach(function (r) { var d = r.data || {}; if (d.score && r.user_id !== me) friendRev.push({ id: r.id, score: d.score, comment: d.comment }); });
    }).catch(function () {});
  }
  var freshCtx = {
    choose: choose,
    signals: function () {
      return {
        today: today(),
        recipes: R.map(function (r) {
          var v = reviews[r.id];
          return { title: r.title, mode: r.mode, ai: !!r.ai, dishes: (r.dishes || []).map(function (d) { return d.name; }), hidden: isHid(r.id) || undefined, opened: opens[r.id] || undefined,
            lastOpened: lastOpen[r.id] || undefined, cookedAndRated: v && v.at || undefined };
        }),
        reviews: Object.keys(reviews).sort().map(function (id) { return { recipe: titleOf(id), score: reviews[id].score, comment: reviews[id].comment || undefined }; }),
        removedForever: gone.map(function (id) { return /^(ai|my)-/.test(id) ? 'свой рецепт' : titleOf(id); }),
        friendsReviews: friendRev.map(function (x) { return { recipe: titleOf(x.id), score: x.score, comment: x.comment || undefined }; }),
        eaters: window.KukingSocial && window.KukingSocial.eaters ? window.KukingSocial.eaters() : []
      };
    },
    ideasChanged: function (st) {
      if (db) db.collection('meta').doc('ideas').set({ items: st.items, sig: st.sig, updatedAt: new Date().toISOString() }).catch(function () {});
      if (!ov.hidden) keepY(render);
    },
    reviews: function () { var o = {}; Object.keys(reviews).forEach(function (id) { o[id] = { score: reviews[id].score, comment: reviews[id].comment, title: titleOf(id) }; }); return o; },
    added: function (r, replaced) {
      if (replaced) R = R.map(function (x) { return x.id === r.id ? r : x; }); else R.push(r);
      if (!ov.hidden) keepY(render);
      if (db) db.collection('fresh').doc(r.id).set(window.Fresh.toDoc(r)).catch(function () {});
    }
  };

  /* ---------- база ---------- */
  if (window.claude && typeof window.claude.use === 'function') {
    window.claude.use('db').then(function (d) {
      if (!d) return;
      db = d;
      db.collection('fresh').onSnapshot(function (snap) {
        if (snap.metadata.fromCache || !window.Fresh) return;
        var add = window.Fresh.merge(snap.docs.map(function (x) { return { id: x.id, data: x.data() }; })).filter(function (r) { return gone.indexOf(r.id) < 0; });
        if (!add.length) return;
        add.forEach(function (r) { R.push(r); });
        if (!ov.hidden && !typing()) keepY(render);
      }, function () {});
      db.collection('meta').doc('ideas').get().then(function (x) {
        var v = x && x.exists && x.data();
        if (v && Array.isArray(v.items) && !window.Fresh.themes.length) { window.Fresh.setIdeas(v.items, v.sig || ''); if (!ov.hidden) keepY(render); }
      }).catch(function () {});
      var migrated = false;
      db.collection('reviews').onSnapshot(function (snap) {
        if (snap.metadata.fromCache) return;
        var fresh = {};
        snap.docs.forEach(function (doc) { var x = doc.data(); if (x && x.score) fresh[doc.id] = { score: x.score, comment: x.comment || '', at: x.at || String(x.updatedAt || '').slice(0, 10) }; });
        if (!migrated) { migrated = true; Object.keys(reviews).filter(function (id) { return !fresh[id]; }).forEach(function (id) { fresh[id] = reviews[id]; persist(id); }); }
        reviews = fresh; saveLocal(); loadFriends();
        if (!ov.hidden && !typing()) keepY(render);
      }, function () {});
    }).catch(function () {});
  }
  function typing() { var a = document.activeElement; return a && /TEXTAREA|INPUT|SELECT/.test(a.tagName) && ov.contains(a); }

  /* для экрана друзей */
  window.KukingLib = {
    has: function (id) { return R.some(function (r) { return r.id === id; }); },
    rate: function (id) {
      if (isHid(id)) { delete hidden[id]; saveHidden(); }
      ov.hidden = false; edit[id] = !rv(id).score || edit[id]; go('detail', id);
      var b = ov.querySelector('.lib-rate'); if (b) { b.scrollIntoView({ block: 'center', behavior: 'smooth' }); b.classList.add('lib-flash'); setTimeout(function () { b.classList.remove('lib-flash'); }, 1600); }
    },
    open: open
  };
  if (window.KukingSocial && window.KukingSocial.onChange) window.KukingSocial.onChange(function () { if (!ov.hidden && !typing()) keepY(render); });

  /* свайп от левого края — шторка */
  (function () {
    var sx = null, sy = 0;
    ov.addEventListener('touchstart', function (e) { var t = e.touches[0]; sx = t.clientX < 24 && view === 'list' ? t.clientX : null; sy = t.clientY; }, { passive: true });
    ov.addEventListener('touchmove', function (e) {
      if (sx == null) return; var t = e.touches[0];
      if (t.clientX - sx > 50 && Math.abs(t.clientY - sy) < 40) { sx = null; if (window.KukingDrawer) window.KukingDrawer.open(); }
    }, { passive: true });
  })();

  if (btn) btn.addEventListener('click', open);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !ov.hidden && view !== 'list') go('list', undefined, true); });

  var skip = false;
  try { skip = sessionStorage.getItem('kuking:skipHome') === '1'; sessionStorage.removeItem('kuking:skipHome'); } catch (e) {}
  if (!skip || !active) open();
})();
