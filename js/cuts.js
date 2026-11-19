/* Cuts — картинки «как резать»: маленькие схемы в 2–3 кадра прямо в шаге.
   В рецепте у действия: cut: 'strips-across' | 'julienne' | 'pepper-strips' | 'scallion' | 'mince' | 'onion-half-rings' | 'dice'.
   Цвета берутся из темы, работает в светлой и тёмной. */
(function () {
  'use strict';
  var K = 'stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"';
  var KNIFE = '<g transform="translate(%x %y) rotate(%r)"><rect x="-4" y="-34" width="8" height="22" rx="3" fill="var(--ink-2,#8a7)"/><path d="M-6 -12h12l-2 40c-1 6-7 6-8 0z" fill="var(--knife,#cfd6dc)" stroke="currentColor" stroke-width="1.5"/></g>';
  function knife(x, y, r) { return KNIFE.replace('%x', x).replace('%y', y).replace('%r', r || 0); }
  function arrow(x1, x2, y) { return '<path d="M' + x1 + ' ' + y + 'H' + x2 + 'm-8 -6l8 6-8 6" ' + K + ' opacity=".55"/>'; }
  var MEAT = 'fill="#c8505a" stroke="#7a2430" stroke-width="2"', CARROT = 'fill="#f08a2b" stroke="#a9520f" stroke-width="2"', PEPPER = 'fill="#e2463a" stroke="#8e1f18" stroke-width="2"', GREEN = 'fill="#7fbf5a" stroke="#3d6f25" stroke-width="2"', WHITE = 'fill="#efeadf" stroke="#9c9583" stroke-width="2"';
  var CUTS = {
    'strips-across': {
      cap: ['Найди волокна — тонкие линии вдоль куска', 'Нож поперёк волокон', 'Полоски 3 мм — толщиной с монету'],
      svg: '<rect x="14" y="40" width="92" height="56" rx="14" ' + MEAT + '/>' + [52, 60, 68, 76, 84].map(function (y) { return '<path d="M24 ' + y + 'H96" stroke="#f3c4c4" stroke-width="2" opacity=".9"/>'; }).join('') +
        arrow(116, 138, 68) +
        '<rect x="148" y="40" width="92" height="56" rx="14" ' + MEAT + '/>' + [52, 60, 68, 76, 84].map(function (y) { return '<path d="M158 ' + y + 'H230" stroke="#f3c4c4" stroke-width="2" opacity=".9"/>'; }).join('') +
        [170, 186, 202, 218].map(function (x) { return '<path d="M' + x + ' 34V102" stroke="var(--accent,#ff8c32)" stroke-width="3" stroke-dasharray="5 4"/>'; }).join('') + knife(226, 30, 0) +
        arrow(250, 272, 68) +
        [0, 1, 2, 3, 4].map(function (i) { return '<rect x="' + (284 + i * 14) + '" y="' + (44 + (i % 2) * 4) + '" width="8" height="52" rx="3" ' + MEAT + '/>'; }).join('')
    },
    'julienne': {
      cap: ['Морковь — бруски по 5 см', 'Каждый — в пластины 3 мм', 'Пластины стопкой — в соломку 3 мм'],
      svg: '<rect x="14" y="56" width="96" height="26" rx="13" ' + CARROT + '/><path d="M46 52v34M78 52v34" stroke="var(--accent,#ff8c32)" stroke-width="3" stroke-dasharray="5 4"/>' + arrow(118, 140, 68) +
        [0, 1, 2, 3].map(function (i) { return '<rect x="' + (150 + i * 6) + '" y="' + (46 + i * 7) + '" width="72" height="9" rx="2" ' + CARROT + '/>'; }).join('') + arrow(244, 266, 68) +
        [0, 1, 2, 3, 4, 5, 6].map(function (i) { return '<rect x="' + (276 + i * 9) + '" y="' + (44 + (i % 3) * 3) + '" width="5" height="50" rx="2" ' + CARROT + '/>'; }).join('')
    },
    'pepper-strips': {
      cap: ['Срежь верх, разрежь пополам', 'Выкинь семена и белые перегородки', 'Полоски 5 мм вдоль'],
      svg: '<path d="M30 50c0-14 60-14 60 0v30c0 22-60 22-60 0z" ' + PEPPER + '/><path d="M60 36v-12" stroke="#3d6f25" stroke-width="5" stroke-linecap="round"/><path d="M60 40V100" stroke="var(--accent,#ff8c32)" stroke-width="3" stroke-dasharray="5 4"/>' + arrow(108, 130, 68) +
        '<path d="M140 44h60v40c0 16-60 16-60 0z" ' + PEPPER + '/><path d="M146 50h48v32c0 10-48 10-48 0z" fill="#f2a097" opacity=".55"/><ellipse cx="170" cy="56" rx="12" ry="9" fill="#efeadf" stroke="#9c9583" stroke-width="1.5"/><path d="M188 30l-8 20M152 30l8 20" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity=".6"/>' + arrow(206, 228, 68) +
        [0, 1, 2, 3, 4, 5].map(function (i) { return '<rect x="' + (244 + i * 12) + '" y="' + (40 + (i % 2) * 5) + '" width="7" height="56" rx="3.5" ' + PEPPER + '/>'; }).join('')
    },
    'scallion': {
      cap: ['Зелёный лук: белое отдели от зелёного', 'Белое — кусками по 3 см (в сковороду)', 'Зелёное — колечками (сверху на подачу)'],
      svg: '<rect x="14" y="62" width="40" height="12" rx="6" ' + WHITE + '/><rect x="52" y="62" width="70" height="12" rx="6" ' + GREEN + '/><path d="M54 52v34" stroke="var(--accent,#ff8c32)" stroke-width="3" stroke-dasharray="5 4"/>' + arrow(130, 150, 68) +
        [0, 1, 2].map(function (i) { return '<rect x="' + (160 + i * 26) + '" y="62" width="20" height="12" rx="6" ' + WHITE + '/>'; }).join('') + arrow(244, 264, 68) +
        [0, 1, 2, 3, 4, 5].map(function (i) { return '<circle cx="' + (282 + (i % 3) * 22) + '" cy="' + (56 + Math.floor(i / 3) * 24) + '" r="8" fill="none" stroke="#3d6f25" stroke-width="4"/>'; }).join('')
    },
    'mince': {
      cap: ['Чеснок прижми плоскостью ножа — шелуха слезет', 'Имбирь почисти краем ложки', 'Руби мелко, как крупу'],
      svg: '<ellipse cx="50" cy="70" rx="22" ry="16" ' + WHITE + '/><rect x="18" y="44" width="70" height="10" rx="3" fill="var(--knife,#cfd6dc)" stroke="currentColor" stroke-width="1.5"/><path d="M52 30v12" ' + K + '/><path d="M44 34l8 8 8-8" ' + K + '/>' + arrow(100, 122, 68) +
        '<path d="M134 60c10-12 40-12 50 0c6 8 0 22-12 22h-26c-12 0-18-14-12-22z" fill="#e8c88a" stroke="#9c7a3a" stroke-width="2"/><path d="M196 52c-8 4-10 12-6 20" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>' + arrow(212, 234, 68) +
        Array.apply(null, Array(26)).map(function (_, i) { return '<rect x="' + (248 + (i * 37) % 90) + '" y="' + (50 + (i * 23) % 40) + '" width="5" height="5" rx="1" fill="' + (i % 2 ? '#efeadf' : '#e8c88a') + '" stroke="#9c9583" stroke-width="1"/>'; }).join('')
    },
    'onion-half-rings': {
      cap: ['Лук пополам через корешок', 'Срезом вниз — устойчиво', 'Полукольца 3–4 мм'],
      svg: '<circle cx="56" cy="68" r="32" fill="#e9d6b0" stroke="#9c7a3a" stroke-width="2"/><path d="M56 30v76" stroke="var(--accent,#ff8c32)" stroke-width="3" stroke-dasharray="5 4"/>' + arrow(98, 120, 68) +
        '<path d="M134 90a36 36 0 0 1 72 0z" fill="#e9d6b0" stroke="#9c7a3a" stroke-width="2"/><path d="M146 90a24 24 0 0 1 48 0M158 90a12 12 0 0 1 24 0" stroke="#c7a76b" stroke-width="2" fill="none"/>' + arrow(216, 238, 68) +
        [0, 1, 2, 3].map(function (i) { return '<path d="M' + (252 + i * 14) + ' 92a26 26 0 0 1 40 -30" stroke="#c7a76b" stroke-width="5" fill="none" stroke-linecap="round"/>'; }).join('')
    },
    'dice': {
      cap: ['Режь пластинами', 'Пластины — в бруски', 'Бруски — в кубики'],
      svg: '<rect x="16" y="40" width="80" height="56" rx="8" fill="#e9d6b0" stroke="#9c7a3a" stroke-width="2"/>' + [32, 48, 64, 80].map(function (x) { return '<path d="M' + x + ' 36v64" stroke="var(--accent,#ff8c32)" stroke-width="3" stroke-dasharray="5 4"/>'; }).join('') + arrow(104, 126, 68) +
        [0, 1, 2, 3].map(function (i) { return '<rect x="' + (138 + i * 18) + '" y="44" width="12" height="48" rx="2" fill="#e9d6b0" stroke="#9c7a3a" stroke-width="2"/>'; }).join('') + arrow(216, 238, 68) +
        [0, 1, 2, 3, 4, 5, 6, 7, 8].map(function (i) { return '<rect x="' + (252 + (i % 3) * 22) + '" y="' + (44 + Math.floor(i / 3) * 18) + '" width="14" height="14" rx="2" fill="#e9d6b0" stroke="#9c7a3a" stroke-width="2"/>'; }).join('')
    }
  };
  function html(key) {
    var c = CUTS[key]; if (!c) return '';
    return '<figure class="cut-fig" aria-label="Как резать: ' + c.cap.join(', ') + '"><svg viewBox="0 0 370 130" role="img" aria-hidden="true">' + c.svg + '</svg>' +
      '<figcaption><ol>' + c.cap.map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ol></figcaption></figure>';
  }
  window.Cuts = { html: html, keys: Object.keys(CUTS) };
})();
