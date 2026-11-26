/* «Друзья»: лента, заявки, поиск, сообщения. */
(function () {
  'use strict';
  var Z = window.Z, D = Z.data, E = Z.esc;
  var found = null, findQ = '';

  function feedItem(x) {
    var Sx = Z.social, r = D.byId(x.rid), title = r ? r.title : x.title || 'рецепт';
    var verb = x.kind === 'rev' ? 'приготовил' : x.kind === 'photo' ? 'поделился фото' : x.kind === 'ask' ? 'спрашивает про' : 'написал про';
    var h = '<article class="card"><div class="pad row" style="padding-bottom:12px">' + Sx.av(x.who) + '<div class="grow"><p style="font-size:15px"><b>' + E(Sx.nick(x.who)) + '</b> ' + verb + ' ' + (r ? '<a href="#/r/' + encodeURIComponent(r.id) + '">' + E(title) + '</a>' : '«' + E(title) + '»') + '</p><p class="small muted">' + E(Z.ago(x.at)) + '</p></div>' + (x.kind === 'rev' ? '<span class="score" aria-label="Оценка ' + x.score + ' из 10">' + x.score + '</span>' : '') + '</div>';
    if (x.thumb) h += '<img src="' + x.thumb + '" alt="" style="width:100%;height:200px;object-fit:cover">';
    if (x.text) h += '<p class="pad" style="padding-top:' + (x.thumb ? '12px' : '0') + '">' + E(x.text) + '</p>';
    return h + '</article>';
  }
  function list() {
    var Sx = Z.social, h = '<header class="top"><h1 class="d1">Друзья</h1><a class="icon-btn" href="#/friends/chats" aria-label="Сообщения' + (Sx.unread() ? ', ' + Sx.unread() + ' новых' : '') + '">' + Z.icon('chat') + (Sx.unread() ? '<span class="badge">' + Sx.unread() + '</span>' : '') + '</a></header>';
    if (!Sx.on()) return h + '<div class="empty"><p class="d3">Нужен вход</p><p>Друзья, отзывы и сообщения работают через аккаунт.</p><button type="button" class="btn btn-act" data-login style="margin-top:16px">Войти</button></div>';
    if (!Sx.myNick()) return h + nickForm('Как тебя будут видеть друзья?');
    var fr = Sx.friends(), inc = Sx.incoming();
    h += '<div class="people" style="margin-top:14px">' + fr.map(function (id) { return '<a href="#/friends/c-' + encodeURIComponent(id) + '" style="text-decoration:none;color:inherit">' + Sx.av(id, 'av-l') + '<small>' + E(Sx.nick(id)) + '</small></a>'; }).join('') +
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
  function chats() {
    var Sx = Z.social, t = Sx.threads(), h = '<header class="top"><a class="icon-btn" href="#/friends" aria-label="Назад">' + Z.icon('back') + '</a><h1 class="d3 grow">Сообщения</h1></header>';
    if (!t.length) return h + '<div class="empty"><p class="d3">Пусто</p><p>Открой друга в ленте и напиши ему, или отправь рецепт кнопкой «Отправить другу».</p></div>';
    return h + '<ul class="list" style="margin-top:12px">' + t.map(function (x) { return '<li><a class="chk" href="#/friends/c-' + encodeURIComponent(x.who) + '" style="text-decoration:none;color:inherit;min-height:64px">' + Sx.av(x.who) + '<span class="grow"><span class="chk-name" style="font-weight:600">' + E(Sx.nick(x.who)) + '</span><span class="chk-sub">' + E(x.last.recipe_title ? 'Рецепт: ' + x.last.recipe_title : x.last.body) + '</span></span>' + (x.unread ? '<span class="badge">' + x.unread + '</span>' : '<span class="small muted">' + E(Z.ago(x.last.created_at)) + '</span>') + '</a></li>'; }).join('') + '</ul>';
  }
  function chat(who) {
    var Sx = Z.social, m = Sx.uid(), list = Sx.msgs().filter(function (x) { return (x.sender === who && x.receiver === m) || (x.sender === m && x.receiver === who); }).slice().reverse();
    Sx.markRead(who);
    var rev = Sx.reviewsOf(who), top = Object.keys(rev).map(function (k) { return { id: k, v: rev[k] }; }).sort(function (a, b) { return b.v.score - a.v.score; }).slice(0, 3);
    var h = '<header class="top"><a class="icon-btn" href="#/friends/chats" aria-label="Назад">' + Z.icon('back') + '</a>' + Sx.av(who) + '<h1 class="d3 grow">' + E(Sx.nick(who)) + '</h1><button type="button" class="icon-btn" data-fa="remove" data-id="' + E(who) + '" aria-label="Удалить из друзей">' + Z.icon('trash') + '</button></header>';
    if (top.length) h += '<p class="small muted" style="margin-top:10px">Лучшее у ' + E(Sx.nick(who)) + ': ' + top.map(function (x) { return E(x.v.title || x.id) + ' (' + x.v.score + ')'; }).join(', ') + '</p>';
    h += '<div class="stack" style="margin-top:16px;gap:8px" id="thread">' + (list.length ? list.map(function (x) {
      var mine = x.sender === m;
      return '<div class="bubble' + (mine ? ' me' : '') + '">' + (x.recipe_title ? '<button type="button" class="btn btn-soft btn-s" data-rec="' + x.id + '" style="' + (mine ? 'color:inherit;border-color:currentColor' : '') + '">' + Z.icon('book') + E(x.recipe_title) + '</button>' + (x.body ? '<p style="margin-top:6px">' + E(x.body) + '</p>' : '') : E(x.body)) + '<p class="small" style="opacity:.6;margin-top:4px">' + E(Z.ago(x.created_at)) + '</p></div>'; }).join('') : '<p class="muted">Напиши первым.</p>') + '</div>';
    h += '<div style="height:80px"></div><form id="mf" class="dock" style="bottom:calc(var(--tab-h) + var(--safe-b));padding-bottom:12px"><div class="dock-in"><label class="sr" for="mi">Сообщение</label><input id="mi" class="inp" placeholder="Сообщение" maxlength="2000" autocomplete="off"><button class="icon-btn" aria-label="Отправить" style="flex:none">' + Z.icon('send') + '</button></div></form>';
    return h;
  }

  function render(arg) {
    if (arg === 'find') return find();
    if (arg === 'chats') return chats();
    if (arg && arg.indexOf('c-') === 0) return chat(arg.slice(2));
    return list();
  }
  function mount(el, arg) {
    var Sx = Z.social;
    if (arg && arg.indexOf('c-') === 0) setTimeout(function () { window.scrollTo(0, document.body.scrollHeight); }, 30);
    el.onclick = function (e) {
      var b;
      if (e.target.closest('[data-login]')) { Z.ls.set('kuking:local5', false); location.reload(); return; }
      if ((b = e.target.closest('[data-fa]'))) {
        var a = b.getAttribute('data-fa'), id = b.getAttribute('data-id');
        if (a === 'remove' && !b.dataset.armed) { b.dataset.armed = '1'; Z.toast('Нажми ещё раз, чтобы удалить ' + Sx.nick(id) + ' из друзей'); setTimeout(function () { delete b.dataset.armed; }, 3000); return; }
        b.disabled = true; Sx.act(a, id).then(function () { if (a === 'remove') Z.go('friends', true); Z.toast(a === 'add' ? 'Заявка отправлена' : a === 'accept' ? 'Теперь вы друзья' : 'Готово'); }, function () { b.disabled = false; Z.toast('Не получилось, проверь связь'); });
        return;
      }
      if ((b = e.target.closest('[data-rec]'))) {
        Sx.openShared(b.getAttribute('data-rec')).then(function (r) {
          if (!r || !r.title) return Z.toast('Рецепт не открылся');
          var mine = D.all(true).filter(function (x) { return x.title === r.title; })[0];
          if (mine) return Z.go('r/' + encodeURIComponent(mine.id));
          var c = JSON.parse(JSON.stringify(r)); c.id = 'my-' + Date.now().toString(36); D.addRecipe(c); Z.toast('Рецепт сохранён в книгу'); Z.go('r/' + encodeURIComponent(c.id));
        });
      }
    };
    el.onsubmit = function (e) {
      e.preventDefault(); var f = e.target;
      if (f.id === 'ff') { findQ = f.querySelector('#fq').value.trim(); if (findQ.length < 2) return; Sx.search(findQ).then(function (r) { found = r; Z.render(true); }); return; }
      if (f.id === 'mf') { var i = f.querySelector('#mi'), v = i.value.trim(); if (!v) return; i.value = ''; Sx.send(arg.slice(2), v).catch(function () { Z.toast('Не отправилось'); }); setTimeout(function () { window.scrollTo(0, document.body.scrollHeight); var ni = document.getElementById('mi'); if (ni) ni.focus(); }, 80); return; }
      if (f.id === 'nf') {
        var n = f.querySelector('#nn').value.trim(), er = f.querySelector('#ne');
        if (!/^[A-Za-z0-9_]{3,24}$/.test(n)) { er.hidden = false; er.textContent = 'Только латиница, цифры и подчёркивание, 3–24 знака.'; return; }
        Sx.setNick(n).then(function () { Z.render(true); }, function (x) { er.hidden = false; er.textContent = /duplicate|unique/i.test(x.message) ? 'Этот ник занят.' : 'Не сохранилось: ' + x.message; });
      }
    };
  }
  Z.screens.friends = { render: render, mount: mount };
})();
