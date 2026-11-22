/* AI — свой ключ к любой нейросети. Ключ лежит только в этом телефоне (localStorage),
   запрос идёт с телефона прямо к провайдеру. Наружу — тот же интерфейс, что ждёт «Свежак»:
   window.claude.use('sample') → sample.json(prompt, { signal, onText }). */
(function () {
  'use strict';
  var KEY = 'kuking:ai';
  var PRESETS = {
    kuking: { label: 'Жарко · GigaChat (бесплатно, без ключа)', kind: 'server', base: '' },
    openai: { label: 'OpenAI', kind: 'openai', base: 'https://api.openai.com/v1' },
    openrouter: { label: 'OpenRouter', kind: 'openai', base: 'https://openrouter.ai/api/v1' },
    gemini: { label: 'Google Gemini', kind: 'gemini', base: 'https://generativelanguage.googleapis.com/v1beta' },
    anthropic: { label: 'Anthropic (Claude)', kind: 'anthropic', base: 'https://api.anthropic.com/v1' },
    custom: { label: 'Свой адрес (совместимый с OpenAI)', kind: 'openai', base: '' }
  };
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function save(c) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} }
  var cfg = load();
  if (!cfg.provider) cfg = { provider: 'kuking' }; // по умолчанию — общая нейросеть через сервер

  function err(code, message) { var e = new Error(message || code); e.code = code; return e; }
  function S() { return window.KukingStore; }
  function ready() {
    if (kind() === 'server') return !!(S() && S().enabled && S().user());
    return !!(cfg.provider && cfg.key && cfg.model && base());
  }
  function base() {
    if (kind() === 'server') return ((window.KUKING_CONFIG || {}).supabaseUrl || '').replace(/\/+$/, '') + '/functions/v1/ai';
    var p = PRESETS[cfg.provider]; return ((cfg.provider === 'custom' ? cfg.base : p && p.base) || '').replace(/\/+$/, '');
  }
  function kind() { return (PRESETS[cfg.provider] || {}).kind; }

  /* читаем поток SSE: строки data: {...} */
  function readSSE(res, onData, signal) {
    var reader = res.body.getReader(), dec = new TextDecoder(), buf = '';
    function pump() {
      return reader.read().then(function (r) {
        if (r.done) return;
        buf += dec.decode(r.value, { stream: true });
        var lines = buf.split(/\r?\n/); buf = lines.pop();
        lines.forEach(function (l) {
          if (l.indexOf('data:') !== 0) return;
          var d = l.slice(5).trim(); if (!d || d === '[DONE]') return;
          try { onData(JSON.parse(d)); } catch (e) {}
        });
        if (signal && signal.aborted) { reader.cancel(); throw err('cancelled'); }
        return pump();
      });
    }
    return pump();
  }
  function fail(res) {
    return res.text().then(function (t) {
      var m = t; try { var j = JSON.parse(t); m = (j.error && (j.error.message || j.error)) || j.message || t; } catch (e) {}
      var code = res.status === 401 || res.status === 403 ? 'bad_key' : res.status === 429 ? 'rate_limited' : res.status === 404 ? 'bad_model' : 'provider_error';
      throw err(code, String(m).slice(0, 300));
    });
  }

  function complete(prompt, opts) {
    opts = opts || {};
    if (!ready()) return Promise.reject(err('not_granted', 'Нейросеть не настроена'));
    var text = '', onText = opts.onText || function () {}, signal = opts.signal, maxOut = opts.maxTokens || 16000;
    var sys = '', usr = prompt; if (prompt && typeof prompt === 'object') { sys = prompt.system || ''; usr = prompt.user || ''; }
    var msgs = (sys ? [{ role: 'system', content: sys }] : []).concat([{ role: 'user', content: usr }]);
    var temp = opts.temperature != null ? opts.temperature : 0.7;
    function push(delta) { if (!delta) return; text += delta; onText({ text: text, delta: delta }); }
    var k = kind(), req;
    if (k === 'server') {
      return S().token().then(function (t) {
        return fetch(base(), { method: 'POST', signal: signal, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t, apikey: (window.KUKING_CONFIG || {}).supabaseAnonKey || '' },
          body: JSON.stringify({ stream: true, max_tokens: maxOut, temperature: temp, messages: msgs }) });
      }, function () { throw err('not_granted', 'Войди в аккаунт — нейросеть работает для своих'); }).then(function (res) {
        if (res.status === 404) throw err('provider_error', 'На сервере нет функции ai — её надо загрузить в Supabase');
        if (!res.ok) return fail(res);
        return readSSE(res, function (j) { var c = j.choices && j.choices[0]; push(c && c.delta && c.delta.content); }, signal);
      }).then(function () { return text; });
    }
    if (k === 'openai') {
      var body = { model: cfg.model, stream: true, max_tokens: maxOut, temperature: temp, messages: msgs };
      req = function (b) {
        return fetch(base() + '/chat/completions', { method: 'POST', signal: signal, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.key }, body: JSON.stringify(b) });
      };
      return req(body).then(function (res) {
        if (res.status === 400) return res.clone().text().then(function (t) { // новые модели OpenAI хотят max_completion_tokens
          if (/max_completion_tokens/.test(t)) { delete body.max_tokens; body.max_completion_tokens = maxOut; return req(body); }
          return res;
        });
        return res;
      }).then(function (res) {
        if (!res.ok) return fail(res);
        return readSSE(res, function (j) { var c = j.choices && j.choices[0]; push(c && c.delta && c.delta.content); }, signal);
      }).then(function () { return text; });
    }
    if (k === 'anthropic') {
      return fetch(base() + '/messages', { method: 'POST', signal: signal, headers: {
        'Content-Type': 'application/json', 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true'
      }, body: JSON.stringify({ model: cfg.model, max_tokens: maxOut, stream: true, temperature: temp, system: sys || undefined, messages: [{ role: 'user', content: usr }] }) })
        .then(function (res) {
          if (!res.ok) return fail(res);
          return readSSE(res, function (j) { if (j.type === 'content_block_delta' && j.delta) push(j.delta.text); }, signal);
        }).then(function () { return text; });
    }
    if (k === 'gemini') {
      return fetch(base() + '/models/' + encodeURIComponent(cfg.model) + ':streamGenerateContent?alt=sse&key=' + encodeURIComponent(cfg.key), {
        method: 'POST', signal: signal, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemInstruction: sys ? { parts: [{ text: sys }] } : undefined, contents: [{ role: 'user', parts: [{ text: usr }] }], generationConfig: { maxOutputTokens: maxOut, temperature: temp } })
      }).then(function (res) {
        if (!res.ok) return fail(res);
        return readSSE(res, function (j) {
          var p = j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts;
          if (p) p.forEach(function (x) { push(x.text); });
        }, signal);
      }).then(function () { return text; });
    }
    return Promise.reject(err('not_granted'));
  }

  /* JSON из ответа: срезаем ```json-заборы и болтовню вокруг */
  /* JSON из ответа. Модели (особенно GigaChat) любят ```json-заборы, пояснения вокруг, переносы строк
     прямо внутри строк и запятые в конце — всё это чиним, а обрезанный массив закрываем по последнему целому объекту. */
  function fixStrings(s) {
    var out = '', inStr = false, esc = false;
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (inStr) {
        if (esc) { out += ch; esc = false; continue; }
        if (ch === '\\') { esc = true; out += ch; continue; }
        if (ch === '"') { inStr = false; out += ch; continue; }
        if (ch === '\n') { out += '\\n'; continue; }
        if (ch === '\r') continue;
        if (ch === '\t') { out += '\\t'; continue; }
        out += ch; continue;
      }
      if (ch === '"') inStr = true;
      out += ch;
    }
    return out.replace(/,\s*([}\]])/g, '$1');
  }
  function tryParse(s) { try { return JSON.parse(s); } catch (e) { try { return JSON.parse(fixStrings(s)); } catch (x) { return undefined; } } }
  function extractJSON(t) {
    var s = String(t || '').replace(/```(?:json)?/gi, '').replace(/[“”]/g, '"');
    var a = s.search(/[\[{]/); if (a < 0) throw err('invalid_json', 'Нейросеть не прислала JSON');
    var open = s[a], close = open === '{' ? '}' : ']', b = s.lastIndexOf(close), v;
    if (b > a) { v = tryParse(s.slice(a, b + 1)); if (v !== undefined) return v; }
    if (open === '[') { var lb = s.lastIndexOf('}'); if (lb > a) { v = tryParse(s.slice(a, lb + 1) + ']'); if (v !== undefined) return v; } }
    throw err('invalid_json', b <= a ? 'ответ оборвался' : 'кривой JSON');
  }

  function wrapAbort(p) {
    return p.catch(function (e) { if (e && (e.name === 'AbortError' || e.code === 'cancelled')) throw err('cancelled'); if (e && e.code) throw e; throw err('network', 'Нет связи с нейросетью: ' + (e && e.message)); });
  }

  var sample = function (prompt, opts) { return wrapAbort(complete(Array.isArray(prompt) ? prompt.map(function (m) { return m.content; }).join('\n\n') : prompt, opts)).then(function (t) { return { text: t, truncated: false }; }); };
  sample.json = function (prompt, opts) { return wrapAbort(complete(prompt, opts)).then(extractJSON); };

  window.KukingAI = {
    presets: PRESETS,
    get: function () { return JSON.parse(JSON.stringify(cfg)); },
    set: function (c) { cfg = c || {}; save(cfg); },
    clear: function () { cfg = {}; try { localStorage.removeItem(KEY); } catch (e) {} },
    ready: ready,
    test: function () { return wrapAbort(complete('Ответь одним словом: готов', { maxTokens: 20 })); },
    /* фото блюда: рисует GigaChat на сервере «Жарко» (функция ai, action image) */
    canImage: function () { return kind() === 'server' && ready(); },
    image: function (prompt, signal) {
      if (kind() !== 'server') return Promise.reject(err('provider_error', 'Фото рисует только нейросеть «Жарко» — выберите её в настройках нейросети'));
      return S().token().then(function (t) {
        return fetch(base(), { method: 'POST', signal: signal, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t, apikey: (window.KUKING_CONFIG || {}).supabaseAnonKey || '' }, body: JSON.stringify({ action: 'image', prompt: prompt }) });
      }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok || !j.image) throw err(r.status === 401 ? 'not_granted' : 'provider_error', (j.error && j.error.message) || (r.status === 400 ? 'Сервер ещё не умеет рисовать — обновите функцию ai в Supabase' : 'Фото не получилось'));
        return j.image; }); });
    }
  };

  var prevUse = window.claude && window.claude.use;
  window.claude = window.claude || {};
  window.claude.use = function (name) {
    if (name === 'sample') return Promise.resolve(ready() ? sample : null);
    return prevUse ? prevUse(name) : Promise.resolve(null);
  };
})();
