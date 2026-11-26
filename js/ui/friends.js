/* «Друзья»: лента оценок и фото, заявки, поиск, профиль друга. Переписки нет. */
(function () {
  'use strict';
  var Z = window.Z, D = Z.data, E = Z.esc;
  var found = null, findQ = '';

  function feedItem(x) {
    var Sx = Z.social, r = D.byId(x.rid), title = r ? r.title : x.title || 'рецепт';
    var verb = x.kind === 'rev' ? 'приготовил' : 'поделился фото';
    var h = '<article class="card"><div class="pad row" style="padding-bottom:12px">' + Sx.av(x.who) + '<div class="grow"><p style="font-size:15px"><b>' + E(Sx.nick(x.who)) + '</b> ' + verb + ' ' + (r ? '<a href="#/r/' + encodeURIComponent(r.id) + '">' + E(title) + '</a>' : '«' + E(title) + '»') + '</p><p class="small muted">' + E(Z.ago(x.at)) + '</p></div>' + (x.kind === 'rev' ? '<span class="score" aria-label="Оценка ' + x.score + ' из 10">' + x.score + '</span>' : '') + '</div>';
    if (x.thumb) h += '<img src="' + x.thumb + '" alt="" style="width:100%;height:200px;object-fit:cover">';
    return h + '</article>';
  }
  function list() {
    var Sx = Z.social, h = '<header class="top"><h1 class="d1">Друзья</h1></header>';
    if (!Sx.on()) return h + '<div class="empty"><p class="d3">Нужен вход</p><p>Друзья, их оценки и фото блюд работают через аккаунт.</p><button type="button" class="btn btn-act" data-login style="margin-top:16px">Войти</button></div>';
    if (!Sx.myNick()) return h + nickForm('Как тебя будут видеть друзья?');
    var fr = Sx.friends(), inc = Sx.incoming();
    h += '<div class="people" style="margin-top:14px">' + fr.map(function (id) { return '<a href="#/friends/p-' + encodeURIComponent(id) + '" style="text-decoration:none;color:inherit">' + Sx.av(id, 'av-l') + '<small>' + E(Sx.nick(id)) + '</small></a>'; }).join('') +
      '<a href="#/friends/find" style="text-decoration:none;color:var(--muted)"><span class="av av-l" style="background:transparent;border:1.5px dashed var(--faint);color:var(--muted)">' + Z.icon('plus') + '</span><small>Добавить</small></a></div>';
    if (inc.length) h += '<section class="sec"><p class="h-sec">Заявки</p><div class="stack">' + inc.map(function (id) { return '<div class="card pad row">' + Sx.av(id) + '<p class="grow" style="font-weight:600">' + E(Sx.nick(id)) + '</p><button type="button" class="btn btn-act btn-s" data-fa="accept" data-id="' + E(id) + '">Принять</button><button type="button" class="icon-btn" data-fa="decline" data-id="' + E(id) + '" aria-label="Отклонить">' + Z.icon('x') + '</button></div>'; }).join('') + '</div></section>';
    var f = Sx.feed().slice(0, 40);
    h += '<section class="sec"><p class="h-sec">Лента</p>' + (f.length ? '<div class="stack">' + f.map(feedItem).join('') + '</div>' : (Sx.loaded() ? '<p class="muted">Пока тихо. Позови друзей — здесь появятся их блюда, оценки и фото.</p>' : '<p class="muted"><span class="spin"></span></p>')) + '</section>';
    return h;
  }
  function nickForm(t) {
    return '<form id="nf" class="card pad" style="margin-top:16px"><p class="h-sec">' + E(t) + '</p><label class="sr" for="nn">Ник</label><input id="nn" class="inp" maxlength="24" placeholder="Например, gnom" value="' + E(Z.social.myNick() || '') + '" autocomplete="nickname"><p class="small muted" style="margin-top:6px">Латиница, цифры и подчёркивание, 3–24 знака. По нику тебя найдут.</p><p class="err" id="ne" hidden></p><button class="btn btn-act btn-wide" style="margin-top:12px">Сохранить</button></form>';
  }
  function find() {
    var Sx = Z.social, h = '<header class="top"><a class="icon-btn" href="#/friends" aria-label="Назад">' + Z.icon('back') + '</a><h1 class="d3 grow">Добавить друга</h1></header>';
    h += '<form id="ff" class="row" style="margin-top:14px"><label class="sr" for="fq">Ник друга</label><input id="fq" class="inp search" placeholder="Ник друга" value="' + E(findQ) + '" autocomplete="off" autofocus><button class="btn btn-act">Найти</button></form>';
    if (found) h += found.length ? '<ul class="list" style="margin-top:12px">' + found.map(function (p) {
      var fr = Sx.friends().indexOf(p.id) >= 0, out = Sx.outgoing().indexOf(p.id) >= 0, inc = Sx.incoming().indexOf(p.id) >= 0;
      return '<li class="li" style="align-items:center">' + Sx.av(p.id) + '<span class="grow" style="font-weight:600">' + E(p.nick) + '</span>' + (fr ? '<span class="small muted">Друг</span>' : out ? '<button type="button" class="btn btn-soft btn-s" data-fa="cancel" data-id="' + E(p.id) + '">Отменить заявку</button>' : '<button type="button" class="btn btn-act btn-s" data-fa="' + (inc ? 'accept' : 'add') + '" data-id="' + E(p.id) + '">' + (inc ? 'Принять' : 'Добавить') + '</button>') + '</li>'; }).join('') + '</ul>' : '<p class="muted" style="margin-top:12px">Никого с таким ником.</p>';
    var out = Sx.outgoing(); if (out.length) h += '<section class="sec"><p class="h-sec">Ждут ответа</p><ul class="list">' + out.map(function (id) { return '<li class="li" style="align-items:center">' + Sx.av(id) + '<span class="grow">' + E(Sx.nick(id)) + '</span><button type="button" class="btn btn-soft btn-s" data-fa="cancel" data-id="' + E(id) + '">Отменить</button></li>'; }).join('') + '</ul></section>';
    return h;
  }
  /* профиль друга: лучшие блюда по его оценкам и удаление из друзей */
  function profile(who) {
    var Sx = Z.social, rev = Sx.reviewsOf(who), top = Object.keys(rev).map(function (k) { return { id: k, v: rev[k] }; }).sort(function (a, b) { return b.v.score - a.v.score; }).slice(0, 10);
    var h = '<header class="top"><a class="icon-btn" href="#/friends" aria-label="Назад">' + Z.icon('back') + '</a>' + Sx.av(who) + '<h1 class="d3 grow">' + E(Sx.nick(who)) + '</h1><button type="button" class="icon-btn" data-fa="remove" data-id="' + E(who) + '" aria-label="Удалить из друзей">' + Z.icon('trash') + '</button></header>';
    h += '<section class="sec"><p class="h-sec">Лучшее по оценкам</p>' + (top.length ? '<ul class="list">' + top.map(function (x) {
      var r = D.byId(x.id), t = E(r ? r.title : x.v.title || x.id);
      return '<li class="li"><span>' + (r ? '<a href="#/r/' + encodeURIComponent(r.id) + '">' + t + '</a>' : t) + '</span><span class="score" aria-label="Оценка ' + x.v.score + ' из 10">' + x.v.score + '</span></li>'; }).join('') + '</ul>' : '<p class="muted">Пока ничего не оценил.</p>') + '</section>';
    return h;
  }

  function render(arg) {
    if (arg === 'find') return find();
    if (arg && arg.indexOf('p-') === 0) return profile(arg.slice(2));
    return list();
  }
  function mount(el, arg) {
    var Sx = Z.social;
    el.onclick = function (e) {
      var b;
      if (e.target.closest('[data-login]')) { Z.ls.set('kuking:local5', false); location.reload(); return; }
      if ((b = e.target.closest('[data-fa]'))) {
        var a = b.getAttribute('data-fa'), id = b.getAttribute('data-id');
        if (a === 'remove' && !b.dataset.armed) { b.dataset.armed = '1'; Z.toast('Нажми ещё раз, чтобы удалить ' + Sx.nick(id) + ' из друзей'); setTimeout(function () { delete b.dataset.armed; }, 3000); return; }
        b.disabled = true; Sx.act(a, id).then(function () { if (a === 'remove') Z.go('friends', true); Z.toast(a === 'add' ? 'Заявка отправлена' : a === 'accept' ? 'Теперь вы друзья' : 'Готово'); }, function () { b.disabled = false; Z.toast('Не получилось, проверь связь'); });
      }
    };
    el.onsubmit = function (e) {
      e.preventDefault(); var f = e.target;
      if (f.id === 'ff') { findQ = f.querySelector('#fq').value.trim(); if (findQ.length < 2) return; Sx.search(findQ).then(function (r) { found = r; Z.render(true); }); return; }
      if (f.id === 'nf') {
        var n = f.querySelector('#nn').value.trim(), er = f.querySelector('#ne');
        if (!/^[A-Za-z0-9_]{3,24}$/.test(n)) { er.hidden = false; er.textContent = 'Только латиница, цифры и подчёркивание, 3–24 знака.'; return; }
        Sx.setNick(n).then(function () { Z.render(true); }, function (x) { er.hidden = false; er.textContent = /duplicate|unique/i.test(x.message) ? 'Этот ник занят.' : 'Не сохранилось: ' + x.message; });
      }
    };
  }
  Z.screens.friends = { render: render, mount: mount };
})();
