/* Library — главная «Жарко» в духе Telegram: список рецептов строками, поиск, фильтры,
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
  var R = (window.RECIPES || []).filter(function (r) { return CHEF || own(r); }).map(function (r) { return window.KRecipe ? window.KRecipe.fix(r) : r; });

  /* убранные: { id: время }. Больше суток — удалён насовсем (gone). */
  var DAY = 24 * 60 * 60 * 1000, GKEY = 'kuking:gone';
  var hidden = load(HKEY, {});
  if (Array.isArray(hidden)) { var o0 = {}; hidden.forEach(function (id) { o0[id] = Date.now(); }); hidden = o0; }
  var gone = load(GKEY, []);
  function kill(id) { delete hidden[id]; if (gone.indexOf(id) < 0) gone.push(id); }
  Object.keys(hidden).forEach(function (id) { if (Date.now() - hidden[id] > DAY) kill(id); });
  function saveHidden() { lset(HKEY, JSON.stringify(hidden)); lset(GKEY, JSON.stringify(gone)); if (typeof db !== 'undefined' && db) db.collection('meta').doc('gone').set({ ids: gone, hidden: hidden, updatedAt: new Date().toISOString() }).catch(function () {}); }
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
    if (reviews[id] && reviews[id].score) try { autoDone(id); } catch (e) {}
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
    try { sessionStorage.setItem('kuking:skipHome', '1'); sessionStorage.setItem('kuking:curtain', '1'); } catch (e) {}
    /* перезагрузка прячется за шторкой — без мигания */
    var c = document.getElementById('curtain'); if (c) { c.hidden = false; requestAnimationFrame(function () { c.classList.add('on'); }); }
    setTimeout(function () { location.reload(); }, c ? 200 : 0);
  }
  function open() { view = 'list'; stagger = true; render(); ov.hidden = false; ov.scrollTop = 0; }
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
    [/боул|bowl|в миске|на тарелке/i, '🍛'], [/шаурм|шаверм|лаваш|ролл/i, '🌯'], [/сычуан|остр|чили|мала/i, '🌶️'], [/пицц/i, '🍕'], [/суп|бульон|борщ|рамен|фо\b/i, '🍲'], [/плов|рис|ризотт/i, '🍚'],
    [/салат|боул/i, '🥗'], [/стейк|говяд|строганов|бефстр|ребр/i, '🥩'], [/куриц|курин|крыл|бёдр|бедр/i, '🍗'], [/яйц|омлет|шакшук/i, '🍳'], [/рыб|лосос|форел/i, '🐟'], [/пельмен|хинкал|вареник/i, '🥟']];
  function emoji(r) { if (r.icon) return r.icon; var s = r.title + ' ' + (r.tags || []).join(' ') + ' ' + (r.tagline || ''); for (var i = 0; i < EMO.length; i++) if (EMO[i][0].test(s)) return EMO[i][1]; return '🍽️'; }
  var MODE_NAME = { self: 'Для себя', romance: 'Романтика', friends: 'Друзья' };
  var MODE_SHORT = { self: 'себя', romance: 'романт', friends: 'друзья' };

  /* ---------- фильтры и порядок ---------- */
  var SORTS = [['', 'Новые сверху'], ['old', 'Старые сверху'], ['fast', 'Быстрее'], ['slow', 'Дольше'], ['hi', 'Оценка выше'], ['lo', 'Оценка ниже']];
  var pinned = load('kuking:pinned', []);
  function isPin(id) { return pinned.indexOf(id) >= 0; }
  function togglePin(id) { if (isPin(id)) pinned = pinned.filter(function (x) { return x !== id; }); else pinned.unshift(id); lset('kuking:pinned', JSON.stringify(pinned)); }
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
      if (window.KCat && !KCat.pass(r)) return false;
      if (q && !(window.KCat && KCat.aiOn()) && (r.title + ' ' + (r.tagline || '') + ' ' + (r.tags || []).join(' ') + ' ' + (r.dishes || []).map(function (d) { return d.name; }).join(' ')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var by = { fast: function (x, y) { return mins(x) - mins(y); }, slow: function (x, y) { return mins(y) - mins(x); },
      hi: function (x, y) { return rv(y.id).score - rv(x.id).score; }, lo: function (x, y) { return (rv(x.id).score || 99) - (rv(y.id).score || 99); } }[sortBy];
    if (by) a.sort(by);
    if (sortBy === 'old') a.reverse();
    if (window.KCat) a = KCat.order(a);
    return a.filter(function (r) { return isPin(r.id); }).sort(function (x, y) { return pinned.indexOf(x.id) - pinned.indexOf(y.id); }).concat(a.filter(function (r) { return !isPin(r.id); }));
  }

  /* ---------- экраны: list | detail | create | edit ---------- */
  var view = 'list', detailId = null, listY = 0, dir = '', stagger = false;
  function go(v, id, back) {
    if (view === 'list') listY = ov.scrollTop;
    if (!SUB[view] && SUB[v]) TAB = view; if (back && v === 'list' && TAB !== 'list') v = TAB;
    dir = back ? 'back' : 'fwd'; view = v; if (id !== undefined) detailId = id; if (v === 'list' && !back) stagger = true;
    render(); ov.scrollTop = v === 'list' ? listY : 0;
  }

  function render() {
    autoPurge();
    if (view === 'detail' && (!byId(detailId) || isHid(detailId))) { view = SUB[TAB] ? 'list' : TAB || 'list'; } // рецепт удалён — не застреваем на пустой карточке без таб-бара
    var html = view === 'detail' && byId(detailId) ? detailHTML(byId(detailId)) : view === 'create' ? createHTML() : view === 'edit' ? editHTML() : view === 'plan' ? planHTML() : view === 'profile' ? profileHTML() : view === 'cart' ? (cartFrom ? '<button type="button" class="tg-back cart-back" data-a="cartback"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>' + ({ list: 'Рецепты', plan: 'План', profile: 'Профиль', detail: 'Рецепт' }[cartFrom] || 'Назад') + '</button>' : '') + bigHead('Корзина') + '<div class="ct-host"></div>' : listHTML();
    document.documentElement.classList.toggle('hero-on', view === 'detail' && !ov.hidden);
    var old = ov.firstElementChild;
    if ((dir === 'fwd' || dir === 'back') && old && !ov.hidden && !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) {
      /* как в iOS: старый экран уезжает, а не исчезает */
      document.querySelectorAll('.tg-out').forEach(function (x) { x.remove(); });
      var r = old.getBoundingClientRect(), o = ov.getBoundingClientRect();
      old.classList.remove('in-fwd', 'in-back', 'stagger');
      var out = document.createElement('div'); out.className = 'tg-out out-' + dir; out.setAttribute('aria-hidden', 'true');
      out.style.cssText = 'left:' + o.left + 'px;top:' + o.top + 'px;width:' + o.width + 'px;height:' + o.height + 'px;overflow:hidden';
      old.style.cssText = 'position:absolute;left:' + (r.left - o.left) + 'px;top:' + (r.top - o.top) + 'px;width:' + r.width + 'px';
      out.appendChild(old); ov.parentNode.insertBefore(out, dir === 'back' ? ov.nextSibling : ov);
      setTimeout(function () { out.remove(); }, 480);
    }
    ov.innerHTML = '<div class="tg-screen' + (dir ? ' in-' + dir : '') + (stagger ? ' stagger' : '') + '">' + html + '</div>';
    dir = ''; stagger = false;
    ov.querySelectorAll('.tg-li').forEach(function (li, i) { if (i < 12) li.style.setProperty('--i', i); });
    bind(); syncTabs();
    if (view === 'cart' && window.KCart) { var ch = ov.querySelector('.ct-host'); if (ch) KCart.mount(ch); }
  }
  var PLUS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
  var DICE = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="9" cy="9" r="1.3" class="f"/><circle cx="15" cy="15" r="1.3" class="f"/><circle cx="15" cy="9" r="1.3" class="f"/><circle cx="9" cy="15" r="1.3" class="f"/></svg>';
  var I = { /* значки в цветных квадратиках, как в Настройках iPhone */
    cook: ['#ff9f0a', '<path d="M4 11h13a0 0 0 0 1 0 0 6 6 0 0 1-6 6H10a6 6 0 0 1-6-6z"/><path d="M17 12h3"/><path d="M8 4c-1 1.5 1 2.5 0 4M12 4c-1 1.5 1 2.5 0 4"/>'],
    food: ['#30b356', '<path d="M12 7c-1.5-2-5-2-6 1-1.2 3.6 1.5 10 4 10 .8 0 1.2-.5 2-.5s1.2.5 2 .5c2.5 0 5.2-6.4 4-10-1-3-4.5-3-6-1z"/><path d="M12 7c0-2 1-3.5 3-4"/>'],
    anketa: ['#ff9f0a', '<path d="M6 4h9l3 3v13H6z"/><path d="M9 12h6M9 16h4"/>'],
    friends: ['#00b5a8', '<circle cx="9" cy="9" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><path d="M15.5 6a3 3 0 0 1 0 6M17.5 14.2c1.9.6 3 2.2 3.3 4.8"/>'],
    ai: ['#8e5cf7', '<path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6z"/><path d="M18 15l.8 1.8 1.7.7-1.7.8L18 20l-.8-1.7-1.7-.8 1.7-.7z"/>'],
    look: ['#ff375f', '<path d="M12 4a8 8 0 1 0 0 16c1.2 0 1.8-.9 1.4-1.9-.5-1.2.3-2.1 1.5-2.1H17a3 3 0 0 0 3-3c0-5-3.6-9-8-9z"/><circle cx="8" cy="11" r="1.1" class="f"/><circle cx="11" cy="7.5" r="1.1" class="f"/><circle cx="15.5" cy="8.5" r="1.1" class="f"/>'],
    account: ['#8e8e93', '<circle cx="12" cy="9" r="3.5"/><path d="M5 20c1-3.6 3.8-5.5 7-5.5s6 1.9 7 5.5"/>'],
    install: ['#0a84ff', '<rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M12 8v6M9.5 11.5L12 14l2.5-2.5"/>'],
    login: ['#5e5ce6', '<path d="M10 17l5-5-5-5"/><path d="M15 12H4"/><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/>'],
    spark: ['#8e5cf7', '<path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6z"/>'],
    dice: ['#ff9f0a', '<rect x="5" y="5" width="14" height="14" rx="3.5"/><circle cx="9.5" cy="9.5" r="1.2" class="f"/><circle cx="14.5" cy="14.5" r="1.2" class="f"/>'],
    prefs: ['#9c1c3b', '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2.2"/><circle cx="10" cy="17" r="2.2"/>'],
    kitchen: ['#495057', '<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 10h16"/><rect x="8" y="13" width="8" height="4" rx="1"/><circle cx="8" cy="7.5" r=".8" class="f"/><circle cx="11" cy="7.5" r=".8" class="f"/>'],
    notif: ['#f03e3e', '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>'],
    quiz: ['#e8590c', '<path d="M12 3c1.4 3 5 5 5 9.5a5 5 0 0 1-10 0c0-2.2 1.3-3.6 2.2-4.4 0 1.8.9 2.7 1.8 2.7-.4-2.7.9-5.3 1-7.8z"/>'],
    feedback: ['#e0a800', '<path d="M21 4L3 11l6 2 2 6 3-4 5 4z"/><path d="M9 13l9-7"/>'],
    about: ['#a0826d', '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v6"/><circle cx="12" cy="7.6" r="1" class="f"/>'],
    imp: ['#0ca678', '<path d="M12 4v11M7 10l5 5 5-5"/><path d="M5 19h14"/>'],
    pen: ['#30b356', '<path d="M5 19h4L19 9l-4-4L5 15z"/><path d="M13.5 6.5l4 4"/>']
  };
  function icoSq(k) { var x = I[k]; return '<span class="pf-ico" style="background:' + x[0] + '" aria-hidden="true"><svg viewBox="0 0 24 24">' + x[1] + '</svg></span>'; }
  function bigHead(title, right) {
    return '<header class="tg-head"><span class="tg-mini" aria-hidden="true">' + title + '</span><span class="tg-nav-r">' + (right || '') + '</span></header>' +
      '<h2 class="lib-title tg-big" id="libTitle">' + title + '</h2>';
  }
  function burger() {
    var n = SOC().badge();
    return '<button type="button" class="tg-ic tg-burger" id="libMenu" aria-label="Меню' + (n ? ', заявок: ' + n : '') + '"><i></i>' + (n ? '<span class="tg-dot">' + n + '</span>' : '') + '</button>';
  }
  function listHTML() {
    var list = visible(), all = R.filter(function (r) { return !isHid(r.id); });
    var h = bigHead('Жарко', '<button type="button" class="tg-ic lib-fresh" aria-label="Рулетка идей" title="Рулетка идей">' + DICE + '</button>' +
      '<button type="button" class="tg-ic tg-plus" data-a="create" aria-label="Новый рецепт">' + PLUS + '</button>');
    h += '<div class="tg-tools"><label class="tg-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>' +
      '<input id="libQ" type="search" placeholder="Поиск по рецептам" autocomplete="off" value="' + esc(query) + '" aria-label="Поиск по рецептам"></label>' +
      '<div class="tg-chips" role="toolbar" aria-label="Фильтры">' +
      [['', 'Все · ' + all.length], ['self', 'Для себя'], ['romance', 'Романтика'], ['friends', 'Друзья'], ['new', 'Не готовил']].map(function (c) {
        return '<button type="button" class="tg-chip' + (c[0] && c[0] !== 'new' ? ' m-' + c[0] : '') + '" data-for="' + c[0] + '" aria-pressed="' + (forMode === c[0]) + '">' + c[1] + '</button>';
      }).join('') +
      '<button type="button" class="tg-chip tg-sort" aria-expanded="' + sortOpen + '" aria-label="Порядок">⇅ ' + esc((SORTS.filter(function (s) { return s[0] === sortBy; })[0] || SORTS[0])[1]) + '</button></div>' +
      (sortOpen ? '<div class="tg-pop" role="menu">' + SORTS.map(function (s) { return '<button type="button" role="menuitemradio" data-sort="' + s[0] + '" aria-checked="' + (sortBy === s[0]) + '">' + s[1] + '</button>'; }).join('') + '</div>' : '') + '</div>';
    if (window.KCat && all.length) h += KCat.barHTML(all) + '<div class="kc-askw">' + KCat.askHTML(query) + '</div>';
    h += todayCard();
    if (active && !isHid(active.id)) h += '<button type="button" class="tg-pin" id="libClose"><span class="tg-pin-bar"></span><span class="tg-pin-t"><small>Сейчас готовишь</small><b>' + esc(active.title) + '</b></span><span class="tg-pin-go">Открыть →</span></button>';
    if (!all.length) h += emptyHTML();
    else if (!list.length) h += '<p class="small tg-none">Ничего не нашёл. Попробуй другое слово или сбрось фильтр.</p>' + (window.KCat && KCat.active() ? '<button type="button" class="nav-btn kc-reset">Сбросить фильтры</button>' : '');
    else h += '<div class="tg-lists">' + listsHTML(list) + '</div>';
    h += hiddenBlock();
    return h;
  }
  function listsHTML(list) {
    var pins = list.filter(function (r) { return isPin(r.id); }), rest = list.filter(function (r) { return !isPin(r.id); });
    if (!list.length) return '<p class="small tg-none">Ничего не нашёл.</p>';
    return (pins.length ? '<h3 class="tg-sec-t">Закреплённые</h3><ul class="tg-list tg-group">' + pins.map(row).join('') + '</ul>' : '') +
      (rest.length ? (pins.length ? '<h3 class="tg-sec-t">Все рецепты</h3>' : '') + '<ul class="tg-list tg-group">' + rest.map(row).join('') + '</ul>' : '');
  }
  /* ---------- План (скоро) и Профиль ---------- */
  /* ---------- План: лента по дням, как «Список» в Календаре iPhone ----------
     В каждом дне — блюда и подготовка: закупка, убрать мясо в морозилку, достать на разморозку,
     замариновать, сама готовка. Время подготовки берётся из настроек плана; по нему же — пуш. */
  var tdSeen = false, planOv = load('kuking:planOv', { tasks: {}, cook: {} });
  planOv.tasks = planOv.tasks || {}; planOv.cook = planOv.cook || {};
  function cookAt(k) { return planOv.cook[k] || hm(cfg().cook); }
  var plan = load('kuking:plan', {}), planIntro = lget('kuking:planIntro') === '1';
  var planCfg = load('kuking:planCfg', null), doneTasks = load('kuking:planDone', {});
  var DOW = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'], DOW_FULL = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
  var MON = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  function dKey(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function dParse(k) { var x = k.split('-'); return new Date(+x[0], +x[1] - 1, +x[2]); }
  function addDays(k, n) { var d = dParse(k); d.setDate(d.getDate() + n); return dKey(d); }
  function dayName(k) { var t = today(); return k === t ? 'Сегодня' : k === addDays(t, 1) ? 'Завтра' : DOW_FULL[dParse(k).getDay()]; }
  function dayDate(k) { var d = dParse(k); return d.getDate() + ' ' + MON[d.getMonth()]; }
  function cfg() { return planCfg || { shop: 'week', shopDay: 6, shopTime: '12:00', meat: 'fresh', cook: '19:00' }; }
  function savePlan() {
    Object.keys(plan).forEach(function (k) { if (!plan[k] || !plan[k].length) delete plan[k]; });
    lset('kuking:plan', JSON.stringify(plan)); lset('kuking:planCfg', JSON.stringify(planCfg)); lset('kuking:planOv', JSON.stringify(planOv));
    if (db) db.collection('meta').doc('plan').set({ days: plan, cfg: planCfg, ov: planOv, updatedAt: new Date().toISOString() }).catch(function () {});
    syncTasks();
  }
  function hasMeat(r) { return (r.ingredients || []).some(function (i) { return /говяд|свин|баран|телят|куриц|курин|бедр|бёдр|крыл|фарш|мяс|индей|утк|лосос|сёмг|семг|рыб|форел|кревет/i.test(i.name); }); }
  /* тексты действий из шагов рецепта */
  function stepItems(r) {
    var out = [];
    (r.slides || []).forEach(function (s, si) { if (s.type !== 'step') return;
      (function walk(o) { if (!o || typeof o !== 'object') return; if (Array.isArray(o)) return o.forEach(walk); if (typeof o.t === 'string') out.push({ t: o.t, step: s.title || s.short || '', si: si }); Object.keys(o).forEach(function (k) { if (k !== 't' && o[k] && typeof o[k] === 'object') walk(o[k]); }); })(s);
    });
    return out;
  }
  var AHEAD_RE = /заранее|на ночь|накануне|с вечера|за \d+[–-]?\d*\s*(ч(?![а-яё])|час)|минимум \d+\s*час|от \d+\s*час|\d+\s*(ч(?![а-яё])|час[а-я]*)\s*в холодильник/i;
  /* что надо сделать ДО готовки: из поля ahead или из текста шагов («замаринуй на ночь») */
  function aheadOf(r) {
    if (Array.isArray(r.ahead) && r.ahead.length) return r.ahead.map(function (a) { return { what: a.what || 'Подготовка', hours: +a.hours || 8, text: a.text || '' }; });
    var hit = stepItems(r).filter(function (x) { return /маринад|маринуй|замарин/i.test(x.t) && AHEAD_RE.test(x.t); })[0];
    if (!hit) return [];
    var m = /(\d+)\s*(ч(?![а-яё])|час)/i.exec(hit.t), h = /ночь|накануне|вечера/i.test(hit.t) ? 12 : m ? +m[1] : 8;
    return [{ what: 'Замариновать', hours: Math.max(h, 1), text: hit.t }];
  }
  function marinated(r) { return aheadOf(r).length > 0; }
  function hm(t) { return String(t || '19:00').slice(0, 5); }
  function minus(t, h) { var x = hm(t).split(':'), m = (+x[0] * 60 + +x[1] - h * 60 + 1440) % 1440; return String((m / 60) | 0).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
  /* подготовка на 21 день вперёд: [{key, day, time, kind, title, sub, ids}] */
  function tasksAll() {
    var c = cfg(), t = today(), out = [], days = [];
    for (var i = -7; i < 21; i++) days.push(addDays(t, i));
    var withDishes = days.filter(function (k) { return (plan[k] || []).filter(byId).length; });
    // закупка
    if (c.shop === 'week') {
      var groups = {};
      withDishes.forEach(function (k) { var d = dParse(k), back = (d.getDay() - c.shopDay + 7) % 7; var sk = addDays(k, -back); if (back === 0 && hm(c.shopTime) > hm(c.cook)) sk = addDays(k, -7); (groups[sk] = groups[sk] || []).push(k); });
      Object.keys(groups).forEach(function (sk) { var ids = []; groups[sk].forEach(function (k) { ids = ids.concat(plan[k].filter(byId)); });
        out.push({ key: 'shop:' + sk, day: sk, time: hm(c.shopTime), kind: 'shop', title: 'Закупка', sub: ids.length + ' ' + (ids.length === 1 ? 'блюдо' : ids.length < 5 ? 'блюда' : 'блюд') + ' до ' + dayDate(groups[sk][groups[sk].length - 1]), ids: ids }); });
    }
    withDishes.forEach(function (k) {
      var ids = plan[k].filter(byId);
      if (c.shop === 'day') out.push({ key: 'shop:' + k, day: k, time: minus(cookAt(k), 2), kind: 'shop', title: 'Закупка', sub: 'на сегодняшний ужин', ids: ids });
      if (c.shop === 'delivery') out.push({ key: 'order:' + k, day: addDays(k, -1), time: '20:00', kind: 'shop', title: 'Заказать продукты', sub: 'доставка к ' + dayName(k).toLowerCase() + ', ' + dayDate(k), ids: ids });
      ids.forEach(function (id) {
        var r = byId(id);
        if (c.meat === 'frozen' && hasMeat(r)) {
          var sday = c.shop === 'week' ? (out.filter(function (x) { return x.kind === 'shop' && x.ids.indexOf(id) >= 0; })[0] || {}).day : c.shop === 'delivery' ? k : null;
          if (sday && sday < addDays(k, aheadOf(r).some(function (a) { return a.hours >= 10; }) ? -2 : -1)) out.push({ key: 'freeze:' + k + ':' + id, day: sday, time: c.shop === 'delivery' ? '' : minus(c.shopTime, -1), kind: 'freeze', title: 'Мясо — в морозилку', sub: 'для «' + r.title + '»', ids: [id] });
          var early = aheadOf(r).some(function (a) { return a.hours >= 10; }), tday = addDays(k, early ? -2 : -1); // маринад на ночь — размораживаем на сутки раньше
          if (sday && sday < tday) out.push({ key: 'thaw:' + k + ':' + id, day: tday, time: '20:00', kind: 'thaw', title: 'Достать мясо в холодильник', sub: early ? 'разморозится к маринаду' : 'разморозится к завтрашнему ужину', ids: [id] });
        }
        aheadOf(r).forEach(function (a, ai) {
          var cm = +cookAt(k).split(':')[0] * 60 + +cookAt(k).split(':')[1] - a.hours * 60, dd = k;
          while (cm < 0) { cm += 1440; dd = addDays(dd, -1); }
          if (a.hours >= 10) { dd = addDays(k, -1); cm = 21 * 60; } // на ночь — вечером накануне
          var tm = String((cm / 60) | 0).padStart(2, '0') + ':' + String(cm % 60).padStart(2, '0');
          out.push({ key: 'mar:' + k + ':' + id + (ai ? ':' + ai : ''), day: dd, time: tm, kind: 'marinade', title: a.what, sub: 'для «' + r.title + '» — за ' + a.hours + ' ч до готовки', ids: [id], ahead: a });
        });
        out.push({ key: 'cook:' + k + ':' + id, day: k, time: cookAt(k), kind: 'cook', title: r.title, sub: String(r.totalTime || '').replace('≈ ', ''), ids: [id], dish: id });
      });
    });
    if (c.empty !== 'off' && planIntro) for (var e = 1; e <= 7; e++) { var ek = addDays(t, e); if (!(plan[ek] || []).filter(byId).length) out.push({ key: 'empty:' + ek, day: addDays(ek, -1), time: hm(c.cook), kind: 'empty', title: 'На ' + (e === 1 ? 'завтра' : dayName(ek).toLowerCase()) + ' ничего не запланировано', sub: 'Выбери блюдо — успеешь закупиться', ids: [], target: ek }); }
    out.forEach(function (x) { var o = planOv.tasks[x.key]; if (o && x.kind !== 'cook') { if (o.day) x.day = o.day; if (o.time) x.time = o.time; x.moved = true; } });
    return out.sort(function (x, y) { return (x.day + (x.time || '00:00')).localeCompare(y.day + (y.time || '00:00')); });
  }
  /* пуши: будущие напоминания кладём на сервер, он присылает их вовремя */
  var syncT = 0;
  /* Уведомления в духе Duolingo: коротко, по делу, с характером, не чаще 3 в день, ночью тишина */
  var PUSH = {
    shop: [['Закупка сегодня', 'Список уже собран — открой «План» и пройдись по полкам.'], ['Пора в магазин', '{sub}. Список в «Плане», ничего не забудешь.'], ['Тележку в руки', 'Сегодня закупка: {sub}.']],
    freeze: [['Мясо — в морозилку', 'Плоско, в пакет, с датой. Минута дела.'], ['Не забудь про морозилку', 'Убери мясо, пока не забыл — потом скажешь спасибо.']],
    thaw: [['Достань мясо', 'Из морозилки в холодильник — к ужину будет мягким.'], ['Мясо на разморозку', 'Переложи в холодильник на нижнюю полку. Завтра без нервов.']],
    marinade: [['{title}', '{sub}. Пять минут сейчас — и вечером вкус в два раза мощнее.'], ['Время маринада', '{title} — {sub}.']],
    cook: [['Через 30 минут — {title}', 'Достань посуду и включи музыку.'], ['Скоро к плите', '{title} через полчаса. Шеф готов?'], ['{title} сегодня', 'Через 30 минут стартуем. Нож наточен?']],
    empty: [['На завтра пусто', 'Выбери блюдо сейчас — успеешь закупиться.'], ['А что завтра?', 'Тапни «План» и накидай блюдо за 10 секунд.']],
    rate: [['Как зашёл {title}?', 'Поставь оценку — следующий рецепт будет точнее.'], ['Оцени {title}', 'Пара тапов — и нейросеть поймёт, что тебе по кайфу.']],
    week: [['Неделя на подходе', 'Раскидай блюда на 30 секунд — закупка и напоминания распишутся сами.']],
    nudge: [['Плита скучает', 'Давно не готовил. Крутани барабан — подберу что-нибудь под настроение.'], ['Шеф, ты где?', 'Три дня без готовки. Одно блюдо — и форма вернётся.']]
  };
  var PRIO = { cook: 0, marinade: 1, thaw: 2, shop: 3, freeze: 4, empty: 5, rate: 6, week: 7, nudge: 8 };
  function hashStr(t) { var h = 0; for (var i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return Math.abs(h); }
  function pushText(x) {
    var v = PUSH[x.kind] || [[x.title, x.sub]], p2 = v[hashStr(x.key) % v.length];
    function f(t) { return String(t).replace('{title}', x.title || '').replace('{sub}', x.sub || ''); }
    return { title: f(p2[0]), body: f(p2[1]) };
  }
  var syncT = 0;
  function syncTasks() {
    clearTimeout(syncT);
    syncT = setTimeout(function () {
      var S = window.KukingStore; if (!S || !S.user || !S.user() || !S.req) return;
      var me = S.user().id, now = Date.now(), td = today(), c = cfg();
      var list = tasksAll().filter(function (x) { return x.time && !doneTasks[x.key]; }).map(function (x) {
        var y = Object.assign({}, x); if (y.kind === 'cook') y.time = minus(y.time, 0.5); return y; });
      // оценка — назавтра в полдень, если ещё не оценил
      Object.keys(plan).forEach(function (k) { if (k < addDays(td, -2)) return; (plan[k] || []).filter(byId).forEach(function (id) {
        if (!reviews[id] || !reviews[id].score) list.push({ key: 'rate:' + k + ':' + id, day: addDays(k, 1), time: '12:00', kind: 'rate', title: titleOf(id), sub: '' }); }); });
      // воскресенье 18:00 — если на следующую неделю меньше 2 блюд
      if (planIntro) { var d0 = dParse(td), toSun = (7 - d0.getDay()) % 7, sun = addDays(td, toSun), n = 0; for (var i = 1; i <= 7; i++) n += (plan[addDays(sun, i)] || []).filter(byId).length;
        if (n < 2) list.push({ key: 'week:' + sun, day: sun, time: '18:00', kind: 'week', title: '', sub: '' }); }
      // давно не заходил — через 3 дня в время готовки (каждый вход отодвигает)
      list.push({ key: 'nudge', day: addDays(td, 3), time: hm(c.cook), kind: 'nudge', title: '', sub: '' });
      if (window.KPrefs) list = list.filter(function (x) { return KPrefs.notifOn(x.kind); });
      // тихие часы 9–22 и не больше 3 в день: лишнее сливаем в одно
      var byDay = {};
      list.forEach(function (x) { var hh = +x.time.split(':')[0]; if (hh < 9) x.time = '09:00'; if (hh >= 22) x.time = '21:30'; (byDay[x.day] = byDay[x.day] || []).push(x); });
      var rows = [];
      Object.keys(byDay).forEach(function (dk) {
        var xs = byDay[dk].sort(function (a, b) { return PRIO[a.kind] - PRIO[b.kind]; });
        var keep = xs.slice(0, 3), rest = xs.slice(3);
        if (rest.length) { var last = keep[2]; last.digest = rest.map(function (r) { return pushText(r).title; }); }
        keep.forEach(function (x) {
          var d = dParse(x.day), hhmm = x.time.split(':'); d.setHours(+hhmm[0], +hhmm[1], 0, 0);
          var t = pushText(x); if (x.digest) t.body += ' И ещё: ' + x.digest.join(', ') + '.';
          if (d.getTime() > now) rows.push({ user_id: me, key: x.key, at: d.toISOString(), title: t.title, body: t.body, sent: false });
        });
      });
      S.req('DELETE', 'plan_tasks?user_id=eq.' + encodeURIComponent(me) + '&sent=eq.false').then(function () {
        return rows.length ? S.req('POST', 'plan_tasks?on_conflict=user_id,key', rows, 'resolution=merge-duplicates,return=minimal') : null;
      }).catch(function () {});
    }, 600);
  }
  var TK = { /* значки подготовки */
    shop: ['#30b356', '<path d="M4 5h2l2 10h10l2-7H7"/><circle cx="10" cy="19" r="1.4" class="f"/><circle cx="17" cy="19" r="1.4" class="f"/>'],
    freeze: ['#0a84ff', '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/><path d="M9.5 4.5L12 7l2.5-2.5M9.5 19.5L12 17l2.5 2.5"/>'],
    thaw: ['#64d2ff', '<path d="M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z"/>'],
    marinade: ['#bf5af2', '<path d="M7 4h10M8 4v4l-3 5v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6l-3-5V4"/><path d="M5 14h14"/>'],
    empty: ['#8e8e93', '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M8 3v4M16 3v4M12 13v4M10 15h4"/>'],
    cook: ['#ff9f0a', '<path d="M5 12h14v2a7 7 0 0 1-14 0z"/><path d="M3 12h18"/><path d="M9 9c-1-1.5 1-2.2 0-4M12 9c-1-1.5 1-2.2 0-4M15 9c-1-1.5 1-2.2 0-4"/>']
  };
  var TK_NAME = { shop: 'закупка', freeze: 'в морозилку', thaw: 'разморозка', marinade: 'маринад' };
  function glyph(k) { var x = TK[k]; return '<svg class="dm-g" viewBox="0 0 24 24" style="color:' + x[0] + '" aria-hidden="true">' + x[1] + '</svg>'; }
  /* что в дне: эмодзи блюд + значки подготовки, вместо безликих точек */
  function dayMarks(k, all) {
    var ids = (plan[k] || []).filter(byId), kinds = {};
    all.forEach(function (x) { if (x.day === k && TK_NAME[x.kind]) kinds[x.kind] = 1; });
    var e = ids.slice(0, 2).map(function (id) { return '<i>' + emoji(byId(id)) + '</i>'; }).join('') + (ids.length > 2 ? '<em>+' + (ids.length - 2) + '</em>' : '');
    var g = Object.keys(kinds).map(glyph).join('');
    return '<span class="dm">' + (e ? '<span class="dm-e">' + e + '</span>' : '') + (g ? '<span class="dm-t">' + g + '</span>' : '') + '</span>';
  }
  function dayLabel(k, all) {
    var ids = (plan[k] || []).filter(byId), ks = {}; all.forEach(function (x) { if (x.day === k && TK_NAME[x.kind]) ks[TK_NAME[x.kind]] = 1; });
    return (ids.length ? ', ' + ids.map(function (id) { return byId(id).title; }).join(', ') : '') + (Object.keys(ks).length ? ', ' + Object.keys(ks).join(', ') : '');
  }
  function tIco(k) { var x = TK[k]; return '<span class="pf-ico" style="background:' + x[0] + '" aria-hidden="true"><svg viewBox="0 0 24 24">' + x[1] + '</svg></span>'; }
  var CAL = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>';
  var CARTI = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h2.5l2.2 10.5h10.6L20.5 7H7"/><circle cx="9.5" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/></svg>';
  var GEAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/></svg>';
  /* время — прямо в строке: тапнул, крутанул барабан, план пересобрался */
  function timeIn(x) { return '<label class="ag-time ag-tin"><input type="time" data-tin="' + esc(x.key) + '" value="' + esc(x.time || '') + '" aria-label="Время: ' + esc(x.title) + '"><span>' + esc(x.time || '—') + '</span></label>'; }
  function chkBtn(k, dn) { return '<button type="button" class="ag-chk' + (dn ? ' on' : '') + '" data-tdone="' + esc(k) + '" role="checkbox" aria-checked="' + dn + '" aria-label="Сделано"><span class="chk-box"><svg viewBox="0 0 24 24"><path d="M6 12.5l4 4 8-9"/></svg></span></button>'; }
  function shopProg(x) {
    var h = shopHave[x.key] || {}, n = 0, got = 0, seen = {};
    x.ids.forEach(function (id) { ((byId(id) || {}).ingredients || []).forEach(function (i) { if (!i || !i.name) return; var k = i.name.toLowerCase().replace(/\s*\(.*?\)\s*/g, '').trim() + '|' + (i.unit || ''); if (seen[k]) return; seen[k] = 1; n++; if (h[k]) got++; }); });
    return got ? got + '/' + n : 'Список';
  }
  function taskRow(x, tday) {
    var dn = !!doneTasks[x.key], past = x.day < tday;
    if (x.kind === 'cook') {
      var r = byId(x.dish);
      return '<li class="ag-it ag-cook' + (dn ? ' done' : '') + '" data-k="' + esc(x.key) + '" data-swk="cook" data-dish="' + esc(x.dish) + '" data-pday="' + x.day + '"><div class="ag-bg"><span class="ag-bg-r"></span><span class="ag-bg-l"><button type="button" class="ag-sw mv" data-agsw="move" tabindex="-1">Перенести</button><button type="button" class="ag-sw del" data-agsw="del" tabindex="-1">Убрать</button></span></div><div class="ag-row">' + timeIn(x) +
        '<button type="button" class="ag-main" data-task="' + esc(x.key) + '"><span class="tg-av m-' + esc(r.mode || 'self') + '" aria-hidden="true">' + emoji(r) + '</span><span class="ag-t"><b>' + esc(r.title) + '</b><small>' + esc(x.sub) + '</small></span></button>' +
        chkBtn(x.key, dn) + '</div></li>';
    }
    if (x.kind === 'empty') return '<li class="ag-it ag-empty" data-k="' + esc(x.key) + '"><span class="ag-time">' + esc(x.time || '') + '</span>' +
      '<button type="button" class="ag-main" data-add="' + x.target + '">' + tIco('empty') + '<span class="ag-t"><b>' + esc(x.title) + '</b><small>' + esc(x.sub) + '</small></span><span class="ag-more">Добавить</span></button></li>';
    return '<li class="ag-it' + (dn ? ' done' : '') + '" data-k="' + esc(x.key) + '" data-swk="task"><div class="ag-bg"><span class="ag-bg-r">' + (dn ? 'Вернуть' : 'Сделано') + '</span><span class="ag-bg-l"></span></div><div class="ag-row">' + timeIn(x) +
      '<button type="button" class="ag-main"' + (x.kind === 'shop' ? ' data-shop="' + esc(x.key) + '"' : ' data-task="' + esc(x.key) + '"') + '>' + tIco(x.kind) + '<span class="ag-t"><b>' + esc(x.title) + '</b><small>' + esc(x.sub) + '</small></span>' +
      '<span class="ag-more">' + (x.kind === 'shop' ? shopProg(x) : 'Как') + '</span></button>' +
      chkBtn(x.key, dn) + '</div></li>';
  }
  /* смахи в плане: дело вправо — сделано; блюдо влево — кнопки «Перенести / Убрать», до конца — убрать */
  function agSwipes() {
    ov.querySelectorAll('.ag-it[data-swk]').forEach(function (li) {
      var row = li.querySelector('.ag-row'), kind = li.getAttribute('data-swk'), x0 = 0, y0 = 0, dx = 0, mode = '', base = 0;
      function back() { base = 0; row.style.transition = 'transform .3s cubic-bezier(.22,1,.36,1)'; row.style.transform = ''; li.classList.remove('sw-open', 'sw-go', 'sw-r', 'sw-l'); }
      li._reset = back;
      row.addEventListener('touchstart', function (e) { var t = e.touches[0]; x0 = t.clientX; y0 = t.clientY; dx = 0; mode = li.classList.contains('sw-open') ? 'open' : ''; if (!mode) ov.querySelectorAll('.ag-it.sw-open').forEach(function (x) { if (x !== li && x._reset) x._reset(); }); }, { passive: true });
      row.addEventListener('touchmove', function (e) {
        var t = e.touches[0], mx = t.clientX - x0, my = t.clientY - y0;
        if (mode === 'open' && Math.abs(mx) > 8) mode = 'swipe';
        if (!mode && Math.abs(mx) > 12 && Math.abs(mx) > Math.abs(my) * 1.4) mode = 'swipe';
        if (!mode && Math.abs(my) > 10) mode = 'scroll';
        if (mode !== 'swipe') return;
        dx = mx + base; if (kind === 'task' && dx < 0) dx = 0; if (kind === 'cook' && dx > 0) dx = 0;
        var W = row.offsetWidth; row.style.transition = 'none'; row.style.transform = 'translateX(' + Math.max(-W * 0.92, Math.min(W * 0.6, dx)) + 'px)';
        li.classList.toggle('sw-r', dx > 0); li.classList.toggle('sw-l', dx < 0);
        var go = kind === 'task' ? dx > 90 : dx < -W * 0.62; if (go !== li.classList.contains('sw-go')) { li.classList.toggle('sw-go', go); if (go && navigator.vibrate) window.kHaptic(10); }
      }, { passive: true });
      row.addEventListener('touchend', function () {
        if (mode !== 'swipe') return; noClickUntil = Date.now() + 400;
        var W = row.offsetWidth;
        if (kind === 'task' && dx > 90) { back(); setDone(li.getAttribute('data-k'), !doneTasks[li.getAttribute('data-k')]); if (window.kHaptic) window.kHaptic(); var lbl = li.querySelector('.ag-bg-r'); setTimeout(function () { lbl.textContent = doneTasks[li.getAttribute('data-k')] ? 'Вернуть' : 'Сделано'; }, 300); }
        else if (kind === 'cook' && dx < -W * 0.62) { if (window.kHaptic) window.kHaptic(); unplanLi(li); }
        else if (kind === 'cook' && dx < -60) { base = -184; row.style.transition = 'transform .3s cubic-bezier(.22,1,.36,1)'; row.style.transform = 'translateX(' + base + 'px)'; li.classList.add('sw-open'); }
        else back();
      });
      li.querySelectorAll('[data-agsw]').forEach(function (b) { b.addEventListener('click', function () {
        if (window.kHaptic) window.kHaptic(8);
        if (b.getAttribute('data-agsw') === 'del') unplanLi(li); else { back(); moveSheet(li.getAttribute('data-dish'), li.getAttribute('data-pday')); } }); });
    });
  }
  function unplanLi(li) {
    var id = li.getAttribute('data-dish'), d = li.getAttribute('data-pday');
    plan[d] = (plan[d] || []).filter(function (x) { return x !== id; }); savePlan();
    li.style.height = li.offsetHeight + 'px'; void li.offsetHeight; li.classList.add('gone'); setTimeout(function () { keepY(render); }, 300);
  }
  function planHTML() {
    if (!planIntro) return bigHead('План') +
      '<div class="pl-intro"><div class="pl-art" aria-hidden="true">' + [0, 1, 2, 3, 4, 5, 6].map(function (i) { return '<i style="--i:' + i + '"' + (i === 2 || i === 4 ? ' class="on"' : '') + '></i>'; }).join('') + '</div>' +
      '<h3>Неделя без вопроса «что приготовить»</h3><p class="small">Раскидай блюда по дням — «Жарко» сам напомнит, когда закупиться, достать мясо и встать к плите.</p>' +
      '<button type="button" class="nav-btn primary pl-start" data-a="planStart">Начать</button>' +
      '<ol class="pl-steps"><li><b>Скажи, как закупаешься</b><span>раз в неделю, в день готовки или доставкой</span></li><li><b>Добавь блюда в дни</b><span>из своей книги, в пару тапов</span></li><li><b>Лови напоминания</b><span>закупка, морозилка, маринад, готовка</span></li></ol>' +
      '</div>';
    var td = today(), all = tasksAll().filter(function (x) { return x.kind !== 'empty' || x.day === td; }), head = bigHead('План', (window.KCart ? '<button type="button" class="tg-ic pl-cart" data-a="cart" aria-label="Корзина">' + CARTI + (KCart.count() ? '<b class="pl-cnt">' + KCart.count() + '</b>' : '') + '</button>' : '') + '<button type="button" class="tg-ic pl-calbtn" data-a="calToggle" aria-expanded="' + calOpen + '" aria-label="Календарь на месяц">' + CAL + '</button><button type="button" class="tg-ic" data-a="planCfg" aria-label="Настройки плана">' + GEAR + '</button>');
    var t0 = dParse(td); t0.setDate(t0.getDate() - ((t0.getDay() + 6) % 7));
    var strip = '<div class="pl-strip" role="tablist" aria-label="Дни">';
    for (var i = 0; i < 21; i++) { var d = new Date(t0); d.setDate(t0.getDate() + i); var k = dKey(d), n = (plan[k] || []).filter(byId).length, tk = all.filter(function (x) { return x.day === k && x.kind !== 'cook'; }).length;
      strip += '<button type="button" class="pl-day' + (k === td ? ' today' : '') + (k < td ? ' past' : '') + (n ? ' has' : '') + '" data-jump="' + k + '" aria-label="' + DOW_FULL[d.getDay()] + ', ' + dayDate(k) + dayLabel(k, all) + '"><span class="pl-dow">' + DOW[d.getDay()] + '</span><b>' + d.getDate() + '</b>' + dayMarks(k, all) + '</button>'; }
    strip += '</div>';
    strip = '<div class="pl-stripw"><button type="button" class="pl-arr" data-sarr="-1" aria-label="Неделя назад"><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg></button>' + strip + '<button type="button" class="pl-arr" data-sarr="1" aria-label="Неделя вперёд"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button></div>';
    var h = head + strip + '<div class="pl-cal' + (calOpen ? ' open' : '') + '" id="plCal"><div class="pl-cal-in"><div class="pl-month">' + monthHTML() + '</div><div class="pd' + (calSel ? ' open' : '') + '" id="plDay"><div class="pd-in">' + (calSel ? dayPanel(calSel) : '') + '</div></div></div></div><div class="ag">';
    if (window.KCart) h += '<div class="pl-quick"><button type="button" class="kc-btn" data-a="week">✦ Меню на неделю</button><button type="button" class="kc-btn" data-a="cart">🛒 Корзина' + (KCart.count() ? ' · ' + KCart.count() : '') + '</button></div>';
    var keys = []; for (var j0 = 0; j0 < 14; j0++) keys.push(addDays(td, j0));
    Object.keys(plan).sort().forEach(function (k3) { if (k3 > keys[13] && (plan[k3] || []).filter(byId).length) keys.push(k3); });
    for (var j = 0; j < keys.length; j++) {
      var k2 = keys[j], items = all.filter(function (x) { return x.day === k2; });
      if (j === 14) h += '<h3 class="tg-sec-t ag-later">Дальше</h3>';
      h += '<section class="ag-day' + (items.length ? '' : ' empty') + '" id="ag-' + k2 + '" style="--i:' + Math.min(j, 8) + '"><header class="ag-h"' + (items.length ? '' : ' data-add="' + k2 + '" role="button" tabindex="0" aria-label="Добавить блюдо на ' + dayDate(k2) + '"') + '><b>' + dayName(k2) + '</b><span>' + (j > 1 ? '' : DOW_FULL[dParse(k2).getDay()].toLowerCase() + ', ') + dayDate(k2) + (j >= 14 ? ', ' + DOW_FULL[dParse(k2).getDay()].toLowerCase() : '') + '</span><button type="button" class="ag-add" data-add="' + k2 + '" aria-label="Добавить блюдо на ' + dayDate(k2) + '">' + PLUS + '</button></header>' +
        (items.length ? '<ul class="ag-list">' + items.map(function (x) { return taskRow(x, td); }).join('') + '</ul>' : '') + '</section>';
    }
    return h + '</div>';
  }
  /* месяц целиком: тап по дню — сразу планировать */
  var calOpen = false, calMonth = null, calSel = null, MON_N = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  function monthHTML() {
    var td = today(), m0 = dParse((calMonth || td.slice(0, 7)) + '-01'), all = tasksAll();
    var lead = (m0.getDay() + 6) % 7, dim = new Date(m0.getFullYear(), m0.getMonth() + 1, 0).getDate(), isCur = !calMonth || calMonth <= td.slice(0, 7);
    var h = '<div class="pm-head"><button type="button" class="pm-nav" data-cm="-1" aria-label="Предыдущий месяц"' + (isCur ? ' disabled' : '') + '><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg></button><b>' + MON_N[m0.getMonth()] + ' ' + m0.getFullYear() + '</b><button type="button" class="pm-nav" data-cm="1" aria-label="Следующий месяц"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button></div>';
    h += '<div class="pm-grid">' + ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(function (d) { return '<span class="pm-dow">' + d + '</span>'; }).join('');
    /* текущий месяц — с текущей недели, без прошедших */
    var d0 = 1; if (isCur) { var tdd = dParse(td).getDate(), wd = (dParse(td).getDay() + 6) % 7; d0 = Math.max(1, tdd - wd); lead = d0 === 1 ? lead : 0; }
    for (var i = 0; i < lead; i++) h += '<span></span>';
    for (var d = d0; d <= dim; d++) {
      var k = dKey(new Date(m0.getFullYear(), m0.getMonth(), d)), ids = (plan[k] || []).filter(byId);
      h += '<button type="button" class="pm-d' + (k === td ? ' today' : '') + (ids.length ? ' has' : '') + (k === calSel ? ' sel' : '') + '" data-cal="' + k + '"' + (k < td ? ' data-past="1"' : '') + ' aria-label="' + dayDate(k) + dayLabel(k, all) + '"><b>' + d + '</b>' + dayMarks(k, all) + '</button>';
    }
    return h + '</div><p class="pm-legend">' + Object.keys(TK_NAME).map(function (x) { return '<span>' + glyph(x) + TK_NAME[x] + '</span>'; }).join('') + '</p><p class="small pm-hint">Тапни день — что в нём и что поправить</p>';
  }
  /* количества в тексте шага: {id} и {id:сколько} */
  function fmtT(r, t) {
    var ing = {}; (r.ingredients || []).forEach(function (i) { ing[i.id] = i; });
    return esc(t).replace(/\{(\w+)(?::([\d.,]+))?\}/g, function (_, id, part) { var i = ing[id]; if (!i) return ''; var a = part != null ? part : i.amount; return '<b class="ts-q">' + esc(String(a).replace('.', ',') + ' ' + (i.unit || '')) + '</b>'; })
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  }
  function usedIngs(r, texts) {
    var ids = {}; texts.forEach(function (t) { (t.match(/\{(\w+)/g) || []).forEach(function (m) { ids[m.slice(1)] = 1; }); });
    return (r.ingredients || []).filter(function (i) { return ids[i.id] && !i.hidden; });
  }
  function meats(r) { return (r.ingredients || []).filter(function (i) { return !i.hidden && hasMeat({ ingredients: [i] }); }); }
  function ingLis(list) { return '<ul class="ts-ings">' + list.map(function (i) { return '<li><span>' + esc(i.name) + '</span><b>' + esc(i.amount ? String(i.amount).replace('.', ',') + ' ' + (i.unit || '') : i.unitText || '') + '</b></li>'; }).join('') + '</ul>'; }
  /* подробности задачи: что именно делать */
  function taskSheet(key) {
    var x = tasksAll().filter(function (t) { return t.key === key; })[0]; if (!x) return;
    var r = x.ids[0] ? byId(x.ids[0]) : null, dn = !!doneTasks[key], b = '';
    if (x.kind === 'marinade' && r) {
      var a = x.ahead || {}, texts = a.text ? [a.text] : stepItems(r).filter(function (i) { return /маринад|маринуй|замарин/i.test(i.t); }).map(function (i) { return i.t; });
      var used = usedIngs(r, texts);
      b += (used.length ? '<h4 class="ts-h">Понадобится</h4>' + ingLis(used) : '') + '<h4 class="ts-h">Что делать</h4><ol class="ts-steps">' + texts.map(function (t) { return '<li>' + fmtT(r, t) + '</li>'; }).join('') + '<li>Накрой плёнкой или крышкой и убери в холодильник.</li></ol>' +
        '<p class="small ts-tip">Вечером в рецепте этот шаг уже сделан — просто пропусти его.</p>';
    } else if (x.kind === 'cook' && r) {
      b += '<div class="ts-cook"><span class="tg-av m-' + esc(r.mode || 'self') + '" aria-hidden="true">' + emoji(r) + '</span><div><b>' + esc(r.title) + '</b><p class="small">' + esc(r.tagline || '') + '</p><p class="small">' + esc(String(r.totalTime || '').replace('≈ ', '')) + (r.dishes && r.dishes[0] ? ' · ≈ ' + r.dishes.reduce(function (a, d) { return a + (+d.kcal || 0); }, 0) + ' ккал на порцию' : '') + '</p></div></div>';
    } else if (x.kind === 'freeze' && r) {
      b += '<h4 class="ts-h">Что убрать</h4>' + ingLis(meats(r)) + '<h4 class="ts-h">Как</h4><ol class="ts-steps"><li>Сразу после магазина разложи по пакетам с застёжкой — <b>плоско, слоем 2–3 см</b>: так быстрее замёрзнет и потом разморозится.</li><li>Выдави воздух, подпиши маркером дату и блюдо.</li><li>В морозилку, на дно, пакеты плашмя.</li></ol>';
    } else if (x.kind === 'thaw' && r) {
      b += '<h4 class="ts-h">Что достать</h4>' + ingLis(meats(r)) + '<h4 class="ts-h">Как</h4><ol class="ts-steps"><li>Из морозилки — <b>в холодильник</b>, на нижнюю полку. Не на стол.</li><li>Поставь в миску или на тарелку — натечёт сок.</li><li>' + (/маринад/.test(x.sub) ? 'К вечеру, когда маринуешь, будет мягким: 12–24 часа.' : 'К ужину разморозится: 12–24 часа.') + '</li></ol>' +
        '<p class="small ts-tip">Забыл? Пакет закрытым в миску с холодной водой, меняй воду каждые 30 минут — 1–2 часа, и готово.</p>';
    }
    sheet('<div class="pk-head"><b>' + esc(x.title) + '</b><button type="button" class="ghost-btn" data-pk="x">Закрыть</button></div>' +
      '<p class="small pk-sub">' + esc(dayName(x.day)) + ', ' + dayDate(x.day) + (x.time ? ' в ' + x.time : '') + (r && x.kind !== 'cook' ? ' · «' + esc(r.title) + '»' : '') + '</p>' +
      '<div class="ts-when">' + (x.kind === 'cook' ? '' : '<label>День<input type="date" data-tw="day" value="' + x.day + '"></label>') + '<label>' + (x.kind === 'cook' ? 'Готовлю в этот день в' : 'Время') + '<input type="time" data-tw="time" value="' + esc(x.time || '12:00') + '"></label></div>' +
      '<p class="small ts-when-h">' + (x.kind === 'cook' ? 'Маринад и закупка сдвинутся вместе с готовкой. Уведомление придёт в новое время.' : 'Уведомление придёт в новое время.' + (x.moved ? ' <button type="button" class="lib-link" data-ts="reset">Вернуть как было</button>' : '')) + '</p>' + b +
      '<div class="pk-acts ts-acts">' + (x.kind === 'cook' ? '<button type="button" class="nav-btn primary" data-ts="open">Открыть рецепт</button>' : '<button type="button" class="nav-btn primary" data-ts="done">' + (dn ? 'Вернуть в дела' : 'Сделано') + '</button>' + (r ? '<button type="button" class="ghost-btn" data-ts="open">Рецепт</button>' : '')) + '</div>' +
      '<button type="button" class="ts-cal" data-ts="ics">' + CAL + '<span>Добавить в календарь iPhone</span></button>',
    function (e, m, shut) {
      var t = e.target.closest('[data-ts]'); if (!t) return;
      var a = t.getAttribute('data-ts');
      if (a === 'reset') { delete planOv.tasks[key]; savePlan(); shut(); return; }
      if (a === 'ics') { addToCal(x, r); return; }
      if (a === 'done') { setDone(key, !doneTasks[key]); shut(true); }
      else { shut(true); setTimeout(function () { go('detail', r.id); }, 200); }
    });
    var all = document.querySelectorAll('.pk-ov'), sm = all[all.length - 1];
    sm.querySelectorAll('[data-tw]').forEach(function (inp) { inp.addEventListener('change', function () {
      var tv = sm.querySelector('[data-tw=time]').value, dv = sm.querySelector('[data-tw=day]');
      if (x.kind === 'cook') { if (tv) planOv.cook[x.day] = tv; }
      else planOv.tasks[key] = { day: dv && dv.value ? dv.value : x.day, time: tv || x.time };
      savePlan(); if (window.kHaptic) window.kHaptic(6);
      var h = sm.querySelector('.ts-when-h'); if (h) { h.textContent = 'Сохранено — уведомление придёт в новое время.'; h.classList.add('ok'); }
    }); });
  }
  /* событие в календарь телефона: .ics — айфон сам предложит «Добавить» */
  function calMins(t) { t = String(t || ''); var h = /(\d+)\s*ч/.exec(t), m = /(\d+)\s*мин/.exec(t); return (h ? +h[1] * 60 : 0) + (m ? +m[1] : 0) || 60; }
  function vevent(x, r) {
    var p2 = function (n) { return String(n).padStart(2, '0'); }, d = dParse(x.day), tt = (x.time || '12:00').split(':');
    d.setHours(+tt[0] || 12, +tt[1] || 0, 0, 0);
    var dur = x.kind === 'cook' && r ? calMins(r.totalTime) : x.kind === 'shop' ? 60 : 15, e = new Date(d.getTime() + dur * 60000), n = new Date();
    function f(z) { return z.getFullYear() + p2(z.getMonth() + 1) + p2(z.getDate()) + 'T' + p2(z.getHours()) + p2(z.getMinutes()) + '00'; }
    function u(z) { return z.getUTCFullYear() + p2(z.getUTCMonth() + 1) + p2(z.getUTCDate()) + 'T' + p2(z.getUTCHours()) + p2(z.getUTCMinutes()) + '00Z'; }
    function q(t) { return String(t).replace(/[\;,]/g, function (c) { return '\\' + c; }).replace(/\n/g, '\\n'); }
    var title = x.kind === 'cook' && r ? 'Готовим: ' + r.title : x.title + (r && x.kind !== 'shop' ? ' — ' + r.title : '');
    var desc = (x.sub || '') + (x.kind === 'shop' ? '\nСписок покупок — в «Жарко», вкладка «План».' : '') + '\nЖарко';
    return ['BEGIN:VEVENT', 'UID:' + x.key.replace(/[^\w:-]/g, '') + '@kuking', 'DTSTAMP:' + u(n), 'DTSTART:' + f(d), 'DTEND:' + f(e), 'SUMMARY:' + q(title), 'DESCRIPTION:' + q(desc),
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + q(title), 'TRIGGER:-PT0M', 'END:VALARM', 'END:VEVENT'].join('\r\n');
  }
  /* в календарь телефона: .ics — айфон сам предложит «Добавить» (одно дело или все сразу) */
  function sendIcs(events, name) {
    var ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Kuking//RU', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Жарко'].concat(events, ['END:VCALENDAR']).join('\r\n');
    var url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    if (/iPhone|iPad|iPod/.test(navigator.userAgent)) location.href = url;
    else { var a = document.createElement('a'); a.href = url; a.download = name + '.ics'; document.body.appendChild(a); a.click(); a.remove(); }
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    if (window.kHaptic) window.kHaptic(8);
  }
  function addToCal(x, r) { sendIcs([vevent(x, r)], 'kuking-' + x.day); }
  function addAllToCal() {
    var td = today(), list = tasksAll().filter(function (x) { return x.day >= td && x.kind !== 'empty' && !doneTasks[x.key]; });
    if (!list.length) return false;
    sendIcs(list.map(function (x) { return vevent(x, x.ids && x.ids[0] ? byId(x.ids[0]) : null); }), 'kuking-plan');
    return list.length;
  }
  /* оценил блюдо из плана — значит приготовил: готовка и её дела (закупка, маринад, разморозка) отмечаются сами */
  function autoDone(id) {
    var td = today(), all = tasksAll().filter(function (x) { return x.kind === 'cook' && x.dish === id && !doneTasks[x.key]; });
    var mine = all.filter(function (x) { return x.day <= td; });
    if (!mine.length) mine = all.filter(function (x) { return x.day <= addDays(td, 2); }).slice(0, 1); // приготовил раньше плана
    if (!mine.length) return;
    mine.forEach(function (c) {
      doneTasks[c.key] = Date.now();
      tasksAll().forEach(function (x) { if (x.kind !== 'cook' && x.kind !== 'empty' && x.ids && x.ids.length === 1 && x.ids[0] === id && x.day <= c.day && !doneTasks[x.key]) doneTasks[x.key] = Date.now(); });
    });
    saveDone();
  }
  /* сделанное и купленное — в облако, чтобы не терялось между телефоном и приложением с экрана «Домой» */
  var shopHave = load('kuking:shopAll', {});
  Object.keys(localStorage).forEach(function (k) { if (k.indexOf('kuking:shopHave:') === 0) { var key = k.slice(16); if (!shopHave[key]) try { shopHave[key] = JSON.parse(localStorage.getItem(k)) || {}; } catch (e) {} } });
  var doneT = null;
  function saveDone() {
    lset('kuking:planDone', JSON.stringify(doneTasks)); lset('kuking:shopAll', JSON.stringify(shopHave)); syncTasks();
    clearTimeout(doneT); doneT = setTimeout(function () { if (db) db.collection('meta').doc('done').set({ done: doneTasks, shop: shopHave, updatedAt: new Date().toISOString() }).catch(function () {}); }, 600);
  }
  /* отметка «сделано» — на месте, без перерисовки */
  function setDone(k, on) {
    if (on) doneTasks[k] = Date.now(); else delete doneTasks[k];
    saveDone();
    var li = ov.querySelector('.ag-it[data-k="' + (window.CSS && CSS.escape ? CSS.escape(k) : k) + '"]');
    if (li) { li.classList.toggle('done', on); var c = li.querySelector('.ag-chk'); if (c) { c.classList.toggle('on', on); c.setAttribute('aria-checked', String(on)); } }
    if (on && window.kHaptic) window.kHaptic(10);
  }
  /* перерисовать план плавно: новые строки въезжают, старые на месте */
  function planRefresh() {
    var before = {}; ov.querySelectorAll('.ag-it[data-k]').forEach(function (li) { before[li.getAttribute('data-k')] = 1; });
    keepY(render);
    if (view === 'plan') ov.querySelectorAll('.ag-it[data-k]').forEach(function (li) { if (!before[li.getAttribute('data-k')]) li.classList.add('new'); });
  }
  /* что сегодня — карточка над списком рецептов */
  function todayCard() {
    if (!planIntro) return '';
    /* прошедшее сегодня не показываем: готовка — через 1,5 ч после старта, остальное — через 30 мин. Тогда висит следующее по плану */
    var td = today(), nd = new Date(), now = nd.getHours() * 60 + nd.getMinutes();
    function past(x) { if (x.day !== td || !x.time) return false; var m = /^(\d{1,2}):(\d{2})/.exec(x.time); return m && now > +m[1] * 60 + +m[2] + (x.kind === 'cook' ? 90 : 30); }
    var list = tasksAll().filter(function (x) { return x.day >= td && x.kind !== 'empty' && !doneTasks[x.key] && !past(x); }), day = list.length ? list[0].day : null;
    var all = list.filter(function (x) { return x.day === day; });
    if (!all.length) return '';
    var lab = day === td ? (tasksAll().some(function (x) { return x.day === td && past(x); }) ? 'Дальше сегодня' : 'Сегодня по плану') : day === addDays(td, 1) ? 'Завтра по плану' : dayName(day) + ', ' + dayDate(day);
    var still = tdSeen; tdSeen = true;
    return '<button type="button" class="td-card' + (still ? ' still' : '') + '" data-a="toPlan"><span class="td-k">' + esc(lab) + '</span>' + all.slice(0, 4).map(function (x) {
      return '<span class="td-row"><span class="td-time">' + esc(x.time || '') + '</span>' + tIco(x.kind) + '<b class="td-t">' + esc(x.title) + '</b></span>';
    }).join('') + (all.length > 4 ? '<span class="td-more">и ещё ' + (all.length - 4) + '</span>' : '') + '</button>';
  }
  function sheet(html, onClick, guard) {
    var m = document.createElement('div'); m.className = 'pk-ov'; m.setAttribute('role', 'dialog');
    m.innerHTML = '<div class="pk-sheet"><span class="set-grab" aria-hidden="true"></span>' + html + '</div>';
    document.body.appendChild(m); requestAnimationFrame(function () { m.classList.add('on'); });
    function shut(quiet) { m.classList.remove('on'); m.querySelector('.pk-sheet').style.transform = ''; setTimeout(function () { m.remove(); }, 320); if (!quiet) planRefresh(); }
    function tryShut(how) { if (guard && guard(shut, how) === false) { m.querySelector('.pk-sheet').style.transform = ''; return; } shut(); }
    dragDown(m.querySelector('.pk-sheet'), function () { tryShut('drag'); });
    m.addEventListener('click', function (e) { if (e.target === m) return tryShut('out'); if (e.target.closest('[data-pk=x]')) return tryShut('done'); onClick(e, m, shut); });
    return m;
  }
  function planPicker(day) {
    if (document.querySelector('.pk-ov')) return;
    var list = R.filter(function (r) { return !isHid(r.id); }).slice().reverse();
    sheet('<div class="pk-head"><b>' + dayName(day) + ', ' + dayDate(day) + '</b><button type="button" class="ghost-btn" data-pk="x">Готово</button></div>' +
      (list.length ? '<ul class="tg-list tg-group">' + list.map(function (r) {
        var on = (plan[day] || []).indexOf(r.id) >= 0;
        return '<li class="tg-li"><button type="button" class="tg-row pk-row' + (on ? ' on' : '') + '" data-pk="' + esc(r.id) + '" aria-pressed="' + on + '"><span class="tg-av m-' + esc(r.mode || 'self') + '" aria-hidden="true">' + emoji(r) + '</span>' +
          '<span class="tg-body"><span class="tg-l1"><b class="tg-name">' + esc(r.title) + '</b><small class="tg-time">' + esc(String(r.totalTime || '').replace('≈ ', '')) + '</small></span><span class="tg-l2"><span class="tg-sub">' + esc(r.tagline || '') + '</span></span></span>' +
          '<span class="chk-box" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 12.5l4 4 8-9"/></svg></span></button></li>';
      }).join('') + '</ul>' : '<p class="small">Книга пустая — сначала создай рецепт.</p>'),
    function (e) {
      var b = e.target.closest('[data-pk]'); if (!b) return;
      var id = b.getAttribute('data-pk'), arr = plan[day] = plan[day] || [], i = arr.indexOf(id);
      if (i >= 0) arr.splice(i, 1); else arr.push(id);
      b.classList.toggle('on', i < 0); b.setAttribute('aria-pressed', String(i < 0)); savePlan();
    });
  }
  /* список покупок: всё по блюдам закупки, одинаковое складываем */
  function shopList(key) {
    var x = tasksAll().filter(function (t) { return t.key === key; })[0]; if (!x) return;
    var sum = {}, order = [];
    x.ids.forEach(function (id) { ((byId(id) || {}).ingredients || []).forEach(function (i) {
      if (!i || !i.name) return; var k = i.name.toLowerCase().replace(/\s*\(.*?\)\s*/g, '').trim() + '|' + (i.unit || '');
      if (!sum[k]) { sum[k] = { name: i.name.replace(/\s*\(.*?\)\s*/g, ' ').trim(), unit: i.unit || '', amount: 0, text: i.unitText || '' }; order.push(k); }
      if (i.amount) sum[k].amount += +i.amount;
    }); });
    var have = shopHave[key] = shopHave[key] || {};
    var rows = order.map(function (k) { var v = sum[k], q = v.amount ? (Math.round(v.amount * 10) / 10) + ' ' + v.unit : v.text;
      return '<li class="chk' + (have[k] ? ' on' : '') + '" data-sh="' + esc(k) + '" role="checkbox" aria-checked="' + !!have[k] + '" tabindex="0"><span class="chk-box" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 12.5l4 4 8-9"/></svg></span><span class="chk-name">' + esc(v.name) + '</span><span class="chk-am">' + esc(q) + '</span></li>'; });
    var txt = order.map(function (k) { var v = sum[k]; return '• ' + v.name + (v.amount ? ' — ' + Math.round(v.amount * 10) / 10 + ' ' + v.unit : v.text ? ' — ' + v.text : ''); }).join('\n');
    sheet('<div class="pk-head"><b>' + esc(x.title) + '</b><button type="button" class="ghost-btn" data-pk="x">Готово</button></div><p class="small pk-sub">' + esc(x.sub) + ' · ' + x.ids.map(function (id) { return '«' + esc(byId(id).title) + '»'; }).join(', ') + '</p>' +
      (window.KCart ? '<button type="button" class="nav-btn primary pk-cart" data-tocartall="1">🛒 Всю закупку — в корзину</button>' : '') +
      '<div class="pk-acts"><a class="nav-btn" href="https://t.me/share/url?url=' + encodeURIComponent(' ') + '&text=' + encodeURIComponent('Закупка:\n' + txt) + '" target="_blank" rel="noopener">Отправить в Telegram</a><button type="button" class="ghost-btn" data-copy="1">Скопировать</button></div>' +
      '<p class="small sh-prog" aria-live="polite">Куплено ' + order.filter(function (o) { return have[o]; }).length + ' из ' + order.length + '</p><ul class="chk-list">' + rows.join('') + '</ul><button type="button" class="ts-cal" data-ics="1">' + CAL + '<span>Закупку — в календарь iPhone</span></button>',
    function (e, m) {
      if (e.target.closest('[data-tocartall]')) { x.ids.forEach(function (id) { KCart.addRecipe(id); }); if (window.kHaptic) window.kHaptic(12); var pm = e.target.closest('.pk, .sheet, [role=dialog]'); var cl = m.querySelector('[data-pk=x]'); if (cl) cl.click(); setTimeout(function () { KCart.open('cart'); }, 320); return; }
      if (e.target.closest('[data-ics]')) { addToCal(x, null); return; }
      if (e.target.closest('[data-copy]')) { try { navigator.clipboard.writeText('Закупка:\n' + txt); e.target.textContent = 'Скопировано'; } catch (x2) {} return; }
      var li = e.target.closest('[data-sh]'); if (!li) return;
      var k = li.getAttribute('data-sh'); have[k] = !have[k]; if (!have[k]) delete have[k];
      li.classList.toggle('on', !!have[k]); li.setAttribute('aria-checked', String(!!have[k])); if (window.kHaptic) window.kHaptic(6);
      var got = order.filter(function (o) { return have[o]; }).length, pr = m.querySelector('.sh-prog'); if (pr) pr.textContent = 'Куплено ' + got + ' из ' + order.length;
      if (got === order.length && !doneTasks[key]) { doneTasks[key] = Date.now(); if (pr) pr.textContent = 'Всё куплено — закупка закрыта'; }
      else if (got < order.length && doneTasks[key]) delete doneTasks[key];
      saveDone();
    });
  }
  /* сразу на старте плана: включить уведомления? */
  function askPush(next) {
    var Soc = SOC(), ps = Soc.pushState ? Soc.pushState() : 'nope';
    if (ps === 'on' || ps === 'nope' || ps === 'denied') { next(); return; }
    var done = false;
    function go2() { if (done) return; done = true; setTimeout(next, 340); }
    sheet('<div class="ask-box"><svg class="ask-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg><h3>Включить уведомления?</h3>' +
      '<p class="small">Напомню про закупку, морозилку, маринад и готовку. Не чаще трёх раз в день, ночью молчу.</p>' +
      (ps === 'install' ? '<p class="small">Сначала поставь «Жарко» на экран «Домой» и открой оттуда — иначе айфон не даст.</p><button type="button" class="nav-btn primary" data-pk="x">Понятно</button>' :
        '<button type="button" class="nav-btn primary" data-pu="on">Включить</button><button type="button" class="nav-btn" data-pk="x">Позже</button>') + '<p class="small ps-h" id="puMsg"></p></div>',
      function (e, m, shut) {
        var b = e.target.closest('[data-pu]'); if (!b) return;
        b.classList.add('busy-c'); b.textContent = 'Включаю…';
        Soc.enablePush().then(function () { b.classList.remove('busy-c'); b.textContent = 'Включены'; if (window.kHaptic) window.kHaptic(10); setTimeout(function () { shut(true); go2(); }, 500); })
          .catch(function (x) { b.classList.remove('busy-c'); b.textContent = 'Включить'; m.querySelector('#puMsg').textContent = 'Не вышло: ' + (x && x.message || ''); });
      }, function () { go2(); return true; });
  }
  function planSettings(first) {
    var c = JSON.parse(JSON.stringify(cfg())), Soc = SOC();
    if (!c.empty) c.empty = 'on';
    function seg(name, opts, cur) { return '<div class="seg" role="radiogroup">' + opts.map(function (o) { return '<button type="button" role="radio" data-seg="' + name + '" data-v="' + o[0] + '" aria-checked="' + (String(cur) === String(o[0])) + '">' + o[1] + '</button>'; }).join('') + '</div>'; }
    var HINT = { frozen: 'Напомню убрать в морозилку после закупки и достать в холодильник вечером накануне.', fresh: 'Если мясо из морозилки — переключи, напомню про разморозку.' };
    function pushBlock() { var ps = Soc.pushState ? Soc.pushState() : 'nope';
      return ps === 'on' ? '<p class="ps-on">Включены</p>' : ps === 'install' ? '<p class="small ps-h">Поставь «Жарко» на экран «Домой» и открой оттуда — тогда включатся.</p>' : ps === 'denied' ? '<p class="small ps-h">Запрещены в настройках iPhone → Уведомления → Жарко.</p>' : ps === 'nope' ? '<p class="small ps-h">Этот браузер не умеет.</p>' : '<button type="button" class="nav-btn" data-pushon="1">Включить уведомления</button>'; }
    var m = sheet('<div class="pk-head"><b>' + (first ? 'Как ты закупаешься?' : 'Настройки плана') + '</b><button type="button" class="ghost-btn" data-pk="x">Готово</button></div>' +
      '<div class="ps"><label class="ps-l">Закупка</label>' + seg('shop', [['week', 'Раз в неделю'], ['day', 'В день готовки'], ['delivery', 'Доставка']], c.shop) +
      '<div class="ps-col' + (c.shop === 'week' ? ' open' : '') + '" id="psWeek"><div class="ps-col-in"><label class="ps-l">День и время закупки</label>' + seg('shopDay', [[1, 'Пн'], [2, 'Вт'], [3, 'Ср'], [4, 'Чт'], [5, 'Пт'], [6, 'Сб'], [0, 'Вс']], c.shopDay) + '<input class="ps-time" type="time" data-f="shopTime" value="' + esc(c.shopTime) + '"></div></div>' +
      '<label class="ps-l">Мясо и рыбу</label>' + seg('meat', [['fresh', 'Беру свежее'], ['frozen', 'Храню в морозилке']], c.meat) +
      '<p class="small ps-h" id="psMeatH">' + HINT[c.meat] + '</p>' +
      '<label class="ps-l">Обычно готовлю в</label><input class="ps-time" type="time" data-f="cook" value="' + esc(c.cook) + '">' +
      '<label class="ps-l">Если на завтра ничего не выбрано</label>' + seg('empty', [['on', 'Напомнить накануне'], ['off', 'Не надо']], c.empty) + '<p class="small ps-h">Придёт накануне в то время, когда ты обычно готовишь.</p>' +
      '<label class="ps-l">Уведомления</label><div id="psPush">' + pushBlock() + '</div>' +
      '<label class="ps-l">Календарь iPhone</label><button type="button" class="nav-btn ps-ics" data-allics="1">' + CAL + 'Все дела плана — в календарь</button><p class="small ps-h">Закупки, морозилка, маринады и готовка разом, с напоминаниями.</p>' +
      '<button type="button" class="nav-btn primary ps-save" data-psave="1">Сохранить</button></div>',
    function (e, mm, shut) {
      var sb = e.target.closest('[data-seg]');
      if (sb) { var n = sb.getAttribute('data-seg'), v = sb.getAttribute('data-v'); c[n] = n === 'shopDay' ? +v : v;
        sb.parentNode.querySelectorAll('[data-seg]').forEach(function (x) { x.setAttribute('aria-checked', String(x === sb)); });
        if (window.kHaptic) window.kHaptic(6);
        if (n === 'shop') mm.querySelector('#psWeek').classList.toggle('open', v === 'week');
        if (n === 'meat') { var h = mm.querySelector('#psMeatH'); h.classList.add('swap'); setTimeout(function () { h.textContent = HINT[v]; h.classList.remove('swap'); }, 160); }
        return; }
      if (e.target.closest('[data-pushon]')) { var pb = e.target.closest('[data-pushon]'); pb.classList.add('busy-c'); pb.textContent = 'Включаю…'; (Soc.enablePush ? Soc.enablePush() : Promise.reject()).then(function () { mm.querySelector('#psPush').innerHTML = pushBlock(); }).catch(function (x) { pb.classList.remove('busy-c'); pb.textContent = 'Не вышло: ' + (x && x.message || ''); }); return; }
      if (e.target.closest('[data-allics]')) { var n = addAllToCal(); if (!n) e.target.closest('[data-allics]').lastChild.textContent = 'В плане пока пусто'; return; }
      if (e.target.closest('[data-ask]')) { var w = e.target.closest('[data-ask]').getAttribute('data-ask'); if (w === 'save') commit(); mm.querySelector('.ps-ask').remove(); if (w !== 'back') shut(); return; }
      if (e.target.closest('[data-psave]')) { commit(); shut(); }
    }, function (shut, how) {
      /* «Готово» — сохраняем; смахнул или тапнул мимо с изменениями — спрашиваем */
      if (how === 'done' || first) { commit(); return true; }
      if (!changed()) return true;
      if (m.querySelector('.ps-ask')) return false;
      var a = document.createElement('div'); a.className = 'ps-ask'; a.innerHTML = '<div class="ask-box"><h3>Сохранить изменения?</h3><p class="small">Ты поменял настройки плана.</p><button type="button" class="nav-btn primary" data-ask="save">Сохранить</button><button type="button" class="nav-btn" data-ask="drop">Не сохранять</button><button type="button" class="ghost-btn" data-ask="back">Вернуться к настройкам</button></div>';
      m.querySelector('.pk-sheet').appendChild(a); a.scrollIntoView({ block: 'end', behavior: 'smooth' }); if (window.kHaptic) window.kHaptic(8);
      return false;
    });
    var start = JSON.stringify(cfg());
    function read() { m.querySelectorAll('[data-f]').forEach(function (i) { c[i.getAttribute('data-f')] = i.value || c[i.getAttribute('data-f')]; }); }
    function changed() { read(); return JSON.stringify(c) !== start; }
    function commit() { read(); planCfg = c; savePlan(); }
  }

  function chev() { return '<svg class="pf-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>'; }
  function pfRow(a, ico, label, sub) { return '<button type="button" class="pf-row" data-pf="' + a + '">' + icoSq(ico) + '<span class="pf-t">' + label + '</span>' + (sub ? '<span class="pf-sub">' + sub + '</span>' : '') + chev() + '</button>'; }
  function profileHTML() {
    var S = window.KukingStore, Soc = SOC(), me = Soc.me && Soc.me(), u = S && S.user && S.user();
    var inf = me && Soc.info ? (Soc.info(me.id) || {}) : {}, name = inf.name || (me && me.nick) || (u ? u.email : 'Гость');
    var n = Soc.badge ? Soc.badge() : 0, sk = +lget('kuking:skill') || 0;
    var h = bigHead('Профиль');
    h += '<button type="button" class="pf-card" data-pf="' + (u ? 'anketa' : 'login') + '"><span class="pf-av' + (me && me.is_admin ? ' chef' : '') + '" aria-hidden="true">' + (inf.avatar ? '<img src="' + esc(inf.avatar) + '" alt="">' : esc(String(name).charAt(0).toUpperCase())) + (me && me.is_admin ? CROWN : '') + '</span>' +
      '<span class="pf-who"><b>' + esc(name) + '</b>' + (me ? '<span class="pf-nick">@' + esc(me.nick) + (me.is_admin ? ' <span class="soc-chef adm">' + CROWN + 'админ</span>' : ' <span class="soc-chef">шеф</span>') + '</span>' : '<span class="pf-nick">' + (u ? 'заполни анкету' : 'войди, чтобы дружить и хранить рецепты') + '</span>') + '</span>' + chev() + '</button>';
    if (u) {
      var tg = window.KBody && window.KBody.targets && window.KBody.targets(), bg = window.KBody ? window.KBody.get() : {};
      var goal = { cut: 'сушка', keep: 'держу форму', bulk: 'масса' }[bg.goal] || '';
      h += '<div class="pf-group">' + pfRow('cook', 'cook', 'Готовка', sk ? ['ур. ' + sk + '/10', { r1: '1–2 р/нед', r3: '3–4 р/нед', r5: '5–6 р/нед', r7: 'каждый день' }[bg.freq]].filter(Boolean).join(' · ') : 'настрой') +
        pfRow('food', 'food', 'Питание', tg ? [goal, tg.day.kcal + ' ккал'].filter(Boolean).join(' · ') : 'не заполнено') + '</div>';
    }
    if (window.KPrefs) { var kp = KPrefs.get();
      h += '<div class="pf-group">' + pfRow('prefs', 'prefs', 'Предпочтения', [KPrefs.SPICE[kp.spice].toLowerCase(), kp.cuisines.length ? kp.cuisines.length + ' кухн.' : ''].filter(Boolean).join(' · ')) +
        pfRow('kitchen', 'kitchen', 'Моя техника', kp.equip ? kp.equip.length + ' отмечено' : 'не отмечена') + pfRow('notif', 'notif', 'Уведомления') + '</div>';
    }
    if (u) {
      if (Soc.enabled) h += '<div class="pf-group">' + pfRow('friends', 'friends', 'Друзья', n ? '<em class="pf-badge">' + n + '</em>' : '') + '</div>';
    } else h += '<div class="pf-group">' + pfRow('login', 'login', 'Войти или зарегистрироваться') + '</div>';
    h += '<div class="pf-group">' + pfRow('ai', 'ai', 'Нейросеть', window.KukingAI && window.KukingAI.ready() ? 'подключена' : 'не подключена') +
      pfRow('look', 'look', 'Оформление') + pfRow('account', 'account', 'Аккаунт') + pfRow('install', 'install', 'Установка на iPhone') + pfRow('quiz', 'quiz', 'Знакомство заново') + '</div>' +
      '<div class="pf-group">' + pfRow('feedback', 'feedback', 'Обратная связь', 'Telegram') + pfRow('about', 'about', 'О приложении', esc((window.KUKING_CONFIG || {}).version || '')) + '</div>';

    return h;
  }
  function emptyHTML() {
    var S = window.KukingStore, signed = S && S.user && S.user();
    return '<div class="tg-empty"><div class="tg-empty-pic" aria-hidden="true"><svg viewBox="0 0 64 64"><path d="M14 34h36c0 10-8 18-18 18s-18-8-18-18z"/><path d="M12 32h40"/><path d="M26 26c-3-4 3-6 0-11M32 25c-3-4 3-6 0-11M38 26c-3-4 3-6 0-11"/></svg></div><h3>Книга пустая — и это норм</h3>' +
      '<p class="small">Тут будут твои рецепты: придумай с нейросетью, напиши сам или возьми у друзей.</p>' +
      '<button type="button" class="nav-btn primary" data-a="create">Создать первый рецепт</button>' +
      (S && S.enabled && !signed ? '<button type="button" class="ghost-btn" data-a="login">Войти в аккаунт</button>' : '') + '</div>';
  }
  function scoreHTML(id) {
    var sc = rv(id).score, ch = chefOf(id);
    if (!sc && !ch) return '';
    return '<span class="tg-score">' + (ch ? '<span class="tg-chef ' + scCls(ch) + '" title="Оценка админа">' + CROWN + ch + '</span>' : '') +
      (sc ? '<span class="tg-mine ' + scCls(sc) + '" title="Твоя оценка">' + sc + '<small>/10</small></span>' : '') + '</span>';
  }
  function row(r) {
    var on = active && r.id === active.id, sc = rv(r.id).score;
    return '<li class="tg-li" data-id="' + esc(r.id) + '"><div class="tg-swipe"><button type="button" class="sw-pin" data-sw="pin" tabindex="-1">' + (isPin(r.id) ? 'Открепить' : 'Закрепить') + '</button><button type="button" class="sw-del" data-sw="del" tabindex="-1">Удалить</button></div>' +
      '<button type="button" class="tg-row' + (on ? ' on' : '') + (isPin(r.id) ? ' pinned' : '') + '" data-open="' + esc(r.id) + '" aria-description="Смахни вправо — закрепить, влево — удалить, удерживай — меню">' +
      '<span class="tg-av m-' + esc(r.mode || 'self') + '" aria-hidden="true">' + emoji(r) + '</span>' +
      '<span class="tg-body"><span class="tg-l1"><b class="tg-name">' + esc(r.title) + '</b>' + (isPin(r.id) ? '<svg class="tg-pinico" viewBox="0 0 24 24" aria-label="Закреплён"><path d="M15 3l6 6-3 1-4 4 1 5-2 2-4-4-5 5-1-1 5-5-4-4 2-2 5 1 4-4z"/></svg>' : '') + '<small class="tg-time">' + esc(String(r.totalTime || '').replace('≈ ', '')) + '</small></span>' +
      '<span class="tg-l2"><span class="tg-sub">' + (MODE_SHORT[r.mode] ? '<span class="tg-mode m-' + r.mode + '">' + MODE_SHORT[r.mode] + '</span>' : '') + esc(r.tagline || '') + '</span>' +
      (scoreHTML(r.id) || (!sc ? '<span class="tg-new" title="Ещё не готовил" aria-label="Новый"></span>' : '')) + '</span>' + (window.KCat ? KCat.rowBadges(r) : '') + '</span></button></li>';
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
    var tot = (r.dishes || []).reduce(function (t, d) { if (d.kcal) { t.k += +d.kcal || 0; t.p += +d.p || 0; t.f += +d.f || 0; t.c += +d.c || 0; t.n++; } return t; }, { k: 0, p: 0, f: 0, c: 0, n: 0 });
    var dpk = window.KDish ? KDish.heroKey(r) : '', dps = window.KDish ? KDish.heroSrc(r) : null;
    if (window.KDish) KDish.auto(r);
    var dst = window.KDish ? KDish.state(r) : 'none';
    var h = '<div class="tg-heroW m-' + esc(r.mode || 'self') + (dps ? ' has-ph' : '') + (dst === 'busy' ? ' ph-wait' : '') + '" data-dp-hero="' + esc(dpk) + '"' + (dps ? ' style="--ph:url(&quot;' + dps + '&quot;)"' : '') + '><button type="button" class="tg-backf" data-a="back" aria-label="Назад к рецептам"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>' +
      '<span class="ph-shim" aria-hidden="true"></span><span class="ph-note">Рисую фото блюда…</span>' +
      (window.KDish && KDish.can() ? '<button type="button" class="dp-re hero-re" data-dp="redo" data-dpk="' + esc(dpk) + '">' + (dps ? 'Другое фото' : 'Нарисовать фото') + '</button>' : '') + '</div>';
    h += '<div class="tg-dt"><h2 class="tg-title">' + esc(r.title) + '</h2>' +
      '<p class="tg-meta">' + [esc(String(r.totalTime || '').replace('≈ ', '')), MODE_NAME[r.mode] ? MODE_NAME[r.mode].toLowerCase() : '', r.baseGuests ? r.baseGuests + ' порц.' : '', r.ai ? 'от нейросети' : r.manual ? 'твой рецепт' : ''].filter(Boolean).join(' · ') + '</p>' +
      (tot.n ? '<div class="tg-kbju"><span><b>' + tot.k + '</b> ккал</span><span>Б <b>' + tot.p + '</b></span><span>Ж <b>' + tot.f + '</b></span><span>У <b>' + tot.c + '</b></span></div>' : '') +
      (r.tagline ? '<p class="tg-lede">' + esc(r.tagline) + '</p>' : '') + '</div>';
    if (window.KMeta) {
      h += '<section class="tg-sec">' + KMeta.html(r) + '</section>';
      if (r.ai && !KMeta.get(r).tagged) KMeta.aiTag(r).then(function (m) { if (m && !ov.hidden && !typing()) keepY(render); });
    }
    if ((r.dishes || []).length > 1) h += '<section class="tg-sec"><h3 class="tg-sec-h">На тарелке</h3><ul class="tg-dishes">' + r.dishes.map(function (d) {
      return '<li><b>' + esc(d.name) + '</b>' + (d.kcal ? '<small>' + d.kcal + ' ккал · Б ' + d.p + ' · Ж ' + d.f + ' · У ' + d.c + '</small>' : '') + '</li>';
    }).join('') + '</ul></section>';
    if (ch && adm) h += '<section class="tg-sec tg-chefrow">' + CROWN + '<span>Админ <b>' + esc(adm.nick) + '</b> поставил</span><b class="lib-score ' + scCls(ch) + '">' + ch + '<small>/10</small></b></section>';
    h += rateBlock(r);
    var thr = SOC().thread(r.id, reviews[r.id]); if (thr) h += '<section class="tg-sec">' + thr + '</section>';
    if (window.KHub) { h += KHub.recipeHTML(r); KHub.load(r.id, function () { if (!ov.hidden && view === 'detail' && !typing()) keepY(render); }); }
    var hasAir = window.KPrefs ? KPrefs.has('Аэрогриль') : true;
    h += '<div class="tg-more">' + (window.Fresh && window.KukingAI && KukingAI.ready() && hasAir && !/аэрогрил/i.test(r.title) ? '<button type="button" class="ghost-btn" data-a="rwair" data-id="' + esc(r.id) + '">♨️ Переделать под аэрогриль</button>' : '') + (window.KCart ? '<button type="button" class="ghost-btn' + (KCart.hasRecipe(r.id) ? ' on' : '') + '" data-a="tocart" data-id="' + esc(r.id) + '">🛒 ' + (KCart.hasRecipe(r.id) ? 'В корзине — убрать' : 'В корзину') + '</button><button type="button" class="ghost-btn" data-a="left" data-id="' + esc(r.id) + '">🥡 Осталось после готовки</button>' : '') + (window.KCat ? '<button type="button" class="ghost-btn" data-a="tocol" data-id="' + esc(r.id) + '">📁 ' + (KCat.inCols(r.id).length ? esc(KCat.inCols(r.id).join(', ')) : 'В коллекцию') + '</button>' : '') + (r.manual ? '<button type="button" class="ghost-btn" data-a="editme" data-id="' + esc(r.id) + '">Изменить</button>' : '') +
      (r.ai && !r.manual ? '<button type="button" class="ghost-btn" data-a="upg" data-id="' + esc(r.id) + '">' + (r.upgraded ? 'Обновить ещё раз' : 'Обновить под новые правила') + '</button>' : '') +
      '<button type="button" class="ghost-btn tg-del" data-id="' + esc(r.id) + '">Убрать из книги</button></div>';
    h += '<div class="tg-cta"><button type="button" class="nav-btn primary lib-go" data-id="' + esc(r.id) + '">' + (on ? 'Продолжить готовку →' : 'Готовим это') + '</button></div>';
    return h;
  }

  /* создание */
  var idea = '', ideaMode = 'self', impText = '', impLink = '', impHelp = false;
  function createHTML() {
    var ai = window.KukingAI && window.KukingAI.ready();
    var h = '<header class="tg-head tg-head-sub"><button type="button" class="tg-back" data-a="back"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>Рецепты</button><span class="tg-head-t">Новый рецепт</span></header>';
    h += '<section class="tg-sec tg-make"><h3 class="tg-mk-h">' + icoSq('spark') + 'Нейросеть по твоей идее</h3>' +
      '<form id="libIdea" class="tg-idea"><input id="libIdeaIn" type="text" maxlength="120" placeholder="Например: сочная шаурма как в Стамбуле" value="' + esc(idea) + '" aria-label="Идея блюда" required>' +
      '<div class="tg-chips">' + [['self', 'Для себя'], ['romance', 'Романтика'], ['friends', 'Друзья']].map(function (m) { return '<button type="button" class="tg-chip m-' + m[0] + '" data-im="' + m[0] + '" aria-pressed="' + (ideaMode === m[0]) + '">' + m[1] + '</button>'; }).join('') + '</div>' +
      '<button type="submit" class="nav-btn primary">Сгенерировать</button></form>' +
      (ai ? '' : '<p class="small">Нужен ключ к нейросети — <button type="button" class="lib-link" data-a="setup">подключить</button>.</p>') + '</section>';
    h += '<section class="tg-sec tg-make"><h3 class="tg-mk-h">' + icoSq('imp') + 'Импорт рецепта</h3><p class="small">Вставьте текст из TikTok, Reels, YouTube, сайта или заметок — нейросеть переложит его в слайд-шоу под вашу технику и цель. Режим и порции — как выбрано выше.</p>' +
      '<form id="libImp" class="tg-imp"><textarea id="libImpT" rows="5" maxlength="7000" placeholder="Описание рецепта: продукты, граммовки, шаги…" aria-label="Текст рецепта">' + esc(impText) + '</textarea>' +
      '<input id="libImpL" type="url" inputmode="url" placeholder="Ссылка на источник — необязательно" value="' + esc(impLink) + '" aria-label="Ссылка">' +
      '<div class="tg-imp-r"><button type="button" class="nav-btn" data-a="imppaste">Вставить из буфера</button><button type="button" class="nav-btn" data-a="imphelp" aria-expanded="' + impHelp + '">Со скриншота</button></div>' +
      (impHelp ? '<ol class="small tg-imp-help"><li>Откройте скриншот в «Фото».</li><li>Удержите палец на тексте — iPhone выделит его.</li><li>«Выбрать все» → «Скопировать».</li><li>Вернитесь сюда и нажмите «Вставить из буфера».</li></ol>' : '') +
      '<button type="submit" class="nav-btn primary"' + (ai ? '' : ' disabled') + '>Переложить рецепт</button></form></section>';
    h += '<section class="tg-sec tg-make"><h3 class="tg-mk-h">' + icoSq('dice') + '10 идей под твой вкус</h3>' +
      (themesOpen ? themesBlock() : '<p class="small">Нейросеть посмотрит оценки, комменты и анкеты и предложит 10 блюд.</p><button type="button" class="nav-btn lib-themes">Показать идеи</button>') + '</section>';
    h += '<section class="tg-sec tg-make"><h3 class="tg-mk-h">' + icoSq('pen') + 'Написать самому</h3><p class="small">Продукты, посуда, шаги с таймерами и подача — соберётся такое же слайд-шоу.</p>' +
      '<button type="button" class="nav-btn" data-a="editnew">Открыть редактор</button></section>';
    return h;
  }
  var themesOpen = false, themesLoading = '', themesErr = '', themesCtl = null;
  function loadThemes() {
    if (themesLoading) return;
    themesLoading = '…'; themesErr = ''; render();
    themesCtl = new AbortController();
    var sub = { set textContent(v) { themesLoading = v; var n = ov.querySelector('.th-cnt'); if (n) n.textContent = v; } };
    var stopT = function () {}; setTimeout(function () { stopT = window.KFun ? window.KFun.ticker(ov.querySelector('.th-tick'), 'ideas', 2200) : stopT; }, 0);
    window.Fresh.refresh(freshCtx, { sub: sub, signal: themesCtl.signal }).then(function () { stopT(); themesLoading = ''; render(); })
      .catch(function (e) { stopT(); themesLoading = ''; themesErr = e && e.code === 'cancelled' ? '' : (window.KukingAIMsg ? window.KukingAIMsg(e) : 'Не вышло обновить идеи') + '.'; render(); });
  }
  function themesBlock() {
    if (themesLoading) return '<div class="ld-bowl" aria-hidden="true"><i></i><i></i><i></i></div><p class="th-note th-tick">Подбираю 10 блюд под твой вкус…</p><p class="small th-note th-cnt">' + esc(themesLoading === '…' ? '' : themesLoading) + '</p><div class="skel"><i class="sk-row"></i><i class="sk-row"></i><i class="sk-row"></i></div>';
    if (!window.Fresh.themes.length) return '<p class="small th-note">' + esc(themesErr || 'Идей пока нет.') + '</p><button type="button" class="nav-btn lib-themes-re">Ещё раз</button>';
    return '<ul class="th-list">' + window.Fresh.themes.map(function (t, i) {
      return '<li><button type="button" class="th-go" data-i="' + i + '"><b>' + esc(t[0]) + '</b><span>' + esc(t[1]) + '</span>' + (t[2] ? '<em>' + esc(t[2]) + '</em>' : '') + '</button></li>';
    }).join('') + '</ul>';
  }

  /* редактор */
  var draft = null, edSnap = null;
  function blankDraft() { return { title: '', mode: 'self', totalTime: '', baseGuests: 2, ing: [{ n: '', a: '', u: 'г' }, { n: '', a: '', u: 'г' }, { n: '', a: '', u: 'г' }], tools: [''], steps: [{ t: '', m: '' }], serve: '' }; }
  var UNITS = ['г', 'кг', 'мл', 'л', 'шт', 'ч.л.', 'ст.л.', 'зубч.', 'пучок', 'щепотка', 'по вкусу'];
  function editHTML() {
    var d = draft; if (!edSnap) edSnap = JSON.stringify(d);
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
      draft = null; edSnap = null; detailId = r.id; go('detail', r.id);
    } catch (e) { ov.querySelector('#edMsg').textContent = 'Не собралось: ' + (e && e.message); }
  }

  /* ---------- корзина ---------- */
  function purge(ids) {
    ids.forEach(function (id) {
      kill(id); dropActive(id);
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
  function on(s, f) { $$(s, function (b) { if (b.closest('.pd')) return; b.addEventListener('click', function (e) { f(b, e); }); }); }
  /* тап по рецепту: отклик, щелчок, потом переход */
  function openTap(b) {
    if (Date.now() < noClickUntil) return;
    var oli = b.closest('.tg-li.sw-open'); if (oli) { oli._reset(); return; }
    if (ov.querySelector('.tg-li.sw-open')) { closeOthers(null); return; }
    noClickUntil = Date.now() + 400;
    if (window.kHaptic) window.kHaptic(8);
    b.classList.add('tap');
    go('detail', b.getAttribute('data-open'));
  }
  /* что в выбранном дне: блюда (рецепт, перенести, убрать) и дела */
  function dayPanel(k) {
    var all = tasksAll(), ids = (plan[k] || []).filter(byId), tk = all.filter(function (x) { return x.day === k && x.kind !== 'cook' && x.kind !== 'empty'; });
    var h = '<div class="pd-head"><b>' + esc(dayName(k)) + '</b><span>' + dayDate(k) + '</span></div>';
    if (!ids.length && !tk.length) h += '<p class="small pd-empty">Пусто. Добавь блюдо — план сам распишет закупку и подготовку.</p>';
    if (ids.length) h += '<ul class="pd-list">' + ids.map(function (id) { var r = byId(id);
      return '<li><button type="button" class="pd-dish" data-open="' + esc(id) + '"><span class="tg-av m-' + esc(r.mode || 'self') + '" aria-hidden="true">' + emoji(r) + '</span><span class="ag-t"><b>' + esc(r.title) + '</b><small>' + hm(cfg().cook) + ' · ' + esc(String(r.totalTime || '').replace('≈ ', '')) + '</small></span></button>' +
        '<span class="pd-acts"><button type="button" class="pd-a" data-move="' + esc(id) + '" data-pday="' + k + '" aria-label="Перенести на другой день"><svg viewBox="0 0 24 24"><path d="M4 12h14M13 6l6 6-6 6"/></svg></button><button type="button" class="pd-a danger" data-unplan="' + esc(id) + '" data-pday="' + k + '" aria-label="Убрать из плана"><svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17"/></svg></button></span></li>'; }).join('') + '</ul>';
    if (tk.length) h += '<ul class="pd-tasks">' + tk.map(function (x) { return '<li><button type="button" class="pd-task" data-task="' + esc(x.key) + '">' + glyph(x.kind) + '<span>' + esc(x.time || '') + '</span><b>' + esc(x.title) + '</b></button></li>'; }).join('') + '</ul>';
    return h + (k >= today() ? '<div class="pd-foot"><button type="button" class="nav-btn pd-add" data-add="' + k + '">+ Добавить блюдо</button>' + (ids.length || tk.length ? '<button type="button" class="nav-btn pd-ics" data-dayics="' + k + '" aria-label="Весь день в календарь iPhone">' + CAL + '</button>' : '') + '</div>' : '');
  }
  function showDay(k) {
    var p = ov.querySelector('#plDay'); if (!p) return;
    var inn = p.querySelector('.pd-in');
    if (!k) { p.classList.remove('open'); return; }
    inn.innerHTML = dayPanel(k); p.classList.add('open'); bindDay(p);
    inn.classList.remove('swap'); void inn.offsetWidth; inn.classList.add('swap');
  }
  function bindDay(root) {
    root.querySelectorAll('[data-open]').forEach(function (b) { b.onclick = function () { openTap(b); }; });
    root.querySelectorAll('[data-task]').forEach(function (b) { b.onclick = function () { taskSheet(b.getAttribute('data-task')); }; });
    root.querySelectorAll('[data-add]').forEach(function (b) { b.onclick = function () { planPicker(b.getAttribute('data-add')); }; });
    root.querySelectorAll('[data-dayics]').forEach(function (b) { b.onclick = function () { var k = b.getAttribute('data-dayics');
      sendIcs(tasksAll().filter(function (x) { return x.day === k && x.kind !== 'empty'; }).map(function (x) { return vevent(x, x.ids && x.ids[0] ? byId(x.ids[0]) : null); }), 'kuking-' + k); }; });
    root.querySelectorAll('[data-move]').forEach(function (b) { b.onclick = function () { moveSheet(b.getAttribute('data-move'), b.getAttribute('data-pday')); }; });
    root.querySelectorAll('[data-unplan]').forEach(function (b) { b.onclick = function () { var id = b.getAttribute('data-unplan'), d = b.getAttribute('data-pday'), li = b.closest('li');
      plan[d] = (plan[d] || []).filter(function (x) { return x !== id; }); savePlan(); if (window.kHaptic) window.kHaptic(10);
      li.style.height = li.offsetHeight + 'px'; void li.offsetHeight; li.classList.add('gone'); li.style.height = '0px'; setTimeout(planRefresh, 300); }; });
  }
  /* перенести блюдо на другой день */
  function moveSheet(id, from) {
    var td = today(), r = byId(id), days = '';
    for (var i = 0; i < 21; i++) { var k = addDays(td, i); if (k === from) continue; var n = (plan[k] || []).filter(byId).length;
      days += '<button type="button" class="mv-d" data-to="' + k + '"><span>' + DOW[dParse(k).getDay()] + '</span><b>' + dParse(k).getDate() + '</b><small>' + (n ? n + ' бл.' : '') + '</small></button>'; }
    sheet('<div class="pk-head"><b>Перенести</b><button type="button" class="ghost-btn" data-pk="x">Отмена</button></div><p class="small pk-sub">«' + esc(r.title) + '» — на какой день?</p><div class="mv-grid">' + days + '</div>',
      function (e, m, shut) { var b = e.target.closest('[data-to]'); if (!b) return; var to = b.getAttribute('data-to');
        plan[from] = (plan[from] || []).filter(function (x) { return x !== id; }); plan[to] = (plan[to] || []).concat(plan[to] && plan[to].indexOf(id) >= 0 ? [] : [id]);
        savePlan(); calSel = to; if (window.kHaptic) window.kHaptic(10); shut(); });
  }
  /* тап по числу в ленте — раскрыть календарь на этом дне; тот же день ещё раз — закрыть */
  function closeCal() {
    calOpen = false; calSel = null;
    var c = ov.querySelector('#plCal'), btn = ov.querySelector('[data-a=calToggle]'); if (c) c.classList.remove('open'); if (btn) btn.setAttribute('aria-expanded', 'false');
    ov.querySelectorAll('.pl-day.on, .pm-d.sel').forEach(function (x) { x.classList.remove('on', 'sel'); });
    setTimeout(function () { showDay(null); }, 350);
  }
  function openCal(k) {
    if (calOpen && calSel === k) { closeCal(); return; }
    calSel = k; calMonth = k.slice(0, 7) === today().slice(0, 7) ? null : k.slice(0, 7);
    var box = ov.querySelector('.pl-month'), c = ov.querySelector('#plCal'), btn = ov.querySelector('[data-a=calToggle]');
    if (box) { box.innerHTML = monthHTML(); bindMonth(); }
    ov.querySelectorAll('.pl-day.on').forEach(function (x) { x.classList.remove('on'); });
    var d = ov.querySelector('.pl-day[data-jump="' + k + '"]'); if (d) d.classList.add('on');
    if (window.kHaptic) window.kHaptic(6);
    if (!calOpen) { calOpen = true; if (c) c.classList.add('open'); if (btn) btn.setAttribute('aria-expanded', 'true'); }
    var sel = ov.querySelector('.pm-d.sel'); if (sel) { sel.classList.remove('pulse'); void sel.offsetWidth; sel.classList.add('pulse'); }
    showDay(k);
  }
  function bindMonth() {
    ov.querySelectorAll('[data-cal]').forEach(function (b) { if (b._b) return; b._b = 1; b.addEventListener('click', function () { openCal(b.getAttribute('data-cal')); }); });
    ov.querySelectorAll('.pl-month [data-cm]').forEach(function (b) { if (b._b) return; b._b = 1; b.addEventListener('click', function () { var td = today(), m0 = dParse((calMonth || td.slice(0, 7)) + '-01'), dlt = +b.getAttribute('data-cm'); m0.setMonth(m0.getMonth() + dlt); calMonth = dKey(m0).slice(0, 7); var box = ov.querySelector('.pl-month');
      box.innerHTML = monthHTML(); box.classList.remove('sl-l', 'sl-r'); void box.offsetWidth; box.classList.add(dlt < 0 ? 'sl-r' : 'sl-l'); bindMonth(); }); });
  }
  function bind() {
    on('#libMenu', function () { if (window.KukingDrawer) window.KukingDrawer.open(); });
    on('#libClose', close);
    on('[data-a=planStart]', function () { planIntro = true; lset('kuking:planIntro', '1'); dir = 'fwd'; render(); ov.scrollTop = 0; askPush(function () { planSettings(true); }); });
    on('[data-a=planCfg]', function () { planSettings(false); });
    on('[data-a=toPlan]', function () { TAB = 'plan'; view = 'plan'; dir = 'fwd'; render(); ov.scrollTop = 0; });
    on('[data-jump]', function (b) { openCal(b.getAttribute('data-jump')); });
    on('[data-jumpold]', function (b) { var el = ov.querySelector('#ag-' + b.getAttribute('data-jump')); if (el) { ov.scrollTo({ top: el.offsetTop - 120, behavior: 'smooth' }); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); } else planPicker(b.getAttribute('data-jump')); });
    on('[data-add]', function (b) { planPicker(b.getAttribute('data-add')); });
    function agGuard(b) { if (Date.now() < noClickUntil) return true; var o = b.closest('.ag-it.sw-open'); if (o) { o._reset(); return true; } return false; }
    on('[data-shop]', function (b) { if (!agGuard(b)) shopList(b.getAttribute('data-shop')); });
    on('[data-tdone]', function (b) { var k = b.getAttribute('data-tdone'); setDone(k, !doneTasks[k]); });
    ov.querySelectorAll('[data-tin]').forEach(function (inp) {
      ['touchstart', 'pointerdown'].forEach(function (ev) { inp.addEventListener(ev, function (e) { e.stopPropagation(); }, { passive: true }); });
      inp.addEventListener('input', function () { var sp = inp.nextElementSibling; if (sp && inp.value) sp.textContent = inp.value; });
      inp.addEventListener('change', function () {
        var k = inp.getAttribute('data-tin'), x = tasksAll().filter(function (t) { return t.key === k; })[0]; if (!x || !inp.value || inp.value === x.time) return;
        if (x.kind === 'cook') planOv.cook[x.day] = inp.value; else planOv.tasks[k] = { day: x.day, time: inp.value };
        savePlan(); if (window.kHaptic) window.kHaptic(8);
        setTimeout(planRefresh, 250);
      });
    });
    on('[data-task]', function (b) { if (!agGuard(b)) taskSheet(b.getAttribute('data-task')); });
    on('[data-unplan]', function (b) { var id = b.getAttribute('data-unplan'), d = b.getAttribute('data-pday'), li = b.closest('.ag-it');
      plan[d] = (plan[d] || []).filter(function (x) { return x !== id; }); savePlan();
      if (li) { li.style.height = li.offsetHeight + 'px'; void li.offsetHeight; li.classList.add('gone'); setTimeout(function () { keepY(render); }, 280); } else keepY(render); });
    agSwipes();
    on('[data-sarr]', function (b) { var st = ov.querySelector('.pl-strip'); if (!st) return; var w = st.querySelector('.pl-day'); st.scrollBy({ left: +b.getAttribute('data-sarr') * (w ? w.offsetWidth + 6 : 50) * 7, behavior: 'smooth' }); if (window.kHaptic) window.kHaptic(6); });
    on('[data-a=calToggle]', function (b) { if (calOpen) { closeCal(); return; } calOpen = true; b.setAttribute('aria-expanded', 'true'); var c = ov.querySelector('#plCal'); if (c) c.classList.add('open'); });
    var pdx = ov.querySelector('#plDay'); if (pdx) bindDay(pdx);
    bindMonth();
    var strip = ov.querySelector('.pl-strip'); if (strip && !strip.dataset.c) { strip.dataset.c = 1; var t0 = strip.querySelector('.pl-day.today'); if (t0) strip.scrollLeft = t0.offsetLeft - 16; }
    on('[data-pf]', function (b) {
      var a = b.getAttribute('data-pf'), St = window.KukingSettings, Soc = SOC();
      if (a === 'login') St && St.open('account');
      if (a === 'account' || a === 'ai' || a === 'look' || a === 'install' || a === 'about' || a === 'prefs' || a === 'kitchen' || a === 'notif') St && St.open(a, { page: true });
      if (a === 'quiz' && window.KPrefs) KPrefs.openQuiz();
      if (a === 'feedback') { var tg = 'https://t.me/gn0mn0mn0m'; try { window.open(tg, '_blank', 'noopener'); } catch (e) { location.href = tg; } }
      if (a === 'friends') { if (Soc.openFriends) Soc.openFriends(); else Soc.open(); }
      if (a === 'anketa' && Soc.openAnketa) Soc.openAnketa('me');
      if (a === 'cook' && Soc.openAnketa) Soc.openAnketa('cook');
      if (a === 'food' && Soc.openAnketa) Soc.openAnketa('body');
    });
    on('.lib-fresh', function () { window.Fresh.spin(freshCtx); });
    on('[data-open]', openTap);
    gestures();
    on('[data-a=back]', function () {
      function leave() { if (view === 'edit' && draft && draft.id) go('detail', draft.id, true); else go('list', undefined, true); }
      if (view === 'edit' && draft) { readDraft(); var cur = JSON.stringify(draft); if (edSnap && cur !== edSnap) { window.kAskLeave({ text: 'В рецепте есть несохранённые правки.', save: saveDraft, drop: function () { draft = null; edSnap = null; leave(); } }); return; } }
      edSnap = null; leave();
    });
    on('[data-a=create]', function () { go('create'); });
    on('[data-a=login]', function () { if (window.KukingSettings) window.KukingSettings.open('account'); });
    on('[data-a=setup]', function () { if (window.KukingSettings) window.KukingSettings.open('ai'); });
    on('[data-a=editnew]', function () { draft = blankDraft(); go('edit'); });
    on('[data-a=upg]', function (b) { upgradeOne(b.getAttribute('data-id')); });
    on('[data-a=editme]', function (b) { var r = byId(b.getAttribute('data-id')); draft = JSON.parse(JSON.stringify(r.manual._draft || blankDraft())); draft.id = r.id; go('edit'); });
    var q = ov.querySelector('#libQ');
    if (q) q.addEventListener('input', function () { query = q.value; var aw = ov.querySelector('.kc-askw'); if (aw && window.KCat) { aw.innerHTML = KCat.askHTML(query); var ab = aw.querySelector('[data-kc=ask]'); if (ab) ab.addEventListener('click', function () { KCat.bind(ov, R.filter(function (r) { return !isHid(r.id); }), function () { keepY(render); }, function () { return query; }, ab); }); } var l = ov.querySelector('.tg-lists'); if (!l) { render(); return; } l.innerHTML = listsHTML(visible()); on('.tg-lists [data-open]', openTap); gestures(); });
    if (window.KCat && view === 'list') KCat.bind(ov, R.filter(function (r) { return !isHid(r.id); }), function () { keepY(render); }, function () { return query; });
    on('.kc-reset', function () { KCat.reset(); render(); });
    on('[data-a=cart]', function () { KCart.open('cart'); });
    on('[data-a=cartback]', function () { var f = cartFrom; cartFrom = null; if (f === 'detail' && cartDetail) { TAB = 'list'; view = 'list'; go('detail', cartDetail, true); return; } window.__kGoTab(f || 'list'); });
    on('[data-a=week]', function () { KCart.weekMenu(); });
    on('[data-a=tocart]', function (b) { var id = b.getAttribute('data-id'); if (KCart.hasRecipe(id)) KCart.removeRecipe(id); else KCart.addRecipe(id); if (window.kHaptic) window.kHaptic(8); keepY(render); });
    on('[data-a=left]', function (b) { var r = byId(b.getAttribute('data-id')); if (r) KCart.leftovers(r); });
    on('[data-a=tocol]', function (b) { KCat.openCols(b.getAttribute('data-id'), function () { keepY(render); }); });
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
    var it = ov.querySelector('#libImpT'), il = ov.querySelector('#libImpL');
    if (it) it.addEventListener('input', function () { impText = it.value; });
    if (il) il.addEventListener('input', function () { impLink = il.value; });
    on('[data-a=imphelp]', function () { impHelp = !impHelp; keepY(render); });
    on('[data-a=imppaste]', function (b) { if (!navigator.clipboard || !navigator.clipboard.readText) { b.textContent = 'Вставьте вручную'; return; } navigator.clipboard.readText().then(function (t) { if (!t) { b.textContent = 'Буфер пустой'; return; } if (/^https?:\/\/\S+$/.test(t.trim())) impLink = t.trim(); else impText = (impText ? impText + '\n' : '') + t; keepY(render); }).catch(function () { b.textContent = 'Нет доступа — вставьте вручную'; }); });
    var fimp = ov.querySelector('#libImp');
    if (fimp) fimp.addEventListener('submit', function (e) { e.preventDefault(); impText = it.value.trim(); impLink = il.value.trim(); if (impText.length < 40) { it.focus(); it.setAttribute('placeholder', 'Нужно хотя бы несколько строк: продукты и шаги'); return; } window.Fresh.rework(freshCtx, { kind: 'import', text: impText, link: impLink, mode: ideaMode }); impText = ''; impLink = ''; });
    on('[data-a=rwair]', function (b) { var r = byId(b.getAttribute('data-id')); if (r) window.Fresh.rework(freshCtx, { kind: 'airfryer', base: r }); });
    on('[data-a=rwkit]', function (b) { var r = byId(b.getAttribute('data-id')); if (r) window.Fresh.rework(freshCtx, { kind: 'kit', base: r }); });
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
  /* ---------- жесты по строке: вправо — закрепить, влево — удалить, удержание — меню ---------- */
  var noClickUntil = 0, TH = 84;
  function dropActive(id) { if (active && active.id === id) { active = null; lset(KEY, ''); return true; } return false; }
  function removeRow(id) {
    hidden[id] = Date.now(); saveHidden();
    var wasActive = active, dropped = dropActive(id);
    var li = ov.querySelector('.tg-li[data-id="' + cssq(id) + '"]');
    function after() { keepY(render); toastUndo('«' + titleOf(id) + '» убран', function () { delete hidden[id]; saveHidden(); if (dropped) { active = wasActive; lset(KEY, id); } keepY(render); var b = ov.querySelector('.tg-li[data-id="' + cssq(id) + '"]'); if (b) b.classList.add('back'); }); }
    if (window.kHaptic) window.kHaptic(10);
    if (li) { li.style.height = li.offsetHeight + 'px'; void li.offsetHeight; li.classList.add('gone'); li.style.height = '0px'; setTimeout(after, 380); } else after();
  }
  function closeOthers(keep) { ov.querySelectorAll('.tg-li.sw-open').forEach(function (x) { if (x !== keep && x._reset) x._reset(); }); }
  function cssq(id) { return window.CSS && CSS.escape ? CSS.escape(id) : id; }
  function gestures() {
    ov.querySelectorAll('.tg-li').forEach(function (li) {
      var row = li.querySelector('.tg-row'), id = li.getAttribute('data-id'), x0 = 0, y0 = 0, dx = 0, mode = '', lp = null, base = 0;
      function reset() { base = 0; row.style.transition = ''; row.style.transform = ''; li.classList.remove('sw-l', 'sw-r', 'sw-go', 'sw-open'); }
      li._reset = function () { row.style.transition = 'transform .3s cubic-bezier(.22,1,.36,1)'; row.style.transform = ''; setTimeout(reset, 300); };
      li.querySelectorAll('[data-sw]').forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); if (!li.classList.contains('sw-open')) return;
        if (window.kHaptic) window.kHaptic(10);
        if (b.getAttribute('data-sw') === 'del') { row.style.transition = 'transform .25s ease-in'; row.style.transform = 'translateX(-110%)'; setTimeout(function () { removeRow(id); }, 200); }
        else { li._reset(); setTimeout(function () { togglePin(id); keepY(render); }, 250); } }); });
      row.addEventListener('touchstart', function (e) {
        var t = e.touches[0]; x0 = t.clientX; y0 = t.clientY; dx = 0; mode = '';
        if (x0 < 24) return; // край экрана — шторка
        if (li.classList.contains('sw-open')) { mode = 'open'; return; }
        closeOthers(null);
        li.classList.add('holding');
        lp = setTimeout(function () { lp = null; mode = 'menu'; noClickUntil = Date.now() + 700; li.classList.remove('holding'); if (navigator.vibrate) window.kHaptic(14); menu(id, li); }, 450);
      }, { passive: true });
      row.addEventListener('touchmove', function (e) {
        var t = e.touches[0], mx = t.clientX - x0, my = t.clientY - y0;
        if (lp && (Math.abs(mx) > 8 || Math.abs(my) > 8)) { clearTimeout(lp); lp = null; li.classList.remove('holding'); }
        if (mode === 'open' && Math.abs(mx) > 8) mode = 'swipe';
        if (mode === 'open') return;
        if (!mode && Math.abs(mx) > 12 && Math.abs(mx) > Math.abs(my) * 1.4) mode = 'swipe';
        if (!mode && Math.abs(my) > 10) mode = 'scroll';
        if (mode !== 'swipe') return;
        dx = mx + base; var W = row.offsetWidth, lim = W * 0.92;
        var vis = Math.abs(dx) > 96 ? (dx > 0 ? 1 : -1) * (96 + (Math.abs(dx) - 96) * 0.85) : dx; // после кнопки — туже
        row.style.transition = 'none'; row.style.transform = 'translateX(' + Math.max(-lim, Math.min(lim, vis)) + 'px)';
        li.classList.toggle('sw-r', dx > 0); li.classList.toggle('sw-l', dx < 0);
        var far = Math.abs(dx) > W * 0.62; if (far !== li.classList.contains('sw-go')) { li.classList.toggle('sw-go', far); if (far && navigator.vibrate) window.kHaptic(12); }
      }, { passive: true });
      row.addEventListener('touchend', function () {
        if (lp) { clearTimeout(lp); lp = null; }
        li.classList.remove('pressed', 'holding');
        if (mode === 'menu' && !navigator.vibrate && window.kHaptic) window.kHaptic(); // айфон щёлкает только на отпускании
        if (mode !== 'swipe') return;
        noClickUntil = Date.now() + 400;
        var W = row.offsetWidth; row.style.transition = 'transform .3s cubic-bezier(.22,1,.36,1)';
        if (dx < -W * 0.62) { if (window.kHaptic) window.kHaptic(); row.style.transform = 'translateX(-110%)'; setTimeout(function () { removeRow(id); }, 220); }
        else if (dx > W * 0.62) { if (window.kHaptic) window.kHaptic(); row.style.transform = ''; setTimeout(function () { togglePin(id); keepY(render); }, 200); }
        else if (Math.abs(dx) > 56) { base = dx < 0 ? -96 : 96; row.style.transform = 'translateX(' + base + 'px)'; li.classList.add('sw-open'); closeOthers(li); }
        else { base = 0; row.style.transform = ''; setTimeout(reset, 300); }
      });
      row.addEventListener('touchcancel', function () { if (lp) clearTimeout(lp); lp = null; li.classList.remove('holding'); reset(); });
      row.addEventListener('contextmenu', function (e) { e.preventDefault(); menu(id, li); });
    });
  }
  function menu(id, li) {
    var r = byId(id); if (!r || document.querySelector('.ctx-ov')) return;
    var m = document.createElement('div'); m.className = 'ctx-ov'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-label', r.title);
    var IC = { open: '<path d="M4 12s3-7 8-7 8 7 8 7-3 7-8 7-8-7-8-7z"/><circle cx="12" cy="12" r="3"/>', cook: '<path d="M7 4v16l13-8z"/>',
      pin: '<path d="M15 3l6 6-3 1-4 4 1 5-2 2-4-4-5 5-1-1 5-5-4-4 2-2 5 1 4-4z"/>', edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>', upg: '<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v5h-5"/>', del: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>' };
    var items = [['open', 'Открыть'], ['cook', active && active.id === id ? 'Продолжить готовку' : 'Готовим это'], ['pin', isPin(id) ? 'Открепить' : 'Закрепить наверху'],
      r.manual ? ['edit', 'Править'] : null, r.ai && !r.manual ? ['upg', 'Обновить под новые правила'] : null, ['del', 'Удалить']].filter(Boolean);
    m.innerHTML = '<div class="ctx-card"><div class="ctx-head"><span class="tg-av m-' + esc(r.mode || 'self') + '">' + emoji(r) + '</span><b>' + esc(r.title) + '</b></div>' +
      items.map(function (x) { return '<button type="button" class="ctx-it' + (x[0] === 'del' ? ' danger' : '') + '" data-c="' + x[0] + '"><span>' + x[1] + '</span><svg viewBox="0 0 24 24" aria-hidden="true">' + IC[x[0]] + '</svg></button>'; }).join('') + '</div>';
    /* как в iOS: строка приподнимается на своём месте, меню выезжает рядом */
    var row = li && li.querySelector('.tg-row'), rr = row && row.getBoundingClientRect(), card = m.querySelector('.ctx-card');
    if (rr) {
      var pv = document.createElement('div'); pv.className = 'ctx-prev'; pv.innerHTML = row.innerHTML; pv.setAttribute('aria-hidden', 'true');
      pv.style.cssText = 'left:' + rr.left + 'px;top:' + rr.top + 'px;width:' + rr.width + 'px;height:' + rr.height + 'px';
      m.appendChild(pv); m.classList.add('anch');
      var below = rr.bottom + 12 + 300 < innerHeight;
      card.style.cssText = 'left:' + Math.max(16, Math.min(rr.left, innerWidth - 16 - Math.min(300, innerWidth - 32))) + 'px;' + (below ? 'top:' + (rr.bottom + 10) + 'px' : 'bottom:' + (innerHeight - rr.top + 10) + 'px') + ';transform-origin:' + (below ? 'top' : 'bottom') + ' left';
      card.querySelector('.ctx-head').hidden = true;
    }
    card.querySelectorAll('.ctx-it').forEach(function (b, i) { b.style.setProperty('--i', i); });
    document.body.appendChild(m); requestAnimationFrame(function () { m.classList.add('on'); var f = m.querySelector('.ctx-it'); if (f) f.focus({ preventScroll: true }); });
    function shut() { m.classList.remove('on'); setTimeout(function () { m.remove(); }, 260); }
    m.addEventListener('click', function (e) {
      var b = e.target.closest('[data-c]'); if (!b) return shut();
      var c = b.getAttribute('data-c'); shut();
      if (c === 'open') go('detail', id);
      if (c === 'cook') choose(id);
      if (c === 'pin') { togglePin(id); keepY(render); }
      if (c === 'edit') { draft = JSON.parse(JSON.stringify(r.manual._draft || blankDraft())); draft.id = r.id; go('edit'); }
      if (c === 'del') removeRow(id);
      if (c === 'upg') upgradeOne(id);
    });
    m.addEventListener('keydown', function (e) { if (e.key === 'Escape') shut(); });
  }
  function upgradeOne(id) {
    if (!(window.KukingAI && window.KukingAI.ready())) { if (window.KukingSettings) window.KukingSettings.open('ai'); return; }
    window.Fresh.upgrade(freshCtx, id);
  }
  function toastUndo(text, undo) {
    var old = document.querySelector('.undo-toast'); if (old) old.remove();
    var t = document.createElement('div'); t.className = 'undo-toast'; t.setAttribute('role', 'status');
    t.innerHTML = '<span>' + esc(text) + '</span><button type="button">Вернуть</button>';
    document.body.appendChild(t); requestAnimationFrame(function () { t.classList.add('on'); });
    function hide() { clearTimeout(gone); t.style.transform = ''; t.classList.remove('on'); setTimeout(function () { t.remove(); }, 320); }
    var gone = setTimeout(hide, 1800);
    dragDown(t, hide, { x: true, th: 30 });
    t.querySelector('button').addEventListener('click', function () { hide(); if (window.kHaptic) window.kHaptic(8); undo(); });
  }

  /* смахнуть вниз: шторки и плашки. Тянется за пальцем, отпустил ниже порога или резко — закрылось */
  function dragDown(el, close, opt) {
    opt = opt || {};
    var y0 = null, dy = 0, t0 = 0, sc = null;
    el.addEventListener('touchstart', function (e) {
      sc = e.target.closest('.pk-sheet, .ps') || el; if (el.scrollTop > 0 && !e.target.closest('.set-grab')) { y0 = null; return; }
      y0 = e.touches[0].clientY; dy = 0; t0 = Date.now();
    }, { passive: true });
    el.addEventListener('touchmove', function (e) {
      if (y0 == null) return; dy = e.touches[0].clientY - y0;
      if (dy <= 0) { el.style.transform = ''; return; }
      if (e.cancelable) e.preventDefault();
      el.style.transition = 'none'; el.style.transform = (opt.x ? 'translateX(-50%) ' : '') + 'translateY(' + (dy < 0 ? 0 : dy) + 'px)';
    }, { passive: false });
    el.addEventListener('touchend', function () {
      if (y0 == null) return; y0 = null; el.style.transition = '';
      var fast = dy > 40 && Date.now() - t0 < 250;
      if (dy > (opt.th || 110) || fast) { if (window.kHaptic) window.kHaptic(6); close(); } else el.style.transform = '';
    });
  }
  window.KDragDown = dragDown;
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
    open: function (id) { TAB = 'list'; detailId = id; ov.hidden = false; go('detail', id); },
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
    feedback: function () { var S = SOC(); return (S.feedback ? S.feedback() : []).map(function (f) { f.title = titleOf(f.rid); return f; }); },
    added: function (r, replaced) {
      if (window.KDish) setTimeout(function () { KDish.auto(r); }, 50);
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
      setTimeout(syncTasks, 1500);
      db.collection('meta').doc('gone').get().then(function (x) { // удалённое не воскресает: ни после обновлений, ни на другом телефоне
        var v = x && x.exists && x.data(); if (!v) { saveHidden(); return; }
        (v.ids || []).forEach(function (id) { if (gone.indexOf(id) < 0) gone.push(id); });
        Object.keys(v.hidden || {}).forEach(function (id) { if (!hidden[id] && gone.indexOf(id) < 0) hidden[id] = v.hidden[id]; });
        purge(gone.filter(function (id) { return /^(ai|my)-/.test(id); }));
        R = R.filter(function (r) { return gone.indexOf(r.id) < 0; });
        if (!ov.hidden && !typing()) keepY(render);
      }).catch(function () {});
      db.collection('meta').doc('plan').get().then(function (x) {
        var v = x && x.exists && x.data(); if (v && v.days) { Object.keys(v.days).forEach(function (k) { if (!plan[k]) plan[k] = v.days[k]; }); if (v.cfg && !planCfg) planCfg = v.cfg; if (v.ov && !Object.keys(planOv.tasks).length && !Object.keys(planOv.cook).length) { planOv = v.ov; planOv.tasks = planOv.tasks || {}; planOv.cook = planOv.cook || {}; lset('kuking:planOv', JSON.stringify(planOv)); } lset('kuking:plan', JSON.stringify(plan)); lset('kuking:planCfg', JSON.stringify(planCfg)); if (!ov.hidden) keepY(render); }
      }).catch(function () {});
      db.collection('meta').doc('done').get().then(function (x) {
        var v = x && x.exists && x.data(); if (!v) return;
        Object.keys(v.done || {}).forEach(function (k) { if (!doneTasks[k]) doneTasks[k] = v.done[k]; });
        Object.keys(v.shop || {}).forEach(function (k) { shopHave[k] = shopHave[k] || {}; Object.keys(v.shop[k] || {}).forEach(function (i) { shopHave[k][i] = shopHave[k][i] || v.shop[k][i]; }); });
        lset('kuking:planDone', JSON.stringify(doneTasks)); lset('kuking:shopAll', JSON.stringify(shopHave));
        if (!ov.hidden && !typing()) keepY(render);
      }).catch(function () {});
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
    open: open,
    resync: function () { syncTasks(); },
    show: function (id) { ov.hidden = false; go('detail', id); render(); },
    all: function () { return R.filter(function (r) { return !isHid(r.id); }); },
    byId: byId, today: today, emoji: emoji,
    importRecipe: function (rec) { var c = JSON.parse(JSON.stringify(rec)); c.id = 'ai-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); c.ai = true; freshCtx.added(c); return c.id; },
    planDays: function () { return plan; },
    /* что уже отмечено купленным в закупках плана, где есть это блюдо */
    shopChecked: function (id) { var out = {}; try { tasksAll().forEach(function (t) { if (t.kind === 'shop' && (t.ids || []).indexOf(id) >= 0) { var hv = shopHave[t.key] || {}; Object.keys(hv).forEach(function (k) { if (hv[k]) out[k] = 1; }); } }); } catch (e) {} return out; },
    isDone: function (k) { return !!doneTasks[k]; },
    planAdd: function (k, id) { var a = plan[k] = plan[k] || []; if (a.indexOf(id) < 0) a.push(id); savePlan(); },
    refresh: function () { if (!ov.hidden) keepY(render); }
  };
  /* после знакомства: на главную и сразу собрать 10 идей под человека */
  window.__kCustom = function (idea, mode) { window.Fresh.custom(freshCtx, idea, mode || 'self'); };
  window.__kStarter = function () { if (window.__kGoTab) window.__kGoTab('list'); go('create'); themesOpen = true; loadThemes(); setTimeout(function () { var t = ov.querySelector('.lib-themes-re, .th-go'); if (t && t.scrollIntoView) t.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 500); };
  if (window.KukingSocial && window.KukingSocial.onChange) window.KukingSocial.onChange(function () { if (!ov.hidden && !typing()) keepY(render); });

  /* ---------- таб-бар снизу: Рецепты · План · Чаты · Профиль ---------- */
  var SUB = { detail: 1, create: 1, edit: 1 }, TAB = 'list', cartFrom = null, cartOpening = false, cartDetail = null;
  window.__kOpenCart = function () { cartFrom = view === 'detail' ? 'detail' : SUB[view] ? TAB : view; cartDetail = view === 'detail' ? detailId : null; if (cartFrom === 'cart') cartFrom = null; cartOpening = true; window.__kGoTab('cart'); cartOpening = false; };
  var TABS = [['list', 'Рецепты', '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/>'],
    ['plan', 'План', '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>'],
    ['cart', 'Корзина', '<path d="M3 4h2.5l2.2 10.5h10.6L20.5 7H7"/><circle cx="9.5" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/>'],
    ['chats', 'Чаты', '<path d="M4 5h16v11H9l-5 4z"/>'],
    ['profile', 'Профиль', '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>']];
  var bar = document.createElement('nav'); bar.className = 'tg-tabs'; bar.setAttribute('aria-label', 'Разделы'); document.body.appendChild(bar);
  function syncTabs() {
    var socOpen = window.KukingSocial && window.KukingSocial.isOpen && window.KukingSocial.isOpen();
    var cur = socOpen ? (window.KukingSocial.mode && window.KukingSocial.mode() !== 'friends' ? 'profile' : 'chats') : (SUB[view] ? TAB : view);
    var show = !ov.hidden && (!SUB[view] || socOpen);
    var n = SOC().badge ? SOC().badge() : 0;
    bar.innerHTML = TABS.map(function (t) {
      return '<button type="button" data-tab="' + t[0] + '"' + (cur === t[0] ? ' aria-current="page"' : '') + '><svg viewBox="0 0 24 24" aria-hidden="true">' + t[2] + '</svg><span>' + t[1] + '</span>' +
        (t[0] === 'profile' && n ? '<em>' + n + '</em>' : '') + (t[0] === 'chats' && window.KHub && KHub.unread() ? '<em>' + KHub.unread() + '</em>' : '') + (t[0] === 'cart' && window.KCart && KCart.count() ? '<em class="cart-n">' + KCart.count() + '</em>' : '') + '</button>';
    }).join('');
    bar.classList.toggle('on', show);
    document.documentElement.classList.toggle('tabs-on', show);
  }
  bar.addEventListener('click', function (e) {
    var b = e.target.closest('[data-tab]'); if (!b) return;
    var t = b.getAttribute('data-tab'), Soc = SOC();
    if (t === 'cart' && !cartOpening) cartFrom = null;
    var Stg0 = window.KukingSettings; if (t !== 'profile' && Stg0 && Stg0.isOpen && Stg0.isOpen() && Stg0.close(function () { b.click(); }) === false) return;
    if (t === 'chats') { if (Soc.enabled && window.KukingStore && window.KukingStore.user()) { var fi = ['list', 'plan', 'cart', 'chats', 'profile'].indexOf(SUB[view] ? TAB : view); if (Soc.openTab) Soc.openTab(fi > 3 ? 'l' : 'r'); else Soc.open(); } else if (window.KukingSettings) window.KukingSettings.open('account'); syncTabs(); return; }
    var Stg = window.KukingSettings; if (Stg && Stg.isOpen && Stg.isOpen() && Stg.close(function () { b.click(); }) === false) return;
    if (Soc.isOpen && Soc.isOpen() && Soc.close(function () { b.click(); }) === false) return;
    if (t === view) { ov.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    var ORD = ['list', 'plan', 'cart', 'chats', 'profile'], from = ORD.indexOf(SUB[view] ? TAB : view);
    TAB = t; dir = from < 0 || from === ORD.indexOf(t) ? 'tab' : from < ORD.indexOf(t) ? 'tab-r' : 'tab-l'; view = t; stagger = t === 'list' || t === 'plan'; render(); ov.scrollTop = 0;
  });
  if (window.KukingSocial && window.KukingSocial.onClose) window.KukingSocial.onClose(function () { syncTabs(); });
  window.__kGoTab = function (k) { var b = bar.querySelector('[data-tab="' + k + '"]'); if (b) b.click(); };
  window.__kSyncTabs = syncTabs;
  new MutationObserver(function () { syncTabs(); document.documentElement.classList.toggle('hero-on', view === 'detail' && !ov.hidden); }).observe(ov, { attributes: true, attributeFilter: ['hidden'] });

  /* потянул вниз сверху — обновить (заодно подтянет свежую версию) */
  function pullRefresh(sc, run, topFn) {
    var top = topFn || function () { return sc.scrollTop; };
    var ind = document.createElement('div'); ind.className = 'ptr'; ind.setAttribute('aria-hidden', 'true');
    ind.innerHTML = '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v5h-5"/></svg>'; document.body.appendChild(ind);
    var y0 = null, d = 0, armed = false;
    sc.addEventListener('touchstart', function (e) { y0 = top() <= 0 && !sc.hidden && !e.target.closest('input, textarea, .pk-ov') ? e.touches[0].clientY : null; d = 0; armed = false; }, { passive: true });
    sc.addEventListener('touchmove', function (e) {
      if (y0 == null) return; d = e.touches[0].clientY - y0; if (d <= 0 || top() > 0) { ind.style.opacity = 0; return; }
      var p = Math.min(1, d / 90); ind.style.transition = 'none'; ind.style.opacity = p; ind.style.transform = 'translate(-50%,' + Math.min(70, d * 0.6) + 'px) rotate(' + Math.round(p * 270) + 'deg)';
      if (p >= 1 && !armed) { armed = true; if (navigator.vibrate) window.kHaptic(8); } else if (p < 1) armed = false;
    }, { passive: true });
    sc.addEventListener('touchend', function () {
      if (y0 == null) return; y0 = null; ind.style.transition = '';
      if (armed) { if (window.kHaptic) window.kHaptic(); ind.classList.add('spin'); ind.style.transform = 'translate(-50%, 46px)'; run(function () { ind.classList.remove('spin'); ind.style.opacity = 0; ind.style.transform = ''; }); }
      else { ind.style.opacity = 0; ind.style.transform = ''; }
    });
  }
  pullRefresh(ov, function () {
    if (SUB[view]) { keepY(render); return; }
    try { sessionStorage.setItem('kuking:curtain', '1'); sessionStorage.setItem('kuking:tab', TAB); } catch (e) {}
    if (window.kUpdate) { window.kUpdate(); return; } // подтянет свежую версию, если вышла
    var c = document.getElementById('curtain'); if (c) { c.hidden = false; requestAnimationFrame(function () { c.classList.add('on'); }); }
    setTimeout(function () { location.reload(); }, 260);
  });
  window.KPull = pullRefresh;
  /* облако не отвечает — тихая плашка сверху; всё равно всё сохраняется в телефоне и уйдёт само */
  (function () {
    var S = window.KukingStore; if (!S || !S.onNet) return;
    var pill = document.createElement('div'); pill.className = 'net-pill'; pill.setAttribute('role', 'status'); pill.innerHTML = '<i></i><span>Облако не отвечает — сохраняю в телефоне</span>'; document.body.appendChild(pill);
    var t = null;
    S.onNet(function (ok) { clearTimeout(t); if (ok) { pill.querySelector('span').textContent = 'Связь есть — всё синхронизировал'; t = setTimeout(function () { pill.classList.remove('on'); }, 1800); }
      else { pill.querySelector('span').textContent = 'Облако не отвечает — сохраняю в телефоне'; pill.classList.add('on'); t = setTimeout(function () { pill.classList.remove('on'); }, 4000); } });
  })();
  window.__kSaveTab = function () { try { sessionStorage.setItem('kuking:tab', TAB); } catch (e) {} };

  /* свайп вправо — назад, экран идёт за пальцем (в рецепте — откуда угодно, в формах — от края) */
  (function () {
    var sx = null, sy = 0, dx = 0, t0 = 0, on = false, scr = null;
    ov.addEventListener('touchstart', function (e) {
      var t = e.touches[0]; on = false; dx = 0;
      sx = SUB[view] && (t.clientX < 40 || (view === 'detail' && !e.target.closest('input, textarea, .tg-sheet, [data-noswipe]'))) ? t.clientX : null; sy = t.clientY; t0 = Date.now();
    }, { passive: true });
    ov.addEventListener('touchmove', function (e) {
      if (sx == null) return; var t = e.touches[0], mx = t.clientX - sx, my = t.clientY - sy;
      if (!on) { if (Math.abs(my) > 10 && Math.abs(my) > Math.abs(mx)) { sx = null; return; } if (mx > 12 && mx > Math.abs(my) * 1.5) { on = true; scr = ov.querySelector('.tg-screen'); } else return; }
      dx = Math.max(0, mx); if (scr) { scr.style.transition = 'none'; scr.style.transform = 'translateX(' + dx + 'px)'; scr.style.boxShadow = '-18px 0 40px var(--shadow)'; }
    }, { passive: true });
    ov.addEventListener('touchend', function () {
      if (sx == null || !on) { sx = null; return; } sx = null;
      var W = ov.clientWidth, fast = dx > 60 && Date.now() - t0 < 260;
      if (dx > W * 0.3 || fast) { if (scr) { scr.style.transition = 'transform .2s ease-out'; scr.style.transform = 'translateX(100%)'; } if (window.kHaptic) window.kHaptic(6);
        setTimeout(function () { var b = ov.querySelector('[data-a=back]'); if (b) b.click(); }, 180); }
      else if (scr) { scr.style.transition = 'transform .3s cubic-bezier(.22,1,.36,1)'; scr.style.transform = ''; setTimeout(function () { if (scr) scr.style.boxShadow = ''; }, 300); }
      on = false;
    });
  })();

  ov.addEventListener('scroll', function () { ov.classList.toggle('scrolled', ov.scrollTop > 12); }, { passive: true });
  if (btn) btn.addEventListener('click', open);
  /* из готовки — назад в карточку рецепта, экран выезжает слева, как «назад» */
  var bBtn = document.getElementById('backBtn');
  if (bBtn) bBtn.addEventListener('click', function () {
    if (!active || isHid(active.id) || !byId(active.id)) { active = null; open(); return; }
    TAB = 'list'; view = 'detail'; detailId = active.id; dir = 'back'; stagger = false; render(); ov.hidden = false; ov.scrollTop = 0;
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !ov.hidden && view !== 'list') go('list', undefined, true); });

  var skip = false;
  try { skip = sessionStorage.getItem('kuking:skipHome') === '1'; sessionStorage.removeItem('kuking:skipHome'); } catch (e) {}
  if (!skip || !active) open();
  try { var rt = sessionStorage.getItem('kuking:tab'); sessionStorage.removeItem('kuking:tab'); if (rt && rt !== 'list' && rt !== 'chats' && !ov.hidden) { TAB = rt; view = rt; render(); } } catch (e) {}
})();
