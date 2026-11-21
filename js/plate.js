/* Кукинг: подача — детальная схема тарелки сверху с номерами слоёв.
   plate = { vessel: 'bowl'|'plate'|'board'|'skillet', color?, layers: [ {
     what: 'Рис', shape: 'base'|'sector'|'mound'|'drizzle'|'scatter'|'sticks'|'dollop'|'fan'|'ring'|'taco'|'ramekin'|'wedge'|'quenelle'|'flat',
     item: 'grain'|'cube'|'ring'|'leaf'|'strip'|'chunk'|'slice'|'tri'|'dot'|'noodle'|'smooth'|'sauce',
     color: '#hex', from?: градусы, to?: градусы, r?: 0..1 (доля радиуса), at?: градусы (для dollop/sticks), n?: кол-во } ] } */
(function () {
  var NS = 'http://www.w3.org/2000/svg';
  function rnd(seed) { var s = seed >>> 0 || 1; return function () { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  function hash(t) { var h = 2166136261; for (var i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function shade(hex, k) { // k<0 темнее, k>0 светлее
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return hex || '#ccc';
    var n = parseInt(m[1], 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    function f(c) { return Math.max(0, Math.min(255, Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k))); }
    return '#' + ((1 << 24) + (f(r) << 16) + (f(g) << 8) + f(b)).toString(16).slice(1);
  }
  var DEF = { grain: '#f1e7d0', cube: '#7fb069', ring: '#c25b8a', leaf: '#4f9a3c', strip: '#b5672c', chunk: '#a8582a', slice: '#c0763e', tri: '#d9a35a', dot: '#e94f37', noodle: '#e8c77a', smooth: '#e9d6a7', sauce: '#f4efe6' };
  var C = 200, R0 = 150; // центр и внутренний радиус посуды

  function pol(a, r) { var t = (a - 90) * Math.PI / 180; return [C + Math.cos(t) * r, C + Math.sin(t) * r]; }
  function inSector(p, L, R) { // точка внутри сектора/круга?
    var dx = p[0] - C, dy = p[1] - C, d = Math.sqrt(dx * dx + dy * dy); if (d > R) return false;
    if (L.from == null) return true;
    var a = (Math.atan2(dy, dx) * 180 / Math.PI + 90 + 360) % 360, f = (L.from + 360) % 360, t = (L.to + 360) % 360;
    return f <= t ? a >= f && a <= t : a >= f || a <= t;
  }
  function piece(item, x, y, rot, s, col, rn) {
    var d = shade(col, -0.28), l = shade(col, 0.22), tr = 'translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ') rotate(' + rot.toFixed(0) + ')';
    switch (item) {
      case 'grain': return '<ellipse transform="' + tr + '" rx="' + (3.2 * s).toFixed(1) + '" ry="' + (1.3 * s).toFixed(1) + '" fill="' + (rn() < .5 ? col : l) + '" stroke="' + d + '" stroke-width=".4"/>';
      case 'cube': return '<g transform="' + tr + '"><rect x="' + (-5 * s) + '" y="' + (-5 * s) + '" width="' + (10 * s) + '" height="' + (10 * s) + '" rx="' + (1.5 * s) + '" fill="' + col + '" stroke="' + d + '" stroke-width=".8"/><rect x="' + (-3 * s) + '" y="' + (-3.4 * s) + '" width="' + (4 * s) + '" height="' + (2.4 * s) + '" rx="1" fill="' + l + '" opacity=".7"/></g>';
      case 'ring': return '<g transform="' + tr + '"><ellipse rx="' + (11 * s) + '" ry="' + (6 * s) + '" fill="none" stroke="' + col + '" stroke-width="' + (2.6 * s) + '"/><ellipse rx="' + (11 * s) + '" ry="' + (6 * s) + '" fill="none" stroke="' + l + '" stroke-width="' + (0.8 * s) + '" opacity=".7"/></g>';
      case 'leaf': return '<g transform="' + tr + '"><path d="M0 ' + (-7 * s) + 'C' + (5 * s) + ' ' + (-3 * s) + ' ' + (5 * s) + ' ' + (3 * s) + ' 0 ' + (7 * s) + 'C' + (-5 * s) + ' ' + (3 * s) + ' ' + (-5 * s) + ' ' + (-3 * s) + ' 0 ' + (-7 * s) + 'z" fill="' + col + '"/><path d="M0 ' + (-6 * s) + 'V' + (6 * s) + '" stroke="' + d + '" stroke-width=".7"/></g>';
      case 'strip': return '<g transform="' + tr + '"><rect x="' + (-14 * s) + '" y="' + (-3.6 * s) + '" width="' + (28 * s) + '" height="' + (7.2 * s) + '" rx="' + (3.4 * s) + '" fill="' + col + '" stroke="' + d + '" stroke-width=".8"/><path d="M' + (-11 * s) + ' ' + (-1 * s) + 'h' + (8 * s) + 'M' + (2 * s) + ' ' + (1.5 * s) + 'h' + (9 * s) + '" stroke="' + d + '" stroke-width="' + (1.6 * s) + '" stroke-linecap="round" opacity=".75"/><path d="M' + (-12 * s) + ' ' + (-2.6 * s) + 'h' + (22 * s) + '" stroke="' + l + '" stroke-width=".8" opacity=".6"/></g>';
      case 'chunk': return '<g transform="' + tr + '"><path d="M' + (-9 * s) + ' ' + (-6 * s) + 'L' + (7 * s) + ' ' + (-8 * s) + 'L' + (10 * s) + ' ' + (5 * s) + 'L' + (-4 * s) + ' ' + (9 * s) + 'L' + (-11 * s) + ' ' + (3 * s) + 'z" fill="' + col + '" stroke="' + d + '" stroke-width=".9" stroke-linejoin="round"/><path d="M' + (-6 * s) + ' ' + (-3 * s) + 'L' + (5 * s) + ' ' + (-4 * s) + '" stroke="' + l + '" stroke-width="1.2" opacity=".6"/></g>';
      case 'slice': return '<g transform="' + tr + '"><ellipse rx="' + (16 * s) + '" ry="' + (8 * s) + '" fill="' + col + '" stroke="' + d + '" stroke-width="1"/><ellipse rx="' + (10 * s) + '" ry="' + (4.4 * s) + '" fill="' + l + '" opacity=".55"/></g>';
      case 'tri': return '<g transform="' + tr + '"><path d="M0 ' + (-16 * s) + 'L' + (12 * s) + ' ' + (12 * s) + 'L' + (-12 * s) + ' ' + (12 * s) + 'z" fill="' + col + '" stroke="' + d + '" stroke-width="1" stroke-linejoin="round"/><circle cx="' + (-3 * s) + '" cy="' + (3 * s) + '" r="' + (1.6 * s) + '" fill="' + d + '" opacity=".5"/><circle cx="' + (4 * s) + '" cy="' + (7 * s) + '" r="' + (1.3 * s) + '" fill="' + d + '" opacity=".45"/></g>';
      case 'dot': return '<circle transform="' + tr + '" r="' + (2 * s).toFixed(1) + '" fill="' + (rn() < .5 ? col : d) + '"/>';
      case 'noodle': return '<path transform="' + tr + '" d="M' + (-18 * s) + ' 0q' + (4.5 * s) + ' ' + (-6 * s) + ' ' + (9 * s) + ' 0t' + (9 * s) + ' 0t' + (9 * s) + ' 0t' + (9 * s) + ' 0" fill="none" stroke="' + (rn() < .5 ? col : l) + '" stroke-width="' + (2.8 * s) + '" stroke-linecap="round"/>';
    }
    return '';
  }
  function fill(L, R, rn, count, size) {
    var out = '', tries = 0, n = 0, col = L.color || DEF[L.item] || '#ccc';
    while (n < count && tries < count * 8) {
      tries++;
      var a = L.from != null ? L.from + rn() * (((L.to - L.from) + 360) % 360 || 360) : rn() * 360;
      var r0 = L.r0 != null ? L.r0 * R0 : 0, rr = r0 + Math.sqrt(rn()) * (R - r0), p = pol(a, rr);
      if (!inSector(p, L, R)) continue;
      out += piece(L.item, p[0], p[1], rn() * 360, size * (0.8 + rn() * 0.4), col, rn); n++;
    }
    return out;
  }
  function sectorPath(from, to, r, r0) {
    var a = pol(from, r), b = pol(to, r), big = (((to - from) + 360) % 360) > 180 ? 1 : 0;
    if (!r0) return 'M' + C + ' ' + C + 'L' + a[0] + ' ' + a[1] + 'A' + r + ' ' + r + ' 0 ' + big + ' 1 ' + b[0] + ' ' + b[1] + 'z';
    var c = pol(to, r0), d = pol(from, r0);
    return 'M' + a[0] + ' ' + a[1] + 'A' + r + ' ' + r + ' 0 ' + big + ' 1 ' + b[0] + ' ' + b[1] + 'L' + c[0] + ' ' + c[1] + 'A' + r0 + ' ' + r0 + ' 0 ' + big + ' 0 ' + d[0] + ' ' + d[1] + 'z';
  }
  function layer(L, i, rn) {
    var col = L.color || DEF[L.item] || '#ccc', R = (L.r || 0.92) * R0, s = '', anchor;
    switch (L.shape) {
      case 'base':
        s += '<circle cx="' + C + '" cy="' + C + '" r="' + R + '" fill="' + shade(col, -0.06) + '"/>';
        if (L.item !== 'smooth' && L.item !== 'sauce') s += fill(L, R, rn, L.n || (L.item === 'grain' ? 520 : 70), L.item === 'grain' ? 1 : 1);
        else s += '<path d="M' + (C - R * .6) + ' ' + C + 'q' + R * .3 + ' ' + (-R * .3) + ' ' + R * .6 + ' 0t' + R * .6 + ' 0" fill="none" stroke="' + shade(col, 0.25) + '" stroke-width="6" stroke-linecap="round" opacity=".6"/>';
        anchor = pol(L.at != null ? L.at : 200, R * (L.d || 0.75)); break;
      case 'sector':
        s += '<path d="' + sectorPath(L.from, L.to, R, L.r0 ? L.r0 * R0 : 0) + '" fill="' + shade(col, -0.35) + '" opacity=".22"/>';
        var span = (((L.to - L.from) + 360) % 360) / 360;
        s += fill(L, R, rn, L.n || Math.round({ grain: 300, cube: 70, ring: 26, leaf: 40, strip: 40, chunk: 30, slice: 14, tri: 8, dot: 60, noodle: 60 }[L.item] * span * 2.2), 1);
        anchor = pol((L.from + ((((L.to - L.from) + 360) % 360) / 2)), (R + (L.r0 ? L.r0 * R0 : 0)) / 2); break;
      case 'mound':
        var mr = (L.r || 0.4) * R0;
        s += '<circle cx="' + C + '" cy="' + C + '" r="' + mr + '" fill="' + shade(col, -0.4) + '" opacity=".25"/>';
        s += fill({ item: L.item, color: col }, mr, rn, L.n || 34, 1.05);
        anchor = [C, C]; break;
      case 'scatter':
        s += fill(L, R, rn, L.n || 26, 0.75); anchor = pol(L.at != null ? L.at : L.from != null ? (L.from + L.to) / 2 : 30, R * 0.55); break;
      case 'drizzle':
        var dp = '', z = L.from != null ? L.from : 0, span2 = L.to != null ? (((L.to - L.from) + 360) % 360) : 360, lines = L.n || 4;
        for (var k = 0; k < lines; k++) {
          var aa = z + span2 * (k + .5) / lines, p1 = pol(aa - 18, R * 0.25), p2 = pol(aa + 6, R * 0.95);
          dp += 'M' + p1[0].toFixed(0) + ' ' + p1[1].toFixed(0) + 'Q' + (C + (rn() - .5) * 90).toFixed(0) + ' ' + (C + (rn() - .5) * 90).toFixed(0) + ' ' + p2[0].toFixed(0) + ' ' + p2[1].toFixed(0);
        }
        s += '<path d="' + dp + '" fill="none" stroke="' + shade(col, -0.2) + '" stroke-width="7" stroke-linecap="round" opacity=".35"/><path d="' + dp + '" fill="none" stroke="' + col + '" stroke-width="5" stroke-linecap="round"/><path d="' + dp + '" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity=".45"/>';
        anchor = pol(z + span2 / 2, R * 0.6); break;
      case 'dollop':
        var at = L.at != null ? L.at : 60, dr = (L.r || 0.2) * R0, dc = pol(at, L.d != null ? L.d * R0 : R0 * 0.55);
        s += '<path transform="translate(' + dc[0].toFixed(0) + ' ' + dc[1].toFixed(0) + ')" d="M' + (-dr) + ' 0C' + (-dr) + ' ' + (-dr * 1.1) + ' ' + dr * 1.1 + ' ' + (-dr * 1.05) + ' ' + dr + ' ' + (-dr * .1) + 'C' + dr * 1.15 + ' ' + dr * .9 + ' ' + (-dr * .8) + ' ' + dr * 1.15 + ' ' + (-dr) + ' 0z" fill="' + col + '" stroke="' + shade(col, -0.18) + '" stroke-width="1.5"/><ellipse cx="' + (dc[0] - dr * .3).toFixed(0) + '" cy="' + (dc[1] - dr * .35).toFixed(0) + '" rx="' + dr * .35 + '" ry="' + dr * .18 + '" fill="#fff" opacity=".5"/>';
        anchor = dc; break;
      case 'sticks':
        var at2 = L.from != null ? L.from : 120, to2 = L.to != null ? L.to : 180, cnt = L.n || 4;
        for (var q = 0; q < cnt; q++) { var ang = at2 + (to2 - at2) * (q + .5) / cnt, pc = pol(ang, R0 * 0.86); s += piece(L.item || 'tri', pc[0], pc[1], ang + 180 + (rn() - .5) * 20, 1.5, col, rn); }
        anchor = pol((at2 + to2) / 2, R0 * 0.86); break;
      case 'fan':
        var at3 = L.at != null ? L.at : 0, cnt3 = L.n || 6, fc = pol(at3, R0 * 0.35);
        for (var w = 0; w < cnt3; w++) { var o = (w - (cnt3 - 1) / 2) * 11; s += piece(L.item || 'slice', fc[0] + Math.cos((at3) * Math.PI / 180) * o, fc[1] + Math.sin((at3) * Math.PI / 180) * o, at3 + 90, 1.25, col, rn); }
        anchor = fc; break;
      case 'taco': {
        /* тако стоя, вид сверху: края лепёшки по бокам, начинка полосой посередине — слоями, как в «Сборке» */
        var tc = pol(L.at != null ? L.at : 0, (L.d != null ? L.d : 0) * R0), rot = L.rot || 0, len = (L.len || 0.62) * R0, wd = (L.w || 0.24) * R0;
        var tcol = L.color || '#e6c27a', fills = L.fill || [], g = '';
        g += '<ellipse cx="0" cy="4" rx="' + (len / 2 + 6) + '" ry="' + (wd / 2 + 5) + '" fill="rgba(0,0,0,.18)"/>';
        g += '<rect x="' + (-len / 2) + '" y="' + (-wd / 2) + '" width="' + len + '" height="' + wd + '" rx="' + (wd / 2) + '" fill="' + tcol + '" stroke="' + shade(tcol, -0.3) + '" stroke-width="1.4"/>';
        for (var sp = 0; sp < 14; sp++) g += '<circle cx="' + ((rn() - .5) * len * .9).toFixed(1) + '" cy="' + ((rn() < .5 ? -1 : 1) * (wd * .38)).toFixed(1) + '" r="' + (1 + rn() * 1.6).toFixed(1) + '" fill="' + shade(tcol, -0.35) + '" opacity=".55"/>';
        var iw = wd * 0.52;
        g += '<rect x="' + (-len / 2 + wd * .32) + '" y="' + (-iw / 2) + '" width="' + (len - wd * .64) + '" height="' + iw + '" rx="' + (iw / 2) + '" fill="' + shade((fills[0] || {}).color || '#7b3a22', -0.25) + '"/>';
        fills.forEach(function (f, fi) {
          var cnt = f.n || (f.item === 'dot' ? 10 : f.item === 'leaf' ? 5 : 7);
          for (var q = 0; q < cnt; q++) {
            var x = (-len / 2 + wd * .4) + rn() * (len - wd * .8), y = (rn() - .5) * iw * .8;
            g += piece(f.item, x, y, rn() * 360, (f.s || 0.55) * (0.8 + rn() * .4), f.color, rn);
          }
        });
        if (L.sauce) { var zz = 'M' + (-len / 2 + wd * .4) + ' 0'; for (var zi = 1; zi <= 9; zi++) zz += 'L' + (-len / 2 + wd * .4 + (len - wd * .8) * zi / 9).toFixed(1) + ' ' + (zi % 2 ? -iw * .28 : iw * .28).toFixed(1);
          g += '<path d="' + zz + '" fill="none" stroke="' + L.sauce + '" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>'; }
        s += '<g transform="translate(' + tc[0].toFixed(1) + ' ' + tc[1].toFixed(1) + ') rotate(' + rot + ')">' + g + '</g>';
        anchor = tc; break; }
      case 'ramekin': {
        /* пиала с соусом/гарниром на тарелке или рядом */
        var rc = pol(L.at != null ? L.at : 45, (L.d != null ? L.d : 0.7) * R0), rr2 = (L.r || 0.16) * R0, rcol = L.color || '#f0dfb8';
        s += '<circle cx="' + rc[0].toFixed(1) + '" cy="' + (rc[1] + 4).toFixed(1) + '" r="' + (rr2 + 6) + '" fill="rgba(0,0,0,.22)"/>' +
          '<circle cx="' + rc[0].toFixed(1) + '" cy="' + rc[1].toFixed(1) + '" r="' + (rr2 + 6) + '" fill="' + (L.bowl || '#fbf8f3') + '" stroke="#ddd5c8" stroke-width="1.5"/>' +
          '<circle cx="' + rc[0].toFixed(1) + '" cy="' + rc[1].toFixed(1) + '" r="' + rr2 + '" fill="' + rcol + '"/>';
        if (L.item && L.item !== 'smooth' && L.item !== 'sauce') for (var ri = 0; ri < (L.n || 14); ri++) { var ra = rn() * 360, rd = Math.sqrt(rn()) * rr2 * .85, rp = [rc[0] + Math.cos(ra) * rd, rc[1] + Math.sin(ra) * rd]; s += piece(L.item, rp[0], rp[1], rn() * 360, 0.6, L.pc || rcol, rn); }
        else s += '<path d="M' + (rc[0] - rr2 * .5) + ' ' + rc[1] + 'q' + rr2 * .25 + ' ' + (-rr2 * .3) + ' ' + rr2 * .5 + ' 0t' + rr2 * .5 + ' 0" fill="none" stroke="' + shade(rcol, 0.3) + '" stroke-width="3" stroke-linecap="round" opacity=".7"/>';
        if (L.top) s += '<circle cx="' + (rc[0] + rr2 * .2).toFixed(1) + '" cy="' + (rc[1] - rr2 * .15).toFixed(1) + '" r="' + (rr2 * .28) + '" fill="' + L.top + '"/>';
        anchor = rc; break; }
      case 'wedge': {
        /* дольки лайма/лимона: корка, мякоть, сегменты */
        var wc = pol(L.at != null ? L.at : 120, (L.d != null ? L.d : 0.72) * R0), wn = L.n || 2, wcol = L.color || '#8cc152';
        for (var wi = 0; wi < wn; wi++) {
          var wr = (L.r || 0.13) * R0, ang2 = (L.rot || 0) + wi * 38;
          s += '<g transform="translate(' + (wc[0] + wi * 10).toFixed(1) + ' ' + (wc[1] + wi * 6).toFixed(1) + ') rotate(' + ang2 + ')"><path d="M' + (-wr) + ' 0A' + wr + ' ' + wr + ' 0 0 0 ' + wr + ' 0z" fill="' + shade(wcol, -0.25) + '"/><path d="M' + (-wr * .82) + ' 0A' + wr * .82 + ' ' + wr * .82 + ' 0 0 0 ' + wr * .82 + ' 0z" fill="' + shade(wcol, 0.45) + '"/>' +
            [30, 70, 110, 150].map(function (aa) { var x2 = Math.cos(aa * Math.PI / 180) * wr * .78, y2 = Math.sin(aa * Math.PI / 180) * wr * .78; return '<path d="M0 0L' + x2.toFixed(1) + ' ' + y2.toFixed(1) + '" stroke="' + shade(wcol, 0.1) + '" stroke-width="1.2"/>'; }).join('') + '</g>';
        }
        anchor = wc; break; }
      case 'quenelle': {
        /* кнель: вытянутая капля ложкой, с бликом */
        var qc = pol(L.at != null ? L.at : 90, (L.d != null ? L.d : 0.5) * R0), ql = (L.r || 0.2) * R0, qcol = L.color || '#7fa64a';
        s += '<g transform="translate(' + qc[0].toFixed(1) + ' ' + qc[1].toFixed(1) + ') rotate(' + (L.rot || 20) + ')"><ellipse cx="0" cy="4" rx="' + ql + '" ry="' + ql * .5 + '" fill="rgba(0,0,0,.15)"/>' +
          '<path d="M' + (-ql) + ' 0C' + (-ql * .6) + ' ' + (-ql * .62) + ' ' + ql * .6 + ' ' + (-ql * .62) + ' ' + ql + ' 0C' + ql * .6 + ' ' + ql * .62 + ' ' + (-ql * .6) + ' ' + ql * .62 + ' ' + (-ql) + ' 0z" fill="' + qcol + '" stroke="' + shade(qcol, -0.25) + '" stroke-width="1.2"/>' +
          '<path d="M' + (-ql * .55) + ' ' + (-ql * .18) + 'Q0 ' + (-ql * .42) + ' ' + ql * .5 + ' ' + (-ql * .2) + '" stroke="' + shade(qcol, 0.4) + '" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".8"/>' +
          (L.dots ? Array.apply(null, Array(6)).map(function () { return '<circle cx="' + ((rn() - .5) * ql * 1.2).toFixed(1) + '" cy="' + ((rn() - .5) * ql * .5).toFixed(1) + '" r="1.6" fill="' + L.dots + '"/>'; }).join('') : '') + '</g>';
        anchor = qc; break; }
      case 'flat': {
        /* лепёшка/тортилья плашмя */
        var fc2 = pol(L.at != null ? L.at : 0, (L.d != null ? L.d : 0) * R0), fr = (L.r || 0.3) * R0, fcol = L.color || '#e6c27a';
        for (var fi2 = (L.n || 1) - 1; fi2 >= 0; fi2--) {
          var ox = fi2 * 6, oy = fi2 * 4;
          s += '<circle cx="' + (fc2[0] + ox).toFixed(1) + '" cy="' + (fc2[1] + oy).toFixed(1) + '" r="' + fr + '" fill="' + fcol + '" stroke="' + shade(fcol, -0.25) + '" stroke-width="1.3"/>';
          for (var fs = 0; fs < 16; fs++) { var fa = rn() * Math.PI * 2, fd = Math.sqrt(rn()) * fr * .9; s += '<circle cx="' + (fc2[0] + ox + Math.cos(fa) * fd).toFixed(1) + '" cy="' + (fc2[1] + oy + Math.sin(fa) * fd).toFixed(1) + '" r="' + (1.2 + rn() * 1.8).toFixed(1) + '" fill="' + shade(fcol, -0.3) + '" opacity=".5"/>'; }
        }
        anchor = fc2; break; }
      case 'ring':
        s += '<circle cx="' + C + '" cy="' + C + '" r="' + R + '" fill="none" stroke="' + col + '" stroke-width="' + (L.w || 14) + '" stroke-dasharray="' + (L.dash || '2 10') + '" stroke-linecap="round"/>';
        anchor = pol(L.at != null ? L.at : 135, R); break;
    }
    return { svg: '<g class="pl-l" style="--i:' + i + '">' + s + '</g>', at: anchor };
  }
  function vessel(v) {
    if (v === 'board') return '<defs><linearGradient id="kbw" x1="0" x2="1"><stop offset="0" stop-color="#a0703f"/><stop offset="1" stop-color="#7d532b"/></linearGradient></defs><rect x="22" y="30" width="356" height="340" rx="34" fill="url(#kbw)"/>' +
      [70, 120, 175, 230, 290, 340].map(function (y, i) { return '<path d="M40 ' + y + 'q90 ' + (i % 2 ? 8 : -8) + ' 180 0t160 0" stroke="#5f3d1d" stroke-width="1.2" fill="none" opacity=".35"/>'; }).join('');
    if (v === 'skillet') return '<rect x="350" y="185" width="46" height="30" rx="12" fill="#1c1c1e"/><circle cx="200" cy="200" r="180" fill="#2b2b2e"/><circle cx="200" cy="200" r="166" fill="#161618"/><circle cx="200" cy="200" r="158" fill="#202023"/>';
    if (v === 'plate') return '<circle cx="200" cy="206" r="188" fill="rgba(0,0,0,.28)"/><circle cx="200" cy="200" r="188" fill="#f6f2ec"/><circle cx="200" cy="200" r="188" fill="none" stroke="#e2dcd2" stroke-width="2"/><circle cx="200" cy="200" r="158" fill="#fbf8f3" stroke="#e8e2d8" stroke-width="2"/>';
    return '<defs><radialGradient id="kbi" cx=".5" cy=".42" r=".6"><stop offset=".7" stop-color="#fbf8f3"/><stop offset="1" stop-color="#ddd5c8"/></radialGradient></defs>' +
      '<circle cx="200" cy="210" r="190" fill="rgba(0,0,0,.3)"/><circle cx="200" cy="200" r="190" fill="#f3eee6"/><circle cx="200" cy="200" r="190" fill="none" stroke="#d9d1c4" stroke-width="2"/><circle cx="200" cy="200" r="170" fill="url(#kbi)"/>';
  }
  /* svg + легенда с номерами слоёв */
  function render(p, seed) {
    var rn = rnd(hash(String(seed || '') + JSON.stringify(p.layers || []).length));
    var ls = (p.layers || []).map(function (L, i) { return layer(L, i, rn); });
    /* номера не налезают друг на друга: расталкиваем */
    for (var it = 0; it < 30; it++) { var moved = false;
      for (var a = 0; a < ls.length; a++) for (var b = a + 1; b < ls.length; b++) { var A = ls[a].at, B = ls[b].at; if (!A || !B) continue;
        var dx = B[0] - A[0], dy = B[1] - A[1], d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        if (d < 32) { var k = (32 - d) / 2, ux = d > 0.02 ? dx / d : 1, uy = d > 0.02 ? dy / d : 0; ls[a].at = [A[0] - ux * k, A[1] - uy * k]; ls[b].at = [B[0] + ux * k, B[1] + uy * k]; moved = true; } }
      if (!moved) break; }
    var marks = ls.map(function (l, i) { if (!l.at) return ''; return '<g class="pl-n" style="--i:' + i + '"><circle cx="' + l.at[0].toFixed(0) + '" cy="' + l.at[1].toFixed(0) + '" r="13" fill="#1d1013" stroke="#fff" stroke-width="2"/><text x="' + l.at[0].toFixed(0) + '" y="' + (l.at[1] + 4.6).toFixed(0) + '" text-anchor="middle" font-size="14" font-weight="800" fill="#fff" font-family="system-ui,sans-serif">' + (i + 1) + '</text></g>'; }).join('');
    var svg = '<svg class="plate-svg" viewBox="0 0 400 400" role="img" aria-label="Схема подачи сверху">' + vessel(p.vessel) +
      '<g clip-path="none">' + ls.map(function (l) { return l.svg; }).join('') + '</g>' +
      '<circle cx="200" cy="200" r="170" fill="url(#kshine)" pointer-events="none"/><defs><radialGradient id="kshine" cx=".35" cy=".3" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>' + marks + '</svg>';
    var legend = '<ol class="plate-legend">' + (p.layers || []).map(function (L, i) { return '<li style="--i:' + i + '"><span class="pl-num">' + (i + 1) + '</span><i style="background:' + (L.color || DEF[L.item] || '#ccc') + '"></i><span>' + String(L.what || '').replace(/[<&]/g, '') + '</span></li>'; }).join('') + '</ol>';
    return { svg: svg, legend: legend };
  }
  window.KPlate = { render: render };
})();
