/* Настройки: оформление, профиль и вкусы (их учитывает нейросеть), уведомления, аккаунт. */
(function () {
  'use strict';
  var Z = window.Z, D = Z.data, E = Z.esc;
  var ACC = [['saffron', 'Шафран', '#F08A24'], ['beet', 'Свёкла', '#A3324B'], ['sorrel', 'Щавель', '#46753D']];

  function body() {
    var t = Z.theme.get(), Sx = Z.social, S = window.KukingStore, u = S && S.user && S.user(), inf = Sx.info() || {};
    var h = '<p class="h-sec">Оформление</p><div class="seg" role="tablist" aria-label="Тема">' + [['auto', 'Как в системе'], ['light', 'Светлая'], ['dark', 'Тёмная']].map(function (x) { return '<button type="button" role="tab" data-th="' + x[0] + '" aria-selected="' + (t.theme === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div>';
    h += '<div class="row" style="margin-top:14px;justify-content:space-between"><span>Акцент</span><div class="swatches">' + ACC.map(function (a) { return '<button type="button" class="sw" data-acc="' + a[0] + '" aria-pressed="' + (t.accent === a[0] || (a[0] === 'saffron' && !/beet|sorrel/.test(t.accent))) + '" aria-label="' + a[1] + '" style="background:' + a[2] + '"></button>'; }).join('') + '</div></div>';

    h += '<p class="h-sec" style="margin-top:28px">Вкусы</p><p class="small muted">Нейросеть учитывает это в каждом новом рецепте и меню.</p>' +
      '<form id="pf2"><div class="fld"><label for="sl">Люблю</label><input id="sl" class="inp" maxlength="300" value="' + E(inf.likes || '') + '" placeholder="Острое, говядина, азиатское"></div>' +
      '<div class="fld"><label for="sa">Не ем</label><input id="sa" class="inp" maxlength="300" value="' + E(inf.avoid || '') + '" placeholder="Кинза, печень"></div>' +
      '<div class="fld"><label for="sx">Аллергия</label><input id="sx" class="inp" maxlength="300" value="' + E(inf.allergy || '') + '" placeholder="Нет"></div>' +
      '<button class="btn btn-soft btn-wide" style="margin-top:12px"' + (u ? '' : ' disabled') + '>Сохранить вкусы</button></form>';

    var ps = Sx.pushState();
    h += '<p class="h-sec" style="margin-top:28px">Уведомления</p><p class="small muted">Коротко и по делу: когда начать готовить, когда переложить мясо из морозилки, когда закупка. Время — в «План → Напоминания».</p>';
    h += ps === 'on' ? '<div class="row" style="margin-top:10px"><p class="grow" style="color:var(--ok);font-weight:600">Включены</p><button type="button" class="btn btn-soft btn-s" data-ptest>Проверить</button></div>'
      : ps === 'install' ? '<p class="small" style="margin-top:10px">На iPhone уведомления работают из приложения на экране «Домой»: Safari → Поделиться → «На экран „Домой“». Открой оттуда и включи здесь.</p>'
      : ps === 'denied' ? '<p class="small" style="margin-top:10px">Запрещены в настройках телефона: Настройки → Уведомления → Жарко.</p>'
      : ps === 'nope' ? '<p class="small" style="margin-top:10px">Этот браузер не умеет уведомления.</p>'
      : '<button type="button" class="btn btn-act btn-wide" data-pon style="margin-top:10px"' + (u ? '' : ' disabled') + '>Включить уведомления</button>';
    h += '<p class="err" id="perr" hidden></p>';

    h += '<p class="h-sec" style="margin-top:28px">Аккаунт</p>';
    if (u) h += '<div class="set-row"><span>' + E(u.email) + '</span><button type="button" class="btn btn-ghost btn-s" data-out>Выйти</button></div>' +
      '<div class="set-row"><span>Ник: ' + E(Sx.myNick() || 'не задан') + '</span><a class="btn btn-ghost btn-s" href="#/friends">' + (Sx.myNick() ? 'Друзья' : 'Задать') + '</a></div>';
    else h += '<button type="button" class="btn btn-act btn-wide" data-in>Войти</button>';
    h += '<div class="set-row"><span class="small muted">Нейросеть</span><span class="small">' + (window.KukingAI && KukingAI.ready() ? 'GigaChat через сервер «Жарко»' : 'нужен вход') + '</span></div>';
    h += '<p class="small muted" style="margin-top:16px;text-align:center">Жарко ' + E((window.KUKING_CONFIG || {}).version || '') + '</p>';
    return h;
  }
  function open() {
    var s = Z.sheet('Настройки', body());
    s.body.onclick = function (e) {
      var b;
      if ((b = e.target.closest('[data-th]'))) { Z.theme.set('theme', b.getAttribute('data-th')); s.body.querySelectorAll('[data-th]').forEach(function (x) { x.setAttribute('aria-selected', x === b); }); return; }
      if ((b = e.target.closest('[data-acc]'))) { Z.theme.set('accent', b.getAttribute('data-acc')); s.body.querySelectorAll('[data-acc]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); return; }
      if (e.target.closest('[data-pon]')) { var bb = e.target.closest('[data-pon]'); bb.disabled = true; bb.innerHTML = '<span class="spin"></span>'; Z.social.enablePush().then(function () { s.set(body()); Z.toast('Уведомления включены'); }, function (x) { bb.disabled = false; bb.textContent = 'Включить уведомления'; var er = s.body.querySelector('#perr'); er.hidden = false; er.textContent = x.message; }); return; }
      if (e.target.closest('[data-ptest]')) { Z.social.testPush().then(function () { Z.toast('Отправил пробное уведомление'); }, function (x) { Z.toast(x.message); }); return; }
      if (e.target.closest('[data-out]')) { window.KukingStore.signOut(); location.reload(); return; }
      if (e.target.closest('[data-in]')) { Z.ls.set('kuking:local5', false); location.reload(); }
    };
    s.body.onsubmit = function (e) {
      e.preventDefault();
      Z.social.saveInfo({ likes: s.body.querySelector('#sl').value.trim(), avoid: s.body.querySelector('#sa').value.trim(), allergy: s.body.querySelector('#sx').value.trim() })
        .then(function () { Z.toast('Вкусы сохранены'); }, function () { Z.toast('Не сохранилось, проверь связь'); });
    };
  }
  Z.settings = { open: open };
})();
