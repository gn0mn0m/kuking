/* Fresh — «Свежак»: рулетка тем → генерация рецепта нейросетью прямо в книге (capability sample)
   → проверка → полка «Свежак». Сгенерированные рецепты кэшируются в браузере (чтобы движок
   открыл их синхронно) и пишутся в db артефакта (коллекция fresh). В генерацию идут все оценки
   и комментарии (коллекция reviews) — шеф учится. Грузится ДО library.js. */
(function () {
  'use strict';
  var CKEY = 'kuking:fresh';
  function load(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var cache = load(CKEY, {});
  window.RECIPES = window.RECIPES || [];
  var base = window.RECIPES.slice(); // ручные рецепты — образец для нейросети
  Object.keys(cache).forEach(function (id) { window.RECIPES.push(cache[id]); });
  function saveCache() { try { localStorage.setItem(CKEY, JSON.stringify(cache)); } catch (e) {} }

  /* Темы рулетки = 10 идей от нейросети под вкус хаты. Пересобираются, как только меняются сигналы:
     оценки, комментарии, открытия рецептов, убранные, новые рецепты. Элемент: [название, суть, почему зайдёт, режим]. */
  var IKEY = 'kuking:ideas';
  var MODE_RU = { self: 'для себя', romance: 'романтика', friends: 'друзья' };
  var ideasState = load(IKEY, { sig: '', items: [] });
  var THEMES = [];
  function setIdeas(items, sig) {
    ideasState = { sig: sig, items: items };
    try { localStorage.setItem(IKEY, JSON.stringify(ideasState)); } catch (e) {}
    THEMES.length = 0;
    items.forEach(function (x) { THEMES.push([x.title, [x.pitch, MODE_RU[x.mode], x.protein, x.drink ? 'под ' + x.drink : ''].filter(Boolean).join(' · '), x.why || '', x.mode]); });
  }
  setIdeas(ideasState.items || [], ideasState.sig || '');
  function hash(str) { var h = 5381; for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  var IDEAS_V = 'plate3'; // меняется — старые идеи пересобираются
  function sigOf(ctx) { return hash(IDEAS_V + JSON.stringify(ctx.signals())); }
  function stale(ctx) { return !THEMES.length || ideasState.sig !== sigOf(ctx); }

  function ideasPrompt(sig) {
    var system = [
      '# РОЛЬ',
      'Ты — шеф уровня Мишлен и личный кулинарный куратор одной компании друзей (приложение «Кукинг»). Подбираешь блюда, которые им зайдут на 10/10.',
      '',
      '# ПРАВИЛА',
      '1. Каждая идея — ОДНО блюдо на одну тарелку: белок + гарнир или соус. Не сеты, не «вечера», не несколько подач.',
      '2. Высоко оценённое и похваленное — давай похожее по духу. Обруганное — избегай этих ошибок. Убранное — не нравится, похожего не предлагай. Чаще открываемое — тянет туда.',
      '3. Давность: готовили или открывали за последние ~7 дней — не предлагай то же блюдо и тот же главный белок в похожем виде.',
      '4. eaters.avoid — СТРОГО исключи из всех идей. eaters.likes — тянись к этому.',
      '5. Режимы: self — для себя, 1–2 чел, до 30 мин, минимум посуды и нарезки; romance — классика, красивая подача, под конкретный алкоголь, готовит один; friends — 5+ чел, сытно, двое у плиты, до 3 ч.',
      '6. Без вегетарианских, белок обязателен. Кухни разные и широкие. Микс: примерно 3 self, 3 romance, 4 friends, разные белки.',
      '',
      '# ФОРМАТ',
      'Ответ — ТОЛЬКО JSON-массив из 10 объектов, начни с [ и закончи ]. Без markdown и пояснений.',
      'Объект: {"title": "2–4 слова по-русски, с характером", "pitch": "до 60 знаков: что на тарелке", "mode": "self|romance|friends", "protein": "одним словом", "drink": "под что пить или пусто", "why": "до 80 знаков: почему зайдёт именно им"}'
    ].join('\n');
    var user = '# СИГНАЛЫ КОМПАНИИ (JSON)\n' + JSON.stringify(sig) + '\n\nПодбери 10 блюд.';
    return { system: system, user: user };
  }

  function refreshIdeas(ctx, ui) { // ui: {msg, sub, signal}
    var sig = ctx.signals(), key = hash(IDEAS_V + JSON.stringify(sig));
    return Promise.resolve(window.claude && window.claude.use ? window.claude.use('sample') : null).then(function (sample) {
      if (!sample) throw { code: 'not_granted' };
      function ask(note) {
        var pr = ideasPrompt(sig); if (note) pr.user += '\n\nПрошлый ответ не прочитался (' + note + '). Пришли ТОЛЬКО JSON-массив из 10 объектов, без текста вокруг.';
        return sample.json(pr, { modelTier: 'default', cache: false, signal: ui.signal, temperature: note ? 0.6 : 0.9,
          onText: function (u) { ui.sub.textContent = 'Набросал ' + Math.min(10, (u.text.match(/"title"/g) || []).length) + ' из 10'; } })
          .then(function (v) {
            var arr = Array.isArray(v) ? v : v && typeof v === 'object' ? (v.ideas || v.items || v.dishes || Object.keys(v).map(function (k) { return v[k]; }).filter(Array.isArray)[0]) : null;
            if (!arr || arr.filter(function (x) { return x && x.title; }).length < 3) throw { code: 'invalid_json', message: 'меньше трёх идей' };
            return arr;
          });
      }
      return ask().catch(function (e) { if (e && (e.code === 'cancelled' || e.code === 'not_granted' || e.code === 'bad_key' || e.code === 'network')) throw e; return ask(e && e.message || 'кривой JSON'); });
    }).then(function (arr) {
      var items = (Array.isArray(arr) ? arr : []).filter(function (x) { return x && x.title; }).slice(0, 10).map(function (x) {
        return { title: String(x.title), pitch: String(x.pitch || ''), mode: MODE_RU[x.mode] ? x.mode : 'friends', protein: String(x.protein || ''), drink: String(x.drink || ''), why: String(x.why || '') };
      });
      if (items.length < 3) throw { code: 'invalid_json' };
      setIdeas(items, key);
      if (ctx.ideasChanged) ctx.ideasChanged(ideasState);
    });
  }
  function useIdea(i) { // идея ушла в рецепт — убираем её из барабана
    var items = ideasState.items.slice(); items.splice(i, 1);
    setIdeas(items, ideasState.sig);
  }

  function aiMsg(e) { // понятная причина облома
    var c = e && e.code;
    return c === 'not_granted' ? 'Нейросеть не настроена — добавь свой ключ' : c === 'bad_key' ? 'Ключ не подошёл — проверь в настройках' :
      c === 'bad_model' ? 'Такой модели у провайдера нет' : c === 'rate_limited' ? 'Лимит у провайдера, попробуй позже' :
      c === 'network' ? 'Нет связи с нейросетью' : c === 'invalid_json' ? 'Нейросеть ответила неразборчиво даже со второй попытки — попробуй ещё или модель посильнее' : 'Шеф накосячил';
  }
  window.KukingAIMsg = aiMsg;

  /* ---------- проверка и починка ответа ---------- */
  var ICONS = 'pot potS pan panS blender oven strainer jigger tin glass board grater whisk cup plate plateC bowl glassbowl'.split(' ');
  var ARTS = ['main', 'aperitivo', 'chicken', 'burger', 'wings', 'pasta'];
  var ROUNDS = ['ceil', 'int', 'g50', 'g10', 'ml5', 'spoon', 'dec1', 'fixed'];
  var TYPES = ['cover', 'shop', 'tools', 'step', 'serve', 'final'];

  function str(v, d) { return typeof v === 'string' && v.trim() ? v : (d || ''); }
  function arr(v) { return Array.isArray(v) ? v : []; }

  function fix(r, theme, mode) {
    if (!r || typeof r !== 'object') throw new Error('не объект');
    var out = {
      id: 'ai-' + Date.now().toString(36),
      mode: MODE_RU[mode] ? mode : 'friends', ai: true, theme: theme, added: new Date().toISOString().slice(0, 10),
      tags: arr(r.tags).filter(function (t) { return typeof t === 'string'; }).slice(0, 8),
      title: str(r.title, theme), tagline: str(r.tagline),
      baseGuests: Math.max(1, Math.min(12, (r.baseGuests | 0) || (mode === 'self' ? 2 : mode === 'romance' ? 3 : 5))),
      totalTime: str(r.totalTime, '≈ 3 ч'),
      groups: arr(r.groups).map(String).filter(Boolean),
      ingredients: [], dishes: [], phases: [], tools: [], slides: []
    };
    if (!out.groups.length) out.groups = ['Продукты'];
    var ids = {};
    arr(r.ingredients).forEach(function (i) {
      if (!i || !/^\w+$/.test(String(i.id || '')) || ids[i.id]) return;
      var x = { id: String(i.id), name: str(i.name, i.id) };
      if (i.hidden) x.hidden = true;
      x.g = Math.max(0, Math.min(out.groups.length - 1, i.g | 0));
      if (typeof i.amount === 'number' && isFinite(i.amount) && i.amount > 0) {
        x.amount = i.amount; x.unit = str(i.unit, 'шт');
        x.round = ROUNDS.indexOf(i.round) >= 0 ? i.round : 'dec1';
      } else { x.amount = null; x.unitText = str(i.unitText, ''); }
      if (i.buy) x.buy = true;
      ids[x.id] = 1; out.ingredients.push(x);
    });
    if (out.ingredients.length < 3) throw new Error('мало продуктов');
    out.dishes = arr(r.dishes).filter(function (d) { return d && d.name; }).map(function (d) {
      return { name: String(d.name), desc: str(d.desc), kcal: +d.kcal || 0, p: +d.p || 0, f: +d.f || 0, c: +d.c || 0 };
    });
    if (!out.dishes.length) throw new Error('нет блюд');
    out.phases = arr(r.phases).filter(function (p) { return p && p.name; }).map(function (p) { return { t: str(p.t, ''), name: String(p.name) }; });
    out.tools = arr(r.tools).filter(function (z) { return z && z.zone; }).map(function (z) {
      return { zone: String(z.zone), items: arr(z.items).filter(function (t) { return t && t.name; }).map(function (t, k) {
        return { id: /^\w+$/.test(String(t.id || '')) ? String(t.id) : 't' + k + Math.random().toString(36).slice(2, 5), icon: ICONS.indexOf(t.icon) >= 0 ? t.icon : 'pot', name: String(t.name), use: str(t.use) };
      }) };
    }).filter(function (z) { return z.items.length; });
    if (!out.tools.length) throw new Error('нет посуды');

    function txt(t) { // неизвестные {id} → просто текст
      return String(t || '').replace(/\{(\w+)(?::([\d.]+))?\}/g, function (m, id) { return ids[id] || id === 'guests' ? m : id; });
    }
    function acts(list) {
      return arr(list).filter(function (a) { return a && a.t; }).map(function (a) {
        var x = { t: txt(a.t) };
        if (a.tool) x.tool = String(a.tool);
        if (a.minGuests) x.minGuests = a.minGuests | 0;
        if (a.how) x.how = txt(a.how);
        if (a.clean) x.clean = txt(a.clean);
        if (a.cut && window.Cuts && window.Cuts.keys.indexOf(a.cut) >= 0) x.cut = a.cut;
        if (a.timer && +a.timer.min > 0) x.timer = { id: 'tm' + Math.random().toString(36).slice(2, 7), min: Math.min(240, +a.timer.min), label: str(a.timer.label, 'Таймер') };
        return x;
      });
    }
    arr(r.slides).forEach(function (s) {
      if (!s || TYPES.indexOf(s.type) < 0 || s.type === 'final') return;
      var x = { type: s.type, short: str(s.short, s.type) };
      if (s.type === 'cover') x.lede = txt(s.lede);
      if (s.type === 'shop' || s.type === 'tools') { x.title = str(s.title, s.type === 'shop' ? 'Список продуктов' : 'Поверхности и посуда'); x.note = txt(s.note); }
      if (s.type === 'step') {
        x.title = str(s.title, 'Шаг'); x.time = str(s.time); x.dur = str(s.dur); x.joke = txt(s.joke);
        if (s.lanes && (arr(s.lanes.chef).length || arr(s.lanes.sous).length)) x.lanes = { chef: acts(s.lanes.chef), sous: acts(s.lanes.sous) };
        else x.both = acts(s.both);
        if (!(x.lanes || (x.both && x.both.length))) return;
      }
      if (s.type === 'serve') {
        x.title = str(s.title, 'Подача'); x.art = ARTS.indexOf(s.art) >= 0 ? s.art : 'main';
        x.dishes = arr(s.dishes).map(String); x.points = arr(s.points).map(txt).filter(Boolean);
      }
      out.slides.push(x);
    });
    ['shop', 'tools', 'cover'].forEach(function (t) { // обязательные экраны на своих местах
      if (!out.slides.some(function (s) { return s.type === t; })) {
        out.slides.unshift(t === 'cover' ? { type: 'cover', short: 'Меню', lede: out.tagline } : t === 'shop' ? { type: 'shop', short: 'Продукты', title: 'Список продуктов', note: '' } : { type: 'tools', short: 'Посуда', title: 'Поверхности и посуда', note: '' });
      }
    });
    var order = { cover: 0, shop: 1, tools: 2 };
    out.slides.sort(function (a, b) { return (order[a.type] != null ? order[a.type] : 3) - (order[b.type] != null ? order[b.type] : 3); });
    if (!out.slides.some(function (s) { return s.type === 'step'; })) throw new Error('нет шагов');
    out.slides.push({ type: 'final', short: 'Финал' });
    return out;
  }

  /* ---------- промпт ---------- */
  var COMPANY = {
    self: '- Режим «для себя»: baseGuests 2, готовит один — во всех шагах используй поле both (без lanes). Максимально просто и быстро: активная готовка до 30 мин, минимум посуды и нарезки, без докупки специй. Подача простая, но в правильном порядке.',
    romance: '- Режим «романтика»: baseGuests 3, готовит один — во всех шагах используй поле both (без lanes). Классика, максимальный вкус без излишеств, красивая подача, всё под конкретный алкоголь (назови его). Можно несколько блюд, но в соло реально успеть.',
    friends: '- Режим «друзья»: baseGuests 5, двое у плиты: шеф (chef) и су-шеф (sous) — шаги через lanes. Шеф ленивый: соусы, блендер, финальные штрихи. Тяжёлая нарезка — су-шефу. Нагрузка на слайде равная, задачи не переплетать, никто не прыгает между чужими задачами. Порции большие, несколько блюд.'
  };
  COMPANY.self += ' Сначала вся нарезка, потом готовка.'; COMPANY.romance += ' Сначала вся нарезка, потом готовка.'; COMPANY.friends += ' Сначала вся нарезка, потом готовка.';
  /* что значит каждый уровень повара — так нейросеть понимает, насколько подробно писать */
  var SKILL_RULES = [null,
    '1 — первый раз у плиты. Объясняй каждое движение: как держать нож, какой огонь «средний», как понять, что масло горячее, когда и чем мешать. how в каждом действии, без терминов. Только простые техники.',
    '2 — умеет яичницу. how почти везде, термины объясняй в скобках. Простые техники, без фламбе и эмульсий на глаз.',
    '3 — готовит по рецепту, путается в терминах. how на всех неочевидных шагах, признаки готовности — цветом, звуком, на ощупь.',
    '4 — готовит иногда. how на сложных шагах (обжарка до корочки, загущение соуса, проверка готовности мяса).',
    '5 — уверенно по рецепту. how только на нетривиальных техниках. Шаги короткие и чёткие.',
    '6 — чувствует огонь и время. how редко. Можно техники посложнее: глазировка, эмульсия, деглазирование.',
    '7 — импровизирует, знает технику. how почти не нужен, можно профессиональные приёмы и термины.',
    '8 — шарит. Только суть и цифры: температура, время, размеры. how не пиши.',
    '9 — почти профи. Максимально сжато, ресторанные техники приветствуются.',
    '10 — профи. Как карточка ресторанной кухни: граммы, градусы, минуты, без объяснений.'];
  function skillRule() { return SKILL_RULES[skill()]; }
  function skill() { var v = 5; try { v = +localStorage.getItem('kuking:skill') || 5; } catch (e) {} return Math.max(1, Math.min(10, v)); }
  /* ---------- промпт рецепта: system — постоянные правила, user — данные этой задачи ----------
     Нейросеть (GigaChat и любая другая) лучше держит формат, когда правила отделены от данных,
     разбиты на короткие нумерованные пункты, есть схема полей, образец и чек-лист самопроверки. */
  var SCHEMA = [
    'Корневой объект:',
    '  title — название блюда по-русски, 2–5 слов, с характером',
    '  tagline — что на тарелке, до 90 знаков',
    '  baseGuests — число порций, на которое посчитаны количества',
    '  totalTime — общее время, строка вида «≈ 1 ч 10 мин»',
    '  tags — 3–6 коротких тегов',
    '  groups — названия групп продуктов: ["Мясо", "Овощи", "Соус", …]',
    '  ingredients — [{id, g, name, amount, unit, round, buy?}]: id латиницей (beef, rice); g — индекс в groups; amount — число на baseGuests; unit — г, кг, мл, л, шт, ч.л., ст.л.; round — правило округления; buy:true — если надо докупить. Для «по вкусу» вместо amount/unit дай unitText',
    '  dishes — [{name, kcal, p, f, c}] на ОДНУ порцию',
    '  phases — [{t:"0:00", name}] таймлайн',
    '  tools — [{zone, items:[{id, icon, name, use}]}] посуда и поверхности',
    '  slides — по порядку: cover {type,short,lede}, shop {type,short,title,note}, tools {type,short,title,note}, step… , serve {type,short,title,dishes,art,points}',
    '  step: {type:"step", short, title, time:"0:00 – 0:20", dur:"20 мин", both:[действия]} — для одного повара; для двоих вместо both — chef:[…] и sous:[…]; joke — прикол',
    '  действие: {t, tool?, timer?:{min,label}, cut?, how?, clean?}. В t вставляй количества как {id} или {id:часть}, главное — **жирным**'
  ].join('\n');
  function people() {
    var e = window.KukingSocial && window.KukingSocial.eaters ? window.KukingSocial.eaters() : [];
    return e.length ? e.map(function (x) { return '- ' + x.who + (x.likes ? ' — любит: ' + x.likes : '') + (x.avoid ? ' — НЕ ЕСТ: ' + x.avoid : ''); }).join('\n') : '- анкет нет';
  }
  function sampleFor(mode) {
    var id = mode === 'friends' ? 'smash-night' : 'sichuan-beef';
    return base.filter(function (r) { return r.id === id; })[0] || base[base.length - 1];
  }
  function buildPrompt(theme, reviews, existing, retryNote) {
    var mode = MODE_RU[theme[3]] ? theme[3] : 'friends', sk = skill();
    var fb = Object.keys(reviews || {}).map(function (id) {
      var v = reviews[id]; return '- «' + (v.title || id) + '» — ' + v.score + '/10' + (v.comment ? ': ' + v.comment : '');
    });
    var system = [
      '# РОЛЬ',
      'Ты — шеф-повар уровня Мишлен и автор рецептов для домашнего приложения-слайдшоу «Кукинг». Пишешь по-русски, голосом свояка 25 лет с характером рокера: чуть тюремной фени и мата по делу, 2–3 прикола за рецепт в поле joke. Инструкции при этом кристально простые — человек готовит и, возможно, выпивает.',
      '',
      '# ГЛАВНОЕ',
      '1. Одно блюдо на одну тарелку: белок + гарнир и соус на той же тарелке. Без закусок и второй подачи.',
      '2. Отзывы хаты — высший приоритет, выше любых правил: что хвалили — повторяй приёмом, что ругали — исключи.',
      '3. Что человек НЕ ЕСТ — нет ни в одном шаге, соусе, гарнире и подаче.',
      '4. Гарнир и основное готовы в ОДНУ минуту: ничего не ждёт и не остывает. Воду заранее доведи до кипения и держи на минимуме под крышкой.',
      '5. Сначала вся нарезка, потом готовка. Каждая нарезка — форма и размер в мм/см («поперёк волокон полосками 3 мм»).',
      '6. Параллельные дела пиши на том слайде, где они реально наступают («таймер риса звякнул — снимай с огня»), чтобы не листать назад.',
      '7. Финальная сборка — прямо: что куда идёт и что остаётся отдельно.',
      '',
      '# ПРАВИЛА',
      '- Только метрика по-русски: г, кг, мл, л, шт, ч.л., ст.л. Джиггер не мерная ёмкость.',
      '- До 4 действий на повара в шаге. Таймер — только где реально ждёшь (варка, духовка, маринад), не на «до корочки».',
      '- Люди готовят медленно: время в time, dur, phases, totalTime — в 1,5 раза больше обычного. Активная готовка до 3 ч.',
      '- Порция: ~60 г белка и ~100 г углеводов. Гарнир 70–100 г сухой крупы/пасты или 400 г картофеля, мясо 200–225 г сырого. Не перебарщивай: «2 порции» должны быть 2, а не 4. КБЖУ считай честно на одну порцию.',
      '- У каждого действия у плиты — посуда в tool. Одна посуда не занята двумя делами сразу.',
      '- Поле how — «как это делается и как понять, что готово»: тем подробнее и чаще, чем ниже уровень повара.',
      '- Поле clean — когда помыть доску и нож (особенно после сырого мяса), что убрать в шкаф, что залить водой. К подаче стол чистый.',
      '- Поле cut — картинка нарезки, одна из: ' + (window.Cuts ? window.Cuts.keys.join(', ') : '—') + '. Только если подходит.',
      '- Вкус в балансе: соль, кислота, жир, сладость, острота. Умами и техники лучших шефов. Специи можно предложить докупить (buy:true).',
      '- Каждый {id} в тексте есть в ingredients, каждый продукт используется в шагах, сумма частей {id:часть} ≈ общему количеству.',
      '- icon посуды — одна из: ' + ICONS.join(', ') + '. round — одна из: ' + ROUNDS.join(', ') + '. serve.art — одна из: main, aperitivo, chicken, burger, wings, pasta.',
      '',
      '# ОБОРУДОВАНИЕ (только это)',
      'Духовка с противнем; сковороды большая, средняя, маленькая; кастрюли две средние и маленькая; блендер; барный инвентарь. Подача: большая плоская тарелка, средние плоские с кракелюром, белая глубокая миска, большая и средняя стеклянные миски.',
      '',
      '# ФОРМАТ ОТВЕТА',
      'Ответ — ТОЛЬКО один JSON-объект. Начни с символа { и закончи }. Без markdown, без ``` и без пояснений до или после.',
      SCHEMA,
      '',
      '# ПРОВЕРЬ СЕБЯ ПЕРЕД ОТВЕТОМ',
      '- JSON валиден: двойные кавычки, нет запятых в конце, нет комментариев.',
      '- Есть cover, shop, tools, хотя бы 2 шага step и serve.',
      '- Нет запрещённых продуктов. Гарнир и основное готовы одновременно.',
      '- Количества реалистичны для baseGuests, КБЖУ на одну порцию.'
    ].join('\n');
    var user = [
      '# ЗАДАЧА',
      'Рецепт: «' + theme[0] + '»' + (theme[1] ? ' — ' + theme[1] : '') + '.' + (theme[2] ? ' Почему зайдёт: ' + theme[2] + '.' : ''),
      'Режим: ' + mode + ' (' + MODE_RU[mode] + ').',
      COMPANY[mode],
      '',
      '# ПОВАР',
      'Уровень готовки ' + sk + ' из 10. Что это значит: ' + skillRule(),
      '',
      '# КТО ЕСТ (анкеты)',
      people(),
      '',
      '# ОТЗЫВЫ НА ПРОШЛЫЕ РЕЦЕПТЫ (высший приоритет)',
      fb.length ? fb.join('\n') : '- пока нет',
      '',
      '# УЖЕ ЕСТЬ В КНИГЕ — не повторяй',
      existing.join(', ') || '—',
      '',
      '# ОБРАЗЕЦ (только структура и уровень детализации; блюдо, тему и текст НЕ копируй)',
      JSON.stringify(sampleFor(mode)),
      retryNote ? '\n# ИСПРАВЬ\nПрошлый ответ не прошёл проверку: ' + retryNote + '. Пришли заново полный исправленный JSON.' : ''
    ].join('\n');
    return { system: system, user: user };
  }

  /* ---------- пересборка идей перед рулеткой ---------- */
  function prep(ctx, done) {
    var m = document.createElement('div'); m.className = 'rl-ov';
    m.innerHTML = '<div class="rl-box" role="dialog" aria-modal="true" aria-label="Подбор идей"><button type="button" class="rl-x">✕ Выйти</button>' +
      '<p class="eyebrow rl-k">Заряжаю барабан</p><div class="fr-gen"><div class="fr-pot" aria-hidden="true"><i></i><i></i><i></i></div>' +
      '<p class="fr-msg">Подбираю 10 блюд под ваш вкус…</p><p class="small fr-sub">Смотрю оценки, комменты и что вы открывали</p></div><div class="rl-btns" hidden></div></div>';
    document.body.appendChild(m);
    var ctl = new AbortController();
    function shut() { ctl.abort(); m.remove(); document.removeEventListener('keydown', k); }
    function k(e) { if (e.key === 'Escape') shut(); }
    document.addEventListener('keydown', k);
    m.querySelector('.rl-x').addEventListener('click', shut);
    refreshIdeas(ctx, { sub: m.querySelector('.fr-sub'), signal: ctl.signal }).then(function () {
      m.remove(); document.removeEventListener('keydown', k); done();
    }).catch(function (e) {
      if (e && e.code === 'cancelled') return;
      var code = e && e.code;
      m.querySelector('.fr-gen').hidden = true;
      m.querySelector('.rl-k').textContent = 'Облом';
      var b = m.querySelector('.rl-btns'); b.hidden = false;
      if (THEMES.length) { // старые идеи остаются — можно крутить их
        b.innerHTML = '<p class="small" style="flex-basis:100%;margin:0 0 6px">Не вышло обновить, крутим прошлые идеи.</p><button type="button" class="nav-btn primary">Крутить</button>';
        b.querySelector('button').addEventListener('click', function () { m.remove(); document.removeEventListener('keydown', k); ideasState.sig = sigOf(ctx); spin(ctx); });
      } else {
        b.innerHTML = '<p class="small" style="margin:0">' + aiMsg(e) + '.' + '</p>';
      }
    });
  }

  /* ---------- рулетка тем + генерация ---------- */
  function spin(ctx, fixedI, custom) {
    if (!custom && fixedI == null && stale(ctx)) return prep(ctx, function () { spin(ctx); });
    if (!custom && !THEMES.length) {
      var e = document.createElement('div'); e.className = 'rl-ov';
      e.innerHTML = '<div class="rl-box" role="dialog" aria-modal="true" aria-label="Рулетка свежака"><button type="button" class="rl-x">✕ Выйти</button><p class="rl-res">В барабане пусто</p><p class="small">Темы ещё не заданы.</p></div>';
      document.body.appendChild(e);
      var x = function () { e.remove(); document.removeEventListener('keydown', k); };
      var k = function (ev) { if (ev.key === 'Escape') x(); };
      e.querySelector('.rl-x').addEventListener('click', x); e.addEventListener('click', function (ev) { if (ev.target === e) x(); });
      document.addEventListener('keydown', k);
      return;
    }
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var direct = fixedI != null || !!custom;
    var pickI = fixedI != null ? fixedI : (Math.random() * Math.max(1, THEMES.length)) | 0, pick = custom || THEMES[pickI];
    var N = 34, target = N - 4, seq = [];
    for (var i = 0; i < N; i++) seq.push(THEMES.length ? THEMES[(pickI + 7 + i * 5) % THEMES.length] : pick);
    seq[target] = pick;
    var m = document.createElement('div');
    m.className = 'rl-ov';
    m.innerHTML = '<div class="rl-box" role="dialog" aria-modal="true" aria-label="Рулетка свежака">' +
      '<button type="button" class="rl-x" aria-label="Выйти из рулетки">✕ Выйти</button>' +
      '<p class="eyebrow rl-k">Крутим тему…</p>' +
      '<div class="rl-win"><div class="rl-strip">' + seq.map(function (t, k) {
        return '<div class="rl-card rl-fresh' + (k === target ? ' rl-t' : '') + '"><span class="rl-time">' + esc(MODE_RU[t[3]] || 'свежак') + '</span><b>' + esc(t[0]) + '</b><span class="rl-tag">' + esc(t[1]) + '</span></div>';
      }).join('') + '</div><i class="rl-pin" aria-hidden="true"></i></div>' +
      '<div class="rl-res" aria-live="polite"></div>' +
      '<div class="fr-gen" hidden><div class="fr-pot" aria-hidden="true"><i></i><i></i><i></i></div><p class="fr-msg">Шеф думает…</p><p class="small fr-sub"></p></div>' +
      '<div class="rl-btns" hidden></div>' +
      '</div>';
    document.body.appendChild(m);
    var strip = m.querySelector('.rl-strip'), win = m.querySelector('.rl-win'), cards = strip.children;
    var btns = m.querySelector('.rl-btns'), gen = m.querySelector('.fr-gen'), res = m.querySelector('.rl-res'), k = m.querySelector('.rl-k');
    var cw = cards[0].getBoundingClientRect().width + 12;
    var end = -(target * cw) + (win.clientWidth / 2 - cw / 2) + (Math.random() - 0.5) * cw * 0.5;
    var anim = strip.animate([{ transform: 'translate3d(0,0,0)' }, { transform: 'translate3d(' + end.toFixed(1) + 'px,0,0)' }],
      { duration: reduce || direct ? 1 : 4600, easing: 'cubic-bezier(.12,.75,.12,1)', fill: 'forwards' });
    var ctl = null, busy = false;

    function setBtns(html) { btns.innerHTML = html; btns.hidden = !html; var f = btns.querySelector('.primary'); if (f) f.focus(); }
    function shut() { if (ctl) ctl.abort(); try { anim.cancel(); } catch (e) {} m.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') shut(); }
    document.addEventListener('keydown', onKey);
    m.addEventListener('click', function (e) { if (e.target === m && !busy) shut(); });
    m.querySelector('.rl-x').addEventListener('click', shut);

    anim.onfinish = function () {
      cards[target].classList.add('rl-win-card');
      k.textContent = 'Тема вечера';
      res.textContent = pick[0];
      setBtns('<button type="button" class="nav-btn" data-a="again">Ещё раз</button><button type="button" class="nav-btn primary" data-a="gen">Генерим рецепт</button>');
      if (direct) generate();
    };
    btns.addEventListener('click', function (e) {
      var a = e.target.closest('[data-a]'); if (!a) return;
      a = a.getAttribute('data-a');
      if (a === 'again') { shut(); spin(ctx); }
      else if (a === 'gen') generate();
      else if (a === 'stop') { if (ctl) ctl.abort(); }
      else if (a === 'close') shut();
      else if (a === 'setup') { shut(); if (window.KukingSettings) window.KukingSettings.open('ai'); }
      else if (a === 'go') ctx.choose(m.getAttribute('data-new'));
    });

    function generate() {
      if (busy) return;
      busy = true;
      win.hidden = true; gen.hidden = false;
      k.textContent = 'Свежак на тему';
      var msg = gen.querySelector('.fr-msg'), sub = gen.querySelector('.fr-sub');
      msg.textContent = 'Шеф думает… обычно 1–3 минуты';
      sub.textContent = 'Учитывает все ваши оценки и комментарии';
      setBtns('<button type="button" class="nav-btn" data-a="stop">Стоп</button>');
      ctl = new AbortController();
      var lines = ['Режет лук…', 'Пробует соус на соль…', 'Считает граммы на братву…', 'Делит работу шефу и су-шефу…', 'Подбирает посуду…', 'Шлифует феню…'];
      var li = 0;
      Promise.resolve(window.claude && window.claude.use ? window.claude.use('sample') : null).then(function (sample) {
        if (!sample) throw { code: 'not_granted' };
        var existing = window.RECIPES.map(function (r) { return '«' + r.title + '»'; });
        function attempt(note) {
          return sample.json(buildPrompt(pick, ctx.reviews(), existing, note), {
            modelTier: 'complex', cache: false, signal: ctl.signal, temperature: 0.6,
            onText: function (u) { msg.textContent = (note ? 'Шеф переписывает… ' : '') + lines[Math.min(lines.length - 1, (u.text.length / 3500) | 0)]; sub.textContent = 'Написано ' + Math.round(u.text.length / 1000) + ' тыс. знаков'; }
          }).then(function (json) { return fix(json, pick[0], pick[3]); });
        }
        /* не прошло проверку — одна попытка с подсказкой, что не так */
        return attempt().catch(function (e) {
          if (e && (e.code === 'cancelled' || e.code === 'not_granted' || e.code === 'bad_key' || e.code === 'network')) throw e;
          return attempt(e && e.message ? e.message : 'кривой JSON');
        });
      }).then(function (r) {
        var used = THEMES.indexOf(pick); if (used >= 0) useIdea(used);
        cache[r.id] = r; saveCache();
        window.RECIPES.push(r);
        ctx.added(r);
        busy = false;
        gen.hidden = true; k.textContent = 'Готово, на полке «Свежак»';
        res.textContent = r.title;
        m.setAttribute('data-new', r.id);
        setBtns('<button type="button" class="nav-btn" data-a="close">На полку</button><button type="button" class="nav-btn primary" data-a="go">Готовим это</button>');
        if (window.Confetti && !reduce) try { window.Confetti.fire({ anchor: res }); } catch (e) {}
      }).catch(function (e) {
        busy = false;
        var code = e && e.code;
        if (code === 'cancelled') { shut(); return; }
        gen.hidden = true; k.textContent = 'Облом';
        res.textContent = aiMsg(e);
        setBtns('<button type="button" class="nav-btn" data-a="close">Закрыть</button>' + (code === 'not_granted' ? '<button type="button" class="nav-btn primary" data-a="setup">Настроить нейросеть</button>' : '<button type="button" class="nav-btn primary" data-a="gen">Ещё попытка</button>'));
      });
    }
  }

  /* ---------- синхронизация с db ---------- */
  function fromDoc(d) { try { return JSON.parse(d.recipe); } catch (e) { return null; } }
  function merge(docs) { // рецепты из базы, которых нет в кэше этого браузера
    var added = [];
    docs.forEach(function (d) {
      if (cache[d.id]) return;
      var r = fromDoc(d.data); if (!r || !r.slides) return;
      cache[d.id] = r; window.RECIPES.push(r); added.push(r);
    });
    if (added.length) saveCache();
    return added;
  }
  function toDoc(r) { return { title: r.title, theme: r.theme || '', createdAt: new Date().toISOString(), recipe: JSON.stringify(r) }; }
  function forget(id) { delete cache[id]; saveCache(); }

  /* своя идея: «хочу шаурму с ананасом» → рецепт */
  function custom(ctx, idea, mode) { spin(ctx, null, [String(idea).slice(0, 120), '', '', MODE_RU[mode] ? mode : 'self']); }
  /* ручной рецепт из редактора: та же проверка, что у нейросети */
  function manual(ctx, loose, prevId) {
    var r = fix(loose, loose.title, loose.mode);
    r.id = prevId || 'my-' + Date.now().toString(36); r.ai = false; r.manual = loose; delete r.theme;
    cache[r.id] = r; saveCache();
    var i = window.RECIPES.map(function (x) { return x.id; }).indexOf(r.id);
    if (i >= 0) window.RECIPES[i] = r; else window.RECIPES.push(r);
    ctx.added(r, i >= 0);
    return r;
  }
  window.Fresh = { custom: custom, manual: manual, spin: spin, merge: merge, toDoc: toDoc, forget: forget, themes: THEMES, stale: stale, refresh: refreshIdeas, setIdeas: setIdeas };
})();
