/* Партия 1: знакомство (квиз при первом запуске), предпочтения, техника, уведомления по типам.
   Всё хранится в телефоне (kuking:prefs); имя, аллергии и «не ем» — ещё и в анкете, если вошёл. */
(function () {
  var K = 'kuking:prefs', QK = 'kuking:quiz';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function lget(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lset(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function hap(n) { if (window.kHaptic) window.kHaptic(n || 8); }

  /* ---------- данные ---------- */
  var DEF = { name: '', spice: 1, budget: 'mid', weekday: 't60', weekend: 't120', cuisines: [], allergy: [], avoid: [], allergyText: '', avoidText: '', equip: null, notif: {} };
  function get() { var p = {}; try { p = JSON.parse(lget(K) || '{}') || {}; } catch (e) {} var o = {}; Object.keys(DEF).forEach(function (k) { o[k] = p[k] != null ? p[k] : JSON.parse(JSON.stringify(DEF[k])); }); return o; }
  function set(p) { lset(K, JSON.stringify(p)); syncDb(p); }
  var syncT = null;
  function syncDb(p) {
    clearTimeout(syncT);
    syncT = setTimeout(function () {
      var S = window.KukingStore; if (!S || !S.user || !S.user() || !S.collection) return;
      try { S.collection('meta').doc('prefs').set({ prefs: p, updatedAt: new Date().toISOString() }).catch(function () {}); } catch (e) {}
    }, 800);
  }

  var SPICE = ['Без остроты', 'Чуть-чуть', 'Огонёк', 'Пожар'];
  var BUDGET = { eco: 'Экономно', mid: 'Средне', free: 'Не считаю' };
  var TIME = { t30: 'до 30 мин', t60: 'до часа', t120: 'до 2 ч', t180: 'до 3 ч' };
  var ALLERGY = ['Орехи', 'Арахис', 'Лактоза', 'Глютен', 'Морепродукты', 'Рыба', 'Яйца', 'Соя', 'Кунжут'];
  var AVOID = ['Свинина', 'Баранина', 'Печень', 'Грибы', 'Кинза', 'Оливки', 'Майонез', 'Сладкое к мясу', 'Тофу'];
  var NOTIF = [['shop', 'Закупка', 'когда пора за продуктами или заказать доставку'], ['prep', 'Подготовка', 'морозилка, разморозка, маринад'], ['cook', 'Готовка', 'за полчаса до ужина'],
    ['plan', 'План', 'пустой завтрашний день и план на неделю'], ['rate', 'Оценка', 'на следующий день после блюда'], ['nudge', 'Давно не заходил', 'через 3 дня тишины']];
  var KIND = { shop: 'shop', freeze: 'prep', thaw: 'prep', marinade: 'prep', cook: 'cook', empty: 'plan', week: 'plan', rate: 'rate', nudge: 'nudge' };
  function notifOn(kind) { var t = KIND[kind]; if (!t) return true; return get().notif[t] !== false; }

  /* техника: рисованные плитки. Сковороды и кастрюли есть у всех — их не спрашиваем. */
  var S = 'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';
  var EQ = [
    ['oven', 'Духовка', '<rect x="6" y="7" width="36" height="34" rx="4"/><path d="M6 16h36"/><circle cx="12" cy="11.5" r="1.4"/><circle cx="18" cy="11.5" r="1.4"/><rect x="12" y="21" width="24" height="14" rx="2.5"/><path d="M16 25h16"/>'],
    ['micro', 'Микроволновка', '<rect x="4" y="10" width="40" height="28" rx="4"/><rect x="9" y="15" width="22" height="18" rx="2.5"/><circle cx="37.5" cy="18" r="1.4"/><circle cx="37.5" cy="23.5" r="1.4"/><path d="M35 29h5"/>'],
    ['airfryer', 'Аэрогриль', '<path d="M15 6h18a5 5 0 0 1 5 5v27a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4V11a5 5 0 0 1 5-5z"/><circle cx="24" cy="16" r="4.5"/><path d="M10 27h28M19 34h10"/>'],
    ['multi', 'Мультиварка', '<path d="M8 21a16 7 0 0 1 32 0"/><path d="M8 21v13a6 6 0 0 0 6 6h20a6 6 0 0 0 6-6V21"/><rect x="18" y="27" width="12" height="6" rx="1.5"/><path d="M20 12.5h8"/>'],
    ['blender', 'Блендер', '<path d="M15 6h18l-3 22H18z"/><path d="M17 13h7"/><rect x="13" y="28" width="22" height="14" rx="3.5"/><circle cx="24" cy="35" r="2.6"/>'],
    ['immersion', 'Погружной блендер', '<rect x="19" y="4" width="10" height="19" rx="4"/><path d="M22 23v11M26 23v11"/><path d="M16 34h16l-2.5 7h-11z"/><path d="M24 9v4"/>'],
    ['mixer', 'Миксер', '<path d="M9 12h22a6 6 0 0 1 0 12H17a8 8 0 0 1-8-8z"/><path d="M13 12c1-4 4-6 8-6h7"/><path d="M19 24v9a3 3 0 0 0 6 0v-9M27 24v9a3 3 0 0 0 6 0v-9"/>'],
    ['processor', 'Кухонный комбайн', '<path d="M11 15h26l-2.5 17h-21z"/><rect x="25" y="6" width="7" height="9" rx="1.5"/><path d="M17 24h14"/><rect x="9" y="32" width="30" height="10" rx="3"/><circle cx="24" cy="37" r="1.6"/>'],
    ['grill', 'Гриль-сковорода', '<rect x="5" y="12" width="29" height="25" rx="4"/><path d="M11 18l17 13M11 25l11 8M17 16l11 9"/><path d="M34 24.5h9"/>'],
    ['wok', 'Вок', '<path d="M5 21h34a17 15 0 0 1-34 0z"/><path d="M39 22l7-3"/><path d="M14 31c3 2 9 2 12 0"/>'],
    ['castiron', 'Чугунная сковорода', '<circle cx="19" cy="25" r="13"/><circle cx="19" cy="25" r="8.5"/><path d="M32 23h9a2 2 0 0 1 0 4h-9"/>'],
    ['steamer', 'Пароварка', '<path d="M12 15c2-6 22-6 24 0"/><rect x="9" y="15" width="30" height="10" rx="2.5"/><rect x="9" y="27" width="30" height="10" rx="2.5"/><path d="M18 6c-1.5 1.5 1.5 3 0 4.5M24 5c-1.5 1.5 1.5 3 0 4.5M30 6c-1.5 1.5 1.5 3 0 4.5"/>'],
    ['grinder', 'Мясорубка', '<path d="M14 6h15l-3 10h-9z"/><rect x="11" y="16" width="23" height="13" rx="3.5"/><path d="M34 19h8v7h-8"/><path d="M11 22H6v-9"/><path d="M17 29l-2 12h14l-2-12"/>'],
    ['thermo', 'Термощуп', '<circle cx="34" cy="14" r="8"/><path d="M34 10v4l2.5 2.5"/><path d="M28.5 19.5L8 40"/>'],
    ['sousvide', 'Су-вид', '<rect x="21" y="4" width="8" height="24" rx="3"/><path d="M8 20h32v17a5 5 0 0 1-5 5H13a5 5 0 0 1-5-5z"/><path d="M12 28c3-2 5 2 8 0M28 28c3-2 5 2 8 0"/>'],
    ['toaster', 'Тостер', '<rect x="7" y="17" width="34" height="22" rx="6"/><path d="M15 17v-4a3 3 0 0 1 6 0v4M27 17v-4a3 3 0 0 1 6 0v4"/><path d="M41 26h3"/>'],
    ['bar', 'Барный набор', '<path d="M17 7h12l-1 5H18z"/><path d="M16 12h14l-3 28h-8z"/><path d="M34 17h8l-2 6h-4z"/><path d="M38 23v14"/>']
  ];
  var EQNAME = {}; EQ.forEach(function (e) { EQNAME[e[0]] = e[1]; });
  /* то, что меняет рецепт: без этого нейросеть не должна им пользоваться */
  var KEYEQ = { oven: 'Духовка', blender: 'Блендер', airfryer: 'Аэрогриль', multi: 'Мультиварка', grill: 'Гриль' };
  function has(eqName) {
    var p = get(); if (!p.equip) return true;
    for (var k in KEYEQ) if (KEYEQ[k] === eqName) {
      if (k === 'blender') return p.equip.indexOf('blender') >= 0 || p.equip.indexOf('immersion') >= 0 || p.equip.indexOf('processor') >= 0;
      if (k === 'grill') return p.equip.indexOf('grill') >= 0 || p.equip.indexOf('castiron') >= 0;
      return p.equip.indexOf(k) >= 0;
    }
    return true;
  }

  /* строка для нейросети */
  function promptLine() {
    var p = get(), out = [];
    out.push('острота: ' + SPICE[p.spice].toLowerCase());
    out.push('бюджет: ' + BUDGET[p.budget].toLowerCase());
    out.push('время на готовку в будни ' + TIME[p.weekday] + ', в выходные ' + TIME[p.weekend]);
    if (p.cuisines.length) out.push('любимые кухни: ' + p.cuisines.join(', '));
    var av = p.avoid.concat(p.avoidText ? [p.avoidText] : []); if (av.length) out.push('НЕ ЕСТ: ' + av.join(', '));
    var al = p.allergy.concat(p.allergyText ? [p.allergyText] : []); if (al.length) out.push('АЛЛЕРГИЯ (ни грамма, ни следа): ' + al.join(', '));
    if (p.equip) {
      out.push('из техники есть: сковороды и кастрюли' + (p.equip.length ? ', ' + p.equip.map(function (k) { return EQNAME[k].toLowerCase(); }).join(', ') : ''));
      var no = Object.keys(KEYEQ).filter(function (k) { return !has(KEYEQ[k]); }).map(function (k) { return KEYEQ[k].toLowerCase(); });
      if (no.length) out.push('НЕТ: ' + no.join(', ') + ' — не используй это в шагах');
    }
    out.push('жиры — в норме, без перегиба: масло и сливки по делу, не «для вкуса» ложками');
    return '- Предпочтения повара: ' + out.join('; ') + '.';
  }

  /* ---------- общие кусочки разметки ---------- */
  function chips(name, list, sel) {
    return '<div class="qz-chips">' + list.map(function (x) { var on = sel.indexOf(x) >= 0; return '<button type="button" class="qz-chip" data-chip="' + name + '" data-v="' + esc(x) + '" aria-pressed="' + on + '">' + esc(x) + '</button>'; }).join('') + '</div>';
  }
  function seg(name, opts, v) {
    return '<div class="seg qz-seg" role="radiogroup">' + opts.map(function (o) { return '<button type="button" role="radio" data-seg="' + name + '" data-v="' + o[0] + '" aria-checked="' + (String(v) === String(o[0])) + '">' + o[1] + '</button>'; }).join('') + '</div>';
  }
  function tiles(sel) {
    return '<div class="qz-tiles">' + EQ.map(function (e) { var on = sel.indexOf(e[0]) >= 0;
      return '<button type="button" class="qz-tile" data-eq="' + e[0] + '" aria-pressed="' + on + '"><svg viewBox="0 0 48 48" ' + S + ' aria-hidden="true">' + e[2] + '</svg><span>' + e[1] + '</span></button>'; }).join('') + '</div>';
  }
  function tasteHTML(p) {
    return '<span class="qz-l">Острота</span>' + seg('spice', SPICE.map(function (s, i) { return [i, s]; }), p.spice) +
      '<span class="qz-l">Бюджет на продукты</span>' + seg('budget', Object.keys(BUDGET).map(function (k) { return [k, BUDGET[k]]; }), p.budget) +
      '<span class="qz-l">Любимые кухни</span>' + chips('cuisines', (window.KMeta ? KMeta.CUISINES : []).filter(function (c) { return c !== 'Авторская'; }), p.cuisines);
  }
  function timeHTML(p) {
    var o = Object.keys(TIME).map(function (k) { return [k, TIME[k]]; });
    return '<span class="qz-l">Время на готовку в будни</span>' + seg('weekday', o, p.weekday) + '<span class="qz-l">В выходные</span>' + seg('weekend', o, p.weekend);
  }
  function foodHTML(p) {
    return '<span class="qz-l">Аллергия — ни грамма</span>' + chips('allergy', ALLERGY, p.allergy) +
      '<label class="set-f qz-f"><span>Ещё аллергии</span><input data-txt="allergyText" maxlength="120" value="' + esc(p.allergyText) + '" placeholder="Например, киви"></label>' +
      '<span class="qz-l">Не ем</span>' + chips('avoid', AVOID, p.avoid) +
      '<label class="set-f qz-f"><span>Что ещё не ешь</span><input data-txt="avoidText" maxlength="120" value="' + esc(p.avoidText) + '" placeholder="Например, баклажаны"></label>';
  }
  function notifHTML(p) {
    var Soc = window.KukingSocial, st = Soc && Soc.pushState ? Soc.pushState() : 'nope';
    var h = '<div class="qz-push">' + (st === 'on' ? '<p class="small">Уведомления на этом телефоне включены.</p>' :
      st === 'install' ? '<p class="small">На iPhone уведомления работают, когда «Жарко» добавлен на экран «Домой».</p>' :
      st === 'denied' ? '<p class="small">Уведомления запрещены в настройках iPhone: Настройки → Уведомления → Жарко.</p>' :
      st === 'nope' ? '<p class="small">Этот браузер не умеет уведомления.</p>' :
      '<button type="button" class="nav-btn primary" data-a="push">Включить уведомления</button>') + '</div>';
    h += '<ul class="qz-tog">' + NOTIF.map(function (n) { var on = p.notif[n[0]] !== false;
      return '<li><button type="button" class="qz-sw" data-notif="' + n[0] + '" role="switch" aria-checked="' + on + '"><span class="qz-sw-t"><b>' + n[1] + '</b><small>' + n[2] + '</small></span><i aria-hidden="true"></i></button></li>'; }).join('') + '</ul>' +
      '<p class="small qz-note">Поздравления с днём рождения приходят всегда.</p>';
    return h;
  }

  /* привязка к любому контейнеру: квиз и страницы настроек используют одно и то же */
  function bindPrefs(root, onChange) {
    root.addEventListener('click', function (e) {
      var b = e.target.closest('[data-chip],[data-seg],[data-eq],[data-notif],[data-a=push]'); if (!b || !root.contains(b)) return;
      var p = get();
      if (b.hasAttribute('data-chip')) { var n = b.getAttribute('data-chip'), v = b.getAttribute('data-v'), on = b.getAttribute('aria-pressed') !== 'true';
        b.setAttribute('aria-pressed', on); p[n] = p[n].filter(function (x) { return x !== v; }); if (on) p[n].push(v); }
      else if (b.hasAttribute('data-seg')) { var sn = b.getAttribute('data-seg'), sv = b.getAttribute('data-v');
        b.parentNode.querySelectorAll('[data-seg]').forEach(function (x) { x.setAttribute('aria-checked', x === b); });
        if (sn === 'spice') p.spice = +sv; else if (p.hasOwnProperty(sn)) p[sn] = sv; else if (onChange) onChange(sn, sv); }
      else if (b.hasAttribute('data-eq')) { var k = b.getAttribute('data-eq'), q = b.getAttribute('aria-pressed') !== 'true';
        b.setAttribute('aria-pressed', q); p.equip = (p.equip || []).filter(function (x) { return x !== k; }); if (q) p.equip.push(k); }
      else if (b.hasAttribute('data-notif')) { var t = b.getAttribute('data-notif'), o = b.getAttribute('aria-checked') !== 'true';
        b.setAttribute('aria-checked', o); p.notif[t] = o; if (window.KukingLib && window.KukingLib.resync) window.KukingLib.resync(); }
      else if (b.getAttribute('data-a') === 'push') { var Soc = window.KukingSocial; if (Soc && Soc.enablePush) Promise.resolve(Soc.enablePush()).then(function () { var w = b.closest('.qz-push'); if (w) w.innerHTML = '<p class="small">Уведомления включены.</p>'; }).catch(function () {}); return; }
      hap(6); set(p); if (onChange) onChange();
    });
    root.addEventListener('input', function (e) {
      var i = e.target.closest('[data-txt]'); if (!i) return; var p = get(); p[i.getAttribute('data-txt')] = i.value.trim().slice(0, 120); set(p);
    });
  }

  /* ---------- страницы настроек ---------- */
  function pageHTML(kind) {
    var p = get();
    if (kind === 'prefs') return '<div class="qz-page"><p class="small">Нейросеть подбирает идеи и пишет рецепты с учётом этого.</p>' + tasteHTML(p) + timeHTML(p) + foodHTML(p) + '</div>';
    if (kind === 'kitchen') return '<div class="qz-page"><p class="small">Отметь, что есть. Сковороды и кастрюли считаем по умолчанию. Чего нет — нейросеть в рецепт не поставит.</p>' + tiles(p.equip || []) + '</div>';
    if (kind === 'notif') return '<div class="qz-page">' + notifHTML(p) + '</div>';
    return '';
  }

  /* ---------- квиз ---------- */
  var ov = null, idx = 0, dir = 1, invited = false;
  var STEPS = ['hi', 'name', 'goal', 'body', 'food', 'taste', 'kit', 'cook', 'notif', 'done'];
  var TITLE = { hi: '', name: 'Как к вам обращаться?', goal: 'Какая цель?', body: 'Немного о теле', food: 'Аллергии и «не ем»', taste: 'Что по вкусу?', kit: 'Какая техника есть?', cook: 'Как готовите?', notif: 'Уведомления', done: '' };
  var SUB = { name: 'Имя увидят друзья в чатах.', goal: 'Под неё считаем порцию и КБЖУ в каждом рецепте.', body: 'Видите только вы — хранится в телефоне.', food: 'Нейросеть не предложит этого никогда.',
    taste: 'Можно выбрать несколько кухонь.', kit: 'Тапните всё, что есть. Сковороды и кастрюли — по умолчанию.', cook: 'Так рецепты будут понятнее и по времени.', notif: 'Выберите, о чём напоминать.' };
  function body() { return window.KBody ? window.KBody.get() : {}; }
  function setBody(k, v) { if (!window.KBody) return; var b = body(); b[k] = v; window.KBody.set(b); }
  function norm() {
    var t = window.KBody && window.KBody.targets && window.KBody.targets();
    return t ? 'В день ≈ <b>' + t.day.kcal + ' ккал</b> · Б ' + t.day.p + ' · Ж ' + t.day.f + ' · У ' + t.day.c + ' г' : 'Заполните пол, рост и вес — посчитаем норму.';
  }
  function skill() { return +lget('kuking:skill') || 5; }
  var SKL = ['', 'первый раз у плиты', 'умею яичницу', 'готовлю по рецепту', 'готовлю иногда', 'уверенно по рецепту', 'чувствую огонь', 'импровизирую', 'шарю', 'почти профи', 'профи'];

  function stepHTML(s) {
    var p = get(), b = body(), h = '';
    if (s === 'hi') return '<div class="qz-hi"><svg class="qz-logo" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="var(--orange)"/><path d="M32 13c3 7 11 11 11 21a11 11 0 0 1-22 0c0-5 3-8 5-10 0 4 2 6 4 6-1-6 2-12 2-17z" fill="var(--bg)"/></svg>' +
      '<h2 class="qz-h1">Жарко</h2><p class="qz-lead">' + (invited ? 'Вас пригласили в «Жарко». После знакомства и входа вы сразу окажетесь в друзьях у пригласившего.' : 'Давайте познакомимся — минута, и рецепты будут под вас.') + '</p>' +
      '<p class="small qz-note">Любой шаг можно пропустить и заполнить потом в профиле.</p></div>';
    if (s === 'name') return '<label class="set-f qz-f qz-big"><span>Имя</span><input id="qzName" maxlength="40" autocomplete="given-name" value="' + esc(p.name || myName()) + '" placeholder="Дима"></label>';
    if (s === 'goal') return '<div class="qz-cards">' + [['cut', 'Сушка', 'меньше калорий, больше белка'], ['keep', 'Держать форму', 'сытно и сбалансированно'], ['bulk', 'Набор массы', 'больше калорий и белка']].map(function (g) {
      return '<button type="button" class="qz-card" data-goal="' + g[0] + '" aria-pressed="' + (b.goal === g[0]) + '"><b>' + g[1] + '</b><small>' + g[2] + '</small></button>'; }).join('') + '</div>';
    if (s === 'body') return '<span class="qz-l">Пол</span>' + seg('sex', [['m', 'Мужской'], ['f', 'Женский']], b.sex) +
      '<div class="qz-row3"><label class="set-f qz-f"><span>Возраст</span><input data-bn="age" type="number" inputmode="numeric" min="13" max="99" value="' + (b.age || '') + '" placeholder="25"></label>' +
      '<label class="set-f qz-f"><span>Рост, см</span><input data-bn="h" type="number" inputmode="numeric" min="120" max="230" value="' + (b.h || '') + '" placeholder="180"></label>' +
      '<label class="set-f qz-f"><span>Вес, кг</span><input data-bn="w" type="number" inputmode="decimal" min="35" max="250" step="0.1" value="' + (b.w || '') + '" placeholder="80"></label></div>' +
      '<span class="qz-l">Тренировки в неделю</span>' + seg('act', [['low', 'Нет'], ['light', '1–3'], ['mid', '3–5'], ['high', 'Каждый день']], b.act) +
      '<span class="qz-l">Приёмов пищи в день</span>' + seg('meals', [['2', '2'], ['3', '3'], ['4', '4'], ['5', '5']], b.meals) +
      '<p class="qz-norm" id="qzNorm" aria-live="polite">' + norm() + '</p>';
    if (s === 'food') return foodHTML(p);
    if (s === 'taste') return tasteHTML(p);
    if (s === 'kit') return tiles(p.equip || []);
    if (s === 'cook') return '<span class="qz-l">Уровень: <b id="qzSkV">' + skill() + ' — ' + SKL[skill()] + '</b></span><input id="qzSkill" class="qz-range" type="range" min="1" max="10" value="' + skill() + '">' +
      '<span class="qz-l">Как часто готовите</span>' + seg('freq', [['r1', '1–2 в нед.'], ['r3', '3–4'], ['r5', '5–6'], ['r7', 'Каждый день']], b.freq) + timeHTML(p);
    if (s === 'notif') return notifHTML(p);
    if (s === 'done') return '<div class="qz-hi"><div class="qz-done" aria-hidden="true">✓</div><h2 class="qz-h1">Всё готово' + (p.name ? ', ' + esc(p.name) : '') + '</h2>' +
      '<p class="qz-lead">' + summary() + '</p><p class="small qz-note">Изменить можно в профиле: «Предпочтения», «Моя техника», «Уведомления».</p></div>';
    return h;
  }
  function summary() {
    var p = get(), b = body(), t = window.KBody && window.KBody.targets && window.KBody.targets(), out = [];
    if (t) out.push('норма ≈ ' + t.day.kcal + ' ккал в день');
    if (p.cuisines.length) out.push('кухни: ' + p.cuisines.slice(0, 3).join(', ').toLowerCase());
    if (p.equip) out.push('техники отмечено: ' + p.equip.length);
    return out.length ? 'Учли: ' + out.join(' · ') + '. Нейросеть соберёт стартовую подборку из 10 блюд под вас.' : 'Нейросеть соберёт стартовую подборку из 10 блюд.';
  }
  function myName() { var Soc = window.KukingSocial, me = Soc && Soc.me && Soc.me(), i = me && Soc.info ? Soc.info(me.id) || {} : {}; return i.name || ''; }

  function render(anim) {
    var s = STEPS[idx], last = idx === STEPS.length - 1;
    var segs = STEPS.map(function (x, i) { return '<i class="' + (i < idx ? 'done' : i === idx ? 'cur' : '') + '"></i>'; }).join('');
    var top = '<div class="qz-top"><div class="qz-prog" aria-hidden="true">' + segs + '</div><div class="qz-bar">' +
      (idx > 0 && !last ? '<button type="button" class="qz-tx" data-q="back" aria-label="Назад">‹ Назад</button>' : '<span></span>') +
      (!last ? '<button type="button" class="qz-tx" data-q="' + (idx === 0 ? 'later' : 'skip') + '">' + (idx === 0 ? 'Позже' : 'Пропустить') + '</button>' : '<span></span>') + '</div></div>';
    var mid = '<div class="qz-body"><div class="qz-step' + (anim ? ' in' + (dir > 0 ? 'R' : 'L') : '') + '">' + (TITLE[s] ? '<h2 class="qz-h">' + TITLE[s] + '</h2>' + (SUB[s] ? '<p class="small qz-sub">' + SUB[s] + '</p>' : '') : '') + stepHTML(s) + '</div></div>';
    var bot = '<div class="qz-foot"><button type="button" class="nav-btn primary qz-next" data-q="next">' + (idx === 0 ? 'Начать' : last ? 'Собрать мою подборку' : 'Дальше') + '</button>' +
      (last ? '<button type="button" class="qz-tx qz-later" data-q="finish">Просто открыть приложение</button>' : '') + '</div>';
    ov.innerHTML = top + mid + bot;
    var nm = ov.querySelector('#qzName'); if (nm && !anim) setTimeout(function () { try { nm.focus({ preventScroll: true }); } catch (e) {} }, 350);
  }
  function go(d) {
    commitName();
    var n = idx + d; if (n < 0 || n >= STEPS.length) return;
    var cur = ov.querySelector('.qz-step'); dir = d;
    hap(8);
    if (cur && !reduced()) { cur.classList.add(d > 0 ? 'outL' : 'outR'); setTimeout(function () { idx = n; render(true); }, 180); }
    else { idx = n; render(true); }
  }
  function reduced() { return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; }
  function commitName() {
    var nm = ov && ov.querySelector('#qzName'); if (!nm) return;
    var p = get(); p.name = nm.value.trim().slice(0, 40); set(p);
  }
  /* имя, аллергии и «не ем» — в анкету на сервере, чтобы видели друзья и общая нейросеть */
  function pushProfile() {
    var St = window.KukingStore, u = St && St.user && St.user(); if (!u || !St.req) return;
    var p = get(), d = { id: u.id, updated_at: new Date().toISOString() };
    if (p.name) d.name = p.name;
    var al = p.allergy.concat(p.allergyText ? [p.allergyText] : []).join(', '), av = p.avoid.concat(p.avoidText ? [p.avoidText] : []).join(', ');
    if (al) d.allergy = al; if (av) d.avoid = av;
    St.req('POST', 'profile_info?on_conflict=id', [d], 'resolution=merge-duplicates,return=minimal').then(function () { var Soc = window.KukingSocial; if (Soc && Soc.refresh) Soc.refresh(); }).catch(function () {});
  }
  function close(starter) {
    commitName(); lset(QK, new Date().toISOString().slice(0, 10)); pushProfile();
    ov.classList.remove('on'); document.documentElement.classList.remove('qz-lock');
    setTimeout(function () { if (ov) { ov.remove(); ov = null; } if (starter && window.__kStarter) window.__kStarter(); }, 320);
  }
  function open(force) {
    if (ov) return;
    try { invited = !!localStorage.getItem('kuking:invite'); } catch (e) {}
    idx = 0; dir = 1;
    ov = document.createElement('div'); ov.className = 'qz'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Знакомство');
    document.body.appendChild(ov); render(false);
    document.documentElement.classList.add('qz-lock');
    requestAnimationFrame(function () { requestAnimationFrame(function () { ov.classList.add('on'); }); });
    bindPrefs(ov, function (n, v) {
      if (n === 'sex' || n === 'act' || n === 'meals' || n === 'freq') { setBody(n, n === 'meals' ? +v : v); var nr = ov.querySelector('#qzNorm'); if (nr) nr.innerHTML = norm(); }
    });
    ov.addEventListener('click', function (e) {
      var b = e.target.closest('[data-q],[data-goal]'); if (!b) return;
      if (b.hasAttribute('data-goal')) { setBody('goal', b.getAttribute('data-goal')); ov.querySelectorAll('[data-goal]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); hap(8); setTimeout(function () { go(1); }, 260); return; }
      var q = b.getAttribute('data-q');
      if (q === 'next') { if (idx === STEPS.length - 1) close(true); else go(1); }
      if (q === 'skip') go(1);
      if (q === 'back') go(-1);
      if (q === 'later' || q === 'finish') close(false);
    });
    ov.addEventListener('input', function (e) {
      var i = e.target;
      if (i.hasAttribute('data-bn')) { var v = +i.value; setBody(i.getAttribute('data-bn'), v > 0 ? v : undefined); var nr = ov.querySelector('#qzNorm'); if (nr) nr.innerHTML = norm(); }
      if (i.id === 'qzSkill') { lset('kuking:skill', i.value); var o = ov.querySelector('#qzSkV'); if (o) o.textContent = i.value + ' — ' + SKL[+i.value]; }
    });
    ov.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.id === 'qzName') { e.preventDefault(); go(1); } });
    /* свайпы: влево — дальше, вправо — назад */
    var x0 = null, y0 = 0;
    ov.addEventListener('touchstart', function (e) { if (e.target.closest('input[type=range],.qz-tiles')) { x0 = null; return; } x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    ov.addEventListener('touchend', function (e) {
      if (x0 == null) return; var dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0; x0 = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) { if (dx < 0 && idx < STEPS.length - 1) go(1); else if (dx > 0 && idx > 0) go(-1); }
    }, { passive: true });
  }
  function seen() { return !!lget(QK); }
  /* первый запуск: после заставки */
  function auto() {
    if (seen()) return;
    var anim = document.getElementById('curtain'); var delay = anim && anim.classList.contains('anim') ? 2700 : 700;
    setTimeout(function () { if (!seen()) open(); }, delay);
  }
  if (document.readyState === 'complete') auto(); else addEventListener('load', auto);

  /* с сервера: предпочтения с другого телефона */
  function pull() {
    var St = window.KukingStore; if (!St || !St.user || !St.user() || !St.collection) return;
    try { St.collection('meta').doc('prefs').get().then(function (d) { var v = d && (d.data ? d.data() : d); if (v && v.prefs && !lget(K)) lset(K, JSON.stringify(v.prefs)); }).catch(function () {}); } catch (e) {}
  }
  setTimeout(pull, 3000);

  window.KPrefs = { get: get, set: set, notifOn: notifOn, has: has, promptLine: promptLine, pageHTML: pageHTML, bind: bindPrefs, openQuiz: open, EQ: EQ, SPICE: SPICE, BUDGET: BUDGET, TIME: TIME };
})();
