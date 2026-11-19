/* Drawer — шторка ☰ слева, как в Telegram: профиль, друзья, нейросеть, настройки.
   Открывается кнопкой ☰ или свайпом от левого края; закрывается тапом мимо или свайпом влево. */
(function () {
  'use strict';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var el = document.createElement('div');
  el.className = 'dr-ov'; el.hidden = true; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Меню');
  document.body.appendChild(el);
  var IC = {
    friends: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M15.5 4.8a3.3 3.3 0 0 1 0 6.4M17.5 14.8c2.2.6 3.6 2.4 4 5.2"/></svg>',
    ai: '<svg viewBox="0 0 24 24"><path d="M12 3l1.8 4.6L18.5 9l-4.7 1.6L12 15l-1.8-4.4L5.5 9l4.7-1.4z"/><path d="M18 15l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9z"/></svg>',
    gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    book: '<svg viewBox="0 0 24 24"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/></svg>'
  };
  function render() {
    var S = window.KukingStore, Soc = window.KukingSocial || {}, me = Soc.me && Soc.me(), u = S && S.user && S.user();
    var name = me ? ((Soc.info && Soc.info(me.id) || {}).name || me.nick) : u ? u.email : 'Гость';
    var n = Soc.badge ? Soc.badge() : 0;
    el.innerHTML = '<nav class="dr-panel"><button type="button" class="dr-me" data-a="me">' +
      '<span class="dr-av' + (me && me.is_admin ? ' chef' : '') + '" aria-hidden="true">' + esc(String(name).charAt(0).toUpperCase()) + '</span>' +
      '<span class="dr-me-t"><b>' + esc(name) + '</b>' + (me ? (me.is_admin ? '<span class="soc-chef adm"><svg class="soc-crown" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 11H5z"/></svg>админ</span>' : '<span class="soc-chef">шеф</span>') : '') + '<small>' + (me ? '@' + esc(me.nick) : u ? 'заполни анкету' : 'войди, чтобы дружить и хранить рецепты') + '</small></span></button>' +
      '<div class="dr-list">' +
      '<button type="button" class="dr-it" data-a="book">' + IC.book + '<span>Рецепты</span></button>' +
      (Soc.enabled ? '<button type="button" class="dr-it" data-a="friends">' + IC.friends + '<span>Друзья</span>' + (n ? '<em>' + n + '</em>' : '') + '</button>' : '') +
      '<button type="button" class="dr-it" data-a="ai">' + IC.ai + '<span>Нейросеть</span>' + (window.KukingAI && window.KukingAI.ready() ? '' : '<small>не подключена</small>') + '</button>' +
      '<button type="button" class="dr-it" data-a="settings">' + IC.gear + '<span>Настройки</span></button>' +
      '</div><p class="dr-ver">Кукинг ' + esc((window.KUKING_CONFIG || {}).version || '') + '</p></nav>';
    el.querySelectorAll('[data-a]').forEach(function (b) {
      b.addEventListener('click', function () {
        var a = b.getAttribute('data-a'); close();
        setTimeout(function () {
          if (a === 'me') { if (Soc.enabled && u) Soc.open(); else if (window.KukingSettings) window.KukingSettings.open('account'); }
          if (a === 'book' && window.KukingLib) window.KukingLib.open();
          if (a === 'friends') Soc.open();
          if (a === 'ai' && window.KukingSettings) window.KukingSettings.open('ai');
          if (a === 'settings' && window.KukingSettings) window.KukingSettings.open('account');
        }, 180);
      });
    });
  }
  var last = null;
  function open() { last = document.activeElement; render(); el.hidden = false; requestAnimationFrame(function () { el.classList.add('on'); var f = el.querySelector('.dr-me'); if (f) f.focus(); }); }
  function close() { el.classList.remove('on'); setTimeout(function () { el.hidden = true; }, 280); if (last && last.focus) last.focus(); }
  el.addEventListener('click', function (e) { if (e.target === el) close(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !el.hidden) close(); });
  var sx = null;
  el.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; }, { passive: true });
  el.addEventListener('touchmove', function (e) { if (sx != null && sx - e.touches[0].clientX > 60) { sx = null; close(); } }, { passive: true });
  window.KukingDrawer = { open: open, close: close };
})();
