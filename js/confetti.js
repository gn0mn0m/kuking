/* Confetti — свой салют на canvas: большой взрыв у надписи, ракеты с фейерверками ~6 сек и дождь конфетти.
   Не блокирует интерфейс (pointer-events: none). Срабатывает при каждом заходе на финальный слайд. */
window.Confetti = (function () {
  var cv, ctx, W = 0, H = 0, parts = [], rockets = [], queue = [], raf = 0, t0 = 0, last = 0;
  var COLS = ['#ff8c32', '#ffb35c', '#ffd27a', '#c2364f', '#e0647d', '#8fbf6e', '#5e8f4d', '#fff3e6'];
  var MAX = 2600;

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(a) { return a[(Math.random() * a.length) | 0]; }

  function setup() {
    cv = document.getElementById('fx');
    ctx = cv.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
  }
  function resize() {
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function burst(x, y, n, power) {
    var a = pick(COLS), b = pick(COLS);
    for (var i = 0; i < n && parts.length < MAX; i++) {
      var ang = Math.random() * Math.PI * 2, s = rnd(0.3, 1) * power;
      parts.push({ k: 's', x: x, y: y, vx: Math.cos(ang) * s, vy: Math.sin(ang) * s, life: 0, max: rnd(1.4, 2.4), c: Math.random() < 0.7 ? a : b, r: rnd(1.6, 3.4) });
    }
  }
  function paper(x, y, vx, vy, max) {
    if (parts.length >= MAX) return;
    parts.push({ k: 'p', x: x, y: y, vx: vx, vy: vy, rot: rnd(0, 6.28), vr: rnd(-7, 7), w: rnd(7, 12), h: rnd(10, 16), life: 0, max: max, c: pick(COLS), sw: rnd(0, 6.28) });
  }
  function cannons(n) {
    for (var i = 0; i < n; i++) {
      paper(-10, H * 0.85, rnd(250, 820), rnd(-1100, -500), rnd(4, 6));
      paper(W + 10, H * 0.85, -rnd(250, 820), rnd(-1100, -500), rnd(4, 6));
    }
  }
  function rain(n) { for (var i = 0; i < n; i++) paper(rnd(0, W), rnd(-H * 0.6, -10), rnd(-40, 40), rnd(60, 160), rnd(5, 7)); }
  function launch() {
    rockets.push({ x: rnd(W * 0.1, W * 0.9), y: H + 10, vx: rnd(-40, 40), vy: -rnd(H * 1.05, H * 1.35), ty: rnd(H * 0.1, H * 0.45), c: pick(COLS), tr: [] });
  }

  function fire(opts) {
    opts = opts || {};
    if (!cv) setup(); else resize();
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var big = Math.max(W, H), P = Math.max(360, big * 0.55);
    var ax = W / 2, ay = H * 0.42;
    if (opts.anchor) { var r = opts.anchor.getBoundingClientRect(); ax = r.left + r.width / 2; ay = r.top + r.height / 2; }
    queue = [];
    t0 = performance.now(); last = t0;
    burst(ax, ay, reduce ? 70 : 220, P);
    burst(ax - W * 0.18, ay + 10, reduce ? 0 : 120, P * 0.7);
    burst(ax + W * 0.18, ay + 10, reduce ? 0 : 120, P * 0.7);
    cannons(reduce ? 20 : 90);
    rain(reduce ? 60 : 180);
    var dur = reduce ? 2500 : 6500;
    for (var t = 200; t < dur; t += rnd(160, 340)) queue.push({ at: t, fn: launch });
    if (!reduce) {
      queue.push({ at: 1100, fn: function () { burst(ax, ay - 20, 160, P * 0.9); } });
      queue.push({ at: 2600, fn: function () { cannons(60); } });
      queue.push({ at: 4200, fn: function () { burst(ax, ay, 200, P); rain(90); } });
    }
    queue.sort(function (a, b) { return a.at - b.at; });
    if (!raf) raf = requestAnimationFrame(frame);
  }

  function frame(ts) {
    var dt = Math.min(0.05, (ts - last) / 1000); last = ts;
    var el = ts - t0;
    while (queue.length && queue[0].at <= el) queue.shift().fn();
    ctx.clearRect(0, 0, W, H);

    ctx.globalCompositeOperation = 'lighter';
    for (var i = rockets.length - 1; i >= 0; i--) {
      var r = rockets[i];
      r.vy += 420 * dt; r.x += r.vx * dt; r.y += r.vy * dt;
      r.tr.push([r.x, r.y]); if (r.tr.length > 12) r.tr.shift();
      ctx.strokeStyle = r.c; ctx.lineWidth = 2.4; ctx.globalAlpha = 0.85;
      ctx.beginPath();
      r.tr.forEach(function (p, j) { j ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); });
      ctx.stroke();
      if (r.y <= r.ty || r.vy >= -40) { burst(r.x, r.y, rnd(110, 170), rnd(280, 460)); rockets.splice(i, 1); }
    }

    for (var k = parts.length - 1; k >= 0; k--) {
      var p = parts[k];
      p.life += dt;
      if (p.life >= p.max || p.y > H + 40) { parts.splice(k, 1); continue; }
      var a = 1 - p.life / p.max;
      if (p.k === 's') {
        p.vx *= 1 - 1.5 * dt; p.vy *= 1 - 1.5 * dt; p.vy += 240 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = a * (0.7 + Math.random() * 0.3);
        ctx.fillStyle = p.c;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
      } else {
        p.vx *= 1 - 0.9 * dt; p.vy += 520 * dt; if (p.vy > 190) p.vy = 190;
        p.x += (p.vx + Math.sin(p.life * 4 + p.sw) * 40) * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = Math.min(1, a * 1.6);
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, Math.cos(p.life * 6 + p.sw));
        ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';

    if (parts.length || rockets.length || queue.length) raf = requestAnimationFrame(frame);
    else { raf = 0; ctx.clearRect(0, 0, W, H); }
  }

  return { fire: fire };
})();
