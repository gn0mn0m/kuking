/* Store — облако «Кукинга» на Supabase без библиотек, голым fetch.
   Вход по почте и паролю, таблица docs(collection, id, user_id, data).
   Наружу отдаёт тот же интерфейс, что ждёт книга: window.claude.use('db') →
   collection(name).doc(id).set/get/delete, collection(name).onSnapshot(cb).
   reviews и meta — личные (только мои строки), fresh — общая полка свежака. */
(function () {
  'use strict';
  var C = window.KUKING_CONFIG || {};
  var URL_ = (C.supabaseUrl || '').replace(/\/+$/, ''), KEY = C.supabaseAnonKey || '';
  var SKEY = 'kuking:session';
  var PERSONAL = { reviews: 1, meta: 1, fresh: 1 };
  var enabled = !!(URL_ && KEY);

  function load() { try { return JSON.parse(localStorage.getItem(SKEY)); } catch (e) { return null; } }
  function save(s) { try { if (s) localStorage.setItem(SKEY, JSON.stringify(s)); else localStorage.removeItem(SKEY); } catch (e) {} }
  var session = load();
  var authSubs = [];
  function emitAuth() { authSubs.slice().forEach(function (f) { try { f(api.user()); } catch (e) {} }); }

  function err(code, message) { var e = new Error(message || code); e.code = code; return e; }
  /* облако за Cloudflare в РФ может висеть минутами — режем по таймауту и живём на локальных данных */
  var net = { ok: true, subs: [] };
  function setNet(ok) { if (net.ok === ok) return; net.ok = ok; net.subs.forEach(function (f) { try { f(ok); } catch (e) {} }); if (ok) flush(); }
  function tfetch(url, opt, ms) {
    var c = window.AbortController ? new AbortController() : null, t = c ? setTimeout(function () { c.abort(); }, ms || 12000) : 0;
    if (c) opt.signal = c.signal;
    return fetch(url, opt).then(function (r) { clearTimeout(t); setNet(true); return r; }, function (e) { clearTimeout(t); setNet(false); throw err('network', e && e.name === 'AbortError' ? 'облако не ответило' : 'нет связи'); });
  }
  function jsonOrThrow(r) {
    return r.text().then(function (t) {
      var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) {}
      if (!r.ok) {
        var m = (j && (j.msg || j.message || j.error_description || j.error)) || ('HTTP ' + r.status);
        throw err(r.status === 401 ? 'unauthorized' : r.status === 429 ? 'rate_limited' : 'http_' + r.status, m);
      }
      return j;
    });
  }
  function authFetch(path, body) {
    return tfetch(URL_ + '/auth/v1/' + path, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 20000).then(jsonOrThrow);
  }
  function setSession(j) {
    if (!j || !j.access_token) return null;
    session = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at || (Date.now() / 1000 + (j.expires_in || 3600)), user: { id: j.user.id, email: j.user.email } };
    save(session); emitAuth(); return session;
  }
  var refreshing = null;
  function token() {
    if (!session) return Promise.reject(err('signed_out'));
    if (session.expires_at - 60 > Date.now() / 1000) return Promise.resolve(session.access_token);
    if (!refreshing) refreshing = authFetch('token?grant_type=refresh_token', { refresh_token: session.refresh_token })
      .then(function (j) { refreshing = null; return setSession(j).access_token; })
      .catch(function (e) { refreshing = null; if (e.code === 'http_400' || e.code === 'unauthorized') { session = null; save(null); emitAuth(); } throw e; });
    return refreshing;
  }
  /* любой запрос к PostgREST: path = 'таблица?фильтры' или 'rpc/функция' */
  function req(method, path, body, prefer) {
    return token().then(function (t) {
      var h = { apikey: KEY, Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' };
      if (prefer) h.Prefer = prefer;
      return tfetch(URL_ + '/rest/v1/' + path, { method: method, headers: h, body: body ? JSON.stringify(body) : undefined }, method === 'GET' ? 12000 : 20000).then(jsonOrThrow);
    });
  }
  function rest(method, query, body, prefer) { return req(method, 'docs' + (query ? '?' + query : ''), body, prefer); }
  function q(s) { return encodeURIComponent(s); }

  /* ---------- снимки коллекций: опрос раз в 30 с, при возврате в приложение и после своих записей ---------- */
  var subs = {}; // name -> [{cb, err}]
  function snapshotOf(name, rows) {
    var mine = api.user() && api.user().id, byId = {};
    rows.forEach(function (r) {
      if (PERSONAL[name] && r.user_id !== mine) return;
      if (!byId[r.id] || r.updated_at > byId[r.id].updated_at) byId[r.id] = r;
    });
    var docs = Object.keys(byId).map(function (id) { var r = byId[id]; return { id: id, exists: true, data: function () { return r.data; } }; });
    return { docs: docs, empty: !docs.length, size: docs.length, metadata: { fromCache: false } };
  }
  function pull(name) {
    if (!subs[name] || !subs[name].length || !session) return;
    rest('GET', 'select=id,user_id,data,updated_at&collection=eq.' + q(name)).then(function (rows) {
      var snap = snapshotOf(name, rows || []);
      subs[name].forEach(function (s) { try { s.cb(snap); } catch (e) {} });
    }).catch(function (e) { subs[name].forEach(function (s) { if (s.err) try { s.err(e); } catch (x) {} }); });
  }
  function pullAll() { Object.keys(subs).forEach(pull); }
  setInterval(function () { if (!document.hidden) pullAll(); }, 30000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) pullAll(); });
  window.addEventListener('online', pullAll);

  function docRef(name, id) {
    return {
      get: function () {
        var mine = api.user() && api.user().id;
        var f = 'select=data,user_id,updated_at&collection=eq.' + q(name) + '&id=eq.' + q(id) + (PERSONAL[name] ? '&user_id=eq.' + q(mine) : '') + '&order=updated_at.desc&limit=1';
        return rest('GET', f).then(function (rows) { var r = rows && rows[0]; return { id: id, exists: !!r, data: function () { return r ? r.data : undefined; } }; });
      },
      set: function (data) {
        var row = { collection: name, id: id, user_id: api.user().id, data: data, updated_at: new Date().toISOString() };
        return send({ op: 'set', row: row }).then(function () { pull(name); });
      },
      delete: function () {
        return send({ op: 'del', collection: name, id: id, user_id: api.user().id }).then(function () { pull(name); });
      }
    };
  }
  /* исходящие: нет связи — запись ждёт в телефоне и уходит сама, когда облако ответит */
  var OKEY = 'kuking:outbox';
  function outbox() { try { return JSON.parse(localStorage.getItem(OKEY) || '[]'); } catch (e) { return []; } }
  function saveOut(a) { try { if (a.length) localStorage.setItem(OKEY, JSON.stringify(a.slice(-300))); else localStorage.removeItem(OKEY); } catch (e) {} }
  function keyOf(x) { return x.op === 'set' ? x.row.collection + '/' + x.row.id : x.collection + '/' + x.id; }
  function exec(x) {
    return x.op === 'set' ? rest('POST', 'on_conflict=collection,id,user_id', [x.row], 'resolution=merge-duplicates,return=minimal')
      : rest('DELETE', 'collection=eq.' + q(x.collection) + '&id=eq.' + q(x.id) + '&user_id=eq.' + q(x.user_id));
  }
  function queue(x) { var a = outbox().filter(function (y) { return keyOf(y) !== keyOf(x); }); a.push(x); saveOut(a); }
  function send(x) {
    return exec(x).catch(function (e) { if (e && (e.code === 'network' || /^http_5/.test(e.code || ''))) { queue(x); return null; } throw e; });
  }
  var flushing = false;
  function flush() {
    if (flushing || !session) return; var a = outbox(); if (!a.length) return; flushing = true;
    var left = a.slice();
    (function next() {
      if (!left.length) { flushing = false; saveOut([]); pullAll(); return; }
      var x = left[0];
      if (x.op === 'set' && x.row.user_id !== (session && session.user.id)) { left.shift(); return next(); }
      exec(x).then(function () { left.shift(); saveOut(left); next(); }, function (e) {
        if (e && e.code === 'network') { flushing = false; saveOut(left); return; } // связи нет — попробуем позже
        left.shift(); saveOut(left); next(); // сломанная запись — не держим очередь
      });
    })();
  }
  setInterval(function () { if (!document.hidden) flush(); }, 45000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) flush(); });
  window.addEventListener('online', function () { flush(); });
  setTimeout(flush, 3000);

  var dbApi = {
    collection: function (name) {
      return {
        doc: function (id) { return docRef(name, id); },
        onSnapshot: function (cb, errCb) {
          var s = { cb: cb, err: errCb };
          (subs[name] = subs[name] || []).push(s);
          pull(name);
          return function () { subs[name] = subs[name].filter(function (x) { return x !== s; }); };
        }
      };
    }
  };

  /* старые оценки из книги в Claude лежат без хозяина — первый вошедший (ты) забирает их себе */
  function claimLegacy() {
    return rest('GET', 'select=collection,id,data&user_id=is.null').then(function (rows) {
      if (!rows || !rows.length) return;
      var mine = rows.map(function (r) { return { collection: r.collection, id: r.id, user_id: api.user().id, data: r.data, updated_at: new Date().toISOString() }; });
      return rest('POST', 'on_conflict=collection,id,user_id', mine, 'resolution=merge-duplicates,return=minimal')
        .then(function () { return rest('DELETE', 'user_id=is.null'); })
        .then(pullAll);
    }).catch(function () {});
  }

  var api = {
    enabled: enabled,
    user: function () { return session ? session.user : null; },
    onAuth: function (f) { authSubs.push(f); },
    signUp: function (email, password) {
      return authFetch('signup', { email: email, password: password }).then(function (j) {
        if (j && j.access_token) { setSession(j); return 'in'; }
        return 'confirm'; // в проекте включено подтверждение почты
      });
    },
    signIn: function (email, password) {
      return authFetch('token?grant_type=password', { email: email, password: password }).then(function (j) { setSession(j); });
    },
    signOut: function () { session = null; save(null); try { localStorage.removeItem('kuking:chef'); } catch (e) {} emitAuth(); },
    /* все оценки всех друзей — для средних на карточках и вкуса в нейросети */
    allReviews: function () {
      if (!session) return Promise.resolve([]);
      /* свои оценки и оценки друзей, без текста комментария (серверная функция friend_reviews) */
      return req('POST', 'rpc/friend_reviews', {}).then(function (rows) { return rows || []; });
    },
    db: dbApi,
    req: req,
    token: token,
    rpc: function (name, args) { return req('POST', 'rpc/' + name, args || {}); },
    online: function () { return net.ok; },
    onNet: function (f) { net.subs.push(f); },
    pending: function () { return outbox().length; },
    refresh: pullAll
  };
  window.KukingStore = api;

  /* мост: книга писалась под window.claude.use(...) — отдаём ей то же самое */
  var prevUse = window.claude && window.claude.use;
  window.claude = window.claude || {};
  window.claude.use = function (name) {
    if (name === 'db') return Promise.resolve(enabled && session ? dbApi : null);
    if (prevUse) return prevUse(name);
    return Promise.resolve(null);
  };
})();
