/* Social — друзья в стиле мессенджера: ник, поиск, заявки, ссылка-приглашение, профиль друга
   с его оценками (и кнопкой поставить свою), ответы под оценками, шеф (админ) с короной.
   Данные — Supabase: profiles, friends, replies, docs(reviews); права режет база (setup.sql). */
(function () {
  'use strict';
  var S = window.KukingStore;
  var API = { enabled: false, badge: function () { return 0; }, admin: function () { return null; }, me: function () { return null; },
    thread: function () { return ''; }, bindThreads: function () {}, open: function () {}, onChange: function () {} };
  window.KukingSocial = API;
  if (!S || !S.enabled) return;

  var CROWN = '<svg class="soc-crown" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 11H5z"/></svg>';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function q(s) { return encodeURIComponent(s); }
  function scCls(n) { return n >= 9 ? 'sc-top' : n >= 7 ? 'sc-good' : n >= 5 ? 'sc-mid' : n >= 3 ? 'sc-low' : 'sc-bad'; }
  function titleOf(id, fallback) { var r = (window.RECIPES || []).filter(function (x) { return x.id === id; })[0]; return r ? r.title : (fallback || id); }
  function hasRecipe(id) { return !!(window.KukingLib && window.KukingLib.has(id)); }
  function ago(iso) {
    var m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 1) return 'только что'; if (m < 60) return m + ' мин'; var h = Math.round(m / 60); if (h < 24) return h + ' ч';
    var d = Math.round(h / 24); return d < 30 ? d + ' дн' : new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  }
  function avatar(p, big) {
    var n = (p && p.nick || '?').trim(), h = 0; for (var i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) % 3;
    return '<span class="soc-av' + (big ? ' big' : '') + ' av' + h + (p && p.is_admin ? ' chef' : '') + '" aria-hidden="true">' + esc(n.charAt(0).toUpperCase()) + (p && p.is_admin ? CROWN : '') + '</span>';
  }
  var MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  function bdayText(b) { if (!b) return ''; var x = b.split('-'); return +x[2] + ' ' + MONTHS[+x[1] - 1]; }
  function bdayToday(b) {
    if (!b) return false; var x = b.split('-'), n = new Date(), m = n.getMonth() + 1, d = n.getDate();
    var leap = new Date(n.getFullYear(), 1, 29).getDate() === 29;
    return +x[1] === m && (+x[2] === d || (!leap && m === 2 && d === 28 && +x[2] === 29));
  }
  function nickHTML(p) { return '<span class="soc-nm"><b class="soc-nick">' + esc(p ? p.nick : 'кто-то') + '</b>' + (p && p.is_admin ? '<span class="soc-chef">шеф</span>' : '') + '</span>'; }

  /* ---------- состояние ---------- */
  var me = null, admin = null, people = {}, info = {}, links = [], replies = [], reviewsBy = {}, loaded = false, subs = [];
  function uid() { return S.user() && S.user().id; }
  function emit() { subs.forEach(function (f) { try { f(); } catch (e) {} }); }
  API.onChange = function (f) { subs.push(f); };
  API.me = function () { return me; };
  API.admin = function () { return admin; };
  API.isAdmin = function () { return !!(me && me.is_admin); };
  API.person = function (id) { return people[id]; };
  API.info = function (id) { return info[id]; };
  API.badge = function () { return links.filter(function (l) { return l.status === 'pending' && l.b === uid(); }).length; };
  API.reviewsOf = function (userId) { return reviewsBy[userId] || {}; };
  /* кто ест: имя, любимое и что не жрёт — для нейросети */
  API.eaters = function () {
    var ids = [uid()].concat(friendIds()); if (admin && ids.indexOf(admin.id) < 0) ids.push(admin.id);
    return ids.map(function (id) { var i = info[id] || {}, p = people[id] || {}; if (!i.likes && !i.avoid) return null;
      return { who: (i.name || p.nick || '') + (id === uid() ? ' (это я)' : ''), likes: i.likes || undefined, avoid: i.avoid || undefined }; }).filter(Boolean);
  };

  function friendIds() { var m = uid(); return links.filter(function (l) { return l.status === 'accepted'; }).map(function (l) { return l.a === m ? l.b : l.a; }); }
  function relation(id) {
    var m = uid(), l = links.filter(function (x) { return (x.a === m && x.b === id) || (x.b === m && x.a === id); })[0];
    if (!l) return 'none'; if (l.status === 'accepted') return 'friend'; return l.a === m ? 'sent' : 'incoming';
  }

  function loadProfiles(ids) {
    ids = ids.filter(function (id) { return id && !people[id]; });
    if (!ids.length) return Promise.resolve();
    return S.req('GET', 'profiles?select=id,nick,is_admin&id=in.(' + ids.map(q).join(',') + ')').then(function (rows) { (rows || []).forEach(function (p) { people[p.id] = p; }); });
  }
  function refresh() {
    if (!S.user()) return Promise.resolve();
    var m = uid();
    return Promise.all([
      S.req('GET', 'profiles?select=id,nick,is_admin&id=eq.' + q(m)),
      S.req('GET', 'profiles?select=id,nick,is_admin&is_admin=eq.true&limit=1'),
      S.req('GET', 'friends?select=a,b,status,created_at&a=eq.' + q(m)),
      S.req('GET', 'friends?select=a,b,status,created_at&b=eq.' + q(m)),
      S.req('GET', 'replies?select=id,recipe_id,review_owner,author,body,created_at&order=created_at.asc&limit=1000'),
      S.allReviews(),
      S.req('GET', 'profile_info?select=id,name,bday,likes,avoid').catch(function () { return []; })
    ]).then(function (r) {
      info = {}; (r[6] || []).forEach(function (x) { info[x.id] = x; });
      me = r[0] && r[0][0] || null; admin = r[1] && r[1][0] || null;
      if (me) people[me.id] = me; if (admin) people[admin.id] = admin;
      links = (r[2] || []).concat(r[3] || []); replies = r[4] || [];
      reviewsBy = {};
      (r[5] || []).forEach(function (row) { if (row.user_id) (reviewsBy[row.user_id] = reviewsBy[row.user_id] || {})[row.id] = row.data || {}; });
      var ids = []; links.forEach(function (l) { ids.push(l.a, l.b); }); replies.forEach(function (x) { ids.push(x.author, x.review_owner); });
      return loadProfiles(ids);
    }).then(function () {
      loaded = true;
      if (me && me.is_admin) S.claimLegacy();
      var chef = !!(me && me.is_admin), was = false; try { was = localStorage.getItem('kuking:chef') === '1'; } catch (e) {}
      if (chef !== was) { try { if (chef) localStorage.setItem('kuking:chef', '1'); else localStorage.removeItem('kuking:chef'); } catch (e) {} location.reload(); return; }
      emit(); if (!ov.hidden && !busyForm()) render();
    }).catch(function () {});
  }
  API.refresh = refresh;

  /* ---------- оверлей ---------- */
  var ov = document.createElement('div');
  ov.className = 'soc-ov'; ov.hidden = true;
  ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Друзья');
  document.body.appendChild(ov);
  var view = 'list', viewing = null, found = null, searchQ = '', msg = '', busy = false, nickMsg = '', timer = null;

  function render() {
    var keep = document.activeElement && ov.contains(document.activeElement) && document.activeElement.id;
    var pos = ov.querySelector('.soc-page.cur') ? ov.querySelector('.soc-page.cur').scrollTop : 0;
    ov.innerHTML = '<div class="soc-wrap' + (view === 'profile' ? ' deep' : '') + '">' +
      '<section class="soc-page' + (view === 'list' ? ' cur' : '') + '">' + listHTML() + '</section>' +
      '<section class="soc-page' + (view === 'profile' ? ' cur' : '') + '">' + (viewing ? profileHTML(viewing) : '') + '</section></div>';
    bind();
    var cur = ov.querySelector('.soc-page.cur'); if (cur) cur.scrollTop = pos;
    if (keep) { var el = ov.querySelector('#' + keep); if (el) { el.focus(); if (el.setSelectionRange && el.value) el.setSelectionRange(el.value.length, el.value.length); } }
  }
  function head(title, back) {
    return '<header class="soc-head">' + (back ? '<button type="button" class="ghost-btn soc-back" data-a="back" aria-label="Назад">← Друзья</button>' : '<h2 class="soc-title">Друзья</h2>') +
      (back ? '<span class="soc-head-t">' + esc(title) + '</span>' : '') + '<button type="button" class="ghost-btn" data-a="close">Готово</button></header>';
  }

  function listHTML() {
    if (!S.user()) return head() + '<div class="soc-empty"><p>Чтобы дружить, надо войти. Без входа ты как сиделец без погонялова.</p><button type="button" class="nav-btn primary" data-a="login">Войти</button></div>';
    if (!loaded) return head() + '<p class="small soc-pad">Секунду, пробиваю по базе…</p>';
    if (!me) return head() + nickForm(true);
    if (view === 'push') return head() + pushCard(true);
    var m = uid(), h = head();
    var mi = info[m] || {};
    h += '<div class="soc-me">' + avatar(me, true) + '<div class="soc-me-t">' + nickHTML(me) + '<span class="small">' + esc([mi.name, mi.bday ? '🎂 ' + bdayText(mi.bday) : ''].filter(Boolean).join(' · ') || 'это ты') + '</span></div>' +
      '<button type="button" class="ghost-btn" data-a="nick">анкета</button></div>';
    if (view === 'nick') h += nickForm(false);
    if (view === 'push') h += pushCard(true);
    h += '<div class="soc-invite"><button type="button" class="nav-btn primary" data-a="invite">Позвать по ссылке</button>' +
      '<p class="small">Кинь ссылку в чат — друг тапнет, войдёт, и вы сразу кенты. Или пусть найдёт тебя по нику <b>' + esc(me.nick) + '</b>.</p></div>';
    h += '<form class="soc-search" id="socFind" role="search"><input id="socQ" type="search" placeholder="Найти по нику" autocomplete="off" autocapitalize="off" spellcheck="false" value="' + esc(searchQ) + '" aria-label="Ник друга"><button type="submit" class="ghost-btn">Найти</button></form>';
    if (found) h += '<ul class="soc-list">' + (found.length ? found.map(function (p) { return row(p, true); }).join('') : '<li class="small soc-pad">Никого с таким ником.</li>') + '</ul>';
    var inc = links.filter(function (l) { return l.status === 'pending' && l.b === m; });
    if (inc.length) h += '<h3 class="soc-sec">Хотят в друзья · ' + inc.length + '</h3><ul class="soc-list">' + inc.map(function (l) { return row(people[l.a] || { id: l.a, nick: '…' }, false); }).join('') + '</ul>';
    var out = links.filter(function (l) { return l.status === 'pending' && l.a === m; });
    var fr = friendIds().map(function (id) { return people[id] || { id: id, nick: '…' }; }).filter(function (p) { return !admin || p.id !== admin.id; })
      .sort(function (a, b) { return a.nick.localeCompare(b.nick, 'ru'); });
    h += '<h3 class="soc-sec">Хата</h3><ul class="soc-list">';
    if (admin && admin.id !== m) h += row(admin, false, true);
    h += fr.map(function (p) { return row(p, false); }).join('');
    if (!fr.length && (!admin || admin.id === m)) h += '<li class="small soc-pad">Пока ты один, как волк. Зови кентов.</li>';
    h += '</ul>';
    if (out.length) h += '<h3 class="soc-sec">Ждут ответа</h3><ul class="soc-list">' + out.map(function (l) { return row(people[l.b] || { id: l.b, nick: '…' }, false); }).join('') + '</ul>';
    if (msg) h += '<p class="set-msg soc-pad">' + esc(msg) + '</p>';
    return h;
  }
  function stats(id) {
    var rv = reviewsBy[id] || {}, ks = Object.keys(rv).filter(function (k) { return rv[k].score; });
    if (!ks.length) return '';
    var avg = Math.round(ks.reduce(function (s, k) { return s + rv[k].score; }, 0) / ks.length * 10) / 10;
    return ks.length + ' ' + (ks.length % 10 === 1 && ks.length % 100 !== 11 ? 'оценка' : ks.length % 10 >= 2 && ks.length % 10 <= 4 && (ks.length % 100 < 10 || ks.length % 100 >= 20) ? 'оценки' : 'оценок') + ' · средняя ' + avg;
  }
  function row(p, searching, pinned) {
    var rel = relation(p.id), act = '';
    if (pinned) rel = rel === 'friend' ? 'friend' : 'pinned';
    if (rel === 'incoming') act = '<button type="button" class="nav-btn primary soc-sm" data-a="accept" data-id="' + p.id + '">Принять</button><button type="button" class="ghost-btn soc-sm" data-a="decline" data-id="' + p.id + '">✕</button>';
    else if (rel === 'sent') act = '<button type="button" class="ghost-btn soc-sm" data-a="cancel" data-id="' + p.id + '">Отменить</button>';
    else if (rel === 'none' && searching) act = '<button type="button" class="nav-btn primary soc-sm" data-a="add" data-id="' + p.id + '">Добавить</button>';
    var open = rel === 'friend' || p.is_admin;
    var pi = info[p.id] || {};
    var sub = rel === 'sent' ? 'заявка ушла' : rel === 'incoming' ? 'стучится к тебе' : bdayToday(pi.bday) ? '🎂 Сегодня днюха — поздравь!' : (stats(p.id) || (open ? 'ещё ничего не оценил' : ''));
    if (pi.name && rel !== 'sent' && rel !== 'incoming' && !bdayToday(pi.bday)) sub = pi.name + (sub ? ' · ' + sub : '');
    return '<li class="soc-row' + (p.is_admin ? ' is-chef' : '') + '">' +
      (open ? '<button type="button" class="soc-who" data-a="profile" data-id="' + p.id + '">' : '<div class="soc-who">') +
      avatar(p) + '<span class="soc-who-t">' + nickHTML(p) + (sub ? '<span class="small">' + esc(sub) + '</span>' : '') + '</span>' +
      (open ? '<svg class="soc-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button>' : '</div>') +
      (act ? '<span class="soc-act">' + act + '</span>' : '') + '</li>';
  }
  /* черновик анкеты: что ввёл — не пропадёт, даже если экран перерисуется */
  var fd = null;
  function busyForm() { var a = document.activeElement; return !!(ov.querySelector('#socNick') || (a && ov.contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.value)); }
  function fv(k, dflt) { return fd && fd[k] != null ? fd[k] : dflt; }
  var nickState = '', nickTimer = null;
  function checkNick(v) {
    clearTimeout(nickTimer);
    var hint = ov.querySelector('#socNickHint'); if (!hint) return;
    if (me && v.toLowerCase() === me.nick.toLowerCase()) { nickState = ''; hint.textContent = ''; hint.className = 'soc-nick-hint'; return; }
    if (!/^[A-Za-z0-9_А-Яа-яЁё]{3,20}$/.test(v)) { nickState = 'bad'; hint.textContent = v ? '3–20 символов: буквы, цифры, _' : ''; hint.className = 'soc-nick-hint bad'; return; }
    hint.textContent = 'проверяю…'; hint.className = 'soc-nick-hint';
    nickTimer = setTimeout(function () {
      S.req('GET', 'profiles?select=id&nick=ilike.' + q(v.replace(/_/g, '\\_')) + '&limit=1').then(function (rows) {
        var h = ov.querySelector('#socNickHint'); if (!h || ov.querySelector('#socNickIn').value.trim() !== v) return;
        var taken = rows && rows.length && rows[0].id !== uid();
        nickState = taken ? 'taken' : 'ok';
        h.textContent = taken ? '✕ занят — придумай другой' : '✓ свободен'; h.className = 'soc-nick-hint ' + (taken ? 'bad' : 'ok');
      }).catch(function () { var h = ov.querySelector('#socNickHint'); if (h) h.textContent = ''; });
    }, 450);
  }
  function nickForm(first) {
    var i = info[uid()] || {};
    return '<form class="soc-nickf set-form" id="socNick">' + (first ? '<h3 class="soc-form-h">Знакомимся</h3><p class="small">Пара строк о себе — кенты увидят, нейросеть учтёт. Первый в хате становится шефом.</p>' : '<h3 class="soc-form-h">Анкета</h3>') +
      '<label class="set-f"><span>Ник — по нему найдут кенты</span><input id="socNickIn" type="text" autocomplete="username" autocapitalize="off" spellcheck="false" minlength="3" maxlength="20" pattern="[A-Za-z0-9_А-Яа-яЁё]{3,20}" required value="' + esc(fv('nick', me ? me.nick : '')) + '"><small id="socNickHint" class="soc-nick-hint" aria-live="polite"></small></label>' +
      '<label class="set-f"><span>Имя</span><input id="socName" type="text" autocomplete="given-name" maxlength="40" value="' + esc(fv('name', i.name || '')) + '" placeholder="Как к тебе обращаться"></label>' +
      '<label class="set-f"><span>День рождения</span><input id="socBday" type="date" autocomplete="bday" min="1930-01-01" max="2025-12-31" value="' + esc(fv('bday', i.bday || '')) + '"></label>' +
      '<label class="set-f"><span>Любимая кухня и вкусы</span><input id="socLikes" type="text" maxlength="300" value="' + esc(fv('likes', i.likes || '')) + '" placeholder="Грузинская, острое, бургеры…"></label>' +
      '<label class="set-f"><span>Что не жрёшь</span><input id="socAvoid" type="text" maxlength="300" value="' + esc(fv('avoid', i.avoid || '')) + '" placeholder="Кинза, грибы, рыба…"></label>' +
      '<div class="set-row"><button type="submit" class="nav-btn primary">' + (first ? 'Погнали' : 'Сохранить') + '</button>' + (first ? '' : '<button type="button" class="ghost-btn" data-a="nickx">Отмена</button>') + '</div>' +
      (nickMsg ? '<p class="set-msg">' + esc(nickMsg) + '</p>' : '') + '</form>';
  }

  /* ---------- пуши ---------- */
  var FN = ((window.KUKING_CONFIG || {}).supabaseUrl || '').replace(/\/+$/, '') + '/functions/v1/birthday-push';
  var ANON = (window.KUKING_CONFIG || {}).supabaseAnonKey || '';
  function standalone() { return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; }
  function pushState() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return /iPhone|iPad/.test(navigator.userAgent) && !standalone() ? 'install' : 'nope';
    if (Notification.permission === 'denied') return 'denied';
    return localStorage.getItem('kuking:push') === '1' && Notification.permission === 'granted' ? 'on' : 'off';
  }
  function b64u(s) { var p = '='.repeat((4 - s.length % 4) % 4), b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')), a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
  function fnCall(action) {
    return S.token().then(function (t) {
      return fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: 'Bearer ' + t }, body: JSON.stringify({ action: action }) });
    }).then(function (r) { if (!r.ok) throw new Error(r.status === 404 ? 'функция birthday-push не загружена в Supabase' : 'функция ответила ' + r.status); return r.json(); });
  }
  function enablePush() {
    return Notification.requestPermission().then(function (perm) {
      if (perm !== 'granted') throw new Error('Ты не разрешил уведомления');
      return Promise.all([navigator.serviceWorker.ready, fnCall('init')]);
    }).then(function (r) {
      var reg = r[0], key = r[1].publicKey;
      return reg.pushManager.getSubscription().then(function (old) { return old || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(key) }); });
    }).then(function (sub) { return S.rpc('save_push', { sub: sub.toJSON() }); })
      .then(function () { try { localStorage.setItem('kuking:push', '1'); } catch (e) {} });
  }
  API.pushState = pushState;
  API.enablePush = enablePush;
  API.testPush = function () { return fnCall('test'); };
  function pushCard(after) {
    var st = pushState(), h = '<div class="soc-push card"><h3 class="soc-form-h">🔔 Уведомления</h3>';
    if (st === 'on') h += '<p class="small">Включены.</p><button type="button" class="ghost-btn" data-a="ptest">Проверить пуш</button>';
    else if (st === 'install') h += '<p class="small">На iPhone пуши работают только из приложения на экране «Домой»: Safari → Поделиться → «На экран „Домой“», открой оттуда и включи тут.</p>';
    else if (st === 'denied') h += '<p class="small">Уведомления запрещены. Включи: Настройки iPhone → Уведомления → Кукинг.</p>';
    else if (st === 'nope') h += '<p class="small">Этот браузер пуши не умеет.</p>';
    else h += '<p class="small">Разреши «Кукингу» присылать уведомления. Без спама.</p><button type="button" class="nav-btn primary" data-a="pon">Включить уведомления</button>';
    if (after) h += '<button type="button" class="' + (st === 'off' ? 'ghost-btn' : 'nav-btn primary') + '" data-a="pdone">' + (st === 'off' ? 'Потом' : 'Дальше') + '</button>';
    return h + (msg ? '<p class="set-msg">' + esc(msg) + '</p>' : '') + '</div>';
  }

  /* ---------- профиль человека ---------- */
  function profileHTML(id) {
    var p = people[id] || { id: id, nick: '…' }, rv = reviewsBy[id] || {}, mine = reviewsBy[uid()] || {};
    var ids = Object.keys(rv).filter(function (k) { return rv[k].score; }).sort(function (a, b) { return String(rv[b].at || '').localeCompare(String(rv[a].at || '')); });
    var pi = info[id] || {};
    var h = head(p.nick, true) + '<div class="soc-prof">' + avatar(p, true) + '<div>' + nickHTML(p) + (pi.name ? '<p class="soc-name">' + esc(pi.name) + '</p>' : '') + '<p class="small">' + esc(stats(id) || 'Оценок пока нет') + '</p></div></div>';
    if (pi.bday || pi.likes || pi.avoid) h += '<dl class="soc-facts">' +
      (pi.bday ? '<div' + (bdayToday(pi.bday) ? ' class="today"' : '') + '><dt>Днюха</dt><dd>' + (bdayToday(pi.bday) ? '🎂 Сегодня!' : esc(bdayText(pi.bday))) + '</dd></div>' : '') +
      (pi.likes ? '<div><dt>Любит</dt><dd>' + esc(pi.likes) + '</dd></div>' : '') +
      (pi.avoid ? '<div><dt>Не жрёт</dt><dd>' + esc(pi.avoid) + '</dd></div>' : '') + '</dl>';
    if (!ids.length) h += '<p class="small soc-pad">Ещё ничего не оценил. Пни его — пусть пожрёт и отпишется.</p>';
    h += '<div class="soc-revs">' + ids.map(function (rid) {
      var d = rv[rid], my = mine[rid] && mine[rid].score, have = hasRecipe(rid);
      return '<article class="soc-rev card"><header class="soc-rev-h"><h3>' + esc(titleOf(rid, d.title)) + '</h3><b class="lib-score ' + scCls(d.score) + '">' + d.score + '<small>/10</small></b></header>' +
        (d.comment ? '<p class="soc-cm">' + esc(d.comment) + '</p>' : '') +
        (API.isAdmin() && d.comment && id !== uid() ? '<button type="button" class="lib-link soc-wipe" data-a="wipe" data-owner="' + id + '" data-rid="' + esc(rid) + '">стереть коммент</button>' : '') +
        '<div class="soc-mine">' + (my ? '<span>Твоя: <b class="' + scCls(my) + '">' + my + '</b>/10</span>' + (have ? '<button type="button" class="lib-link" data-a="rate" data-rid="' + esc(rid) + '">изменить</button>' : '')
          : have ? '<button type="button" class="nav-btn primary soc-sm" data-a="rate" data-rid="' + esc(rid) + '">Поставить свою</button>' : '<span class="small">Этого рецепта нет в твоей книге</span>') + '</div>' +
        threadBody(rid, id) + '</article>';
    }).join('') + '</div>';
    if (relation(id) === 'friend' && !p.is_admin) h += '<div class="soc-pad"><button type="button" class="ghost-btn soc-unfriend" data-a="unfriend" data-id="' + id + '">Убрать из друзей</button></div>';
    return h;
  }

  /* ---------- ответы под оценкой ---------- */
  function repliesOf(rid, owner) { return replies.filter(function (x) { return x.recipe_id === rid && x.review_owner === owner; }); }
  function threadBody(rid, owner) {
    var list = repliesOf(rid, owner), m = uid();
    return '<div class="soc-thr" data-rid="' + esc(rid) + '" data-owner="' + owner + '">' +
      (list.length ? '<ul class="soc-reps">' + list.map(function (x) {
        var p = people[x.author];
        return '<li class="soc-rep' + (x.author === m ? ' me' : '') + '"><div class="soc-rep-h">' + nickHTML(p) + '<span class="small">' + ago(x.created_at) + '</span>' +
          (x.author === m || API.isAdmin() ? '<button type="button" class="soc-x" data-a="delrep" data-id="' + x.id + '" aria-label="Удалить ответ">✕</button>' : '') + '</div><p>' + esc(x.body) + '</p></li>';
      }).join('') + '</ul>' : '') +
      '<form class="soc-reply" data-rid="' + esc(rid) + '" data-owner="' + owner + '"><input type="text" maxlength="1000" placeholder="Ответить…" aria-label="Ответ" id="rep-' + esc(rid).replace(/[^\w-]/g, '') + '-' + owner.slice(0, 8) + '">' +
      '<button type="submit" class="soc-send" aria-label="Отправить"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12l16-8-6 16-2-6z"/></svg></button></form></div>';
  }
  /* блок «Обсуждение» на карточке рецепта: шеф и ты, у кого есть оценка */
  var openThr = {};
  API.thread = function (rid, myReview) {
    if (!S.user() || !me) return '';
    var owners = [], m = uid();
    if (admin && admin.id !== m && reviewsBy[admin.id] && reviewsBy[admin.id][rid] && reviewsBy[admin.id][rid].score) owners.push(admin.id);
    if (myReview && myReview.score) owners.push(m);
    if (!owners.length) return '';
    var n = owners.reduce(function (s, o) { return s + repliesOf(rid, o).length; }, 0);
    var isOpen = !!openThr[rid];
    var h = '<div class="lib-thr-wrap"><button type="button" class="lib-link lib-thr" data-rid="' + esc(rid) + '" aria-expanded="' + isOpen + '">Обсуждение' + (n ? ' · ' + n : '') + '</button>';
    if (isOpen) h += owners.map(function (o) {
      var d = (reviewsBy[o] || {})[rid] || myReview, p = people[o];
      return '<div class="lib-thr-item"><div class="soc-rep-h">' + nickHTML(p) + '<b class="lib-score sm ' + scCls(d.score) + '">' + d.score + '</b></div>' +
        (o !== m && d.comment ? '<p class="soc-cm">' + esc(d.comment) + '</p>' : '') + threadBody(rid, o) + '</div>';
    }).join('');
    return h + '</div>';
  };
  API.bindThreads = function (root, rerender) {
    root.querySelectorAll('.lib-thr').forEach(function (b) { b.addEventListener('click', function () { var r = b.getAttribute('data-rid'); openThr[r] = !openThr[r]; rerender(); }); });
    bindReplies(root, rerender);
  };
  function bindReplies(root, rerender) {
    root.querySelectorAll('.soc-reply').forEach(function (f) {
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        var inp = f.querySelector('input'), body = inp.value.trim(); if (!body || busy) return;
        busy = true; inp.disabled = true;
        S.req('POST', 'replies', { recipe_id: f.getAttribute('data-rid'), review_owner: f.getAttribute('data-owner'), author: uid(), body: body }, 'return=representation')
          .then(function (rows) { busy = false; if (rows && rows[0]) replies.push(rows[0]); emit(); rerender(); })
          .catch(function () { busy = false; inp.disabled = false; toast('Не отправилось — проверь интернет'); });
      });
    });
    root.querySelectorAll('[data-a=delrep]').forEach(function (b) {
      b.addEventListener('click', function () {
        armed(b, 'Удалить?', function () {
          var id = +b.getAttribute('data-id');
          S.req('DELETE', 'replies?id=eq.' + id).then(function () { replies = replies.filter(function (x) { return x.id !== id; }); emit(); rerender(); }).catch(function () { toast('Не удалилось'); });
        });
      });
    });
  }

  /* ---------- действия ---------- */
  function act(a, b) {
    var id = b.getAttribute('data-id'), m = uid();
    if (a === 'close') return close();
    if (a === 'back') { view = 'list'; render(); return; }
    if (a === 'login') { close(); if (window.KukingSettings) window.KukingSettings.open('account'); return; }
    if (a === 'nick') { view = view === 'nick' ? 'list' : 'nick'; nickMsg = ''; render(); var i = ov.querySelector('#socNickIn'); if (i) i.focus(); return; }
    if (a === 'nickx') { fd = null; view = 'list'; render(); return; }
    if (a === 'profile') { viewing = id; view = 'profile'; render(); ov.querySelectorAll('.soc-page')[1].scrollTop = 0; return; }
    if (a === 'invite') return invite();
    if (a === 'pon') { msg = 'Включаю…'; render(); enablePush().then(function () { msg = ''; render(); toast('Пуши включены'); }).catch(function (e) { msg = 'Не вышло: ' + (e && e.message || ''); render(); }); return; }
    if (a === 'ptest') { msg = 'Шлю…'; render(); API.testPush().then(function (r) { msg = r && r.sent ? 'Ушло — глянь шторку' : 'Подписка не нашлась, включи пуши заново'; if (!(r && r.sent)) try { localStorage.removeItem('kuking:push'); } catch (e) {} render(); }).catch(function (e) { msg = 'Не вышло: ' + (e && e.message || ''); render(); }); return; }
    if (a === 'pdone') { msg = ''; view = 'list'; render(); return; }
    if (a === 'add') {
      var rev = links.filter(function (l) { return l.a === id && l.b === m && l.status === 'pending'; })[0];
      return run(rev ? S.req('PATCH', 'friends?a=eq.' + q(id) + '&b=eq.' + q(m), { status: 'accepted' }) : S.req('POST', 'friends', { a: m, b: id, status: 'pending' }), rev ? 'Теперь вы кенты' : 'Заявка ушла');
    }
    if (a === 'accept') return run(S.req('PATCH', 'friends?a=eq.' + q(id) + '&b=eq.' + q(m), { status: 'accepted' }), 'Теперь вы кенты');
    if (a === 'decline') return run(S.req('DELETE', 'friends?a=eq.' + q(id) + '&b=eq.' + q(m)), '');
    if (a === 'cancel') return run(S.req('DELETE', 'friends?a=eq.' + q(m) + '&b=eq.' + q(id)), '');
    if (a === 'unfriend') return armed(b, 'Точно убрать?', function () {
      run(Promise.all([S.req('DELETE', 'friends?a=eq.' + q(m) + '&b=eq.' + q(id)), S.req('DELETE', 'friends?a=eq.' + q(id) + '&b=eq.' + q(m))]), 'Убрал из друзей').then(function () { view = 'list'; render(); });
    });
    if (a === 'rate') { var rid = b.getAttribute('data-rid'); close(); if (window.KukingLib) window.KukingLib.rate(rid); return; }
    if (a === 'wipe') return armed(b, 'Точно стереть?', function () {
      var owner = b.getAttribute('data-owner'), r2 = b.getAttribute('data-rid');
      run(S.rpc('admin_clear_comment', { owner: owner, rid: r2 }), 'Коммент стёрт');
    });
  }
  function run(p, ok) {
    return p.then(function () { if (ok) toast(ok); return refresh(); }).catch(function (e) { toast('Не вышло: ' + (e && e.message || 'нет связи')); });
  }
  function bind() {
    ov.querySelectorAll('[data-a]').forEach(function (b) { if (b.tagName === 'BUTTON') b.addEventListener('click', function () { act(b.getAttribute('data-a'), b); }); });
    var f = ov.querySelector('#socFind');
    if (f) f.addEventListener('submit', function (e) {
      e.preventDefault(); searchQ = ov.querySelector('#socQ').value.trim().replace(/[%*,()]/g, '');
      if (searchQ.length < 2) { found = null; render(); return; }
      S.req('GET', 'profiles?select=id,nick,is_admin&nick=ilike.*' + q(searchQ) + '*&id=neq.' + q(uid()) + '&limit=15').then(function (rows) {
        found = rows || []; found.forEach(function (p) { people[p.id] = p; }); render();
      }).catch(function () { found = []; render(); });
    });
    var nf = ov.querySelector('#socNick');
    if (nf) {
      var map = { socNickIn: 'nick', socName: 'name', socBday: 'bday', socLikes: 'likes', socAvoid: 'avoid' };
      nf.addEventListener('input', function (e) { var k = map[e.target.id]; if (!k) return; fd = fd || {}; fd[k] = e.target.value; if (k === 'nick') checkNick(e.target.value.trim()); });
      nf.addEventListener('change', function (e) { var k = map[e.target.id]; if (k) { fd = fd || {}; fd[k] = e.target.value; } });
      var ni = ov.querySelector('#socNickIn'); if (ni && ni.value && (!me || ni.value !== me.nick)) checkNick(ni.value.trim());
    }
    if (nf) nf.addEventListener('submit', function (e) {
      e.preventDefault(); if (busy) return;
      var v = function (id) { return ov.querySelector(id).value.trim(); };
      var nick = v('#socNickIn'), first = !me;
      var data = { id: uid(), name: v('#socName') || null, bday: v('#socBday') || null, likes: v('#socLikes') || null, avoid: v('#socAvoid') || null, updated_at: new Date().toISOString() };
      if (!/^[A-Za-z0-9_А-Яа-яЁё]{3,20}$/.test(nick)) { nickMsg = 'Ник: 3–20 символов, буквы, цифры, _'; render(); return; }
      if (nickState === 'taken') { nickMsg = 'Ник занят — придумай другой'; render(); return; }
      busy = true; nickMsg = 'Сохраняю…'; render();
      var step = me ? (me.nick === nick ? Promise.resolve() : S.req('PATCH', 'profiles?id=eq.' + q(uid()), { nick: nick }))
        : S.req('POST', 'profiles', { id: uid(), nick: nick }).then(function () { return S.rpc('claim_admin'); });
      step.then(function () { return S.req('POST', 'profile_info?on_conflict=id', [data], 'resolution=merge-duplicates,return=minimal'); })
        .then(function () { busy = false; nickMsg = ''; fd = null; view = first && pushState() !== 'nope' ? 'push' : 'list'; return refresh().then(acceptPending); })
        .catch(function (er) { busy = false; nickMsg = /duplicate|unique|23505|409/i.test(String(er && (er.message || er.code))) ? 'Ник занят — придумай другой' : 'Не вышло: ' + (er && er.message); render(); });
    });
    bindReplies(ov, render);
  }

  function invite() {
    var url = location.origin + location.pathname + '?invite=' + uid();
    var text = 'Го в «Кукинг» — будем вместе жрать и ставить оценки. Я там ' + me.nick;
    if (navigator.share) { navigator.share({ title: 'Кукинг', text: text, url: url }).catch(function () {}); return; }
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { toast('Ссылка скопирована — кидай в чат'); })
      .catch(function () { msg = url; render(); });
  }

  /* приглашение по ссылке: ?invite=<id> */
  var IKEY = 'kuking:invite';
  (function () {
    var m = /[?&]invite=([0-9a-f-]{36})/i.exec(location.search);
    if (!m) return;
    try { localStorage.setItem(IKEY, m[1]); } catch (e) {}
    try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) {}
  })();
  function acceptPending() {
    var inv = null; try { inv = localStorage.getItem(IKEY); } catch (e) {}
    if (!inv || !S.user() || !me || inv === uid()) { try { if (inv === uid()) localStorage.removeItem(IKEY); } catch (e) {} return; }
    return S.rpc('accept_invite', { inviter: inv }).then(function (ok) {
      try { localStorage.removeItem(IKEY); } catch (e) {}
      if (ok) return loadProfiles([inv]).then(refresh).then(function () { toast('Вы с ' + ((people[inv] || {}).nick || 'другом') + ' теперь кенты'); });
    }).catch(function () {});
  }

  function toast(t) {
    var el = document.createElement('div'); el.className = 'send-toast'; el.setAttribute('role', 'status'); el.textContent = t; el.style.zIndex = 80;
    document.body.appendChild(el); requestAnimationFrame(function () { el.classList.add('on'); });
    setTimeout(function () { el.classList.remove('on'); setTimeout(function () { el.remove(); }, 400); }, 2400);
  }
  function armed(b, label, go) {
    if (b.getAttribute('data-armed')) { go(); return; }
    b.setAttribute('data-armed', '1'); b.classList.add('armed'); var t = b.textContent; b.textContent = label;
    setTimeout(function () { if (b.isConnected) { b.removeAttribute('data-armed'); b.classList.remove('armed'); b.textContent = t; } }, 3000);
  }

  var last = null;
  function open(personId) {
    last = document.activeElement;
    view = personId ? 'profile' : 'list'; viewing = personId || viewing; found = null; msg = '';
    render(); ov.hidden = false; requestAnimationFrame(function () { ov.classList.add('on'); });
    refresh(); clearInterval(timer); timer = setInterval(function () { if (!document.hidden) refresh(); }, 20000);
  }
  function close() {
    ov.classList.remove('on'); clearInterval(timer);
    setTimeout(function () { ov.hidden = true; view = 'list'; }, 320);
    if (last && last.focus) last.focus();
  }
  API.open = open; API.close = close;
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !ov.hidden) { if (view === 'profile') { view = 'list'; render(); } else close(); } });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(); });
  API.enabled = true;

  /* старт: подтянуть всё; нет ника — один раз показать экран друзей */
  if (S.user()) refresh().then(function () {
    if (!me) open(); else acceptPending();
  });
  else { var inv0 = null; try { inv0 = localStorage.getItem(IKEY); } catch (e) {} if (inv0) setTimeout(function () { if (window.KukingSettings) window.KukingSettings.open('account'); }, 700); }
})();
