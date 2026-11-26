/* Жарко 5 — навигация, вход, импорт плана по ссылке, обновления. */
(function () {
  'use strict';
  var Z = window.Z, D = Z.data;
  var view = document.getElementById('view'), tabs = document.getElementById('tabs');
  var TABS = ['today', 'book', 'plan', 'friends'];
  var cur = null;

  /* маршрут: #/today, #/book, #/plan, #/friends, #/r/<id> */
  function parse() {
    var h = location.hash.replace(/^#\/?/, '');
    if (/^import=/.test(h)) return { name: 'import', arg: h.slice(7) };
    var p = h.split('/'); var name = p[0] || Z.ls.get('kuking:tab5', 'today');
    if (name === 'r' && p[1]) return { name: 'recipe', arg: decodeURIComponent(p[1]) };
    return { name: TABS.indexOf(name) >= 0 ? name : 'today', arg: p[1] ? decodeURIComponent(p[1]) : null };
  }
  Z.go = function (path, replace) { var h = '#/' + path; if (location.hash === h) return render(); if (replace) history.replaceState(null, '', h); else history.pushState(null, '', h); render(); };
  Z.back = function (fallback) { if (history.length > 1 && Z._navd) history.back(); else Z.go(fallback || 'book', true); };
  window.addEventListener('popstate', function () { render(); });

  function render(keep) {
    var r = parse();
    if (r.name === 'import') { history.replaceState(null, '', '#/today'); importPlan(r.arg); r = parse(); }
    var same = cur && cur.name === r.name && cur.arg === r.arg, y = window.scrollY;
    cur = r; Z._navd = true;
    var scr = Z.screens[r.name]; if (!scr) return;
    if (TABS.indexOf(r.name) >= 0) Z.ls.set('kuking:tab5', r.name);
    tabs.hidden = !!scr.noTabs;
    tabs.querySelectorAll('[data-tab]').forEach(function (b) { if (b.getAttribute('data-tab') === r.name) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    view.innerHTML = scr.render(r.arg) || '';
    if (!same) { view.classList.remove('view-in'); void view.offsetWidth; view.classList.add('view-in'); window.scrollTo(0, 0); }
    else if (keep !== false) window.scrollTo(0, y);
    view.onclick = view.oninput = view.onchange = view.onsubmit = view.onkeydown = null;
    scr.mount && scr.mount(view, r.arg);
    Z.img.paint();
    badges();
  }
  Z.render = render;
  /* перерисовка по изменению данных — без прыжка прокрутки и без мигания, не трогаем экран, если человек печатает */
  var rt = null;
  Z.on('change', function () {
    clearTimeout(rt); rt = setTimeout(function () {
      var a = document.activeElement; if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && view.contains(a) && a.value) return;
      if (Z.cook && Z.cook.active()) return;
      render(true);
    }, 60);
  });

  tabs.addEventListener('click', function (e) { var b = e.target.closest('[data-tab]'); if (!b) return; Z.haptic(6); Z.go(b.getAttribute('data-tab')); });

  function badges() {
    var n = D.shopList().filter(function (x) { return !x.got && !x.home; }).length, b = document.getElementById('shopBadge');
    b.hidden = !n; b.textContent = n > 99 ? '99+' : n;
    var m = Z.social && Z.social.unread ? Z.social.unread() : 0, mb = document.getElementById('msgBadge');
    mb.hidden = !m; mb.textContent = m;
  }
  Z.badges = badges;

  /* ---------- план по ссылке: «Claude прислал план» ---------- */
  function importPlan(code) {
    var j = D.decodeImport(code);
    if (!j) { Z.toast('Ссылка с планом повреждена'); return; }
    var days = Object.keys(j.days || {}).sort();
    var rows = days.map(function (k) { return '<li class="li"><span>' + Z.esc(Z.dayRel(k)) + '</span><b style="text-align:right">' + (j.days[k] || []).map(function (id) { var r = D.byId(id); return Z.esc(r ? r.title : 'Нет в книге: ' + id); }).join('<br>') + '</b></li>'; }).join('');
    var sh = Z.sheet('Новый план', (j.note ? '<p class="lead" style="margin-top:0">' + Z.esc(j.note) + '</p>' : '') + '<ul class="list" style="margin-top:12px">' + rows + '</ul>' +
      ((j.pantry || []).length ? '<p class="small muted" style="margin-top:12px">В кладовку: ' + j.pantry.map(function (p) { return Z.esc(p.name); }).join(', ') + '</p>' : '') +
      '<div class="stack" style="margin-top:20px"><button type="button" class="btn btn-act btn-wide" data-ok>Добавить в план</button><button type="button" class="btn btn-soft btn-wide" data-close2>Не надо</button></div>');
    sh.el.querySelector('[data-ok]').onclick = function () {
      var res = D.applyImport(j); sh.close(); Z.go('plan', true);
      Z.toast('В плане: ' + res.added + ' ' + Z.plural(res.added, 'блюдо', 'блюда', 'блюд') + (res.missing.length ? '. Не нашёл ' + res.missing.length + ' — обнови приложение' : ''));
    };
    sh.el.querySelector('[data-close2]').onclick = sh.close;
  }

  /* ---------- вход ---------- */
  function needLogin() { var s = window.KukingStore; return s && s.enabled && !s.user() && !Z.ls.get('kuking:local5', false); }
  Z.screens.login = { noTabs: true, render: function () {
    return '<div style="min-height:80dvh;display:flex;flex-direction:column;justify-content:center">' +
      '<h1 class="d1">Жарко</h1><p class="lead">Книга рецептов, план недели и покупки. Войди — и план, оценки и кладовка будут на всех твоих устройствах и у друзей.</p>' +
      '<form id="lf" class="stack" style="margin-top:20px" novalidate>' +
      '<div class="fld" style="margin:0"><label for="le">Почта</label><input id="le" class="inp" type="email" autocomplete="email" required value="' + Z.esc(Z.ls.get('kuking:email', '')) + '"></div>' +
      '<div class="fld" style="margin:0"><label for="lp">Пароль, от 6 знаков</label><input id="lp" class="inp" type="password" autocomplete="current-password" minlength="6" required></div>' +
      '<p class="err" id="lerr" role="alert" hidden></p>' +
      '<div class="row"><button class="btn btn-act grow" data-m="in">Войти</button><button class="btn btn-soft grow" type="button" data-m="up">Зарегистрироваться</button></div>' +
      '<button type="button" class="btn btn-ghost" data-m="local">Пока без входа</button></form></div>';
  }, mount: function (el) {
    var f = el.querySelector('#lf'), er = el.querySelector('#lerr');
    function go(mode) {
      var e = el.querySelector('#le').value.trim(), p = el.querySelector('#lp').value;
      if (mode === 'local') { Z.ls.set('kuking:local5', true); return start(); }
      if (!/.+@.+\..+/.test(e) || p.length < 6) { er.hidden = false; er.textContent = 'Проверь почту и пароль: пароль от 6 знаков.'; return; }
      er.hidden = true; Z.ls.set('kuking:email', e);
      var b = el.querySelector('[data-m="' + mode + '"]'); b.disabled = true; b.innerHTML = '<span class="spin"></span>';
      var S = window.KukingStore;
      (mode === 'in' ? S.signIn(e, p) : S.signUp(e, p)).then(function (res) {
        if (res === 'confirm') { er.hidden = false; er.textContent = 'Письмо отправлено. Подтверди почту и войди.'; b.disabled = false; b.textContent = 'Зарегистрироваться'; return; }
        start();
      }).catch(function (x) { er.hidden = false; er.textContent = /invalid|credentials/i.test(x.message) ? 'Неверная почта или пароль.' : /registered|exists/i.test(x.message) ? 'Такая почта уже есть — нажми «Войти».' : 'Не получилось: ' + x.message; b.disabled = false; b.textContent = mode === 'in' ? 'Войти' : 'Зарегистрироваться'; });
    }
    f.onsubmit = function (e) { e.preventDefault(); go('in'); };
    el.querySelectorAll('[data-m]').forEach(function (b) { if (b.type === 'button') b.onclick = function () { go(b.getAttribute('data-m')); }; });
  } };

  function start() {
    var ch = /[?&]chat=([\w-]+)/.exec(location.search); if (ch) history.replaceState(null, '', location.pathname + '#/friends/c-' + ch[1]);
    if (needLogin()) { tabs.hidden = true; view.innerHTML = Z.screens.login.render(); Z.screens.login.mount(view); hideBoot(); return; }
    render();
    hideBoot();
    D.pull().then(function () { if (Z.social) Z.social.load(); });
  }
  function hideBoot() { var b = document.getElementById('boot'); if (b && !b.classList.contains('out')) { b.classList.add('out'); setTimeout(function () { b.remove(); }, 320); } }

  /* ---------- обновления: новая версия ставится сама, когда человек не готовит ---------- */
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      setInterval(function () { reg.update().catch(function () {}); }, 30 * 60000);
      document.addEventListener('visibilitychange', function () { if (!document.hidden) reg.update().catch(function () {}); });
    }).catch(function () {});
    navigator.serviceWorker.addEventListener('message', function (e) { if (e.data && e.data.chat) Z.go('friends/c-' + e.data.chat); });
    var reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (reloading) return; reloading = true;
      if (document.querySelector('.cook')) { Z.toast('Вышла новая версия', 'Обновить', function () { location.reload(); }); return; }
      location.reload();
    });
  }

  /* шрифты успели — показываем; не успели за 1,2 с — показываем с системными */
  var ready = document.fonts && document.fonts.ready ? Promise.race([document.fonts.ready, new Promise(function (ok) { setTimeout(ok, 1200); })]) : Promise.resolve();
  ready.then(start);
})();
