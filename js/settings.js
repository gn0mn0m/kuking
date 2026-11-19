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
    if (u) return '<p class="set-who">Ты вошёл как <b>' + esc(u.email) + '</b>' + (me ? ', ник <b>' + esc(me.nick) + '</b>' + (me.is_admin ? ' — ты шеф' : '') : '') + '. Твои оценки видят друзья, оценки шефа — все.</p>' +
      '<div class="set-row">' + (window.KukingSocial && window.KukingSocial.enabled ? '<button type="button" class="nav-btn primary" data-a="friends">Друзья</button>' : '') + '<button type="button" class="ghost-btn" data-a="out">Выйти</button></div>';
    return '<p class="small">Войди, чтобы оценки и комменты были общими для всей хаты и нейросеть училась на вкусах компании.</p>' +
      '<form class="set-form" id="authForm" autocomplete="on">' +
      '<label class="set-f"><span>Почта</span><input id="authEmail" type="email" autocomplete="email" required inputmode="email" value="' + esc(authDraft) + '"></label>' +
      '<label class="set-f"><span>Пароль (от 6 знаков)</span><input id="authPass" type="password" autocomplete="current-password" minlength="6" required></label>' +
      '<div class="set-row"><button type="submit" class="nav-btn primary" data-mode="in">Войти</button><button type="submit" class="nav-btn" data-mode="up">Зарегистрироваться</button></div></form>' +
      (msg.account ? '<p class="set-msg">' + esc(msg.account) + '</p>' : '');
  }
  function aiHTML() {
    var c = AI.get(), P = AI.presets;
    return '<p class="small">Свежак и «10 идей» работают на твоей нейросети. Ключ хранится <b>только в этом телефоне</b> и уходит напрямую провайдеру. Поставь лимит трат в кабинете провайдера.</p>' +
      '<form class="set-form" id="aiForm">' +
      '<label class="set-f"><span>Провайдер</span><select id="aiProv">' + Object.keys(P).map(function (k) { return '<option value="' + k + '"' + (c.provider === k ? ' selected' : '') + '>' + esc(P[k].label) + '</option>'; }).join('') + '</select></label>' +
      '<label class="set-f" id="aiBaseWrap"' + (c.provider === 'custom' ? '' : ' hidden') + '><span>Адрес API (…/v1)</span><input id="aiBase" type="url" value="' + esc(c.base || '') + '" placeholder="https://…/v1"></label>' +
      '<label class="set-f"><span>Ключ</span><input id="aiKey" type="password" autocomplete="off" value="' + esc(c.key || '') + '" placeholder="вставь ключ"></label>' +
      '<label class="set-f"><span>Модель</span><input id="aiModel" type="text" autocomplete="off" autocapitalize="off" value="' + esc(c.model || '') + '" placeholder="точное имя модели из кабинета провайдера"></label>' +
      '<p class="small">Рецепт — длинная и строгая штука: на слабых моделях он будет кривее. Бери топовую модель своего провайдера.</p>' +
      '<div class="set-row"><button type="submit" class="nav-btn primary">Сохранить и проверить</button>' + (c.key ? '<button type="button" class="ghost-btn" data-a="aiclear">Удалить ключ</button>' : '') + '</div></form>' +
      (msg.ai ? '<p class="set-msg' + (msg.aiOk ? ' ok' : '') + '">' + esc(msg.ai) + '</p>' : '');
  }
  var ACCENTS = [['orange', 'Оранжевый'], ['burgundy', 'Бордовый'], ['green', 'Зелёный'], ['blue', 'Синий'], ['violet', 'Фиолетовый']];
  function curAccent() { return document.documentElement.getAttribute('data-accent') || 'orange'; }
  function lookHTML() {
    return '<p class="small">Цвет кнопок и акцентов. Только на этом телефоне.</p><div class="set-acc" role="radiogroup" aria-label="Цвет приложения">' + ACCENTS.map(function (a) {
      return '<button type="button" class="set-sw acc-' + a[0] + '" role="radio" data-acc="' + a[0] + '" aria-checked="' + (curAccent() === a[0]) + '"><i aria-hidden="true"></i><span>' + a[1] + '</span></button>';
    }).join('') + '</div>';
  }
  function installHTML() {
    if (standalone()) return '<p class="small">Приложение уже стоит на экране «Домой». Обновления подтягиваются сами при запуске с интернетом.</p>';
    return '<ol class="set-steps"><li>Открой эту страницу в <b>Safari</b>.</li><li>Нажми <b>Поделиться</b> — квадрат со стрелкой вверх.</li><li>Выбери <b>«На экран „Домой“»</b> → «Добавить».</li><li>Запускай «Кукинг» с иконки — на весь экран и без интернета.</li></ol>';
  }
  function render() {
    el.innerHTML = '<div class="set-panel"><div class="set-head"><h2 id="setTitle" class="set-title">Настройки</h2>' +
      '<button type="button" class="ghost-btn" data-a="close">Готово</button></div>' +
      '<div class="set-tabs" role="tablist">' + [['account', 'Аккаунт'], ['look', 'Вид'], ['ai', 'Нейросеть'], ['install', 'Установка']].map(function (t) {
        return '<button type="button" role="tab" class="set-tab" data-tab="' + t[0] + '" aria-selected="' + (tab === t[0]) + '">' + t[1] + '</button>';
      }).join('') + '</div>' +
      '<section class="set-body">' + (tab === 'account' ? accountHTML() : tab === 'look' ? lookHTML() : tab === 'ai' ? aiHTML() : installHTML()) + '</section>' +
      '<p class="set-ver">Кукинг ' + esc(VERSION) + '</p></div>';
    bind();
  }
  function bind() {
    el.querySelectorAll('.set-tab').forEach(function (b) { b.addEventListener('click', function () { tab = b.getAttribute('data-tab'); render(); }); });
    el.querySelectorAll('[data-a]').forEach(function (b) {
      b.addEventListener('click', function () {
        var a = b.getAttribute('data-a');
        if (a === 'close') close();
        if (a === 'out') { S.signOut(); location.reload(); }
        if (a === 'friends') { close(); window.KukingSocial.open(); }
        if (a === 'aiclear') { AI.clear(); msg.ai = 'Ключ удалён с телефона'; msg.aiOk = true; render(); }
      });
    });
    el.querySelectorAll('[data-acc]').forEach(function (b) {
      b.addEventListener('click', function () {
        var a = b.getAttribute('data-acc');
        if (a === 'orange') document.documentElement.removeAttribute('data-accent'); else document.documentElement.setAttribute('data-accent', a);
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
        msg.account = mode === 'up' ? 'Регистрирую…' : 'Вхожу…'; render(); busy = true;
        (mode === 'up' ? S.signUp(email, pass) : S.signIn(email, pass).then(function () { return 'in'; }))
          .then(function (r) {
            busy = false;
            if (r === 'confirm') { msg.account = 'Письмо с подтверждением ушло на почту. Подтверди и жми «Войти».'; render(); return; }
            location.reload();
          })
          .catch(function (er) {
            busy = false;
            var m = String(er && er.message || '');
            msg.account = /invalid login|invalid_credentials/i.test(m) ? 'Почта или пароль не подходят.' : /already registered|exists/i.test(m) ? 'Такая почта уже есть — жми «Войти».' :
              /network|fetch/i.test(m) ? 'Нет интернета.' : 'Не вышло: ' + m;
            render();
          });
      });
    }
    var f = el.querySelector('#aiForm');
    if (f) {
      var prov = el.querySelector('#aiProv');
      prov.addEventListener('change', function () { el.querySelector('#aiBaseWrap').hidden = prov.value !== 'custom'; });
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        AI.set({ provider: prov.value, base: el.querySelector('#aiBase').value.trim(), key: el.querySelector('#aiKey').value.trim(), model: el.querySelector('#aiModel').value.trim() });
        if (!AI.ready()) { msg.ai = 'Заполни ключ и модель' + (prov.value === 'custom' ? ' и адрес' : ''); msg.aiOk = false; render(); return; }
        msg.ai = 'Проверяю…'; msg.aiOk = false; render();
        AI.test().then(function () { msg.ai = 'Нейросеть на связи. Можно крутить свежак.'; msg.aiOk = true; render(); })
          .catch(function (er) { msg.ai = (window.KukingAIMsg ? window.KukingAIMsg(er) : 'Не вышло') + (er && er.message && er.code !== 'not_granted' ? ' — ' + er.message : ''); msg.aiOk = false; render(); });
      });
    }
  }
  var last = null;
  function open(t) { last = document.activeElement; if (t) tab = t; render(); el.hidden = false; requestAnimationFrame(function () { el.classList.add('on'); }); var b = el.querySelector('.set-tab[aria-selected=true]'); if (b) b.focus(); }
  function close() { el.classList.remove('on'); setTimeout(function () { el.hidden = true; }, 260); try { localStorage.setItem('kuking:welcomed', '1'); } catch (e) {} if (last && last.focus) last.focus(); }
  el.addEventListener('click', function (e) { if (e.target === el) close(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !el.hidden) close(); });

  window.KukingSettings = { open: open, close: close };

  /* первый запуск: предложить вход, один раз */
  var welcomed = false; try { welcomed = localStorage.getItem('kuking:welcomed') === '1'; } catch (e) {}
  if (S && S.enabled && !S.user() && !welcomed) setTimeout(function () { open('account'); }, 600);
})();
