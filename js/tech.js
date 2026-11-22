/* Режим готовки+: анимации техник на сложных шагах и быстрый свой таймер.
   Техника находится по словам в шаге; карточка «Как это» раскрывается тапом, анимация — чистый CSS (transform/opacity). */
(function () {
  var S = 'fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"';
  var T = [
    { k: 'dice', rx: /кубик|кубиками|брунуаз/, name: 'Нарезка кубиком', tip: ['Сначала пласты нужной толщины, потом бруски, потом поперёк — кубик.', 'Кончик ножа не отрывай от доски, двигай нож «качелью».', 'Пальцы держи «кошачьей лапкой» — костяшки к лезвию.'],
      svg: '<rect x="8" y="66" width="104" height="10" rx="3" class="tc-board"/><g class="tc-cubes"><rect x="22" y="54" width="10" height="10" rx="2"/><rect x="34" y="54" width="10" height="10" rx="2"/><rect x="46" y="54" width="10" height="10" rx="2"/></g><rect x="60" y="44" width="34" height="20" rx="5" class="tc-food"/><g class="tc-knife"><path d="M70 10 L70 52 L88 52 L88 22 Z" class="tc-blade"/><rect x="66" y="2" width="26" height="9" rx="3" class="tc-handle"/></g>' },
    { k: 'slice', rx: /соломк|жульен|тонко нар|слайс|ломтик|полукольц|кольца/, name: 'Тонкая нарезка', tip: ['Острый нож режет, тупой давит — сначала поправь мусатом.', 'Длинное движение вперёд-вниз, без нажима.', 'Одинаковая толщина = одинаковая готовность.'],
      svg: '<rect x="8" y="66" width="104" height="10" rx="3" class="tc-board"/><g class="tc-slices"><rect x="30" y="46" width="3" height="18" rx="1"/><rect x="36" y="46" width="3" height="18" rx="1"/><rect x="42" y="46" width="3" height="18" rx="1"/></g><rect x="50" y="46" width="40" height="18" rx="8" class="tc-food"/><g class="tc-knife tc-saw"><path d="M48 14 L48 54 L66 54 L66 26 Z" class="tc-blade"/><rect x="44" y="6" width="26" height="9" rx="3" class="tc-handle"/></g>' },
    { k: 'sear', rx: /обжар|корочк|подпал|зарумян|сотейр|до золотист|прижар|гриль/, name: 'Обжарка до корочки', tip: ['Сковорода разогрета до лёгкого дымка, масло блестит.', 'Не трогай кусок, пока сам не отлипнет — это и есть корочка.', 'Не перегружай: тесно — пойдёт сок, будет тушение.'],
      svg: '<path d="M14 58 Q60 78 106 58" class="tc-pan" ' + S + '/><path d="M106 58 L118 52" ' + S + '/><g class="tc-steak"><rect x="40" y="46" width="40" height="12" rx="5" class="tc-meat"/></g><g class="tc-sizzle"><path d="M38 40 q3 -6 0 -12"/><path d="M60 38 q3 -6 0 -12"/><path d="M82 40 q3 -6 0 -12"/></g><g class="tc-flame"><path d="M44 86 q4 -10 8 0 q-4 6 -8 0z"/><path d="M58 86 q4 -12 8 0 q-4 6 -8 0z"/><path d="M72 86 q4 -10 8 0 q-4 6 -8 0z"/></g>' },
    { k: 'toss', rx: /подбрас|встряхн|вок|встряхива/, name: 'Подбросить в сковороде', tip: ['Резко толкни сковороду от себя и чуть вверх — и сразу на себя.', 'Начни с половины объёма, чтобы не уронить.', 'Тренируйся на сухой фасоли — без последствий.'],
      svg: '<g class="tc-tosspan"><path d="M18 62 Q55 78 92 62" ' + S + ' class="tc-pan"/><path d="M92 62 L114 54" ' + S + '/></g><g class="tc-bits"><circle cx="46" cy="50" r="4"/><circle cx="58" cy="46" r="4"/><circle cx="68" cy="52" r="4"/></g>' },
    { k: 'whisk', rx: /взбит|венчик|эмульг|до пик|пышн/, name: 'Взбить / эмульсия', tip: ['Миска холодная и сухая — сливки и белки взбиваются быстрее.', 'Масло в эмульсию — тонкой струйкой, не всё сразу.', 'Венчик ходит «восьмёркой», а не по кругу.'],
      svg: '<path d="M22 50 Q60 92 98 50 Z" class="tc-bowl" ' + S + '/><g class="tc-whisk"><path d="M60 8 L60 40" ' + S + '/><ellipse cx="60" cy="52" rx="10" ry="16" ' + S + '/><ellipse cx="60" cy="52" rx="4" ry="16" ' + S + '/></g><g class="tc-foam"><circle cx="44" cy="58" r="3"/><circle cx="74" cy="60" r="3"/><circle cx="58" cy="64" r="2.5"/></g>' },
    { k: 'quenelle', rx: /кенел/, name: 'Кенель двумя ложками', tip: ['Ложки окуни в горячую воду — масса не прилипнет.', 'Перекладывай массу с ложки на ложку 3–4 раза, каждый раз подрезая край.', 'Третья грань получается сама — это и есть кенель.'],
      svg: '<g class="tc-spoonL"><path d="M20 60 Q40 40 60 52" ' + S + '/><ellipse cx="62" cy="54" rx="12" ry="7" class="tc-spoon"/></g><g class="tc-spoonR"><path d="M100 46 Q80 62 64 54" ' + S + '/></g><ellipse cx="62" cy="50" rx="10" ry="6" class="tc-scoop"/>' },
    { k: 'pound', rx: /отбит|отбей|молотк|расплющ/, name: 'Отбить мясо', tip: ['Накрой плёнкой или пакетом — брызг не будет.', 'Бей от центра к краям плоской стороной.', 'Цель — ровная толщина, а не дыра.'],
      svg: '<rect x="8" y="66" width="104" height="10" rx="3" class="tc-board"/><rect x="34" y="56" width="52" height="10" rx="5" class="tc-meat tc-flat"/><g class="tc-mallet"><rect x="52" y="22" width="22" height="16" rx="3" class="tc-handle"/><path d="M63 22 L80 2" ' + S + '/></g>' },
    { k: 'simmer', rx: /томит|туши|на слабом огне|медленно кипит|чуть булькает|упар/, name: 'Томить на слабом огне', tip: ['Слабое бульканье: редкие пузыри у края, а не кипение.', 'Крышка приоткрыта — соус густеет, не выкипая.', 'Мешай со дна раз в 5–10 минут.'],
      svg: '<path d="M22 40 L22 74 Q60 86 98 74 L98 40" ' + S + ' class="tc-pot"/><path d="M14 40 L106 40" ' + S + '/><g class="tc-bub"><circle cx="40" cy="62" r="3"/><circle cx="60" cy="66" r="2.5"/><circle cx="80" cy="60" r="3"/></g><g class="tc-steam"><path d="M44 30 q4 -8 0 -16"/><path d="M60 28 q4 -8 0 -16"/><path d="M76 30 q4 -8 0 -16"/></g>' },
    { k: 'fold', rx: /вмеш|аккуратно перемеш|лопаткой снизу|не осади/, name: 'Аккуратно вмешать', tip: ['Лопатка идёт по краю вниз, по дну и вверх через центр.', 'Поворачивай миску на четверть после каждого движения.', 'Остановись, как только исчезли полосы.'],
      svg: '<path d="M22 50 Q60 92 98 50 Z" class="tc-bowl" ' + S + '/><g class="tc-spat"><path d="M60 6 L60 40" ' + S + '/><rect x="52" y="40" width="16" height="20" rx="6" class="tc-spoon"/></g>' }
  ];
  function find(s) {
    var txt = JSON.stringify(s || {}).toLowerCase().replace(/ё/g, 'е');
    return T.filter(function (t) { return t.rx.test(txt); }).slice(0, 2);
  }
  function html(s) {
    var f = find(s); if (!f.length) return '';
    return '<div class="tc-wrap">' + f.map(function (t) {
      return '<details class="tc"><summary><span class="tc-play" aria-hidden="true">▶</span>Как это: ' + t.name.toLowerCase() + '</summary>' +
        '<div class="tc-body"><svg class="tc-art tc-' + t.k + '" viewBox="0 0 120 92" aria-hidden="true">' + t.svg + '</svg><ul>' + t.tip.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul></div></details>';
    }).join('') + '</div>';
  }

  /* ---------- свой таймер ---------- */
  function timerSheet(onDone) {
    var m = document.createElement('div'); m.className = 'ks-ov'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
    m.innerHTML = '<div class="ks"><span class="ks-grab" aria-hidden="true"></span><div class="ks-head"><h3>Свой таймер</h3><button type="button" class="ks-x" aria-label="Закрыть">×</button></div><div class="ks-body">' +
      '<label class="set-f qz-f"><span>Что засекаем</span><input id="utL" maxlength="24" placeholder="Например, рис"></label>' +
      '<div class="ut-grid">' + [1, 2, 3, 5, 8, 10, 12, 15, 20, 25, 30, 45].map(function (n) { return '<button type="button" class="ut-b" data-ut="' + n + '">' + n + ' мин</button>'; }).join('') + '</div>' +
      '<form class="ut-own"><input id="utM" type="number" inputmode="numeric" min="1" max="600" placeholder="Своё, мин"><button type="submit" class="nav-btn primary">Старт</button></form></div></div>';
    document.body.appendChild(m); requestAnimationFrame(function () { m.classList.add('on'); });
    function shut() { m.classList.remove('on'); setTimeout(function () { m.remove(); }, 280); }
    function go(min) { if (!(min > 0)) return; var l = m.querySelector('#utL').value.trim() || 'Таймер ' + min + ' мин'; shut(); onDone(min, l); }
    m.addEventListener('click', function (e) { if (e.target === m || e.target.closest('.ks-x')) return shut(); var b = e.target.closest('[data-ut]'); if (b) go(+b.getAttribute('data-ut')); });
    m.querySelector('.ut-own').addEventListener('submit', function (e) { e.preventDefault(); go(+m.querySelector('#utM').value); });
  }
  function startCustom(min, label) {
    var R = window.RingTimer; if (!R || !R.create) return;
    var id = 'u' + Date.now().toString(36);
    R.create({ id: id, sec: Math.round(min * 60), label: label, slide: -1 }); R.start(id);
    if (window.kHaptic) window.kHaptic(10);
  }
  window.KTech = { html: html, timerSheet: function () { timerSheet(startCustom); } };
})();
