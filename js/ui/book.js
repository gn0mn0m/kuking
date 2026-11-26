/* «Книга»: поиск, режим (для себя, вдвоём, компания), карточки с фото. Ближайшее из плана — наверху. */
(function () {
  'use strict';
  var Z = window.Z, D = Z.data, E = Z.esc;
  var st = { q: '', mode: Z.ls.get('kuking:bookMode', 'all') };

  function tag(r) {
    var nx = D.nextCook(r.id); if (!nx) return '';
    var t = Z.today(); return nx === t ? 'Сегодня' : nx === Z.addDays(t, 1) ? 'Завтра' : Z.DOW_FULL[Z.dParse(nx).getDay()];
  }
  function meta(r) {
    var v = D.review(r.id), m = [Z.dur(D.total(r))];
    if (v) m.push('оценка ' + v.score); else if (D.isAI(r)) m.push('новое');
    return m.join(', ');
  }
  function list() {
    var q = D.nk(st.q);
    return D.all().filter(function (r) {
      if (st.mode !== 'all' && D.mode(r) !== st.mode) return false;
      if (!q) return true;
      var hay = D.nk(r.title + ' ' + (r.tagline || '') + ' ' + (r.tags || []).join(' ') + ' ' + ((r.meta && r.meta.cuisine) || '') + ' ' + (r.ingredients || []).map(function (i) { return i.name; }).join(' '));
      return q.split(' ').every(function (w) { return hay.indexOf(w) >= 0; });
    }).sort(function (a, b) {
      var na = D.nextCook(a.id) || '9', nb = D.nextCook(b.id) || '9'; if (na !== nb) return na < nb ? -1 : 1;
      var sa = (D.review(a.id) || {}).score || 0, sb = (D.review(b.id) || {}).score || 0; if (sa !== sb) return sb - sa;
      return (b.added || '').localeCompare(a.added || '');
    });
  }
  function render() {
    var items = list(), h = '';
    h += '<header class="top"><h1 class="d1">Книга</h1></header>';
    h += '<label class="sr" for="bq">Поиск по рецептам</label><input id="bq" class="inp search" type="search" placeholder="Блюдо, мясо, кухня" value="' + E(st.q) + '" style="margin-top:14px" autocomplete="off">';
    h += '<div class="chips" role="group" aria-label="Для кого" style="margin-top:12px">' + [['all', 'Все'], ['self', 'Для себя'], ['two', 'Вдвоём'], ['crew', 'Компания']].map(function (m) {
      return '<button type="button" class="chip" data-mode="' + m[0] + '" aria-pressed="' + (st.mode === m[0]) + '">' + m[1] + '</button>'; }).join('') + '</div>';
    h += '<div id="bookList">' + listHTML(items) + '</div>';
    var bin = D.binned().length;
    if (bin) h += '<p style="text-align:center;margin-top:24px"><button type="button" class="btn btn-ghost" data-bin>Корзина: ' + bin + ' ' + Z.plural(bin, 'рецепт', 'рецепта', 'рецептов') + '</button></p>';
    h += '<button type="button" class="btn btn-brand" data-new style="position:fixed;right:max(20px, calc(50% - 300px));bottom:calc(var(--tab-h) + var(--safe-b) + 16px);z-index:20;box-shadow:0 6px 18px rgba(0,0,0,.18)">' + Z.icon('plus') + 'Новый рецепт</button>';
    return h;
  }
  function listHTML(items) {
    if (!items.length) return '<div class="empty"><p class="d3">Ничего не нашёл</p><p>Попробуй другое слово или попроси нейросеть придумать рецепт.</p></div>';
    var first = items[0], rest = items.slice(1), tg = tag(first);
    var h = '<div class="stack" style="margin-top:16px"><a class="card" href="#/r/' + encodeURIComponent(first.id) + '"><div style="position:relative">' + Z.img.html(first, '', 'height:170px') + (tg ? '<span class="ph-tag">' + tg + '</span>' : '') + '</div>' +
      '<div class="pad"><p class="d3">' + E(first.title) + '</p><p class="small muted" style="margin-top:6px">' + E(meta(first)) + '</p></div></a>';
    if (rest.length) h += '<div class="grid2">' + rest.map(function (r) {
      var t = tag(r);
      return '<a class="card" href="#/r/' + encodeURIComponent(r.id) + '"><div style="position:relative">' + Z.img.html(r, '', 'height:112px') + (t ? '<span class="ph-tag" style="right:8px;top:8px;font-size:12px">' + t + '</span>' : '') + '</div>' +
        '<div style="padding:10px 12px 12px"><p class="card-t">' + E(r.title) + '</p><p class="small muted" style="margin-top:4px">' + E(meta(r)) + '</p></div></a>';
    }).join('') + '</div>';
    return h + '</div>';
  }
  function mount(el) {
    var inp = el.querySelector('#bq');
    inp.oninput = function () { st.q = inp.value; el.querySelector('#bookList').innerHTML = listHTML(list()); Z.img.paint(); };
    el.onclick = function (e) {
      var b = e.target.closest('[data-mode]');
      if (b) { st.mode = b.getAttribute('data-mode'); Z.ls.set('kuking:bookMode', st.mode); el.querySelectorAll('[data-mode]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); el.querySelector('#bookList').innerHTML = listHTML(list()); Z.img.paint(); return; }
      if (e.target.closest('[data-new]')) { Z.gen.recipe(); return; }
      if (e.target.closest('[data-bin]')) binSheet();
    };
  }
  function binSheet() {
    function body() {
      var b = D.binned(); if (!b.length) return '<p class="muted">Корзина пуста.</p>';
      return '<p class="small muted">Через 30 дней рецепт удалится сам.</p><ul class="list" style="margin-top:8px">' + b.map(function (r) {
        return '<li class="li" style="align-items:center"><span class="grow">' + E(r.title) + '</span><button type="button" class="btn btn-soft btn-s" data-rs="' + E(r.id) + '">Вернуть</button><button type="button" class="icon-btn" data-kill="' + E(r.id) + '" aria-label="Удалить навсегда">' + Z.icon('trash') + '</button></li>'; }).join('') + '</ul>';
    }
    var sh = Z.sheet('Корзина', body());
    sh.body.onclick = function (e) {
      var b = e.target.closest('[data-rs]'); if (b) { D.restore(b.getAttribute('data-rs')); sh.set(body()); return; }
      b = e.target.closest('[data-kill]'); if (b) { D.purge(b.getAttribute('data-kill')); Z.haptic(10); sh.set(body()); }
    };
  }
  Z.screens.book = { render: render, mount: mount };
})();
