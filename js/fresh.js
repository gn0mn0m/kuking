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

  /* Темы рулетки = 10 идей от нейросети под вкус компании. Пересобираются, как только меняются сигналы:
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
  var IDEAS_V = 'plate4'; // меняется — старые идеи пересобираются
  function sigOf(ctx) { return hash(IDEAS_V + JSON.stringify(ctx.signals())); }
  function stale(ctx) { return !THEMES.length || ideasState.sig !== sigOf(ctx); }

  function ideasPrompt(sig) {
    var system = [
      '# РОЛЬ',
      'Ты — шеф уровня Мишлен и личный кулинарный куратор одной компании друзей (приложение «Жарко»). Подбираешь блюда, которые им зайдут на 10/10.',
      '',
      '# ПРАВИЛА',
      '1. Каждая идея — ОДНО блюдо на одну тарелку: белок + гарнир или соус. Не сеты, не «вечера», не несколько подач.',
      '2. Высоко оценённое и похваленное — давай похожее по духу. Обруганное — избегай этих ошибок. Убранное — не нравится, похожего не предлагай. Чаще открываемое — тянет туда.',
      '3. Давность: готовили или открывали за последние ~7 дней — не предлагай то же блюдо и тот же главный белок в похожем виде.',
      '4. eaters.avoid — СТРОГО исключи из всех идей. eaters.likes — тянись к этому.',
      '5. Режимы: self — для себя, 1–2 чел, до 30 мин, минимум посуды и нарезки; romance — классика, красивая подача, под конкретный алкоголь, готовит один; friends — 5+ чел, сытно, двое у плиты, до 3 ч.',
      '6. Без вегетарианских, белок обязателен. Кухни разные и широкие. Микс: примерно 3 self, 3 romance, 4 friends, разные белки.',
      '8. Название идеи — конкретное блюдо (белок + гарнир или соус), без «вечер», «ночь», «сходка», «пир», «посиделки».',
      '7. Друзья — лучшая подсказка: если идея похожа на то, что кто-то из друзей готовил или оценил на 8+, скажи это в why с именем и оценкой: «Вася готовил похожее — 9/10». Если другу что-то не зашло — честно: «Пете не зашло пересоленное, тут баланс». Имена бери только из оценок ниже, не выдумывай.',
      '',
      '# ФОРМАТ',
      'Ответ — ТОЛЬКО JSON-массив из 10 объектов, начни с [ и закончи ]. Без markdown и пояснений.',
      'Объект: {"title": "2–4 слова по-русски, с характером", "pitch": "до 60 знаков: что на тарелке", "mode": "self|romance|friends", "protein": "одним словом", "drink": "под что пить или пусто", "why": "до 80 знаков: почему зайдёт именно им"}'
    ].join('\n');
    var user = '# ПОВАР — ЕГО ЦЕЛЬ И ПРИВЫЧКИ (подбирай под это)\n' + kbjuNote('self') + '\n\n# СИГНАЛЫ КОМПАНИИ (JSON)\n' + JSON.stringify(sig) + '\n\n# ОЦЕНКИ И КОММЕНТАРИИ ВСЕЙ КОМПАНИИ (читай каждый)\n' + teamFb() + '\n\n# АЛЛЕРГИИ — никогда не предлагай\n' + people() + '\n\nПодбери 10 блюд.';
    return { system: system, user: user };
  }

  function refreshIdeas(ctx, ui) { // ui: {msg, sub, signal}
    ctxRef = ctx;
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
      c === 'network' ? 'Нет связи с нейросетью' : c === 'invalid_json' ? 'Нейросеть ответила неразборчиво даже со второй попытки — попробуй ещё или модель посильнее' : 'Что-то пошло не так — попробуйте ещё раз';
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
      title: str(r.title, theme), tagline: str(r.tagline), icon: (typeof r.icon === 'string' && r.icon.length <= 8 && !/[a-z<]/i.test(r.icon)) ? r.icon : undefined,
      baseGuests: GEN && GEN.guests ? GEN.guests : Math.max(1, Math.min(12, (r.baseGuests | 0) || (mode === 'self' ? 2 : mode === 'romance' ? 3 : 5))),
      totalTime: str(r.totalTime, '≈ 3 ч'),
      meta: window.KMeta ? KMeta.norm(r.meta) || undefined : undefined,
      diet: arr(r.diet).filter(function (t) { return typeof t === 'string' && t.trim(); }).map(function (t) { return t.trim().slice(0, 140); }).slice(0, 3),
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
        x.title = str(s.title, 'Шаг'); x.time = str(s.time); x.dur = str(s.dur); x.joke = txt(s.joke); if (s.sync) x.sync = txt(s.sync);
        if (s.lanes && (arr(s.lanes.chef).length || arr(s.lanes.sous).length)) x.lanes = { chef: acts(s.lanes.chef), sous: acts(s.lanes.sous) };
        else x.both = acts(s.both);
        if (!(x.lanes || (x.both && x.both.length))) return;
      }
      if (s.type === 'serve') {
        x.title = str(s.title, 'Подача'); x.art = ARTS.indexOf(s.art) >= 0 ? s.art : 'main';
        x.dishes = arr(s.dishes).map(String); x.points = arr(s.points).map(txt).filter(Boolean);
        var SH = ['base', 'sector', 'mound', 'drizzle', 'scatter', 'sticks', 'dollop', 'fan', 'ring'], IT = ['grain', 'cube', 'ring', 'leaf', 'strip', 'chunk', 'slice', 'tri', 'dot', 'noodle', 'smooth', 'sauce'];
        if (s.plate && arr(s.plate.layers).length) x.plate = { vessel: ['bowl', 'plate', 'board', 'skillet'].indexOf(s.plate.vessel) >= 0 ? s.plate.vessel : 'plate', layers: arr(s.plate.layers).filter(function (l) { return l && SH.indexOf(l.shape) >= 0; }).slice(0, 9).map(function (l) {
          var y = { what: str(l.what, 'Слой').slice(0, 60), shape: l.shape, item: IT.indexOf(l.item) >= 0 ? l.item : 'chunk' };
          if (/^#[0-9a-f]{6}$/i.test(l.color || '')) y.color = l.color;
          ['from', 'to', 'at'].forEach(function (k) { if (isFinite(+l[k]) && l[k] !== '' && l[k] != null) y[k] = ((+l[k] % 360) + 360) % 360; });
          ['r', 'r0', 'd'].forEach(function (k) { if (isFinite(+l[k]) && +l[k] > 0 && +l[k] <= 1) y[k] = +l[k]; });
          if (+l.n > 0) y.n = Math.min(+l.n | 0, 600);
          return y; }) };
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
    friends: '- Режим «друзья»: baseGuests 5, двое у плиты: шеф (chef) и су-шеф (sous) — шаги через lanes. Шеф ленивый: соусы, блендер, финальные штрихи. Тяжёлая нарезка — су-шефу. Нагрузка на слайде равная, задачи не переплетать, никто не прыгает между чужими задачами. Порции большие, несколько блюд. ' +
      'ПОРЯДОК ДЛЯ ДВОИХ — железный: 1) продукт нельзя использовать раньше, чем его подготовили (обжарили, нарезали, замариновали) в этом или прошлом шаге; 2) обжарку, запекание и соус делает тот, у кого продукт в руках, — не передавай сырое «на потом»; 3) если один ждёт другого — в его дорожке прямо: «Жди от су-шефа: …» и чем заняться пока; 4) последнее действие каждой дорожки — «Освободился раньше? …» с полезным делом на будущее (задел, мойка, посуда к подаче); 5) связку шага — в поле sync.'
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
    '  title — название блюда по-русски, 2–6 слов: КОНКРЕТНО что готовится — главный белок и гарнир/соус («Стейк из шеи с картофельным гратеном»). Не «вечер», «ночь», «сходка», «посиделки», «пир» — только еда',
    '  tagline — что на тарелке, до 90 знаков',
    '  icon — один эмодзи, который точно показывает, КАК блюдо подаётся (боул/миска — 🍛 или 🥗, паста — 🍝, стейк — 🥩, бургер — 🍔, суп — 🍲, рыба — 🐟); не путай: шаурма-боул на тарелке — не 🌯',
    '  baseGuests — число порций, на которое посчитаны количества',
    '  totalTime — общее время, строка вида «≈ 1 ч 10 мин»',
    '  tags — 3–6 коротких тегов',
    '  meta — паспорт для каталога: {category, cuisine, main, difficulty, activeMin}. category — main|soup|breakfast|dessert|snack|drink|sauce; cuisine — одно из: ' + (window.KMeta ? KMeta.CUISINES.join(', ') : '') + '; main — главный продукт, одно из: ' + (window.KMeta ? KMeta.MAINS.join(', ') : '') + '; difficulty — 1 (новичок справится) … 5 (ресторанная техника); activeMin — минут реально у плиты и доски, без ожиданий',
    '  groups — названия групп продуктов: ["Мясо", "Овощи", "Соус", …]',
    '  ingredients — [{id, g, name, amount, unit, round, buy?}]: id латиницей (beef, rice); g — индекс в groups; amount — число на baseGuests; unit — г, кг, мл, л, шт, ч.л., ст.л.; round — правило округления; buy:true — если надо докупить. Для «по вкусу» вместо amount/unit дай unitText',
    '  dishes — [{name, kcal, p, f, c}] на ОДНУ порцию',
  '  diet — 0–3 коротких совета под цель повара (до 120 знаков каждый): что добавить к ЭТОЙ тарелке или в другие приёмы дня, чтобы закрыть дневную норму. Конкретно, с граммами: «+150 г творога 5% на завтрак — добьёшь белок до нормы». Если блюдо и так попадает — пустой массив. НЕ пиши «бери порцию поменьше» — порция уже под него.',
    '  ahead — ТОЛЬКО если что-то надо сделать заранее, до начала готовки (маринад на ночь, тесто, разморозка, замочить бобовые): [{what, hours, text}] — what до 30 знаков («Замариновать курицу»), hours — за сколько часов до готовки, text — что именно сделать с количествами {id}. Если всё делается по ходу — поля нет.',
    '  phases — [{t:"0:00", name}] таймлайн',
    '  tools — [{zone, items:[{id, icon, name, use}]}] посуда и поверхности',
    '  slides — по порядку: cover {type,short,lede}, shop {type,short,title,note}, tools {type,short,title,note}, step… (последний step — «Сборка»), serve {type,short,title,dishes,art,plate,points,photo}',
    '  serve.plate — схема тарелки СВЕРХУ, по ней рисуется картинка подачи: {vessel, layers:[{what, shape, item, color, from?, to?, r?, r0?, at?, n?}]}',
    '    vessel: bowl (глубокая миска) | plate (плоская тарелка) | board (доска) | skillet (сковорода на стол)',
    '    shape: base — слой по всему дну (рис, пюре, лапша); sector — сектор от угла from до угла to (градусы, 0 — верх, по часовой, 90 — право); mound — горка в центре (r — радиус 0..1); drizzle — соус полосками в секторе from–to; scatter — посыпка по всей тарелке или в from–to; sticks — стоячие кусочки у края from–to (лаваш, чипсы); dollop — ложка соуса/сметаны в точке at; fan — веер ломтиков к углу at; ring — бортик соуса по кругу',
    '    item — фактура: grain (зёрна риса/булгура), noodle, smooth (пюре/хумус), sauce, strip (полоски мяса), chunk (кусочки/кубики мяса), slice (ломтики), cube (кубики овощей), ring (кольца лука/перца), leaf (зелень, салат), tri (треугольники лаваша/чипсов), dot (кунжут, перец, гранат)',
    '    color — реальный цвет продукта после готовки в #rrggbb (жареная курица #b0652c, рис #f3ead6, огурец #7cb35e, томат #d9452b, лук красный маринованный #b9487c, сметана #f6f1e7, зелень #4d9a3a)',
    '    Слои — в порядке укладки (снизу вверх), 4–8 штук, каждый what — что и как лежит, как в шаге сборки. Сектора не перекрывают друг друга.',
    '  step: {type:"step", short, title, time:"0:00 – 0:20", dur:"20 мин", sync?, both:[действия]} — для одного повара; для двоих вместо both — lanes:{chef:[…], sous:[…]}; sync — одна фраза о связке шага: что чего ждёт и в каком порядке (обязательно у двоих, если один ждёт результат другого); joke — прикол',
    '  действие: {t, tool?, timer?:{min,label}, cut?, how?, clean?}. В t вставляй количества как {id} или {id:часть}, главное — **жирным**'
  ].join('\n');
  function people() {
    var e = window.KukingSocial && window.KukingSocial.eaters ? window.KukingSocial.eaters() : [];
    return e.length ? e.map(function (x) { return '- ' + x.who + (x.allergy ? ' — АЛЛЕРГИЯ (ни грамма, ни следа, даже в соусах и маринадах): ' + x.allergy : '') + (x.likes ? ' — любит: ' + x.likes : '') + (x.avoid ? ' — НЕ ЕСТ: ' + x.avoid : ''); }).join('\n') : '- анкет нет';
  }
  function kbjuNote(mode) {
    var t = window.KBody && window.KBody.targets(), hb = window.KBody && window.KBody.habits ? window.KBody.habits() : [];
    var h = (hb.length ? '\n- Привычки повара: ' + hb.join('; ') + '.' : '') + (window.KPrefs ? '\n' + KPrefs.promptLine() : '');
    if (!t) return '- Данных о теле нет: порция ~60 г белка и ~100 г углеводов, калории по-честному.' + h;
    return '- Рецепт делается СПЕЦИАЛЬНО под повара. Его порция: ' + t.meal.kcal + ' ккал, белок ' + t.meal.p + ' г, жиры ' + t.meal.f + ' г, углеводы ' + t.meal.c + ' г (' + Math.round(window.KBody.share() * 100) + '% дневной нормы ' + t.day.kcal + ' ккал, цель — ' + t.goal + ').' +
      '\n- Подгони граммы белка, гарнира, соуса и масла сразу под эти цифры ±7% — никаких «если ты на сушке, возьми поменьше»: рецепт уже его. Под цель выбирай и технику (сушка — меньше масла, нежирные куски, больше овощей и белка; масса — плотный гарнир, жирнее соус).' +
      (mode === 'self' ? '' : '\n- Остальным за столом — стандартная сытная порция: ~60 г белка и ~100 г углеводов; порцию повара в «Сборке» отметь отдельно, если она отличается.') + h +
      '\n- Если готовит редко (1–2 раза в неделю) — в режиме «для себя» предложи сделать порцию впрок и как хранить; если времени на готовку мало — уложи активную часть в это время.' +
      '\n- dishes[].kcal/p/f/c — честный расчёт по граммам сырых продуктов на одну порцию, не на глаз.' +
      '\n- В diet — что докинуть в рацион за день, чтобы закрыть норму (белок, клетчатка, овощи), если этого блюда не хватает.';
  }
  function sampleFor(mode) {
    var id = mode === 'friends' ? 'smash-night' : 'sichuan-beef';
    return base.filter(function (r) { return r.id === id; })[0] || base[base.length - 1];
  }
  function teamFb() {
    var f = ctxRef && ctxRef.feedback ? ctxRef.feedback() : [];
    if (!f.length) return '- пока нет';
    return f.slice(-60).map(function (x) { return '- «' + (x.title || x.rid) + '» — ' + x.who + (x.score ? ', ' + x.score + '/10' : '') + (x.comment ? ': ' + x.comment : '') + (x.replies.length ? ' | ответы: ' + x.replies.join(' / ') : ''); }).join('\n');
  }
  var ctxRef = null;
  function buildPrompt(theme, reviews, existing, retryNote, extra) {
    var mode = GEN && GEN.mode ? GEN.mode : MODE_RU[theme[3]] ? theme[3] : 'friends', sk = skill();
    var fb = Object.keys(reviews || {}).map(function (id) {
      var v = reviews[id]; return '- «' + (v.title || id) + '» — ' + v.score + '/10' + (v.comment ? ': ' + v.comment : '');
    });
    var system = [
      '# РОЛЬ',
      'Ты — шеф-повар уровня Мишлен, технолог ресторанной кухни и спортивный диетолог в одном лице. Ты пишешь рецепт для домашнего приложения-слайдшоу «Жарко»: человек стоит у плиты с телефоном и листает слайды по одному. Пиши по-русски, голосом дружелюбного шефа 25 лет с чувством юмора: живо и по-свойски, без мата, тюремного жаргона и грубостей — никого не задевай; 2–3 прикола на рецепт — только в поле joke. Сами инструкции — кристально простые, как для человека, который готовит с бокалом в руке.',
      '',
      '# КАК ТЫ ДУМАЕШЬ ПЕРЕД ТЕМ, КАК ПИСАТЬ (молча, в ответ не выводи)',
      '1. Представь готовую тарелку сверху: что лежит, где, в какой посуде, какого цвета. Это станет serve.plate и шагом «Сборка».',
      '2. Разложи блюдо на компоненты: белок, гарнир, соус, овощи/свежее, хруст, финишная зелень. У каждого — своя посуда и своё время.',
      '3. Посчитай граммы от порции: сколько сырого белка нужно на одну порцию, умножь на baseGuests, добавь запас на ужарку. Так же гарнир, соус, овощи.',
      '4. Построй таймлайн назад от момента подачи: что дольше всего готовится — стартует первым; всё горячее заканчивается в одну минуту.',
      '5. Распиши шаги так, чтобы человек ни разу не листал назад: всё, что нужно на шаге, названо на этом шаге с количеством.',
      '6. Пройди рецепт глазами повара: каждый купленный продукт где-то используется, каждый промежуточный компонент (соус в пиале, маринованный лук, обжаренный лаваш) потом забирается и кладётся на тарелку.',
      '',
      '# ГЛАВНОЕ',
      '1. Одно блюдо на одну тарелку: белок + гарнир + соус + свежее на той же тарелке. Без закусок и второй подачи.',
      '2. Отзывы и комментарии друзей — высший приоритет, выше любых правил: что хвалили — повторяй приёмом, что ругали — исключи и сделай наоборот. Если в комментах «не хватило мяса» — клади больше, «пересолено» — меньше соли и т. д.',
      '2а. Если блюдо похоже на то, что готовил и оценил кто-то из друзей, — одной фразой в cover.lede: «Вася такое готовил и поставил 9/10 — делаем ещё лучше». Имя и оценку бери только из раздела оценок хаты.',
      '3. АЛЛЕРГИИ — железный запрет: аллергена нет ни в одном ингредиенте, соусе, маринаде, масле для жарки и подаче; скрытые источники (соевый соус — пшеница, песто — орехи, майонез — яйцо, панировка — глютен) — замени. Что человек НЕ ЕСТ — тоже нет нигде.',
      '4. Гарнир и основное готовы в ОДНУ минуту: ничего не ждёт и не остывает. Воду заранее доведи до кипения и держи на минимуме под крышкой.',
      '5. Сначала вся нарезка, потом готовка. Каждая нарезка — форма и размер в мм/см («поперёк волокон полосками 3 мм», «кубиком 1 см»). Нарезанное — в отдельные кучки/пиалы, и в тексте сказано, где оно лежит («пиала №1»).',
      '6. Параллельные дела пиши на том слайде, где они реально наступают («таймер риса звякнул — снимай с огня»), чтобы не листать назад.',
      '7. Последний шаг перед подачей — отдельный step «Сборка»: пронумерованные действия «1. Рис — …», «2. Курица — …» ровно в том порядке, в каком слои лягут на тарелку, с количеством на порцию. Каждый слой из serve.plate есть в «Сборке», и наоборот.',
      '8. Если готовится больше одной порции «на потом» (обед на завтра) — отдельное действие: что в контейнер вместе, что отдельно, чтобы не раскисло.',
      '',
      '# КОЛИЧЕСТВА — ЧТОБЫ НЕ БЕГАТЬ ДОКУПАТЬ',
      '- amount в ingredients — СКОЛЬКО КУПИТЬ на baseGuests порций, с запасом на ужарку и обрезки. Сырое мясо теряет 25–35% при готовке: на 250 г готового мяса покупай ~350 г сырого.',
      '- Если продукт делится между шагами — пиши в каждом шаге часть: {yogurt:130} в маринад и {yogurt:220} в соус; сумма частей РАВНА amount. Если продукт уходит целиком за один раз — просто {id}.',
      '- Соусов и заправок — щедро: 3–4 ст.л. соуса на порцию минимум. Йогуртовый/сметанный соус — от 100 г на порцию.',
      '- Белок на порцию: мясо/птица 300–350 г сырого, рыба 250–300 г, фарш 250 г. Гарнир: 70–100 г сухой крупы/пасты или 300–400 г картофеля.',
      '- Штучное (лук, лимон, перец) — целыми штуками, а в шагах дели словами («сок ½ лимона»).',
      '- Не перебарщивай с количеством порций: baseGuests 2 — это ровно 2 сытные порции.',
      '',
      '# КАЖДЫЙ ШАГ',
      '- До 4 действий на повара. Одно действие = одна понятная операция с количеством и посудой.',
      '- В t — что сделать, сколько ({id}), на каком огне (слабый/средний/сильный/максимум), сколько минут и КАК ПОНЯТЬ, ЧТО ГОТОВО (цвет, звук, консистенция).',
      '- tool — конкретная посуда из оборудования («Большая сковорода», «Пиала №2»). Одна посуда не занята двумя делами сразу.',
      '- Таймер — только где реально ждёшь (варка, духовка, маринад, отдых мяса), не на «до корочки».',
      '- Промежуточные заготовки называй одинаково от начала до конца («чесночный соус», «маринованный лук», «лаваш-чипсы») и обязательно забирай их в «Сборке».',
      '- Люди готовят медленно: время в time, dur, phases, totalTime — в 1,5 раза больше обычного. Активная готовка до 3 ч.',
      '- Поле how — «как это делается и как понять, что готово»: тем подробнее и чаще, чем ниже уровень повара.',
      '- Поле clean — когда помыть доску и нож (особенно после сырого мяса), что убрать, что залить водой. К подаче стол чистый.',
      '- Поле cut — картинка нарезки, одна из: ' + (window.Cuts ? window.Cuts.keys.join(', ') : '—') + '. Только если подходит.',
      '',
      '# ВКУС',
      '- Баланс: соль, кислота, жир, сладость, острота, умами. В каждом блюде есть кислота (лимон, уксус, маринованное) и хруст (жареное, свежее, чипсы).',
      '- Техники лучших шефов: сильный жар для корочки, отдых мяса, жир с противня в соус, свежая зелень в конце, соль — слоями.',
      '- Специи можно предложить докупить (buy:true), если без них вкус не тот.',
      '',
      '# ПОДАЧА (serve)',
      '- points — 5–7 подробных пунктов, как у шефа на раздаче: 1) какая посуда — форма, цвет, размер, подогретая или холодная; 2) где что лежит — по часам или зонам (гарнир на 8 часов, белок в центре…), высота и форма (купол, кенель, веер ломтиков, гнездо); 3) соус — сколько ложек, как: лужица под белком, дорожка, точки, глянцевая капля; 4) свежее и хруст — зелень, микрозелень, цедра, семечки, хлопья соли, где и сколько; 5) финальный штрих — капля масла, перец из мельницы, протереть борт тарелки; 6) температура подачи и сколько минут до стола; для «романтики» — с каким напитком. Только то, что реально есть в рецепте.',
      '- photo — одно-два предложения для фотографа: как выглядит готовая тарелка в кадре — посуда, цвета, текстуры, фон, свет. Без названий брендов.',
      '- plate — схема сверху строго по «Сборке»: те же компоненты, тот же порядок, реальные цвета.',
      '- art — запасная картинка, одна из: main, aperitivo, chicken, burger, wings, pasta.',
      '',
      '# ПРАВИЛА ОФОРМЛЕНИЯ',
      '- Только метрика по-русски: г, кг, мл, л, шт, ч.л., ст.л., зубч., пучок. Джиггер не мерная ёмкость.',
      '- Главное в t — **жирным** (температура, время, огонь, признак готовности).',
      '- Каждый {id} в тексте есть в ingredients; каждый продукт из ingredients используется хотя бы в одном шаге.',
      '- icon посуды — одна из: ' + ICONS.join(', ') + '. round — одна из: ' + ROUNDS.join(', ') + '.',
      '',
      '# ОБОРУДОВАНИЕ (только это)',
      'Духовка с противнем; сковороды большая, средняя, маленькая; кастрюли две средние и маленькая; блендер; барный инвентарь; пиалы, доска, нож, контейнеры. Подача: большая плоская тарелка, средние плоские с кракелюром, белая глубокая миска, большая и средняя стеклянные миски.',
      '',
      '# ФОРМАТ ОТВЕТА',
      'Ответ — ТОЛЬКО один JSON-объект. Начни с символа { и закончи }. Без markdown, без ``` и без пояснений до или после.',
      SCHEMA,
      '',
      '# ПРОВЕРЬ СЕБЯ ПЕРЕД ОТВЕТОМ',
      '- JSON валиден: двойные кавычки, нет запятых в конце, нет комментариев.',
      '- Есть cover, shop, tools, хотя бы 2 шага step и serve.',
      '- Нет запрещённых продуктов. Гарнир и основное готовы одновременно.',
      '- Количества реалистичны для baseGuests, КБЖУ на одну порцию.',
      '- КБЖУ порции посчитано по граммам сырых продуктов (справочные значения на 100 г) и попадает в цель из раздела «КБЖУ» ±7%.',
      '- Каждое уточнение человека выполнено буквально, ни одно не нарушено и не подменено «похожим».',
      '- Сумма частей {id:часть} по всем шагам = amount в ingredients; мяса и соуса хватает с запасом.',
      '- Каждый купленный продукт используется; каждая заготовка (соус, маринованное, жареное) забрана в «Сборке».',
      '- Есть отдельный шаг «Сборка», а serve.plate совпадает с ним слой в слой.',
      '- Отзывы и комментарии друзей учтены: ни одной ошибки, на которую уже жаловались.'
    ].join('\n');
    var user = [
      '# ЗАДАЧА',
      'Рецепт: «' + theme[0] + '»' + (theme[1] && !/^Уточнения:/.test(theme[1]) ? ' — ' + theme[1] : '') + '.' + (theme[2] ? ' Почему зайдёт: ' + theme[2] + '.' : ''),
      /^Уточнения:/.test(theme[1] || '') ? '\n# ОБЯЗАТЕЛЬНО — ответы человека на уточнения (каждый выполнить буквально; блюдо обязано им соответствовать, даже если классика другая)\n' + theme[1].replace(/^Уточнения:\s*/, '').split('; ').map(function (x) { return '- ' + x; }).join('\n') + '\nПример: «томатное» + «азиатское» — это азиатское блюдо с томатной основой (например, томаты с имбирём, соевым и чили), а НЕ болоньезе или другая европейская классика.' : '',
      'Режим: ' + mode + ' (' + MODE_RU[mode] + ').',
      COMPANY[mode],
      GEN && GEN.guests ? '- baseGuests СТРОГО ' + GEN.guests + ' — человек так выбрал, количества считай ровно на ' + GEN.guests + ' порц.' : '',
      '',
      '# ПОВАР',
      'Уровень готовки ' + sk + ' из 10. Что это значит: ' + skillRule(),
      '',
      '# КТО ЕСТ (анкеты)',
      people(),
      '',
      '# КБЖУ — ты ещё и спортивный диетолог',
      kbjuNote(mode),
      '',
      '# ОТЗЫВЫ НА ПРОШЛЫЕ РЕЦЕПТЫ (высший приоритет)',
      fb.length ? fb.join('\n') : '- пока нет',
      '',
      '# ОЦЕНКИ И КОММЕНТАРИИ ВСЕЙ КОМПАНИИ (читай каждый — это прямые указания, что исправить)',
      teamFb(),
      '',
      '# УЖЕ ЕСТЬ В КНИГЕ — не повторяй',
      existing.join(', ') || '—',
      '',
      '# ОБРАЗЕЦ (только структура и уровень детализации; блюдо, тему и текст НЕ копируй)',
      JSON.stringify(sampleFor(mode)),
      extra || '',
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
  function spin(ctx, fixedI, custom, ready) {
    ctxRef = ctx;
    if (!custom && !ready) return setup(fixedI != null && THEMES[fixedI] ? THEMES[fixedI][3] : null, function () { spin(ctx, fixedI, null, true); });
    if (!custom && fixedI == null && stale(ctx)) return prep(ctx, function () { spin(ctx, null, null, true); });
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
    var pool = THEMES.map(function (t, i) { return GEN && t[3] === GEN.mode ? i : -1; }).filter(function (i) { return i >= 0; });
    var pickI = fixedI != null ? fixedI : pool.length ? pool[(Math.random() * pool.length) | 0] : (Math.random() * Math.max(1, THEMES.length)) | 0, pick = custom || THEMES[pickI];
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
      if (a === 'again') { shut(); spin(ctx, null, null, true); }
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
      var stopTick = window.KFun ? window.KFun.ticker(msg, 'gen') : function () {};
      sub.textContent = 'Обычно 1–3 минуты. Учитываю анкеты, аллергии и ваши оценки';
      setBtns('<button type="button" class="nav-btn" data-a="stop">Стоп</button>');
      ctl = new AbortController();
      Promise.resolve(window.claude && window.claude.use ? window.claude.use('sample') : null).then(function (sample) {
        if (!sample) throw { code: 'not_granted' };
        var existing = window.RECIPES.map(function (r) { return '«' + r.title + '»'; });
        function attempt(note) {
          return sample.json(buildPrompt(pick, ctx.reviews(), existing, note), {
            modelTier: 'complex', cache: false, signal: ctl.signal, temperature: 0.6,
            onText: function (u) { sub.textContent = (note ? 'Переписываю начисто · ' : '') + 'Написано ' + Math.round(u.text.length / 1000) + ' тыс. знаков'; }
          }).then(function (json) {
            var r = fix(json, pick[0], GEN && GEN.mode || pick[3]), pr = window.KRecipe ? window.KRecipe.problems(r) : [];
            if (pr.length && !note) { var er = new Error('рецепт не прошёл сверку: ' + pr.join('; ')); throw er; } // одна переписка с конкретными ошибками
            var rr = window.KRecipe ? window.KRecipe.fix(r) : r; return note ? rr : review(rr, sub).then(function (iss) { if (iss) throw new Error('шеф-ревизор нашёл ошибки: ' + iss); return rr; });
          });
        }
        /* не прошло проверку — одна попытка с подсказкой, что не так */
        return attempt().catch(function (e) {
          if (e && (e.code === 'cancelled' || e.code === 'not_granted' || e.code === 'bad_key' || e.code === 'network')) throw e;
          return attempt(e && e.message ? e.message : 'кривой JSON');
        });
      }).then(function (r) {
        stopTick();
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
        busy = false; stopTick();
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
  /* ---------- холл: перед рецептом шеф уточняет 3–4 момента с готовыми вариантами ---------- */
  /* перед генерацией — для кого и на сколько. Запоминаем последний выбор */
  var LAST = load('kuking:gen', null), GEN = null;
  var RANGE = { self: [1, 2], romance: [3, 4], friends: [5, 12] }, DEF = { self: 1, romance: 3, friends: 5 };
  function setup(defMode, done) {
    var g = { mode: MODE_RU[defMode] ? defMode : LAST && LAST.mode || 'self' };
    g.guests = LAST && LAST.mode === g.mode && LAST.guests ? LAST.guests : DEF[g.mode];
    var t = window.KBody && window.KBody.targets();
    var m = document.createElement('div'); m.className = 'rl-ov gs-ov'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-label', 'Для кого готовим');
    function draw() {
      var r = RANGE[g.mode];
      m.innerHTML = '<div class="gs"><button type="button" class="rl-x" aria-label="Закрыть">×</button><p class="rl-k">Перед тем как крутить</p><h3 class="gs-h">Для кого готовим?</h3>' +
        '<div class="seg gs-mode" role="radiogroup">' + ['self', 'romance', 'friends'].map(function (k) { return '<button type="button" role="radio" data-gm="' + k + '" aria-checked="' + (g.mode === k) + '">' + { self: 'Для себя', romance: 'Романтика', friends: 'Друзья' }[k] + '</button>'; }).join('') + '</div>' +
        '<div class="gs-row"><span>Сколько персон</span><div class="gs-step"><button type="button" data-gs="-1" aria-label="Меньше"' + (g.guests <= r[0] ? ' disabled' : '') + '>−</button><b>' + g.guests + '</b><button type="button" data-gs="1" aria-label="Больше"' + (g.guests >= r[1] ? ' disabled' : '') + '>+</button></div></div>' +
        '<p class="small gs-me">' + (t ? 'Твоя порция подгонится под цель «' + esc(t.goal) + '»: ≈ ' + t.meal.kcal + ' ккал · Б ' + t.meal.p + ' г' : 'Заполни «Питание» в профиле — порция подгонится под твою цель') + '</p>' +
        '<div class="rl-btns"><button type="button" class="nav-btn primary" data-gs="go">Погнали</button></div></div>';
    }
    draw(); document.body.appendChild(m); requestAnimationFrame(function () { m.classList.add('on'); });
    function shut() { m.classList.add('out'); setTimeout(function () { m.remove(); }, 220); }
    m.addEventListener('click', function (e) {
      if (e.target === m || e.target.closest('.rl-x')) return shut();
      var b = e.target.closest('[data-gm],[data-gs]'); if (!b) return;
      if (b.hasAttribute('data-gm')) { g.mode = b.getAttribute('data-gm'); g.guests = DEF[g.mode]; }
      else if (b.getAttribute('data-gs') === 'go') { GEN = LAST = g; try { localStorage.setItem('kuking:gen', JSON.stringify(g)); } catch (x) {} shut(); setTimeout(function () { done(g); }, 160); return; }
      else { var r = RANGE[g.mode]; g.guests = Math.max(r[0], Math.min(r[1], g.guests + +b.getAttribute('data-gs'))); }
      if (window.kHaptic) window.kHaptic(6); draw();
    });
  }
  function hallPrompt(idea, mode) {
    return {
      system: ['Ты — шеф-повар уровня Мишлен, говоришь по-русски голосом дружелюбного шефа 25 лет, коротко и по делу, без мата и жаргона. Человек хочет блюдо. Прежде чем писать рецепт, задай 3–4 уточнения, которые РЕАЛЬНО меняют рецепт: белок или его часть, острота, гарнир, техника (гриль/сковорода/духовка), время на готовку, под какой напиток, настроение подачи.',
        'Правила: не спрашивай то, что уже ясно из запроса или анкет; учти аллергии и что люди не едят — не предлагай варианты с ними; уровень повара влияет на сложность вариантов.',
        'У каждого вопроса 2–4 варианта ответа, каждый до 28 знаков, конкретно (не «другое»).',
        'Ответ — ТОЛЬКО JSON без текста вокруг: {"say":"реакция на идею, до 110 знаков","questions":[{"q":"вопрос до 60 знаков","options":["…","…"]}]}'].join('\n'),
      user: ['Запрос: ' + idea, 'Режим: ' + (MODE_RU[mode] || mode) + (GEN && GEN.guests ? ', порций: ' + GEN.guests : ''), 'Уровень повара: ' + skillRule(), 'Цель и рацион повара:', kbjuNote(mode), 'Кто ест:', people()].join('\n')
    };
  }
  function custom(ctx, idea, mode, ready) {
    mode = MODE_RU[mode] ? mode : 'self'; idea = String(idea).slice(0, 160);
    if (!ready) return setup(mode, function (g) { custom(ctx, idea, g.mode, true); });
    var m = document.createElement('div'); m.className = 'rl-ov hall-ov'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-label', 'Обсудим блюдо');
    m.innerHTML = '<div class="hall"><button type="button" class="rl-x" aria-label="Закрыть">×</button><p class="rl-k">Обсудим блюдо</p>' +
      '<p class="hall-you">' + esc(idea) + '</p><div class="hall-body"><div class="fr-pot" aria-hidden="true"><i></i><i></i><i></i></div><p class="fr-msg hall-wait"></p></div>' +
      '<div class="rl-btns"><button type="button" class="nav-btn" data-h="skip">Пропустить</button><button type="button" class="nav-btn primary" data-h="go" disabled>Погнали</button></div></div>';
    document.body.appendChild(m);
    var body = m.querySelector('.hall-body'), goB = m.querySelector('[data-h=go]'), ctl = new AbortController(), qs = [], ans = {};
    var stopTick = window.KFun ? window.KFun.ticker(m.querySelector('.hall-wait'), 'hall', 1800) : function () {};
    function shut() { stopTick(); ctl.abort(); m.classList.add('out'); setTimeout(function () { m.remove(); }, 260); }
    function details() { return qs.map(function (q, i) { return ans[i] ? q.q.replace(/\?$/, '') + ' — ' + ans[i] : ''; }).filter(Boolean).join('; '); }
    function run() { var d = details(); shut(); setTimeout(function () { spin(ctx, null, [idea, d ? 'Уточнения: ' + d : '', '', mode]); }, 200); }
    function draw(v) {
      stopTick();
      qs = (v && Array.isArray(v.questions) ? v.questions : []).filter(function (q) { return q && q.q && Array.isArray(q.options) && q.options.length; }).slice(0, 4);
      if (!qs.length) { run(); return; }
      body.innerHTML = (v.say ? '<p class="hall-say">' + esc(String(v.say).slice(0, 140)) + '</p>' : '') + qs.map(function (q, i) {
        return '<fieldset class="hall-q" style="--i:' + i + '"><legend>' + esc(String(q.q).slice(0, 80)) + '</legend><div class="hall-opts">' +
          q.options.slice(0, 4).map(function (o) { return '<button type="button" class="hall-o" data-q="' + i + '" aria-pressed="false">' + esc(String(o).slice(0, 40)) + '</button>'; }).join('') +
          '</div><input class="hall-own" data-q="' + i + '" type="text" maxlength="60" placeholder="Или своё…"></fieldset>';
      }).join('');
      goB.disabled = false;
    }
    m.addEventListener('click', function (e) {
      if (e.target === m || e.target.closest('.rl-x')) return shut();
      var o = e.target.closest('.hall-o');
      if (o) { var qi = o.getAttribute('data-q'), on = o.getAttribute('aria-pressed') !== 'true';
        m.querySelectorAll('.hall-o[data-q="' + qi + '"]').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
        o.setAttribute('aria-pressed', String(on)); ans[qi] = on ? o.textContent : ''; m.querySelector('.hall-own[data-q="' + qi + '"]').value = ''; if (window.kHaptic) window.kHaptic(6); return; }
      var h = e.target.closest('[data-h]'); if (!h) return;
      if (h.getAttribute('data-h') === 'skip') { qs = []; run(); } else run();
    });
    m.addEventListener('input', function (e) { var i = e.target.closest('.hall-own'); if (!i) return; var qi = i.getAttribute('data-q'); ans[qi] = i.value.trim();
      m.querySelectorAll('.hall-o[data-q="' + qi + '"]').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); }); });
    Promise.resolve(window.claude && window.claude.use ? window.claude.use('sample') : null).then(function (sample) {
      if (!sample) throw { code: 'not_granted' };
      return sample.json(hallPrompt(idea, mode), { modelTier: 'default', cache: false, signal: ctl.signal, temperature: 0.7 });
    }).then(draw).catch(function (e) {
      if (e && e.code === 'cancelled') return;
      stopTick(); body.innerHTML = '<p class="hall-say">Вопросы не задались (' + esc(aiMsg(e)) + '). Можно собрать рецепт и так.</p>'; goB.disabled = false;
    });
  }
  /* ручной рецепт из редактора: та же проверка, что у нейросети */
  function manual(ctx, loose, prevId) { var keep = GEN; GEN = null; try { return manual0(ctx, loose, prevId); } finally { GEN = keep; } }
  function manual0(ctx, loose, prevId) {
    var r = fix(loose, loose.title, loose.mode);
    r.id = prevId || 'my-' + Date.now().toString(36); r.ai = false; r.manual = loose; delete r.theme;
    cache[r.id] = r; saveCache();
    var i = window.RECIPES.map(function (x) { return x.id; }).indexOf(r.id);
    if (i >= 0) window.RECIPES[i] = r; else window.RECIPES.push(r);
    ctx.added(r, i >= 0);
    return r;
  }
  /* пересборка старого рецепта со «Свежака» по нынешним правилам: то же блюдо, тот же id и место в плане */
  function upgrade(ctx, id) {
    ctxRef = ctx;
    var old = (window.RECIPES || []).filter(function (x) { return x.id === id; })[0] || cache[id];
    if (!old) return;
    var keep = GEN; GEN = { mode: MODE_RU[old.mode] ? old.mode : 'self', guests: old.baseGuests || DEF[old.mode] || 2 };
    var m = document.createElement('div'); m.className = 'rl-ov'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-label', 'Обновляю рецепт');
    m.innerHTML = '<div class="rl-box"><button type="button" class="rl-x">✕ Выйти</button><p class="eyebrow rl-k">Обновляю под новые правила</p><div class="rl-res">' + esc(old.title) + '</div>' +
      '<div class="fr-gen"><div class="fr-pot" aria-hidden="true"><i></i><i></i><i></i></div><p class="fr-msg">Шеф думает…</p><p class="small fr-sub">Обычно 1–3 минуты. Порция под твою цель, советы по рациону, «Сборка», подача</p></div><div class="rl-btns"><button type="button" class="nav-btn" data-u="stop">Стоп</button></div></div>';
    document.body.appendChild(m);
    var msg = m.querySelector('.fr-msg'), sub = m.querySelector('.fr-sub'), btns = m.querySelector('.rl-btns'), gen = m.querySelector('.fr-gen'), k = m.querySelector('.rl-k');
    var stopTick = window.KFun ? window.KFun.ticker(msg, 'gen') : function () {}, ctl = new AbortController(), done = false;
    function shut() { stopTick(); ctl.abort(); GEN = keep; m.remove(); }
    m.querySelector('.rl-x').addEventListener('click', shut);
    btns.addEventListener('click', function (e) { var b = e.target.closest('[data-u]'); if (!b) return; var a = b.getAttribute('data-u');
      if (a === 'stop' || a === 'close') shut(); else if (a === 'open') { shut(); if (ctx.open) ctx.open(id); } else if (a === 'cook') { shut(); ctx.choose(id); } });
    var brief = [old.tagline, (old.dishes || []).map(function (d) { return d.name; }).join(', ')].filter(Boolean).join(' — ');
    var extra = '\n# ЭТО ОБНОВЛЕНИЕ СУЩЕСТВУЮЩЕГО РЕЦЕПТА\nБлюдо уже есть в книге: «' + old.title + '» — ' + brief + '.\nСохрани блюдо и его идею: тот же главный белок, гарнир, соус и стиль подачи, то же название. Перепиши его ЦЕЛИКОМ по всем правилам выше: граммы под цель повара, советы diet, шаг «Сборка», схема plate, отзывы и оценки друзей на это блюдо — исправь всё, на что жаловались.' +
      '\nСТАРАЯ ВЕРСИЯ (для справки, не повторяй ошибки):\n' + JSON.stringify({ ingredients: old.ingredients, dishes: old.dishes, totalTime: old.totalTime }).slice(0, 6000);
    var existing = (window.RECIPES || []).filter(function (x) { return x.id !== id; }).map(function (x) { return '«' + x.title + '»'; });
    Promise.resolve(window.claude && window.claude.use ? window.claude.use('sample') : null).then(function (sample) {
      if (!sample) throw { code: 'not_granted' };
      function attempt(note) {
        return sample.json(buildPrompt([old.title, brief, '', GEN.mode], ctx.reviews(), existing, note, extra), { modelTier: 'complex', cache: false, signal: ctl.signal, temperature: 0.5,
          onText: function (u) { sub.textContent = (note ? 'Переписываю начисто · ' : '') + 'Написано ' + Math.round(u.text.length / 1000) + ' тыс. знаков'; } })
          .then(function (json) {
            var r = fix(json, old.title, GEN.mode), pr = window.KRecipe ? window.KRecipe.problems(r) : [];
            if (pr.length && !note) throw new Error('рецепт не прошёл сверку: ' + pr.join('; '));
            var rr = window.KRecipe ? window.KRecipe.fix(r) : r; return note ? rr : review(rr, sub).then(function (iss) { if (iss) throw new Error('шеф-ревизор нашёл ошибки: ' + iss); return rr; });
          });
      }
      return attempt().catch(function (e) { if (e && (e.code === 'cancelled' || e.code === 'not_granted' || e.code === 'bad_key' || e.code === 'network')) throw e; return attempt(e && e.message ? e.message : 'кривой JSON'); });
    }).then(function (r) {
      stopTick(); done = true;
      r.id = id; r.title = old.title; r.added = old.added || r.added; r.theme = old.theme || r.theme; if (!r.icon && old.icon) r.icon = old.icon; r.upgraded = new Date().toISOString().slice(0, 10);
      cache[id] = r; saveCache();
      window.RECIPES = (window.RECIPES || []).map(function (x) { return x.id === id ? r : x; });
      ctx.added(r, true);
      GEN = keep;
      gen.hidden = true; k.textContent = 'Обновлён';
      btns.innerHTML = '<button type="button" class="nav-btn" data-u="open">Посмотреть</button><button type="button" class="nav-btn primary" data-u="cook">Готовим это</button>';
      if (window.Confetti) try { window.Confetti.fire({ anchor: m.querySelector('.rl-res') }); } catch (e) {}
    }).catch(function (e) {
      stopTick(); GEN = keep; if (e && e.code === 'cancelled') return;
      gen.hidden = true; k.textContent = 'Облом';
      btns.innerHTML = '<p class="small" style="flex-basis:100%;margin:0 0 6px">' + esc(aiMsg(e)) + '. Старый рецепт на месте, ничего не потерялось.</p><button type="button" class="nav-btn" data-u="close">Закрыть</button>';
    });
  }

  /* переделка: импорт чужого рецепта и варианты под технику. Новый рецепт рядом со старым, старый не трогаем.
     o = {kind:'import'|'airfryer'|'kit', base:рецепт|null, text, link, mode, guests} */
  function rework(ctx, o) {
    ctxRef = ctx;
    var base = o.base, keep = GEN, mode = MODE_RU[o.mode] ? o.mode : base && MODE_RU[base.mode] ? base.mode : 'self';
    GEN = { mode: mode, guests: o.guests || (base && base.baseGuests) || DEF[mode] || 2 };
    var LBL = { import: 'Перекладываю рецепт', airfryer: 'Переделываю под аэрогриль', kit: 'Переделываю под вашу технику' };
    var m = document.createElement('div'); m.className = 'rl-ov'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-label', LBL[o.kind]);
    m.innerHTML = '<div class="rl-box"><button type="button" class="rl-x">✕ Выйти</button><p class="eyebrow rl-k">' + LBL[o.kind] + '</p><div class="rl-res">' + esc(base ? base.title : 'Новый рецепт') + '</div>' +
      '<div class="fr-gen"><div class="fr-pot" aria-hidden="true"><i></i><i></i><i></i></div><p class="fr-msg">Шеф думает…</p><p class="small fr-sub">Обычно 1–3 минуты. Можно свернуть — рецепт сохранится сам.</p></div>' +
      '<div class="rl-btns"><button type="button" class="nav-btn" data-u="stop">Отменить</button></div></div>';
    document.body.appendChild(m);
    var msg = m.querySelector('.fr-msg'), sub = m.querySelector('.fr-sub'), btns = m.querySelector('.rl-btns'), gen = m.querySelector('.fr-gen'), k = m.querySelector('.rl-k'), res = m.querySelector('.rl-res');
    var stopTick = window.KFun ? window.KFun.ticker(msg, 'gen') : function () {}, ctl = new AbortController(), newId = null;
    function shut() { stopTick(); ctl.abort(); GEN = keep; m.remove(); }
    m.querySelector('.rl-x').addEventListener('click', shut);
    btns.addEventListener('click', function (e) { var b = e.target.closest('[data-u]'); if (!b) return; var a = b.getAttribute('data-u');
      if (a === 'stop' || a === 'close') shut(); else if (a === 'open') { shut(); if (ctx.open) ctx.open(newId); } else if (a === 'cook') { shut(); ctx.choose(newId); } });
    var extra, theme;
    if (o.kind === 'import') {
      theme = ['', 'импорт рецепта из внешнего источника', '', mode];
      extra = '\n# ИМПОРТ РЕЦЕПТА\nЧеловек прислал рецепт из соцсети, сайта или заметки. Переложи его в формат «Жарко» целиком: те же блюдо и идея, те же главные продукты и техника автора. ' +
        'Название дай своё по-русски, 2–5 слов, если в тексте его нет. Подстрой под цель, технику и предпочтения повара (см. выше), граммовки посчитай на ' + GEN.guests + ' порц. ' +
        'Если в тексте чего-то не хватает (граммовок, времени, температуры) — дострой по-шефски сам, не выдумывая другое блюдо.' +
        (o.link ? '\nИсточник: ' + o.link : '') + '\nТЕКСТ ИСТОЧНИКА:\n' + String(o.text || '').slice(0, 7000);
    } else {
      var brief = [base.tagline, (base.dishes || []).map(function (d) { return d.name; }).join(', ')].filter(Boolean).join(' — ');
      theme = [base.title, brief, '', mode];
      extra = o.kind === 'airfryer'
        ? '\n# ПЕРЕДЕЛКА ПОД АЭРОГРИЛЬ\nТо же блюдо «' + base.title + '», но всё, что можно, готовится в аэрогриле (корзина ≈ 4–6 л): жарка, запекание, хрустящие корочки, разогрев. ' +
          'Для каждого шага в аэрогриле — температура (°C), время, когда встряхнуть или перевернуть, сколько класть за раз (не перегружать корзину). Соусы и то, что требует воды или сковороды, оставь на плите. В посуде укажи «Аэрогриль».'
        : '\n# ПЕРЕДЕЛКА ПОД ТЕХНИКУ ПОВАРА\nТо же блюдо «' + base.title + '», но без техники, которой у человека нет (см. «НЕТ» в предпочтениях). Замени её тем, что есть: сковороды, кастрюли и отмеченная техника. ' +
          'Сохрани вкус и текстуру насколько возможно, честно поменяй время и шаги.';
      extra += '\nИСХОДНИК (для справки):\n' + JSON.stringify({ ingredients: base.ingredients, dishes: base.dishes, totalTime: base.totalTime, steps: (base.slides || []).filter(function (s) { return s.type === 'step'; }).map(function (s) { return s.title; }) }).slice(0, 6000);
    }
    var existing = (window.RECIPES || []).map(function (x) { return '«' + x.title + '»'; });
    Promise.resolve(window.claude && window.claude.use ? window.claude.use('sample') : null).then(function (sample) {
      if (!sample) throw { code: 'not_granted' };
      function attempt(note) {
        return sample.json(buildPrompt(theme, ctx.reviews(), existing, note, extra), { modelTier: 'complex', cache: false, signal: ctl.signal, temperature: 0.5,
          onText: function (u) { sub.textContent = (note ? 'Переписываю начисто · ' : '') + 'Написано ' + Math.round(u.text.length / 1000) + ' тыс. знаков'; } })
          .then(function (json) {
            var r = fix(json, base ? base.title : str(json && json.title, 'Рецепт'), GEN.mode), pr = window.KRecipe ? window.KRecipe.problems(r) : [];
            if (pr.length && !note) throw new Error('рецепт не прошёл сверку: ' + pr.join('; '));
            var rr = window.KRecipe ? window.KRecipe.fix(r) : r; return note ? rr : review(rr, sub).then(function (iss) { if (iss) throw new Error('шеф-ревизор нашёл ошибки: ' + iss); return rr; });
          });
      }
      return attempt().catch(function (e) { if (e && (e.code === 'cancelled' || e.code === 'not_granted' || e.code === 'bad_key' || e.code === 'network')) throw e; return attempt(e && e.message ? e.message : 'кривой JSON'); });
    }).then(function (r) {
      stopTick();
      r.id = 'ai-' + Date.now().toString(36);
      if (o.kind === 'airfryer') r.title = base.title + ' в аэрогриле';
      if (o.kind === 'kit') r.title = base.title + ' без лишней техники';
      if (o.kind === 'import') { r.source = o.link || 'текст'; r.imported = true; } else { r.from = base.id; if (!r.icon && base.icon) r.icon = base.icon; }
      newId = r.id; cache[r.id] = r; saveCache(); window.RECIPES.push(r); ctx.added(r, false);
      GEN = keep; gen.hidden = true; k.textContent = 'Готово'; res.textContent = r.title;
      btns.innerHTML = '<button type="button" class="nav-btn" data-u="open">Посмотреть</button><button type="button" class="nav-btn primary" data-u="cook">Готовим это</button>';
      if (window.Confetti) try { window.Confetti.fire({ anchor: res }); } catch (e) {}
    }).catch(function (e) {
      stopTick(); GEN = keep; if (e && e.code === 'cancelled') return;
      gen.hidden = true; k.textContent = 'Не вышло';
      btns.innerHTML = '<p class="small" style="flex-basis:100%;margin:0 0 6px">' + esc(aiMsg(e)) + '.</p><button type="button" class="nav-btn" data-u="close">Закрыть</button>';
    });
  }
  /* шеф-ревизор: отдельный проход GigaChat в строгом режиме (вызов функции). Ищет только реальные ошибки порядка и техники.
     Нет строгого режима или нейросеть молчит — рецепт не держим. */
  var REVIEW = { name: 'otchet_revizora', description: 'Отчёт шеф-ревизора о проверке рецепта: только реальные ошибки, из-за которых блюдо испортится или повара запутаются.',
    parameters: { type: 'object', properties: {
      ok: { type: 'boolean', description: 'true — ошибок, мешающих готовить, нет' },
      oshibki: { type: 'array', description: 'Список ошибок (пусто, если ok)', items: { type: 'object', properties: {
        shag: { type: 'string', description: 'Название шага' },
        chto: { type: 'string', description: 'Что не так, конкретно' },
        kak: { type: 'string', description: 'Как исправить' } }, required: ['shag', 'chto', 'kak'] } } },
      required: ['ok', 'oshibki'] },
    few_shot_examples: [{ request: 'Шаг «В духовку»: шеф кладёт мясо на противень, су-шеф в это же время обжаривает мясо.', params: { ok: false, oshibki: [{ shag: 'В духовку', chto: 'Шеф берёт мясо до обжарки — в духовку уйдёт сырое', kak: 'Обжаривает тот, кто кладёт в духовку; противень — только после обжарки, связку в sync' }] } }] };
  function review(r, sub) {
    if (!(window.KukingAI && KukingAI.fn)) return Promise.resolve(null);
    if (sub) sub.textContent = 'Шеф-ревизор проверяет порядок и технику…';
    var steps = (r.slides || []).filter(function (s) { return s.type === 'step'; }).map(function (s) {
      var L = function (a) { return (a || []).map(function (x) { return '— ' + String(x.t || '').replace(/\{[^}]+\}/g, '').replace(/\*\*/g, ''); }).join('\n'); };
      return '## ' + s.title + ' (' + s.time + ')' + (s.sync ? '\nСвязка: ' + s.sync : '') + (s.lanes ? '\nШЕФ:\n' + L(s.lanes.chef) + '\nСУ-ШЕФ:\n' + L(s.lanes.sous) : '\n' + L(s.both));
    }).join('\n\n');
    var ing = (r.ingredients || []).filter(function (i) { return i && i.name; }).map(function (i) { return i.name; }).join(', ');
    return KukingAI.fn({ fn: REVIEW, temperature: 0.1,
      system: 'Ты шеф-ревизор ресторана уровня Мишлен. Проверяешь технологическую карту перед сменой. Ищешь только реальные ошибки: продукт используется раньше, чем подготовлен; сырое идёт туда, где нужно обжаренное; один повар ждёт другого без указания; повар простаивает без дела; нарушена техника (не обсушил перед обжаркой, переполнил сковороду, нет отдыха мяса, соль/кислота не в тот момент); время шага нереально; продукт из списка нигде не используется. Мелочи стиля — не ошибки.',
      user: 'Рецепт «' + r.title + '», ' + (r.mode === 'friends' ? 'готовят двое: шеф и су-шеф' : 'готовит один') + '.\nПродукты: ' + ing + '\n\n' + steps })
      .then(function (a) { if (!a || a.ok || !Array.isArray(a.oshibki) || !a.oshibki.length) return null; return a.oshibki.slice(0, 6).map(function (x) { return '«' + x.shag + '»: ' + x.chto + ' → ' + x.kak; }).join('; '); })
      .catch(function () { return null; });
  }


  /* тихая генерация без окна — для меню на неделю. o = {title, why, mode, guests, base (доработать старый), note (кладовка)} */
  function quiet(ctx, o, onStage) {
    ctxRef = ctx;
    var base = o.base, mode = MODE_RU[o.mode] ? o.mode : base && MODE_RU[base.mode] ? base.mode : 'self', keep = GEN;
    GEN = { mode: mode, guests: o.guests || (base && base.baseGuests) || DEF[mode] || 2 };
    var theme, extra = o.note ? '\n' + o.note : '';
    if (base) {
      var brief = [base.tagline, (base.dishes || []).map(function (d) { return d.name; }).join(', ')].filter(Boolean).join(' — ');
      theme = [base.title, brief, '', mode];
      extra += '\n# ДОРАБОТКА СУЩЕСТВУЮЩЕГО РЕЦЕПТА\nБлюдо «' + base.title + '» оценено на 9 из 10. Сохрани блюдо, белок, гарнир и название, но доведи до 10: исправь то, на что жаловались в отзывах, усили вкус и технику.' +
        '\nСТАРАЯ ВЕРСИЯ:\n' + JSON.stringify({ ingredients: base.ingredients, dishes: base.dishes, totalTime: base.totalTime }).slice(0, 6000);
    } else theme = [o.title, o.why || '', '', mode];
    var existing = (window.RECIPES || []).filter(function (x) { return !base || x.id !== base.id; }).map(function (x) { return '«' + x.title + '»'; });
    var sub = { set textContent(v) { if (onStage) onStage(v); } };
    return Promise.resolve(window.claude && window.claude.use ? window.claude.use('sample') : null).then(function (sample) {
      if (!sample) throw { code: 'not_granted' };
      function attempt(note) {
        return sample.json(buildPrompt(theme, ctx.reviews(), existing, note, extra), { modelTier: 'complex', cache: false, temperature: 0.5,
          onText: function (u) { sub.textContent = 'Пишу рецепт · ' + Math.round(u.text.length / 1000) + ' тыс. знаков'; } })
          .then(function (json) {
            var r = fix(json, base ? base.title : str(json && json.title, o.title || 'Рецепт'), GEN.mode), pr = window.KRecipe ? window.KRecipe.problems(r) : [];
            if (pr.length && !note) throw new Error('рецепт не прошёл сверку: ' + pr.join('; '));
            var rr = window.KRecipe ? window.KRecipe.fix(r) : r; return note ? rr : review(rr, sub).then(function (iss) { if (iss) throw new Error('шеф-ревизор нашёл ошибки: ' + iss); return rr; });
          });
      }
      return attempt().catch(function (e) { if (e && (e.code === 'cancelled' || e.code === 'not_granted' || e.code === 'bad_key' || e.code === 'network')) throw e; return attempt(e && e.message ? e.message : 'кривой JSON'); });
    }).then(function (r) {
      if (base) {
        r.id = base.id; r.title = base.title; r.added = base.added || r.added; r.upgraded = new Date().toISOString().slice(0, 10); if (!r.icon && base.icon) r.icon = base.icon;
        cache[r.id] = r; saveCache(); window.RECIPES = (window.RECIPES || []).map(function (x) { return x.id === r.id ? r : x; }); ctx.added(r, true);
      } else { r.id = 'ai-' + Date.now().toString(36); cache[r.id] = r; saveCache(); window.RECIPES.push(r); ctx.added(r, false); }
      GEN = keep; return r;
    }, function (e) { GEN = keep; throw e; });
  }
  window.Fresh = { upgrade: upgrade, rework: rework, quiet: quiet, custom: custom, manual: manual, spin: spin, merge: merge, toDoc: toDoc, forget: forget, themes: THEMES, stale: stale, refresh: refreshIdeas, setIdeas: setIdeas };
})();
