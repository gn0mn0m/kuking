/* Нейросеть: новый рецепт и меню недели.
   GigaChat отвечает только через вызов функции со строгой схемой (аргументы приходят готовым объектом),
   дальше — проверка кодом (каждый продукт в шагах, единицы, белок, порядок для двоих) и шеф-ревизор.
   Ошибки — обратно нейросети с конкретным списком, до трёх попыток. */
(function () {
  'use strict';
  var Z = window.Z, D = Z.data, E = Z.esc;
  var UNITS = ['г', 'мл', 'шт', 'ст.л.', 'ч.л.', 'зубч.', 'пучок', 'щепотка', 'лист', 'по вкусу'];
  var ACT = { type: 'object', properties: {
    tekst: { type: 'string', description: 'Одно действие простыми словами. Количество продукта — только ссылкой {id_продукта}, часть — {id:0.5}. Важное — **жирным**. Огонь, время, признак готовности.' },
    posuda: { type: 'string', description: 'Посуда из списка posuda (её nazvanie)' },
    taimer_min: { type: 'integer', description: 'Таймер в минутах, только если действие — ожидание (варить, запекать, томить)' } }, required: ['tekst'] };
  var RECIPE = { name: 'recept_zharko', description: 'Полный рецепт для приложения «Жарко»: продукты, посуда, шаги по порядку, подача.',
    parameters: { type: 'object', properties: {
      nazvanie: { type: 'string', description: 'Конкретное название: белок + способ + гарнир/соус, 3–8 слов. Без слов «вечер», «ужин», «ночь».' },
      podzagolovok: { type: 'string', description: 'Чем блюдо хорошо, до 120 знаков, без перечня через точки' },
      kukhnya: { type: 'string' }, glavnoe: { type: 'string', description: 'Главный продукт: Говядина, Курица, Свинина, Рыба…' },
      porcii: { type: 'integer', description: 'На сколько порций все количества' },
      vsego_min: { type: 'integer' }, rukami_min: { type: 'integer' },
      kbzhu: { type: 'object', description: 'На одну порцию', properties: { kkal: { type: 'integer' }, belok: { type: 'integer' }, zhiry: { type: 'integer' }, uglevody: { type: 'integer' } }, required: ['kkal', 'belok', 'zhiry', 'uglevody'] },
      gruppy: { type: 'array', items: { type: 'string' }, description: 'Группы продуктов по отделам магазина, например: Мясо, Овощи и зелень, Бакалея, Специи' },
      produkty: { type: 'array', items: { type: 'object', properties: {
        id: { type: 'string', description: 'Латиница, коротко: beef, onion, rice' },
        gruppa: { type: 'integer', description: 'Номер группы из gruppy, с 0' },
        nazvanie: { type: 'string', description: 'Как в магазине: «Свиная шея», «Рис круглозёрный»' },
        kolichestvo: { type: 'number', description: 'Число на все порции; для «по вкусу» — 0' },
        edinica: { type: 'string', enum: UNITS } }, required: ['id', 'gruppa', 'nazvanie', 'kolichestvo', 'edinica'] } },
      posuda: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, nazvanie: { type: 'string' }, zachem: { type: 'string' } }, required: ['id', 'nazvanie', 'zachem'] } },
      shagi: { type: 'array', description: 'Шаги по порядку. Первый шаг — вся нарезка и подготовка. Каждый шаг 5–30 минут.', items: { type: 'object', properties: {
        nazvanie: { type: 'string' }, minut: { type: 'integer' },
        sinhron: { type: 'string', description: 'Только для двоих поваров: кто кого ждёт и что не начинать раньше времени' },
        oba: { type: 'array', items: ACT, description: 'Действия, если готовит один, или общие для двоих' },
        shef: { type: 'array', items: ACT, description: 'Только для двоих: шеф — соусы, блендер, жарка, вкус' },
        sushef: { type: 'array', items: ACT, description: 'Только для двоих: су-шеф — нарезка, мытьё, гарнир' },
        shutka: { type: 'string', description: 'Короткая шутка по делу, необязательно' } }, required: ['nazvanie', 'minut'] } },
      podacha: { type: 'array', items: { type: 'string' }, description: '3–4 пункта: как разложить красиво' },
      posuda_podachi: { type: 'array', items: { type: 'string' } } },
    required: ['nazvanie', 'podzagolovok', 'porcii', 'vsego_min', 'rukami_min', 'kbzhu', 'gruppy', 'produkty', 'posuda', 'shagi', 'podacha'] },
    few_shot_examples: [{ request: 'Для себя, 2 порции, курица и рис, до 30 минут',
      params: { nazvanie: 'Курица терияки с рисом и брокколи', podzagolovok: 'Бедро с корочкой в глазури из соевого соуса и мёда', kukhnya: 'Японская', glavnoe: 'Курица', porcii: 2, vsego_min: 30, rukami_min: 25,
        kbzhu: { kkal: 900, belok: 58, zhiry: 22, uglevody: 112 }, gruppy: ['Мясо', 'Овощи', 'Бакалея'],
        produkty: [{ id: 'chicken', gruppa: 0, nazvanie: 'Куриное бедро без кожи и кости', kolichestvo: 600, edinica: 'г' }, { id: 'broc', gruppa: 1, nazvanie: 'Брокколи замороженная', kolichestvo: 400, edinica: 'г' }, { id: 'rice', gruppa: 2, nazvanie: 'Рис круглозёрный', kolichestvo: 200, edinica: 'г' }, { id: 'soy', gruppa: 2, nazvanie: 'Соевый соус', kolichestvo: 4, edinica: 'ст.л.' }, { id: 'honey', gruppa: 2, nazvanie: 'Мёд', kolichestvo: 2, edinica: 'ст.л.' }],
        posuda: [{ id: 'pan', nazvanie: 'Большая сковорода', zachem: 'курица и глазурь' }, { id: 'pot', nazvanie: 'Средняя кастрюля с крышкой', zachem: 'рис' }],
        shagi: [{ nazvanie: 'Рис на плиту, соус', minut: 5, oba: [{ tekst: 'Рис {rice} промой, залей водой 1 к 1,5, до кипения, потом **крышка и минимальный огонь**.', posuda: 'Средняя кастрюля с крышкой', taimer_min: 12 }, { tekst: 'Смешай соевый соус {soy} и мёд {honey}.' }] },
          { nazvanie: 'Курица и глазурь', minut: 15, oba: [{ tekst: 'Курицу {chicken} жарь гладкой стороной вниз **6 минут не трогая**, переверни на 4.', posuda: 'Большая сковорода' }, { tekst: 'Влей соус, 2–3 минуты, пока не загустеет. Брокколи {broc} — 4 минуты в кипятке.', posuda: 'Большая сковорода' }] }],
        podacha: ['Рис куполом, курицу полосками рядом.', 'Глазурь со сковороды сверху.'] } }] };

  var REVIEW = { name: 'otchet_revizora', description: 'Проверка рецепта шефом перед выдачей человеку.',
    parameters: { type: 'object', properties: { ok: { type: 'boolean' }, oshibki: { type: 'array', items: { type: 'object', properties: { shag: { type: 'integer' }, chto: { type: 'string' }, kak: { type: 'string', description: 'Как исправить' } }, required: ['chto', 'kak'] } } }, required: ['ok', 'oshibki'] },
    few_shot_examples: [{ request: 'Шаг 2: «Мясо в духовку на 3 часа». Обжарка мяса — в шаге 3.', params: { ok: false, oshibki: [{ shag: 2, chto: 'Мясо идёт в духовку сырым, обжарка позже', kak: 'Перенести обжарку в шаг 2 до духовки' }] } }] };

  function prefsLine() {
    var inf = (Z.social && Z.social.info()) || {}, rv = D.reviews(), good = [], bad = [];
    Object.keys(rv).forEach(function (id) { var r = D.byId(id); if (!r) return; if (rv[id].score >= 9) good.push(r.title); else if (rv[id].score <= 6) bad.push(r.title + ' (' + rv[id].score + (rv[id].comment ? ': ' + rv[id].comment : '') + ')'); });
    return [inf.likes ? 'Любит: ' + inf.likes + '.' : '', inf.avoid ? 'НЕ ЕСТ: ' + inf.avoid + '.' : '', inf.allergy ? 'АЛЛЕРГИЯ: ' + inf.allergy + ' — исключить полностью.' : '',
      good.length ? 'Высоко оценил: ' + good.slice(0, 6).join(', ') + '.' : '', bad.length ? 'Не понравилось: ' + bad.slice(0, 4).join('; ') + '.' : ''].filter(Boolean).join(' ');
  }
  function pantryLine() {
    return D.pantry().map(function (p) { var dl = D.daysLeft(p); return p.name + (p.amount != null && p.amount !== '' ? ' ' + Z.fmtNum(+p.amount) + ' ' + (p.unit || '') : '') + (dl != null && dl <= 2 ? ' (съесть за ' + Math.max(0, dl) + ' дн.)' : ''); }).join('; ');
  }
  var KIT = 'Посуда дома: сковороды большая, средняя и маленькая; кастрюли две средние и маленькая; блендер; духовка; барный инвентарь. Другой посуды нет.';
  var MODE_RULE = {
    self: 'Готовит один человек для себя. Максимально просто: до 30–40 минут активно, минимум посуды и нарезки. Порции большие и сытные: белок ~60 г, углеводы ~100 г на порцию. Лишние порции — обед на завтра.',
    two: 'Ужин на двоих, романтика. Классика с максимальным вкусом и красивой подачей, без излишеств. Подбери блюдо под вино. Готовит один.',
    crew: 'Готовят двое: шеф (соусы, блендер, жарка, вкус — меньше нарезки) и су-шеф (нарезка, мытьё, гарнир). Нагрузка поровну, никто не стоит без дела. Порции большие: белок ~60 г, углеводы ~100 г на человека. Всё время готовки до 3 часов (заготовки и бульоны можно дольше).'
  };
  var DUO_RULE = 'ДЛЯ ДВОИХ порядок железный: 1) в каждом шаге заполни shef и sushef (oba — только общие действия); 2) в sinhron — кто кого ждёт и что НЕЛЬЗЯ начинать раньше (например, мясо в духовку только после обжарки); 3) если один освобождается раньше — дай ему конкретное дело на этом же шаге; 4) нельзя, чтобы действие одного зависело от того, что второй сделает только в следующем шаге.';

  /* ---------- проверка кодом ---------- */
  function check(a, mode) {
    var err = [];
    if (!a || !Array.isArray(a.produkty) || !a.produkty.length) return ['нет продуктов'];
    if (!Array.isArray(a.shagi) || a.shagi.length < 2) err.push('шагов меньше двух');
    var ids = {}; a.produkty.forEach(function (p) { if (!/^[a-z][a-z0-9_]*$/i.test(p.id || '')) err.push('id продукта «' + p.nazvanie + '» должен быть латиницей'); if (ids[p.id]) err.push('id «' + p.id + '» повторяется'); ids[p.id] = p; if (UNITS.indexOf(p.edinica) < 0) err.push('единица «' + p.edinica + '» у «' + p.nazvanie + '» не из списка'); if (!(p.kolichestvo > 0) && p.edinica !== 'по вкусу') err.push('нет количества у «' + p.nazvanie + '»'); });
    var used = {}, txt = '';
    (a.shagi || []).forEach(function (s, i) {
      var all = [].concat(s.oba || [], s.shef || [], s.sushef || []);
      if (!all.length) err.push('шаг ' + (i + 1) + ' «' + s.nazvanie + '» без действий');
      if (mode === 'crew' && i > 0 && (!(s.shef || []).length || !(s.sushef || []).length)) err.push('шаг ' + (i + 1) + ': для двоих заполни shef и sushef');
      if (mode === 'crew' && i > 0 && !s.sinhron) err.push('шаг ' + (i + 1) + ': нет sinhron');
      all.forEach(function (x) { txt += ' ' + x.tekst; String(x.tekst || '').replace(/\{(\w+)(?::[\d.]+)?\}/g, function (m, id) { if (!ids[id]) err.push('в шаге ' + (i + 1) + ' ссылка {' + id + '} на продукт, которого нет в списке'); used[id] = 1; return m; }); });
    });
    a.produkty.forEach(function (p) { if (!used[p.id]) err.push('продукт «' + p.nazvanie + '» ({' + p.id + '}) куплен, но нигде не используется в шагах'); });
    if (mode !== 'two' && a.kbzhu && a.kbzhu.belok < 35) err.push('мало белка: ' + a.kbzhu.belok + ' г на порцию, нужно около 60');
    if (/ужин|вечер|ночь/i.test(a.nazvanie || '')) err.push('в названии не должно быть «ужин/вечер/ночь» — только еда');
    return err;
  }
  /* ---------- в формат книги ---------- */
  function round(u, a) { return u === 'г' ? (a >= 200 ? 'g50' : 'g10') : u === 'мл' ? 'ml5' : u === 'шт' ? 'ceil' : /л\.$|щепотка/.test(u) ? 'spoon' : u === 'зубч.' ? 'int' : 'dec1'; }
  var ICO = function (n) { n = String(n || '').toLowerCase(); return /сковор/.test(n) ? 'pan' : /кастр/.test(n) ? 'pot' : /духов|против/.test(n) ? 'oven' : /блендер/.test(n) ? 'blender' : /доск|нож/.test(n) ? 'board' : /миск/.test(n) ? 'glassbowl' : /тарел/.test(n) ? 'plateC' : 'cup'; };
  function build(a, mode, guests) {
    var id = 'ai-' + Date.now().toString(36);
    var ing = a.produkty.map(function (p) { var none = p.edinica === 'по вкусу' || !(p.kolichestvo > 0); return { id: p.id, g: Math.max(0, Math.min((a.gruppy || []).length - 1, p.gruppa | 0)), name: p.nazvanie, amount: none ? null : p.kolichestvo, unit: none ? '' : p.edinica, unitText: none ? 'по вкусу' : undefined, round: round(p.edinica, p.kolichestvo) }; });
    var t = 0, steps = a.shagi.map(function (s) {
      var from = t; t += Math.max(1, s.minut | 0);
      var fmt = function (m) { return Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0'); };
      var conv = function (L) { return (L || []).map(function (x, j) { var o = { t: x.tekst }; if (x.posuda) o.tool = x.posuda; if (x.taimer_min > 0) o.timer = { id: 't' + from + '_' + j, min: x.taimer_min, label: Z.plain(s.nazvanie).split(/[,.]/)[0].slice(0, 24) }; return o; }); };
      var st = { type: 'step', short: Z.plain(s.nazvanie).split(/[,.]/)[0].slice(0, 22), title: s.nazvanie, time: fmt(from) + ' – ' + fmt(t), dur: s.minut + ' мин' };
      if ((s.shef || []).length || (s.sushef || []).length) { st.lanes = { chef: conv(s.shef), sous: conv(s.sushef) }; if ((s.oba || []).length) st.both = conv(s.oba); if (s.sinhron) st.sync = s.sinhron; }
      else st.both = conv(s.oba);
      if (s.shutka) st.joke = s.shutka;
      return st;
    });
    var k = a.kbzhu || {};
    return { id: id, mode: mode === 'two' ? 'romance' : mode === 'crew' ? 'friends' : 'self', added: Z.today(), ai: true,
      meta: { category: 'main', cuisine: a.kukhnya || '', main: a.glavnoe || '', difficulty: 2, activeMin: a.rukami_min || 0 },
      title: a.nazvanie, tagline: a.podzagolovok || '', baseGuests: a.porcii || guests, totalTime: '≈ ' + Z.dur(a.vsego_min || t),
      groups: (a.gruppy && a.gruppy.length ? a.gruppy : ['Продукты']), ingredients: ing,
      dishes: [{ name: a.nazvanie, desc: 'на порцию', kcal: k.kkal || 0, p: k.belok || 0, f: k.zhiry || 0, c: k.uglevody || 0 }],
      tools: [{ zone: 'Посуда', items: (a.posuda || []).map(function (p) { return { id: p.id || ('t' + Math.random().toString(36).slice(2, 6)), icon: ICO(p.nazvanie), name: p.nazvanie, use: p.zachem || '' }; }) }],
      slides: [{ type: 'cover', short: 'Меню', lede: a.podzagolovok || '' }, { type: 'shop', short: 'Продукты' }, { type: 'tools', short: 'Посуда' }].concat(steps)
        .concat([{ type: 'serve', short: 'Подача', title: 'Подача', dishes: a.posuda_podachi || [], points: a.podacha || [] }, { type: 'final', short: 'Финал' }]) };
  }
  function review(r, mode) {
    var text = D.steps(r).map(function (s, i) { var L = function (n, a) { return (a || []).map(function (x) { return n + Z.plain(x.t); }).join(' '); }; return 'Шаг ' + (i + 1) + ' «' + s.title + '» (' + s.dur + '): ' + (s.sync ? '[связка: ' + s.sync + '] ' : '') + L('', s.both) + (s.lanes ? ' ШЕФ: ' + L('', s.lanes.chef) + ' СУ-ШЕФ: ' + L('', s.lanes.sous) : ''); }).join('\n');
    return KukingAI.fn({ fn: REVIEW, temperature: 0.1,
      system: 'Ты строгий шеф-ревизор ресторана. Ищешь только реальные ошибки: опасный или неверный порядок (сырое мясо в духовку, соус до обжарки), пропущенный продукт, нереальное время, повар без дела, недожаренное/пережаренное, техника не по традиции. Мелочи стиля — не ошибки.',
      user: 'Рецепт «' + r.title + '», ' + D.MODE[mode] + ', ' + r.baseGuests + ' порц.\nПродукты: ' + r.ingredients.map(function (i) { return i.name; }).join(', ') + '\n' + text })
      .then(function (v) { return v && v.ok === false && v.oshibki && v.oshibki.length ? v.oshibki.map(function (o) { return (o.shag ? 'шаг ' + o.shag + ': ' : '') + o.chto + ' → ' + o.kak; }) : []; }, function () { return []; });
  }
  /* одна генерация: до трёх попыток с конкретными ошибками */
  function make(o, stage) {
    var mode = o.mode || 'self', guests = o.guests || (mode === 'self' ? 2 : mode === 'two' ? 2 : 6);
    var sys = 'Ты шеф-повар уровня Мишлен и бистро. Пишешь безупречные рецепты для приложения: традиция, умами, проверенная техника. Пишешь по-русски, простыми словами, метрические единицы. ' + KIT;
    var base = 'Режим: ' + D.MODE[mode] + '. ' + MODE_RULE[mode] + (mode === 'crew' ? ' ' + DUO_RULE : ' Поля shef, sushef, sinhron не заполняй.') + '\nПорций: ' + guests + '.\n' +
      (o.want ? 'Чего хочется: ' + o.want + '\n' : '') + (o.base ? 'Доработай до 10/10 рецепт «' + o.base.title + '»: сохрани идею, исправь слабые места.' + ((D.review(o.base.id) || {}).comment ? ' Замечание: ' + D.review(o.base.id).comment : '') + '\n' : '') +
      (prefsLine() ? prefsLine() + '\n' : '') + (pantryLine() ? 'Есть дома (используй в первую очередь то, что скоро испортится): ' + pantryLine() + '\n' : '') +
      'Каждый продукт из produkty обязан встретиться в шагах как {id}. Все количества — только через {id}. Первый шаг — нарезка и подготовка, потом готовка.';
    var tries = 0, last = [];
    function attempt() {
      tries++; stage(tries === 1 ? 'Шеф пишет рецепт' : 'Исправляю: ' + last[0]);
      return KukingAI.fn({ fn: RECIPE, temperature: tries === 1 ? 0.6 : 0.3, system: sys, user: base + (last.length ? '\nВ прошлой версии ошибки, исправь все:\n- ' + last.join('\n- ') : '') }).then(function (a) {
        var err = check(a, mode);
        if (err.length) { last = err.slice(0, 8); if (tries < 3) return attempt(); throw new Error('Нейросеть трижды ошиблась: ' + err[0]); }
        var r = build(a, mode, guests);
        stage('Шеф-ревизор проверяет порядок');
        return review(r, mode).then(function (iss) { if (iss.length && tries < 3) { last = iss; return attempt(); } return r; });
      });
    }
    return attempt();
  }

  /* ---------- окно «Новый рецепт» ---------- */
  function recipeSheet(opt) {
    opt = opt || {};
    if (!(window.KukingAI && KukingAI.ready())) return Z.toast('Нейросеть работает после входа в аккаунт');
    var mode = opt.mode || 'self', guests = { self: 2, two: 2, crew: 6 }[mode], want = '', busy = false, ctl = null;
    var soon = D.pantry().filter(function (p) { var dl = D.daysLeft(p); return dl != null && dl <= 2; }).map(function (p) { return p.name; });
    function body() {
      return '<div class="seg" role="tablist">' + [['self', 'Для себя'], ['two', 'Вдвоём'], ['crew', 'Компания']].map(function (m) { return '<button type="button" role="tab" data-m="' + m[0] + '" aria-selected="' + (mode === m[0]) + '">' + m[1] + '</button>'; }).join('') + '</div>' +
        '<p class="small muted" style="margin-top:8px">' + E(mode === 'self' ? 'Просто и быстро, лишние порции — на завтра.' : mode === 'two' ? 'Классика, красивая подача, под вино.' : 'Готовите вдвоём: шеф и су-шеф, порции большие.') + '</p>' +
        '<div class="bar" style="margin-top:12px"><p style="font-weight:600">Порции</p><div class="stepper"><button type="button" class="icon-btn" data-gg="-1" aria-label="Меньше">' + Z.icon('minus') + '</button><span class="num">' + guests + '</span><button type="button" class="icon-btn" data-gg="1" aria-label="Больше">' + Z.icon('plus') + '</button></div></div>' +
        '<div class="fld"><label for="gw">Чего хочется</label><textarea id="gw" class="inp" placeholder="Например: что-то с говядиной и рисом, острое" maxlength="300">' + E(want) + '</textarea></div>' +
        (soon.length ? '<button type="button" class="chip" data-soon style="margin-top:8px">Из того, что скоро испортится: ' + E(soon.slice(0, 3).join(', ')) + '</button>' : '') +
        '<button type="button" class="btn btn-act btn-wide" data-go style="margin-top:18px">' + Z.icon('spark') + 'Придумать</button>';
    }
    var s = Z.sheet('Новый рецепт', body(), { onClose: function () { if (ctl) ctl.cancelled = true; } });
    s.body.onclick = function (e) {
      if (busy) return; var b;
      if ((b = e.target.closest('[data-m]'))) { want = s.body.querySelector('#gw').value; mode = b.getAttribute('data-m'); guests = { self: 2, two: 2, crew: 6 }[mode]; s.set(body()); return; }
      if ((b = e.target.closest('[data-gg]'))) { want = s.body.querySelector('#gw').value; guests = Math.max(1, Math.min(14, guests + +b.getAttribute('data-gg'))); if (guests >= 5 && mode !== 'crew') mode = 'crew'; s.set(body()); return; }
      if (e.target.closest('[data-soon]')) { var ta = s.body.querySelector('#gw'); ta.value = (ta.value ? ta.value + ', ' : '') + 'использовать: ' + soon.slice(0, 3).join(', '); return; }
      if (e.target.closest('[data-go]')) {
        want = s.body.querySelector('#gw').value.trim(); busy = true; ctl = {};
        var c = ctl;
        s.set('<div class="empty" style="padding:24px 0"><span class="spin" style="width:32px;height:32px"></span><p class="d3" style="margin-top:16px" id="gs">Шеф пишет рецепт</p><p class="small" style="margin-top:8px">Обычно минута-две. Можно закрыть окно — рецепт появится в книге.</p></div>');
        make({ mode: mode, guests: guests, want: want }, function (t) { var n = document.getElementById('gs'); if (n) n.textContent = t; }).then(function (r) {
          D.addRecipe(r); busy = false; if (opt.day) D.planAdd(opt.day, r.id, guests);
          if (c.cancelled) return Z.toast('Готов рецепт «' + r.title + '»', 'Открыть', function () { Z.go('r/' + encodeURIComponent(r.id)); });
          s.close(); Z.go('r/' + encodeURIComponent(r.id)); Z.haptic(15);
        }, function (er) { busy = false; if (c.cancelled) return Z.toast('Рецепт не получился'); s.set('<p class="err" style="font-size:16px">' + E(er && er.message || 'Нейросеть не ответила') + '</p><button type="button" class="btn btn-act btn-wide" data-retry style="margin-top:16px">Попробовать ещё</button>'); s.body.querySelector('[data-retry]').onclick = function () { s.close(); recipeSheet({ mode: mode, day: opt.day }); }; });
      }
    };
  }

  /* ---------- меню недели ---------- */
  var WEEK = { name: 'menyu_nedeli', description: 'Реалистичная неделя готовки для одного человека.',
    parameters: { type: 'object', properties: { dni: { type: 'array', items: { type: 'object', properties: {
      den: { type: 'string', description: 'Дата YYYY-MM-DD строго из списка' },
      istochnik: { type: 'string', enum: ['kniga', 'novoe'] },
      id: { type: 'string', description: 'id рецепта из книги, если kniga' },
      nazvanie: { type: 'string', description: 'Для нового: конкретное блюдо 3–7 слов' },
      pochemu: { type: 'string', description: 'До 50 знаков' } }, required: ['den', 'istochnik', 'pochemu'] } } }, required: ['dni'] } };
  function weekSheet() {
    if (!(window.KukingAI && KukingAI.ready())) return Z.toast('Нейросеть работает после входа в аккаунт');
    var times = 3, por = 2, t = Z.today();
    var free = []; for (var i = 0; i < 7; i++) { var k = Z.addDays(t, i); if (!D.dayIds(k).length) free.push(k); }
    var ag = D.agenda(t, 7); free = free.filter(function (k) { return !ag.filter(function (d) { return d.key === k; })[0].eat.length; });
    function body() {
      return '<p class="lead" style="margin-top:0">Соберу неделю: в основном новые блюда, из книги — только то, что ты оценил на 10, или на 9 и не готовил две недели.</p>' +
        '<div class="fld"><label>Сколько раз готовить</label><div class="chips" style="margin:0;padding:0">' + [2, 3, 4, 5].map(function (n) { return '<button type="button" class="chip" data-t="' + n + '" aria-pressed="' + (times === n) + '">' + n + '</button>'; }).join('') + '</div></div>' +
        '<div class="fld"><label>Порций за раз</label><div class="chips" style="margin:0;padding:0">' + [1, 2, 3].map(function (n) { return '<button type="button" class="chip" data-p="' + n + '" aria-pressed="' + (por === n) + '">' + n + '</button>'; }).join('') + '</div><p class="small muted">' + (por > 1 ? 'Остальные дни доедаешь.' : 'Каждый раз свежее.') + '</p></div>' +
        '<p class="small muted" style="margin-top:12px">Свободных дней: ' + free.length + '. Кладовка учтена.</p>' +
        '<button type="button" class="btn btn-act btn-wide" data-go style="margin-top:16px"' + (free.length ? '' : ' disabled') + '>Предложить меню</button>' +
        '<p class="small muted" style="margin-top:14px">План можно попросить и у Claude в чате — он пришлёт ссылку, по ней план встанет сюда.</p>';
    }
    var s = Z.sheet('Неделя', body()), plan = null;
    s.body.onclick = function (e) {
      var b;
      if ((b = e.target.closest('[data-t]'))) { times = +b.getAttribute('data-t'); s.set(body()); return; }
      if ((b = e.target.closest('[data-p]'))) { por = +b.getAttribute('data-p'); s.set(body()); return; }
      if (e.target.closest('[data-go]')) return propose();
      if (e.target.closest('[data-ok]')) return accept();
    };
    function propose() {
      s.set('<div class="empty" style="padding:24px 0"><span class="spin" style="width:32px;height:32px"></span><p class="d3" style="margin-top:16px">Собираю неделю</p></div>');
      var rv = D.reviews(), last = {};
      Object.keys(D.plan().days).forEach(function (k) { if (k < t) D.plan().days[k].forEach(function (id) { if (!last[id] || last[id] < k) last[id] = k; }); });
      var ago = function (id) { var x = last[id] || (rv[id] && rv[id].at); return x ? (Z.dParse(t) - Z.dParse(String(x).slice(0, 10))) / 864e5 : 999; };
      var cand = D.all().filter(function (r) { var v = rv[r.id]; return v && (v.score >= 10 || (v.score === 9 && ago(r.id) >= 14)) && D.mode(r) === 'self'; }).map(function (r) { return { id: r.id, t: r.title, ocenka: rv[r.id].score }; });
      var n = Math.min(times, free.length), gap = Math.max(1, Math.floor(free.length / n));
      KukingAI.fn({ fn: WEEK, temperature: 0.5,
        system: 'Ты шеф и нутрициолог. Планируешь простую сытную неделю готовки для одного человека без запары.',
        user: 'Свободные дни: ' + free.map(function (k) { return k + ' (' + Z.DOW[Z.dParse(k).getDay()] + ')'; }).join(', ') + '.\nГотовок: ровно ' + n + ', дни не подряд, примерно через ' + gap + '. Каждое блюдо на ' + por + ' порц.\n' +
          (prefsLine() ? prefsLine() + '\n' : '') + (pantryLine() ? 'Есть дома: ' + pantryLine() + '. Сначала то, что скоро испортится.\n' : '') +
          (cand.length ? 'Из книги можно ТОЛЬКО: ' + JSON.stringify(cand) + '. Максимум одно.\n' : 'Из книги брать нечего.\n') +
          'Остальное — НОВЫЕ блюда (istochnik=novoe): простые, активно до 30–40 минут, белок каждый раз другой, хорошо стоят в холодильнике. Названия — конкретная еда.' })
        .then(function (v) {
          var used = {};
          plan = (v && v.dni || []).filter(function (x) { if (!x || free.indexOf(x.den) < 0 || used[x.den]) return false; if (x.istochnik === 'kniga') { if (!cand.some(function (c) { return c.id === x.id; })) return false; } else if (!x.nazvanie) return false; used[x.den] = 1; return true; }).slice(0, n);
          if (!plan.length) throw new Error('Нейросеть не собрала меню');
          s.set('<ul class="list">' + plan.map(function (x) { var r = x.istochnik === 'kniga' ? D.byId(x.id) : null; return '<li class="li" data-wd="' + x.den + '" style="align-items:center"><span style="width:52px;flex:none"><span class="small muted">' + Z.DOW[Z.dParse(x.den).getDay()] + '</span><b class="num" style="display:block;font-size:22px">' + Z.dParse(x.den).getDate() + '</b></span><span class="grow"><b>' + E(r ? r.title : x.nazvanie) + '</b><span class="chk-sub">' + E(r ? (rv[r.id].score === 9 ? 'из книги, доработаю до 10' : 'из книги, 10 из 10') : 'новое') + (x.pochemu ? ', ' + E(x.pochemu) : '') + '</span></span><span class="wm" aria-live="polite"></span></li>'; }).join('') + '</ul>' +
            '<p class="small muted" style="margin-top:10px">Новые рецепты пишу по одному, 1–2 минуты каждый. Окно можно закрыть.</p><div class="row" style="margin-top:14px"><button type="button" class="btn btn-soft" data-go>Другое меню</button><button type="button" class="btn btn-act grow" data-ok>В план</button></div>');
        }).catch(function (er) { s.set('<p class="err" style="font-size:16px">' + E(er.message || 'Нейросеть не ответила') + '</p><button type="button" class="btn btn-act btn-wide" data-go style="margin-top:16px">Ещё раз</button>'); });
    }
    function accept() {
      var b = s.body.querySelector('[data-ok]'); b.disabled = true; b.innerHTML = '<span class="spin"></span>'; s.body.querySelector('[data-go]').disabled = true;
      var q = plan.slice(), fails = 0;
      (function next() {
        var x = q.shift();
        if (!x) { Z.toast(fails ? 'Готово, ' + fails + ' не получилось' : 'Неделя в плане', 'Открыть', function () { Z.go('plan'); }); if (!s.closed) { s.close(); Z.go('plan'); } return; }
        var mark = function (t2) { var n = s.body.querySelector('[data-wd="' + x.den + '"] .wm'); if (n) n.innerHTML = t2; };
        var r = x.istochnik === 'kniga' ? D.byId(x.id) : null;
        if (r && D.reviews()[r.id].score >= 10) { D.planAdd(x.den, r.id, por); mark(Z.icon('check')); return next(); }
        mark('<span class="spin"></span>');
        make(r ? { mode: 'self', guests: por, base: r } : { mode: 'self', guests: por, want: x.nazvanie + (x.pochemu ? ' (' + x.pochemu + ')' : '') }, function () {})
          .then(function (nr) { if (r) nr.title = r.title; D.addRecipe(nr); D.planAdd(x.den, nr.id, por); mark(Z.icon('check')); next(); })
          .catch(function () { fails++; mark(Z.icon('x')); next(); });
      })();
    }
  }

  Z.gen = { recipe: recipeSheet, week: weekSheet, make: make, check: check, build: build };
})();
