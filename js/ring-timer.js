/* RingTimer — кольцо (SVG stroke-dashoffset) + MM:SS. Старт/Пауза, Сброс (заново с полного времени), Стоп.
   Последние 10 сек — красное кольцо с пульсацией. В конце — вибрация и звуковой сигнал, повтор до «Стоп».
   Таймеры живут глобально и не сбрасываются при переходах между слайдами. */
window.RingTimer = (function () {
  var T = {};
  var changeSubs = [], tickSubs = [];
  var raf = 0, actx = null, ringIv = 0, ringUntil = 0;
  var R = 52, C = 2 * Math.PI * R;

  function now() { return performance.now(); }
  function left(t) { return t.running ? Math.max(0, (t.endAt - now()) / 1000) : t.remaining; }
  function emit(list) { list.slice().forEach(function (f) { f(); }); }

  function ensure(c) {
    var t = T[c.id];
    if (!t) t = T[c.id] = { id: c.id, label: c.label, total: c.sec, remaining: c.sec, running: false, endAt: 0, ringing: false, slide: c.slide };
    return t;
  }

  function unlock() {
    try {
      if (!actx) { var A = window.AudioContext || window.webkitAudioContext; if (A) actx = new A(); }
      if (actx && actx.state === 'suspended') actx.resume();
    } catch (e) {}
  }

  function beep() {
    if (!actx) return;
    var t0 = actx.currentTime;
    [0, 0.22, 0.44].forEach(function (d, i) {
      var o = actx.createOscillator(), g = actx.createGain();
      o.type = 'square';
      o.frequency.value = i === 2 ? 1320 : 988;
      g.gain.setValueAtTime(0.0001, t0 + d);
      g.gain.exponentialRampToValueAtTime(0.22, t0 + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.18);
      o.connect(g); g.connect(actx.destination);
      o.start(t0 + d); o.stop(t0 + d + 0.2);
    });
  }

  function vibrate(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} }
  function anyRinging() { return Object.keys(T).some(function (k) { return T[k].ringing; }); }

  function startRing() {
    vibrate([400, 150, 400, 150, 800]);
    beep();
    ringUntil = now() + 90000;
    if (ringIv) return;
    ringIv = setInterval(function () {
      if (!anyRinging() || now() > ringUntil) { clearInterval(ringIv); ringIv = 0; return; }
      beep(); vibrate(300);
    }, 1500);
  }

  function tick() {
    raf = 0;
    var active = false, changed = false;
    Object.keys(T).forEach(function (k) {
      var t = T[k];
      if (!t.running) return;
      if (left(t) <= 0) { t.running = false; t.remaining = 0; t.ringing = true; changed = true; startRing(); }
      else active = true;
    });
    emit(tickSubs);
    if (changed) emit(changeSubs);
    if (active) raf = requestAnimationFrame(tick);
  }
  function loop() { if (!raf) raf = requestAnimationFrame(tick); }

  var api = {
    get: function (id) { return T[id]; },
    create: function (c) { return ensure(c); },
    all: function () { return Object.keys(T).map(function (k) { return T[k]; }); },
    left: left,
    start: function (id) {
      var t = T[id]; if (!t || t.ringing) return;
      unlock();
      if (t.remaining <= 0) t.remaining = t.total;
      t.endAt = now() + t.remaining * 1000; t.running = true;
      loop(); emit(changeSubs);
    },
    pause: function (id) {
      var t = T[id]; if (!t || !t.running) return;
      t.remaining = left(t); t.running = false;
      emit(tickSubs); emit(changeSubs);
    },
    toggle: function (id) { var t = T[id]; if (!t) return; t.running ? api.pause(id) : api.start(id); },
    reset: function (id) { // заново с полного времени; если шёл — продолжает идти
      var t = T[id]; if (!t) return;
      unlock();
      t.ringing = false; t.remaining = t.total;
      if (t.running) t.endAt = now() + t.total * 1000;
      loop(); emit(tickSubs); emit(changeSubs);
    },
    stop: function (id) { // глушит сигнал и останавливает
      var t = T[id]; if (!t) return;
      t.running = false; t.ringing = false; t.remaining = t.total;
      emit(tickSubs); emit(changeSubs);
    },
    onChange: function (f) { changeSubs.push(f); return function () { changeSubs = changeSubs.filter(function (x) { return x !== f; }); }; },
    onTick: function (f) { tickSubs.push(f); return function () { tickSubs = tickSubs.filter(function (x) { return x !== f; }); }; },
    fmt: function (s) {
      s = Math.ceil(s);
      var m = Math.floor(s / 60), r = s % 60;
      return String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0');
    },
    mount: function (host, cfg) {
      var t = ensure(cfg);
      var el = document.createElement('div');
      el.className = 'rt';
      el.innerHTML =
        '<div class="rt-dial"><svg viewBox="0 0 120 120" aria-hidden="true">' +
        '<circle class="rt-track" cx="60" cy="60" r="' + R + '"/>' +
        '<circle class="rt-ring" cx="60" cy="60" r="' + R + '" stroke-dasharray="' + C.toFixed(2) + '" stroke-dashoffset="0"/></svg>' +
        '<div class="rt-center"><div class="rt-time" aria-live="off"></div><div class="rt-label"></div></div></div>' +
        '<div class="rt-btns"><button class="rt-go" type="button"></button>' +
        '<button class="rt-reset" type="button">Сброс</button>' +
        '<button class="rt-stop" type="button">Стоп</button></div>';
      var ring = el.querySelector('.rt-ring'), time = el.querySelector('.rt-time'), go = el.querySelector('.rt-go');
      el.querySelector('.rt-label').textContent = t.label;
      go.addEventListener('click', function () { api.toggle(t.id); });
      el.querySelector('.rt-reset').addEventListener('click', function () { api.reset(t.id); });
      el.querySelector('.rt-stop').addEventListener('click', function () { api.stop(t.id); });

      var seen = false, un1, un2;
      function paint() {
        if (el.isConnected) seen = true;
        else if (seen) { un1(); un2(); return; }
        var l = left(t), frac = t.total ? l / t.total : 0;
        ring.style.strokeDashoffset = (C * (1 - frac)).toFixed(2);
        time.textContent = api.fmt(l);
        el.classList.toggle('running', t.running);
        el.classList.toggle('warn', t.running && l <= 10);
        el.classList.toggle('ringing', t.ringing);
        go.textContent = t.running ? 'Пауза' : t.ringing ? 'Готово!' : (l < t.total ? 'Дальше' : 'Старт');
        go.disabled = t.ringing;
      }
      host.appendChild(el);
      un1 = api.onTick(paint); un2 = api.onChange(paint);
      paint();
      return el;
    }
  };
  return api;
})();
