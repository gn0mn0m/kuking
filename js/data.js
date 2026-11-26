/* Жарко 5 — данные. Один источник правды для книги, плана, покупок, кладовки и оценок.
   Хранится в телефоне (те же ключи, что в 4.x — ничего не теряется) и в облаке Supabase
   (таблица docs: meta/plan, meta/cart, meta/shop5, meta/done, meta/gone, reviews/*, fresh/*). */
(function () {
  'use strict';
  var Z = window.Z, ls = Z.ls;
  var D = Z.data = {};
  function S() { return window.KukingStore; }
  function signed() { return !!(S() && S().enabled && S().user()); }
  function db() { return signed() ? S().db : null; }
  function now() { return new Date().toISOString(); }

  /* ================= рецепты ================= */
  var builtin = (window.RECIPES || []).slice();
  var fresh = ls.get('kuking:fresh', {}) || {};            // id → рецепт от нейросети
  var gone = ls.get('kuking:gone', []) || [];              // удалённые навсегда
  var hidden = ls.get('kuking:hidden', {}) || {};          // убранные в корзину
  var BIN_DAYS = 30;
  function saveRecipesMeta() {
    ls.set('kuking:fresh', fresh); ls.set('kuking:gone', gone); ls.set('kuking:hidden', hidden);
    var d = db(); if (d) d.collection('meta').doc('gone').set({ ids: gone, hidden: hidden, updatedAt: now() }).catch(function () {});
  }
  D.all = function (withHidden) {
    var out = builtin.concat(Object.keys(fresh).map(function (k) { return fresh[k]; }))
      .filter(function (r) { return r && r.id && r.title && gone.indexOf(r.id) < 0; });
    return withHidden ? out : out.filter(function (r) { return !hidden[r.id]; });
  };
  D.byId = function (id) { var a = D.all(true); for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i]; return null; };
  D.binned = function () { return D.all(true).filter(function (r) { return hidden[r.id]; }); };
  D.isAI = function (r) { return /^(ai|my)-/.test(r.id); };
  D.hide = function (id) { hidden[id] = Date.now(); saveRecipesMeta(); Z.emit('change'); };
  D.restore = function (id) { delete hidden[id]; saveRecipesMeta(); Z.emit('change'); };
  D.purge = function (id) {
    delete hidden[id]; if (gone.indexOf(id) < 0) gone.push(id);
    if (fresh[id]) { delete fresh[id]; var d = db(); if (d) d.collection('fresh').doc(id).delete().catch(function () {}); }
    Object.keys(plan.days).forEach(function (k) { plan.days[k] = plan.days[k].filter(function (x) { return x !== id; }); });
    savePlan(); saveRecipesMeta(); Z.emit('change');
  };
  D.addRecipe = function (r) {
    fresh[r.id] = r; saveRecipesMeta();
    var d = db(); if (d) d.collection('fresh').doc(r.id).set({ title: r.title, theme: r.theme || '', createdAt: now(), recipe: JSON.stringify(r) }).catch(function () {});
    Z.emit('change');
  };
  /* старое в корзине больше 30 дней — удаляем само */
  Object.keys(hidden).forEach(function (id) { if (Date.now() - hidden[id] > BIN_DAYS * 864e5) { delete hidden[id]; if (gone.indexOf(id) < 0) gone.push(id); } });

  /* разбор рецепта */
  D.mode = function (r) { return r.mode === 'romance' ? 'two' : r.mode === 'friends' ? 'crew' : 'self'; };
  D.MODE = { self: 'Для себя', two: 'Вдвоём', crew: 'Компания' };
  D.serveIdx = function (r) { return (r.slides || []).map(function (s) { return s.type; }).indexOf('serve'); };
  D.steps = function (r) { return (r.slides || []).filter(function (s) { return s.type === 'step'; }); };
  D.total = function (r) { return Z.mins(r.totalTime) || D.steps(r).reduce(function (a, s) { return a + Z.mins(s.dur); }, 0); };
  D.active = function (r) { return (r.meta && r.meta.activeMin) || 0; };
  D.kcal = function (r) { var d = (r.dishes || [])[0]; return d ? { kcal: d.kcal, p: d.p, f: d.f, c: d.c } : null; };
  D.color = function (r) { /* цвет-заглушка под фото: самый «вкусный» тёмный цвет подачи */
    var s = (r.slides || [])[D.serveIdx(r)], l = (s && s.plate && s.plate.layers) || [];
    function lum(h) { var m = /^#?([0-9a-f]{6})$/i.exec(h || ''); if (!m) return -1; var n = parseInt(m[1], 16); return (0.299 * (n >> 16) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255; }
    function warm(h) { var n = parseInt(String(h).replace('#', ''), 16); return (n >> 16) > (n >> 8 & 255) && (n >> 16) > (n & 255) && (n >> 8 & 255) >= (n & 255) * 0.8; }
    var c = l.filter(function (x) { return /chunk|strip|noodle|slice|ring|grain|smooth/.test(x.item || '') && warm(x.color); }).map(function (x) { return x.color; })
      .filter(function (h) { var v = lum(h); return v > 0.18 && v < 0.6; }).sort(function (a, b) { return lum(a) - lum(b); })[0];
    return c || '#8A5A32';
  };
  D.hasMeat = function (r) { return (r.ingredients || []).some(function (i) { return /говя|свин|баран|телят|кури|бедр|бёдр|крыл|фарш|мяс|индей|утк|лосос|сёмг|семг|рыб|форел|кревет|лопатк|грудк|окорок|шея/i.test(i.name); }); };
  D.meatOf = function (r) { var m = (r.ingredients || []).filter(function (i) { return i.g === 0 || /говя|свин|кури|бедр|фарш|лопатк|шея|рыб|лосос/i.test(i.name); })[0]; return m ? m.name.replace(/\s*\(.*?\)/g, '') : 'мясо'; };

  /* ================= количества ================= */
  function scaleVal(ing, base, guests, baseGuests) {
    if (ing.round === 'fixed') return base;
    var x = base * guests / (baseGuests || 1);
    switch (ing.round) {
      case 'ceil': return Math.max(1, Math.ceil(x - 1e-9));
      case 'int': return Math.max(1, Math.round(x));
      case 'g50': return Math.max(50, Math.round(x / 50) * 50);
      case 'g10': return Math.max(10, Math.round(x / 10) * 10);
      case 'ml5': return Math.max(5, Math.round(x / 5) * 5);
      case 'spoon': return Math.max(0.5, Math.round(x * 2) / 2);
      case 'dec1': return Math.max(0.1, Math.round(x * 10) / 10);
    }
    return Math.round(x * 10) / 10;
  }
  D.scale = scaleVal;
  D.qty = function (r, id, part, guests) {
    var ing = (r.ingredients || []).filter(function (i) { return i.id === id; })[0];
    if (id === 'guests') return guests + ' шт';
    if (!ing) return '';
    if (ing.amount == null) return ing.unitText || '';
    return Z.fmtNum(scaleVal(ing, part != null ? part : ing.amount, guests, r.baseGuests)) + ' ' + ing.unit;
  };
  /* текст шага: {id} и {id:доля} → количество, **жирный** */
  D.rich = function (r, t, guests) {
    var s = Z.esc(t);
    s = s.replace(/\{(\w+)(?::([\d.]+))?\}/g, function (m, id, p) { var q = D.qty(r, id, p != null ? parseFloat(p) : null, guests); return q ? '<span class="q">' + q + '</span>' : ''; });
    s = s.replace(/\.<\/span>\./g, '.</span>');
    return s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  };

  /* ================= оценки ================= */
  var reviews = ls.get('kuking:reviews', {}) || {};
  D.review = function (id) { return reviews[id] || null; };
  D.reviews = function () { return reviews; };
  D.rate = function (id, score, comment) {
    var r = D.byId(id);
    if (!score) delete reviews[id]; else reviews[id] = { score: score, comment: comment || '', at: Z.today() };
    ls.set('kuking:reviews', reviews);
    var d = db(); if (d) { var ref = d.collection('reviews').doc(id); (reviews[id] ? ref.set({ score: score, comment: comment || '', title: r ? r.title : id, at: Z.today(), updatedAt: now() }) : ref.delete()).catch(function () {}); }
    Z.emit('change');
  };

  /* ================= план ================= */
  var plan = { days: ls.get('kuking:plan', {}) || {}, cfg: ls.get('kuking:planCfg', null), ov: ls.get('kuking:planOv', null), guests: ls.get('kuking:planGuests', {}) || {}, at: ls.get('kuking:planAt', 0) };
  plan.cfg = Object.assign({ cook: '19:00', shopDay: null, shopTime: '12:00', meat: 'fresh' }, plan.cfg || {});
  function savePlan(noSync) {
    Object.keys(plan.days).forEach(function (k) { if (!plan.days[k] || !plan.days[k].length) delete plan.days[k]; });
    plan.at = Date.now();
    ls.set('kuking:plan', plan.days); ls.set('kuking:planCfg', plan.cfg); ls.set('kuking:planGuests', plan.guests); ls.set('kuking:planAt', plan.at);
    if (!noSync) { var d = db(); if (d) d.collection('meta').doc('plan').set({ days: plan.days, cfg: plan.cfg, ov: plan.ov, guests: plan.guests, updatedAt: now() }).catch(function () {}); }
    syncTasksSoon();
  }
  D.plan = function () { return plan; };
  D.cfg = function () { return plan.cfg; };
  D.setCfg = function (k, v) { plan.cfg[k] = v; savePlan(); Z.emit('change'); };
  D.dayIds = function (k) { return (plan.days[k] || []).filter(function (id) { return D.byId(id); }); };
  D.planAdd = function (k, id, guests) {
    plan.days[k] = (plan.days[k] || []).filter(function (x) { return x !== id; }); plan.days[k].push(id);
    if (guests) plan.guests[k + '|' + id] = guests;
    savePlan(); Z.emit('change');
  };
  D.planRemove = function (k, id) { plan.days[k] = (plan.days[k] || []).filter(function (x) { return x !== id; }); delete plan.guests[k + '|' + id]; savePlan(); Z.emit('change'); };
  D.planMove = function (k, id, k2) { var g = plan.guests[k + '|' + id]; D.planRemove(k, id); D.planAdd(k2, id, g); };
  D.guestsFor = function (k, id) { var r = D.byId(id); return plan.guests[k + '|' + id] || (r ? r.baseGuests : 2); };
  D.setGuests = function (k, id, n) { plan.guests[k + '|' + id] = n; savePlan(); Z.emit('change'); };
  D.nextCook = function (id) { var t = Z.today(); return Object.keys(plan.days).sort().filter(function (k) { return k >= t && plan.days[k].indexOf(id) >= 0; })[0] || null; };

  /* что едим в какой день: готовка + остатки. Для себя: блюдо на N порций = сегодня + (N−1) дней, пока не начнётся следующая готовка */
  D.eaters = function (r) { return D.mode(r) === 'self' ? 1 : null; };
  D.agenda = function (from, n) {
    var out = {}, t = from || Z.today(), start = Z.addDays(t, -4);
    for (var i = 0; i < n + 4; i++) { var k = Z.addDays(start, i); out[k] = { key: k, cook: D.dayIds(k), eat: [] }; }
    Object.keys(out).sort().forEach(function (k) {
      out[k].cook.forEach(function (id) {
        var r = D.byId(id); if (!r || D.mode(r) !== 'self') return;
        var left = D.guestsFor(k, id) - 1, j = 1;
        while (left > 0) { var k2 = Z.addDays(k, j); if (!out[k2] || out[k2].cook.length) break; out[k2].eat.push({ id: id, from: k }); left--; j++; }
      });
    });
    var res = []; for (var x = 0; x < n; x++) { var kk = Z.addDays(t, x); res.push(out[kk] || { key: kk, cook: [], eat: [] }); }
    return res;
  };

  /* ================= отметки: приготовлено, сделанные напоминания ================= */
  var done = ls.get('kuking:done5', null) || { cooked: {}, tasks: {} };
  function saveDone() { ls.set('kuking:done5', done); var d = db(); if (d) d.collection('meta').doc('done5').set(Object.assign({ updatedAt: now() }, done)).catch(function () {}); }
  D.isCooked = function (k, id) { return !!done.cooked[k + '|' + id]; };
  D.setCooked = function (k, id, on) {
    var key = k + '|' + id; if (on) done.cooked[key] = Date.now(); else delete done.cooked[key];
    if (on) consume(D.byId(id), D.guestsFor(k, id));
    saveDone(); Z.emit('change');
  };
  D.taskDone = function (key) { return !!done.tasks[key]; };
  D.setTask = function (key, on) { if (on) done.tasks[key] = Date.now(); else delete done.tasks[key]; saveDone(); syncTasksSoon(); Z.emit('change'); };

  /* ================= продукты: нормализация, отделы ================= */
  function clean(n) { return String(n || '').replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim(); }
  function nk(n) { return clean(n).toLowerCase().replace(/ё/g, 'е'); }
  D.nk = nk; D.clean = clean;
  var DEPT = [
    ['meat', 'Мясо и рыба', /говя|свин|кури|индейк|баран|ягн|теля|фарш|бекон|колбас|ветчин|сосис|утк|кролик|мяс|крыл|бедр|грудк|стейк|ребр|печен[ьи]|лосос|семг|форел|треск|тунец(?!.*консерв)|рыб|кревет|кальмар|миди|краб|гребеш|дорад|сибас|скумбр|гуанчиал|панчетт|хамон|чоризо|лопатк|шея|окорок/],
    ['veg', 'Овощи, фрукты, зелень', /картоф|морков|лук(?! репчатый сушен)|чеснок|помид|томат(?!н)|огур|перец (?:болг|слад|чили|халап)|болгарск|кабач|баклаж|капуст|брокк|цветн|шпинат|салат|руккол|кинз|петруш|укроп|базилик|мят|зелен|лимон|лайм|апельс|яблок|груш|банан|авокадо|имбир|сельдер|свекл|тыкв|гриб|шампин|вешенк|редис|корнишон|ягод|гранат|манго|ананас|черри|порей|шалот/],
    ['dairy', 'Молочное и яйца', /молок|сливк|сметан|сыр|творог|йогурт|кефир|сливочн|яйц|яиц|желтк|ряженк|маскарп|моцарел|рикотт|пармез|фета|чеддер|гхи|айран/],
    ['bread', 'Хлеб', /хлеб|булк|булоч|багет|лаваш|тортиль|пита|лепешк|бриошь|чиабат|тост/],
    ['frozen', 'Заморозка', /заморож|морожен|лед(?![а-я])|льда/],
    ['drink', 'Напитки', /вино|пиво|сок(?![а-я])|лимонад|газиров|тоник|ром(?![а-я])|виски|водк|джин|текил|кола|минерал/],
    ['groc', 'Бакалея', /рис|греч|булгур|кускус|киноа|перлов|овсян|мук|макарон|паст(?!а томат)|спагет|пенне|лапш|фасол|нут|чечев|горох|масло(?! сливоч)|орех|кешью|миндал|арахис|кунжут|семечк|консерв|тунец|кокос|шоколад|какао|изюм|курага|чернослив|панко|сухар|томаты в/],
    ['spice', 'Специи и соусы', /соль|перец (?:черн|молот|душист)|паприк|кориандр|куркум|зира|кумин|масала|сунели|хмели|карри|корица|мускат|гвоздик|лавров|орегано|тимьян|розмарин|прованс|ваниль|соус|кетчуп|майонез|горчиц|уксус|паста томатн|томатная паста|аджик|ткемал|мед(?![а-я])|мёд|сироп|бульонн|специ|приправ|сахар|крахмал|разрыхл|сода|дрожж/]
  ];
  var DORDER = ['meat', 'veg', 'dairy', 'bread', 'frozen', 'groc', 'spice', 'drink', 'other'];
  D.DNAME = { other: 'Прочее' }; DEPT.forEach(function (d) { D.DNAME[d[0]] = d[1]; });
  D.dept = function (name) { var s = nk(name); if (/заморож/.test(s)) return 'frozen'; for (var i = 0; i < DEPT.length; i++) if (DEPT[i][2].test(s)) return DEPT[i][0]; return 'other'; };
  /* портится ли и сколько хранится по умолчанию (дней) */
  D.shelf = function (name) {
    var n = nk(name), d = D.dept(name);
    if (/заморож|сух|консерв|соус|соев|уксус|масло(?! сливоч)|сахар|соль|мука|рис|греч|паст|спагет|макарон|мед|мёд|специ|перец мол|паприк|сунели|лавров|кунжут|томатная паста/.test(n)) return null;
    if (/картоф|^лук|репчат|чеснок|тыкв|свекл|морков|имбир|лимон|лайм|апельсин|яблок/.test(n)) return null;
    if (d === 'meat') return /фарш|рыб|лосос|кревет/.test(n) ? 1 : 2;
    if (d === 'dairy') return /сыр твердый|пармез/.test(n) ? 21 : /яйц/.test(n) ? 21 : 6;
    if (d === 'bread') return 3;
    if (d === 'veg') return /зелен|кинз|петруш|укроп|базилик|салат|руккол|шпинат|мят/.test(n) ? 4 : 7;
    return null;
  };
  /* приведение единиц: кг→г, л→мл, ложки→г/мл (≈) */
  var SPOON = { 'ч.л.': 5, 'ст.л.': 15, 'ч. л.': 5, 'ст. л.': 15, 'щепотка': 1, 'щепотки': 1, 'щеп.': 1 };
  function norm(amount, unit, name) {
    var u = String(unit || '').toLowerCase().trim(), a = +amount;
    if (!(a > 0)) return { a: null, u: u };
    if (u === 'кг') return { a: a * 1000, u: 'г' };
    if (u === 'л') return { a: a * 1000, u: 'мл' };
    if (SPOON[u]) return { a: a * SPOON[u], u: /масл|уксус|соус|сироп|сок|вин|молок|сливк|вод/i.test(name) ? 'мл' : 'г', approx: true };
    return { a: a, u: u };
  }
  D.norm = norm;
  function fmtQ(a, u, approx) {
    if (a == null) return '';
    if (u === 'г' && a >= 1000) return Z.fmtNum(Math.round(a / 100) / 10) + ' кг';
    if (u === 'мл' && a >= 1000) return Z.fmtNum(Math.round(a / 100) / 10) + ' л';
    if (approx && a < 40) return 'немного';
    return (approx ? '≈ ' : '') + Z.fmtNum(Math.round(a)) + ' ' + u;
  }
  D.fmtQ = fmtQ;

  /* ================= кладовка ================= */
  var pantry = ls.get('kuking:pantry', null) || [];
  pantry = pantry.filter(function (p) { return p && p.name; });
  var pantryAt = ls.get('kuking:pantryAt', 0);
  function savePantry(noSync) {
    pantryAt = Date.now(); ls.set('kuking:pantry', pantry); ls.set('kuking:pantryAt', pantryAt);
    if (!noSync) syncCart();
  }
  D.pantry = function () { return pantry; };
  D.daysLeft = function (p) { if (!p.exp) return null; var t = Z.dParse(Z.today()); return Math.round((Z.dParse(p.exp) - t) / 864e5); };
  function pFind(name) {
    var s0 = nk(name); if (!s0) return null;
    for (var i = 0; i < pantry.length; i++) { var q = nk(pantry[i].name); if (q && (s0 === q || s0.indexOf(q) === 0 || q.indexOf(s0) === 0)) return pantry[i]; }
    return null;
  }
  D.pFind = pFind;
  D.pPut = function (item, idx) {
    item.name = clean(item.name).slice(0, 60); if (!item.name) return;
    item.at = Date.now();
    if (idx != null && pantry[idx]) pantry[idx] = item;
    else { var ex = pFind(item.name); if (ex && nk(ex.name) === nk(item.name)) { var i0 = pantry.indexOf(ex); pantry[i0] = merge(ex, item); } else pantry.push(item); }
    savePantry(); Z.emit('change');
  };
  function merge(a, b) {
    var na = norm(a.amount, a.unit, a.name), nb = norm(b.amount, b.unit, b.name);
    var out = Object.assign({}, a, b);
    if (na.a != null && nb.a != null && na.u === nb.u) { out.amount = na.a + nb.a; out.unit = na.u; }
    out.exp = b.exp || a.exp || null;
    return out;
  }
  D.pDel = function (idx) { var x = pantry.splice(idx, 1)[0]; savePantry(); Z.emit('change'); return x; };
  D.pUndo = function (idx, x) { pantry.splice(idx, 0, x); savePantry(); Z.emit('change'); };
  /* приготовил — списываем из кладовки то, что ушло в блюдо */
  function consume(r, guests) {
    if (!r) return;
    (r.ingredients || []).forEach(function (ing) {
      var p = pFind(ing.name); if (!p || p.amount == null || p.amount === '') return;
      var need = norm(scaleVal(ing, ing.amount, guests || r.baseGuests, r.baseGuests), ing.unit, ing.name), have = norm(p.amount, p.unit, p.name);
      if (need.a == null || have.a == null || need.u !== have.u) return;
      var left = have.a - need.a;
      if (left <= 0.0001) pantry.splice(pantry.indexOf(p), 1); else { p.amount = Math.round(left * 10) / 10; p.unit = have.u; }
    });
    savePantry();
  }
  D.consume = consume;

  /* ================= покупки ================= */
  var shop = ls.get('kuking:shop5', null) || { got: {}, extra: [], recipes: [], skip: {} };
  shop.got = shop.got || {}; shop.extra = shop.extra || []; shop.recipes = shop.recipes || []; shop.skip = shop.skip || {};
  var shopAt = ls.get('kuking:shop5At', 0);
  function saveShop(noSync) { shopAt = Date.now(); ls.set('kuking:shop5', shop); ls.set('kuking:shop5At', shopAt); if (!noSync) syncCart(); }
  var syncT = null;
  function syncCart() {
    clearTimeout(syncT); syncT = setTimeout(function () {
      var d = db(); if (!d) return;
      d.collection('meta').doc('shop5').set({ shop: shop, pantry: pantry, updatedAt: now() }).catch(function () {});
    }, 700);
  }
  D.shopState = function () { return shop; };
  /* какие рецепты в покупках: план на горизонт + добавленные руками */
  D.shopHorizon = function () { return plan.cfg.horizon || 7; };
  D.shopSources = function () {
    var t = Z.today(), h = D.shopHorizon(), src = [];
    for (var i = 0; i < h; i++) {
      var k = Z.addDays(t, i);
      D.dayIds(k).forEach(function (id) { if (!D.isCooked(k, id)) src.push({ id: id, guests: D.guestsFor(k, id), day: k }); });
    }
    shop.recipes.forEach(function (x) { if (D.byId(x.id) && !src.some(function (s) { return s.id === x.id && !s.day; })) src.push({ id: x.id, guests: x.guests, day: null }); });
    return src.filter(function (s) { return !shop.skip[s.id + '|' + (s.day || '')]; });
  };
  D.shopAddRecipe = function (id, guests) {
    var r = D.byId(id); if (!r) return;
    shop.recipes = shop.recipes.filter(function (x) { return x.id !== id; }); shop.recipes.push({ id: id, guests: guests || r.baseGuests });
    saveShop(); Z.emit('change');
  };
  D.shopRemoveSource = function (s) {
    if (s.day) shop.skip[s.id + '|' + s.day] = 1; else shop.recipes = shop.recipes.filter(function (x) { return x.id !== s.id; });
    saveShop(); Z.emit('change');
  };
  D.shopAddExtra = function (name, q) { name = clean(name); if (!name) return; shop.extra.push({ name: name.slice(0, 60), q: (q || '').slice(0, 20), id: 'x' + Date.now() }); saveShop(); Z.emit('change'); };
  /* единый список: всё, что нужно для рецептов, без пропусков. Кладовка вычитается, но ничего не прячется молча */
  D.shopList = function () {
    var src = D.shopSources(), sum = {};
    src.forEach(function (s) {
      var r = D.byId(s.id); if (!r) return;
      (r.ingredients || []).forEach(function (ing) {
        var name = clean(ing.name); if (!name || /^вода(?![а-яё])/i.test(name)) return;
        var amt = ing.amount == null ? null : scaleVal(ing, ing.amount, s.guests, r.baseGuests);
        var n = norm(amt, ing.unit, name), key = nk(name) + '|' + (n.u || '');
        var it = sum[key] || (sum[key] = { key: key, name: name, a: 0, u: n.u, approx: false, text: '', rids: [], dept: D.dept(name), buy: !!ing.buy });
        if (n.a != null) it.a += n.a; else if (!it.text) it.text = ing.unitText || ing.unit || '';
        if (n.approx) it.approx = true;
        if (it.rids.indexOf(r.id) < 0) it.rids.push(r.id);
      });
    });
    var items = Object.keys(sum).map(function (k) { var it = sum[k]; it.a = it.a || null; return it; });
    items.forEach(function (it) {
      it.qty = it.a != null ? fmtQ(it.a, it.u, it.approx) : (it.text || '');
      var p = pFind(it.name); it.home = false; it.need = it.a; it.homeNote = '';
      if (!p) return;
      var dl = D.daysLeft(p); if (dl != null && dl < 0) { it.homeNote = 'дома просрочено'; return; }
      if (p.amount == null || p.amount === '') { it.home = true; it.homeNote = 'есть дома'; return; }
      var pa = norm(p.amount, p.unit, p.name);
      if (it.a == null || pa.u !== it.u) { it.homeNote = 'дома ' + fmtQ(pa.a, pa.u); return; }
      if (pa.a >= it.a) { it.home = true; it.homeNote = 'дома ' + fmtQ(pa.a, pa.u); return; }
      it.need = it.a - pa.a; it.qty = fmtQ(it.need, it.u, it.approx); it.homeNote = 'дома ' + fmtQ(pa.a, pa.u) + ', докупить';
    });
    shop.extra.forEach(function (x) { items.push({ key: 'extra|' + x.id, name: x.name, qty: x.q, rids: [], dept: D.dept(x.name), extra: x.id, home: false }); });
    items.forEach(function (it) { it.got = !!shop.got[it.key]; });
    items.sort(function (a, b) { return DORDER.indexOf(a.dept) - DORDER.indexOf(b.dept) || a.name.localeCompare(b.name, 'ru'); });
    return items;
  };
  D.DORDER = DORDER;
  /* отметил «купил» — продукт сразу попадает в кладовку с количеством и сроком */
  D.shopToggle = function (it) {
    var on = !shop.got[it.key];
    if (on) {
      shop.got[it.key] = Date.now();
      if (!it.extra && it.need != null) {
        var sh = D.shelf(it.name);
        D.pPut({ name: it.name, amount: Math.round(it.need), unit: it.u, exp: sh ? Z.addDays(Z.today(), sh) : null, noexp: !sh, auto: it.key });
      }
    } else {
      delete shop.got[it.key];
      var i = pantry.map(function (p) { return p.auto; }).indexOf(it.key); if (i >= 0) { pantry.splice(i, 1); savePantry(); }
    }
    saveShop(); Z.emit('change');
  };
  D.shopHome = function (it) { /* «это есть дома» — запоминаем в кладовке без количества */
    D.pPut({ name: it.name, amount: null, unit: '', exp: null, noexp: true });
  };
  D.shopClearGot = function () { shop.got = {}; saveShop(); Z.emit('change'); };

  /* ================= напоминания (пуши с сервера, таблица plan_tasks) =================
     Коротко и по делу: что сделать и к какому блюду. Не больше одного напоминания на событие. */
  function at(k, hm) { var x = String(hm || '19:00').split(':'), d = Z.dParse(k); d.setHours(+x[0] || 0, +x[1] || 0, 0, 0); return d; }
  D.tasks = function (days) {
    var out = [], t = Z.today(), cfg = plan.cfg;
    for (var i = -1; i < (days || 8); i++) {
      var k = Z.addDays(t, i);
      D.dayIds(k).forEach(function (id) {
        var r = D.byId(id); if (!r || D.isCooked(k, id)) return;
        var g = D.guestsFor(k, id), cookT = cfg.cook || '19:00', total = D.total(r);
        /* мясо из морозилки — накануне вечером, если готовим не в день покупки */
        if (D.hasMeat(r) && (cfg.meat === 'freeze' || i >= 2)) {
          out.push({ key: 'thaw|' + k + '|' + id, kind: 'thaw', day: Z.addDays(k, -1), at: at(Z.addDays(k, -1), '21:00'), id: id,
            title: D.meatOf(r) + ' — в холодильник', body: 'Завтра «' + r.title + '». Пусть оттает за ночь.' });
        }
        var start = new Date(at(k, cookT) - total * 60000 + 0);
        if (start.getHours() < 10) start = at(k, cookT);
        out.push({ key: 'cook|' + k + '|' + id, kind: 'cook', day: k, at: new Date(start - 30 * 60000), id: id,
          title: r.title + ' в ' + String(start.getHours()).padStart(2, '0') + ':' + String(start.getMinutes()).padStart(2, '0'),
          body: Z.dur(total) + ', ' + g + ' ' + Z.plural(g, 'порция', 'порции', 'порций') + (D.active(r) ? ', руками ' + D.active(r) + ' мин' : '') + '.' });
      });
    }
    if (cfg.shopDay != null) {
      for (var j = 0; j < 7; j++) { var kd = Z.addDays(t, j); if (Z.dParse(kd).getDay() === +cfg.shopDay) {
        var list = D.shopList().filter(function (x) { return !x.got && !x.home; });
        if (list.length) out.push({ key: 'shop|' + kd, kind: 'shop', day: kd, at: at(kd, cfg.shopTime || '12:00'), title: 'Закупка: ' + list.length + ' ' + Z.plural(list.length, 'позиция', 'позиции', 'позиций'), body: list.slice(0, 4).map(function (x) { return x.name.toLowerCase(); }).join(', ') + (list.length > 4 ? ' и ещё ' + (list.length - 4) : '') + '.' });
        break; } }
    }
    return out.filter(function (x) { return !done.tasks[x.key]; });
  };
  var tasksT = null;
  function syncTasksSoon() { clearTimeout(tasksT); tasksT = setTimeout(syncTasks, 2500); }
  function syncTasks() {
    if (!signed() || !S().req) return;
    var me = S().user().id, nowMs = Date.now();
    var rows = D.tasks(8).filter(function (x) { return x.at.getTime() > nowMs + 60000; }).map(function (x) {
      return { user_id: me, key: x.key.slice(0, 120), at: x.at.toISOString(), title: x.title.slice(0, 120), body: x.body.slice(0, 200), sent: false };
    });
    S().req('DELETE', 'plan_tasks?user_id=eq.' + encodeURIComponent(me) + '&sent=eq.false').then(function () {
      return rows.length ? S().req('POST', 'plan_tasks?on_conflict=user_id,key', rows, 'resolution=merge-duplicates,return=minimal') : null;
    }).catch(function () {});
  }
  D.syncTasks = syncTasks;

  /* ================= импорт плана по ссылке (план от Claude) =================
     Ссылка вида …/#import=<base64url JSON>: { days: {дата: [id]}, guests: {"дата|id": n}, pantry: [...], extra: [...] } */
  D.decodeImport = function (s) {
    try { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; var j = JSON.parse(decodeURIComponent(escape(atob(s)))); return j && typeof j === 'object' ? j : null; } catch (e) { return null; }
  };
  D.applyImport = function (j) {
    var added = 0, missing = [];
    Object.keys(j.days || {}).forEach(function (k) { (j.days[k] || []).forEach(function (id) { if (!D.byId(id)) { missing.push(id); return; } var g = j.guests && j.guests[k + '|' + id]; plan.days[k] = (plan.days[k] || []).filter(function (x) { return x !== id; }); plan.days[k].push(id); if (g) plan.guests[k + '|' + id] = g; added++; }); });
    (j.pantry || []).forEach(function (p) { if (p && p.name) D.pPut({ name: p.name, amount: p.amount == null ? null : +p.amount, unit: p.unit || '', exp: p.exp || null, noexp: !p.exp }); });
    (j.extra || []).forEach(function (x) { D.shopAddExtra(x.name || x, x.q || ''); });
    if (j.cfg) Object.keys(j.cfg).forEach(function (k) { plan.cfg[k] = j.cfg[k]; });
    savePlan(); Z.emit('change');
    return { added: added, missing: missing };
  };

  /* ================= облако: подтянуть при входе ================= */
  function getDoc(c, id) { var d = db(); return d ? d.collection(c).doc(id).get().then(function (x) { return x && x.exists ? x.data() : null; }).catch(function () { return null; }) : Promise.resolve(null); }
  D.pull = function () {
    if (!signed()) return Promise.resolve();
    var d = db();
    return Promise.all([
      getDoc('meta', 'plan').then(function (v) {
        if (!v) return; var t = v.updatedAt ? Date.parse(v.updatedAt) : 0;
        if (t > plan.at) { plan.days = v.days || {}; if (v.cfg) plan.cfg = Object.assign(plan.cfg, v.cfg); plan.guests = v.guests || plan.guests; plan.ov = v.ov || plan.ov; savePlan(true); plan.at = t; ls.set('kuking:planAt', t); }
        else if (plan.at > t) savePlan();
      }),
      getDoc('meta', 'shop5').then(function (v) {
        if (v) { var t = Date.parse(v.updatedAt || 0) || 0; if (t > shopAt) { shop = v.shop || shop; ls.set('kuking:shop5', shop); ls.set('kuking:shop5At', t); shopAt = t; } if (t > pantryAt && v.pantry) { pantry = v.pantry; ls.set('kuking:pantry', pantry); pantryAt = t; ls.set('kuking:pantryAt', t); } return; }
        return getDoc('meta', 'cart').then(function (c) { if (c && c.pantry && !pantry.length) { pantry = c.pantry.filter(function (p) { return p && p.name; }); savePantry(); } });
      }),
      getDoc('meta', 'done5').then(function (v) { if (v) { Object.keys(v.cooked || {}).forEach(function (k) { done.cooked[k] = done.cooked[k] || v.cooked[k]; }); Object.keys(v.tasks || {}).forEach(function (k) { done.tasks[k] = done.tasks[k] || v.tasks[k]; }); ls.set('kuking:done5', done); } }),
      getDoc('meta', 'gone').then(function (v) { if (!v) return; (v.ids || []).forEach(function (id) { if (gone.indexOf(id) < 0) gone.push(id); }); Object.keys(v.hidden || {}).forEach(function (id) { if (!hidden[id]) hidden[id] = v.hidden[id]; }); ls.set('kuking:gone', gone); ls.set('kuking:hidden', hidden); }),
      new Promise(function (ok) {
        var off = d.collection('reviews').onSnapshot(function (snap) {
          snap.docs.forEach(function (x) { var v = x.data(); if (!v || !v.score) return; var l = reviews[x.id]; if (!l || (v.updatedAt && (!l.upd || v.updatedAt > l.upd))) reviews[x.id] = { score: v.score, comment: v.comment || '', at: v.at || Z.today(), upd: v.updatedAt }; });
          ls.set('kuking:reviews', reviews); Z.emit('change'); ok();
        }, function () { ok(); });
        setTimeout(ok, 8000); D._offRev = off;
      }),
      new Promise(function (ok) {
        d.collection('fresh').onSnapshot(function (snap) {
          var ch = false;
          snap.docs.forEach(function (x) { if (fresh[x.id] || gone.indexOf(x.id) >= 0) return; try { var r = JSON.parse(x.data().recipe); if (r && r.id) { fresh[r.id] = r; ch = true; } } catch (e) {} });
          if (ch) { ls.set('kuking:fresh', fresh); Z.emit('change'); } ok();
        }, function () { ok(); });
        setTimeout(ok, 8000);
      })
    ]).then(function () { Z.emit('change'); syncTasksSoon(); });
  };
  D.signed = signed;
})();
