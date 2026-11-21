/* Партия 2: каталог — категории плитками, фильтры в одной шторке, сохранённые фильтры, свои коллекции,
   «для тебя: легко», поиск фразой через нейросеть и «из того, что есть». Данные паспорта — из KMeta. */
(function () {
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function lget(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function lset(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function hap(n) { if (window.kHaptic) window.kHaptic(n || 6); }
  function M(r) { return window.KMeta ? KMeta.get(r) : { diets: [], equipment: [] }; }
  function mins(r) { return window.KMeta ? KMeta.mins(r.totalTime) : 0; }

  var EMPTY = { cat: '', diets: [], cuisine: [], main: [], time: 0, diff: 0, mine: false, col: '' };
  var F = Object.assign({}, EMPTY, lget('kuking:filt', {}));
  var saved = lget('kuking:savedF', []), cols = lget('kuking:cols', []);
  var ai = null; // результат поиска нейросетью: {q, ids:[], ideas:[]}
  function save() { lset('kuking:filt', F); }
  function saveCols() { lset('kuking:cols', cols); sync('cols', { cols: cols }); }
  function saveSaved() { lset('kuking:savedF', saved); sync('savedF', { saved: saved }); }
  function sync(id, data) {
    var S = window.KukingStore; if (!S || !S.user || !S.user() || !S.collection) return;
    try { data.updatedAt = new Date().toISOString(); S.collection('meta').doc(id).set(data).catch(function () {}); } catch (e) {}
  }
  setTimeout(function pull() {
    var S = window.KukingStore; if (!S || !S.user || !S.user() || !S.collection) return;
    S.collection('meta').doc('cols').get().then(function (d) { var v = d && d.data && d.data(); if (v && v.cols && !cols.length) { cols = v.cols; lset('kuking:cols', cols); } }).catch(function () {});
    S.collection('meta').doc('savedF').get().then(function (d) { var v = d && d.data && d.data(); if (v && v.saved && !saved.length) { saved = v.saved; lset('kuking:savedF', saved); } }).catch(function () {});
  }, 3500);

  var CATS = window.KMeta ? KMeta.CATS : {};
  var CAT_ICO = { main: '🍽️', soup: '🍲', breakfast: '🍳', dessert: '🍰', snack: '🥨', drink: '🍹', sauce: '🫙' };
  var TIMES = [[0, 'Любое'], [30, 'до 30 мин'], [60, 'до часа'], [120, 'до 2 ч']];

  /* «для тебя»: сложность 1–5 против уровня повара 1–10 */
  function forYou(r) {
    var d = M(r).difficulty || 3, sk = 5; try { sk = +localStorage.getItem('kuking:skill') || 5; } catch (e) {}
    var x = d * 2 - sk;
    return x <= -3 ? ['easy', 'для тебя легко'] : x <= 0 ? ['ok', 'по силам'] : x <= 2 ? ['hard', 'будет вызов'] : ['top', 'сложно для тебя'];
  }

  function count() { var n = 0; if (F.diets.length) n++; if (F.cuisine.length) n++; if (F.main.length) n++; if (F.time) n++; if (F.diff) n++; if (F.mine) n++; return n; }
  function pass(r, ignoreCat) {
    var m = M(r);
    if (!ignoreCat && F.cat && m.category !== F.cat) return false;
    if (F.col) { var c = cols.filter(function (x) { return x.id === F.col; })[0]; if (!c || c.ids.indexOf(r.id) < 0) return false; }
    if (F.diets.some(function (d) { return m.diets.indexOf(d) < 0; })) return false;
    if (F.cuisine.length && F.cuisine.indexOf(m.cuisine) < 0) return false;
    if (F.main.length && F.main.indexOf(m.main) < 0) return false;
    if (F.time && (mins(r) || 999) > F.time) return false;
    if (F.diff && (m.difficulty || 3) > F.diff) return false;
    if (F.mine && window.KPrefs && m.equipment.some(function (e) { return !KPrefs.has(e); })) return false;
    if (ai && ai.ids && ai.ids.indexOf(r.id) < 0) return false;
    return true;
  }
  /* порядок от нейросети — главный, когда она искала */
  function order(list) {
    if (!ai || !ai.ids) return list;
    return list.slice().sort(function (a, b) { return ai.ids.indexOf(a.id) - ai.ids.indexOf(b.id); });
  }

  /* ---------- полоса над списком ---------- */
  function barHTML(all) {
    var cnt = {}; all.forEach(function (r) { var c = M(r).category || 'main'; cnt[c] = (cnt[c] || 0) + 1; });
    var h = '<div class="kc-cats" role="toolbar" aria-label="Категории">' +
      '<button type="button" class="kc-cat" data-kcat="" aria-pressed="' + !F.cat + '"><i>✦</i><span>Все</span><small>' + all.length + '</small></button>' +
      Object.keys(CATS).map(function (k) { return '<button type="button" class="kc-cat' + (cnt[k] ? '' : ' empty') + '" data-kcat="' + k + '" aria-pressed="' + (F.cat === k) + '"><i>' + CAT_ICO[k] + '</i><span>' + CATS[k] + '</span><small>' + (cnt[k] || 0) + '</small></button>'; }).join('') + '</div>';
    var n = count();
    h += '<div class="kc-row">' +
      '<button type="button" class="kc-btn' + (n ? ' on' : '') + '" data-kc="filters"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg>Фильтры' + (n ? ' · ' + n : '') + '</button>' +
      '<button type="button" class="kc-btn" data-kc="fridge"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="3" width="12" height="18" rx="2.5"/><path d="M6 10h12M9 6.5v1.5M9 13v2.5"/></svg>Из того, что есть</button>' +
      cols.map(function (c) { return '<button type="button" class="kc-btn kc-col" data-kcol="' + esc(c.id) + '" aria-pressed="' + (F.col === c.id) + '">📁 ' + esc(c.name) + ' · ' + c.ids.length + '</button>'; }).join('') +
      saved.map(function (s, i) { return '<button type="button" class="kc-btn kc-saved" data-ksaved="' + i + '">★ ' + esc(s.name) + '</button>'; }).join('') + '</div>';
    if (ai) h += '<div class="kc-ai"><div class="kc-ai-h"><span>Нейросеть по запросу «' + esc(ai.q) + '»</span><button type="button" class="kc-x" data-kc="aiclear" aria-label="Сбросить">×</button></div>' +
      (ai.busy ? '<p class="small kc-tick">Ищет…</p>' : ai.err ? '<p class="small">' + esc(ai.err) + '</p>' :
        (ai.ids.length ? '' : '<p class="small">В книге подходящего нет.</p>') +
        (ai.ideas.length ? '<p class="kc-l">Можно приготовить новое</p><div class="kc-ideas">' + ai.ideas.map(function (x, i) { return '<button type="button" class="kc-idea" data-kidea="' + i + '"><b>' + esc(x.title) + '</b>' + (x.why ? '<small>' + esc(x.why) + '</small>' : '') + '</button>'; }).join('') + '</div>' : '')) + '</div>';
    return h;
  }
  function askHTML(q) {
    if (!q || q.trim().length < 3 || ai) return '';
    return '<button type="button" class="kc-ask" data-kc="ask"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6z"/></svg>Спросить нейросеть: «' + esc(q.trim().slice(0, 40)) + '»</button>';
  }
  /* бейджи в строке списка */
  function rowBadges(r) {
    var m = M(r), fy = forYou(r), out = '';
    m.diets.filter(function (d) { return d !== 'protein'; }).forEach(function (d) { out += '<span class="kc-b d-' + d + '">' + { veg: 'Вегетарианское', vegan: 'Веганское', gf: 'Без глютена' }[d] + '</span>'; });
    out += '<span class="kc-b kc-fy ' + fy[0] + '">' + hats(m.difficulty) + fy[1] + '</span>';
    return '<span class="kc-badges">' + out + '</span>';
  }
  function hats(n) { var s = ''; for (var i = 1; i <= 5; i++) s += '<i class="' + (i <= n ? 'on' : '') + '"></i>'; return '<span class="kc-hats" aria-label="Сложность ' + n + ' из 5">' + s + '</span>'; }

  /* ---------- шторка ---------- */
  function sheet(title, body, foot, onClick) {
    var m = document.createElement('div'); m.className = 'ks-ov'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-label', title);
    m.innerHTML = '<div class="ks"><span class="ks-grab" aria-hidden="true"></span><div class="ks-head"><h3>' + esc(title) + '</h3><button type="button" class="ks-x" aria-label="Закрыть">×</button></div><div class="ks-body">' + body + '</div>' + (foot ? '<div class="ks-foot">' + foot + '</div>' : '') + '</div>';
    document.body.appendChild(m); requestAnimationFrame(function () { m.classList.add('on'); });
    function shut() { m.classList.remove('on'); setTimeout(function () { m.remove(); }, 280); }
    m.addEventListener('click', function (e) { if (e.target === m || e.target.closest('.ks-x')) return shut(); onClick(e, m, shut); });
    var y0 = null, sh = m.querySelector('.ks');
    sh.addEventListener('touchstart', function (e) { if (m.querySelector('.ks-body').scrollTop > 0) { y0 = null; return; } y0 = e.touches[0].clientY; }, { passive: true });
    sh.addEventListener('touchmove', function (e) { if (y0 == null) return; var dy = e.touches[0].clientY - y0; if (dy > 0) sh.style.transform = 'translateY(' + dy + 'px)'; }, { passive: true });
    sh.addEventListener('touchend', function (e) { if (y0 == null) return; var dy = e.changedTouches[0].clientY - y0; y0 = null; sh.style.transform = ''; if (dy > 90) shut(); });
    return { el: m, shut: shut };
  }
  function chip(group, v, label, on) { return '<button type="button" class="qz-chip" data-kf="' + group + '" data-v="' + esc(v) + '" aria-pressed="' + on + '">' + esc(label) + '</button>'; }

  function openFilters(all, rerender) {
    var used = { cuisine: {}, main: {} };
    all.forEach(function (r) { var m = M(r); if (m.cuisine) used.cuisine[m.cuisine] = 1; if (m.main) used.main[m.main] = 1; });
    function body() {
      return '<span class="qz-l">Диета</span><div class="qz-chips">' + [['veg', 'Вегетарианское'], ['vegan', 'Веганское'], ['gf', 'Без глютена'], ['protein', 'Много белка']].map(function (d) { return chip('diets', d[0], d[1], F.diets.indexOf(d[0]) >= 0); }).join('') + '</div>' +
        '<span class="qz-l">Кухня</span><div class="qz-chips">' + Object.keys(used.cuisine).sort().map(function (c) { return chip('cuisine', c, c, F.cuisine.indexOf(c) >= 0); }).join('') + '</div>' +
        '<span class="qz-l">Главный продукт</span><div class="qz-chips">' + Object.keys(used.main).sort().map(function (c) { return chip('main', c, c, F.main.indexOf(c) >= 0); }).join('') + '</div>' +
        '<span class="qz-l">Время</span><div class="seg qz-seg">' + TIMES.map(function (t) { return '<button type="button" role="radio" data-kt="' + t[0] + '" aria-checked="' + (F.time === t[0]) + '">' + t[1] + '</button>'; }).join('') + '</div>' +
        '<span class="qz-l">Сложность не выше</span><div class="seg qz-seg">' + [[0, 'Любая'], [2, '2'], [3, '3'], [4, '4']].map(function (t) { return '<button type="button" role="radio" data-kd="' + t[0] + '" aria-checked="' + (F.diff === t[0]) + '">' + (t[0] ? hats(t[0]) : t[1]) + '</button>'; }).join('') + '</div>' +
        '<button type="button" class="qz-sw ks-sw" data-kmine role="switch" aria-checked="' + F.mine + '"><span class="qz-sw-t"><b>Только под мою технику</b><small>скрыть рецепты с техникой, которой нет</small></span><i aria-hidden="true"></i></button>';
    }
    function foot() {
      var n = all.filter(function (r) { return pass(r); }).length;
      return '<button type="button" class="nav-btn" data-ks="reset">Сбросить</button><button type="button" class="nav-btn" data-ks="save"' + (count() ? '' : ' disabled') + '>Сохранить</button><button type="button" class="nav-btn primary" data-ks="show">Показать ' + n + '</button>';
    }
    var s = sheet('Фильтры', body(), foot(), function (e, m, shut) {
      var b = e.target.closest('[data-kf],[data-kt],[data-kd],[data-kmine],[data-ks]'); if (!b) return;
      if (b.hasAttribute('data-kf')) { var g = b.getAttribute('data-kf'), v = b.getAttribute('data-v'), on = b.getAttribute('aria-pressed') !== 'true'; F[g] = F[g].filter(function (x) { return x !== v; }); if (on) F[g].push(v); }
      else if (b.hasAttribute('data-kt')) F.time = +b.getAttribute('data-kt');
      else if (b.hasAttribute('data-kd')) F.diff = +b.getAttribute('data-kd');
      else if (b.hasAttribute('data-kmine')) F.mine = !F.mine;
      else { var a = b.getAttribute('data-ks');
        if (a === 'reset') { var c = F.cat, col = F.col; F = Object.assign({}, EMPTY, { cat: c, col: col, diets: [], cuisine: [], main: [] }); }
        if (a === 'save') { askName('Название фильтра', 'Например, «Быстро и без глютена»', function (nm) { saved.push({ name: nm, f: JSON.parse(JSON.stringify(F)) }); saveSaved(); rerender(); }); return; }
        if (a === 'show') { save(); shut(); rerender(); return; } }
      hap(); save();
      m.querySelector('.ks-body').innerHTML = body(); m.querySelector('.ks-foot').innerHTML = foot();
    });
    return s;
  }
  function askName(title, ph, done) {
    var s = sheet(title, '<label class="set-f qz-f"><span>Название</span><input id="ksName" maxlength="30" placeholder="' + esc(ph) + '"></label>', '<button type="button" class="nav-btn primary" data-kn="ok">Сохранить</button>', function (e, m, shut) {
      if (!e.target.closest('[data-kn]')) return; var v = m.querySelector('#ksName').value.trim(); if (!v) { m.querySelector('#ksName').focus(); return; } shut(); done(v.slice(0, 30));
    });
    setTimeout(function () { var i = s.el.querySelector('#ksName'); if (i) i.focus(); }, 300);
  }

  /* коллекции: из карточки рецепта */
  function openCols(id, rerender) {
    function body() {
      return (cols.length ? '<ul class="qz-tog">' + cols.map(function (c) { var on = c.ids.indexOf(id) >= 0;
        return '<li><button type="button" class="qz-sw" data-kc2="' + esc(c.id) + '" role="switch" aria-checked="' + on + '"><span class="qz-sw-t"><b>📁 ' + esc(c.name) + '</b><small>' + c.ids.length + ' рец.</small></span><i aria-hidden="true"></i></button></li>'; }).join('') + '</ul>' : '<p class="small">Коллекций пока нет. Создайте первую — например, «На свидание» или «Быстро в будни».</p>') +
        '<div class="ks-new"><input id="ksCol" maxlength="30" placeholder="Новая коллекция"><button type="button" class="nav-btn" data-kc2new>Создать</button></div>' +
        (cols.length ? '<p class="small ks-del-h">Удержите коллекцию в каталоге, чтобы удалить её.</p>' : '');
    }
    sheet('В коллекцию', body(), '', function (e, m) {
      var b = e.target.closest('[data-kc2],[data-kc2new]'); if (!b) return;
      if (b.hasAttribute('data-kc2new')) { var nm = m.querySelector('#ksCol').value.trim(); if (!nm) return; cols.push({ id: 'c' + Date.now().toString(36), name: nm.slice(0, 30), ids: [id] }); }
      else { var c = cols.filter(function (x) { return x.id === b.getAttribute('data-kc2'); })[0]; if (!c) return; var i = c.ids.indexOf(id); if (i >= 0) c.ids.splice(i, 1); else c.ids.push(id); }
      hap(); saveCols(); m.querySelector('.ks-body').innerHTML = body(); if (rerender) rerender();
    });
  }
  function inCols(id) { return cols.filter(function (c) { return c.ids.indexOf(id) >= 0; }).map(function (c) { return c.name; }); }

  /* ---------- нейросеть ---------- */
  function brief(r) { var m = M(r); return { id: r.id, t: r.title, d: (r.tagline || '').slice(0, 80), c: m.cuisine, p: m.main, min: mins(r) }; }
  function sample() { return Promise.resolve(window.claude && window.claude.use ? window.claude.use('sample') : null).then(function (s) { if (!s || !(window.KukingAI && KukingAI.ready())) throw { code: 'not_granted' }; return s; }); }
  function errText(e) { return window.KukingAIMsg ? window.KukingAIMsg(e) : 'Нейросеть не ответила'; }
  function askAI(q, all, rerender) {
    ai = { q: q, busy: true, ids: [], ideas: [] }; rerender();
    var pref = window.KPrefs ? KPrefs.promptLine() : '';
    sample().then(function (s) {
      return s.json({ system: 'Ты — шеф-куратор кулинарного приложения «Жарко». Отвечаешь только JSON-объектом без текста вокруг.',
        user: 'Запрос человека: «' + q + '»\n' + pref + '\nРецепты в его книге (JSON): ' + JSON.stringify(all.map(brief)) +
          '\nВерни {"ids":[id рецептов из книги, которые подходят под запрос, от лучшего; пустой массив, если нет],"ideas":[до 3 новых блюд под запрос, которых нет в книге: {"title":"название 2–5 слов","why":"почему подходит, до 70 знаков"}]}. Учитывай аллергии и «не ест».' },
        { modelTier: 'default', cache: false, temperature: 0.4 });
    }).then(function (v) {
      var ids = (v && Array.isArray(v.ids) ? v.ids : []).map(String).filter(function (id) { return all.some(function (r) { return r.id === id; }); });
      var ideas = (v && Array.isArray(v.ideas) ? v.ideas : []).filter(function (x) { return x && x.title; }).slice(0, 3).map(function (x) { return { title: String(x.title).slice(0, 60), why: String(x.why || '').slice(0, 90) }; });
      if (ai && ai.q === q) { ai = { q: q, ids: ids, ideas: ideas }; rerender(); }
    }).catch(function (e) { if (ai && ai.q === q) { ai = { q: q, ids: [], ideas: [], err: errText(e) }; rerender(); } });
  }

  var STAPLES = ['Курица', 'Фарш', 'Говядина', 'Яйца', 'Рис', 'Паста', 'Картофель', 'Гречка', 'Лук', 'Чеснок', 'Помидоры', 'Сыр', 'Сметана', 'Сливки', 'Грибы', 'Кабачок', 'Перец', 'Лаваш', 'Консервированный тунец', 'Нут'];
  var fridge = lget('kuking:fridge', { sel: [], txt: '' });
  function openFridge(all) {
    var res = null;
    function local() {
      var have = fridge.sel.concat(fridge.txt.split(/[,;\n]/)).map(function (x) { return x.trim().toLowerCase().replace(/ё/g, 'е'); }).filter(function (x) { return x.length > 2; });
      if (!have.length) return [];
      return all.map(function (r) {
        var ing = (r.ingredients || []).filter(function (i) { return i && i.name && !/соль|перец молот|масло|сахар|вода|специ|сунели|паприк|кориандр|куркум|масала/i.test(i.name); });
        var hit = ing.filter(function (i) { var n = i.name.toLowerCase().replace(/ё/g, 'е'); return have.some(function (h) { return n.indexOf(h.slice(0, Math.max(4, h.length - 2))) >= 0; }); }).length;
        return { r: r, p: ing.length ? hit / ing.length : 0 };
      }).filter(function (x) { return x.p >= 0.35; }).sort(function (a, b) { return b.p - a.p; }).slice(0, 4);
    }
    function body() {
      var loc = local();
      return '<p class="small">Отметьте, что есть дома, или впишите своё. Сначала покажем подходящее из книги, потом нейросеть предложит новое.</p>' +
        '<div class="qz-chips">' + STAPLES.map(function (s) { return '<button type="button" class="qz-chip" data-kfr="' + esc(s) + '" aria-pressed="' + (fridge.sel.indexOf(s) >= 0) + '">' + esc(s) + '</button>'; }).join('') + '</div>' +
        '<label class="set-f qz-f"><span>Ещё продукты, через запятую</span><textarea id="ksFr" rows="2" maxlength="300" placeholder="Например: шпинат, моцарелла, лимон">' + esc(fridge.txt) + '</textarea></label>' +
        (loc.length ? '<p class="kc-l">Из вашей книги</p><div class="kc-ideas">' + loc.map(function (x) { return '<button type="button" class="kc-idea" data-kopen="' + esc(x.r.id) + '"><b>' + esc(x.r.title) + '</b><small>есть ' + Math.round(x.p * 100) + '% продуктов</small></button>'; }).join('') + '</div>' : '') +
        (res ? (res.busy ? '<p class="small kc-tick">Нейросеть думает…</p>' : res.err ? '<p class="small">' + esc(res.err) + '</p>' :
          '<p class="kc-l">Новое из того, что есть</p><div class="kc-ideas">' + res.ideas.map(function (x, i) { return '<button type="button" class="kc-idea" data-kfi="' + i + '"><b>' + esc(x.title) + '</b><small>' + esc(x.why || '') + (x.buy ? ' · докупить: ' + esc(x.buy) : '') + '</small></button>'; }).join('') + '</div>') : '') +
        '<p class="small ks-note">По фото холодильника нейросеть пока не умеет — только списком.</p>';
    }
    var s = sheet('Из того, что есть', body(), '<button type="button" class="nav-btn primary" data-kfg>Что приготовить?</button>', function (e, m, shut) {
      var b = e.target.closest('[data-kfr],[data-kfg],[data-kfi],[data-kopen]'); if (!b) return;
      if (b.hasAttribute('data-kopen')) { shut(); openRecipe(b.getAttribute('data-kopen')); return; }
      if (b.hasAttribute('data-kfi')) { var x = res.ideas[+b.getAttribute('data-kfi')]; shut(); if (window.__kCustom) window.__kCustom(x.title + ' — из того, что есть: ' + have().join(', '), 'self'); return; }
      if (b.hasAttribute('data-kfr')) { var v = b.getAttribute('data-kfr'), i = fridge.sel.indexOf(v); if (i >= 0) fridge.sel.splice(i, 1); else fridge.sel.push(v); hap(); }
      if (b.hasAttribute('data-kfg')) {
        if (!have().length) { var t = m.querySelector('#ksFr'); if (t) t.focus(); return; }
        res = { busy: true };
        sample().then(function (sm) {
          return sm.json({ system: 'Ты — шеф уровня Мишлен в приложении «Жарко». Отвечаешь только JSON-объектом без текста вокруг.',
            user: 'Дома есть: ' + have().join(', ') + '. Соль, перец, масло, базовые специи — тоже есть.\n' + (window.KPrefs ? KPrefs.promptLine() : '') +
              '\nПредложи 4 блюда, где главное — из этих продуктов. Докупить можно максимум 1–2 мелочи. Верни {"ideas":[{"title":"название 2–5 слов","why":"что берём из имеющегося, до 70 знаков","buy":"что докупить или пусто"}]}' },
            { modelTier: 'default', cache: false, temperature: 0.7 });
        }).then(function (v) { res = { ideas: (v && Array.isArray(v.ideas) ? v.ideas : []).filter(function (x) { return x && x.title; }).slice(0, 4).map(function (x) { return { title: String(x.title).slice(0, 60), why: String(x.why || '').slice(0, 90), buy: String(x.buy || '').slice(0, 50) }; }) }; redraw(); })
          .catch(function (e2) { res = { err: errText(e2) }; redraw(); });
      }
      lset('kuking:fridge', fridge); redraw();
      function redraw() { var bd = m.querySelector('.ks-body'); if (bd) { var y = bd.scrollTop; bd.innerHTML = body(); bd.scrollTop = y; } }
    });
    s.el.addEventListener('input', function (e) { if (e.target.id === 'ksFr') { fridge.txt = e.target.value; lset('kuking:fridge', fridge); } });
    function have() { return fridge.sel.concat(fridge.txt.split(/[,;\n]/).map(function (x) { return x.trim(); }).filter(Boolean)); }
  }
  function openRecipe(id) { if (window.KukingLib && KukingLib.show) KukingLib.show(id); }

  /* ---------- привязка к экрану списка ---------- */
  function bind(ov, all, rerender, query, only) {
    if (only) { askAI(query().trim(), all, rerender); return; }
    ov.querySelectorAll('[data-kcat]').forEach(function (b) { b.addEventListener('click', function () { F.cat = b.getAttribute('data-kcat'); hap(); save(); rerender(); }); });
    ov.querySelectorAll('[data-kcol]').forEach(function (b) {
      var t = null;
      b.addEventListener('click', function () { if (b.dataset.held) { delete b.dataset.held; return; } var id = b.getAttribute('data-kcol'); F.col = F.col === id ? '' : id; hap(); save(); rerender(); });
      b.addEventListener('touchstart', function () { t = setTimeout(function () { b.dataset.held = 1; delCol(b.getAttribute('data-kcol'), rerender); }, 600); }, { passive: true });
      b.addEventListener('touchend', function () { clearTimeout(t); }); b.addEventListener('touchmove', function () { clearTimeout(t); }, { passive: true });
      b.addEventListener('contextmenu', function (e) { e.preventDefault(); delCol(b.getAttribute('data-kcol'), rerender); });
    });
    ov.querySelectorAll('[data-ksaved]').forEach(function (b) {
      var t = null, i = +b.getAttribute('data-ksaved');
      b.addEventListener('click', function () { if (b.dataset.held) { delete b.dataset.held; return; } var s = saved[i]; if (!s) return; F = Object.assign({}, EMPTY, JSON.parse(JSON.stringify(s.f))); hap(); save(); rerender(); });
      b.addEventListener('touchstart', function () { t = setTimeout(function () { b.dataset.held = 1; delSaved(i, rerender); }, 600); }, { passive: true });
      b.addEventListener('touchend', function () { clearTimeout(t); }); b.addEventListener('touchmove', function () { clearTimeout(t); }, { passive: true });
      b.addEventListener('contextmenu', function (e) { e.preventDefault(); delSaved(i, rerender); });
    });
    ov.querySelectorAll('[data-kc]').forEach(function (b) { b.addEventListener('click', function () {
      var a = b.getAttribute('data-kc');
      if (a === 'filters') openFilters(all, rerender);
      if (a === 'fridge') openFridge(all);
      if (a === 'aiclear') { ai = null; rerender(); }
      if (a === 'ask') askAI(query().trim(), all, rerender);
    }); });
    ov.querySelectorAll('[data-kidea]').forEach(function (b) { b.addEventListener('click', function () { var x = ai && ai.ideas[+b.getAttribute('data-kidea')]; if (x && window.__kCustom) window.__kCustom(x.title, 'self'); }); });
  }
  function confirmSheet(title, text, yes, done) {
    sheet(title, '<p class="small">' + esc(text) + '</p>', '<button type="button" class="nav-btn" data-kq="no">Отмена</button><button type="button" class="nav-btn primary" data-kq="yes">' + esc(yes) + '</button>', function (e, m, shut) {
      var b = e.target.closest('[data-kq]'); if (!b) return; shut(); if (b.getAttribute('data-kq') === 'yes') done();
    });
  }
  function delCol(id, rerender) { var c = cols.filter(function (x) { return x.id === id; })[0]; if (!c) return; hap(15);
    confirmSheet('Удалить коллекцию?', '«' + c.name + '» — рецепты останутся в книге.', 'Удалить', function () { cols = cols.filter(function (x) { return x.id !== id; }); if (F.col === id) F.col = ''; saveCols(); save(); rerender(); }); }
  function delSaved(i, rerender) { var s = saved[i]; if (!s) return; hap(15);
    confirmSheet('Удалить фильтр?', '«' + s.name + '»', 'Удалить', function () { saved.splice(i, 1); saveSaved(); rerender(); }); }
  function clearAI() { ai = null; }

  window.KCat = { pass: pass, order: order, barHTML: barHTML, askHTML: askHTML, rowBadges: rowBadges, forYou: forYou, bind: bind, openCols: openCols, inCols: inCols, clearAI: clearAI, aiOn: function () { return !!(ai && ai.ids && !ai.busy); }, active: function () { return !!(F.cat || count() || F.col || ai); }, reset: function () { F = Object.assign({}, EMPTY, { diets: [], cuisine: [], main: [] }); ai = null; save(); } };
})();
