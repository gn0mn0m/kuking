/* «Сегодня»: что делать сегодня — готовить, доедать или выбрать блюдо; дела на вечер; оценка вчерашнего. */
(function () {
  'use strict';
  var Z = window.Z, D = Z.data, E = Z.esc;

  function cookCard(k, id) {
    var r = D.byId(id), g = D.guestsFor(k, id), done = D.isCooked(k, id), t = D.total(r);
    var cookAt = D.cfg().cook || '19:00', x = cookAt.split(':'), st = new Date(); st.setHours(+x[0], +x[1], 0, 0); st = new Date(st - t * 60000);
    var startTxt = st.getHours() < 10 ? 'к ' + cookAt : 'начать в ' + String(st.getHours()).padStart(2, '0') + ':' + String(st.getMinutes()).padStart(2, '0');
    return '<article class="card">' +
      '<a href="#/r/' + encodeURIComponent(id) + '" aria-label="Открыть рецепт ' + E(r.title) + '">' + Z.img.html(r, '', 'height:190px') + '</a>' +
      '<div class="pad"><p class="d3">' + E(r.title) + '</p>' +
      '<p class="small muted" style="margin-top:6px">' + Z.dur(t) + ', ' + g + ' ' + Z.plural(g, 'порция', 'порции', 'порций') + (done ? '' : ', ' + startTxt) + '</p>' +
      '<div class="row" style="margin-top:14px">' + (done
        ? '<p class="grow" style="color:var(--ok);font-weight:600">Приготовлено</p><button type="button" class="btn btn-soft btn-s" data-uncook="' + E(k + '|' + id) + '">Отменить</button>'
        : '<button type="button" class="btn btn-act grow" data-cook="' + E(id) + '" data-day="' + k + '">Готовить</button><button type="button" class="btn btn-soft" data-cooked="' + E(k + '|' + id) + '">Уже приготовил</button>') +
      '</div></div></article>';
  }

  function render() {
    var t = Z.today(), ag = D.agenda(t, 5), td = ag[0], h = '';
    var name = (Z.social && Z.social.myNick && Z.social.myNick()) || '';
    h += '<header class="top"><p class="muted">' + E(Z.dayLong(t)) + '</p><button type="button" class="icon-btn" data-set aria-label="Настройки и профиль" style="background:var(--brand);color:var(--brand-ink);border:0;font-weight:600">' + (name ? E(name[0].toUpperCase()) : Z.icon('gear')) + '</button></header>';

    if (td.cook.length) {
      h += '<h1 class="d1" style="margin-top:6px">Сегодня готовишь</h1><div class="stack" style="margin-top:18px">' + td.cook.map(function (id) { return cookCard(t, id); }).join('') + '</div>';
    } else if (td.eat.length) {
      var e = td.eat[0], r = D.byId(e.id);
      h += '<h1 class="d1" style="margin-top:6px">Сегодня не готовишь</h1>' +
        '<p class="lead">Доедаешь «' + E(r.title) + '» — ' + (e.from === Z.addDays(t, -1) ? 'со вчера' : 'с ' + Z.dParse(e.from).getDate() + ' ' + Z.MON[Z.dParse(e.from).getMonth()]) + '. Разогрей на сковороде под крышкой с ложкой воды.</p>' +
        '<a class="card" href="#/r/' + encodeURIComponent(r.id) + '" style="margin-top:18px">' + Z.img.html(r, '', 'height:150px') + '<div class="pad"><p class="card-t">' + E(r.title) + '</p><p class="small muted" style="margin-top:4px">Остаток, 1 порция</p></div></a>';
    } else {
      h += '<h1 class="d1" style="margin-top:6px">Сегодня свободно</h1><p class="lead">В плане на сегодня ничего нет. Выбери блюдо из книги или собери всю неделю разом.</p>' +
        '<div class="row" style="margin-top:18px"><a class="btn btn-act grow" href="#/book">Выбрать блюдо</a><button type="button" class="btn btn-soft grow" data-week>Собрать неделю</button></div>';
    }

    /* дела на сегодня: разморозка, закупка */
    var todo = D.tasks(3).filter(function (x) { return x.day === t && x.kind !== 'cook'; });
    var shopN = D.shopList().filter(function (x) { return !x.got && !x.home; }).length;
    var nb = '';
    todo.forEach(function (x) {
      var hm = String(x.at.getHours()).padStart(2, '0') + ':' + String(x.at.getMinutes()).padStart(2, '0');
      nb += '<div class="note note-ok">' + Z.icon(x.kind === 'thaw' ? 'snow' : 'cart') + '<div class="grow"><p class="note-t">' + E(x.title) + '</p><p class="note-s">' + E(x.body) + ' Напомню в ' + hm + '.</p>' +
        '<button type="button" class="btn btn-act btn-s" style="margin-top:12px" data-task="' + E(x.key) + '">' + (x.kind === 'thaw' ? 'Переложил' : 'Сделано') + '</button></div></div>';
    });
    if (shopN && !todo.some(function (x) { return x.kind === 'shop'; })) {
      nb += '<a class="note note-soft" href="#/plan/shop" style="text-decoration:none;color:inherit">' + Z.icon('cart') + '<div class="grow"><p class="note-t">Купить: ' + shopN + ' ' + Z.plural(shopN, 'позиция', 'позиции', 'позиций') + '</p><p class="note-s">Список собран по плану, кладовка учтена.</p></div>' + Z.icon('next') + '</a>';
    }
    if (nb) h += '<div class="stack sec">' + nb + '</div>';

    /* оценить приготовленное за последние дни */
    var rate = [];
    for (var i = 1; i <= 3; i++) { var k = Z.addDays(t, -i); D.dayIds(k).forEach(function (id) { if (D.isCooked(k, id) && !D.review(id) && rate.indexOf(id) < 0) rate.push(id); }); }
    if (rate.length) {
      var rr = D.byId(rate[0]);
      h += '<section class="sec card pad"><p class="h-sec">Как вышло «' + E(rr.title) + '»?</p><div class="scale" role="group" aria-label="Оценка от 1 до 10">' +
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(function (n) { return '<button type="button" data-rate="' + E(rr.id) + '" data-n="' + n + '">' + n + '</button>'; }).join('') + '</div>' +
        '<p class="small muted" style="margin-top:8px">9 и 10 попадут в меню недели снова, остальное нейросеть учтёт.</p></section>';
    }

    /* дальше на неделе */
    var nx = ag.slice(1);
    h += '<section class="sec"><p class="h-sec">Дальше</p><div class="wk4">' + nx.slice(0, 4).map(function (d) {
      var dd = Z.dParse(d.key), lbl = Z.DOW[dd.getDay()] + ' ' + dd.getDate();
      var txt = d.cook.length ? '<b class="card-t" style="display:block;margin-top:6px;font-size:14px">' + E(D.byId(d.cook[0]).title) + '</b>' : d.eat.length ? '<span class="small muted" style="display:block;margin-top:6px">Доедаешь</span>' : '<span class="small muted" style="display:block;margin-top:6px">Пусто</span>';
      return '<a href="#/plan/' + d.key + '" style="text-decoration:none;color:inherit"><span class="small muted">' + lbl + '</span>' + txt + '</a>';
    }).join('') + '</div></section>';
    return h;
  }

  function mount(el) {
    el.onclick = function (e) {
      var b;
      if ((b = e.target.closest('[data-cook]'))) { Z.cook.open(b.getAttribute('data-cook'), b.getAttribute('data-day')); return; }
      if ((b = e.target.closest('[data-cooked]'))) { var p = b.getAttribute('data-cooked').split('|'); D.setCooked(p[0], p[1], true); Z.haptic(12); Z.toast('Отметил: приготовлено. Кладовка списана.', 'Отменить', function () { D.setCooked(p[0], p[1], false); }); return; }
      if ((b = e.target.closest('[data-uncook]'))) { var q = b.getAttribute('data-uncook').split('|'); D.setCooked(q[0], q[1], false); return; }
      if ((b = e.target.closest('[data-task]'))) { var key = b.getAttribute('data-task'); D.setTask(key, true); Z.haptic(10); Z.toast('Готово, напоминание убрал', 'Вернуть', function () { D.setTask(key, false); }); return; }
      if ((b = e.target.closest('[data-rate]'))) { D.rate(b.getAttribute('data-rate'), +b.getAttribute('data-n')); Z.haptic(10); Z.toast('Оценка ' + b.getAttribute('data-n') + ' сохранена'); return; }
      if (e.target.closest('[data-week]')) { Z.gen.week(); return; }
      if (e.target.closest('[data-set]')) { Z.settings.open(); }
    };
  }
  Z.screens.today = { render: render, mount: mount };
})();
