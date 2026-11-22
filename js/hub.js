/* Партия 4: карточка рецепта как на Ozon + соцсеть.
   Фото к рецептам (сжатые, прямо в базе), оценки друзей с распределением и лайками, вопросы к рецепту
   (отвечает нейросеть и друзья), «Похожие» и «С этим готовят», открытка для Telegram и сторис,
   лента друзей, челлендж недели, бейджи и серия в профиле, личные сообщения с карточками рецептов.
   Таблицы: photos, review_likes, qa, messages (supabase/setup-4.sql). Нет таблиц — блоки тихо прячутся. */
(function () {
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function hap(n) { if (window.kHaptic) window.kHaptic(n || 6); }
  function St() { return window.KukingStore; }
  function Soc() { return window.KukingSocial || {}; }
  function me() { var s = St(); return s && s.user && s.user() && s.user().id; }
  function Lib() { return window.KukingLib || {}; }
  function q(s) { return encodeURIComponent(s); }
  function req(m, path, body, prefer) { return St().req(m, path, body, prefer); }
  function nick(id) { var p = Soc().person && Soc().person(id); return p ? p.nick : '…'; }
  function av(id) { var p = Soc().person && Soc().person(id); return Soc().avatarHTML ? Soc().avatarHTML(p || { id: id, nick: '?' }) : ''; }
  function ago(iso) { return Soc().ago ? Soc().ago(iso) : ''; }
  function toast(t) { var d = document.createElement('div'); d.className = 'hb-toast'; d.textContent = t; document.body.appendChild(d); requestAnimationFrame(function () { d.classList.add('on'); }); setTimeout(function () { d.classList.remove('on'); setTimeout(function () { d.remove(); }, 300); }, 2200); }
  var off = false; // таблиц ещё нет
  function fail(e) { var m = String(e && (e.message || e.code) || ''); if (/42P01|does not exist|relation|404|PGRST20/.test(m)) off = true; throw e; }
  function ready() { return !off && !!me() && !!St() && !!St().req; }

  /* ---------- кэш по рецептам ---------- */
  var R = {}; // rid -> {photos, likes, qa, at}
  var rer = null;
  function load(rid, rerender) {
    rer = rerender || rer;
    if (!ready()) return;
    var c = R[rid]; if (c && (c.busy || Date.now() - c.at < 20000)) return;
    R[rid] = Object.assign(c || { photos: [], likes: [], qa: [] }, { busy: true, at: Date.now() });
    Promise.all([
      req('GET', 'photos?select=id,recipe_id,author,thumb,caption,created_at&recipe_id=eq.' + q(rid) + '&order=created_at.desc&limit=60'),
      req('GET', 'review_likes?select=recipe_id,review_owner,liker&recipe_id=eq.' + q(rid)),
      req('GET', 'qa?select=id,recipe_id,parent,author,body,by_ai,kind,created_at&recipe_id=eq.' + q(rid) + '&order=created_at.asc&limit=200')
    ]).then(function (r) {
      R[rid] = { photos: r[0] || [], likes: r[1] || [], qa: r[2] || [], at: Date.now() };
      if (rer) rer();
    }).catch(function (e) { R[rid].busy = false; try { fail(e); } catch (x) {} if (off && rer) rer(); });
  }
  function C(rid) { return R[rid] || { photos: [], likes: [], qa: [] }; }

  /* ---------- фото: сжимаем в телефоне ---------- */
  function shrink(file, max, qual) {
    return new Promise(function (ok, no) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, max / Math.max(w, h));
        var c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
        var g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        ok(c.toDataURL('image/jpeg', qual));
      };
      img.onerror = function () { URL.revokeObjectURL(url); no(new Error('Это не картинка')); };
      img.src = url;
    });
  }
  function addPhoto(r, file) {
    if (!ready()) return Promise.reject(new Error('Войдите в аккаунт'));
    return Promise.all([shrink(file, 1080, 0.72), shrink(file, 320, 0.7)]).then(function (x) {
      var full = x[0]; if (full.length > 440000) return shrink(file, 860, 0.62).then(function (f2) { return [f2, x[1]]; }); return x;
    }).then(function (x) {
      return req('POST', 'photos', { recipe_id: r.id, recipe_title: String(r.title || '').slice(0, 120), author: me(), thumb: x[1], full_img: x[0] }, 'return=representation');
    }).then(function (rows) { var c = C(r.id); c.photos = (rows || []).map(function (p) { delete p.full_img; return p; }).concat(c.photos); R[r.id] = c; feed.at = 0; return rows; }).catch(fail);
  }
  function viewer(list, i) {
    var m = document.createElement('div'); m.className = 'hb-view'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-label', 'Фото');
    document.body.appendChild(m);
    function draw() {
      var p = list[i];
      m.innerHTML = '<button type="button" class="hb-vx" aria-label="Закрыть">×</button><div class="hb-vimg"><img src="' + p.thumb + '" alt=""></div>' +
        '<div class="hb-vcap">' + av(p.author) + '<span><b>' + esc(nick(p.author)) + '</b><small>' + esc(ago(p.created_at)) + (p.recipe_title ? ' · ' + esc(p.recipe_title) : '') + '</small></span>' +
        (p.author === me() || (Soc().isAdmin && Soc().isAdmin()) ? '<button type="button" class="hb-vdel" data-del="' + p.id + '">Удалить</button>' : '') + '</div>' +
        (list.length > 1 ? '<p class="hb-vn">' + (i + 1) + ' / ' + list.length + '</p>' : '');
      req('GET', 'photos?select=full_img&id=eq.' + p.id).then(function (r) { var img = m.querySelector('.hb-vimg img'); if (r && r[0] && img && list[i] === p) img.src = r[0].full_img; }).catch(function () {});
    }
    draw(); requestAnimationFrame(function () { m.classList.add('on'); });
    function shut() { m.classList.remove('on'); setTimeout(function () { m.remove(); }, 250); }
    m.addEventListener('click', function (e) {
      if (e.target.closest('.hb-vx')) return shut();
      var d = e.target.closest('[data-del]'); if (d) { if (d.dataset.armed) { req('DELETE', 'photos?id=eq.' + d.getAttribute('data-del')).then(function () { Object.keys(R).forEach(function (k) { R[k].photos = R[k].photos.filter(function (x) { return String(x.id) !== d.getAttribute('data-del'); }); }); feed.at = 0; shut(); if (rer) rer(); }).catch(function () { toast('Не удалилось'); }); } else { d.dataset.armed = 1; d.textContent = 'Точно удалить?'; } return; }
      if (e.target.closest('.hb-vimg') && list.length > 1) { i = (i + 1) % list.length; draw(); }
    });
    var x0 = null; m.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    m.addEventListener('touchend', function (e) { if (x0 == null) return; var dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 50 && list.length > 1) { i = (i + (dx < 0 ? 1 : list.length - 1)) % list.length; draw(); } }, { passive: true });
  }

  /* ---------- оценки друзей ---------- */
  function circle() { var c = Soc().circle ? Soc().circle() : []; var m = me(); return m ? [m].concat(c.filter(function (x) { return x !== m; })) : c; }
  function reviewsFor(rid) {
    return circle().map(function (u) { var v = (Soc().reviewsOf ? Soc().reviewsOf(u) : {})[rid]; return v && v.score ? { u: u, score: v.score, comment: v.comment || '', at: v.at || '' } : null; }).filter(Boolean);
  }
  var sortBy = 'new';
  function cooked(rid) { var lib = Lib(), pd = lib.planDays ? lib.planDays() : {}, n = 0; Object.keys(pd).forEach(function (k) { if ((pd[k] || []).indexOf(rid) >= 0 && lib.isDone && lib.isDone('cook:' + k + ':' + rid)) n++; }); return n; }

  function recipeHTML(r) {
    var m = me(), rid = r.id, c = C(rid), h = '';
    var revs = reviewsFor(rid), cnt = revs.length, avg = cnt ? Math.round(revs.reduce(function (s, x) { return s + x.score; }, 0) / cnt * 10) / 10 : 0;
    var times = cnt + cooked(rid) - (revs.some(function (x) { return x.u === m; }) && cooked(rid) ? 1 : 0);
    /* галерея */
    if (m && !off) {
      h += '<section class="tg-sec hb-sec"><h3 class="tg-sec-h">Фото' + (c.photos.length ? ' · ' + c.photos.length : '') + '</h3><div class="hb-gal">' +
        '<label class="hb-add"><input type="file" accept="image/*" data-hub-file="' + esc(rid) + '" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg><span>Как получилось</span></label>' +
        c.photos.map(function (p, i) { return '<button type="button" class="hb-th" data-hub="view" data-rid="' + esc(rid) + '" data-i="' + i + '"><img src="' + p.thumb + '" alt="Фото ' + esc(nick(p.author)) + '" loading="lazy"><i>' + esc(nick(p.author)) + '</i></button>'; }).join('') +
        '</div>' + (!c.photos.length ? '<p class="small hb-mut">Приготовили — сфоткайте. Друзья увидят в ленте.</p>' : '') + '</section>';
    }
    /* рейтинг с распределением */
    if (cnt) {
      var B = [[9, 10], [7, 8], [5, 6], [3, 4], [1, 2]], mx = 0, bc = B.map(function (b) { var n = revs.filter(function (x) { return x.score >= b[0] && x.score <= b[1]; }).length; mx = Math.max(mx, n); return n; });
      h += '<section class="tg-sec hb-sec"><h3 class="tg-sec-h">Оценки</h3><div class="hb-rate"><div class="hb-avg"><b>' + String(avg).replace('.', ',') + '</b><small>из 10</small><span>' + cnt + ' ' + pl(cnt, 'оценка', 'оценки', 'оценок') + '</span>' + (times > 0 ? '<span>готовили ' + times + ' ' + pl(times, 'раз', 'раза', 'раз') + '</span>' : '') + '</div>' +
        '<ul class="hb-dist">' + B.map(function (b, i) { return '<li><span>' + b[0] + '–' + b[1] + '</span><i><em style="width:' + (mx ? Math.round(bc[i] / mx * 100) : 0) + '%"></em></i><small>' + bc[i] + '</small></li>'; }).join('') + '</ul></div>';
      var withPh = {}; c.photos.forEach(function (p) { withPh[p.author] = withPh[p.author] || []; withPh[p.author].push(p); });
      var list = revs.slice().sort(function (a, b) { return sortBy === 'top' ? b.score - a.score : sortBy === 'photo' ? ((withPh[b.u] ? 1 : 0) - (withPh[a.u] ? 1 : 0)) || String(b.at).localeCompare(String(a.at)) : String(b.at).localeCompare(String(a.at)); });
      if (cnt > 1) h += '<div class="hb-sort" role="toolbar">' + [['new', 'Новые'], ['top', 'Лучшие'], ['photo', 'С фото']].map(function (s) { return '<button type="button" class="kc-btn" data-hub="sort" data-v="' + s[0] + '" aria-pressed="' + (sortBy === s[0]) + '">' + s[1] + '</button>'; }).join('') + '</div>';
      h += '<ul class="hb-revs">' + list.map(function (x) {
        var lk = c.likes.filter(function (l) { return l.review_owner === x.u; }), mine = lk.some(function (l) { return l.liker === m; });
        return '<li class="hb-rev">' + av(x.u) + '<div class="hb-rev-b"><div class="hb-rev-h"><b>' + (x.u === m ? 'Вы' : esc(nick(x.u))) + '</b><span class="lib-score sm sc-' + (x.score >= 9 ? 'top' : x.score >= 7 ? 'good' : x.score >= 5 ? 'mid' : 'low') + '">' + x.score + '</span><small>' + esc(ago(x.at)) + '</small></div>' +
          (x.comment ? '<p>' + esc(x.comment) + '</p>' : '') +
          (withPh[x.u] ? '<div class="hb-rev-ph">' + withPh[x.u].slice(0, 3).map(function (p) { return '<button type="button" class="hb-th sm" data-hub="view" data-rid="' + esc(rid) + '" data-i="' + c.photos.indexOf(p) + '"><img src="' + p.thumb + '" alt=""></button>'; }).join('') + '</div>' : '') +
          (!off && m ? '<button type="button" class="hb-like' + (mine ? ' on' : '') + '" data-hub="like" data-rid="' + esc(rid) + '" data-owner="' + x.u + '"' + (x.u === m ? ' disabled' : '') + ' aria-pressed="' + mine + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>' + (lk.length || '') + '</button>' : '') +
          '</div></li>';
      }).join('') + '</ul></section>';
    }
    /* вопросы */
    if (m && !off) {
      var cm = c.qa.filter(function (x) { return !x.parent && x.kind === 'c'; });
      h += '<section class="tg-sec hb-sec"><h3 class="tg-sec-h">Комментарии' + (cm.length ? ' · ' + cm.length : '') + '</h3>' +
        cm.map(function (x) {
          var ans = c.qa.filter(function (y) { return y.parent === x.id; });
          return '<div class="hb-q hb-c"><div class="hb-q-h">' + av(x.author) + '<p><b>' + (x.author === m ? 'Вы' : esc(nick(x.author))) + '</b> <small class="hb-mut">' + esc(ago(x.created_at)) + '</small><br>' + esc(x.body) + '</p>' + (x.author === m ? '<button type="button" class="hb-del" data-hub="cdel" data-id="' + x.id + '" data-rid="' + esc(rid) + '" aria-label="Удалить">×</button>' : '') + '</div>' +
            ans.map(function (a) { return '<div class="hb-a"><b>' + (a.author === m ? 'Вы' : esc(nick(a.author))) + '</b><p>' + esc(a.body) + '</p></div>'; }).join('') +
            '<button type="button" class="hb-rep" data-hub="rep">Ответить' + (ans.length ? '' : '') + '</button><form class="hb-qf sm" data-hub-ans="' + x.id + '" data-rid="' + esc(rid) + '"><input maxlength="1000" placeholder="Ответить" aria-label="Ответ"><button type="submit" class="soc-send" aria-label="Отправить"><svg viewBox="0 0 24 24"><path d="M4 12l16-8-6 16-2-6z"/></svg></button></form></div>';
        }).join('') +
        '<form class="hb-qf" data-hub-cmt="' + esc(rid) + '"><input maxlength="1000" placeholder="Написать комментарий" aria-label="Комментарий"><button type="submit" class="soc-send" aria-label="Отправить"><svg viewBox="0 0 24 24"><path d="M4 12l16-8-6 16-2-6z"/></svg></button></form>' +
        (cm.length ? '' : '<p class="small hb-mut">Оценка не обязательна — просто напишите, что думаете. Увидят друзья.</p>') + '</section>';
      var qs = c.qa.filter(function (x) { return !x.parent && x.kind !== 'c'; }).reverse();
      h += '<section class="tg-sec hb-sec"><h3 class="tg-sec-h">Вопросы' + (qs.length ? ' · ' + qs.length : '') + '</h3>' +
        qs.map(function (x) {
          var ans = c.qa.filter(function (y) { return y.parent === x.id; });
          return '<div class="hb-q"><div class="hb-q-h">' + av(x.author) + '<p><b>' + (x.author === m ? 'Вы' : esc(nick(x.author))) + '</b> ' + esc(x.body) + '</p></div>' +
            ans.map(function (a) { return '<div class="hb-a' + (a.by_ai ? ' ai' : '') + '"><b>' + (a.by_ai ? '✦ Нейросеть' : a.author === m ? 'Вы' : esc(nick(a.author))) + '</b><p>' + esc(a.body) + '</p></div>'; }).join('') +
            (aiBusy[x.id] ? '<p class="small hb-mut kc-tick">Нейросеть пишет ответ…</p>' : '') +
            '<form class="hb-qf sm" data-hub-ans="' + x.id + '" data-rid="' + esc(rid) + '"><input maxlength="1000" placeholder="Ответить" aria-label="Ответ"><button type="submit" class="soc-send" aria-label="Отправить"><svg viewBox="0 0 24 24"><path d="M4 12l16-8-6 16-2-6z"/></svg></button></form></div>';
        }).join('') +
        '<form class="hb-qf" data-hub-ask="' + esc(rid) + '"><input maxlength="500" placeholder="Спросить про рецепт: можно без духовки?" aria-label="Вопрос"><button type="submit" class="soc-send" aria-label="Спросить"><svg viewBox="0 0 24 24"><path d="M4 12l16-8-6 16-2-6z"/></svg></button></form>' +
        '<p class="small hb-mut">Сразу отвечает нейросеть, потом могут дополнить друзья.</p></section>';
    }
    /* похожие и «с этим готовят» */
    var sim = similar(r), pair = withThis(r);
    if (pair.length) h += '<section class="tg-sec hb-sec"><h3 class="tg-sec-h">С этим готовят</h3><div class="hb-rel">' + pair.map(relCard).join('') + '</div></section>';
    if (sim.length) h += '<section class="tg-sec hb-sec"><h3 class="tg-sec-h">Похожие</h3><div class="hb-rel">' + sim.map(relCard).join('') + '</div></section>';
    h += '<div class="hb-share"><button type="button" class="nav-btn" data-hub="card" data-rid="' + esc(rid) + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 13v6h14v-6"/></svg>Открытка для Telegram и сторис</button></div>';
    if (off && m) h += '<p class="small hb-mut hb-off">Фото, лайки, вопросы и сообщения заработают, когда в Supabase будет запущен setup-4.sql.</p>';
    return h;
  }
  function pl(n, a, b, c) { n = Math.abs(n) % 100; var k = n % 10; return n > 10 && n < 20 ? c : k > 1 && k < 5 ? b : k === 1 ? a : c; }
  function relCard(x) { return '<button type="button" class="hb-rc" data-hub="open" data-rid="' + esc(x.id) + '"><span class="hb-rc-e">' + (Lib().emoji ? Lib().emoji(x) : '🍽️') + '</span><b>' + esc(x.title) + '</b><small>' + esc(String(x.totalTime || '').replace('≈ ', '')) + '</small></button>'; }
  function all() { return Lib().all ? Lib().all() : []; }
  function M(r) { return window.KMeta ? KMeta.get(r) : {}; }
  function similar(r) {
    var m = M(r);
    return all().filter(function (x) { return x.id !== r.id; }).map(function (x) { var k = M(x), s = 0; if (k.main && k.main === m.main) s += 2; if (k.cuisine && k.cuisine === m.cuisine) s += 2; if (k.category === m.category) s += 1; if (x.mode === r.mode) s += 1; return { x: x, s: s }; })
      .filter(function (o) { return o.s >= 3; }).sort(function (a, b) { return b.s - a.s; }).slice(0, 6).map(function (o) { return o.x; });
  }
  function withThis(r) {
    var cat = M(r).category, want = cat === 'main' ? ['sauce', 'snack', 'drink', 'dessert', 'soup'] : cat === 'soup' ? ['snack', 'main'] : cat === 'dessert' ? ['drink'] : ['main'];
    return all().filter(function (x) { return x.id !== r.id && want.indexOf(M(x).category) >= 0; }).slice(0, 6);
  }

  /* ---------- вопросы: нейросеть отвечает сразу ---------- */
  var aiBusy = {};
  function ask(rid, body) {
    var r = Lib().byId && Lib().byId(rid);
    return req('POST', 'qa', { recipe_id: rid, recipe_title: r ? String(r.title).slice(0, 120) : null, author: me(), body: body }, 'return=representation').then(function (rows) {
      var x = rows && rows[0]; if (!x) return; C(rid).qa.push(x); R[rid] = C(rid); if (rer) rer();
      if (!(window.KukingAI && KukingAI.ready && KukingAI.ready()) || !(window.claude && window.claude.use) || !r) return;
      aiBusy[x.id] = 1; if (rer) rer();
      var brief = { title: r.title, guests: r.baseGuests, time: r.totalTime, ingredients: (r.ingredients || []).filter(function (i) { return i && i.name; }).map(function (i) { return i.name + (i.amount ? ' ' + i.amount + ' ' + (i.unit || '') : ''); }),
        steps: (r.slides || []).filter(function (s) { return s.type === 'step'; }).map(function (s) { return s.title + ': ' + (s.text || s.body || '').toString().slice(0, 160); }) };
      return Promise.resolve(window.claude.use('sample')).then(function (s) {
        return s.json({ system: 'Ты шеф уровня Мишлен в приложении «Жарко». Отвечаешь на вопрос про конкретный рецепт: по-русски, дружелюбно, конкретно, до 500 знаков, без мата и жаргона. Ответ — JSON {"a":"текст"}.',
          user: 'Рецепт: ' + JSON.stringify(brief).slice(0, 6000) + '\n' + (window.KPrefs ? KPrefs.promptLine() + '\n' : '') + 'Вопрос: ' + body }, { modelTier: 'default', cache: false, temperature: 0.4 });
      }).then(function (v) {
        var a = v && String(v.a || '').trim(); if (!a) throw new Error('пусто');
        return req('POST', 'qa', { recipe_id: rid, recipe_title: String(r.title).slice(0, 120), parent: x.id, author: me(), body: a.slice(0, 1500), by_ai: true }, 'return=representation');
      }).then(function (rows2) { delete aiBusy[x.id]; if (rows2 && rows2[0]) C(rid).qa.push(rows2[0]); if (rer) rer(); })
        .catch(function () { delete aiBusy[x.id]; if (rer) rer(); });
    });
  }

  /* ---------- открытка ---------- */
  function card(r) {
    var W = 1080, H = 1920, c = document.createElement('canvas'); c.width = W; c.height = H; var g = c.getContext('2d');
    var m = M(r), d = (r.dishes || [])[0] || {}, mine = C(r.id).photos.filter(function (p) { return p.author === me(); })[0] || C(r.id).photos[0];
    function wrap(t, x, y, maxW, lh, maxL) { var w = String(t || '').split(' '), line = '', n = 0; for (var i = 0; i < w.length; i++) { var tt = line ? line + ' ' + w[i] : w[i]; if (g.measureText(tt).width > maxW && line) { g.fillText(line, x, y); y += lh; line = w[i]; if (++n >= maxL - 1) { line = w.slice(i).join(' '); while (g.measureText(line + '…').width > maxW && line.length) line = line.slice(0, -1); line += (i < w.length - 1 ? '…' : ''); break; } } else line = tt; } g.fillText(line, x, y); return y + lh; }
    function draw(img) {
      var grd = g.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, '#f6f0e7'); grd.addColorStop(1, '#efe3d2'); g.fillStyle = grd; g.fillRect(0, 0, W, H);
      g.fillStyle = '#b8522f'; g.beginPath(); g.arc(150, 170, 62, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#f6f0e7'; g.beginPath(); g.moveTo(150, 128); g.bezierCurveTo(158, 150, 184, 160, 184, 192); g.bezierCurveTo(184, 212, 168, 226, 150, 226); g.bezierCurveTo(132, 226, 116, 212, 116, 194); g.bezierCurveTo(116, 178, 126, 168, 132, 162); g.bezierCurveTo(132, 175, 138, 182, 144, 182); g.bezierCurveTo(141, 164, 149, 146, 150, 128); g.fill();
      g.fillStyle = '#1f1712'; g.font = '600 64px Lora, Georgia, serif'; g.textBaseline = 'middle'; g.fillText('ЖАРКО', 236, 172);
      var top = 300, ph = 980;
      g.save(); var rr = 48; g.beginPath(); g.moveTo(80 + rr, top); g.arcTo(W - 80, top, W - 80, top + ph, rr); g.arcTo(W - 80, top + ph, 80, top + ph, rr); g.arcTo(80, top + ph, 80, top, rr); g.arcTo(80, top, W - 80, top, rr); g.closePath(); g.clip();
      if (img) { var k = Math.max((W - 160) / img.width, ph / img.height), iw = img.width * k, ih = img.height * k; g.drawImage(img, 80 + (W - 160 - iw) / 2, top + (ph - ih) / 2, iw, ih); }
      else { g.fillStyle = '#e9d9c3'; g.fillRect(80, top, W - 160, ph); g.font = '360px "Apple Color Emoji","Segoe UI Emoji",sans-serif'; g.textAlign = 'center'; g.fillText(Lib().emoji ? Lib().emoji(r) : '🍽️', W / 2, top + ph / 2 + 20); g.textAlign = 'left'; }
      g.restore();
      g.textBaseline = 'alphabetic'; g.fillStyle = '#1f1712'; g.font = '600 86px Lora, Georgia, serif';
      var y = wrap(r.title, 80, top + ph + 130, W - 160, 96, 2);
      g.fillStyle = '#6b5a4c'; g.font = '400 40px Inter, -apple-system, sans-serif'; y = wrap(r.tagline || '', 80, y + 4, W - 160, 54, 2);
      var chips = [String(r.totalTime || '').replace('≈ ', ''), d.kcal ? d.kcal + ' ккал' : '', d.p ? 'белок ' + d.p + ' г' : '', m.difficulty ? 'сложность ' + m.difficulty + '/5' : ''].filter(Boolean);
      var x = 80; y += 40; g.font = '600 36px Inter, -apple-system, sans-serif';
      chips.forEach(function (t) { var w = g.measureText(t).width + 56; if (x + w > W - 80) { x = 80; y += 86; } g.fillStyle = '#fffaf3'; g.beginPath(); g.roundRect ? g.roundRect(x, y - 52, w, 72, 36) : g.rect(x, y - 52, w, 72); g.fill(); g.fillStyle = '#b8522f'; g.fillText(t, x + 28, y - 4); x += w + 16; });
      g.fillStyle = '#8a7867'; g.font = '400 34px Inter, -apple-system, sans-serif'; g.fillText('Рецепт — в приложении «Жарко»', 80, H - 90);
      c.toBlob(function (b) { share(b, r); }, 'image/png');
    }
    var go = function () {
      if (!mine) return draw(null);
      req('GET', 'photos?select=full_img&id=eq.' + mine.id).then(function (x) { var im = new Image(); im.onload = function () { draw(im); }; im.onerror = function () { draw(null); }; im.src = x && x[0] ? x[0].full_img : mine.thumb; }).catch(function () { draw(null); });
    };
    if (document.fonts && document.fonts.load) Promise.all([document.fonts.load('600 64px Lora'), document.fonts.load('600 36px Inter')]).then(go, go); else go();
  }
  function share(blob, r) {
    var f = new File([blob], 'zharko-' + r.id + '.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [f] })) { navigator.share({ files: [f], title: r.title, text: r.title + ' — рецепт в «Жарко»' }).catch(function () {}); return; }
    var url = URL.createObjectURL(blob), m = document.createElement('div'); m.className = 'hb-view on'; m.innerHTML = '<button type="button" class="hb-vx" aria-label="Закрыть">×</button><div class="hb-vimg"><img src="' + url + '" alt="Открытка"></div><p class="hb-vn">Удержите картинку, чтобы сохранить или отправить</p>';
    document.body.appendChild(m); m.addEventListener('click', function (e) { if (e.target.closest('.hb-vx')) { m.remove(); URL.revokeObjectURL(url); } });
  }

  /* ---------- лента и челлендж ---------- */
  var feed = { photos: [], qa: [], at: 0, busy: false }, chatMode = 'chats';
  function loadFeed(rerender) {
    if (!ready() || feed.busy || Date.now() - feed.at < 30000) return;
    feed.busy = true;
    Promise.all([
      req('GET', 'photos?select=id,recipe_id,recipe_title,author,thumb,created_at&order=created_at.desc&limit=40'),
      req('GET', 'qa?select=id,recipe_id,recipe_title,parent,author,body,by_ai,kind,created_at&parent=is.null&order=created_at.desc&limit=30')
    ]).then(function (r) { feed = { photos: r[0] || [], qa: r[1] || [], at: Date.now(), busy: false }; if (rerender) rerender(); })
      .catch(function (e) { feed.busy = false; feed.at = Date.now(); try { fail(e); } catch (x) {} if (rerender) rerender(); });
  }
  var CH = [
    ['Блюдо до 30 минут', function (r, m) { return window.KMeta && KMeta.mins(r.totalTime) && KMeta.mins(r.totalTime) <= 30; }],
    ['Неделя без мяса: вегетарианское блюдо', function (r, m) { return (m.diets || []).indexOf('veg') >= 0; }],
    ['Кухня, которую ещё не готовил', function (r, m) { return !!m.cuisine; }],
    ['Сложность 4 и выше', function (r, m) { return (m.difficulty || 0) >= 4; }],
    ['Рыба или морепродукты', function (r, m) { return m.main === 'Рыба' || m.main === 'Морепродукты'; }],
    ['Ужин для друзей', function (r) { return r.mode === 'friends'; }],
    ['Романтический ужин', function (r) { return r.mode === 'romance'; }],
    ['Суп', function (r, m) { return m.category === 'soup'; }],
    ['Много белка — 40 г и больше на порцию', function (r, m) { return (m.diets || []).indexOf('protein') >= 0; }],
    ['Азиатская кухня', function (r, m) { return /Китай|Япон|Корей|Тай|Азиат/.test(m.cuisine || ''); }]
  ];
  function week() { var d = new Date(), j = new Date(d.getFullYear(), 0, 1); return Math.floor(((d - j) / 864e5 + j.getDay() + 6) / 7); }
  function monday() { var d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return d.toISOString(); }
  function challenge() {
    var ch = CH[week() % CH.length], mon = monday(), byId = Lib().byId, done = [];
    circle().forEach(function (u) { var rv = Soc().reviewsOf ? Soc().reviewsOf(u) : {}; Object.keys(rv).forEach(function (rid) { var v = rv[rid], r = byId && byId(rid); if (v && v.score && String(v.at || '') >= mon && r && ch[1](r, M(r)) && done.indexOf(u) < 0) done.push(u); }); });
    var mine = done.indexOf(me()) >= 0, left = 7 - ((new Date().getDay() + 6) % 7);
    return '<div class="hb-ch' + (mine ? ' done' : '') + '"><span class="hb-ch-k">Челлендж недели · осталось ' + left + ' ' + pl(left, 'день', 'дня', 'дней') + '</span><b>' + esc(ch[0]) + '</b>' +
      '<p class="small">' + (mine ? '✓ Вы выполнили. ' : 'Приготовьте и поставьте оценку до воскресенья. ') + (done.length ? 'Уже сделали: ' + done.map(function (u) { return u === me() ? 'вы' : esc(nick(u)); }).join(', ') : 'Пока никто — будьте первым.') + '</p></div>';
  }
  function feedHTML() {
    var items = [];
    circle().forEach(function (u) { var rv = Soc().reviewsOf ? Soc().reviewsOf(u) : {}; Object.keys(rv).forEach(function (rid) { var v = rv[rid]; if (v && v.score && v.at) items.push({ t: v.at, k: 'rev', u: u, rid: rid, v: v, title: v.title }); }); });
    feed.photos.forEach(function (p) { items.push({ t: p.created_at, k: 'ph', u: p.author, rid: p.recipe_id, p: p, title: p.recipe_title }); });
    feed.qa.forEach(function (x) { items.push({ t: x.created_at, k: x.kind === 'c' ? 'c' : 'q', u: x.author, rid: x.recipe_id, x: x, title: x.recipe_title }); });
    items.sort(function (a, b) { return String(b.t).localeCompare(String(a.t)); });
    var byId = Lib().byId, h = challenge();
    if (!items.length) return h + '<p class="small soc-pad">Здесь появятся оценки, фото и вопросы друзей.</p>';
    return h + '<ul class="hb-feed">' + items.slice(0, 60).map(function (it) {
      var r = byId && byId(it.rid), title = (r && r.title) || it.title || 'рецепт', who = it.u === me() ? 'Вы' : esc(nick(it.u));
      var act = it.k === 'rev' ? 'оценил' + (it.u === me() ? 'и' : '') + ' на <b class="hb-sc">' + it.v.score + '/10</b>' : it.k === 'ph' ? 'выложил' + (it.u === me() ? 'и' : '') + ' фото' : it.k === 'c' ? 'прокомментировал' + (it.u === me() ? 'и' : '') : 'спросил' + (it.u === me() ? 'и' : '');
      return '<li class="hb-fi">' + av(it.u) + '<div class="hb-fi-b"><p><b>' + who + '</b> ' + act + ' · <button type="button" class="hb-lnk" data-hub="open" data-rid="' + esc(it.rid) + '"' + (r ? '' : ' disabled') + '>' + esc(title) + '</button></p>' +
        (it.k === 'rev' && it.v.comment ? '<p class="hb-fq">' + esc(it.v.comment) + '</p>' : '') + ((it.k === 'q' || it.k === 'c') ? '<p class="hb-fq">' + esc(it.x.body) + '</p>' : '') +
        (it.k === 'ph' ? '<button type="button" class="hb-fph" data-hub="fview" data-id="' + it.p.id + '"><img src="' + it.p.thumb + '" alt="" loading="lazy"></button>' : '') +
        '<small>' + esc(ago(it.t)) + '</small></div></li>';
    }).join('') + '</ul>';
  }

  /* ---------- профиль повара: бейджи и серия ---------- */
  function profileExtra(id) {
    var rv = Soc().reviewsOf ? Soc().reviewsOf(id) : {}, ks = Object.keys(rv).filter(function (k) { return rv[k].score; });
    var weeks = {}; ks.forEach(function (k) { var d = new Date(rv[k].at || 0); if (!isNaN(d)) { var mon = new Date(d); mon.setHours(0, 0, 0, 0); mon.setDate(mon.getDate() - (mon.getDay() + 6) % 7); weeks[mon.toISOString().slice(0, 10)] = 1; } });
    var streak = 0, cur = new Date(); cur.setHours(0, 0, 0, 0); cur.setDate(cur.getDate() - (cur.getDay() + 6) % 7);
    if (!weeks[cur.toISOString().slice(0, 10)]) cur.setDate(cur.getDate() - 7);
    while (weeks[cur.toISOString().slice(0, 10)]) { streak++; cur.setDate(cur.getDate() - 7); }
    var phs = feed.photos.filter(function (p) { return p.author === id; }).length, cms = ks.filter(function (k) { return rv[k].comment; }).length;
    var B = [['🍳', 'Первое блюдо', ks.length >= 1], ['🔟', 'Десять блюд', ks.length >= 10], ['🏆', 'Полсотни', ks.length >= 50], ['📸', 'Фотограф', phs >= 5], ['🔥', 'Серия 4 недели', streak >= 4], ['✍️', 'Критик', cms >= 10]];
    var got = B.filter(function (b) { return b[2]; });
    return '<div class="hb-pro"><div class="hb-streak"><b>' + streak + '</b><span>' + pl(streak, 'неделя', 'недели', 'недель') + ' подряд у плиты</span></div>' +
      '<div class="hb-badges">' + B.map(function (b) { return '<span class="hb-bdg' + (b[2] ? ' on' : '') + '" title="' + b[1] + '"><i>' + b[0] + '</i>' + b[1] + '</span>'; }).join('') + '</div>' +
      (id !== me() && ready() ? '<button type="button" class="nav-btn primary hb-write" data-hub="chat" data-id="' + id + '">Написать</button>' : '') + '<span hidden>' + got.length + '</span></div>';
  }

  /* ---------- сообщения ---------- */
  var MS = { list: [], at: 0, busy: false }, chatWith = null, chatEl = null, poll = null, unreadN = 0;
  function loadMsgs(cb) {
    if (!ready() || MS.busy) return; MS.busy = true;
    req('GET', 'messages?select=id,sender,receiver,body,recipe_title,created_at,read_at&order=created_at.desc&limit=400').then(function (rows) {
      MS = { list: (rows || []).reverse(), at: Date.now(), busy: false };
      var n = MS.list.filter(function (x) { return x.receiver === me() && !x.read_at; }).length;
      if (n !== unreadN) { unreadN = n; if (window.__kSyncTabs) window.__kSyncTabs(); }
      if (cb) cb();
    }).catch(function (e) { MS.busy = false; try { fail(e); } catch (x) {} });
  }
  function lastWith(id) { for (var i = MS.list.length - 1; i >= 0; i--) { var x = MS.list[i]; if (x.sender === id || x.receiver === id) return x; } return null; }
  function unreadFrom(id) { return MS.list.filter(function (x) { return x.sender === id && x.receiver === me() && !x.read_at; }).length; }
  function openChat(id) {
    chatWith = id;
    chatEl = document.createElement('div'); chatEl.className = 'hb-chat ct'; chatEl.setAttribute('role', 'dialog'); chatEl.setAttribute('aria-label', 'Чат с ' + nick(id));
    chatEl.innerHTML = '<div class="ct-head hb-ch-head"><button type="button" class="qz-tx" data-hc="close">‹ Назад</button><span class="hb-ch-who">' + av(id) + '<b>' + esc(nick(id)) + '</b></span><span></span></div>' +
      '<div class="ct-body hb-msgs" aria-live="polite"></div>' +
      '<form class="hb-in" data-hc-form><button type="button" class="hb-att" data-hc="att" aria-label="Отправить рецепт"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/></svg></button><input maxlength="2000" placeholder="Сообщение" aria-label="Сообщение" autocomplete="off"><button type="submit" class="soc-send" aria-label="Отправить"><svg viewBox="0 0 24 24"><path d="M4 12l16-8-6 16-2-6z"/></svg></button></form>';
    document.body.appendChild(chatEl); document.documentElement.classList.add('qz-lock');
    requestAnimationFrame(function () { requestAnimationFrame(function () { chatEl.classList.add('on'); }); });
    drawChat(true); loadMsgs(function () { drawChat(true); markRead(); });
    clearInterval(poll); poll = setInterval(function () { if (!document.hidden) loadMsgs(function () { drawChat(false); markRead(); }); }, 6000);
    chatEl.addEventListener('click', onChatClick); chatEl.addEventListener('submit', function (e) { e.preventDefault(); var i = chatEl.querySelector('.hb-in input'), v = i.value.trim(); if (!v) return; i.value = ''; send({ body: v }); });
  }
  function closeChat() { clearInterval(poll); poll = null; if (!chatEl) return; var c = chatEl; chatEl = null; chatWith = null; c.classList.remove('on'); document.documentElement.classList.remove('qz-lock'); setTimeout(function () { c.remove(); }, 300); if (Soc().rerender) Soc().rerender(); }
  function markRead() {
    if (!chatWith || !unreadFrom(chatWith)) return;
    var now = new Date().toISOString();
    req('PATCH', 'messages?receiver=eq.' + me() + '&sender=eq.' + chatWith + '&read_at=is.null', { read_at: now }).then(function () { MS.list.forEach(function (x) { if (x.sender === chatWith && x.receiver === me() && !x.read_at) x.read_at = now; }); unreadN = MS.list.filter(function (x) { return x.receiver === me() && !x.read_at; }).length; if (window.__kSyncTabs) window.__kSyncTabs(); }).catch(function () {});
  }
  var recipes = {}; // id сообщения -> рецепт (грузим по требованию)
  function drawChat(toBottom) {
    if (!chatEl) return; var box = chatEl.querySelector('.hb-msgs'), atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
    var list = MS.list.filter(function (x) { return (x.sender === chatWith && x.receiver === me()) || (x.sender === me() && x.receiver === chatWith); }), day = '';
    box.innerHTML = !list.length ? '<p class="small hb-mut hb-empty-chat">Напишите первым или отправьте рецепт кнопкой с книгой.</p>' : list.map(function (x) {
      var d = new Date(x.created_at), dk = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }), sep = dk !== day ? '<p class="hb-day">' + dk + '</p>' : ''; day = dk;
      var mine = x.sender === me(), t = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      return sep + '<div class="hb-msg' + (mine ? ' me' : '') + (x.pending ? ' pend' : '') + '">' +
        (x.recipe_title ? '<button type="button" class="hb-mrec" data-hc="rec" data-id="' + x.id + '"><span>📖</span><b>' + esc(x.recipe_title) + '</b><small>' + (mine ? 'вы отправили рецепт' : 'открыть рецепт') + '</small></button>' : '') +
        (x.body ? '<p>' + esc(x.body) + '</p>' : '') + '<small>' + t + (mine ? (x.read_at ? ' ✓✓' : ' ✓') : '') + '</small></div>';
    }).join('');
    if (toBottom || atBottom) box.scrollTop = box.scrollHeight;
  }
  function send(x) {
    var tmp = { id: 'tmp' + Date.now(), sender: me(), receiver: chatWith, body: x.body || '', recipe_title: x.recipe ? x.recipe.title : null, created_at: new Date().toISOString(), pending: true };
    MS.list.push(tmp); drawChat(true); hap(6);
    var row = { sender: me(), receiver: chatWith, body: x.body || '' }; if (x.recipe) { row.recipe = x.recipe; row.recipe_title = String(x.recipe.title).slice(0, 120); }
    req('POST', 'messages', row, 'return=representation').then(function (rows) { var i = MS.list.indexOf(tmp); if (i >= 0 && rows && rows[0]) MS.list[i] = rows[0]; drawChat(false); if (rows && rows[0] && Soc().notify) Soc().notify('msg', { id: rows[0].id }); })
      .catch(function (e) { MS.list = MS.list.filter(function (y) { return y !== tmp; }); drawChat(false); toast(/row-level|403/.test(String(e && e.message)) ? 'Писать можно только друзьям' : 'Не отправилось — проверьте интернет'); });
  }
  function onChatClick(e) {
    var b = e.target.closest('[data-hc]'); if (!b) return; var a = b.getAttribute('data-hc');
    if (a === 'close') return closeChat();
    if (a === 'att') return pickRecipe();
    if (a === 'rec') {
      var id = b.getAttribute('data-id');
      (recipes[id] ? Promise.resolve(recipes[id]) : req('GET', 'messages?select=recipe&id=eq.' + id).then(function (r) { return recipes[id] = r && r[0] && r[0].recipe; })).then(function (rec) {
        if (!rec) return toast('Рецепт не загрузился');
        var have = Lib().byId && Lib().byId(rec.id);
        if (have) { closeChat(); setTimeout(function () { Lib().show(rec.id); }, 320); return; }
        recipeSheet(rec);
      }).catch(function () { toast('Нет связи'); });
    }
  }
  function sheet(title, body, onClick) {
    var m = document.createElement('div'); m.className = 'ks-ov'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
    m.innerHTML = '<div class="ks"><span class="ks-grab" aria-hidden="true"></span><div class="ks-head"><h3>' + esc(title) + '</h3><button type="button" class="ks-x" aria-label="Закрыть">×</button></div><div class="ks-body">' + body + '</div></div>';
    document.body.appendChild(m); requestAnimationFrame(function () { m.classList.add('on'); });
    function shut() { m.classList.remove('on'); setTimeout(function () { m.remove(); }, 280); }
    m.addEventListener('click', function (e) { if (e.target === m || e.target.closest('.ks-x')) return shut(); onClick(e, shut); });
  }
  function pickRecipe() {
    var list = all();
    sheet('Отправить рецепт', '<ul class="ct-list">' + list.map(function (r) { return '<li class="ct-it"><button type="button" class="ct-main" data-pr="' + esc(r.id) + '"><span class="hb-rc-e">' + (Lib().emoji ? Lib().emoji(r) : '🍽️') + '</span><span class="ct-t"><b>' + esc(r.title) + '</b><small>' + esc(String(r.totalTime || '').replace('≈ ', '')) + '</small></span></button></li>'; }).join('') + '</ul>',
      function (e, shut) { var b = e.target.closest('[data-pr]'); if (!b) return; var r = Lib().byId(b.getAttribute('data-pr')); if (!r) return; shut(); send({ recipe: JSON.parse(JSON.stringify(r)) }); });
  }
  function recipeSheet(rec) {
    sheet(rec.title, '<p class="small">' + esc(rec.tagline || '') + '</p><p class="small hb-mut">' + esc([String(rec.totalTime || '').replace('≈ ', ''), rec.baseGuests ? rec.baseGuests + ' порц.' : ''].filter(Boolean).join(' · ')) + '</p>' +
      '<button type="button" class="nav-btn primary ct-cook" data-imp>Добавить в мою книгу</button>',
      function (e, shut) { if (!e.target.closest('[data-imp]')) return; var id = Lib().importRecipe ? Lib().importRecipe(rec) : null; shut(); if (id) { toast('Рецепт в вашей книге'); closeChat(); setTimeout(function () { Lib().show(id); }, 320); } });
  }
  function unread() { return unreadN; }
  setInterval(function () { if (!document.hidden && ready() && !chatEl) loadMsgs(function () { if (Soc().isOpen && Soc().isOpen() && Soc().rerender) Soc().rerender(); }); }, 45000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden && ready()) loadMsgs(); });
  setTimeout(function () { if (ready()) loadMsgs(); }, 2500);
  /* тап по пушу о сообщении — сразу в чат */
  function openFrom(id) { if (!id) return; var tries = 0; (function t() { if (ready() && Soc().person && Soc().person(id)) { if (!chatEl || chatWith !== id) { if (chatEl) closeChat(); setTimeout(function () { openChat(id); }, chatEl ? 320 : 0); } } else if (tries++ < 20) setTimeout(t, 500); })(); }
  var qc = /[?&]chat=([\w-]+)/.exec(location.search); if (qc) { openFrom(qc[1]); try { history.replaceState(null, '', location.pathname); } catch (e) {} }
  if (navigator.serviceWorker) navigator.serviceWorker.addEventListener('message', function (e) { if (e.data && e.data.chat) openFrom(e.data.chat); });

  /* ---------- вкладка «Чаты»: переключатель Чаты / Лента ---------- */
  function chatsTop() {
    return '<div class="seg hb-seg" role="tablist"><button type="button" role="tab" data-hub="cm" data-v="chats" aria-selected="' + (chatMode === 'chats') + '">Чаты' + (unreadN ? ' · ' + unreadN : '') + '</button><button type="button" role="tab" data-hub="cm" data-v="feed" aria-selected="' + (chatMode === 'feed') + '">Лента</button></div>';
  }
  function rowSub(id) { var x = lastWith(id); if (!x) return null; return { text: (x.sender === me() ? 'Вы: ' : '') + (x.recipe_title ? '📖 ' + x.recipe_title : x.body), at: x.created_at, unread: unreadFrom(id) }; }

  /* ---------- общий обработчик ---------- */
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-hub]'); if (!b) return; var a = b.getAttribute('data-hub');
    if (a === 'view') { var c = C(b.getAttribute('data-rid')); viewer(c.photos, +b.getAttribute('data-i')); }
    if (a === 'fview') { var id = b.getAttribute('data-id'), i = feed.photos.findIndex ? feed.photos.findIndex(function (p) { return String(p.id) === id; }) : 0; viewer(feed.photos, Math.max(0, i)); }
    if (a === 'rep') { var cc2 = b.closest('.hb-c'); cc2.classList.add('rep'); var ii = cc2.querySelector('.hb-qf input'); if (ii) ii.focus(); return; }
    if (a === 'cdel') { var did = b.getAttribute('data-id'), drid = b.getAttribute('data-rid'); req('DELETE', 'qa?id=eq.' + did).then(function () { C(drid).qa = C(drid).qa.filter(function (x) { return String(x.id) !== did && String(x.parent) !== did; }); if (rer) rer(); }).catch(function () { toast('Не удалилось'); }); return; }
    if (a === 'sort') { sortBy = b.getAttribute('data-v'); hap(); if (rer) rer(); }
    if (a === 'open') { var rid = b.getAttribute('data-rid'); if (Lib().byId && Lib().byId(rid)) { if (Soc().isOpen && Soc().isOpen() && Soc().close) Soc().close(); Lib().show(rid); } }
    if (a === 'card') { var r = Lib().byId(b.getAttribute('data-rid')); if (r) { b.classList.add('busy-c'); card(r); setTimeout(function () { b.classList.remove('busy-c'); }, 1200); } }
    if (a === 'chat') { if (Soc().close) Soc().close(); setTimeout(function () { openChat(b.getAttribute('data-id')); }, 50); }
    if (a === 'cm') { chatMode = b.getAttribute('data-v'); hap(); if (chatMode === 'feed') loadFeed(function () { if (Soc().rerender) Soc().rerender(); }); if (Soc().rerender) Soc().rerender(); }
    if (a === 'like') {
      var rid2 = b.getAttribute('data-rid'), ow = b.getAttribute('data-owner'), cc = C(rid2), on = cc.likes.some(function (l) { return l.review_owner === ow && l.liker === me(); });
      if (on) cc.likes = cc.likes.filter(function (l) { return !(l.review_owner === ow && l.liker === me()); }); else cc.likes.push({ recipe_id: rid2, review_owner: ow, liker: me() });
      R[rid2] = cc; hap(10); if (rer) rer();
      (on ? req('DELETE', 'review_likes?recipe_id=eq.' + q(rid2) + '&review_owner=eq.' + ow + '&liker=eq.' + me()) : req('POST', 'review_likes', { recipe_id: rid2, review_owner: ow, liker: me() })).catch(function () { toast('Не сохранилось'); });
    }
  });
  document.addEventListener('change', function (e) {
    var f = e.target.closest('[data-hub-file]'); if (!f || !f.files || !f.files[0]) return;
    var r = Lib().byId(f.getAttribute('data-hub-file')); if (!r) return;
    var lab = f.closest('.hb-add'); if (lab) lab.classList.add('busy-c');
    addPhoto(r, f.files[0]).then(function () { toast('Фото добавлено'); if (rer) rer(); }).catch(function (x) { toast(x && x.message && x.message.length < 60 ? x.message : 'Фото не загрузилось'); if (lab) lab.classList.remove('busy-c'); });
    f.value = '';
  });
  document.addEventListener('submit', function (e) {
    var f = e.target.closest('[data-hub-ask],[data-hub-ans],[data-hub-cmt]'); if (!f) return; e.preventDefault();
    var i = f.querySelector('input'), v = i.value.trim(); if (!v || !ready()) return; i.value = ''; i.disabled = true;
    var cr = f.getAttribute('data-hub-cmt'), crr = cr && Lib().byId && Lib().byId(cr);
    var p = cr ? req('POST', 'qa', { recipe_id: cr, recipe_title: crr ? String(crr.title).slice(0, 120) : null, author: me(), body: v, kind: 'c' }, 'return=representation').then(function (rows) { if (rows && rows[0]) { C(cr).qa.push(rows[0]); R[cr] = C(cr); } feed.at = 0; if (rer) rer(); }) :
      f.hasAttribute('data-hub-ask') ? ask(f.getAttribute('data-hub-ask'), v) :
      req('POST', 'qa', { recipe_id: f.getAttribute('data-rid'), parent: +f.getAttribute('data-hub-ans'), author: me(), body: v }, 'return=representation').then(function (rows) { if (rows && rows[0]) C(f.getAttribute('data-rid')).qa.push(rows[0]); if (rer) rer(); });
    p.catch(function () { toast('Не отправилось'); i.value = v; }).then(function () { i.disabled = false; });
  });

  window.KHub = { addPhoto: addPhoto, load: load, recipeHTML: recipeHTML, feedHTML: feedHTML, loadFeed: loadFeed, chatsTop: chatsTop, mode: function () { return chatMode; }, profileExtra: profileExtra, openChat: openChat, unread: unread, rowSub: rowSub, ready: ready };
})();
