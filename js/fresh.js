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
  var IDEAS_V = 'plate2'; // меняется — старые идеи пересобираются
  function sigOf(ctx) { return hash(IDEAS_V + JSON.stringify(ctx.signals())); }
  function stale(ctx) { return !THEMES.length || ideasState.sig !== sigOf(ctx); }

  function ideasPrompt(sig) {
    return [
      'Ты — шеф уровня Мишлен и личный кулинарный куратор одной хаты (приложение «Кукинг»). Придумай 10 БЛЮД, которые ЭТОЙ хате зайдут на 10/10.',
      'Каждая идея — ОДНО блюдо, которое помещается на одну тарелку: белок + гарнир/соус прямо на тарелке. НЕ сеты, НЕ «вечера», НЕ аперитиво + горячее, НЕ несколько подач.',
      '',
      'Опирайся на сигналы ниже: что высоко оценили и за что хвалили — давай похожее по духу; что ругали — избегай этих ошибок; что убрали — не нравится, не предлагай похожее; что чаще открывали — тянет туда. Существующие рецепты не повторяй.',
      'ДАВНОСТЬ: у рецептов есть даты lastOpened (когда открывали) и cookedAndRated (когда готовили и оценили), today — сегодня. То, что готовили или открывали за последние ~7 дней, не предлагай: ни то же блюдо, ни тот же главный белок в похожем формате (недавно были крылья — никаких крыльев и курицы во фритюре). Чем давнее готовили — тем спокойнее можно вернуться к похожему вайбу.',
      '',
      'Правила хаты: режимы — self (для себя, 1–2 чел, до 30 мин, минимум посуды и нарезки), romance (романтика, классика, красивая подача, под конкретный алкоголь, готовит один), friends (друзья, 5+ чел, сложнее и сытно, два повара, до 3 ч). Без вегетарианских. Белок обязателен. Кухни — широкие и разные, не узко-локальные. Дай микс: примерно 3 self, 3 romance, 4 friends, разные белки и кухни. Для friends — то же одно блюдо на тарелку, просто на компанию.',
      '',
      'eaters — кто ест: likes (любимые кухни и вкусы) — тянись к ним; avoid (что не жрёт) — СТРОГО исключи из всех идей.',
      '',
      'СИГНАЛЫ ХАТЫ (JSON):',
      JSON.stringify(sig),
      '',
      'Ответь ТОЛЬКО JSON-массивом из 10 объектов: {"title": "название блюда, 2–4 слова по-русски, с характером", "pitch": "до 60 знаков: что на тарелке", "mode": "self|romance|friends", "protein": "одним словом", "drink": "под что пить или пусто", "why": "до 80 знаков: почему зайдёт именно им, со ссылкой на их оценки/комменты, если есть"}.'
    ].join('\n');
  }

  function refreshIdeas(ctx, ui) { // ui: {msg, sub, signal}
    var sig = ctx.signals(), key = hash(IDEAS_V + JSON.stringify(sig));
    return Promise.resolve(window.claude && window.claude.use ? window.claude.use('sample') : null).then(function (sample) {
      if (!sample) throw { code: 'not_granted' };
      return sample.json(ideasPrompt(sig), { modelTier: 'default', cache: false, signal: ui.signal,
        onText: function (u) { ui.sub.textContent = 'Набросал ' + Math.min(10, (u.text.match(/"title"/g) || []).length) + ' из 10'; } });
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
      c === 'network' ? 'Нет связи с нейросетью' : c === 'invalid_json' ? 'Модель прислала кривой рецепт — попробуй ещё или модель посильнее' : 'Шеф накосячил';
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
  function buildPrompt(theme, reviews, existing) {
    var sample = base.filter(function (r) { return r.id === 'smash-night'; })[0] || base[base.length - 1];
    var fb = Object.keys(reviews || {}).map(function (id) {
      var v = reviews[id]; return '- «' + (v.title || id) + '»: ' + v.score + '/10' + (v.comment ? ' — ' + v.comment : '');
    });
    return [
      'Ты — шеф-повар уровня Мишлен и автор рецептов для домашнего приложения-слайдшоу «Кукинг». Сделай рецепт ОДНОГО блюда: «' + theme[0] + '» (' + theme[1] + ').' + (theme[2] ? ' Почему он должен зайти: ' + theme[2] + '.' : ''),
      'Это одно блюдо на одну тарелку: белок + гарнир и соус на той же тарелке. Без аперитиво, без закусок и вторых подач. В dishes — само блюдо (можно отдельной строкой его соус или гарнир, если это часть тарелки). Одна подача serve в конце.',
      '',
      'ЖЁСТКИЕ ПРАВИЛА:',
      '- Только русский язык. Ингредиенты, единицы и метрика по-русски: г, мл, л, шт, ч.л., ст.л. Джиггер НИКОГДА не используй как мерную ёмкость.',
      '- Тон: свояк 25 лет, рокер. В КАЖДОМ шаге — тюремная феня и немного мата, по делу; 2–3 прикола за рецепт в поле joke. Но инструкции кристально простые, как для пьяного друга.',
      COMPANY[theme[3]] || COMPANY.friends,
      '- Параллельные процессы (рис варится, пока делаешь соус; картошка, пока жаришь мясо): следующее действие по ним пиши НА ТОМ слайде, где оно реально наступит («Рис: таймер звякнул — с огня, крышку не открывай»), чтобы не листать назад.',
      '- Финальная сборка: прямо пиши, что куда идёт и что остаётся отдельно («в сковороду — только курица; рис не кидай, он отдельно в кастрюле»). Обед в контейнер — тоже явно, что рядом, что отдельно.',
      '- Максимум 4 действия на колонку в шаге. Коротко. Таймер (timer) только там, где реально ждёшь (духовка, варка, маринад); на обжарку «до корочки» таймер не ставь — на глаз.',
      '- Люди готовят МЕДЛЕННО: закладывай в time/dur/phases/totalTime в 1,5 раза больше стандартного. Активная готовка не больше 3 ч (заготовки и бульоны сверх — ок, но в таймлайн).',
      '- Порции большие: на человека ~60 г белка и ~100 г углеводов. Посчитай ккал/Б/Ж/У на одного для каждого блюда (dishes). Количества реалистичные — не перебарщивай: «2 порции» по прошлым рецептам выходили на 3–4. Гарнир на порцию: 70–100 г сухого риса или пасты, 400 г картофеля, белок 200–225 г сырого мяса.',
      '- Оборудование (только это): духовка с противнем; сковороды большая, средняя, маленькая; кастрюли 2 средние и маленькая; блендер; барный инвентарь (шейкер, стрейнер, стакан для смешивания, барная ложка). У каждого действия у плиты укажи посуду в tool и следи, чтобы посуда не была занята двумя делами сразу.',
      '- Посуда для подачи: большая плоская тарелка, средние плоские тарелки с кракелюром, белая глубокая миска, большая и средняя стеклянные миски.',
      '- Специи можно предлагать докупить (buy:true). Используй традиции, умами, техники лучших шефов. Вкус баланс: соль-кислота-жир-сладость-острота.',
      '- Порядок слайдов: cover → shop → tools → step… → serve (после каждого блюда/блока) → (final добавится сам).',
      '- Каждый {id} в тексте обязан быть в ingredients; {id:число} — часть количества на baseGuests; {guests} — число гостей; **жирный** для главного. Каждый продукт из списка используется в шагах; сумма частей ≈ общему количеству.',
      '- serve.art — одна из: main (тарелка с гарниром и нарезанным мясом), aperitivo (закуски веером + миска), chicken (бёдра на пюре с соусом), burger (бургер с фри), wings (крылья в миске), pasta (паста в соусе на тарелке). Выбери ближайшую.',
      '- tools[].items[].icon — одна из: ' + ICONS.join(', ') + '. round — одна из: ' + ROUNDS.join(', ') + '.',
      '- Не повторяй уже существующие рецепты: ' + existing.join(', ') + '.',
      '',
      'ОТЗЫВЫ ХАТЫ НА ПРОШЛЫЕ РЕЦЕПТЫ — ВЫСШИЙ ПРИОРИТЕТ, выше любых правил выше: специи, вкусы, техника, подача, время — всё подстраивай под них. Что хвалили — повторяй приёмом, что ругали — исключи. Цель только 10/10:',
      fb.length ? fb.join('\n') : '- пока нет',
      '',
      'КТО ЕСТ (из анкет): что любят — тянись к этому; что не жрут — НИ В ОДНОМ шаге, соусе или гарнире:',
      (function () { var e = window.KukingSocial && window.KukingSocial.eaters ? window.KukingSocial.eaters() : []; return e.length ? e.map(function (x) { return '- ' + x.who + (x.likes ? ': любит ' + x.likes : '') + (x.avoid ? '; не ест ' + x.avoid : ''); }).join('\n') : '- анкет нет'; })(),
      '',
      'ФОРМАТ: ответь ТОЛЬКО одним JSON-объектом той же структуры, что образец ниже (поля id, added, mode не важны — их перезапишут). Без markdown и пояснений.',
      '',
      'ОБРАЗЕЦ (структура и уровень детализации; тему и блюда НЕ копируй):',
      JSON.stringify(sample)
    ].join('\n');
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
  function spin(ctx, fixedI) {
    if (fixedI == null && stale(ctx)) return prep(ctx, function () { spin(ctx); });
    if (!THEMES.length) {
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
    var direct = fixedI != null;
    var pickI = direct ? fixedI : (Math.random() * THEMES.length) | 0, pick = THEMES[pickI];
    var N = 34, target = N - 4, seq = [];
    for (var i = 0; i < N; i++) seq.push(THEMES[(pickI + 7 + i * 5) % THEMES.length]);
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
        return sample.json(buildPrompt(pick, ctx.reviews(), existing), {
          modelTier: 'complex', cache: false, signal: ctl.signal,
          onText: function (u) { msg.textContent = lines[Math.min(lines.length - 1, (u.text.length / 3500) | 0)]; sub.textContent = 'Написано ' + Math.round(u.text.length / 1000) + ' тыс. знаков'; }
        });
      }).then(function (json) {
        var r = fix(json, pick[0], pick[3]);
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

  window.Fresh = { spin: spin, merge: merge, toDoc: toDoc, forget: forget, themes: THEMES, stale: stale, refresh: refreshIdeas, setIdeas: setIdeas };
})();
