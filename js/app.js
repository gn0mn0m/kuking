/* App — состояние, пересчёт по гостям, сборка слайдов, свайпы, док таймеров, полноэкранный режим. */
(function () {
  'use strict';
  var M = window.MENU;
  var doneActs = (function () { try { return JSON.parse(localStorage.getItem('kuking:done')) || {}; } catch (e) { return {}; } })();
  var SKILL = +(function () { try { return localStorage.getItem('kuking:skill'); } catch (e) { return 0; } })() || 5; // уровень готовки 1–10 из анкеты
  if (!M) return; // рецептов ещё нет — живём на главной
  var $ = function (s, r) { return (r || document).querySelector(s); };
  function h(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

  var store = {
    get: function (k, d) { try { var v = localStorage.getItem('kuking:' + M.id + ':' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('kuking:' + M.id + ':' + k, JSON.stringify(v)); } catch (e) {} }
  };

  var MODES = [
    { id: 'self', label: 'Для себя', min: 1 },
    { id: 'romance', label: 'Романтика', min: 3 },
    { id: 'friends', label: 'Друзья', min: 5 }
  ];
  function modeOf(g) { return g >= 5 ? 'friends' : g >= 3 ? 'romance' : 'self'; }

  var state = {
    idx: clamp(store.get('idx', 0) | 0, 0, M.slides.length - 1),
    guests: clamp(store.get('guests', M.baseGuests) | 0, 1, 12),
    have: store.get('have', {}),
    picked: store.get('picked', {}),
    lanes: store.get('lanes', { chef: true, sous: true }),
    solo: store.get('crew', 'duo') === 'solo'
  };

  /* ---------- пересчёт количеств ---------- */
  var ING = {};
  M.ingredients.forEach(function (i) { ING[i.id] = i; });

  function scaleVal(ing, base) {
    if (ing.round === 'fixed') return base;
    var x = base * state.guests / M.baseGuests;
    switch (ing.round) {
      case 'ceil': return Math.max(1, Math.ceil(x - 1e-9));
      case 'int': return Math.max(1, Math.round(x));
      case 'g50': return Math.max(50, Math.round(x / 50) * 50);
      case 'g10': return Math.max(10, Math.round(x / 10) * 10);
      case 'ml5': return Math.max(5, Math.round(x / 5) * 5);
      case 'spoon': return Math.max(0.5, Math.round(x * 2) / 2);
      case 'dec1': return Math.max(0.1, Math.round(x * 10) / 10);
    }
    return x;
  }
  function fmtNum(n) {
    var w = Math.floor(n), f = n - w;
    if (Math.abs(f - 0.5) < 1e-9) return (w ? w : '') + '½';
    return String(Math.round(n * 10) / 10).replace('.', ',');
  }
  function qty(id, part) {
    if (id === 'guests') return state.guests + ' шт';
    var ing = ING[id];
    if (!ing) return '?';
    if (ing.amount == null) return ing.unitText || '';
    return fmtNum(scaleVal(ing, part != null ? part : ing.amount)) + ' ' + ing.unit;
  }
  function rich(t) {
    var s = esc(t);
    s = s.replace(/\{(\w+)(?::([\d.]+))?\}/g, function (m, id, p) {
      return '<span class="q">' + qty(id, p != null ? parseFloat(p) : null) + '</span>';
    });
    return s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  }

  /* ---------- иконки ---------- */
  var ICO = {
    pot: '<path d="M12 18h40v18a8 8 0 0 1-8 8H20a8 8 0 0 1-8-8z"/><path d="M5 21h7M52 21h7M14 13h36M28 9h8"/>',
    potS: '<path d="M18 22h28v12a7 7 0 0 1-7 7H25a7 7 0 0 1-7-7z"/><path d="M46 25h14M20 17h24"/>',
    pan: '<ellipse cx="25" cy="25" rx="20" ry="8"/><path d="M5 25v4c0 5 9 9 20 9s20-4 20-9v-4M45 27l15-5"/>',
    panS: '<ellipse cx="22" cy="26" rx="14" ry="6"/><path d="M8 26v3c0 4 6 7 14 7s14-3 14-7v-3M36 28l20-6"/>',
    blender: '<path d="M22 6h20l-3 26H25z"/><path d="M20 32h24l2 12H18z"/><path d="M28 14h8M29 20h6"/>',
    oven: '<rect x="8" y="6" width="48" height="38" rx="4"/><rect x="15" y="16" width="34" height="22" rx="2"/><path d="M14 11h4M22 11h4M44 11h6"/>',
    strainer: '<circle cx="26" cy="24" r="14"/><path d="M40 24h18M18 18l16 12M16 26l14 10M22 12l14 10"/>',
    jigger: '<path d="M18 6h28l-10 18 10 18H18l10-18z"/><path d="M22 24h20"/>',
    tin: '<path d="M18 6h28l-4 38H22z"/><path d="M20 16h24"/>',
    glass: '<path d="M16 10h28l-3 32H19z"/><path d="M44 6L30 34"/><circle cx="30" cy="34" r="2"/>',
    board: '<rect x="6" y="14" width="40" height="26" rx="5"/><path d="M46 27h10"/><path d="M14 8l30 4" />',
    grater: '<path d="M20 6h24l4 38H16z"/><path d="M24 16h4M32 16h4M24 24h4M32 24h4M24 32h4M32 32h4"/>',
    whisk: '<path d="M32 44V30"/><path d="M32 30c-12-6-12-24 0-24s12 18 0 24z"/><path d="M32 30c-5-6-5-24 0-24M32 30c5-6 5-24 0-24"/>',
    cup: '<path d="M14 18h36l-4 22H18z"/><path d="M16 26h32"/>',
    plate: '<ellipse cx="32" cy="26" rx="27" ry="12"/><ellipse cx="32" cy="25" rx="18" ry="7"/>',
    plateC: '<ellipse cx="32" cy="26" rx="25" ry="11"/><ellipse cx="32" cy="25" rx="17" ry="7"/><path d="M22 24l6 2 4-3M36 27l5-2"/>',
    bowl: '<path d="M10 18h44v8c0 9-10 16-22 16S10 35 10 26z"/><ellipse cx="32" cy="18" rx="22" ry="5"/>',
    glassbowl: '<path d="M8 14h48c0 16-10 28-24 28S8 30 8 14z"/><path d="M14 20c2 8 8 14 14 16"/>',
    pin: '<path d="M32 44s14-14 14-24a14 14 0 0 0-28 0c0 10 14 24 14 24z"/><circle cx="32" cy="20" r="5"/>'
  };
  function ico(name, cls) { return '<svg class="ico ' + (cls || '') + '" viewBox="0 0 64 48" aria-hidden="true">' + (ICO[name] || '') + '</svg>'; }

  /* ---------- подача: иллюстрации ---------- */
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function blob(cx, cy, r, wob, n, rand) {
    var pts = [];
    for (var i = 0; i < n; i++) { var a = i / n * Math.PI * 2, rr = r * (1 + (rand() - 0.5) * wob); pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
    var d = 'M' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1);
    for (var j = 0; j < n; j++) {
      var p1 = pts[(j + 1) % n], p0 = pts[j], mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
      d += ' Q' + p0[0].toFixed(1) + ' ' + p0[1].toFixed(1) + ' ' + mx.toFixed(1) + ' ' + my.toFixed(1);
    }
    return d + 'Z';
  }
  function crackle(cx, cy, r, rand, n) {
    var s = '';
    for (var i = 0; i < n; i++) {
      var a = rand() * 6.283, d = r * (0.25 + rand() * 0.7), x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
      var p = 'M' + x.toFixed(1) + ' ' + y.toFixed(1);
      for (var k = 0; k < 4; k++) { x += (rand() - 0.5) * 26; y += (rand() - 0.5) * 26; p += ' L' + x.toFixed(1) + ' ' + y.toFixed(1); }
      s += '<path class="p-crack" d="' + p + '"/>';
    }
    return s;
  }

  function artMain() {
    var r = rng(7), s = '<svg viewBox="0 0 340 340" class="plating" role="img" aria-label="Горячее: ризотто золотым кругом, утка веером, соус дорожкой">';
    s += '<ellipse cx="174" cy="182" rx="150" ry="146" class="p-shadow"/>';
    s += '<circle cx="170" cy="170" r="150" class="p-plate"/><circle cx="170" cy="170" r="128" class="p-rim"/>';
    s += crackle(170, 170, 140, r, 16);
    s += '<path class="p-risotto" d="' + blob(150, 180, 80, 0.12, 14, r) + '"/>';
    for (var i = 0; i < 160; i++) {
      var a = r() * 6.283, d = Math.sqrt(r()) * 70, x = 150 + Math.cos(a) * d, y = 180 + Math.sin(a) * d;
      s += '<ellipse class="p-grain" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" rx="3.4" ry="1.6" transform="rotate(' + (r() * 180 | 0) + ' ' + x.toFixed(1) + ' ' + y.toFixed(1) + ')"/>';
    }
    s += '<path class="p-sauce" d="M120 238 C 150 250, 200 248, 236 222 C 242 218, 246 224, 240 228 C 204 256, 150 262, 118 244 Z"/>';
    [[252, 206, 6], [262, 190, 4], [104, 228, 4.5]].forEach(function (c) { s += '<circle class="p-sauce" cx="' + c[0] + '" cy="' + c[1] + '" r="' + c[2] + '"/>'; });
    for (var k = 0; k < 6; k++) {
      var ang = -34 + k * 13;
      s += '<g transform="rotate(' + ang + ' 175 262)"><rect class="p-skin" x="161" y="118" width="28" height="96" rx="12"/><rect class="p-meat" x="165" y="124" width="20" height="84" rx="9"/><rect class="p-meat2" x="170" y="132" width="10" height="66" rx="5"/></g>';
    }
    [[132, 128], [214, 108], [240, 150], [122, 160]].forEach(function (z) { s += '<path class="p-zest" d="M' + z[0] + ' ' + z[1] + ' q 6 -6 12 0"/>'; });
    for (var t = 0; t < 10; t++) {
      var tx = 120 + r() * 140, ty = 110 + r() * 120;
      s += '<ellipse class="p-thyme" cx="' + tx.toFixed(1) + '" cy="' + ty.toFixed(1) + '" rx="3" ry="1.6" transform="rotate(' + (r() * 180 | 0) + ' ' + tx.toFixed(1) + ' ' + ty.toFixed(1) + ')"/>';
    }
    return s + '</svg>';
  }


  function artChicken() {
    var r = rng(23), s = '<svg viewBox="0 0 340 340" class="plating" role="img" aria-label="Горячее: пюре волной, два бедра кожей вверх, соус вокруг">';
    s += '<ellipse cx="174" cy="182" rx="150" ry="146" class="p-shadow"/>';
    s += '<circle cx="170" cy="170" r="150" class="p-plate"/><circle cx="170" cy="170" r="128" class="p-rim"/>';
    s += crackle(170, 170, 140, r, 16);
    s += '<path class="k-sauce" d="' + blob(185, 178, 98, 0.18, 12, r) + '"/>';
    s += '<path class="k-mash" d="' + blob(128, 168, 62, 0.16, 12, r) + '"/>';
    s += '<path class="k-ridge" d="M92 160 q 34 -22 70 0"/><path class="k-ridge" d="M98 182 q 30 -16 58 0"/>';
    s += '<ellipse class="k-pool" cx="130" cy="170" rx="18" ry="11"/>';
    [[218, 150, -18], [206, 206, 12]].forEach(function (c) {
      s += '<g transform="rotate(' + c[2] + ' ' + c[0] + ' ' + c[1] + ')">' +
        '<path class="k-skin" d="M' + (c[0] - 46) + ' ' + c[1] + ' c 0 -30 26 -42 52 -36 c 26 6 40 22 38 40 c -2 22 -30 32 -56 30 c -20 -2 -34 -14 -34 -34 z"/>' +
        '<path class="k-hl" d="M' + (c[0] - 30) + ' ' + (c[1] - 16) + ' q 20 -16 48 -8"/></g>';
      for (var d = 0; d < 14; d++) {
        var x = c[0] - 30 + r() * 62, y = c[1] - 22 + r() * 40;
        s += '<circle class="k-crisp" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + (1 + r() * 1.6).toFixed(1) + '"/>';
      }
    });
    for (var g = 0; g < 6; g++) {
      var gx = 180 + r() * 70, gy = 140 + r() * 80;
      s += '<ellipse class="k-garlic" cx="' + gx.toFixed(1) + '" cy="' + gy.toFixed(1) + '" rx="4" ry="2.6" transform="rotate(' + (r() * 180 | 0) + ' ' + gx.toFixed(1) + ' ' + gy.toFixed(1) + ')"/>';
    }
    for (var p = 0; p < 18; p++) {
      var px = 100 + r() * 160, py = 120 + r() * 110;
      s += '<circle class="k-parsley" cx="' + px.toFixed(1) + '" cy="' + py.toFixed(1) + '" r="' + (1.4 + r() * 1.4).toFixed(1) + '"/>';
    }
    s += '<path class="k-zest" d="M110 130 q 6 -6 12 0"/><path class="k-zest" d="M150 210 q 6 -6 12 0"/>';
    s += '<path class="k-lemon" d="M258 236 a 26 26 0 0 1 -44 22 z"/><path class="k-lemon-in" d="M253 240 a 20 20 0 0 1 -33 16 z"/>';
    return s + '</svg>';
  }

  function artAperitivo() {
    var r = rng(11), s = '<svg viewBox="0 0 420 340" class="plating" role="img" aria-label="Аперитиво: кростини веером вокруг миски с муссом, рядом стеклянная миска с оливками">';
    s += '<ellipse cx="174" cy="182" rx="152" ry="148" class="p-shadow"/>';
    s += '<circle cx="170" cy="172" r="152" class="p-plate"/><circle cx="170" cy="172" r="134" class="p-rim"/>';
    for (var i = 0; i < 10; i++) {
      var a = i / 10 * 360, rad = a * Math.PI / 180, x = 170 + Math.cos(rad) * 96, y = 172 + Math.sin(rad) * 96;
      s += '<g transform="rotate(' + (a + 90).toFixed(1) + ' ' + x.toFixed(1) + ' ' + y.toFixed(1) + ')">' +
        '<rect class="c-bread" x="' + (x - 30).toFixed(1) + '" y="' + (y - 17).toFixed(1) + '" width="60" height="34" rx="10"/>' +
        '<rect class="c-crust" x="' + (x - 30).toFixed(1) + '" y="' + (y - 17).toFixed(1) + '" width="60" height="34" rx="10"/>' +
        '<ellipse class="c-mousse" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" rx="22" ry="11"/>' +
        '<circle class="c-jam" cx="' + (x - 3).toFixed(1) + '" cy="' + (y - 1).toFixed(1) + '" r="5.5"/>' +
        '<ellipse class="p-thyme" cx="' + (x + 9).toFixed(1) + '" cy="' + (y + 3).toFixed(1) + '" rx="3.2" ry="1.6"/>' +
        '<rect class="c-salt" x="' + (x + 2).toFixed(1) + '" y="' + (y - 7).toFixed(1) + '" width="2.6" height="2.6"/>' +
        '<rect class="c-salt" x="' + (x - 12).toFixed(1) + '" y="' + (y + 4).toFixed(1) + '" width="2.2" height="2.2"/></g>';
    }
    s += '<circle cx="170" cy="172" r="46" class="b-white"/><circle cx="170" cy="172" r="36" class="c-mousse"/>';
    s += '<path class="c-swirl" d="M150 170 q 20 -14 40 0 q -20 12 -30 2"/>';
    // стеклянная миска с оливками
    s += '<circle cx="352" cy="88" r="54" class="b-glass"/><circle cx="352" cy="88" r="44" class="b-oil"/>';
    for (var o = 0; o < 14; o++) {
      var oa = r() * 6.283, od = Math.sqrt(r()) * 32, ox = 352 + Math.cos(oa) * od, oy = 88 + Math.sin(oa) * od;
      s += '<ellipse class="o-olive" cx="' + ox.toFixed(1) + '" cy="' + oy.toFixed(1) + '" rx="8.5" ry="6.5" transform="rotate(' + (r() * 180 | 0) + ' ' + ox.toFixed(1) + ' ' + oy.toFixed(1) + ')"/>';
    }
    s += '<path class="p-zest" d="M330 70 q 10 -8 20 0"/><path class="p-zest" d="M356 108 q 10 -8 20 0"/>';
    s += '<path class="o-rosemary" d="M332 96 L 374 74"/>';
    return s + '</svg>';
  }

  function artPasta() {
    var r = rng(73), s = '<svg viewBox="0 0 420 340" class="plating" role="img" aria-label="Паста пипе ригате в густом томатном соусе с говяжьим фаршем горкой на тарелке, сверху кинза с чесноком">';
    s += '<ellipse cx="214" cy="182" rx="186" ry="150" class="p-shadow"/>';
    s += '<circle cx="210" cy="172" r="160" class="p-plate"/><circle cx="210" cy="172" r="128" class="p-rim"/>';
    s += crackle(210, 172, 150, r, 12);
    s += '<path class="pa-sauce" d="M120 186 C 110 130, 170 92, 222 98 C 288 104, 312 160, 292 214 C 272 262, 160 268, 128 230 Z"/>';
    for (var i = 0; i < 26; i++) { // пипе ригате — ракушки-трубки
      var a = r() * 6.283, d = Math.sqrt(r()) * 78, x = 210 + Math.cos(a) * d, y = 178 + Math.sin(a) * d * 0.85, rot = (r() * 360) | 0;
      s += '<g transform="rotate(' + rot + ' ' + x.toFixed(1) + ' ' + y.toFixed(1) + ')"><path class="pa-pipe" d="M' + (x - 13).toFixed(1) + ' ' + (y - 6).toFixed(1) + ' q 13 -9 26 0 q 4 6 0 12 q -13 9 -26 0 q -4 -6 0 -12 z"/>' +
        '<ellipse class="pa-hole" cx="' + (x + 11).toFixed(1) + '" cy="' + y.toFixed(1) + '" rx="4" ry="5"/>' +
        '<path class="pa-ridge" d="M' + (x - 6).toFixed(1) + ' ' + (y - 8).toFixed(1) + ' v 15 M' + (x).toFixed(1) + ' ' + (y - 9).toFixed(1) + ' v 17 M' + (x + 6).toFixed(1) + ' ' + (y - 8).toFixed(1) + ' v 15"/></g>';
    }
    for (var m = 0; m < 40; m++) { var mx = 210 + (r() - 0.5) * 170, my = 176 + (r() - 0.5) * 140; if (Math.hypot(mx - 210, (my - 176) / 0.85) < 86) s += '<circle class="pa-mince" cx="' + mx.toFixed(1) + '" cy="' + my.toFixed(1) + '" r="' + (2.5 + r() * 3).toFixed(1) + '"/>'; }
    for (var g = 0; g < 18; g++) { var gx = 210 + (r() - 0.5) * 120, gy = 168 + (r() - 0.5) * 90; s += '<path class="pa-herb" d="M' + gx.toFixed(1) + ' ' + gy.toFixed(1) + ' q 4 -7 9 -2 q -3 6 -9 2 z"/>'; }
    for (var c = 0; c < 10; c++) { var cx = 210 + (r() - 0.5) * 100, cy = 170 + (r() - 0.5) * 80; s += '<rect class="pa-garlic" x="' + cx.toFixed(1) + '" y="' + cy.toFixed(1) + '" width="3" height="3" rx="1"/>'; }
    return s + '</svg>';
  }

  function artBurger() {
    var r = rng(41), s = '<svg viewBox="0 0 420 340" class="plating" role="img" aria-label="Горячее: дабл смэш с текущим чеддером на тарелке, рядом горка фри и капля айоли">';
    s += '<ellipse cx="214" cy="262" rx="200" ry="74" class="p-shadow"/>';
    s += '<ellipse cx="210" cy="252" rx="198" ry="72" class="p-plate"/><ellipse cx="210" cy="250" rx="168" ry="58" class="p-rim"/>';
    s += '<g transform="translate(0 250) scale(1 .34) translate(0 -250)">' + crackle(210, 250, 150, r, 10) + '</g>';
    // фри горкой справа
    for (var f = 0; f < 26; f++) {
      var fx = 296 + (r() - 0.5) * 120, fy = 236 + (r() - 0.5) * 40 - (f > 14 ? 14 : 0), fa = (r() - 0.5) * 140;
      s += '<rect class="bg-fry" x="' + (fx - 34).toFixed(1) + '" y="' + (fy - 6).toFixed(1) + '" width="68" height="12" rx="4" transform="rotate(' + fa.toFixed(0) + ' ' + fx.toFixed(1) + ' ' + fy.toFixed(1) + ')"/>';
    }
    for (var sl = 0; sl < 10; sl++) { var sx = 250 + r() * 100, sy = 216 + r() * 40; s += '<rect class="c-salt" x="' + sx.toFixed(1) + '" y="' + sy.toFixed(1) + '" width="2.6" height="2.6"/>'; }
    // капля айоли с копчёной паприкой
    s += '<ellipse class="bg-aioli" cx="112" cy="282" rx="30" ry="11"/><circle class="bg-smoke" cx="104" cy="280" r="2"/><circle class="bg-smoke" cx="118" cy="283" r="1.6"/><circle class="bg-smoke" cx="112" cy="278" r="1.3"/>';
    // бургер
    s += '<path class="bg-bun" d="M92 236 h156 a8 8 0 0 1 8 8 v8 a12 12 0 0 1 -12 12 H96 a12 12 0 0 1 -12 -12 v-8 a8 8 0 0 1 8 -8 z"/>';
    s += '<path class="bg-sauce" d="M90 234 q 40 8 80 2 t 84 2 v4 H90 z"/>';
    [[110, 230], [150, 232], [196, 229], [236, 231]].forEach(function (p) { s += '<ellipse class="bg-pickle" cx="' + p[0] + '" cy="' + p[1] + '" rx="17" ry="5"/>'; });
    function patty(y) {
      var d = 'M80 ' + y;
      for (var x = 80; x <= 260; x += 12) d += ' L' + x + ' ' + (y + (r() - 0.5) * 4).toFixed(1);
      d += ' L262 ' + (y + 20) + ' L78 ' + (y + 20) + ' Z';
      return '<path class="bg-patty" d="' + d + '"/><path class="bg-crust" d="M82 ' + (y + 16) + ' Q 170 ' + (y + 22) + ' 258 ' + (y + 16) + '"/>';
    }
    function cheese(y) {
      return '<path class="bg-cheese" d="M84 ' + y + ' h172 l-6 6 q -4 18 -10 0 l-30 2 q -5 22 -12 0 l-40 0 q -6 26 -13 0 l-38 -2 q -4 14 -10 0 z"/>';
    }
    s += patty(208) + cheese(206) + patty(184) + cheese(182);
    s += '<path class="bg-onion" d="M88 182 q 12 -8 24 0 t 24 0 t 24 0 t 24 0 t 24 0 t 24 0 t 22 0" />';
    s += '<path class="bg-bun" d="M86 182 C 86 108, 254 108, 254 182 Z"/>';
    s += '<path class="bg-shine" d="M120 140 q 40 -26 92 -6"/>';
    s += '<path class="bg-aioli-in" d="M96 182 q 74 6 148 0"/>';
    return s + '</svg>';
  }

  function artWings() {
    var r = rng(57), s = '<svg viewBox="0 0 420 340" class="plating" role="img" aria-label="Аперитиво: крылья Баффало горкой в стеклянной миске, рядом белая миска с копчёным айоли">';
    s += '<ellipse cx="166" cy="182" rx="150" ry="146" class="p-shadow"/>';
    s += '<circle cx="162" cy="174" r="148" class="b-glass"/><circle cx="162" cy="174" r="132" class="bg-glass-in"/>';
    for (var w = 0; w < 16; w++) {
      var a = r() * 6.283, d = Math.sqrt(r()) * 92, x = 162 + Math.cos(a) * d, y = 174 + Math.sin(a) * d, rot = r() * 180 | 0;
      if (w % 2) {
        s += '<g transform="rotate(' + rot + ' ' + x.toFixed(1) + ' ' + y.toFixed(1) + ')"><path class="bg-wing" d="M' + (x - 30).toFixed(1) + ' ' + (y - 4).toFixed(1) + ' q 0 -16 18 -14 l 26 4 q 18 4 14 16 q -4 12 -20 10 l -26 -2 q -12 -2 -12 -14 z"/>' +
          '<path class="bg-wing-hl" d="M' + (x - 18).toFixed(1) + ' ' + (y - 10).toFixed(1) + ' q 14 -4 30 0"/></g>';
      } else {
        s += '<g transform="rotate(' + rot + ' ' + x.toFixed(1) + ' ' + y.toFixed(1) + ')"><ellipse class="bg-wing" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" rx="24" ry="15"/>' +
          '<rect class="bg-bone" x="' + (x + 18).toFixed(1) + '" y="' + (y - 4).toFixed(1) + '" width="16" height="8" rx="4"/>' +
          '<path class="bg-wing-hl" d="M' + (x - 14).toFixed(1) + ' ' + (y - 7).toFixed(1) + ' q 12 -5 24 0"/></g>';
      }
    }
    for (var p = 0; p < 30; p++) {
      var px = 162 + (r() - 0.5) * 200, py = 174 + (r() - 0.5) * 200;
      if (Math.hypot(px - 162, py - 174) < 120) s += '<circle class="bg-drip" cx="' + px.toFixed(1) + '" cy="' + py.toFixed(1) + '" r="' + (1.2 + r() * 2).toFixed(1) + '"/>';
    }
    // белая миска с айоли
    s += '<circle cx="348" cy="92" r="58" class="b-white"/><circle cx="348" cy="92" r="46" class="bg-aioli"/>';
    s += '<path class="bg-swirl" d="M326 90 q 22 -16 44 0 q -22 14 -32 2"/>';
    for (var k = 0; k < 14; k++) { var kx = 348 + (r() - 0.5) * 60, ky = 92 + (r() - 0.5) * 60; if (Math.hypot(kx - 348, ky - 92) < 38) s += '<circle class="bg-smoke" cx="' + kx.toFixed(1) + '" cy="' + ky.toFixed(1) + '" r="1.6"/>'; }
    return s + '</svg>';
  }

  /* ---------- шапка ---------- */
  var stage = $('#stage'), current = null;
  var progress = window.ProgressBar($('#progress'), {
    count: M.slides.length,
    labels: M.slides.map(function (s) { return s.short; }),
    onSelect: function (i) { go(i); }
  });

  function renderHeader() {
    var m = modeOf(state.guests);
    var modes = $('#modes');
    modes.innerHTML = '';
    MODES.forEach(function (md) {
      var b = h('button', 'mode-btn m-' + md.id, esc(md.label));
      b.type = 'button';
      b.setAttribute('aria-pressed', String(md.id === m));
      b.addEventListener('click', function () { setGuests(md.min); });
      modes.appendChild(b);
    });
    $('#gCount').textContent = state.guests;
  }
  function setGuests(g) {
    g = clamp(g, 1, 12);
    if (g === state.guests) return;
    state.guests = g; store.set('guests', g);
    renderHeader(); rerender();
  }
  $('#gMinus').addEventListener('click', function () { setGuests(state.guests - 1); });
  $('#gPlus').addEventListener('click', function () { setGuests(state.guests + 1); });

  /* ---------- слайды ---------- */
  function build(s) {
    var wrap = h('section', 'slide slide-' + s.type);
    var inner = h('div', 'slide-inner');
    wrap.appendChild(inner);
    ({ cover: buildCover, shop: buildShop, tools: buildTools, step: buildStep, serve: buildServe, final: buildFinal })[s.type](s, inner);
    return wrap;
  }

  /* ---------- правка текстов ---------- */
  var edits = store.get('edits', {});
  var editing = false;
  var SRC = {};
  function val(key) { return edits[key] != null ? edits[key] : SRC[key]; }
  function titleHtml(t) {
    var w = String(t).split(' ');
    if (w.length < 2) return '<span class="accent">' + esc(t) + '</span>';
    var last = w.pop();
    return esc(w.join(' ')) + '<br><span class="accent">' + esc(last) + '</span>';
  }
  function linesHtml(t) { if (/\n/.test(t)) return String(t).split('\n').map(esc).join('<br>'); return String(t).split(' ').map(esc).join(w2(t) ? '<br>' : ' '); }
  function w2(t) { return String(t).trim().split(/\s+/).length === 2; }
  function fmt(key, v) {
    if (key === 'title') return titleHtml(v);
    if (key === 'final.title') return linesHtml(v);
    return rich(v);
  }
  // E(key, исходник) — редактируемый текст; правки хранятся по рецепту
  function E(key, src) {
    SRC[key] = src;
    return '<span class="ed" data-ek="' + key + '">' + fmt(key, val(key)) + '</span>';
  }
  function effTitle() { SRC.title = M.title; return val('title'); }
  function applyEditable(root) {
    root.querySelectorAll('[data-ek]').forEach(function (el) {
      if (editing) { el.setAttribute('contenteditable', 'true'); el.setAttribute('spellcheck', 'false'); }
      else el.removeAttribute('contenteditable');
    });
  }
  stage.addEventListener('focusin', function (e) {
    var el = e.target.closest && e.target.closest('[data-ek]');
    if (!editing || !el) return;
    el.textContent = val(el.getAttribute('data-ek'));
    el.classList.add('ed-on');
  });
  stage.addEventListener('focusout', function (e) {
    var el = e.target.closest && e.target.closest('[data-ek]');
    if (!editing || !el) return;
    var k = el.getAttribute('data-ek');
    var v = el.innerText.replace(/\s+/g, ' ').trim();
    if (!v || v === SRC[k]) delete edits[k]; else edits[k] = v;
    store.set('edits', edits);
    el.classList.remove('ed-on');
    el.innerHTML = fmt(k, val(k));
    if (k === 'title') syncTitle();
  });
  stage.addEventListener('keydown', function (e) {
    if (editing && e.key === 'Enter' && e.target.closest && e.target.closest('[data-ek]')) { e.preventDefault(); e.target.blur(); }
  });
  // в режиме правки тап по тексту не жмёт кнопки и галочки под ним
  stage.addEventListener('click', function (e) {
    if (editing && e.target.closest && e.target.closest('[data-ek]')) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  function syncTitle() { $('#brand').textContent = effTitle(); document.title = 'Кукинг · ' + effTitle(); }

  var editBtn = $('#editBtn'), editBar = $('#editBar'), resetArm = 0;
  function setEditing(on) {
    editing = on;
    document.body.classList.toggle('editing', on);
    editBtn.setAttribute('aria-pressed', String(on));
    editBar.hidden = !on;
    if (!on && document.activeElement && document.activeElement.blur) document.activeElement.blur();
    if (current) applyEditable(current);
  }
  editBtn.addEventListener('click', function () { setEditing(!editing); });
  $('#editDone').addEventListener('click', function () { setEditing(false); });
  $('#editReset').addEventListener('click', function () {
    var b = $('#editReset');
    if (!resetArm) {
      b.textContent = 'Точно? Жми ещё раз';
      resetArm = setTimeout(function () { resetArm = 0; b.textContent = 'Вернуть всё как было'; }, 3000);
      return;
    }
    clearTimeout(resetArm); resetArm = 0; b.textContent = 'Вернуть всё как было';
    edits = {}; store.set('edits', edits); syncTitle(); rerender();
  });

  function buildCover(s, el) {
    var per = M.dishes.reduce(function (a, d) { return { kcal: a.kcal + d.kcal, p: a.p + d.p, f: a.f + d.f, c: a.c + d.c }; }, { kcal: 0, p: 0, f: 0, c: 0 });
    var m = modeOf(state.guests);
    var hint = m === 'friends' || M.mode !== 'friends' ? '' : '<p class="note">Меню заточено под друзей. На ' + state.guests + ' — всё пересчитается, а шаги сольются в одно окно: весь движ на тебе.</p>';
    effTitle();
    el.innerHTML =
      '<p class="eyebrow">' + E('tagline', M.tagline) + '</p>' +
      '<h1 class="display">' + E('title', M.title) + '</h1>' +
      '<p class="lede">' + E('cover.lede', s.lede) + '</p>' + hint +
      (m === 'friends' && hasLanes() ? '<section class="card crew"><h3 class="label">Кто у плиты</h3><div class="seg crew-seg" role="radiogroup">' +
        '<button type="button" role="radio" data-crew="duo" aria-checked="' + !state.solo + '">Шеф + су-шеф</button><button type="button" role="radio" data-crew="solo" aria-checked="' + state.solo + '">Готовлю один</button></div>' +
        '<p class="small crew-h">' + (state.solo ? 'Все шаги в одну колонку, подряд — ничего не потеряется.' : 'Шаги делятся на двоих: шеф — соусы и блендер, су-шеф — нож и плита.') + '</p></section>' : '') +
      '<div class="cover-grid">' +
      '<section class="card"><h3 class="label">Меню</h3><ol class="menu-list">' +
      M.dishes.map(function (d, i) { return '<li><span class="dish">' + E('dish.' + i + '.name', d.name) + '</span><span class="dish-desc">' + E('dish.' + i + '.desc', d.desc) + '</span></li>'; }).join('') +
      '</ol></section>' +
      '<section class="card"><h3 class="label">План · ' + esc(M.totalTime) + '</h3><ol class="phases">' +
      M.phases.map(function (p, i) { return '<li><span class="ph-t">' + p.t + '</span><span>' + E('phase.' + i, p.name) + '</span></li>'; }).join('') +
      '</ol></section>' +
      '<section class="card kbju"><h3 class="label">На одного, примерно</h3>' +
      '<div class="kcal"><span class="kcal-n">≈ ' + per.kcal + '</span><span class="kcal-u">ккал</span></div>' +
      '<div class="macros"><span class="mac mac-p">Б ' + per.p + ' г</span><span class="mac mac-f">Ж ' + per.f + ' г</span><span class="mac mac-c">У ' + per.c + ' г</span></div>' +
      '<p class="small">На всех ' + state.guests + ': ≈ ' + (per.kcal * state.guests).toLocaleString('ru-RU') + ' ккал. Коктейли (~180 ккал за стакан) не считаем — это святое.</p>' +
      '<table class="kt"><tbody>' + M.dishes.map(function (d, i) { return '<tr><td>' + esc(val('dish.' + i + '.name')) + '</td><td>' + d.kcal + '</td></tr>'; }).join('') + '</tbody></table>' +
      '</section></div>' +
      '<p class="start-hint">Жми «Далее» или длинно свайпай влево →</p>';
    el.querySelectorAll('[data-crew]').forEach(function (b) { b.addEventListener('click', function () { setCrew(b.getAttribute('data-crew') === 'solo'); }); });
  }
  function setCrew(solo) {
    if (state.solo === solo) return;
    state.solo = solo; store.set('crew', solo ? 'solo' : 'duo'); if (window.kHaptic) window.kHaptic(8); syncSous(); rerender();
  }

  function buildShop(s, el) {
    var items = M.ingredients.filter(function (i) { return !i.hidden; });
    var k = 's' + state.idx;
    el.innerHTML = '<p class="eyebrow">Шаг 1 · до похода в магазин</p><h2 class="step-title">' + E(k + '.title', s.title) + ' <span class="for">на ' + state.guests + '</span></h2>' +
      '<div class="shop-top"><div class="counter" id="shopCount"></div><button type="button" class="ghost-btn" id="shopReset">Сбросить отметки</button></div>' +
      '<div class="send-row"><span class="send-l">Скинуть чего нет:</span>' +
      '<a class="send-btn send-tg" id="sendTg" href="#" target="_blank" rel="noopener">В Telegram</a>' +
      '<button type="button" class="send-btn send-ghost" id="sendCopy">Скопировать</button></div>' +
      '<p class="note">' + E(k + '.note', s.note) + '</p>';
    var grid = h('div', 'shop-grid tiles'), ci = 0;
    M.groups.forEach(function (g, gi) {
      var list = items.filter(function (i) { return i.g === gi; });
      if (!list.length) return;
      var card = h('section', 'shop-zone');
      card.innerHTML = '<h3 class="label">' + E('group.' + gi, g) + '</h3>';
      var ul = h('ul', 'chk-list');
      list.forEach(function (i) {
        var b = h('li', 'chk' + (state.have[i.id] ? ' on' : ''));
        b.setAttribute('role', 'checkbox'); b.tabIndex = 0; b.style.setProperty('--i', ci++);
        b.setAttribute('aria-checked', String(!!state.have[i.id]));
        b.innerHTML = '<span class="chk-box" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 12.5l4 4 8-9"/></svg></span>' +
          '<span class="chk-name">' + E('ing.' + i.id, i.name) + (i.buy ? '<span class="badge-buy">докупить</span>' : '') + '</span><span class="chk-am">' + esc(qty(i.id)) + '</span>';
        function flip() {
          state.have[i.id] = !state.have[i.id]; store.set('have', state.have);
          b.classList.toggle('on', state.have[i.id]); b.setAttribute('aria-checked', String(state.have[i.id])); count();
          if (state.have[i.id] && items.every(function (x) { return state.have[x.id]; })) shopDone(); else shopCancel();
        }
        b.addEventListener('click', function (e) { if (!editing && !e.target.closest('[contenteditable=true]')) flip(); });
        b.addEventListener('keydown', function (e) { if (editing || e.target !== b) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } });
        ul.appendChild(b);
      });
      card.appendChild(ul);
      grid.appendChild(card);
    });
    el.appendChild(grid);
    function count() {
      var n = items.filter(function (i) { return state.have[i.id]; }).length;
      el.querySelector('#shopCount').innerHTML = '<span class="cn">' + n + '</span> из ' + items.length + ' есть' + (n === items.length ? ' · <b>затарились, красавцы</b>' : '');
    }
    /* список «чего нет» текстом: для Telegram, заметок и буфера */
    function listText() {
      var src = items.filter(function (i) { return !state.have[i.id]; });
      if (!src.length) return '';
      var out = ['Продукты:'];
      M.groups.forEach(function (g, gi) {
        src.filter(function (i) { return i.g === gi; }).forEach(function (i) {
          var q = qty(i.id);
          out.push('• ' + (val('ing.' + i.id) || i.name) + (q ? ' — ' + q : ''));
        });
      });
      return out.join('\n').trim();
    }
    function toast(msg) {
      var t = document.querySelector('.send-toast'); if (t) t.remove();
      t = h('div', 'send-toast', esc(msg)); t.setAttribute('role', 'status');
      document.body.appendChild(t);
      requestAnimationFrame(function () { t.classList.add('on'); });
      setTimeout(function () { t.classList.remove('on'); setTimeout(function () { t.remove(); }, 400); }, 2600);
    }
    function copy(text, ok) {
      function legacy() {
        var ta = h('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0';
        document.body.appendChild(ta); ta.select();
        var done = false; try { done = document.execCommand('copy'); } catch (e) {}
        ta.remove(); toast(done ? ok : 'Не дали скопировать. Выдели список руками, братан');
      }
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { toast(ok); }, legacy);
        else legacy();
      } catch (e) { legacy(); }
    }
    var tg = el.querySelector('#sendTg');
    var EMPTY = 'Всё отмечено — покупать нечего, хата затарена';
    /* сразу в приложение Telegram (tg://): обычная ссылка в новом окне, страницу саму не уводим — иначе белый экран */
    function tgHref() { var t = listText(); tg.href = t ? 'tg://msg?text=' + encodeURIComponent(t) : '#'; }
    tg.addEventListener('pointerdown', tgHref);
    tg.addEventListener('focus', tgHref);
    tg.addEventListener('click', function (e) {
      tgHref();
      if (!listText()) { e.preventDefault(); toast(EMPTY); return; }
      toast('Открываю Telegram — выбирай «Избранное»');
    });
    el.querySelector('#sendCopy').addEventListener('click', function () {
      var t = listText();
      if (!t) { toast(EMPTY); return; }
      copy(t, 'Список в буфере, как малява за пазухой');
    });
    el.querySelector('#shopReset').addEventListener('click', function () {
      state.have = {}; store.set('have', {});
      el.querySelectorAll('.chk').forEach(function (c) { c.classList.remove('on'); c.setAttribute('aria-checked', 'false'); }); count(); shopCancel();
    });
    /* всё есть — короткая плашка и сам переход дальше, как в посуде */
    var shopT = 0, shopAt = state.idx;
    function shopCancel() { clearTimeout(shopT); dropHud(); }
    function shopDone() {
      shopCancel();
      var calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (navigator.vibrate) { try { navigator.vibrate([20, 40, 20]); } catch (e) {} }
      showHud('Всё на месте', 'Теперь посуда', 'продукты собраны', calm ? 900 : 1000);
      shopT = setTimeout(function () { if (state.idx === shopAt) go(shopAt + 1, 1); setTimeout(dropHud, 150); }, calm ? 900 : 1000);
    }
    count();
  }

  /* плашка «готово → дальше»: появляется быстро, галка рисуется, полоска показывает, когда перелистнёт */
  function showHud(kicker, title, sub, ms) {
    dropHud();
    var bn = h('div', 'done-hud'); bn.setAttribute('role', 'status');
    bn.innerHTML = '<span class="dh-check" aria-hidden="true"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="23"/><path d="M15 27l7 7 15-16"/></svg></span>' +
      '<span class="dh-k">' + kicker + '</span><span class="dh-t">' + title + '</span><span class="dh-s">' + sub + '</span><span class="dh-bar"><i style="animation-duration:' + ms + 'ms"></i></span>';
    bn.addEventListener('click', dropHud);
    document.body.appendChild(bn);
    requestAnimationFrame(function () { bn.classList.add('on'); });
    return bn;
  }
  function dropHud() { document.querySelectorAll('.done-hud').forEach(function (n) { n.classList.remove('on'); setTimeout(function () { n.remove(); }, 260); }); }

  function buildTools(s, el) {
    var all = [], k = 's' + state.idx;
    M.tools.forEach(function (z) { all = all.concat(z.items); });
    el.innerHTML = '<p class="eyebrow">Шаг 2 · до первого ножа</p><h2 class="step-title">' + E(k + '.title', s.title) + '</h2>' +
      '<div class="shop-top"><div class="counter" id="toolCount"></div><button type="button" class="ghost-btn" id="toolReset">Убрать всё обратно</button></div>' +
      '<p class="note">' + E(k + '.note', s.note) + '</p>';
    var ci = 0, goT = null, slideAt = state.idx;
    var fxT = [], flyers = [];
    function onNav() { cancelGo(); }
    function clearFx() {
      clearTimeout(goT); fxT.forEach(clearTimeout); fxT = [];
      ['#prev', '#next'].forEach(function (q) { var n = $(q); if (n) n.removeEventListener('click', onNav); });
    }
    function dropBanner() {
      document.querySelectorAll('.tools-go, .tools-sweep').forEach(function (n) { n.classList.remove('on'); setTimeout(function () { n.remove(); }, 800); }); dropHud();
      flyers.forEach(function (f) { f.remove(); }); flyers = [];
      el.classList.remove('flown');
    }
    /* ячейки «вырываются» и хаотично летают вокруг плашки */
    function breakLoose() {
      var cards = Array.prototype.slice.call(el.querySelectorAll('.tool-card'));
      var vw = innerWidth, vh = innerHeight, cx = vw / 2, cy = vh / 2, n = cards.length;
      var rx = Math.min(vw * 0.4, 460), ry = Math.min(vh * 0.36, 300);
      var sc = vw < 600 ? 0.42 : 0.6;
      cards.forEach(function (c, i) {
        var r = c.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) { r = { left: cx - 110, top: vh + 40, width: 220, height: r.height || 80 }; }
        var f = c.cloneNode(true);
        f.classList.add('fly');
        f.removeAttribute('tabindex'); f.setAttribute('aria-hidden', 'true');
        f.style.left = r.left + 'px'; f.style.top = r.top + 'px'; f.style.width = r.width + 'px'; f.style.height = r.height + 'px';
        f.style.zIndex = Math.random() < 0.5 ? 44 : 46;
        document.body.appendChild(f); flyers.push(f);
        var ox = r.left + r.width / 2, oy = r.top + r.height / 2;
        var a = i / n * Math.PI * 2 + Math.random() * 0.8, dir = Math.random() < 0.5 ? -1 : 1;
        var kf = [{ transform: 'translate(0px,0px) rotate(0deg) scale(1)', opacity: 1 }];
        var hops = 6;
        for (var k = 1; k <= hops; k++) {
          a += dir * (0.7 + Math.random() * 0.9);
          if (Math.random() < 0.25) dir = -dir;
          var j = 0.75 + Math.random() * 0.45;
          var x = cx + Math.cos(a) * rx * j - ox, y = cy + Math.sin(a) * ry * j - oy;
          kf.push({ transform: 'translate(' + x.toFixed(0) + 'px,' + y.toFixed(0) + 'px) rotate(' + ((Math.random() * 50 - 25) | 0) + 'deg) scale(' + (sc + Math.random() * 0.12).toFixed(2) + ')', opacity: 1 });
        }
        kf.push({ transform: 'translate(' + (cx - ox).toFixed(0) + 'px,' + (cy - oy).toFixed(0) + 'px) rotate(' + ((Math.random() * 180 - 90) | 0) + 'deg) scale(0.15)', opacity: 0 });
        f.animate(kf, { duration: 3300, delay: i * 35, easing: 'ease-in-out', fill: 'both' });
      });
      el.classList.add('flown');
    }
    function celebrate() {
      clearFx(); dropBanner();
      var calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      ['#prev', '#next'].forEach(function (q) { var n = $(q); if (n) n.addEventListener('click', onNav); });
      if (navigator.vibrate) { try { navigator.vibrate([30, 60, 30]); } catch (e) {} }
      showHud('Арсенал собран', 'Погнали резать', 'ножи наточены, доски на месте', calm ? 900 : 1300);
      goT = setTimeout(function () {
        clearFx();
        if (state.idx === slideAt) go(slideAt + 1, 1);
        setTimeout(dropBanner, 200);
      }, calm ? 900 : 1300);
    }
    function cancelGo() { clearFx(); el.classList.remove('all-set'); dropBanner(); }
    M.tools.forEach(function (z, zi) {
      var sec = h('section', 'tool-zone');
      sec.innerHTML = '<h3 class="label">' + E('zone.' + zi, z.zone) + '</h3>';
      var grid = h('div', 'tool-grid');
      z.items.forEach(function (t) {
        var b = h('div', 'tool-card' + (state.picked[t.id] ? ' got' : ''));
        b.setAttribute('role', 'button');
        b.style.setProperty('--i', ci++);
        b.tabIndex = 0;
        b.setAttribute('aria-pressed', String(!!state.picked[t.id]));
        b.innerHTML = '<span class="tc-ico">' + ico(t.icon) + '</span><span class="tc-txt"><span class="tc-name">' + E('tool.' + t.id + '.name', t.name) + '</span><span class="tc-use">' + E('tool.' + t.id + '.use', t.use) + '</span></span>';
        function flip() {
          state.picked[t.id] = !state.picked[t.id]; store.set('picked', state.picked);
          b.classList.toggle('got', state.picked[t.id]); b.setAttribute('aria-pressed', String(state.picked[t.id])); count();
          if (state.picked[t.id] && all.every(function (x) { return state.picked[x.id]; })) celebrate(); else cancelGo();
        }
        b.addEventListener('click', function () { if (!editing) flip(); });
        b.addEventListener('keydown', function (e) {
          if (editing || e.target !== b) return;
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); }
        });
        grid.appendChild(b);
      });
      sec.appendChild(grid);
      el.appendChild(sec);
    });
    function count() {
      var n = all.filter(function (t) { return state.picked[t.id]; }).length;
      el.querySelector('#toolCount').innerHTML = '<span class="cn">' + n + '</span> из ' + all.length + ' на столе' + (n === all.length ? ' · <b>арсенал собран</b>' : '');
    }
    el.querySelector('#toolReset').addEventListener('click', function () {
      state.picked = {}; store.set('picked', {});
      el.querySelectorAll('.tool-card').forEach(function (c) { c.classList.remove('got'); c.setAttribute('aria-pressed', 'false'); }); count(); cancelGo();
    });
    count();
  }

  var ROLE = {
    chef: { name: 'Шеф', sub: 'соусы, блендер, понты' },
    sous: { name: 'Су-шеф', sub: 'нож, плита, движ' },
    both: { name: 'Вместе', sub: 'все за барной стойкой' },
    you: { name: 'Ты', sub: 'весь движ на тебе' }
  };
  function roleName(r) { SRC['role.' + r] = ROLE[r].name; return val('role.' + r); }

  function laneEl(role, actions, closable) {
    var L = h('section', 'lane lane-' + role);
    L.innerHTML = '<header class="lane-head"><span class="role">' + E('role.' + role, ROLE[role].name) + '</span><span class="role-sub">' + E('role.' + role + '.sub', ROLE[role].sub) + '</span>' +
      (closable ? '<button type="button" class="lane-close">Скрыть</button>' : '') + '</header>';
    if (closable) L.querySelector('.lane-close').addEventListener('click', function () { toggleLane(role, false); });
    var ol = h('ol', 'actions');
    actions.forEach(function (a) {
      if (a.divider) { ol.appendChild(h('li', 'act-div', esc(a.divider))); return; }
      var li = h('li', 'act');
      li.innerHTML = '<div class="act-text">' + E(a._k, a.t) + '</div>' + (a.tool ? '<span class="tool-chip">' + ico('pin') + E(a._k + '.tool', a.tool) + '</span>' : '') +
        (a.cut && window.Cuts && SKILL <= 6 ? window.Cuts.html(a.cut) : '') +
        (a.how && SKILL <= 5 ? '<details class="act-how"' + (SKILL <= 3 ? ' open' : '') + '><summary>Как это сделать</summary><p>' + E(a._k + '.how', a.how) + '</p></details>' : '') +
        (a.clean ? '<p class="act-clean"><b>Уборка</b> ' + E(a._k + '.clean', a.clean) + '</p>' : '');
      if (a.timer) {
        var box = h('div', 'act-timer');
        li.appendChild(box);
        window.RingTimer.mount(box, { id: a.timer.id, sec: a.timer.sec != null ? a.timer.sec : a.timer.min * 60, label: a.timer.label, slide: state.idx });
      }
      /* тап по действию — сделано: гаснет, номер становится галкой */
      var dk = M.id + ':' + a._k; if (doneActs[dk]) li.classList.add('done');
      li.addEventListener('click', function (e) {
        if (editing || e.target.closest('button, a, details, summary, input, [contenteditable=true], .ring-timer, .act-timer')) return;
        doneActs[dk] = !doneActs[dk]; if (!doneActs[dk]) delete doneActs[dk];
        li.classList.toggle('done', !!doneActs[dk]); try { localStorage.setItem('kuking:done', JSON.stringify(doneActs)); } catch (x) {}
      });
      ol.appendChild(li);
    });
    L.appendChild(ol);
    return L;
  }
  function keyed(list, prefix) { return (list || []).map(function (a, i) { var o = {}; for (var p in a) o[p] = a[p]; o._k = prefix + '.' + i; return o; }); }
  function visibleActs(list) { return (list || []).filter(function (a) { return !a.minGuests || state.guests >= a.minGuests; }); }
  function toggleLane(role, on) {
    var other = role === 'chef' ? 'sous' : 'chef';
    if (!on && !state.lanes[other]) return;
    state.lanes[role] = on; store.set('lanes', state.lanes); rerender();
  }

  function buildStep(s, el) {
    var friends = modeOf(state.guests) === 'friends', k = 's' + state.idx;
    el.innerHTML = '<div class="step-meta"><span class="pill pill-time">' + esc(s.time) + '</span><span class="pill">' + esc(s.dur) + '</span></div>' +
      '<h2 class="step-title">' + E(k + '.title', s.title) + '</h2>';
    var lanes = h('div', 'lanes');
    if (s.both) {
      lanes.classList.add('one');
      lanes.appendChild(laneEl(friends ? 'both' : 'you', visibleActs(keyed(s.both, k + '.both')), false)); // соло-режимы: «Ты»
    } else if (!friends || state.solo) {
      lanes.classList.add('one');
      var sousActs = visibleActs(keyed(s.lanes.sous || [], k + '.sous'));
      var acts = visibleActs(keyed(s.lanes.chef || [], k + '.chef')).concat(sousActs.length ? [{ divider: 'Дальше — то, что делал бы ' + roleName('sous').toLowerCase() }] : [], sousActs);
      lanes.appendChild(laneEl('you', acts, false));
    } else {
      var show = ['chef', 'sous'].filter(function (r) { return state.lanes[r]; });
      if (show.length === 1) lanes.classList.add('one');
      show.forEach(function (r) { lanes.appendChild(laneEl(r, visibleActs(keyed(s.lanes[r], k + '.' + r)), true)); });
      ['chef', 'sous'].filter(function (r) { return !state.lanes[r]; }).forEach(function (r) {
        var pill = h('button', 'lane-restore', 'Показать: ' + esc(roleName(r)));
        pill.type = 'button';
        pill.addEventListener('click', function () { toggleLane(r, true); });
        el.appendChild(pill);
      });
    }
    el.appendChild(lanes);
    if (s.joke) el.appendChild(h('p', 'joke', '<span class="joke-k">к слову</span>' + E(k + '.joke', s.joke)));
  }

  function buildServe(s, el) {
    var k = 's' + state.idx;
    el.innerHTML = '<p class="eyebrow">Подача</p><h2 class="step-title">' + E(k + '.title', s.title) + '</h2>';
    var g = h('div', 'serve-grid');
    var art = s.art === 'main' ? artMain() : s.art === 'chicken' ? artChicken() : s.art === 'burger' ? artBurger() : s.art === 'wings' ? artWings() : s.art === 'pasta' ? artPasta() : artAperitivo();
    var fig = h('figure', 'serve-fig' + (s.variant ? ' v-' + s.variant : ''), art);
    var txt = h('div', 'serve-txt');
    txt.innerHTML = '<div class="dish-tags">' + s.dishes.map(function (d, i) { return '<span class="tool-chip">' + E(k + '.dish.' + i, d) + '</span>'; }).join('') + '</div>' +
      '<ul class="serve-points">' + s.points.map(function (p, i) { return '<li>' + E(k + '.pt.' + i, p) + '</li>'; }).join('') + '</ul>';
    g.appendChild(fig); g.appendChild(txt);
    el.appendChild(g);
  }

  /* финал под то, как готовили: для себя, романтика, друзья вдвоём или повар один — и никогда не повторяется */
  var finCache = {};
  function finKind() { var m = modeOf(state.guests); return m === 'friends' ? (hasLanes() && !state.solo ? 'duo' : 'crew') : m; }
  function buildFinal(s, el) {
    var fk = M.id + ':' + finKind(), f = finCache[fk] || (finCache[fk] = window.KFun ? window.KFun.finale(finKind()) : { top: 'Шеф отработал', title: 'Приятного аппетита', sub: '' });
    el.innerHTML = '<div class="final">' +
      '<p class="eyebrow">' + esc(f.top) + '</p>' +
      '<h2 class="final-title">' + linesHtml(f.title) + '</h2>' +
      '<p class="final-sub">' + esc(f.sub) + '</p>' +
      '<div class="final-btns"><button type="button" class="nav-btn primary" id="again">Ещё салют</button><button type="button" class="nav-btn" id="toStart">К меню</button></div></div>';
    el.querySelector('#again').addEventListener('click', function () { window.Confetti.fire({ anchor: el.querySelector('.final-title') }); });
    el.querySelector('#toStart').addEventListener('click', function () { go(0); });
  }

  /* ---------- навигация ---------- */
  function updateNav() {
    var s = M.slides[state.idx];
    $('#slideLabel').innerHTML = '<span class="sl-n">' + (state.idx + 1) + ' / ' + M.slides.length + '</span><span class="sl-t">' + esc(s.short) + '</span>';
    $('#prev').disabled = state.idx === 0;
    $('#next').disabled = state.idx === M.slides.length - 1;
  }
  function go(i, dir) {
    if (i < 0 || i >= M.slides.length) return;
    if (current && i === state.idx) return;
    var d = dir != null ? dir : (i > state.idx ? 1 : -1);
    var nav = !!current; // салют только при переходе, не при открытии/перезагрузке
    state.idx = i; store.set('idx', i);
    var el = build(M.slides[i]);
    applyEditable(el);
    window.SlideTransition.run(stage, current, el, current ? d : 0);
    current = el;
    progress.update(i); updateNav(); renderDock();
    if (nav && M.slides[i].type === 'final') {
      setTimeout(function () { if (current === el) window.Confetti.fire({ anchor: el.querySelector('.final-title') }); }, 380);
    }
  }
  /* друзья: готовлю с су-шефом или один — один получает обе колонки подряд */
  var sousBtn = $('#sousBtn');
  function hasLanes() { return (M.slides || []).some(function (x) { return x.type === 'step' && x.lanes; }); }
  function syncSous() {
    if (!sousBtn) return;
    var show = modeOf(state.guests) === 'friends' && hasLanes();
    sousBtn.hidden = !show;
    sousBtn.setAttribute('aria-pressed', String(!state.solo));
    sousBtn.querySelector('span').textContent = state.solo ? 'Готовлю один' : 'С су-шефом';
  }
  if (sousBtn) sousBtn.addEventListener('click', function () { setCrew(!state.solo); });
  function rerender() {
    syncSous();
    if (!current) return;
    var st = current.scrollTop, el = build(M.slides[state.idx]);
    applyEditable(el);
    stage.replaceChild(el, current);
    current = el; el.scrollTop = st;
    renderDock();
  }
  $('#prev').addEventListener('click', function () { go(state.idx - 1, -1); });
  $('#next').addEventListener('click', function () { go(state.idx + 1, 1); });

  document.addEventListener('keydown', function (e) {
    if (e.target && (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.isContentEditable)) return;
    if (!$('#library').hidden) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { go(state.idx + 1, 1); e.preventDefault(); }
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') { go(state.idx - 1, -1); e.preventDefault(); }
  });

  // свайпы: только пальцем, длинный и уверенный жест, не при выделенном тексте и не в режиме правки
  var sw = null;
  stage.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse' || editing) { sw = null; return; }
    sw = { x: e.clientX, y: e.clientY, t: Date.now() };
  });
  stage.addEventListener('pointerup', function (e) {
    if (!sw) return;
    var dx = e.clientX - sw.x, dy = e.clientY - sw.y, dt = Date.now() - sw.t; sw = null;
    var need = Math.max(120, stage.clientWidth * 0.3);
    var sel = window.getSelection && String(window.getSelection());
    if (sel || dt > 800 || Math.abs(dx) < need || Math.abs(dx) < Math.abs(dy) * 2.2) return;
    if (dx < 0) go(state.idx + 1, 1); else go(state.idx - 1, -1);
  });
  stage.addEventListener('pointercancel', function () { sw = null; });

  /* ---------- док таймеров (видно с других слайдов) ---------- */
  var dock = $('#timerDock');
  function renderDock() {
    var list = window.RingTimer.all().filter(function (t) {
      var alive = t.running || t.ringing || (t.remaining > 0 && t.remaining < t.total);
      return alive && t.slide !== state.idx;
    });
    dock.innerHTML = '';
    list.forEach(function (t) {
      var c = h('div', 'dock-chip' + (t.ringing ? ' ringing' : '') + (t.running ? '' : ' paused'));
      c.innerHTML = '<button type="button" class="dock-go"><span class="dock-l">' + esc(t.label) + '</span><span class="dock-t" data-id="' + t.id + '"></span></button>' +
        '<button type="button" class="dock-stop">Стоп</button>';
      c.querySelector('.dock-go').addEventListener('click', function () { go(t.slide); });
      c.querySelector('.dock-stop').addEventListener('click', function () { window.RingTimer.stop(t.id); });
      dock.appendChild(c);
    });
    tickDock();
  }
  function tickDock() {
    dock.querySelectorAll('.dock-t').forEach(function (n) {
      var t = window.RingTimer.get(n.getAttribute('data-id'));
      if (t) n.textContent = window.RingTimer.fmt(window.RingTimer.left(t));
    });
  }
  window.RingTimer.onChange(renderDock);
  window.RingTimer.onTick(tickDock);

  /* ---------- экран не гаснет + полноэкранный режим ---------- */
  var lock = null;
  function wake() {
    try { if ('wakeLock' in navigator && !lock) navigator.wakeLock.request('screen').then(function (l) { lock = l; l.addEventListener('release', function () { lock = null; }); }).catch(function () {}); } catch (e) {}
  }
  document.addEventListener('pointerdown', wake, { once: true });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') wake(); });

  var fsBtn = $('#fsBtn');
  if (!document.fullscreenEnabled) fsBtn.hidden = true;
  fsBtn.addEventListener('click', function () {
    try {
      var p = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
      if (p && p.catch) p.catch(function () {});
    } catch (e) {}
  });

  syncTitle(); syncSous();
  renderHeader();
  go(state.idx, 0);
})();
