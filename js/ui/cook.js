/* Готовка по шагам: продукты → посуда → шаги (один или двое поваров) → подача → «Приятного аппетита».
   Прогресс сверху как в сторис, свайпы, таймеры живут между шагами, экран не гаснет. */
(function () {
  'use strict';
  var Z = window.Z, D = Z.data, E = Z.esc;
  var C = null;            // текущая готовка
  var TM = Z.ls.get('kuking:timers5', {}) || {}; // таймеры: id → {label, total, left, endAt, run}
  function saveTM() { Z.ls.set('kuking:timers5', TM); }

  /* ---------- слайды ---------- */
  function slidesOf(r) {
    var out = [{ type: 'shop', short: 'Продукты' }, { type: 'tools', short: 'Посуда' }];
    (r.slides || []).forEach(function (s) { if (s.type === 'step' || s.type === 'serve') out.push(s); });
    if (!out.some(function (s) { return s.type === 'serve'; })) out.push({ type: 'serve', title: 'Подача', points: [] });
    out.push({ type: 'final' });
    return out;
  }
  function duo(r) { return D.steps(r).some(function (s) { return s.lanes; }); }

  function q(t) { return D.rich(C.r, t, C.g); }
  function acts(list, lane) {
    return '<ol class="acts">' + (list || []).map(function (a, i) {
      var key = C.idx + ':' + lane + ':' + i, on = !!C.st.done[key];
      return '<li><button type="button" class="act" role="checkbox" aria-checked="' + on + '" data-act="' + key + '"><span>' + q(a.t) + (a.tool ? '<span class="tool-n">' + E(a.tool) + '</span>' : '') + '</span></button></li>';
    }).join('') + '</ol>';
  }
  function timersOf(s) {
    var out = [];
    (function walk(o) { if (!o || typeof o !== 'object') return; if (Array.isArray(o)) return o.forEach(walk); if (o.timer && o.timer.min) out.push(o.timer); Object.keys(o).forEach(function (k) { if (k !== 'timer') walk(o[k]); }); })(s.both || s.lanes || s.items || []);
    return out;
  }
  function timerHTML(t) {
    var id = C.r.id + ':' + t.id, x = TM[id], total = t.min * 60, left = x ? leftOf(x) : total;
    return '<div class="timer" data-timer="' + E(id) + '" data-min="' + t.min + '" data-label="' + E(t.label || 'Таймер') + '">' +
      '<div class="ring' + (left <= 10 && x ? ' end' : '') + '"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="bg" cx="60" cy="60" r="52" fill="none" stroke-width="8"/><circle class="fg" cx="60" cy="60" r="52" fill="none" stroke-width="8" stroke-linecap="round" stroke-dasharray="326.7" stroke-dashoffset="' + (326.7 * (1 - left / total)) + '"/></svg><span class="t" role="timer" aria-live="off">' + mmss(left) + '</span></div>' +
      '<div class="timer-b"><b>' + E(t.label || 'Таймер') + ', ' + t.min + ' мин</b>' +
      '<button type="button" class="btn btn-act" data-t="toggle">' + (x && x.run ? 'Пауза' : x ? 'Продолжить' : 'Старт') + '</button>' +
      '<div class="row"><button type="button" class="btn btn-soft btn-s" data-t="reset">Сброс</button><button type="button" class="btn btn-soft btn-s" data-t="stop">Стоп</button></div></div></div>';
  }
  function slideHTML(s, i) {
    var r = C.r, h = '';
    if (s.type === 'shop') {
      h += '<h2 class="d2">Продукты</h2><p class="small" style="color:var(--cook-muted);margin-top:6px">Отметь, что уже на столе. ' + C.g + ' ' + Z.plural(C.g, 'порция', 'порции', 'порций') + '.</p>';
      (r.groups || ['Продукты']).forEach(function (gn, gi) {
        var items = (r.ingredients || []).filter(function (x) { return (x.g || 0) === gi; }); if (!items.length) return;
        h += '<p class="grp" style="color:var(--cook-muted)">' + E(gn) + '</p><ul class="list">' + items.map(function (x) {
          var on = !!C.st.have[x.id], qq = x.amount == null ? (x.unitText || '') : Z.fmtNum(D.scale(x, x.amount, C.g, r.baseGuests)) + ' ' + x.unit;
          return '<li><button type="button" class="chk" role="checkbox" aria-checked="' + on + '" data-have="' + E(x.id) + '" style="color:inherit"><span class="chk-box" style="background:transparent;border-color:var(--cook-line)"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span><span class="chk-name" style="' + (on ? 'color:var(--cook-muted)' : '') + '">' + E(x.name) + '</span><span class="chk-q" style="color:var(--cook-muted)">' + E(qq) + '</span></button></li>';
        }).join('') + '</ul>';
      });
    } else if (s.type === 'tools') {
      h += '<h2 class="d2">Посуда</h2><p class="small" style="color:var(--cook-muted);margin-top:6px">Тапни, что уже достал.</p>';
      (r.tools || []).forEach(function (z) {
        h += '<p class="grp" style="color:var(--cook-muted)">' + E(z.zone) + '</p><div class="tools" style="margin-top:8px">' + (z.items || []).map(function (t) {
          var on = !!C.st.tools[t.id];
          return '<button type="button" class="tool" data-tool="' + E(t.id) + '" aria-pressed="' + on + '" style="background:' + (on ? 'var(--act)' : 'var(--cook-soft)') + ';border-color:' + (on ? 'var(--act)' : 'var(--cook-line)') + ';color:' + (on ? 'var(--act-ink)' : 'var(--cook-ink)') + '"><b style="color:inherit">' + E(t.name) + '</b><small style="color:inherit;opacity:.8">' + E(t.use || '') + '</small></button>';
        }).join('') + '</div>';
      });
    } else if (s.type === 'step') {
      h += '<p class="small" style="color:var(--cook-muted)">' + E([s.time, s.dur].filter(Boolean).join(', ')) + '</p><h2 class="d2" style="margin-top:4px">' + E(s.title) + '</h2>';
      if (s.sync) h += '<div class="sync"><b>Порядок для двоих</b><p>' + q(s.sync) + '</p></div>';
      if (s.lanes) {
        h += '<div class="seg" role="tablist" aria-label="Чей план">' + [['both', 'Оба'], ['chef', 'Шеф'], ['sous', 'Су‑шеф']].map(function (x) { return '<button type="button" role="tab" data-who="' + x[0] + '" aria-selected="' + (C.who === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div>';
        if (s.both && s.both.length) h += acts(s.both, 'b');
        if (C.who !== 'sous') h += '<section class="lane"><h3>Шеф</h3>' + acts(s.lanes.chef, 'c') + '</section>';
        if (C.who !== 'chef') h += '<section class="lane sous"><h3>Су‑шеф</h3>' + acts(s.lanes.sous, 's') + '</section>';
        if (C.who !== 'both') h += '<p class="small" style="color:var(--cook-muted);margin-top:10px">У напарника сейчас: ' + E(((C.who === 'chef' ? s.lanes.sous : s.lanes.chef) || []).map(function (a) { return Z.plain(a.t).split(/[.:]/)[0]; }).join('; ')) + '.</p>';
      } else h += acts(s.both || s.items || [], 'b');
      h += timersOf(s).map(timerHTML).join('');
      if (s.joke) h += '<p class="joke">' + E(s.joke) + '</p>';
    } else if (s.type === 'serve') {
      h += '<h2 class="d2">Подача</h2>' + Z.img.html(r, 'serve-ph');
      if ((s.dishes || []).length) h += '<p class="small" style="color:var(--cook-muted);margin-top:12px">' + E(s.dishes.join(', ')) + '</p>';
      h += '<ol class="serve-pts">' + (s.points || []).map(function (p) { return '<li>' + q(p) + '</li>'; }).join('') + '</ol>';
    } else if (s.type === 'final') {
      h += '<div class="final"><p class="big">Приятного<br>аппетита</p><p style="margin-top:18px;color:var(--cook-muted)">Как вышло? Оценка поможет подобрать следующее блюдо.</p>' +
        '<div class="scale" style="margin-top:16px">' + [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(function (n) { var v = D.review(r.id); return '<button type="button" data-rate="' + n + '" aria-pressed="' + (!!v && v.score === n) + '" style="background:var(--cook-soft);border-color:var(--cook-line);color:var(--cook-ink)">' + n + '</button>'; }).join('') + '</div>' +
        '<button type="button" class="btn btn-act btn-wide" data-finish style="margin-top:18px">Готово</button></div>';
    }
    return '<div class="slide" data-i="' + i + '">' + h + '</div>';
  }

  /* ---------- каркас ---------- */
  function shell() {
    var el = document.createElement('div'); el.className = 'cook'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Готовка: ' + C.r.title);
    el.innerHTML = '<div class="cook-in"><div class="prog" role="tablist" aria-label="Шаги"></div>' +
      '<div class="cook-top"><span id="ckPos"></span><button type="button" class="icon-btn" data-close aria-label="Закрыть готовку">' + Z.icon('x') + '</button></div>' +
      '<div class="tdock" id="tdock"></div><div class="slides" id="slides"></div>' +
      '<div class="cook-nav"><button type="button" class="prev" data-prev aria-label="Назад">' + Z.icon('back') + '</button><button type="button" class="next" data-next></button></div></div>';
    return el;
  }
  function prog() {
    var p = C.el.querySelector('.prog');
    p.innerHTML = C.sl.map(function (s, i) {
      return '<button type="button" role="tab" aria-label="' + E(s.short || s.title || (s.type === 'final' ? 'Финал' : 'Шаг ' + (i + 1))) + '" aria-selected="' + (i === C.idx) + '" data-go="' + i + '" class="' + (i < C.idx ? 'done' : i === C.idx ? 'cur' : '') + '"><span><i></i></span></button>';
    }).join('');
  }
  function navTxt() {
    var n = C.sl[C.idx + 1];
    C.el.querySelector('[data-next]').textContent = !n ? 'Закрыть' : n.type === 'final' ? 'Готово' : 'Дальше: ' + (n.short || n.title || 'подача').toLowerCase();
    C.el.querySelector('[data-prev]').disabled = C.idx === 0;
    C.el.querySelector('[data-prev]').style.opacity = C.idx === 0 ? .35 : 1;
    var st = C.sl.filter(function (s) { return s.type === 'step'; }), si = st.indexOf(C.sl[C.idx]);
    C.el.querySelector('#ckPos').textContent = si >= 0 ? 'Шаг ' + (si + 1) + ' из ' + st.length : C.r.title;
  }
  function show(i, dir) {
    i = Math.max(0, Math.min(C.sl.length - 1, i));
    var box = C.el.querySelector('#slides'), old = box.querySelector('.slide');
    var fromFinal = C.idx === C.sl.length - 1;
    C.idx = i; C.st.idx = i; save();
    var w = document.createElement('div'); w.innerHTML = slideHTML(C.sl[i], i); var nw = w.firstChild;
    if (old && dir) {
      old.classList.add(dir > 0 ? 'leave-l' : 'leave-r'); nw.classList.add(dir > 0 ? 'enter-r' : 'enter-l');
      setTimeout(function () { old.remove(); nw.classList.remove('enter-r', 'enter-l'); }, 360);
    } else if (old) old.remove();
    box.appendChild(nw); prog(); navTxt(); Z.img.paint(); dock();
    if (C.sl[i].type === 'final' && !fromFinal) Z.fireworks();
  }
  function save() { Z.ls.set('kuking:cook5:' + C.r.id, C.st); }

  /* ---------- таймеры: по времени окончания, переживают сворачивание ---------- */
  function leftOf(x) { return Math.max(0, Math.round(x.run ? (x.endAt - Date.now()) / 1000 : x.left)); }
  function mmss(s) { s = Math.max(0, Math.round(s)); var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : String(m).padStart(2, '0')) + ':' + String(ss).padStart(2, '0'); }
  function tAct(node, a) {
    var id = node.getAttribute('data-timer'), total = +node.getAttribute('data-min') * 60, x = TM[id];
    if (a === 'toggle') {
      if (!x) x = TM[id] = { label: node.getAttribute('data-label'), total: total, left: total, run: false, rid: C.r.id };
      if (x.run) { x.left = leftOf(x); x.run = false; } else { if (x.left <= 0) x.left = total; x.endAt = Date.now() + x.left * 1000; x.run = true; x.rang = false; unlockAudio(); }
    } else if (a === 'reset') { if (x) { x.left = total; x.run = false; x.rang = false; } }
    else if (a === 'stop') { delete TM[id]; stopAlarm(); }
    saveTM(); repaintTimer(node); dock(); Z.haptic(8);
  }
  function repaintTimer(node) {
    var id = node.getAttribute('data-timer'), total = +node.getAttribute('data-min') * 60, x = TM[id], left = x ? leftOf(x) : total;
    node.querySelector('.t').textContent = mmss(left);
    node.querySelector('.fg').setAttribute('stroke-dashoffset', 326.7 * (1 - left / total));
    node.querySelector('.ring').classList.toggle('end', !!x && left <= 10);
    node.querySelector('[data-t="toggle"]').textContent = x && x.run ? 'Пауза' : x && left < total ? 'Продолжить' : 'Старт';
  }
  function dock() {
    if (!C) return; var d = C.el.querySelector('#tdock');
    var shown = {}; C.el.querySelectorAll('.slide [data-timer]').forEach(function (n) { shown[n.getAttribute('data-timer')] = 1; });
    d.innerHTML = Object.keys(TM).filter(function (id) { return !shown[id] && (TM[id].run || leftOf(TM[id]) === 0); }).map(function (id) { var x = TM[id], l = leftOf(x); return '<button type="button" class="tpill' + (l <= 10 ? ' end' : '') + '" data-tpill="' + E(id) + '" aria-label="' + E(x.label) + ', осталось ' + mmss(l) + '">' + E(x.label) + ' ' + mmss(l) + '</button>'; }).join('');
  }
  setInterval(function () {
    var ring = false;
    Object.keys(TM).forEach(function (id) { var x = TM[id]; if (x.run && leftOf(x) <= 0 && !x.rang) { x.rang = true; x.run = false; x.left = 0; saveTM(); ring = x; } });
    if (ring) alarm(ring);
    if (!C) return;
    C.el.querySelectorAll('.slide [data-timer]').forEach(repaintTimer);
    dock();
  }, 250);
  var actx = null, beepT = null;
  function unlockAudio() { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (e) {} }
  function beep() { if (!actx) return; try { [0, .25, .5].forEach(function (d) { var o = actx.createOscillator(), g = actx.createGain(); o.type = 'square'; o.frequency.value = 880; g.gain.setValueAtTime(.0001, actx.currentTime + d); g.gain.exponentialRampToValueAtTime(.25, actx.currentTime + d + .02); g.gain.exponentialRampToValueAtTime(.0001, actx.currentTime + d + .18); o.connect(g); g.connect(actx.destination); o.start(actx.currentTime + d); o.stop(actx.currentTime + d + .2); }); } catch (e) {} }
  function alarm(x) {
    try { if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 600]); } catch (e) {}
    beep(); var n = 0; clearInterval(beepT); beepT = setInterval(function () { if (++n > 5) return clearInterval(beepT); beep(); }, 1500);
    Z.toast(x.label + ': время вышло', 'Стоп', stopAlarm);
  }
  function stopAlarm() { clearInterval(beepT); try { if (navigator.vibrate) navigator.vibrate(0); } catch (e) {} }

  /* ---------- открыть / закрыть ---------- */
  var wake = null;
  function open(id, day) {
    var r = D.byId(id); if (!r) return;
    var st = Z.ls.get('kuking:cook5:' + id, null) || {};
    st.have = st.have || {}; st.tools = st.tools || {}; st.done = st.done || {};
    if (!st.at || Date.now() - st.at > 12 * 3600e3) { st = { have: {}, tools: {}, done: {}, idx: 0 }; (r.ingredients || []).forEach(function (x) { if (D.pFind(x.name)) st.have[x.id] = 1; }); }
    st.at = Date.now();
    var g = day ? D.guestsFor(day, id) : Z.portions(r);
    C = { r: r, day: day || Z.today(), g: g, sl: slidesOf(r), st: st, idx: Math.min(st.idx || 0, 999), who: Z.ls.get('kuking:who5', 'both') };
    C.idx = Math.min(C.idx, C.sl.length - 1);
    C.el = shell(); document.body.appendChild(C.el); document.body.style.overflow = 'hidden';
    history.pushState({ cook: 1 }, '', location.hash);
    show(C.idx, 0); bind();
    try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then(function (w) { wake = w; }).catch(function () {}); } catch (e) {}
  }
  function close(fromPop) {
    if (!C) return; var el = C.el; C = null;
    el.style.transition = 'opacity .2s'; el.style.opacity = '0'; setTimeout(function () { el.remove(); }, 200);
    document.body.style.overflow = '';
    try { if (wake) wake.release(); } catch (e) {} wake = null;
    if (!fromPop) history.back();
    Z.emit('change');
  }
  window.addEventListener('popstate', function () { if (C) close(true); });
  document.addEventListener('visibilitychange', function () { if (C && !document.hidden && navigator.wakeLock) navigator.wakeLock.request('screen').then(function (w) { wake = w; }).catch(function () {}); });

  function bind() {
    var el = C.el;
    el.onclick = function (e) {
      var b;
      if (e.target.closest('[data-close]')) return close();
      if (e.target.closest('[data-next]')) { Z.haptic(6); if (C.idx >= C.sl.length - 1) return finish(); return show(C.idx + 1, 1); }
      if (e.target.closest('[data-prev]')) { Z.haptic(6); return show(C.idx - 1, -1); }
      if ((b = e.target.closest('[data-go]'))) { var i = +b.getAttribute('data-go'); if (i !== C.idx) show(i, i > C.idx ? 1 : -1); return; }
      if ((b = e.target.closest('[data-have]'))) { var k = b.getAttribute('data-have'); C.st.have[k] = !C.st.have[k]; save(); b.setAttribute('aria-checked', !!C.st.have[k]); b.querySelector('.chk-name').style.color = C.st.have[k] ? 'var(--cook-muted)' : ''; b.querySelector('.chk-box').style.background = C.st.have[k] ? 'var(--act)' : 'transparent'; b.querySelector('.chk-box').style.borderColor = C.st.have[k] ? 'var(--act)' : 'var(--cook-line)'; Z.haptic(5); return; }
      if ((b = e.target.closest('[data-tool]'))) { var t = b.getAttribute('data-tool'), on = !C.st.tools[t]; C.st.tools[t] = on; save(); b.setAttribute('aria-pressed', on); b.style.background = on ? 'var(--act)' : 'var(--cook-soft)'; b.style.borderColor = on ? 'var(--act)' : 'var(--cook-line)'; b.style.color = on ? 'var(--act-ink)' : 'var(--cook-ink)'; Z.haptic(5); return; }
      if ((b = e.target.closest('[data-act]'))) { var a = b.getAttribute('data-act'); C.st.done[a] = !C.st.done[a]; save(); b.setAttribute('aria-checked', !!C.st.done[a]); Z.haptic(5); return; }
      if ((b = e.target.closest('[data-who]'))) { C.who = b.getAttribute('data-who'); Z.ls.set('kuking:who5', C.who); show(C.idx, 0); return; }
      if ((b = e.target.closest('[data-t]'))) { tAct(b.closest('[data-timer]'), b.getAttribute('data-t')); return; }
      if ((b = e.target.closest('[data-tpill]'))) { var id = b.getAttribute('data-tpill'); for (var j = 0; j < C.sl.length; j++) if (timersOf(C.sl[j]).some(function (x) { return C.r.id + ':' + x.id === id; })) { show(j, j > C.idx ? 1 : -1); break; } if (leftOf(TM[id]) === 0) { delete TM[id]; saveTM(); stopAlarm(); } return; }
      if ((b = e.target.closest('[data-rate]'))) { D.rate(C.r.id, +b.getAttribute('data-rate')); C.el.querySelectorAll('[data-rate]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); x.style.background = x === b ? 'var(--act)' : 'var(--cook-soft)'; x.style.color = x === b ? 'var(--act-ink)' : 'var(--cook-ink)'; }); Z.haptic(8); return; }
      if (e.target.closest('[data-finish]')) finish();
    };
    /* свайп по слайду */
    var x0 = null, y0 = null, box = el.querySelector('#slides');
    box.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    box.addEventListener('touchend', function (e) {
      if (x0 == null || !C) return; var dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0; x0 = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) { if (dx < 0 && C.idx < C.sl.length - 1) show(C.idx + 1, 1); else if (dx > 0 && C.idx > 0) show(C.idx - 1, -1); }
    }, { passive: true });
    el.addEventListener('keydown', function (e) { if (e.key === 'ArrowRight') show(C.idx + 1, 1); else if (e.key === 'ArrowLeft') show(C.idx - 1, -1); else if (e.key === 'Escape') close(); });
    el.tabIndex = -1; el.focus();
  }
  function finish() {
    var r = C.r, day = C.day;
    if (D.dayIds(day).indexOf(r.id) >= 0 && !D.isCooked(day, r.id)) D.setCooked(day, r.id, true);
    else if (!D.dayIds(day).length || D.dayIds(day).indexOf(r.id) < 0) { D.planAdd(day, r.id, C.g); D.setCooked(day, r.id, true); }
    Z.ls.del('kuking:cook5:' + r.id);
    Object.keys(TM).forEach(function (id) { if (TM[id].rid === r.id && !TM[id].run) delete TM[id]; }); saveTM();
    close();
    Z.toast('Приготовлено. Кладовка списана.');
  }

  /* ---------- фейерверк: каждый раз на финале, 4,5 секунды, крупные залпы ---------- */
  Z.fireworks = function () {
    var cv = document.getElementById('confetti'); if (!cv) return;
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    var dpr = Math.min(2, window.devicePixelRatio || 1), W = innerWidth, H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
    var g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    var cols = ['#F08A24', '#FFD089', '#E3A1AC', '#8FC27F', '#FFFFFF', '#FF5A4A'], P = [], t0 = performance.now(), dur = reduce ? 1500 : 4500, shots = reduce ? 1 : 9;
    function burst(x, y, n, sp) { for (var i = 0; i < n; i++) { var a = Math.random() * Math.PI * 2, v = sp * (0.4 + Math.random() * 0.8); P.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1, life: 1, c: cols[i % cols.length], s: 2 + Math.random() * 3.5, conf: Math.random() < .35, rot: Math.random() * 6 }); } }
    var fired = 0;
    (function frame(now) {
      var t = now - t0;
      while (fired < shots && t > fired * (dur * 0.62 / shots)) { burst(W * (0.15 + Math.random() * 0.7), H * (0.15 + Math.random() * 0.35), 90 + Math.random() * 60, 6 + Math.random() * 4); fired++; }
      g.clearRect(0, 0, W, H);
      P.forEach(function (p) {
        p.vx *= 0.985; p.vy = p.vy * 0.985 + (p.conf ? 0.06 : 0.1); p.x += p.vx; p.y += p.vy; p.life -= p.conf ? 0.004 : 0.009; p.rot += 0.2;
        if (p.life <= 0) return; g.globalAlpha = Math.max(0, Math.min(1, p.life * 1.4)); g.fillStyle = p.c;
        if (p.conf) { g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.fillRect(-p.s, -p.s / 2, p.s * 2.2, p.s); g.restore(); }
        else { g.beginPath(); g.arc(p.x, p.y, p.s * 0.8, 0, 7); g.fill(); }
      });
      P = P.filter(function (p) { return p.life > 0 && p.y < H + 20; });
      if (t < dur + 2500 && (P.length || fired < shots)) requestAnimationFrame(frame); else g.clearRect(0, 0, W, H);
    })(t0);
    try { if (navigator.vibrate) navigator.vibrate([20, 40, 20]); } catch (e) {}
  };

  Z.cook = { open: open, close: close, active: function () { return !!C; } };
})();
