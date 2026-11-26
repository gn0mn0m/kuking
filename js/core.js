/* Жарко 5 — общие помощники: экранирование, даты, хранилище, шторки, тосты, тема. */
(function () {
  'use strict';
  var Z = window.Z = window.Z || {};
  Z.screens = Z.screens || {};

  /* ---------- строки ---------- */
  Z.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  Z.plain = function (t) { return String(t || '').replace(/\{[^}]+\}/g, '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim(); };
  Z.fmtNum = function (n) {
    if (n == null || isNaN(n)) return '';
    var w = Math.floor(n + 1e-9), f = n - w;
    if (Math.abs(f - 0.5) < 1e-6) return (w ? w : '') + '½';
    if (Math.abs(f - 0.25) < 1e-6) return (w ? w : '') + '¼';
    return String(Math.round(n * 10) / 10).replace('.', ',');
  };
  Z.plural = function (n, a, b, c) { n = Math.abs(n) % 100; var m = n % 10; return n > 10 && n < 20 ? c : m > 1 && m < 5 ? b : m === 1 ? a : c; };

  /* ---------- даты: ключ дня YYYY-MM-DD в местном времени ---------- */
  Z.dKey = function (d) { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  Z.dParse = function (k) { var x = String(k).split('-'); return new Date(+x[0], +x[1] - 1, +x[2], 12); };
  Z.today = function () { return Z.dKey(new Date()); };
  Z.addDays = function (k, n) { var d = Z.dParse(k); d.setDate(d.getDate() + n); return Z.dKey(d); };
  Z.DOW = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  Z.DOW_FULL = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
  Z.MON = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  Z.dayLong = function (k) { var d = Z.dParse(k); return Z.DOW_FULL[d.getDay()] + ', ' + d.getDate() + ' ' + Z.MON[d.getMonth()]; };
  Z.dayRel = function (k) { var t = Z.today(); if (k === t) return 'Сегодня'; if (k === Z.addDays(t, 1)) return 'Завтра'; if (k === Z.addDays(t, -1)) return 'Вчера'; var d = Z.dParse(k); return Z.DOW_FULL[d.getDay()] + ', ' + d.getDate() + ' ' + Z.MON[d.getMonth()]; };
  Z.ago = function (iso) {
    var s = (Date.now() - new Date(iso)) / 1000; if (!(s >= 0)) return '';
    if (s < 60) return 'только что'; if (s < 3600) return Math.floor(s / 60) + ' мин назад';
    var d = new Date(iso), k = Z.dKey(d), hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    if (k === Z.today()) return 'сегодня в ' + hm; if (k === Z.addDays(Z.today(), -1)) return 'вчера в ' + hm;
    return d.getDate() + ' ' + Z.MON[d.getMonth()];
  };
  Z.mins = function (s) { /* «≈ 1 ч 20 мин» → 80 */ s = String(s || ''); var h = /(\d+)\s*ч/.exec(s), m = /(\d+)\s*мин/.exec(s); return (h ? +h[1] * 60 : 0) + (m ? +m[1] : 0) || (/^\d+$/.test(s) ? +s : 0); };
  Z.dur = function (m) { m = Math.round(m); if (m < 60) return m + ' мин'; var h = Math.floor(m / 60), r = m % 60; return h + ' ч' + (r ? ' ' + r + ' мин' : ''); };

  /* ---------- localStorage: имена ключей прежние, чтобы данные переехали сами ---------- */
  Z.ls = {
    get: function (k, def) { try { var v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch (e) { try { var r = localStorage.getItem(k); return r == null ? def : r; } catch (x) { return def; } } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    raw: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };

  /* ---------- шина событий ---------- */
  var subs = {};
  Z.on = function (ev, f) { (subs[ev] = subs[ev] || []).push(f); return function () { subs[ev] = subs[ev].filter(function (x) { return x !== f; }); }; };
  Z.emit = function (ev, a) { (subs[ev] || []).slice().forEach(function (f) { try { f(a); } catch (e) { console.error(e); } }); };

  Z.haptic = function (ms) { try { if (navigator.vibrate) navigator.vibrate(ms || 10); } catch (e) {} };

  /* ---------- иконки (контурные, 24×24) ---------- */
  var I = {
    flame: '<path d="M12 3c2 3 5 5 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-8z"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-6 6.5-6s6.5 2.5 6.5 6"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14c2.5 0 4.5 1.8 4.5 4.5"/>',
    back: '<path d="M15 5l-7 7 7 7"/>', next: '<path d="M9 5l7 7-7 7"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>', check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    clock: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>',
    cart: '<path d="M3 4h2l2.4 11h11L21 7H6.2"/><circle cx="9" cy="19.5" r="1.5"/><circle cx="17" cy="19.5" r="1.5"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/>', gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
    spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/>',
    snow: '<path d="M12 2v20M4.9 6l14.2 12M4.9 18L19.1 6"/>', box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>', edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
    share: '<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 13v7h14v-7"/>', send: '<path d="M4 12l16-8-6 16-2-7z"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>', heart: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>', bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    play: '<path d="M7 5v14l12-7z"/>', pause: '<path d="M8 5v14M16 5v14"/>', stop: '<rect x="6" y="6" width="12" height="12" rx="1.5"/>'
  };
  Z.icon = function (n, cls) { return '<svg class="ico ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (I[n] || '') + '</svg>'; };

  /* ---------- тост с действием «Отменить» ---------- */
  var toastEl, toastT;
  Z.toast = function (text, action, fn) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'toast'; toastEl.setAttribute('role', 'status'); document.body.appendChild(toastEl); }
    toastEl.innerHTML = '<span>' + Z.esc(text) + '</span>' + (action ? '<button type="button">' + Z.esc(action) + '</button>' : '');
    var b = toastEl.querySelector('button'); if (b) b.onclick = function () { toastEl.classList.remove('on'); fn && fn(); };
    toastEl.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove('on'); }, action ? 5000 : 2600);
  };

  /* ---------- шторка снизу ---------- */
  var stack = [];
  Z.sheet = function (title, html, opts) {
    opts = opts || {};
    var shade = document.createElement('div'); shade.className = 'shade';
    var el = document.createElement('section'); el.className = 'sheet'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', title);
    el.innerHTML = '<div class="sheet-h"><h2>' + Z.esc(title) + '</h2><button type="button" class="icon-btn" data-close aria-label="Закрыть">' + Z.icon('x') + '</button></div><div class="sheet-b">' + html + '</div>';
    document.body.appendChild(shade); document.body.appendChild(el);
    var prevFocus = document.activeElement;
    requestAnimationFrame(function () { shade.classList.add('on'); el.classList.add('on'); });
    var api = {
      el: el, body: el.querySelector('.sheet-b'),
      set: function (h) { api.body.innerHTML = h; },
      close: function () {
        if (api.closed) return; api.closed = true; stack = stack.filter(function (x) { return x !== api; });
        shade.classList.remove('on'); el.classList.remove('on');
        setTimeout(function () { shade.remove(); el.remove(); }, 330);
        if (prevFocus && prevFocus.focus) try { prevFocus.focus(); } catch (e) {}
        opts.onClose && opts.onClose();
      }
    };
    shade.onclick = api.close;
    el.querySelector('[data-close]').onclick = api.close;
    /* смахнуть вниз за шапку */
    var y0 = null, head = el.querySelector('.sheet-h');
    head.addEventListener('touchstart', function (e) { y0 = e.touches[0].clientY; el.style.transition = 'none'; }, { passive: true });
    head.addEventListener('touchmove', function (e) { if (y0 == null) return; var dy = Math.max(0, e.touches[0].clientY - y0); el.style.transform = 'translateY(' + dy + 'px)'; }, { passive: true });
    head.addEventListener('touchend', function (e) { if (y0 == null) return; var dy = e.changedTouches[0].clientY - y0; y0 = null; el.style.transition = ''; el.style.transform = ''; if (dy > 90) api.close(); });
    stack.push(api);
    setTimeout(function () { var f = el.querySelector('[autofocus]'); if (f) f.focus(); }, 340);
    return api;
  };
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && stack.length) stack[stack.length - 1].close(); });

  /* ---------- тема и акцент: плавно ---------- */
  Z.theme = {
    get: function () { return { theme: Z.ls.get('kuking:theme', 'auto'), accent: Z.ls.get('kuking:accent', 'saffron') }; },
    apply: function (animate) {
      var t = Z.theme.get(), root = document.documentElement;
      var dark = t.theme === 'dark' || (t.theme === 'auto' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
      var go = function () {
        root.setAttribute('data-theme', dark ? 'dark' : 'light');
        if (t.accent && t.accent !== 'saffron') root.setAttribute('data-accent', t.accent); else root.removeAttribute('data-accent');
        var m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = getComputedStyle(root).getPropertyValue('--bg').trim() || (dark ? '#171413' : '#F2F1EC');
      };
      if (!animate) return go();
      if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) { document.startViewTransition(go); return; }
      root.classList.add('theming'); go(); setTimeout(function () { root.classList.remove('theming'); }, 420);
    },
    set: function (k, v) { Z.ls.set(k === 'theme' ? 'kuking:theme' : 'kuking:accent', v); Z.theme.apply(true); }
  };
  if (window.matchMedia) try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { if (Z.theme.get().theme === 'auto') Z.theme.apply(true); }); } catch (e) {}
  Z.theme.apply(false);
})();
