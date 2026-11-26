/* Рецепт: фото, факты, порции с пересчётом, продукты (с учётом кладовки), посуда, отзывы друзей. */
(function () {
  'use strict';
  var Z = window.Z, D = Z.data, E = Z.esc;
  function gKey(id) { return 'kuking:g5:' + id; }
  Z.portions = function (r) { return Z.ls.get(gKey(r.id), 0) || r.baseGuests || 2; };

  function render(id) {
    var r = D.byId(id);
    if (!r) return '<header class="top"><button type="button" class="icon-btn" data-back aria-label="Назад">' + Z.icon('back') + '</button></header><div class="empty"><p class="d3">Рецепта нет</p><p>Его удалили или он ещё не пришёл с другого устройства.</p></div>';
    var g = Z.portions(r), k = D.kcal(r), v = D.review(id), h = '';
    h += '<div class="hero">' + Z.img.html(r, '', 'height:100%') + '<button type="button" class="icon-btn back" data-back aria-label="Назад">' + Z.icon('back') + '</button></div>';
    h += '<div style="margin-top:18px"><p class="small muted">' + E(D.MODE[D.mode(r)]) + (r.meta && r.meta.cuisine ? ', ' + E(r.meta.cuisine.toLowerCase()) + ' кухня' : '') + (v ? ', оценка ' + v.score : '') + '</p>';
    h += '<h1 class="d2" style="margin-top:6px">' + E(r.title) + '</h1>';
    if (r.tagline) h += '<p class="lead" style="font-size:16px;color:var(--muted)">' + E(r.tagline.replace(/\s·\s/g, ', ')) + '</p>';
    h += '<div class="facts"><div><span class="num">' + Z.dur(D.total(r)) + '</span><span class="small muted">всего</span></div>' +
      (D.active(r) ? '<div><span class="num">' + D.active(r) + ' мин</span><span class="small muted">руками</span></div>' : '') +
      (k ? '<div><span class="num">' + k.kcal + '</span><span class="small muted">ккал, белок ' + k.p + ' г</span></div>' : '') + '</div>';
    h += '<div class="bar" style="margin-top:18px"><div><p style="font-weight:600">Порции</p><p class="small muted">в рецепте ' + r.baseGuests + '</p></div><div class="stepper">' +
      '<button type="button" class="icon-btn" data-g="-1" aria-label="Меньше порций">' + Z.icon('minus') + '</button><span class="num" aria-live="polite">' + g + '</span>' +
      '<button type="button" class="icon-btn" data-g="1" aria-label="Больше порций">' + Z.icon('plus') + '</button></div></div>';

    /* продукты по группам */
    h += '<section class="sec"><h2 class="h-sec">Что нужно</h2>';
    var groups = r.groups || ['Продукты'];
    groups.forEach(function (gn, gi) {
      var items = (r.ingredients || []).filter(function (i) { return (i.g || 0) === gi; }); if (!items.length) return;
      h += '<p class="grp">' + E(gn) + '</p><ul class="list">' + items.map(function (i) {
        var q = i.amount == null ? (i.unitText || '') : Z.fmtNum(D.scale(i, i.amount, g, r.baseGuests)) + ' ' + i.unit, p = D.pFind(i.name);
        return '<li class="li"><span>' + E(i.name) + (p ? ' <span class="small" style="color:var(--ok)">есть дома</span>' : '') + '</span><span class="muted" style="white-space:nowrap">' + E(q) + '</span></li>';
      }).join('') + '</ul>';
    });
    h += '</section>';

    /* посуда */
    var tools = []; (r.tools || []).forEach(function (z) { (z.items || []).forEach(function (t) { tools.push(t); }); });
    if (tools.length) h += '<section class="sec"><h2 class="h-sec">Посуда</h2><ul class="list">' + tools.map(function (t) { return '<li class="li"><span>' + E(t.name) + '</span><span class="small muted" style="text-align:right">' + E(t.use || '') + '</span></li>'; }).join('') + '</ul></section>';

    /* шаги кратко */
    var steps = D.steps(r);
    h += '<section class="sec"><h2 class="h-sec">Как готовим</h2><ol style="margin:0;padding-left:22px;display:flex;flex-direction:column;gap:6px">' + steps.map(function (s) { return '<li><b>' + E(s.title) + '</b>' + (s.dur ? ' <span class="small muted">' + E(s.dur) + '</span>' : '') + '</li>'; }).join('') + '</ol></section>';

    /* оценка */
    h += '<section class="sec card pad"><p class="h-sec">' + (v ? 'Твоя оценка: ' + v.score : 'Твоя оценка') + '</p><div class="scale" role="group" aria-label="Оценка от 1 до 10">' +
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(function (n) { return '<button type="button" data-rate="' + n + '" aria-pressed="' + (!!v && v.score === n) + '">' + n + '</button>'; }).join('') + '</div></section>';

    /* друзья: отзывы и комментарии — свой узел, обновляется отдельно */
    h += '<section class="sec" id="hub" data-rid="' + E(r.id) + '">' + (Z.social ? Z.social.recipeHTML(r) : '') + '</section>';

    h += '<section class="sec row" style="justify-content:center;gap:4px;flex-wrap:wrap">' +
      (Z.img && window.KukingAI && KukingAI.canImage && KukingAI.canImage() ? '<button type="button" class="btn btn-ghost btn-s" data-photo>Переснять фото</button>' : '') +
      '<button type="button" class="btn btn-ghost btn-s" data-share>Отправить другу</button><button type="button" class="btn btn-ghost btn-s" data-hide style="color:var(--warn)">В корзину</button></section>';
    h += '<div style="height:84px"></div>';
    h += '<div class="dock"><div class="dock-in"><button type="button" class="btn btn-soft" data-plan>В план</button><button type="button" class="btn btn-line" data-shop>В покупки</button><button type="button" class="btn btn-act" data-cook>Готовить</button></div></div>';
    return h;
  }

  function mount(el, id) {
    var r = D.byId(id);
    el.onclick = function (e) {
      var b;
      if (e.target.closest('[data-back]')) { Z.back('book'); return; }
      if (!r) return;
      if ((b = e.target.closest('[data-g]'))) { var g = Math.max(1, Math.min(16, Z.portions(r) + +b.getAttribute('data-g'))); Z.ls.set(gKey(r.id), g); Z.haptic(6); Z.render(true); return; }
      if ((b = e.target.closest('[data-rate]'))) { var n = +b.getAttribute('data-rate'), v = D.review(r.id); D.rate(r.id, v && v.score === n ? 0 : n); Z.haptic(8); return; }
      if (e.target.closest('[data-cook]')) { Z.cook.open(r.id, null); return; }
      if (e.target.closest('[data-shop]')) { D.shopAddRecipe(r.id, Z.portions(r)); Z.haptic(10); Z.toast('В покупках: ' + r.title, 'Открыть', function () { Z.go('plan/shop'); }); return; }
      if (e.target.closest('[data-plan]')) { planSheet(r); return; }
      if (e.target.closest('[data-photo]')) { Z.img.redo(r); Z.toast('Снимаю новое фото, это 20–60 секунд'); return; }
      if (e.target.closest('[data-share]')) { if (Z.social) Z.social.shareRecipe(r); return; }
      if (e.target.closest('[data-hide]')) { D.hide(r.id); Z.back('book'); Z.toast('«' + r.title + '» в корзине', 'Вернуть', function () { D.restore(r.id); }); return; }
      if (Z.social) Z.social.recipeClick(e, r);
    };
    if (Z.social && r) Z.social.loadRecipe(r);
  }

  /* в план: выбрать день и порции */
  function planSheet(r) {
    var t = Z.today(), sel = D.nextCook(r.id) || t, g = Z.portions(r);
    function body() {
      var days = ''; for (var i = 0; i < 14; i++) { var k = Z.addDays(t, i), d = Z.dParse(k), busy = D.dayIds(k).length;
        days += '<button type="button" class="day' + (busy ? ' is-cook' : '') + '" data-day="' + k + '" aria-pressed="' + (k === sel) + '"><small>' + Z.DOW[d.getDay()] + '</small><b>' + d.getDate() + '</b><i></i></button>'; }
      var ag = D.agenda(sel, 1)[0];
      return '<p class="small muted">Оранжевая точка — в этот день уже что-то готовишь.</p><div class="week" style="margin-top:10px;grid-template-columns:repeat(7,minmax(0,1fr))">' + days + '</div>' +
        '<p style="margin-top:14px;font-weight:600">' + E(Z.dayRel(sel)) + '</p>' + (ag.cook.length ? '<p class="small muted">Уже в плане: ' + ag.cook.map(function (id) { return E(D.byId(id).title); }).join(', ') + '</p>' : '') +
        '<div class="bar" style="margin-top:12px"><p style="font-weight:600">Порции</p><div class="stepper"><button type="button" class="icon-btn" data-pg="-1" aria-label="Меньше">' + Z.icon('minus') + '</button><span class="num">' + g + '</span><button type="button" class="icon-btn" data-pg="1" aria-label="Больше">' + Z.icon('plus') + '</button></div></div>' +
        (D.mode(r) === 'self' && g > 1 ? '<p class="small muted" style="margin-top:8px">' + g + ' ' + Z.plural(g, 'порция', 'порции', 'порций') + ': остальные дни будешь доедать, план это учтёт.</p>' : '') +
        '<button type="button" class="btn btn-act btn-wide" data-ok style="margin-top:18px">Добавить в план</button>';
    }
    var sh = Z.sheet('В план', body());
    sh.body.onclick = function (e) {
      var b = e.target.closest('[data-day]'); if (b) { sel = b.getAttribute('data-day'); sh.set(body()); return; }
      b = e.target.closest('[data-pg]'); if (b) { g = Math.max(1, Math.min(16, g + +b.getAttribute('data-pg'))); sh.set(body()); return; }
      if (e.target.closest('[data-ok]')) { D.planAdd(sel, r.id, g); sh.close(); Z.haptic(12); Z.toast('В плане на ' + Z.dayRel(sel).toLowerCase(), 'Открыть', function () { Z.go('plan/' + sel); }); }
    };
  }
  Z.planSheet = planSheet;
  Z.screens.recipe = { noTabs: true, render: render, mount: mount };
})();
