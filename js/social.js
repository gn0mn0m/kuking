/* Друзья: профили, заявки, лента, отзывы и комментарии к рецептам, фото, личные сообщения, пуши.
   Таблицы Supabase прежние: profiles, friends, profile_info, docs(reviews), photos, review_likes, qa, messages, push_subs. */
(function () {
  'use strict';
  var Z = window.Z, D = Z.data, E = Z.esc;
  function S() { return window.KukingStore; }
  function on() { return !!(S() && S().enabled && S().user()); }
  function uid() { return on() ? S().user().id : null; }
  function q(s) { return encodeURIComponent(s); }
  function req(m, p, b, pr) { return S().req(m, p, b, pr); }

  var st = Z.ls.get('kuking:soc5', null) || { me: null, people: {}, links: [], reviews: {}, info: {} };
  var feed = [], msgs = [], recipeData = {}, loaded = false;
  function cache() { Z.ls.set('kuking:soc5', { me: st.me, people: st.people, links: st.links, reviews: st.reviews, info: st.info }); }
  var COL = ['#6E1F2E', '#3F6B3A', '#1D1A17', '#A3324B', '#8A5A32', '#46753D'];
  function color(id) { var h = 0; String(id).split('').forEach(function (c) { h = (h * 31 + c.charCodeAt(0)) | 0; }); return COL[Math.abs(h) % COL.length]; }
  function nick(id) { if (id === uid()) return 'Ты'; var p = st.people[id]; var inf = st.info[id]; return (inf && inf.name) || (p && p.nick) || 'Кто-то'; }
  function av(id, cls) { var n = nick(id === uid() ? '' : id); var inf = st.info[id]; if (inf && inf.avatar) return '<img class="av ' + (cls || '') + '" src="' + inf.avatar + '" alt="" style="object-fit:cover">'; return '<span class="av ' + (cls || '') + '" style="background:' + color(id) + '" aria-hidden="true">' + E((id === uid() ? (st.me && st.me.nick || 'Я') : n)[0].toUpperCase()) + '</span>'; }
  function friends() { var m = uid(); return st.links.filter(function (l) { return l.status === 'accepted'; }).map(function (l) { return l.a === m ? l.b : l.a; }); }
  function incoming() { var m = uid(); return st.links.filter(function (l) { return l.status !== 'accepted' && l.b === m; }).map(function (l) { return l.a; }); }
  function outgoing() { var m = uid(); return st.links.filter(function (l) { return l.status !== 'accepted' && l.a === m; }).map(function (l) { return l.b; }); }

  function loadPeople(ids) {
    ids = ids.filter(function (id, i) { return id && ids.indexOf(id) === i && !st.people[id]; });
    if (!ids.length) return Promise.resolve();
    return req('GET', 'profiles?select=id,nick,is_admin&id=in.(' + ids.map(q).join(',') + ')').then(function (rows) { (rows || []).forEach(function (p) { st.people[p.id] = p; }); });
  }
  function load() {
    if (!on()) return Promise.resolve();
    var m = uid();
    return Promise.all([
      req('GET', 'profiles?select=id,nick,is_admin&id=eq.' + q(m)),
      Promise.all([req('GET', 'friends?select=a,b,status,created_at&a=eq.' + q(m)), req('GET', 'friends?select=a,b,status,created_at&b=eq.' + q(m))]).then(function (x) { return (x[0] || []).concat(x[1] || []); }),
      S().allReviews(),
      req('GET', 'profile_info?select=id,name,bday,likes,avoid,allergy,avatar').catch(function () { return []; }),
      req('GET', 'photos?select=id,recipe_id,recipe_title,author,thumb,caption,created_at&order=created_at.desc&limit=40').catch(function () { return []; }),
      req('GET', 'qa?select=id,recipe_id,recipe_title,parent,author,body,by_ai,kind,created_at&parent=is.null&order=created_at.desc&limit=40').catch(function () { return []; }),
      req('GET', 'messages?select=id,sender,receiver,body,recipe_title,created_at,read_at&order=created_at.desc&limit=400').catch(function () { return []; })
    ]).then(function (r) {
      st.me = r[0] && r[0][0] || null; if (st.me) st.people[st.me.id] = st.me;
      st.links = r[1] || [];
      st.reviews = {}; (r[2] || []).forEach(function (row) { if (row.user_id && row.data && row.data.score) (st.reviews[row.user_id] = st.reviews[row.user_id] || {})[row.id] = row.data; });
      st.info = {}; (r[3] || []).forEach(function (x) { st.info[x.id] = x; });
      var ph = r[4] || [], qa = r[5] || []; msgs = r[6] || [];
      var ids = []; st.links.forEach(function (l) { ids.push(l.a, l.b); }); Object.keys(st.reviews).forEach(function (id) { ids.push(id); }); ph.forEach(function (x) { ids.push(x.author); }); qa.forEach(function (x) { ids.push(x.author); }); msgs.forEach(function (x) { ids.push(x.sender, x.receiver); });
      return loadPeople(ids).then(function () {
        feed = [];
        Object.keys(st.reviews).forEach(function (u) { if (u === m) return; Object.keys(st.reviews[u]).forEach(function (rid) { var v = st.reviews[u][rid]; feed.push({ kind: 'rev', who: u, rid: rid, title: v.title, score: v.score, text: v.comment, at: v.updatedAt || v.at }); }); });
        ph.forEach(function (x) { feed.push({ kind: 'photo', who: x.author, rid: x.recipe_id, title: x.recipe_title, thumb: x.thumb, text: x.caption, at: x.created_at, id: x.id }); });
        qa.forEach(function (x) { if (x.by_ai) return; feed.push({ kind: x.kind === 'c' ? 'com' : 'ask', who: x.author, rid: x.recipe_id, title: x.recipe_title, text: x.body, at: x.created_at, id: x.id }); });
        feed.sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
        loaded = true; cache(); Z.emit('social'); if (Z.badges) Z.badges();
      });
    }).catch(function () {});
  }
  setInterval(function () { if (!document.hidden && on()) load(); }, 60000);
  Z.on('social', function () { var v = document.getElementById('view'); if (v && /friends/.test(location.hash) && !(document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName) && document.activeElement.value)) Z.render(true); });

  /* ---------- отзывы, фото и комментарии к рецепту: свой узел, обновляется точечно ---------- */
  function recipeHTML(r) {
    var x = recipeData[r.id], h = '<h2 class="h-sec">Друзья о блюде</h2>';
    if (!on()) return h + '<p class="small muted">Войди, чтобы видеть отзывы друзей.</p>';
    var revs = []; Object.keys(st.reviews).forEach(function (u) { if (u !== uid() && st.reviews[u][r.id]) revs.push({ u: u, v: st.reviews[u][r.id] }); });
    if (!x && !revs.length) return h + '<p class="small muted"><span class="spin"></span></p>';
    var likes = x ? x.likes : [];
    h += revs.length ? '<div class="stack">' + revs.map(function (o) {
      var n = likes.filter(function (l) { return l.review_owner === o.u; }).length, mine = likes.some(function (l) { return l.review_owner === o.u && l.liker === uid(); });
      return '<div class="card pad"><div class="row">' + av(o.u) + '<div class="grow"><p style="font-weight:600">' + E(nick(o.u)) + '</p><p class="small muted">' + E(o.v.at ? Z.dayRel(o.v.at) : '') + '</p></div><span class="score">' + o.v.score + '</span></div>' + (o.v.comment ? '<p style="margin-top:8px">' + E(o.v.comment) + '</p>' : '') +
        '<button type="button" class="btn btn-soft btn-s" data-like="' + E(o.u) + '" aria-pressed="' + mine + '" style="margin-top:10px' + (mine ? ';background:var(--act);border-color:var(--act);color:var(--act-ink)' : '') + '">Вкусно' + (n ? ', ' + n : '') + '</button></div>'; }).join('') + '</div>' : '<p class="small muted">Друзья это ещё не готовили.</p>';
    if (x && x.photos.length) h += '<div class="chips" style="margin-top:12px">' + x.photos.map(function (p) { return '<img src="' + p.thumb + '" alt="Фото ' + E(nick(p.author)) + '" style="width:96px;height:96px;object-fit:cover;border-radius:var(--r-s);flex:none">'; }).join('') + '</div>';
    if (x) {
      var top = x.qa.filter(function (c) { return !c.parent; });
      if (top.length) h += '<ul class="list" style="margin-top:14px">' + top.map(function (c) {
        var ans = x.qa.filter(function (a) { return a.parent === c.id; });
        return '<li class="li" style="display:block"><div class="row" style="align-items:flex-start">' + av(c.author) + '<div class="grow"><p class="small"><b>' + E(nick(c.author)) + '</b> <span class="muted">' + E(Z.ago(c.created_at)) + '</span></p><p>' + E(c.body) + '</p>' +
          ans.map(function (a) { return '<p class="small" style="margin-top:6px;padding-left:10px;border-left:2px solid var(--line-2)"><b>' + E(a.by_ai ? 'Шеф-нейросеть' : nick(a.author)) + ':</b> ' + E(a.body) + '</p>'; }).join('') + '</div>' +
          (c.author === uid() ? '<button type="button" class="icon-btn" style="border:0;background:none" data-cdel="' + c.id + '" aria-label="Удалить комментарий">' + Z.icon('trash') + '</button>' : '') + '</div></li>'; }).join('') + '</ul>';
    }
    h += '<form class="row" id="cf" style="margin-top:12px"><label class="sr" for="ci">Комментарий</label><input id="ci" class="inp" placeholder="Комментарий или вопрос" maxlength="1500" autocomplete="off"><button class="icon-btn" aria-label="Отправить">' + Z.icon('send') + '</button></form>';
    h += '<label class="btn btn-soft btn-s" style="margin-top:10px;cursor:pointer">' + Z.icon('camera') + 'Добавить своё фото<input type="file" accept="image/*" id="pf" class="sr"></label>';
    return h;
  }
  function patch(rid) {
    var n = document.getElementById('hub'); if (!n || n.getAttribute('data-rid') !== rid) return;
    var a = document.activeElement; if (a && n.contains(a) && a.value) return;
    var r = D.byId(rid); if (!r) return; var html = recipeHTML(r); if (n.__h === html) return; n.__h = html; n.innerHTML = html; bindHub(n, r);
  }
  function loadRecipe(r) {
    if (!on()) return;
    var n = document.getElementById('hub'); if (n) bindHub(n, r);
    Promise.all([
      req('GET', 'photos?select=id,recipe_id,author,thumb,caption,created_at&recipe_id=eq.' + q(r.id) + '&order=created_at.desc&limit=30').catch(function () { return []; }),
      req('GET', 'review_likes?select=recipe_id,review_owner,liker&recipe_id=eq.' + q(r.id)).catch(function () { return []; }),
      req('GET', 'qa?select=id,recipe_id,parent,author,body,by_ai,kind,created_at&recipe_id=eq.' + q(r.id) + '&order=created_at.asc&limit=200').catch(function () { return []; })
    ]).then(function (x) {
      recipeData[r.id] = { photos: x[0] || [], likes: x[1] || [], qa: x[2] || [] };
      var ids = []; recipeData[r.id].photos.forEach(function (p) { ids.push(p.author); }); recipeData[r.id].qa.forEach(function (c) { ids.push(c.author); });
      return loadPeople(ids);
    }).then(function () { patch(r.id); });
  }
  function bindHub(n, r) {
    n.onsubmit = function (e) {
      e.preventDefault(); var i = n.querySelector('#ci'), v = i.value.trim(); if (!v) return;
      i.value = ''; i.blur();
      var x = recipeData[r.id] = recipeData[r.id] || { photos: [], likes: [], qa: [] }, tmp = { id: -Date.now(), recipe_id: r.id, author: uid(), body: v, kind: 'c', created_at: new Date().toISOString() };
      x.qa.push(tmp); patch(r.id);
      req('POST', 'qa', { recipe_id: r.id, recipe_title: String(r.title).slice(0, 120), author: uid(), body: v.slice(0, 1500), kind: 'c' }, 'return=representation').then(function (rows) { var k = x.qa.indexOf(tmp); if (k >= 0 && rows && rows[0]) x.qa[k] = rows[0]; patch(r.id); })
        .catch(function () { x.qa = x.qa.filter(function (c) { return c !== tmp; }); patch(r.id); Z.toast('Комментарий не отправился. Проверь связь.'); });
    };
    n.onchange = function (e) {
      if (e.target.id !== 'pf' || !e.target.files[0]) return;
      var f = e.target.files[0]; Z.toast('Загружаю фото…');
      shrinkFile(f, 1280, 0.8).then(function (full) { return shrinkFile(f, 320, 0.7).then(function (th) { return [full, th]; }); }).then(function (x) {
        return req('POST', 'photos', { recipe_id: r.id, recipe_title: String(r.title).slice(0, 120), author: uid(), thumb: x[1], full_img: x[0] }, 'return=minimal');
      }).then(function () { Z.toast('Фото добавлено'); loadRecipe(r); }, function () { Z.toast('Фото не загрузилось'); });
    };
  }
  function shrinkFile(f, max, qq) {
    return new Promise(function (ok, no) { var fr = new FileReader(); fr.onload = function () { var im = new Image(); im.onload = function () { var k = Math.min(1, max / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); ok(c.toDataURL('image/jpeg', qq)); }; im.onerror = no; im.src = fr.result; }; fr.onerror = no; fr.readAsDataURL(f); });
  }
  function recipeClick(e, r) {
    var b = e.target.closest('[data-like]');
    if (b) {
      var ow = b.getAttribute('data-like'), x = recipeData[r.id]; if (!x) return;
      var mine = x.likes.filter(function (l) { return l.review_owner === ow && l.liker === uid(); })[0];
      if (mine) { x.likes = x.likes.filter(function (l) { return l !== mine; }); req('DELETE', 'review_likes?recipe_id=eq.' + q(r.id) + '&review_owner=eq.' + ow + '&liker=eq.' + uid()).catch(function () {}); }
      else { x.likes.push({ recipe_id: r.id, review_owner: ow, liker: uid() }); req('POST', 'review_likes', { recipe_id: r.id, review_owner: ow, liker: uid() }, 'return=minimal').catch(function () {}); }
      Z.haptic(6); patch(r.id); return;
    }
    b = e.target.closest('[data-cdel]');
    if (b) { var id = +b.getAttribute('data-cdel'), y = recipeData[r.id]; y.qa = y.qa.filter(function (c) { return c.id !== id && c.parent !== id; }); patch(r.id); req('DELETE', 'qa?id=eq.' + id).catch(function () {}); }
  }

  /* ---------- сообщения ---------- */
  function unread() { var m = uid(); return msgs.filter(function (x) { return x.receiver === m && !x.read_at; }).length; }
  function threads() {
    var m = uid(), by = {};
    msgs.forEach(function (x) { var o = x.sender === m ? x.receiver : x.sender; if (!by[o]) by[o] = { who: o, last: x, unread: 0 }; if (x.receiver === m && !x.read_at) by[o].unread++; });
    return Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return String(b.last.created_at).localeCompare(String(a.last.created_at)); });
  }
  function send(to, body, recipe) {
    var row = { sender: uid(), receiver: to, body: (body || '').slice(0, 2000) };
    if (recipe) { row.recipe = recipe; row.recipe_title = String(recipe.title).slice(0, 120); }
    var tmp = Object.assign({ id: -Date.now(), created_at: new Date().toISOString() }, row); msgs.unshift(tmp); Z.emit('social');
    return req('POST', 'messages', row, 'return=representation').then(function (rows) {
      var i = msgs.indexOf(tmp); if (i >= 0 && rows && rows[0]) msgs[i] = rows[0]; Z.emit('social');
      if (rows && rows[0]) fn('msg', { id: rows[0].id }).catch(function () {});
    }, function (e) { msgs = msgs.filter(function (x) { return x !== tmp; }); Z.emit('social'); throw e; });
  }
  function markRead(who) {
    var m = uid(), now = new Date().toISOString(), any = false;
    msgs.forEach(function (x) { if (x.sender === who && x.receiver === m && !x.read_at) { x.read_at = now; any = true; } });
    if (any) { req('PATCH', 'messages?receiver=eq.' + m + '&sender=eq.' + who + '&read_at=is.null', { read_at: now }).catch(function () {}); if (Z.badges) Z.badges(); }
  }
  function openShared(id) {
    return req('GET', 'messages?select=recipe&id=eq.' + id).then(function (r) { return r && r[0] && r[0].recipe; });
  }
  function shareRecipe(r) {
    var fr = friends(); if (!on()) return Z.toast('Войди, чтобы отправлять рецепты');
    if (!fr.length) return Z.toast('Сначала добавь друга во вкладке «Друзья»');
    var s = Z.sheet('Отправить рецепт', '<ul class="list">' + fr.map(function (id) { return '<li><button type="button" class="chk" data-to="' + E(id) + '">' + av(id) + '<span class="grow chk-name">' + E(nick(id)) + '</span>' + Z.icon('send') + '</button></li>'; }).join('') + '</ul>');
    s.body.onclick = function (e) { var b = e.target.closest('[data-to]'); if (!b) return; var to = b.getAttribute('data-to'); s.close(); send(to, '', r).then(function () { Z.toast('Отправил ' + nick(to)); }, function () { Z.toast('Не отправилось'); }); };
  }

  /* ---------- друзья ---------- */
  function act(a, id) {
    var m = uid(), p;
    if (a === 'add') { var rev = st.links.some(function (l) { return l.a === id && l.b === m; }); p = rev ? req('PATCH', 'friends?a=eq.' + q(id) + '&b=eq.' + q(m), { status: 'accepted' }) : req('POST', 'friends', { a: m, b: id }); }
    else if (a === 'accept') p = req('PATCH', 'friends?a=eq.' + q(id) + '&b=eq.' + q(m), { status: 'accepted' });
    else if (a === 'decline') p = req('DELETE', 'friends?a=eq.' + q(id) + '&b=eq.' + q(m));
    else if (a === 'cancel') p = req('DELETE', 'friends?a=eq.' + q(m) + '&b=eq.' + q(id));
    else if (a === 'remove') p = Promise.all([req('DELETE', 'friends?a=eq.' + q(m) + '&b=eq.' + q(id)), req('DELETE', 'friends?a=eq.' + q(id) + '&b=eq.' + q(m))]);
    return p.then(load);
  }
  function search(v) { return req('GET', 'profiles?select=id,nick,is_admin&nick=ilike.*' + q(v.replace(/[%*_]/g, '')) + '*&id=neq.' + q(uid()) + '&limit=15').then(function (rows) { (rows || []).forEach(function (p) { st.people[p.id] = p; }); return rows || []; }); }
  function setNick(n) {
    var p = st.me ? req('PATCH', 'profiles?id=eq.' + q(uid()), { nick: n }) : req('POST', 'profiles', { id: uid(), nick: n }).then(function () { return S().rpc('claim_admin').catch(function () {}); });
    return p.then(load);
  }
  function saveInfo(d) { d.id = uid(); d.updated_at = new Date().toISOString(); return req('POST', 'profile_info?on_conflict=id', [d], 'resolution=merge-duplicates,return=minimal').then(load); }

  /* ---------- пуши ---------- */
  var FN = ((window.KUKING_CONFIG || {}).supabaseUrl || '').replace(/\/+$/, '') + '/functions/v1/birthday-push', FNS = [FN, FN + 'ing'];
  function fn(action, extra, i) {
    i = i || 0;
    var call = action === 'init' ? fetch(FNS[i], { method: 'POST', body: JSON.stringify({ action: 'init' }) }) :
      S().token().then(function (t) { return fetch(FNS[i], { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: (window.KUKING_CONFIG || {}).supabaseAnonKey, Authorization: 'Bearer ' + t }, body: JSON.stringify(Object.assign({ action: action }, extra || {})) }); });
    return Promise.resolve(call).then(function (r) { if (r.status === 404 && i + 1 < FNS.length) return fn(action, extra, i + 1); if (!r.ok) throw new Error('Сервер уведомлений ответил ' + r.status); return r.json(); });
  }
  function b64u(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; var raw = atob(s), a = new Uint8Array(raw.length); for (var i = 0; i < raw.length; i++) a[i] = raw.charCodeAt(i); return a; }
  function pushState() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !window.Notification) return /iPhone|iPad/.test(navigator.userAgent) && !navigator.standalone ? 'install' : 'nope';
    if (Notification.permission === 'denied') return 'denied';
    return Notification.permission === 'granted' && Z.ls.get('kuking:push', null) ? 'on' : 'off';
  }
  function enablePush() {
    return Notification.requestPermission().then(function (perm) {
      if (perm !== 'granted') throw new Error('Уведомления не разрешены');
      return Promise.all([navigator.serviceWorker.ready, fn('init')]);
    }).then(function (r) { var reg = r[0]; return reg.pushManager.getSubscription().then(function (old) { return old || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(r[1].publicKey) }); }); })
      .then(function (sub) { return S().rpc('save_push', { sub: sub.toJSON() }); })
      .then(function () { Z.ls.set('kuking:push', '1'); D.syncTasks(); });
  }

  Z.social = { load: load, on: on, uid: uid, nick: nick, av: av, color: color, friends: friends, incoming: incoming, outgoing: outgoing, feed: function () { return feed; }, loaded: function () { return loaded; },
    people: function () { return st.people; }, me: function () { return st.me; }, info: function (id) { return st.info[id || uid()] || null; }, reviewsOf: function (id) { return st.reviews[id] || {}; },
    myNick: function () { return st.me && st.me.nick; }, recipeHTML: recipeHTML, loadRecipe: loadRecipe, recipeClick: recipeClick,
    unread: unread, threads: threads, msgs: function () { return msgs; }, send: send, markRead: markRead, openShared: openShared, shareRecipe: shareRecipe,
    act: act, search: search, setNick: setNick, saveInfo: saveInfo, pushState: pushState, enablePush: enablePush, testPush: function () { return fn('test'); } };
})();
