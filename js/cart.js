/* Партия 3: единая корзина (план + рецепты + своё), отделы магазина, куплено уезжает вниз, «есть дома»,
   цены — оценка нейросети, твои правки запоминаются и сдвигают остальные оценки; кладовка и остатки;
   меню на неделю по КБЖУ одной кнопкой. */
(function () {
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function lget(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function lset(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function hap(n) { if (window.kHaptic) window.kHaptic(n || 6); }
  function L() { return window.KukingLib || {}; }

  /* где искать продукт. Адреса поиска магазинов не проверены — если откроется не поиск, поправим тут */
  var STORES = [['Самокат', 'https://samokat.ru/search?value='], ['Лавка', 'https://lavka.yandex.ru/search?text=']];

  var have = lget('kuking:cartHave', {}), hide = lget('kuking:cartHide', {}), extraR = lget('kuking:cartR', []), extraX = lget('kuking:cartX', []), skip = lget('kuking:cartSkip', {});
  var pantry = lget('kuking:pantry', null) || [{ name: 'Соль' }, { name: 'Перец чёрный молотый' }];
  var prices = lget('kuking:prices', {}), days = lget('kuking:cartDays', 7);
  function saveAll() {
    lset('kuking:cartHave', have); lset('kuking:cartHide', hide); lset('kuking:cartSkip', skip); if (window.__kSyncTabs) setTimeout(window.__kSyncTabs, 0); lset('kuking:cartR', extraR); lset('kuking:cartX', extraX); lset('kuking:pantry', pantry); lset('kuking:prices', prices); lset('kuking:cartDays', days);
    clearTimeout(syncT); syncT = setTimeout(function () {
      var S = window.KukingStore; if (!S || !S.user || !S.user() || !S.collection) return;
      S.collection('meta').doc('cart').set({ have: have, hide: hide, skip: skip, extraR: extraR, extraX: extraX, pantry: pantry, prices: prices, updatedAt: new Date().toISOString() }).catch(function () {});
    }, 900);
  }
  var syncT = null;
  setTimeout(function () {
    var S = window.KukingStore; if (!S || !S.user || !S.user() || !S.collection) return;
    S.collection('meta').doc('cart').get().then(function (d) {
      var v = d && d.data && d.data(); if (!v) return;
      Object.keys(v.prices || {}).forEach(function (k) { var a = prices[k], b = v.prices[k]; if (!a || (b.src === 'me' && a.src !== 'me') || (b.at || 0) > (a.at || 0)) prices[k] = b; });
      if (!lget('kuking:pantry', null) && v.pantry) pantry = v.pantry;
      if (!extraR.length && v.extraR) extraR = v.extraR; if (!extraX.length && v.extraX) extraX = v.extraX;
      Object.keys(v.have || {}).forEach(function (k) { if (!have[k]) have[k] = v.have[k]; });
      lset('kuking:prices', prices); lset('kuking:pantry', pantry); lset('kuking:cartR', extraR); lset('kuking:cartX', extraX); lset('kuking:cartHave', have);
      if (ov) draw();
    }).catch(function () {});
  }, 4000);

  /* ---------- нормализация и отделы ---------- */
  function clean(n) { return String(n || '').replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim(); }
  function nk(n) { return clean(n).toLowerCase().replace(/ё/g, 'е'); }
  var DEPT = [
    ['meat', 'Мясо и рыба', /говя|свин|кури|индейк|баран|ягн|теля|фарш|бекон|колбас|ветчин|сосис|утк|кролик|мяс|крыл|бедр|грудк|стейк|ребр|печен[ьи]|лосос|семг|форел|треск|тунец(?!.*консерв)|рыб|кревет|кальмар|миди|краб|гребеш|дорад|сибас|скумбр|гуанчиал|панчетт|хамон|чоризо|лопатк/],
    ['veg', 'Овощи, фрукты, зелень', /картоф|морков|лук(?! репчатый сушен)|чеснок|помид|томат(?!н)|огур|перец (?:болг|слад|чили|халап)|болгарск|кабач|баклаж|капуст|брокк|цветн|шпинат|салат|руккол|кинз|петруш|укроп|базилик|мят|зелен|лимон|лайм|апельс|яблок|груш|банан|авокадо|имбир|сельдер|свекл|тыкв|гриб|шампин|вешенк|редис|корнишон|ягод|гранат|манго|ананас|черри|порей|шалот/],
    ['dairy', 'Молочное и яйца', /молок|сливк|сметан|сыр|творог|йогурт|кефир|сливочн|яйц|яиц|желтк|ряженк|маскарп|моцарел|рикотт|пармез|фета|чеддер|гхи|айран/],
    ['bread', 'Хлеб и выпечка', /хлеб|булк|булоч|багет|лаваш|тортиль|пита|лепешк|бриошь|чиабат|тост/],
    ['frozen', 'Заморозка', /заморож|морожен|лед\b|льда/],
    ['drink', 'Напитки', /вино|пиво|сок|лимонад|газиров|тоник|ром|виски|водк|джин|текил|кола|минерал/],
    ['spice', 'Специи и соусы', /соль|перец (?:черн|молот|душист)|паприк|кориандр|куркум|зира|кумин|масала|сунели|хмели|карри|корица|мускат|гвоздик|лавров|орегано|тимьян|розмарин|прованс|ваниль|соус|кетчуп|майонез|горчиц|уксус|паста томатн|томатная паста|аджик|ткемал|мед|сироп|бульонн|специ|приправ|сахар|крахмал|разрыхл|сода|дрожж/],
    ['groc', 'Бакалея', /рис|греч|булгур|кускус|киноа|перлов|овсян|мук|макарон|паст|спагет|пенне|лапш|фасол|нут|чечев|горох|масло|орех|кешью|миндал|арахис|кунжут|семечк|консерв|тунец|кокосов|молоко кокос|шоколад|какао|изюм|курага|чернослив|панко|сухар/]
  ];
  var DNAME = {}; DEPT.forEach(function (d) { DNAME[d[0]] = d[1]; }); DNAME.other = 'Прочее';
  var DORDER = ['veg', 'meat', 'dairy', 'bread', 'groc', 'spice', 'frozen', 'drink', 'other'];
  function dept(name) { var s = nk(name); for (var i = 0; i < DEPT.length; i++) if (DEPT[i][2].test(s)) return DEPT[i][0]; return 'other'; }
  function inPantry(name) { var s = nk(name); return pantry.some(function (p) { var q = nk(p.name); return q && (s === q || s.indexOf(q) === 0 || q.indexOf(s) === 0); }); }

  /* ---------- сбор корзины ---------- */
  function sources() {
    var lib = L(), out = [], td = lib.today ? lib.today() : '';
    if (lib.planDays) {
      var pd = lib.planDays(); Object.keys(pd).sort().forEach(function (k) {
        if (k < td) return; var dd = (new Date(k) - new Date(td)) / 864e5; if (dd >= days) return;
        pd[k].forEach(function (id) { if (skip[id] || (lib.isDone && lib.isDone('cook:' + k + ':' + id))) return; var r = lib.byId && lib.byId(id); if (r) out.push({ r: r, why: 'план', day: k }); });
      });
    }
    extraR.forEach(function (id) { var r = lib.byId && lib.byId(id); if (r && !out.some(function (s) { return s.r.id === id; })) out.push({ r: r, why: 'добавлен' }); });
    return out;
  }
  function build() {
    var sum = {}, order = [];
    function add(name, amount, unit, text, from) {
      if (!name || /^вода\b/i.test(clean(name))) return;
      var k = nk(name) + '|' + (unit || '');
      if (!sum[k]) { sum[k] = { key: k, name: clean(name), unit: unit || '', amount: 0, text: text || '', from: [] }; order.push(k); }
      if (amount) sum[k].amount += +amount; if (from && sum[k].from.indexOf(from) < 0) sum[k].from.push(from);
    }
    sources().forEach(function (s) { (s.r.ingredients || []).forEach(function (i) { if (i && i.name) add(i.name, i.amount, i.unit, i.unitText, s.r.title); }); });
    extraX.forEach(function (x) { add(x.name, x.amount, x.unit, x.text, 'своё'); });
    Object.keys(have).forEach(function (k) { if (!sum[k]) delete have[k]; }); Object.keys(hide).forEach(function (k) { if (!sum[k]) delete hide[k]; });
    return order.map(function (k) { var it = sum[k]; it.dept = dept(it.name); it.home = inPantry(it.name); it.got = !!have[k]; it.hidden = !!hide[k]; return it; }).filter(function (it) { return !it.hidden; });
  }
  function qty(it) { return it.amount ? fmt(it.amount) + ' ' + it.unit : it.text || ''; }
  function fmt(n) { return String(Math.round(n * 10) / 10).replace('.', ','); }

  /* ---------- цены ---------- */
  function pk(it) { return nk(it.name) + '|' + (it.unit || 'шт'); }
  function factor() { // во сколько раз твои цены отличаются от оценок нейросети — по исправленным
    var r = []; Object.keys(prices).forEach(function (k) { var p = prices[k]; if (p.src === 'me' && p.ai > 0) r.push(p.per / p.ai); });
    if (r.length < 2) return 1; r.sort(function (a, b) { return a - b; }); var m = r[Math.floor(r.length / 2)]; return Math.max(0.5, Math.min(2, m));
  }
  function price(it) {
    var p = prices[pk(it)]; if (!p) return null;
    var per = p.src === 'me' ? p.per : p.per * factor(), n = it.amount || 1;
    return Math.max(1, Math.round(per * n));
  }
  var pricing = false, priceErr = '';
  function estimate(items) {
    var need = items.filter(function (it) { return !it.home && !prices[pk(it)]; }).slice(0, 40);
    if (!need.length || pricing) return;
    if (!(window.KukingAI && KukingAI.ready && KukingAI.ready()) || !(window.claude && window.claude.use)) { priceErr = 'Цены считает нейросеть — она пока не подключена.'; return; }
    pricing = true; priceErr = '';
    var mine = Object.keys(prices).filter(function (k) { return prices[k].src === 'me'; }).slice(0, 15).map(function (k) { var x = k.split('|'); return x[0] + ' — ' + Math.round(prices[k].per * (x[1] === 'г' || x[1] === 'мл' ? 1000 : 1)) + ' ₽ за ' + (x[1] === 'г' ? 'кг' : x[1] === 'мл' ? 'л' : x[1]); });
    Promise.resolve(window.claude.use('sample')).then(function (s) {
      return s.json({ system: 'Ты знаешь цены продуктов в российских сетях (Пятёрочка, Перекрёсток, Самокат, Лавка) на конец 2026 года. Отвечаешь только JSON-объектом.',
        user: 'Оцени стоимость каждой позиции в рублях за указанное количество (не за упаковку; если продаётся упаковкой — всё равно за указанное количество).' +
          (mine.length ? '\nРеальные цены человека — ориентируйся на этот уровень: ' + mine.join('; ') + '.' : '') +
          '\nПозиции: ' + JSON.stringify(need.map(function (it) { return { n: it.name, q: it.amount || 1, u: it.unit || 'шт' }; })) +
          '\nВерни {"p":[число рублей для каждой позиции по порядку]}' }, { modelTier: 'default', cache: false, temperature: 0.2 });
    }).then(function (v) {
      var arr = v && Array.isArray(v.p) ? v.p : [];
      need.forEach(function (it, i) { var rub = +arr[i]; if (rub > 0 && rub < 50000) { var per = rub / (it.amount || 1); prices[pk(it)] = { per: per, ai: per, src: 'ai', at: Date.now() }; } });
      pricing = false; saveAll(); if (ov) draw();
    }).catch(function (e) { pricing = false; priceErr = window.KukingAIMsg ? KukingAIMsg(e) : 'Нейросеть не ответила'; if (ov) draw(); });
  }
  function setPrice(it, rub) {
    var per = rub / (it.amount || 1), old = prices[pk(it)];
    prices[pk(it)] = { per: per, ai: old && old.ai || 0, src: 'me', at: Date.now() }; saveAll();
  }

  /* ---------- экран ---------- */
  var ov = null, tab = 'cart', openHome = false;
  function total(items) { var t = 0, n = 0, miss = 0; items.forEach(function (it) { if (it.home || it.got) return; var p = price(it); if (p) { t += p; n++; } else miss++; }); return { t: t, n: n, miss: miss }; }
  function rowHTML(it) {
    var p = price(it), mine = prices[pk(it)] && prices[pk(it)].src === 'me';
    return '<li class="ct-it' + (it.got ? ' got' : '') + '" data-ck="' + esc(it.key) + '">' +
      '<button type="button" class="ct-main" data-ct="tog" role="checkbox" aria-checked="' + it.got + '"><span class="ct-box" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 12.5l4 4 8-9"/></svg></span>' +
      '<span class="ct-t"><b>' + esc(it.name) + '</b><small>' + esc([qty(it), it.from.length ? it.from.slice(0, 2).join(', ') + (it.from.length > 2 ? ' +' + (it.from.length - 2) : '') : ''].filter(Boolean).join(' · ')) + '</small></span></button>' +
      '<button type="button" class="ct-pr' + (mine ? ' me' : '') + '" data-ct="price" aria-label="Цена">' + (p ? '≈ ' + p + ' ₽' : pricing ? '…' : '— ₽') + '</button>' +
      '<button type="button" class="ct-more" data-ct="more" aria-label="Ещё">⋯</button></li>';
  }
  function cartHTML() {
    var items = build(), buy = items.filter(function (i) { return !i.home; }), home = items.filter(function (i) { return i.home; });
    var left = buy.filter(function (i) { return !i.got; }), got = buy.filter(function (i) { return i.got; }), src = sources(), tt = total(items);
    if (!items.length && !src.length) return '<div class="ct-empty"><p class="ct-big">Корзина пустая</p><p class="small">Добавьте блюда в план или нажмите «В корзину» в карточке рецепта. Своё можно вписать ниже.</p></div>' + addHTML();
    var h = '<div class="ct-sum"><div><span class="ct-k">Осталось купить</span><b class="ct-big">' + left.length + ' из ' + buy.length + '</b></div>' +
      '<div class="ct-tot"><span class="ct-k">Примерно</span><b class="ct-big">' + (tt.t ? '≈ ' + tt.t.toLocaleString('ru-RU') + ' ₽' : '—') + '</b>' + (tt.miss && tt.n ? '<small>без ' + tt.miss + ' поз.</small>' : '') + '</div></div>' +
      '<div class="ct-prog" aria-hidden="true"><i style="width:' + (buy.length ? Math.round(got.length / buy.length * 100) : 0) + '%"></i></div>' +
      (!left.length ? '<p class="ct-allgot">Всё куплено ✓</p>' : '') +
      '<h3 class="ct-dept">Блюда в корзине<span>' + src.length + '</span></h3><ul class="ct-list ct-rec">' + src.map(function (s) { return '<li class="ct-it"><span class="ct-t"><b>' + esc(s.r.title) + '</b><small>' + (s.day ? 'из плана · ' + dlab(s.day) : 'добавлено вручную') + '</small></span><button type="button" class="ct-rm" data-rrm="' + esc(s.r.id) + '" aria-label="Убрать из корзины">Убрать</button></li>'; }).join('') + '</ul>' +
      '<p class="small ct-src">Блюда из плана на <button type="button" class="ct-days" data-ct="days">' + days + ' ' + plural(days, 'день', 'дня', 'дней') + '</button>' + (Object.keys(skip).length ? ' · <button type="button" class="ct-days" data-ct="unskip">вернуть убранные (' + Object.keys(skip).length + ')</button>' : '') + '</p>' +
      '<div class="ct-acts ct-top"><button type="button" class="nav-btn" data-ct="all">' + (left.length ? 'Отметить всё' : 'Снять все отметки') + '</button>' + (got.length ? '<button type="button" class="nav-btn" data-ct="sweep">Убрать купленное</button>' : '') + '</div>' +
      (priceErr ? '<p class="small ct-err">' + esc(priceErr) + '</p>' : '');
    DORDER.forEach(function (d) {
      var g = left.filter(function (i) { return i.dept === d; }); if (!g.length) return;
      h += '<h3 class="ct-dept">' + DNAME[d] + '<span>' + g.length + '</span></h3><ul class="ct-list">' + g.map(rowHTML).join('') + '</ul>';
    });
    if (got.length) h += '<h3 class="ct-dept ct-done">Куплено<span>' + got.length + '</span></h3><ul class="ct-list">' + got.map(rowHTML).join('') + '</ul>';
    if (home.length) h += '<button type="button" class="ct-dept ct-homeh" data-ct="homeToggle" aria-expanded="' + openHome + '">Есть дома<span>' + home.length + '</span><i>' + (openHome ? '−' : '+') + '</i></button>' +
      (openHome ? '<ul class="ct-list ct-home">' + home.map(function (it) { return '<li class="ct-it home" data-ck="' + esc(it.key) + '"><span class="ct-t"><b>' + esc(it.name) + '</b><small>' + esc(qty(it)) + '</small></span><button type="button" class="ct-more" data-ct="unhome">Купить</button></li>'; }).join('') + '</ul>' : '');
    h += addHTML();
    h += '<div class="ct-acts"><button type="button" class="nav-btn" data-ct="tg">Отправить в Telegram</button></div>';
    estimate(items);
    return h;
  }
  function addHTML() { return '<form class="ct-add" data-ct-form><input id="ctAdd" maxlength="60" placeholder="Добавить своё: хлеб, 2 шт" autocomplete="off"><button type="submit" class="nav-btn">Добавить</button></form>'; }
  function plural(n, a, b, c) { n = Math.abs(n) % 100; var m = n % 10; return n > 10 && n < 20 ? c : m > 1 && m < 5 ? b : m === 1 ? a : c; }

  function pantryHTML() {
    return '<p class="small">Что есть дома всегда или осталось после готовки. Эти продукты не попадают в корзину.</p>' +
      '<ul class="ct-list">' + pantry.map(function (p, i) { return '<li class="ct-it home"><span class="ct-t"><b>' + esc(p.name) + '</b>' + (p.note ? '<small>' + esc(p.note) + '</small>' : '') + '</span><button type="button" class="ct-more" data-pdel="' + i + '" aria-label="Убрать">×</button></li>'; }).join('') + '</ul>' +
      '<form class="ct-add" data-pt-form><input id="ptAdd" maxlength="60" placeholder="Например: рис, оливковое масло" autocomplete="off"><button type="submit" class="nav-btn">Добавить</button></form>' +
      '<button type="button" class="nav-btn primary ct-cook" data-ct="cookPantry"' + (pantry.length > 2 ? '' : ' disabled') + '>Что приготовить из кладовки</button>';
  }
  function draw() {
    if (!ov) return; var y = ov.querySelector('.ct-body') ? ov.querySelector('.ct-body').scrollTop : 0, page = ov.classList.contains('ct-page');
    ov.innerHTML = '<div class="ct-head">' + (page ? '' : '<button type="button" class="qz-tx" data-ct="close">‹ Назад</button>') + '<div class="seg ct-tabs" role="tablist">' +
      '<button type="button" role="tab" data-ctab="cart" aria-selected="' + (tab === 'cart') + '">Корзина</button><button type="button" role="tab" data-ctab="pantry" aria-selected="' + (tab === 'pantry') + '">Кладовка · ' + pantry.length + '</button></div><span></span></div>' +
      '<div class="ct-body">' + (tab === 'cart' ? cartHTML() : pantryHTML()) + '</div>';
    ov.querySelector('.ct-body').scrollTop = y;
  }
  /* корзина — вкладка приложения: рисуемся прямо в странице, панель снизу остаётся */
  function mount(host) {
    ov = host; host.classList.add('ct-page'); draw();
    if (!host.__ctb) { host.__ctb = 1; host.addEventListener('click', onClick); host.addEventListener('submit', onSubmit); }
  }
  function open(t) {
    tab = t || tab || 'cart';
    if (window.__kGoTab) { window.__kGoTab('cart'); if (ov && ov.classList.contains('ct-page')) draw(); return; }
    if (ov) return;
    ov = document.createElement('div'); ov.className = 'ct'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Корзина');
    document.body.appendChild(ov); draw(); document.documentElement.classList.add('qz-lock');
    requestAnimationFrame(function () { requestAnimationFrame(function () { ov.classList.add('on'); }); });
    ov.addEventListener('click', onClick); ov.addEventListener('submit', onSubmit);
    var x0 = null; ov.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX < 28 ? e.touches[0].clientX : null; }, { passive: true });
    ov.addEventListener('touchend', function (e) { if (x0 != null && e.changedTouches[0].clientX - x0 > 80) close(); x0 = null; }, { passive: true });
  }
  function close() { if (!ov || ov.classList.contains('ct-page')) return; var o = ov; ov = null; o.classList.remove('on'); document.documentElement.classList.remove('qz-lock'); setTimeout(function () { o.remove(); }, 300); if (L().refresh) L().refresh(); }
  function find(key) { return build().filter(function (i) { return i.key === key; })[0]; }
  function onSubmit(e) {
    e.preventDefault();
    if (e.target.hasAttribute('data-ct-form')) { var v = e.target.querySelector('#ctAdd').value.trim(); if (!v) return; var m = /^(.*?)[,\s]+(\d+(?:[.,]\d+)?)\s*(г|кг|мл|л|шт|уп)?\.?$/i.exec(v);
      var x = m ? { name: m[1].trim(), amount: +m[2].replace(',', '.'), unit: (m[3] || 'шт').toLowerCase() } : { name: v, amount: 0, unit: '' };
      if (x.unit === 'кг') { x.amount *= 1000; x.unit = 'г'; } if (x.unit === 'л') { x.amount *= 1000; x.unit = 'мл'; }
      extraX.push(x); hap(); saveAll(); draw(); setTimeout(function () { var i = ov && ov.querySelector('#ctAdd'); if (i) i.focus(); }, 50); }
    if (e.target.hasAttribute('data-pt-form')) { var p = e.target.querySelector('#ptAdd').value; p.split(/[,;]/).map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (s) { if (!inPantry(s)) pantry.push({ name: s.slice(0, 40) }); }); hap(); saveAll(); draw(); }
  }
  function onClick(e) {
    var t = e.target.closest('[data-ctab]'); if (t) { tab = t.getAttribute('data-ctab'); hap(); draw(); return; }
    var rr = e.target.closest('[data-rrm]'); if (rr) { removeRecipe(rr.getAttribute('data-rrm')); hap(10); draw(); return; }
    var pd = e.target.closest('[data-pdel]'); if (pd) { pantry.splice(+pd.getAttribute('data-pdel'), 1); hap(); saveAll(); draw(); return; }
    var b = e.target.closest('[data-ct]'); if (!b) return;
    var a = b.getAttribute('data-ct'), li = b.closest('[data-ck]'), key = li && li.getAttribute('data-ck');
    if (a === 'close') return close();
    if (a === 'tog') { if (have[key]) delete have[key]; else have[key] = Date.now(); hap(8); saveAll(); flip(key); return; }
    if (a === 'homeToggle') { openHome = !openHome; draw(); return; }
    if (a === 'unhome') { var it0 = find(key); if (it0) pantry = pantry.filter(function (p) { var q = nk(p.name), s = nk(it0.name); return !(s === q || s.indexOf(q) === 0 || q.indexOf(s) === 0); }); saveAll(); draw(); return; }
    if (a === 'all') { var its = build().filter(function (i) { return !i.home; }), anyLeft = its.some(function (i) { return !i.got; }); its.forEach(function (i) { if (anyLeft) have[i.key] = have[i.key] || Date.now(); else delete have[i.key]; }); hap(12); saveAll(); draw(); return; }
    if (a === 'sweep') { build().forEach(function (i) { if (i.got) { hide[i.key] = Date.now(); delete have[i.key]; } }); hap(12); saveAll(); draw(); return; }
    if (a === 'unskip') { skip = {}; saveAll(); draw(); return; }
    if (a === 'days') { days = days === 7 ? 3 : days === 3 ? 14 : 7; hap(); saveAll(); draw(); return; }
    if (a === 'tg') { var txt = tgText(); window.open('https://t.me/share/url?url=' + encodeURIComponent(' ') + '&text=' + encodeURIComponent(txt), '_blank'); return; }
    if (a === 'cookPantry') { close(); setTimeout(function () { if (window.KCat && KCat.fridge) KCat.fridge(pantry.map(function (p) { return p.name; })); }, 320); return; }
    if (a === 'price') { var it = find(key); if (it) priceSheet(it); return; }
    if (a === 'more') { var it2 = find(key); if (it2) moreSheet(it2); return; }
  }
  /* куплено уезжает вниз плавно: FLIP */
  function flip(key) {
    var body = ov.querySelector('.ct-body'), before = {};
    body.querySelectorAll('[data-ck]').forEach(function (el) { before[el.getAttribute('data-ck')] = el.getBoundingClientRect().top; });
    draw();
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    ov.querySelectorAll('.ct-body [data-ck]').forEach(function (el) {
      var k = el.getAttribute('data-ck'); if (before[k] == null) return; var dy = before[k] - el.getBoundingClientRect().top; if (!dy) return;
      el.style.transform = 'translateY(' + dy + 'px)'; el.style.transition = 'none';
      requestAnimationFrame(function () { el.style.transition = 'transform .38s cubic-bezier(.2,.8,.2,1)'; el.style.transform = ''; });
    });
  }
  function tgText() {
    var items = build().filter(function (i) { return !i.home && !i.got; }), out = ['Закупка — «Жарко»'];
    DORDER.forEach(function (d) { var g = items.filter(function (i) { return i.dept === d; }); if (!g.length) return; out.push('', DNAME[d] + ':'); g.forEach(function (i) { out.push('• ' + i.name + (qty(i) ? ' — ' + qty(i) : '')); }); });
    var tt = total(build()); if (tt.t) out.push('', 'Примерно ' + tt.t.toLocaleString('ru-RU') + ' ₽');
    return out.join('\n');
  }
  function mini(title, body, onClick2) {
    var m = document.createElement('div'); m.className = 'ks-ov ct-sheet'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
    m.innerHTML = '<div class="ks"><span class="ks-grab" aria-hidden="true"></span><div class="ks-head"><h3>' + esc(title) + '</h3><button type="button" class="ks-x" aria-label="Закрыть">×</button></div><div class="ks-body">' + body + '</div></div>';
    document.body.appendChild(m); requestAnimationFrame(function () { m.classList.add('on'); });
    function shut() { m.classList.remove('on'); setTimeout(function () { m.remove(); }, 280); }
    m.addEventListener('click', function (e) { if (e.target === m || e.target.closest('.ks-x')) return shut(); onClick2(e, m, shut); });
    return m;
  }
  function priceSheet(it) {
    var p = price(it), rec = prices[pk(it)];
    var m = mini(it.name, '<p class="small">' + esc(qty(it) || '1 шт') + (rec ? ' · ' + (rec.src === 'me' ? 'ваша цена' : 'оценка нейросети' + (factor() !== 1 ? ', поправлена по вашим ценам' : '')) : '') + '</p>' +
      '<label class="set-f qz-f"><span>Сколько стоит это количество, ₽</span><input id="ctPr" type="number" inputmode="decimal" min="1" value="' + (p || '') + '" placeholder="Например, 189"></label>' +
      '<p class="small ct-note">Ваши цены запоминаются: по ним пересчитаются оценки остальных продуктов.</p><button type="button" class="nav-btn primary" data-pr="ok">Сохранить</button>' +
      (rec && rec.src === 'me' ? '<button type="button" class="nav-btn" data-pr="ai">Вернуть оценку нейросети</button>' : ''),
      function (e, mm, shut) { var b = e.target.closest('[data-pr]'); if (!b) return;
        if (b.getAttribute('data-pr') === 'ai') { var r = prices[pk(it)]; if (r && r.ai) prices[pk(it)] = { per: r.ai, ai: r.ai, src: 'ai', at: Date.now() }; else delete prices[pk(it)]; saveAll(); }
        else { var v = +String(mm.querySelector('#ctPr').value).replace(',', '.'); if (!(v > 0)) return; setPrice(it, v); }
        hap(10); shut(); draw(); });
    setTimeout(function () { var i = m.querySelector('#ctPr'); if (i) i.focus(); }, 300);
  }
  function moreSheet(it) {
    mini(it.name, '<div class="ct-menu">' +
      '<button type="button" data-mo="home">🏠 Есть дома — не покупать</button>' +
      STORES.map(function (s, i) { return '<a href="' + s[1] + encodeURIComponent(it.name) + '" target="_blank" rel="noopener" data-mo="store" data-nm="' + esc(it.name) + '">🔎 Найти в ' + (s[0] === 'Самокат' ? 'Самокате' : s[0] === 'Лавка' ? 'Лавке' : s[0]) + '</a>'; }).join('') +
      '<button type="button" data-mo="price">₽ Изменить цену</button>' +
      '<button type="button" data-mo="hide" class="ct-danger">Убрать из списка</button></div>' +
      '<p class="small ct-note">Название копируется — если откроется сайт, вставьте его в поиск приложения.</p>' + (it.from.length ? '<p class="small ct-note">Для: ' + esc(it.from.join(', ')) + '</p>' : ''),
      function (e, mm, shut) { var b = e.target.closest('[data-mo]'); if (!b) return; var a = b.getAttribute('data-mo');
        if (a === 'store') { try { navigator.clipboard.writeText(b.getAttribute('data-nm')); } catch (x) {} setTimeout(shut, 100); return; }
        shut();
        if (a === 'home') { pantry.push({ name: it.name }); saveAll(); draw(); }
        if (a === 'price') setTimeout(function () { priceSheet(it); }, 280);
        if (a === 'hide') { hide[it.key] = Date.now(); var xi = -1; extraX.forEach(function (x, i) { if (nk(x.name) + '|' + (x.unit || '') === it.key) xi = i; }); if (xi >= 0) { extraX.splice(xi, 1); delete hide[it.key]; } saveAll(); draw(); }
      });
  }

  /* ---------- из карточки рецепта ---------- */
  function addRecipe(id) { delete skip[id]; if (extraR.indexOf(id) < 0 && !hasRecipe(id)) extraR.push(id); saveAll(); }
  /* убрать блюдо из корзины целиком: и добавленное вручную, и пришедшее из плана (план не трогаем) */
  function removeRecipe(id) { extraR = extraR.filter(function (x) { return x !== id; }); var pd = L().planDays ? L().planDays() : {}; if (Object.keys(pd).some(function (k) { return (pd[k] || []).indexOf(id) >= 0; })) skip[id] = Date.now(); saveAll(); }
  function hasRecipe(id) { return sources().some(function (s) { return s.r.id === id; }); }
  function dlab(k) { var t = L().today ? L().today() : ''; var d = new Date(k), n = Math.round((d - new Date(t)) / 864e5); return n === 0 ? 'сегодня' : n === 1 ? 'завтра' : ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'][d.getDay()] + ', ' + d.getDate(); }
  /* остатки после готовки → кладовка */
  function leftovers(r) {
    var ing = (r.ingredients || []).filter(function (i) { return i && i.name && !/соль|вода|перец черн/i.test(i.name); }), sel = {};
    mini('Что осталось?', '<p class="small">Отметьте продукты, которые остались после «' + esc(r.title) + '». Они уйдут в кладовку, и нейросеть предложит, как их доесть.</p><div class="qz-chips">' +
      ing.map(function (i, k) { return '<button type="button" class="qz-chip" data-lo="' + k + '" aria-pressed="false">' + esc(clean(i.name)) + '</button>'; }).join('') + '</div>' +
      '<button type="button" class="nav-btn primary ct-cook" data-lo-ok>В кладовку</button>',
      function (e, mm, shut) {
        var c = e.target.closest('[data-lo]'); if (c) { var k = c.getAttribute('data-lo'), on = !sel[k]; if (on) sel[k] = 1; else delete sel[k]; c.setAttribute('aria-pressed', on); hap(); return; }
        if (e.target.closest('[data-lo-ok]')) { Object.keys(sel).forEach(function (k) { var n = clean(ing[k].name); if (!inPantry(n)) pantry.push({ name: n, note: 'осталось от «' + r.title + '»', at: Date.now() }); }); saveAll(); shut(); if (Object.keys(sel).length) setTimeout(function () { open('pantry'); }, 300); }
      });
  }

  /* ---------- меню на неделю по КБЖУ ---------- */
  function weekMenu() {
    var lib = L(), all = (lib.all ? lib.all() : []).filter(function (r) { return r.ingredients && r.ingredients.length; });
    var td = lib.today(), pd = lib.planDays(), free = [];
    for (var i = 0; i < 7; i++) { var d = new Date(td); d.setDate(d.getDate() + i); var k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); if (!(pd[k] || []).length) free.push(k); }
    var m = mini('Меню на неделю', '<div class="ct-wm"><div class="fr-pot" aria-hidden="true"><i></i><i></i><i></i></div><p class="small">Нейросеть раскладывает ужины по свободным дням под вашу норму…</p></div>', function () {});
    if (!free.length) { m.querySelector('.ks-body').innerHTML = '<p class="small">На неделю всё уже запланировано.</p>'; return; }
    if (all.length < 3) { m.querySelector('.ks-body').innerHTML = '<p class="small">В книге пока мало рецептов — добавьте хотя бы три, например через «10 идей под твой вкус».</p>'; return; }
    var t = window.KBody && KBody.targets && KBody.targets();
    var DOW = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
    if (!(window.KukingAI && KukingAI.ready && KukingAI.ready()) || !(window.claude && window.claude.use)) { m.querySelector('.ks-body').innerHTML = '<p class="small">Для меню нужна нейросеть — она пока не подключена.</p>'; return; }
    Promise.resolve(window.claude.use('sample')).then(function (s) {
      return s.json({ system: 'Ты нутрициолог и шеф. Составляешь меню ужинов из книги рецептов человека. Отвечаешь только JSON-объектом.',
        user: 'Свободные дни: ' + free.map(function (k) { return k + ' (' + DOW[new Date(k).getDay()] + ')'; }).join(', ') + '.\n' +
          (t ? 'Цель: ' + t.goal + '. На ужин примерно ' + t.meal.kcal + ' ккал, белок ' + t.meal.p + ' г.\n' : '') + (window.KPrefs ? KPrefs.promptLine() + '\n' : '') +
          'Рецепты (id, название, ккал/белок на порцию, минут): ' + JSON.stringify(all.map(function (r) { var d = (r.dishes || [])[0] || {}; return [r.id, r.title, d.kcal || 0, d.p || 0, window.KMeta ? KMeta.mins(r.totalTime) : 0]; })) +
          '\nПравила: в будни быстрее, в выходные можно дольше; не ставь одно блюдо два дня подряд; чередуй белок; повтор за неделю — максимум дважды. Верни {"days":[{"day":"YYYY-MM-DD","id":"id рецепта","why":"до 40 знаков"}]}' },
        { modelTier: 'default', cache: false, temperature: 0.5 });
    }).then(function (v) {
      var ids = {}; all.forEach(function (r) { ids[r.id] = r; });
      var plan = (v && Array.isArray(v.days) ? v.days : []).filter(function (x) { return x && ids[x.id] && free.indexOf(x.day) >= 0; });
      if (!plan.length) throw { message: 'Нейросеть не собрала меню — попробуйте ещё раз' };
      var kc = 0; plan.forEach(function (x) { kc += ((ids[x.id].dishes || [])[0] || {}).kcal || 0; });
      m.querySelector('.ks-body').innerHTML = '<ul class="ct-list ct-wml">' + plan.map(function (x) { var r = ids[x.id], d = (r.dishes || [])[0] || {};
        return '<li class="ct-it"><span class="ct-day">' + DOW[new Date(x.day).getDay()] + '<b>' + new Date(x.day).getDate() + '</b></span><span class="ct-t"><b>' + esc(r.title) + '</b><small>' + esc([d.kcal ? d.kcal + ' ккал · Б ' + d.p : '', x.why].filter(Boolean).join(' · ')) + '</small></span></li>'; }).join('') + '</ul>' +
        (kc ? '<p class="small">В среднем ≈ ' + Math.round(kc / plan.length) + ' ккал за ужин' + (t ? ' при цели ' + t.meal.kcal : '') + '.</p>' : '') +
        '<button type="button" class="nav-btn primary ct-cook" data-wm="ok">В план и корзину</button>';
      m.addEventListener('click', function (e) { if (!e.target.closest('[data-wm]')) return; plan.forEach(function (x) { lib.planAdd(x.day, x.id); }); hap(12); m.classList.remove('on'); setTimeout(function () { m.remove(); open('cart'); }, 280); });
    }).catch(function (e) { m.querySelector('.ks-body').innerHTML = '<p class="small">' + esc(e && e.message || (window.KukingAIMsg ? KukingAIMsg(e) : 'Нейросеть не ответила')) + '</p>'; });
  }

  function count() { try { return build().filter(function (i) { return !i.home && !i.got; }).length; } catch (e) { return 0; } }
  window.KCart = { open: open, mount: mount, addRecipe: addRecipe, removeRecipe: removeRecipe, hasRecipe: hasRecipe, leftovers: leftovers, weekMenu: weekMenu, count: count, pantry: function () { return pantry; } };
})();
