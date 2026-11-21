/* Рецепт v2: паспорт блюда — категория, кухня, главный продукт, диеты, сложность, техника, активное время.
   Явный r.meta (у встроенных и новых от нейросети) главнее; чего нет — досчитываем по продуктам и шагам;
   старые рецепты от нейросети размечает сама нейросеть при первом открытии (кэш в kuking:meta). */
(function () {
  var CATS = { main: 'Основное', soup: 'Первое', breakfast: 'Завтрак', dessert: 'Десерт', snack: 'Закуска', drink: 'Напиток', sauce: 'Соус' };
  var DIETS = { veg: 'Вегетарианское', vegan: 'Веганское', gf: 'Без глютена', protein: 'Много белка' };
  var CUISINES = ['Русская', 'Грузинская', 'Итальянская', 'Французская', 'Американская', 'Мексиканская', 'Индийская', 'Китайская', 'Японская', 'Корейская', 'Тайская', 'Ближневосточная', 'Средиземноморская', 'Узбекская', 'Европейская', 'Азиатская', 'Авторская'];
  var MAINS = ['Говядина', 'Свинина', 'Курица', 'Индейка', 'Баранина', 'Фарш', 'Рыба', 'Морепродукты', 'Бобовые и тофу', 'Яйца', 'Грибы', 'Сыр и творог', 'Овощи', 'Крупы и паста'];
  var EQUIP = { oven: 'Духовка', blender: 'Блендер', pan: 'Сковорода', pot: 'Кастрюля', grater: 'Тёрка', whisk: 'Венчик', strainer: 'Дуршлаг', jigger: 'Барный набор', airfryer: 'Аэрогриль', multi: 'Мультиварка', grill: 'Гриль' };
  var KEY = 'kuking:meta';

  var MEAT = /говя|свин|кури|индейк|баран|ягн|теля|фарш|бекон|колбас|ветчин|сосис|(?<![а-яё])утк|кролик|мяс|крыл|бедр|грудк|хамон|прошутт|чоризо|пеппер|стейк|р[её]бр|печен[ьи](?![а-яё])|(?<![а-яё])сало(?![а-яё])|гуанчиал|панчетт|желатин|бульон(?! овощ)|лопатк/;
  var FISH = /рыб|лосос|с[её]мг|тунец|треск|форел|кревет|кальмар|миди|краб|анчоус|икр[аы]|устриц|гребеш|дорад|сибас|сельд|скумбр|фиш/;
  var ANIMAL = /яйц|яиц|желтк|молок|сливк|сметан|(?<![а-яё])сыр(?!о[йею]|ая|ые|ого)|чеддер|пармез|моцарел|рикотт|фета|маскарп|творог|йогурт|сливочн|кефир|(?<![а-яё])м[её]д(?![а-яё])|гхи|топл[её]н|ряженк|айран|майонез|бриошь/;
  var GLUTEN = /пшен|мук[аи]|макарон|спагет|пенне|ригате|лингвин|фузилл|тальятел|паста(?! том)|(?:^|[^о])лапш(?!а рис)|хлеб|булк|булоч|багет|лаваш|панировк|сухар|кускус|булгур|ячмен|перлов|манк|ржан|пив[оа]|соев\w* соус|тесто|бриошь|(?<![а-яё])пита(?![а-яё])|крутон|фило|леп[её]шк|удон|рамен|сейтан|панко|вермиш|орзо|ньокки|пельмен|блин/;
  var MAINRX = [[/говя|теля|стейк|лопатк/, 'Говядина'], [/свин|бекон|гуанчиал|панчетт/, 'Свинина'], [/кури|крыл|бедр|грудк/, 'Курица'], [/индейк/, 'Индейка'], [/баран|ягн/, 'Баранина'], [/фарш/, 'Фарш'],
    [/рыб|лосос|с[её]мг|форел|треск|тунец|дорад|сибас|скумбр|сельд/, 'Рыба'], [/кревет|кальмар|миди|гребеш|краб/, 'Морепродукты'], [/тофу|(?<![а-яё])нут(?![а-яё])|фасол|чечевиц|бобов|горох/, 'Бобовые и тофу'],
    [/яйц|яиц/, 'Яйца'], [/гриб|шампин|вешенк/, 'Грибы'], [/творог|рикотт|(?<![а-яё])сыр(?![а-яё])|халлуми|фета|моцарел/, 'Сыр и творог']];
  var CUISRX = [[/тикк|масал|карри|индий|панир|(?<![а-яё])дал(?![а-яё])|бирьян/, 'Индийская'], [/сычуан|китай|(?<![а-яё])вок(?![а-яё])|кунг пао|гунбао|мапо/, 'Китайская'], [/тако|мексик|буррит|кесадил|гуакам|барбакоа|начос/, 'Мексиканская'],
    [/грузин|хачапур|чашушул|хинкал|чахохб|сацив|аджик|ткемал/, 'Грузинская'], [/итальян|ризотт|лазань|карбонар|болонь|ригате|пенне|спагет|ньокки/, 'Итальянская'],
    [/шаурм|ближневост|хумус|фалафел|шакшук|ливан|турец|кебаб/, 'Ближневосточная'], [/бургер|смэш|американ|баффало|крыл/, 'Американская'],
    [/строганов|русск|пельмен|борщ|щи(?![а-яё])|солянк|блин|котлет/, 'Русская'], [/япон|суши|рамен|терияк|мисо|удон|тонкацу/, 'Японская'], [/корей|кимчи|пулькоги|бибимбап/, 'Корейская'],
    [/тайск|том ям|пад тай/, 'Тайская'], [/француз|бургинь|рататуй|(?<![а-яё])киш(?![а-яё])|конфи/, 'Французская'], [/плов|узбек|лагман|самс/, 'Узбекская']];
  var CATRX = [[/суп|борщ|(?<![а-яё])щи(?![а-яё])|солянк|рамен|(?<![а-яё])фо(?![а-яё])|бульон|(?<![а-яё])уха(?![а-яё])|харчо/, 'soup'], [/завтрак|омлет|сырник|блин|каша|гранол|шакшук|яичниц|тост/, 'breakfast'],
    [/десерт|торт|пирог|мусс|тирамис|панна|морожен|печень|чизкейк|брауни/, 'dessert'], [/напит|коктейл|лимонад|смузи|глинтвейн/, 'drink'], [/соус(?! к)|(?<![а-яё])дип(?![а-яё])|песто/, 'sauce'], [/закуск|снэк|брускет|тапас/, 'snack']];

  function low(s) { return String(s || '').toLowerCase().replace(/ё/g, 'е'); }
  function mins(t) {
    t = String(t || ''); var h = /(\d+(?:[.,]\d+)?)\s*ч/.exec(t), m = /(\d+)\s*мин/.exec(t);
    var v = (h ? parseFloat(h[1].replace(',', '.')) * 60 : 0) + (m ? +m[1] : 0); return Math.round(v) || 0;
  }
  function names(r) { return (r.ingredients || []).filter(function (i) { return i && i.name; }).map(function (i) { return low(i.name); }); }
  function text(r) { return low([r.title, r.tagline, (r.tags || []).join(' ')].join(' ')); }

  function diets(r) {
    var n = names(r), out = [];
    var meat = n.some(function (s) { return MEAT.test(s); }), fish = n.some(function (s) { return FISH.test(s); });
    var animal = n.some(function (s) { return ANIMAL.test(s); }), gluten = n.some(function (s) { return GLUTEN.test(s) && !/рисов|гречн|без глют|томатн/.test(s); });
    if (!meat && !fish) out.push('veg');
    if (!meat && !fish && !animal) out.push('vegan');
    if (!gluten) out.push('gf');
    var d = (r.dishes || [])[0]; if (d && +d.p >= 40) out.push('protein');
    return out;
  }
  function mainOf(r) {
    var score = {};
    (r.ingredients || []).forEach(function (i) {
      if (!i || !i.name) return; var s = low(i.name);
      for (var k = 0; k < MAINRX.length; k++) if (MAINRX[k][0].test(s)) {
        var w = i.unit === 'кг' ? i.amount * 1000 : i.unit === 'г' ? i.amount : i.unit === 'шт' ? i.amount * 120 : 50;
        score[MAINRX[k][1]] = (score[MAINRX[k][1]] || 0) + (+w || 50); break;
      }
    });
    var best = Object.keys(score).sort(function (a, b) { return score[b] - score[a]; })[0];
    return best || (names(r).some(function (s) { return /рис|паст|макарон|греч|булгур|кускус|лапш/.test(s); }) ? 'Крупы и паста' : 'Овощи');
  }
  function pick(rx, s) { for (var i = 0; i < rx.length; i++) if (rx[i][0].test(s)) return rx[i][1]; return ''; }
  function equip(r) {
    var out = [];
    (r.tools || []).forEach(function (z) { (z.items || []).forEach(function (it) {
      var ic = String(it.icon || '').replace(/S$/, ''), nm = low(it.name);
      var k = /аэрогрил/.test(nm) ? 'airfryer' : /мультивар/.test(nm) ? 'multi' : /гриль/.test(nm) ? 'grill' : EQUIP[ic] ? ic : '';
      if (k && out.indexOf(EQUIP[k]) < 0) out.push(EQUIP[k]);
    }); });
    return out;
  }
  function timers(r) {
    var t = 0; JSON.stringify(r.slides || []).replace(/"min":(\d+)/g, function (m, v) { if (+v >= 8) t += +v; return m; }); return t;
  }
  function difficulty(r, total) {
    var steps = (r.slides || []).filter(function (s) { return s.type === 'step'; }).length;
    var lanes = JSON.stringify(r.slides || []).indexOf('"lanes"') >= 0;
    var d = 1 + (total > 35 ? 1 : 0) + (total > 90 ? 1 : 0) + (steps > 5 ? 1 : 0) + (lanes ? 1 : 0);
    return Math.max(1, Math.min(5, d));
  }

  function infer(r) {
    var total = mins(r.totalTime), t = text(r) + ' ' + names(r).join(' ');
    return {
      category: pick(CATRX, low(r.title)) || 'main',
      cuisine: pick(CUISRX, t),
      main: mainOf(r),
      diets: diets(r),
      difficulty: difficulty(r, total),
      equipment: equip(r),
      activeMin: total ? Math.max(10, Math.min(total, total - timers(r))) : 0,
      cost: null
    };
  }
  function norm(m) {
    if (!m || typeof m !== 'object') return null;
    var o = {};
    if (CATS[m.category]) o.category = m.category;
    if (typeof m.cuisine === 'string' && m.cuisine.trim()) o.cuisine = m.cuisine.trim().slice(0, 30);
    if (typeof m.main === 'string' && m.main.trim()) o.main = m.main.trim().slice(0, 30);
    if (Array.isArray(m.diets)) o.diets = m.diets.filter(function (d) { return DIETS[d]; });
    var d = Math.round(+m.difficulty); if (d >= 1 && d <= 5) o.difficulty = d;
    if (Array.isArray(m.equipment)) o.equipment = m.equipment.filter(function (e) { return typeof e === 'string' && e.trim(); }).map(function (e) { return e.trim().slice(0, 30); }).slice(0, 10);
    var a = Math.round(+m.activeMin); if (a > 0 && a < 600) o.activeMin = a;
    var c = Math.round(+m.cost); if (c > 0 && c < 100000) o.cost = c;
    return o;
  }
  function cache() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  /* итоговый паспорт: явное → разметка нейросети → вывод по продуктам. Диеты всегда сверяем с продуктами:
     «веганское» с йогуртом не пропустим, даже если нейросеть ошиблась. */
  function get(r) {
    if (!r) return null;
    var auto = infer(r), own = norm(r.meta) || {}, ai = norm(cache()[r.id]) || {}, out = {};
    Object.keys(auto).forEach(function (k) { out[k] = own[k] != null ? own[k] : ai[k] != null ? ai[k] : auto[k]; });
    out.diets = auto.diets; // диеты — только по продуктам
    out.tagged = !!(r.meta && r.meta.category) || !!cache()[r.id];
    return out;
  }

  /* старые рецепты нейросети: одна короткая просьба разметить */
  var busy = {};
  function aiTag(r) {
    if (!r || !r.ai || busy[r.id] || (r.meta && r.meta.category) || cache()[r.id]) return Promise.resolve(null);
    if (!(window.KukingAI && window.KukingAI.ready && window.KukingAI.ready())) return Promise.resolve(null);
    busy[r.id] = 1;
    var brief = { title: r.title, tagline: r.tagline, totalTime: r.totalTime, ingredients: names(r).slice(0, 30), tools: equip(r), steps: (r.slides || []).filter(function (s) { return s.type === 'step'; }).map(function (s) { return s.title; }) };
    var pr = { system: 'Ты технолог кухни. Размечаешь рецепт для каталога. Ответ — только JSON-объект без текста вокруг.',
      user: 'Рецепт: ' + JSON.stringify(brief) + '\nВерни {category, cuisine, main, difficulty, activeMin}:\n' +
        '- category — одно из: ' + Object.keys(CATS).join(', ') + '\n- cuisine — одно из: ' + CUISINES.join(', ') + '\n- main — одно из: ' + MAINS.join(', ') +
        '\n- difficulty — 1 (справится новичок) … 5 (ресторанная техника, много параллельных процессов)\n- activeMin — сколько минут человек реально занят у плиты и доски, без ожиданий' };
    return Promise.resolve(window.claude && window.claude.use ? window.claude.use('sample') : null).then(function (s) {
      if (!s) return null;
      return s.json(pr, { modelTier: 'default', cache: false, temperature: 0.2 }).then(function (v) {
        var m = norm(v); if (!m || !m.category) return null;
        var c = cache(); c[r.id] = m; try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {}
        return m;
      });
    }).catch(function () { return null; }).then(function (m) { delete busy[r.id]; return m; });
  }

  var HAT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18h10v2.5H7z"/><path d="M6.5 16.5h11l.6-5.2A3.6 3.6 0 0 0 15.6 5a4 4 0 0 0-7.2 0 3.6 3.6 0 0 0-2.5 6.3z"/></svg>';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var DLV = ['', 'легко', 'просто', 'средне', 'непросто', 'сложно'];
  /* паспорт блюда для карточки */
  function html(r) {
    var m = get(r); if (!m) return '';
    var h = '<div class="mt">';
    h += '<div class="mt-row">' + [CATS[m.category], m.cuisine, m.main].filter(Boolean).map(function (x) { return '<span class="mt-chip">' + esc(x) + '</span>'; }).join('') + '</div>';
    h += '<div class="mt-grid">' +
      '<div class="mt-cell"><span class="mt-k">Сложность</span><span class="mt-hats" aria-label="' + m.difficulty + ' из 5">' +
        [1, 2, 3, 4, 5].map(function (i) { return '<i class="' + (i <= m.difficulty ? 'on' : '') + '">' + HAT + '</i>'; }).join('') + '</span><span class="mt-v">' + DLV[m.difficulty] + '</span></div>' +
      (m.activeMin ? '<div class="mt-cell"><span class="mt-k">Активно</span><b class="mt-big">≈ ' + m.activeMin + ' мин</b><span class="mt-v">у плиты и доски</span></div>' : '') +
      '</div>';
    if (m.diets.length) h += '<div class="mt-row">' + m.diets.map(function (d) { return '<span class="mt-diet d-' + d + '">' + DIETS[d] + '</span>'; }).join('') + '</div>';
    if (m.equipment.length) {
      var miss = window.KPrefs ? m.equipment.filter(function (e) { return !KPrefs.has(e); }) : [];
      h += '<p class="mt-eq"><span class="mt-k">Техника</span> ' + m.equipment.map(function (e) { return miss.indexOf(e) >= 0 ? '<s class="mt-no">' + esc(e) + '</s>' : esc(e); }).join(' · ') + '</p>';
      if (miss.length) h += '<p class="small mt-miss">У тебя нет: ' + esc(miss.join(', ').toLowerCase()) + '. Скоро тут будет кнопка «Переделать под мою технику».</p>';
    }
    return h + '</div>';
  }

  window.KMeta = { get: get, infer: infer, norm: norm, aiTag: aiTag, html: html, CATS: CATS, DIETS: DIETS, CUISINES: CUISINES, MAINS: MAINS, EQUIP: EQUIP, mins: mins };
})();
