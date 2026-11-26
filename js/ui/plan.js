/* «План»: неделя по дням, покупки по плану (кладовка учтена), кладовка с количеством и сроками. */
(function () {
  'use strict';
  var Z = window.Z, D = Z.data, E = Z.esc;
  var tab = 'week', sel = null;
  var CHK = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  function render(arg) {
    if (arg === 'shop' || arg === 'pantry' || arg === 'week') tab = arg;
    else if (arg && /^\d{4}-\d\d-\d\d$/.test(arg)) { tab = 'week'; sel = arg; }
    if (!sel || sel < Z.today()) sel = Z.today();
    var left = D.shopList().filter(function (x) { return !x.got && !x.home; }).length;
    var h = '<header class="top"><h1 class="d1">План</h1><button type="button" class="btn btn-line btn-s" data-week>Собрать неделю</button></header>';
    h += '<div class="utabs" role="tablist" style="margin-top:14px">' + [['week', 'Неделя'], ['shop', 'Купить' + (left ? ', ' + left : '')], ['pantry', 'Кладовка']].map(function (t) {
      return '<button type="button" role="tab" data-tab2="' + t[0] + '" aria-selected="' + (tab === t[0]) + '">' + t[1] + '</button>'; }).join('') + '</div>';
    h += tab === 'week' ? week() : tab === 'shop' ? shopHTML() : pantryHTML();
    return h;
  }

  /* ---------- неделя ---------- */
  function week() {
    var t = Z.today(), ag = D.agenda(t, 14), h = '<div class="week" style="margin-top:16px">';
    ag.slice(0, 7).forEach(function (d) {
      var dd = Z.dParse(d.key), cls = d.key === t ? ' is-today' : '', cl2 = d.cook.length ? ' is-cook' : d.eat.length ? ' is-eat' : '';
      h += '<button type="button" class="day' + cls + cl2 + '" data-sel="' + d.key + '" aria-pressed="' + (d.key === sel) + '"><small>' + Z.DOW[dd.getDay()] + '</small><b>' + dd.getDate() + '</b><i></i></button>';
    });
    h += '</div>';
    var cookDays = ag.slice(0, 7).filter(function (d) { return d.cook.length; }).length, eatDays = ag.slice(0, 7).filter(function (d) { return !d.cook.length && d.eat.length; }).length;
    h += '<p class="small muted" style="margin-top:10px">' + (cookDays ? 'Готовишь ' + cookDays + ' ' + Z.plural(cookDays, 'раз', 'раза', 'раз') + (eatDays ? ', ' + eatDays + ' ' + Z.plural(eatDays, 'день', 'дня', 'дней') + ' доедаешь' : '') + '.' : 'На неделю ничего не запланировано.') + '</p>';

    var d = ag.filter(function (x) { return x.key === sel; })[0] || { key: sel, cook: D.dayIds(sel), eat: [] };
    h += '<section class="sec"><h2 class="d3">' + E(Z.dayRel(sel)) + '</h2>';
    if (d.cook.length) h += '<div class="stack" style="margin-top:12px">' + d.cook.map(function (id) {
      var r = D.byId(id), g = D.guestsFor(sel, id), done = D.isCooked(sel, id);
      return '<article class="card" style="display:flex;gap:0">' + '<a href="#/r/' + encodeURIComponent(id) + '" style="width:110px;flex:none" aria-label="' + E(r.title) + '">' + Z.img.html(r, '', 'height:100%;min-height:110px') + '</a>' +
        '<div class="pad grow"><a href="#/r/' + encodeURIComponent(id) + '" class="card-t" style="text-decoration:none;color:inherit;display:block">' + E(r.title) + '</a>' +
        '<p class="small muted" style="margin-top:4px">' + (done ? 'Приготовлено' : Z.dur(D.total(r))) + '</p>' +
        '<div class="row" style="margin-top:10px;gap:6px;flex-wrap:wrap"><div class="stepper"><button type="button" class="icon-btn" style="width:36px;height:36px" data-pg="-1" data-id="' + E(id) + '" aria-label="Меньше порций">' + Z.icon('minus') + '</button><span class="num" style="font-size:22px;min-width:28px">' + g + '</span><button type="button" class="icon-btn" style="width:36px;height:36px" data-pg="1" data-id="' + E(id) + '" aria-label="Больше порций">' + Z.icon('plus') + '</button></div>' +
        '<span class="grow"></span><button type="button" class="icon-btn" data-move="' + E(id) + '" aria-label="Перенести">' + Z.icon('cal') + '</button><button type="button" class="icon-btn" data-rm="' + E(id) + '" aria-label="Убрать из плана">' + Z.icon('trash') + '</button></div></div></article>';
    }).join('') + '</div>';
    if (d.eat.length) h += '<p class="lead" style="margin-top:12px">Доедаешь «' + E(D.byId(d.eat[0].id).title) + '».</p>';
    if (!d.cook.length && !d.eat.length) h += '<p class="muted" style="margin-top:8px">Пусто.</p>';
    h += '<button type="button" class="btn btn-soft btn-wide" data-add style="margin-top:14px">' + Z.icon('plus') + 'Добавить блюдо</button>';
    var tasks = D.tasks(14).filter(function (x) { return x.day === sel && x.kind !== 'cook'; });
    if (tasks.length) h += '<div class="stack" style="margin-top:14px">' + tasks.map(function (x) { return '<div class="note note-soft">' + Z.icon(x.kind === 'thaw' ? 'snow' : 'cart') + '<div class="grow"><p class="note-t">' + E(x.title) + '</p><p class="note-s">' + E(x.body) + '</p></div></div>'; }).join('') + '</div>';
    h += '</section>';
    var c = D.cfg();
    h += '<section class="sec"><button type="button" class="card pad" data-cfg style="display:flex;align-items:center;gap:12px">' + Z.icon('bell') + '<span class="grow"><span style="font-weight:600;display:block">Напоминания</span><span class="small muted">Готовка к ' + E(c.cook) + (c.shopDay != null ? ', закупка по ' + ['воскресеньям', 'понедельникам', 'вторникам', 'средам', 'четвергам', 'пятницам', 'субботам'][c.shopDay] : '') + ', мясо ' + (c.meat === 'freeze' ? 'храню в морозилке' : 'покупаю свежее') + '</span></span>' + Z.icon('next') + '</button></section>';
    return h;
  }

  /* ---------- покупки ---------- */
  function shopHTML() {
    var items = D.shopList(), src = D.shopSources(), h = '';
    if (!src.length && !items.length) return '<div class="empty"><p class="d3">Покупать нечего</p><p>Добавь блюда в план — список соберётся сам, с учётом кладовки.</p><a class="btn btn-act" href="#/book" style="margin-top:16px">Открыть книгу</a></div>';
    h += '<div class="chips" style="margin-top:14px" aria-label="Для каких блюд">' + src.map(function (s, i) { var r = D.byId(s.id); return '<span class="chip" style="display:inline-flex;align-items:center;gap:6px;padding-right:4px">' + E(r.title) + (s.day ? ' <span class="muted">' + Z.DOW[Z.dParse(s.day).getDay()] + '</span>' : '') + '<button type="button" class="icon-btn" style="width:32px;height:32px;border:0;background:transparent" data-unsrc="' + i + '" aria-label="Не покупать для ' + E(r.title) + '">' + Z.icon('x') + '</button></span>'; }).join('') + '</div>';
    h += '<form id="xf" class="row" style="margin-top:12px"><label class="sr" for="xi">Добавить своё</label><input id="xi" class="inp" placeholder="Своё: хлеб, кофе…" autocomplete="off"><button class="icon-btn" aria-label="Добавить">' + Z.icon('plus') + '</button></form>';
    var buy = items.filter(function (x) { return !x.home && !x.got; }), got = items.filter(function (x) { return x.got; }), home = items.filter(function (x) { return x.home && !x.got; });
    var by = {}; buy.forEach(function (x) { (by[x.dept] = by[x.dept] || []).push(x); });
    D.DORDER.forEach(function (dp) { if (!by[dp]) return; h += '<p class="grp">' + E(D.DNAME[dp]) + '</p><ul class="list">' + by[dp].map(row).join('') + '</ul>'; });
    if (!buy.length) h += '<p class="lead" style="margin-top:16px">Всё куплено.</p>';
    if (home.length) h += '<details style="margin-top:18px"><summary style="min-height:44px;display:flex;align-items:center;font-weight:600;cursor:pointer">Есть дома: ' + home.length + '</summary><p class="small muted">Взято из кладовки. Если чего-то нет — отметь, и я добавлю в покупки.</p><ul class="list">' + home.map(function (x) { return '<li class="li" style="align-items:center"><span class="grow">' + E(x.name) + ' <span class="small muted">' + E(x.qty) + '</span><span class="chk-sub">' + E(x.homeNote) + '</span></span><button type="button" class="btn btn-soft btn-s" data-nohome="' + E(x.name) + '">Нет дома</button></li>'; }).join('') + '</ul></details>';
    if (got.length) h += '<details style="margin-top:8px"><summary style="min-height:44px;display:flex;align-items:center;font-weight:600;cursor:pointer">Куплено: ' + got.length + '</summary><p class="small muted">Купленное уже в кладовке.</p><ul class="list">' + got.map(row).join('') + '</ul><button type="button" class="btn btn-ghost btn-s" data-clear>Очистить отметки</button></details>';
    return h;
  }
  function row(x) {
    var sub = x.extra ? 'своё' : x.rids.map(function (id) { var r = D.byId(id); return r ? r.title : ''; }).join(', ');
    if (x.homeNote) sub = x.homeNote + (sub ? ' · ' + sub : '');
    return '<li><button type="button" class="chk" role="checkbox" aria-checked="' + x.got + '" data-buy="' + E(x.key) + '"><span class="chk-box">' + CHK + '</span><span class="grow"><span class="chk-name">' + E(x.name) + '</span><span class="chk-sub">' + E(sub) + '</span></span><span class="chk-q">' + E(x.qty) + '</span></button></li>';
  }

  /* ---------- кладовка ---------- */
  function pantryHTML() {
    var P = D.pantry(), h = '<div class="row" style="margin-top:14px"><p class="small muted grow">Что есть дома. Список покупок вычитает это сам, готовка списывает.</p><button type="button" class="btn btn-act btn-s" data-padd>' + Z.icon('plus') + 'Добавить</button></div>';
    if (!P.length) return h + '<div class="empty"><p class="d3">Кладовка пуста</p><p>Добавь, что есть дома: соль, масло, крупы, специи. Купленное по списку попадёт сюда само.</p></div>';
    var idx = P.map(function (p, i) { return i; });
    var soon = idx.filter(function (i) { var dl = D.daysLeft(P[i]); return dl != null && dl <= 2; }).sort(function (a, b) { return D.daysLeft(P[a]) - D.daysLeft(P[b]); });
    if (soon.length) h += '<p class="grp" style="color:var(--warn);font-weight:600">Скоро испортится</p><ul class="list">' + soon.map(prow).join('') + '</ul>';
    var by = {}; idx.filter(function (i) { return soon.indexOf(i) < 0; }).forEach(function (i) { var dp = D.dept(P[i].name); (by[dp] = by[dp] || []).push(i); });
    D.DORDER.forEach(function (dp) { if (!by[dp]) return; by[dp].sort(function (a, b) { return P[a].name.localeCompare(P[b].name, 'ru'); }); h += '<p class="grp">' + E(D.DNAME[dp]) + '</p><ul class="list">' + by[dp].map(prow).join('') + '</ul>'; });
    return h;
  }
  function prow(i) {
    var p = D.pantry()[i], dl = D.daysLeft(p), q = p.amount == null || p.amount === '' ? 'есть' : D.fmtQ(D.norm(p.amount, p.unit, p.name).a, D.norm(p.amount, p.unit, p.name).u);
    var exp = dl == null ? (p.noexp || !D.shelf(p.name) ? '' : '<span class="small" style="color:var(--act)">срок?</span>') : dl < 0 ? '<span class="small" style="color:var(--warn)">просрочено</span>' : dl === 0 ? '<span class="small" style="color:var(--warn)">сегодня</span>' : '<span class="small muted">' + dl + ' ' + Z.plural(dl, 'день', 'дня', 'дней') + '</span>';
    return '<li><button type="button" class="chk" data-pi="' + i + '" style="min-height:52px"><span class="grow"><span class="chk-name">' + E(p.name) + '</span></span>' + exp + '<span class="chk-q">' + E(q) + '</span></button></li>';
  }
  function pSheet(i) {
    var P = D.pantry(), p = i != null ? Object.assign({}, P[i]) : { name: '', amount: null, unit: 'г', exp: null };
    var units = ['г', 'кг', 'мл', 'л', 'шт'], many = i != null && (p.amount == null || p.amount === '');
    function body() {
      var sh = D.shelf(p.name || '');
      return '<div class="fld" style="margin-top:0"><label for="pn">Что</label><input id="pn" class="inp" value="' + E(p.name) + '" placeholder="Например, гречка" autocomplete="off"' + (i == null ? ' autofocus' : '') + '></div>' +
        '<div class="fld"><label for="pa">Сколько</label><div class="row"><input id="pa" class="inp" inputmode="decimal" style="max-width:130px" value="' + (many ? '' : E(Z.fmtNum(+p.amount))) + '" placeholder="' + (many ? 'много' : '0') + '"' + (many ? ' disabled' : '') + '>' +
        '<div class="chips" style="margin:0;padding:0">' + units.map(function (u) { return '<button type="button" class="chip" data-u="' + u + '" aria-pressed="' + (!many && p.unit === u) + '">' + u + '</button>'; }).join('') + '</div></div>' +
        '<button type="button" class="chip" data-many aria-pressed="' + many + '" style="align-self:flex-start;margin-top:6px">Есть много, не считать</button></div>' +
        '<div class="fld"><label>Годен до</label><div class="chips" style="margin:0;padding:0;flex-wrap:wrap">' + [[1, 'Завтра'], [3, '3 дня'], [7, 'Неделя'], [30, 'Месяц'], [-1, 'Не портится']].map(function (x) {
          var on = x[0] < 0 ? (!p.exp && (p.noexp || !sh)) : p.exp === Z.addDays(Z.today(), x[0]);
          return '<button type="button" class="chip" data-e="' + x[0] + '" aria-pressed="' + on + '">' + x[1] + '</button>'; }).join('') + '</div>' +
        '<input id="pe" class="inp" type="date" value="' + E(p.exp || '') + '" style="margin-top:8px"></div>' +
        '<div class="row" style="margin-top:20px">' + (i != null ? '<button type="button" class="btn btn-soft" data-pdel style="color:var(--warn)">Удалить</button>' : '') + '<button type="button" class="btn btn-act grow" data-psave>Сохранить</button></div>';
    }
    var s = Z.sheet(i != null ? 'Кладовка' : 'Добавить в кладовку', body());
    function readInputs() { var n = s.body.querySelector('#pn'), a = s.body.querySelector('#pa'), e = s.body.querySelector('#pe'); p.name = n.value; if (!many) p.amount = a.value === '' ? null : +String(a.value).replace(',', '.'); if (e.value) { p.exp = e.value; p.noexp = false; } }
    s.body.onclick = function (ev) {
      var b = ev.target.closest('[data-u]'); if (b) { readInputs(); many = false; p.unit = b.getAttribute('data-u'); s.set(body()); return; }
      if (ev.target.closest('[data-many]')) { readInputs(); many = !many; if (many) p.amount = null; s.set(body()); return; }
      b = ev.target.closest('[data-e]'); if (b) { readInputs(); var n = +b.getAttribute('data-e'); if (n < 0) { p.exp = null; p.noexp = true; } else { p.exp = Z.addDays(Z.today(), n); p.noexp = false; } s.set(body()); return; }
      if (ev.target.closest('[data-pdel]')) { var x = D.pDel(i); s.close(); Z.toast('Удалил «' + x.name + '»', 'Вернуть', function () { D.pUndo(i, x); }); return; }
      if (ev.target.closest('[data-psave]')) {
        readInputs(); if (!p.name.trim()) { s.body.querySelector('#pn').focus(); return; }
        if (!many && !(p.amount > 0)) { s.body.querySelector('#pa').focus(); return; }
        var u = p.unit, a = p.amount; if (!many && u === 'кг') { a = a * 1000; u = 'г'; } if (!many && u === 'л') { a = a * 1000; u = 'мл'; }
        D.pPut({ name: p.name, amount: many ? null : a, unit: many ? '' : u, exp: p.exp || null, noexp: !p.exp && (p.noexp || !D.shelf(p.name)) }, i);
        s.close(); Z.haptic(8);
      }
    };
  }
  Z.pantrySheet = pSheet;

  /* ---------- добавить блюдо в день ---------- */
  function addSheet(day) {
    var q = '';
    function list() {
      var nq = D.nk(q);
      return D.all().filter(function (r) { return !nq || D.nk(r.title).indexOf(nq) >= 0; }).slice(0, 40).map(function (r) {
        var v = D.review(r.id);
        return '<li><button type="button" class="chk" data-pick="' + E(r.id) + '"><span class="grow"><span class="chk-name">' + E(r.title) + '</span><span class="chk-sub">' + Z.dur(D.total(r)) + (v ? ', оценка ' + v.score : '') + ', ' + E(D.MODE[D.mode(r)].toLowerCase()) + '</span></span>' + Z.icon('plus') + '</button></li>'; }).join('');
    }
    var s = Z.sheet(Z.dayRel(day), '<input class="inp search" id="aq" placeholder="Найти блюдо" autocomplete="off"><ul class="list" id="al" style="margin-top:8px">' + list() + '</ul><button type="button" class="btn btn-soft btn-wide" data-gen style="margin-top:14px">' + Z.icon('spark') + 'Придумать новое</button>');
    s.body.querySelector('#aq').oninput = function (e) { q = e.target.value; s.body.querySelector('#al').innerHTML = list(); };
    s.body.onclick = function (e) {
      var b = e.target.closest('[data-pick]'); if (b) { var id = b.getAttribute('data-pick'), r = D.byId(id); D.planAdd(day, id, r.baseGuests); s.close(); Z.haptic(10); Z.toast('«' + r.title + '» в плане'); return; }
      if (e.target.closest('[data-gen]')) { s.close(); Z.gen.recipe({ day: day }); }
    };
  }
  function moveSheet(id) {
    var t = Z.today(), h = '<div class="week">';
    for (var i = 0; i < 14; i++) { var k = Z.addDays(t, i), d = Z.dParse(k); h += '<button type="button" class="day' + (D.dayIds(k).length ? ' is-cook' : '') + '" data-to="' + k + '" aria-pressed="' + (k === sel) + '"><small>' + Z.DOW[d.getDay()] + '</small><b>' + d.getDate() + '</b><i></i></button>'; }
    var s = Z.sheet('Перенести', h + '</div>');
    s.body.onclick = function (e) { var b = e.target.closest('[data-to]'); if (!b) return; var k2 = b.getAttribute('data-to'); D.planMove(sel, id, k2); sel = k2; s.close(); Z.toast('Перенёс на ' + Z.dayOn(k2)); };
  }
  function cfgSheet() {
    var c = D.cfg();
    function body() {
      return '<div class="fld" style="margin-top:0"><label for="ct">Обычно сажусь есть в</label><input id="ct" class="inp" type="time" value="' + E(c.cook) + '"></div>' +
        '<p class="small muted" style="margin-top:6px">Напомню за 30 минут до начала готовки — время начала считаю от длины рецепта.</p>' +
        '<div class="fld"><label>Закупка раз в неделю</label><div class="chips" style="margin:0;padding:0;flex-wrap:wrap">' + [[null, 'Без напоминания'], [1, 'пн'], [2, 'вт'], [3, 'ср'], [4, 'чт'], [5, 'пт'], [6, 'сб'], [0, 'вс']].map(function (x) { return '<button type="button" class="chip" data-sd="' + x[0] + '" aria-pressed="' + (c.shopDay === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div></div>' +
        '<div class="fld"><label>Мясо</label><div class="seg"><button type="button" data-meat="fresh" aria-selected="' + (c.meat !== 'freeze') + '">Покупаю под готовку</button><button type="button" data-meat="freeze" aria-selected="' + (c.meat === 'freeze') + '">Держу в морозилке</button></div></div>' +
        '<p class="small muted" style="margin-top:8px">Если мясо куплено заранее, накануне вечером напомню переложить его в холодильник.</p>';
    }
    var s = Z.sheet('Напоминания', body());
    s.body.onclick = function (e) {
      var b = e.target.closest('[data-sd]'); if (b) { var v = b.getAttribute('data-sd'); D.setCfg('shopDay', v === 'null' ? null : +v); c = D.cfg(); s.set(body()); return; }
      b = e.target.closest('[data-meat]'); if (b) { D.setCfg('meat', b.getAttribute('data-meat')); c = D.cfg(); s.set(body()); }
    };
    s.body.onchange = function (e) { if (e.target.id === 'ct' && e.target.value) D.setCfg('cook', e.target.value); };
  }

  function mount(el) {
    el.onclick = function (e) {
      var b;
      if ((b = e.target.closest('[data-tab2]'))) { tab = b.getAttribute('data-tab2'); Z.go('plan/' + tab, true); return; }
      if ((b = e.target.closest('[data-sel]'))) { sel = b.getAttribute('data-sel'); Z.render(true); return; }
      if (e.target.closest('[data-week]')) { Z.gen.week(); return; }
      if (e.target.closest('[data-add]')) { addSheet(sel); return; }
      if (e.target.closest('[data-cfg]')) { cfgSheet(); return; }
      if ((b = e.target.closest('[data-rm]'))) { var id = b.getAttribute('data-rm'), g = D.guestsFor(sel, id), k = sel; D.planRemove(k, id); Z.toast('Убрал из плана', 'Вернуть', function () { D.planAdd(k, id, g); }); return; }
      if ((b = e.target.closest('[data-move]'))) { moveSheet(b.getAttribute('data-move')); return; }
      if ((b = e.target.closest('[data-pg]'))) { var id2 = b.getAttribute('data-id'); D.setGuests(sel, id2, Math.max(1, Math.min(16, D.guestsFor(sel, id2) + +b.getAttribute('data-pg')))); Z.haptic(5); return; }
      if ((b = e.target.closest('[data-buy]'))) { var key = b.getAttribute('data-buy'), it = D.shopList().filter(function (x) { return x.key === key; })[0]; if (it) { D.shopToggle(it); Z.haptic(6); } return; }
      if ((b = e.target.closest('[data-unsrc]'))) { var s = D.shopSources()[+b.getAttribute('data-unsrc')]; if (s) { D.shopRemoveSource(s); Z.toast('Не покупаю для «' + D.byId(s.id).title + '»'); } return; }
      if ((b = e.target.closest('[data-nohome]'))) { var nm = b.getAttribute('data-nohome'), p = D.pFind(nm); if (p) { var i = D.pantry().indexOf(p); var x = D.pDel(i); Z.toast('«' + x.name + '» — в покупки', 'Отменить', function () { D.pUndo(i, x); }); } return; }
      if (e.target.closest('[data-clear]')) { D.shopClearGot(); return; }
      if (e.target.closest('[data-padd]')) { pSheet(null); return; }
      if ((b = e.target.closest('[data-pi]'))) { pSheet(+b.getAttribute('data-pi')); }
    };
    el.onsubmit = function (e) { if (e.target.id !== 'xf') return; e.preventDefault(); var i = el.querySelector('#xi'); if (i.value.trim()) { var v = i.value.trim(); i.value = ''; D.shopAddExtra(v); Z.haptic(6); setTimeout(function () { var ni = document.getElementById('xi'); if (ni) ni.focus(); }, 120); } };
  }
  Z.screens.plan = { render: render, mount: mount };
})();
