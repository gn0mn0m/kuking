/* Settings — шторка настроек: аккаунт (вход для общих оценок), нейросеть (свой ключ),
   установка на iPhone, версия. При первом запуске показывает вход. */
(function () {
  'use strict';
  var S = window.KukingStore, AI = window.KukingAI;
  var VERSION = (window.KUKING_CONFIG || {}).version || '';
  var el = document.createElement('div');
  el.className = 'set-ov'; el.hidden = true;
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'setTitle');
  document.body.appendChild(el);
  var tab = 'account', msg = {}, busy = false, authDraft = '';
  try { authDraft = sessionStorage.getItem('kuking:email') || ''; } catch (e) {}
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function standalone() { return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; }

  function accountHTML() {
    if (!S || !S.enabled) return '<p class="small">Облако ещё не подключено — оценки живут только в этом телефоне.</p>';
    var u = S.user();
    var me = window.KukingSocial && window.KukingSocial.me && window.KukingSocial.me();
    if (u) return '<p class="set-who">Ты вошёл как <b>' + esc(u.email) + '</b>' + (me ? ', ник <b>' + esc(me.nick) + '</b>' + (me.is_admin ? ' — ты админ' : '') : '') + '. Твои оценки видят друзья.</p>' +
      '<div class="set-row"><button type="button" class="ghost-btn" data-a="out">Выйти из аккаунта</button></div>';
    return '<p class="small">Войдите, чтобы оценки и комментарии были общими для всех друзей и нейросеть училась на вкусах компании.</p>' +
      '<form class="set-form" id="authForm" autocomplete="on">' +
      '<label class="set-f"><span>Почта</span><input id="authEmail" type="email" autocomplete="email" required inputmode="email" value="' + esc(authDraft) + '"></label>' +
      '<label class="set-f"><span>Пароль (от 6 знаков)</span><input id="authPass" type="password" autocomplete="current-password" minlength="6" required></label>' +
      '<div class="set-row"><button type="submit" class="nav-btn primary" data-mode="in">Войти</button><button type="submit" class="nav-btn" data-mode="up">Зарегистрироваться</button></div></form>' +
      (msg.account ? '<p class="set-msg' + (/…$/.test(msg.account) ? ' busy' : '') + '">' + esc(msg.account) + '</p>' : '');
  }
  function aiHTML() {
    var c = AI.get(), P = AI.presets;
    var srv = (P[c.provider] || {}).kind === 'server';
    return '<p class="small">' + (srv ? 'Нейросеть «Жарко» работает для всех, кто вошёл: ничего настраивать не надо. Внутри — GigaChat от Сбера.' : 'Ключ хранится <b>только в этом телефоне</b> и уходит напрямую провайдеру. Поставь лимит трат в кабинете провайдера.') + '</p>' +
      '<form class="set-form" id="aiForm">' +
      '<label class="set-f"><span>Провайдер</span><select id="aiProv">' + Object.keys(P).map(function (k) { return '<option value="' + k + '"' + (c.provider === k ? ' selected' : '') + '>' + esc(P[k].label) + '</option>'; }).join('') + '</select></label>' +
      '<label class="set-f" id="aiBaseWrap"' + (c.provider === 'custom' ? '' : ' hidden') + '><span>Адрес API (…/v1)</span><input id="aiBase" type="url" value="' + esc(c.base || '') + '" placeholder="https://…/v1"></label>' +
 '<div id="aiOwn"' + (srv ? ' hidden' : '') + '>' +
      '<label class="set-f"><span>Ключ</span><input id="aiKey" type="password" autocomplete="off" value="' + esc(c.key || '') + '" placeholder="вставь ключ"></label>' +
      '<label class="set-f"><span>Модель</span><input id="aiModel" type="text" autocomplete="off" autocapitalize="off" value="' + esc(c.model || '') + '" placeholder="точное имя модели из кабинета провайдера"></label>' +
      '<p class="small">Рецепт — длинная и строгая штука: на слабых моделях он будет кривее. Бери топовую модель своего провайдера.</p></div>' +
      '<div class="set-row"><button type="submit" class="nav-btn primary">Сохранить и проверить</button>' + (c.key ? '<button type="button" class="ghost-btn" data-a="aiclear">Удалить ключ</button>' : '') + '</div></form>' +
      (msg.ai ? '<p class="set-msg' + (msg.aiOk ? ' ok' : '') + (/…$/.test(msg.ai) ? ' busy' : '') + '">' + esc(msg.ai) + '</p>' : '');
  }
  var ACCENTS = [['saffron', 'Терракота'], ['orange', 'Оранжевый'], ['burgundy', 'Бордовый'], ['green', 'Зелёный'], ['blue', 'Синий'], ['violet', 'Фиолет']];
  function curAccent() { return document.documentElement.getAttribute('data-accent') || 'saffron'; }
  function curTheme() { try { return localStorage.getItem('kuking:theme') || 'auto'; } catch (e) { return 'auto'; } }
  function lookHTML() {
    return '<span class="ps-l">Тема</span><div class="seg set-theme" role="radiogroup" aria-label="Тема">' + [['auto', 'Как в телефоне'], ['light', 'Светлая'], ['dark', 'Тёмная']].map(function (t) {
      return '<button type="button" role="radio" data-theme-set="' + t[0] + '" aria-checked="' + (curTheme() === t[0]) + '">' + t[1] + '</button>'; }).join('') + '</div>' +
      '<span class="ps-l">Акцент</span><p class="small">Цвет кнопок и выделений. Только на этом телефоне.</p><div class="set-acc" role="radiogroup" aria-label="Цвет приложения">' + ACCENTS.map(function (a) {
      return '<button type="button" class="set-sw acc-' + a[0] + '" role="radio" data-acc="' + a[0] + '" aria-checked="' + (curAccent() === a[0]) + '"><i aria-hidden="true"></i><span>' + a[1] + '</span></button>';
    }).join('') + '</div>';
  }
  function installHTML() {
    if (standalone()) return '<p class="small">Приложение уже стоит на экране «Домой». Обновления подтягиваются сами при запуске с интернетом.</p>';
    return '<ol class="set-steps"><li>Открой эту страницу в <b>Safari</b>.</li><li>Нажми <b>Поделиться</b> — квадрат со стрелкой вверх.</li><li>Выбери <b>«На экран „Домой“»</b> → «Добавить».</li><li>Запускай «Жарко» с иконки — на весь экран и без интернета.</li></ol>';
  }
  /* каждая строка профиля открывает ровно свой раздел — без вкладок «Вид / Аккаунт / …» вперемешку */
  var TITLES = { prefs: 'Предпочтения', kitchen: 'Моя техника', notif: 'Уведомления', account: 'Аккаунт', look: 'Оформление', ai: 'Нейросеть', install: 'Установка на iPhone', about: 'О приложении' };
  /* что нового — коротко, по-человечески */
  var NEWS = [
    ['4.9.1', 'Заставка без рывков и без повторного мигания при обновлении. Корзина открывается как обычная вкладка — панель снизу остаётся.'],
    ['4.9', 'Фото подачи: нейросеть рисует реалистичную фотографию готовой тарелки на слайде подачи и в карточке. Подача в новых рецептах подробнее. Заставка дольше и плавнее. Закупку из плана можно целиком отправить в корзину.'],
    ['4.8', 'Импорт рецепта из текста — из TikTok, Reels, сайта или заметок, со скриншота через «Скопировать текст» на iPhone. Кнопки «Переделать под аэрогриль» и «Переделать под мою технику».'],
    ['4.7', 'Соцсеть: фото к рецептам, оценки друзей с распределением и лайками, вопросы к рецепту с ответом нейросети, «Похожие» и «С этим готовят», открытка для Telegram и сторис, лента и челлендж недели, бейджи и серия в профиле, личные сообщения с рецептами.'],
    ['4.6.1', 'Корзина — отдельная вкладка внизу. Блюда в корзине видно списком, любое можно убрать вместе с продуктами. «Отметить всё» и «Убрать купленное». Знакомство сохраняет ответы и шаг, его можно закрыть в любой момент.'],
    ['4.6', 'Корзина: план и рецепты в одном списке по отделам, куплено уезжает вниз, «есть дома», цены от нейросети с вашими правками, Telegram и поиск в Самокате и Лавке. Кладовка с остатками и меню на неделю по КБЖУ.'],
    ['4.5', 'Каталог: категории плитками, фильтры в одной шторке (диета, кухня, продукт, время, сложность, техника), сохранённые фильтры и свои коллекции, «для тебя: легко», поиск фразой через нейросеть и «Из того, что есть».'],
    ['4.4', 'Знакомство при первом запуске: цель, тело, аллергии, вкусы, техника картинками, уведомления. В профиле — «Предпочтения», «Моя техника» и «Уведомления» по типам.'],
    ['4.3', 'У каждого рецепта паспорт: категория, кухня, главный продукт, сложность в колпаках, активное время, техника и значки диет.'],
    ['4.2', 'Тексты стали вежливее: без тюремного жаргона и мата, шутки остались.'],
    ['4.1', 'Новое имя — «Жарко»: логотип, иконка и заставка с огоньком.'],
    ['4.0', 'Новый вид «Журнал»: тёплая светлая и тёмная темы, шрифты с засечками. Кнопка «Обратная связь».'],
    ['3.19', 'Тако подаются тарелкой на каждого, детальные схемы подачи.'],
    ['3.17', 'Рецепты со «Свежака» можно пересобрать по новым правилам.'],
    ['3.16', 'Работает без связи с облаком: всё сохраняется в телефоне и уходит само.'],
    ['3.15', 'Время в плане правится прямо в строке, закупка сохраняется, оценка закрывает готовку.'],
    ['3.14', 'Рецепты под твою цель и рацион, «Для кого готовим?» перед генерацией.'],
    ['3.12', 'Чаты и Друзья разведены, профиль по разделам, обновления ставятся сами.']
  ];
  function aboutHTML() {
    return '<p class="about-ver">Жарко ' + esc(VERSION) + '</p><p class="small">Рецепты, план и готовка вместе с друзьями.</p><ul class="about-log">' +
      NEWS.map(function (n) { return '<li><b>' + n[0] + '</b>' + (n[0] === NEWS[0][0] ? '<small>последнее</small>' : '') + '<p>' + esc(n[1]) + '</p></li>'; }).join('') + '</ul>';
  }
  var page = false;
  var CHEV = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
  function render() {
    var body = (tab === 'prefs' || tab === 'kitchen' || tab === 'notif') && window.KPrefs ? KPrefs.pageHTML(tab) : tab === 'account' ? accountHTML() : tab === 'look' ? lookHTML() : tab === 'ai' ? aiHTML() : tab === 'about' ? aboutHTML() : installHTML();
    el.classList.toggle('page', page);
    el.innerHTML = page
      ? '<div class="set-panel"><header class="tg-head tg-head-sub"><button type="button" class="tg-back" data-a="close">' + CHEV + 'Профиль</button><span class="tg-head-t" id="setTitle">' + TITLES[tab] + '</span></header><section class="set-body">' + body + '</section></div>'
      : '<div class="set-panel"><span class="set-grab" aria-hidden="true"></span><div class="set-head"><h2 id="setTitle" class="set-title">' + TITLES[tab] + '</h2>' +
        '<button type="button" class="ghost-btn" data-a="close">Готово</button></div><section class="set-body">' + body + '</section></div>';
    bind(); snap = aiState();
  }
  /* правки нейросети, которые ещё не сохранены */
  var snap = '';
  function aiState() { var f = el.querySelector('#aiForm'); if (!f) return ''; return ['#aiProv', '#aiBase', '#aiKey', '#aiModel'].map(function (k) { var x = el.querySelector(k); return x ? x.value.trim() : ''; }).join('\u0001'); }
  function dirty() { return !el.hidden && !!el.querySelector('#aiForm') && aiState() !== snap; }
  function bind() {
    el.querySelectorAll('[data-a]').forEach(function (b) {
      b.addEventListener('click', function () {
        var a = b.getAttribute('data-a');
        if (a === 'close') { if (el.classList.contains('page')) { el.style.transform = ''; } close(); }
        if (a === 'out') { S.signOut(); location.reload(); }
        if (a === 'aiclear') { AI.clear(); msg.ai = 'Ключ удалён с телефона'; msg.aiOk = true; render(); }
      });
    });
    el.querySelectorAll('[data-theme-set]').forEach(function (b) {
      b.addEventListener('click', function () {
        var t = b.getAttribute('data-theme-set'), de = document.documentElement; de.classList.add('acc-swap'); clearTimeout(window.__accT);
        if (t === 'auto') de.removeAttribute('data-theme'); else de.setAttribute('data-theme', t);
        try { if (t === 'auto') localStorage.removeItem('kuking:theme'); else localStorage.setItem('kuking:theme', t); } catch (e) {}
        window.__accT = setTimeout(function () { de.classList.remove('acc-swap'); }, 600);
        try { var m = document.querySelector('meta[name=theme-color]'); if (m) m.setAttribute('content', getComputedStyle(de).getPropertyValue('--bg').trim()); } catch (e) {}
        if (window.kHaptic) window.kHaptic(10); render();
      });
    });
    el.querySelectorAll('[data-acc]').forEach(function (b) {
      b.addEventListener('click', function () {
        var a = b.getAttribute('data-acc');
        var de = document.documentElement; de.classList.add('acc-swap'); clearTimeout(window.__accT);
        if (a === 'saffron') de.removeAttribute('data-accent'); else de.setAttribute('data-accent', a);
        if (window.kHaptic) window.kHaptic(10);
        window.__accT = setTimeout(function () { de.classList.remove('acc-swap'); }, 600);
        try { var m = document.querySelector('meta[name=theme-color]'); if (m) m.setAttribute('content', getComputedStyle(de).getPropertyValue('--bg').trim()); } catch (e) {}
        try { localStorage.setItem('kuking:accent', a); } catch (e) {}
        render();
      });
    });
    var af = el.querySelector('#authForm');
    if (af) {
      af.querySelector('#authEmail').addEventListener('input', function (e) { authDraft = e.target.value; try { sessionStorage.setItem('kuking:email', authDraft); } catch (x) {} });
      var mode = 'in';
      af.querySelectorAll('button[type=submit]').forEach(function (b) { b.addEventListener('click', function () { mode = b.getAttribute('data-mode'); }); });
      af.addEventListener('submit', function (e) {
        e.preventDefault(); if (busy) return; busy = true;
        var email = el.querySelector('#authEmail').value.trim(), pass = el.querySelector('#authPass').value;
        /* всё на месте, без перерисовки: крутилка в кнопке, потом мягкая шторка */
        var btn = af.querySelector('button[data-mode="' + mode + '"]'), was = btn.textContent;
        af.querySelectorAll('button[type=submit]').forEach(function (x) { x.disabled = true; });
        btn.classList.add('busy-c'); btn.textContent = mode === 'up' ? 'Регистрирую…' : 'Вхожу…';
        function say(t) { var p = af.querySelector('.set-msg'); if (!p) { p = document.createElement('p'); p.className = 'set-msg'; p.setAttribute('aria-live', 'polite'); af.appendChild(p); } p.textContent = t; p.classList.remove('shake'); void p.offsetWidth; p.classList.add('shake'); }
        function undo() { af.querySelectorAll('button[type=submit]').forEach(function (x) { x.disabled = false; }); btn.classList.remove('busy-c'); btn.textContent = was; }
        (mode === 'up' ? S.signUp(email, pass) : S.signIn(email, pass).then(function () { return 'in'; }))
          .then(function (r) {
            busy = false;
            if (r === 'confirm') { undo(); say('Письмо с подтверждением ушло на почту. Подтверди и жми «Войти».'); return; }
            btn.classList.remove('busy-c'); btn.textContent = 'Готово';
            var c = document.getElementById('curtain'); if (c) { c.hidden = false; requestAnimationFrame(function () { c.classList.add('on'); }); }
            setTimeout(function () { location.reload(); }, 320);
          })
          .catch(function (er) {
            busy = false;
            var m = String(er && er.message || '');
            undo();
            say(/invalid login|invalid_credentials/i.test(m) ? 'Почта или пароль не подходят.' : /already registered|exists/i.test(m) ? 'Такая почта уже есть — жми «Войти».' :
              /network|fetch/i.test(m) ? 'Нет интернета.' : 'Не вышло: ' + m);
          });
      });
    }
    var f = el.querySelector('#aiForm');
    if (f) {
      var prov = el.querySelector('#aiProv');
      prov.addEventListener('change', function () { el.querySelector('#aiBaseWrap').hidden = prov.value !== 'custom'; el.querySelector('#aiOwn').hidden = (AI.presets[prov.value] || {}).kind === 'server'; });
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        AI.set({ provider: prov.value, base: el.querySelector('#aiBase').value.trim(), key: el.querySelector('#aiKey').value.trim(), model: el.querySelector('#aiModel').value.trim() });
        if (!AI.ready()) { msg.ai = (AI.presets[prov.value] || {}).kind === 'server' ? 'Сначала войди в аккаунт' : 'Заполни ключ и модель' + (prov.value === 'custom' ? ' и адрес' : ''); msg.aiOk = false; render(); return; }
        msg.ai = 'Проверяю…'; msg.aiOk = false; render();
        AI.test().then(function () { msg.ai = 'Нейросеть на связи. Можно крутить свежак.'; msg.aiOk = true; render(); if (window.kHaptic) window.kHaptic(10); })
          .catch(function (er) { msg.ai = (window.KukingAIMsg ? window.KukingAIMsg(er) : 'Не вышло') + (er && er.message && er.code !== 'not_granted' ? ' — ' + er.message : ''); msg.aiOk = false; render(); });
      });
    }
  }
  var last = null;
  function open(t, opt) {
    clearTimeout(hideT); last = document.activeElement; if (t) tab = t; page = !!(opt && opt.page); msg.ai = ''; render(); el.hidden = false;
    requestAnimationFrame(function () { el.classList.add('on'); }); el.scrollTop = 0;
  }
  var hideT = null;
  function shut() { el.classList.remove('on'); clearTimeout(hideT); hideT = setTimeout(function () { el.hidden = true; el.classList.remove('page'); el.style.transform = ''; el.style.transition = ''; }, page ? 340 : 260); try { localStorage.setItem('kuking:welcomed', '1'); } catch (e) {} if (last && last.focus) last.focus(); }
  /* выход: есть несохранённые правки — спросить. Вернёт false, если выход отложен */
  function close(then) {
    if (dirty()) {
      window.kAskLeave({ text: 'Ты поменял настройки нейросети и не нажал «Сохранить».',
        save: function () { var f = el.querySelector('#aiForm'); if (f) { if (f.requestSubmit) f.requestSubmit(); else f.dispatchEvent(new Event('submit', { cancelable: true })); } snap = aiState(); shut(); if (typeof then === 'function') then(); },
        drop: function () { snap = aiState(); shut(); if (typeof then === 'function') then(); } });
      return false;
    }
    shut(); return true;
  }
  el.addEventListener('click', function (e) { if (e.target === el && !page) close(); });
  if (window.KPrefs) KPrefs.bind(el);
  /* страница: смах вправо — назад, экран идёт за пальцем */
  (function () {
    var sx = null, sy = 0, dx = 0, t0 = 0, on = false;
    el.addEventListener('touchstart', function (e) { if (!page || e.target.closest('input, select, textarea')) { sx = null; return; } var t = e.touches[0]; sx = t.clientX; sy = t.clientY; dx = 0; on = false; t0 = Date.now(); }, { passive: true });
    el.addEventListener('touchmove', function (e) { if (sx == null) return; var t = e.touches[0], mx = t.clientX - sx, my = t.clientY - sy;
      if (!on) { if (Math.abs(my) > 10 && Math.abs(my) > Math.abs(mx)) { sx = null; return; } if (mx > 14 && mx > Math.abs(my) * 1.6) on = true; else return; }
      dx = Math.max(0, mx); el.style.transition = 'none'; el.style.transform = 'translateX(' + dx + 'px)'; }, { passive: true });
    el.addEventListener('touchend', function () { if (sx == null || !on) { sx = null; return; } sx = null; on = false; el.style.transition = '';
      if (dx > el.clientWidth * 0.3 || (dx > 60 && Date.now() - t0 < 260)) { if (window.kHaptic) window.kHaptic(6); el.style.transform = ''; if (close() === false) el.style.transform = ''; } else el.style.transform = ''; });
  })();
  /* смахнуть шторку вниз */
  (function () {
    var y0 = null, dy = 0, panel = null;
    el.addEventListener('touchstart', function (e) { if (page) { y0 = null; return; } panel = el.querySelector('.set-panel'); if (!panel || panel.scrollTop > 0) { y0 = null; return; } y0 = e.touches[0].clientY; dy = 0; }, { passive: true });
    el.addEventListener('touchmove', function (e) { if (y0 == null) return; dy = Math.max(0, e.touches[0].clientY - y0); if (dy > 4) { panel.style.transition = 'none'; panel.style.transform = 'translateY(' + dy + 'px)'; } }, { passive: true });
    el.addEventListener('touchend', function () { if (y0 == null || !panel) return; panel.style.transition = ''; if (dy > 110) { panel.style.transform = 'translateY(100%)'; close(); setTimeout(function () { panel.style.transform = ''; }, 320); } else panel.style.transform = ''; y0 = null; });
  })();
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !el.hidden) close(); });

  window.KukingSettings = { open: open, close: close, isOpen: function () { return !el.hidden && el.classList.contains('on'); } };

  /* первый запуск: предложить вход, один раз */
  var welcomed = false; try { welcomed = localStorage.getItem('kuking:welcomed') === '1'; } catch (e) {}
  if (S && S.enabled && !S.user() && !welcomed) setTimeout(function () { open('account'); }, 600);
})();
