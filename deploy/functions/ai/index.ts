// Жарко: нейросеть для всех пользователей без личных ключей. Свой сервер → edge-runtime → функция ai.
// Провайдер — Yandex AI Studio, OpenAI-совместимый API (https://ai.api.cloud.yandex.net/v1):
//   текст  — DeepSeek V4.1 Flash (gpt://<каталог>/deepseek-v4.1-flash), запасная модель задаётся в AI_MODELS;
//   фото   — Alice AI ART (art://<каталог>/aliceai-image-art-3.0), POST /images/generations, ответ b64_json.
// Контракт для приложения тот же, что был у GigaChat-версии:
//   обычный чат          → поток SSE в формате OpenAI (choices[0].delta.content);
//   action 'fn'          → { args } — объект строго по JSON-схеме fn.parameters;
//   action 'image'       → { image: 'data:image/...;base64,...' };
//   action 'delete_me'   → { ok: true } — удалить все данные человека и сам аккаунт.
// Ключи — только в переменных окружения сервера (.env): YANDEX_API_KEY, YANDEX_FOLDER_ID. В приложение они не попадают.
//
// Строгий режим ('fn'). В документации AI Studio для Chat Completions описаны tools и tool_choice = auto/none,
// но не сказано, какие модели умеют вызывать функции и поддерживается ли принудительный выбор функции.
// Поэтому идём лесенкой и запоминаем, что сработало:
//   1) tools + tool_choice {type:function, name}  2) tools + tool_choice 'auto'
//   3) response_format json_schema  4) response_format json_object  5) просто текст со схемой в промпте.
// Любой ответ разбираем (вытаскиваем JSON, чиним хвостовые запятые и переносы в строках) и ПРОВЕРЯЕМ кодом по схеме.
// Нашли ошибки — один повтор с перечнем ошибок. Так приложение получает тот же { args }, что и раньше.
import postgres from 'npm:postgres@3.4.4';

const BASE = (Deno.env.get('YANDEX_AI_BASE') || 'https://ai.api.cloud.yandex.net/v1').replace(/\/+$/, '');
const KEY = (Deno.env.get('YANDEX_API_KEY') || '').trim();
const FOLDER = (Deno.env.get('YANDEX_FOLDER_ID') || '').trim();
const TEXT_MODELS = (Deno.env.get('AI_MODELS') || 'deepseek-v4.1-flash').split(',').map((s) => s.trim()).filter(Boolean);
const IMAGE_MODEL = (Deno.env.get('AI_IMAGE_MODEL') || 'aliceai-image-art-3.0').trim();
const IMAGE_SIZE = (Deno.env.get('AI_IMAGE_SIZE') || '1024x1024').trim();
const MAX_OUT = +(Deno.env.get('AI_MAX_TOKENS') || 16000);
// сколько платных (успешных) ответов модели максимум тратим на один строгий вызов — защита бюджета
const MAX_BILLED = +(Deno.env.get('AI_FN_MAX_ATTEMPTS') || 3);
// лимиты на человека в сутки (по Москве не заморачиваемся — скользящие 24 часа); 0 = без лимита
const LIMIT_TEXT = +(Deno.env.get('AI_DAILY_TEXT_LIMIT') || 60);
const LIMIT_IMAGE = +(Deno.env.get('AI_DAILY_IMAGE_LIMIT') || 20);

const sql = Deno.env.get('SUPABASE_DB_URL') ? postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 2 }) : null;

// CORS: адрес приложения (тот же сервер). Задаётся в .env (CORS_ORIGIN), по умолчанию https://DOMAIN.
const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('CORS_ORIGIN') || '*',
  'Vary': 'Origin',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
type Err = Error & { status?: number };
const fail = (message: string, status = 502): Err => Object.assign(new Error(message), { status });

const textUri = (m: string) => (/^gpt:\/\//.test(m) ? m : `gpt://${FOLDER}/${m}`);
const artUri = (m: string) => (/^art:\/\//.test(m) ? m : `art://${FOLDER}/${m}`);

function headers(extra: Record<string, string> = {}) {
  if (!KEY || !FOLDER) throw fail('На сервере не заданы YANDEX_API_KEY и YANDEX_FOLDER_ID (файл .env)', 500);
  return { Authorization: 'Api-Key ' + KEY, 'OpenAI-Project': FOLDER, 'Content-Type': 'application/json', ...extra };
}
async function post(path: string, body: unknown, accept = 'application/json', timeoutMs = 170000) {
  return await fetch(BASE + path, { method: 'POST', headers: headers({ Accept: accept }), body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
}
// ответ Яндекса с ошибкой → понятный текст; ключевые слова помогают решить, пробовать ли следующую модель
function short(t: string) { try { const j = JSON.parse(t); return String(j.error?.message || j.message || j.error || t).slice(0, 300); } catch { return t.slice(0, 300); } }
const modelMissing = (status: number, t: string) => status === 404 || /model|not found|not supported|unknown/i.test(t);
function providerStatus(s: number) { return s === 429 ? 429 : 502; } // 401 Яндекса ≠ «войдите в аккаунт» в приложении

// ---------------- учёт и лимиты ----------------
async function checkLimit(userId: string, kind: 'text' | 'image') {
  if (!sql) return;
  const lim = kind === 'image' ? LIMIT_IMAGE : LIMIT_TEXT;
  if (!lim) return;
  const r = await sql`select count(*)::int as n from kuking_private.ai_usage
    where user_id = ${userId} and created_at > now() - interval '24 hours'
      and ${kind === 'image' ? sql`kind = 'image'` : sql`kind <> 'image'`}`;
  if (r[0].n >= lim) throw fail(kind === 'image' ? `Лимит фото на сутки (${lim}) исчерпан — завтра нарисуем ещё` : `Лимит запросов к нейросети на сутки (${lim}) исчерпан`, 429);
}
function track(userId: string, kind: 'chat' | 'fn' | 'image', model: string, usage?: { prompt_tokens?: number; completion_tokens?: number }) {
  if (!sql) return;
  sql`insert into kuking_private.ai_usage (user_id, kind, model, tokens_in, tokens_out)
      values (${userId}, ${kind}, ${model}, ${usage?.prompt_tokens || 0}, ${usage?.completion_tokens || 0})`.catch(() => {});
}

// ---------------- обычный чат: прокидываем поток SSE как есть ----------------
async function chat(body: { messages: unknown[]; max_tokens?: number; temperature?: number; model?: string }, userId: string) {
  let lastErr = '', lastStatus = 502;
  for (const m of body.model ? [body.model] : TEXT_MODELS) {
    let maxTok = Math.min(+(body.max_tokens || MAX_OUT) || MAX_OUT, 32000);
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await post('/chat/completions', { model: textUri(m), messages: body.messages, stream: true, max_tokens: maxTok, temperature: body.temperature ?? 0.7 }, 'text/event-stream', 300000);
      if (r.ok && r.body) { track(userId, 'chat', m); return r; }
      lastErr = await r.text(); lastStatus = r.status;
      if (r.status === 400 && /max_tokens|max tokens|maximum/i.test(lastErr) && maxTok > 8192) { maxTok = 8192; continue; }
      break;
    }
    if (!modelMissing(lastStatus, lastErr)) break; // модели нет в каталоге — пробуем следующую, иначе ошибка
  }
  throw fail('Нейросеть: ' + short(lastErr), providerStatus(lastStatus));
}

// ---------------- JSON: достать, починить, проверить ----------------
function fixStrings(s: string) {
  let out = '', inStr = false, esc = false;
  for (const ch of s) {
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
function tryParse(s: string): unknown { try { return JSON.parse(s); } catch { try { return JSON.parse(fixStrings(s)); } catch { return undefined; } } }
function extractJSON(t: unknown): unknown {
  if (t && typeof t === 'object') return t;
  const s = String(t || '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```(?:json)?/gi, '');
  const a = s.indexOf('{'); const b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return undefined;
  return tryParse(s.slice(a, b + 1));
}

type Schema = { type?: string | string[]; properties?: Record<string, Schema>; required?: string[]; items?: Schema; enum?: unknown[]; minItems?: number };
// проверка по подмножеству JSON Schema, которым пользуется приложение (object/array/string/integer/number/boolean, required, enum).
// Безобидное чиним на месте: "5" → 5 для чисел, "true" → true, одиночное значение → массив, null в необязательном поле → убрать.
function validate(v: unknown, s: Schema, path: string, errs: string[], parent?: Record<string, unknown> | unknown[], key?: string | number): unknown {
  if (!s || errs.length > 30) return v;
  const types = Array.isArray(s.type) ? s.type : s.type ? [s.type] : [];
  const set = (nv: unknown) => { if (parent && key !== undefined) (parent as Record<string, unknown>)[key as string] = nv; return nv; };
  const is = (t: string) => types.includes(t);
  if (s.enum && !s.enum.includes(v)) { errs.push(`${path}: допустимо только ${JSON.stringify(s.enum)}`); return v; }
  if (!types.length) return v;
  if ((is('integer') || is('number')) && typeof v === 'string' && v.trim() !== '' && !isNaN(+v)) v = set(+v);
  if (is('integer') && typeof v === 'number' && !Number.isInteger(v)) v = set(Math.round(v));
  if (is('boolean') && (v === 'true' || v === 'false')) v = set(v === 'true');
  if (is('string') && (typeof v === 'number' || typeof v === 'boolean')) v = set(String(v));
  if (is('array') && v !== null && v !== undefined && !Array.isArray(v) && !is(typeof v)) v = set([v]);
  const actual = Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v === 'number' ? (Number.isInteger(v) ? 'integer' : 'number') : typeof v;
  const ok = types.some((t) => t === actual || (t === 'number' && actual === 'integer'));
  if (!ok) { errs.push(`${path || 'корень'}: нужен тип ${types.join('|')}, пришло ${actual}`); return v; }
  if (actual === 'object' && s.properties) {
    const o = v as Record<string, unknown>;
    for (const r of s.required || []) if (o[r] === undefined || o[r] === null) errs.push(`${path ? path + '.' : ''}${r}: обязательное поле отсутствует`);
    for (const [k, ps] of Object.entries(s.properties)) {
      if (o[k] === null && !(s.required || []).includes(k)) { delete o[k]; continue; }
      if (o[k] !== undefined) validate(o[k], ps, path ? path + '.' + k : k, errs, o, k);
    }
  }
  if (actual === 'array') {
    const a = v as unknown[];
    if (s.minItems && a.length < s.minItems) errs.push(`${path}: нужно минимум ${s.minItems} элементов`);
    if (s.items) a.forEach((x, i) => validate(x, s.items!, `${path}[${i}]`, errs, a, i));
  }
  return v;
}

// ---------------- строгий вызов функции ----------------
type Fn = { name: string; description?: string; parameters: Schema; few_shot_examples?: { request: string; params: unknown }[] };
type Msg = { role: string; content: string };
const MODES = ['tool_named', 'tool_auto', 'json_schema', 'json_object', 'plain'] as const;
type Mode = typeof MODES[number];
const goodMode: Record<string, Mode> = {}; // модель → режим, который сработал (живёт, пока жив воркер)

function schemaPrompt(fn: Fn) {
  const ex = (fn.few_shot_examples || []).slice(0, 2).map((e) => `Пример запроса: ${e.request}\nПример ответа: ${JSON.stringify(e.params)}`).join('\n\n');
  return `Ответ — ровно один JSON-объект (аргументы функции «${fn.name}»${fn.description ? ': ' + fn.description : ''}), без пояснений и без markdown.\n` +
    `JSON-схема ответа: ${JSON.stringify(fn.parameters)}` + (ex ? `\n\n${ex}` : '');
}
function withSystem(messages: Msg[], extra: string): Msg[] {
  const m = messages.map((x) => ({ ...x }));
  const i = m.findIndex((x) => x.role === 'system');
  if (i >= 0) m[i].content = (m[i].content || '') + '\n\n' + extra; else m.unshift({ role: 'system', content: extra });
  return m;
}
function requestFor(mode: Mode, model: string, fn: Fn, messages: Msg[], temperature: number, maxTokens: number) {
  const base: Record<string, unknown> = { model: textUri(model), temperature, max_tokens: maxTokens };
  const tool = { type: 'function', function: { name: fn.name, description: fn.description || '', parameters: fn.parameters } };
  // примеры (few_shot_examples — поле GigaChat) кладём в системный промпт; в режимах tools схема уже в описании функции
  const ex = (fn.few_shot_examples || []).slice(0, 2).map((e) => `Пример: «${e.request}» → ${JSON.stringify(e.params)}`).join('\n');
  if (mode === 'tool_named' || mode === 'tool_auto') {
    return { ...base, messages: withSystem(messages, `Ответь ТОЛЬКО вызовом функции ${fn.name}, без текста.` + (ex ? '\n' + ex : '')), tools: [tool],
      tool_choice: mode === 'tool_named' ? { type: 'function', function: { name: fn.name } } : 'auto' };
  }
  const msgs = withSystem(messages, schemaPrompt(fn));
  if (mode === 'json_schema') return { ...base, messages: msgs, response_format: { type: 'json_schema', json_schema: { name: fn.name, schema: fn.parameters } } };
  if (mode === 'json_object') return { ...base, messages: msgs, response_format: { type: 'json_object' } };
  return { ...base, messages: msgs };
}
// вытаскиваем аргументы из ответа: из tool_calls, из устаревшего function_call или из текста
function argsOf(j: any): unknown {
  const msg = j?.choices?.[0]?.message || {};
  const tc = msg.tool_calls?.[0]?.function?.arguments ?? msg.function_call?.arguments;
  if (tc !== undefined) return extractJSON(tc);
  return extractJSON(msg.content);
}

async function callFn(body: { messages: Msg[]; fn: Fn; temperature?: number; max_tokens?: number; model?: string }, userId: string) {
  const fn = body.fn, temperature = body.temperature ?? 0.2;
  let maxTokens = Math.min(+(body.max_tokens || MAX_OUT) || MAX_OUT, 32000);
  let lastErr = '', lastStatus = 502, billed = 0;
  for (const model of body.model ? [body.model] : TEXT_MODELS) {
    const start = goodMode[model] ? MODES.indexOf(goodMode[model]) : 0;
    let modelGone = false;
    for (let mi = start; mi < MODES.length && !modelGone && billed < MAX_BILLED; mi++) {
      const mode = MODES[mi];
      let messages = body.messages;
      for (let attempt = 0; attempt < 2 && billed < MAX_BILLED; attempt++) { // попытка + один повтор с перечнем ошибок
        const r = await post('/chat/completions', requestFor(mode, model, fn, messages, attempt ? Math.min(temperature, 0.2) : temperature, maxTokens));
        const txt = await r.text();
        if (!r.ok) {
          lastErr = txt; lastStatus = r.status;
          if (r.status === 400 && /max_?tokens|maximum/i.test(txt) && maxTokens > 8192) { maxTokens = 8192; attempt--; continue; } // лимит выхода у модели меньше
          if (r.status === 400) break;                               // режим не поддержан — следующий режим
          if (modelMissing(r.status, txt)) { modelGone = true; break; } // модели нет — следующая модель
          throw fail('Нейросеть: ' + short(txt), providerStatus(r.status));
        }
        let j: any; try { j = JSON.parse(txt); } catch { lastErr = 'ответ не JSON'; break; }
        billed++; track(userId, 'fn', model, j.usage);
        const args = argsOf(j);
        if (args === undefined || typeof args !== 'object' || Array.isArray(args)) {
          lastErr = 'нейросеть не вернула объект (' + (j?.choices?.[0]?.finish_reason || '?') + ')';
          if (j?.choices?.[0]?.finish_reason === 'length') break; // оборвалось по длине — повтор не поможет
          if (mode === 'tool_named' || mode === 'tool_auto') break; // функцию не вызвала — пробуем JSON-режимы
          messages = [...body.messages, { role: 'user', content: 'Ответ не разобрался как JSON. Верни ТОЛЬКО один JSON-объект по схеме.' }];
          continue;
        }
        const errs: string[] = [];
        validate(args, fn.parameters, '', errs);
        if (!errs.length) {
          if (goodMode[model] !== mode) console.log(`ai: строгий режим для ${model} — ${mode}`); // видно в docker compose logs functions
          goodMode[model] = mode; return { args };
        }
        lastErr = 'ответ не по схеме: ' + errs.slice(0, 5).join('; ');
        messages = [...body.messages,
          { role: 'assistant', content: JSON.stringify(args).slice(0, 20000) },
          { role: 'user', content: 'В ответе ошибки, исправь все и верни ПОЛНЫЙ объект заново:\n- ' + errs.slice(0, 15).join('\n- ') }];
      }
    }
  }
  throw fail('Нейросеть: ' + lastErr.slice(0, 300), providerStatus(lastStatus));
}

// ---------------- фото блюда ----------------
function mimeOf(b64: string) {
  const h = b64.slice(0, 16);
  if (h.startsWith('iVBOR')) return 'image/png';
  if (h.startsWith('/9j/')) return 'image/jpeg';
  if (h.startsWith('UklGR')) return 'image/webp';
  return 'image/jpeg';
}
async function image(prompt: string, userId: string) {
  const full = 'Профессиональная фотография готового блюда ресторанного уровня: натуральный мягкий свет, малая глубина резкости, ' +
    'аппетитные текстуры, никакого текста, логотипов, людей и рук в кадре. ' + String(prompt).slice(0, 1800);
  let r = await post('/images/generations', { model: artUri(IMAGE_MODEL), prompt: full, size: IMAGE_SIZE }, 'application/json', 170000);
  if (r.status === 400) r = await post('/images/generations', { model: artUri(IMAGE_MODEL), prompt: full }, 'application/json', 170000); // размер не принят — по умолчанию
  const txt = await r.text();
  if (!r.ok) throw fail('Фото: ' + short(txt), providerStatus(r.status));
  let j: any; try { j = JSON.parse(txt); } catch { throw fail('Фото: ответ не JSON'); }
  const b64 = j?.data?.[0]?.b64_json;
  if (!b64) throw fail('Фото: нейросеть не прислала картинку (возможно, запрос отклонён модерацией)');
  track(userId, 'image', IMAGE_MODEL);
  return { image: `data:${mimeOf(b64)};base64,${b64}` };
}

// ---------------- удаление аккаунта (152-ФЗ: отзыв согласия) ----------------
// Клиент (js/social.js, deleteAccount) сначала сам удаляет свои строки через REST, потом зовёт action 'delete_me'.
// Здесь удаляем ВСЁ, что связано с человеком, включая строки, которые REST ему удалить не даёт (чужие лайки на его
// отзывах, сообщения ему, учёт нейросети), и сам аккаунт в auth. Повторный вызов безопасен.
async function deleteMe(userId: string) {
  if (!sql) throw fail('На сервере нет SUPABASE_DB_URL', 500);
  const id = userId;
  await sql.begin(async (tx: any) => {
    await tx`delete from public.docs where user_id = ${id}`;
    await tx`delete from public.photos where author = ${id}`;
    await tx`delete from public.review_likes where liker = ${id} or review_owner = ${id}`;
    await tx`delete from public.friends where a = ${id} or b = ${id}`;
    await tx`delete from public.replies where author = ${id} or review_owner = ${id}`;
    await tx`delete from public.qa where author = ${id}`;
    await tx`delete from public.messages where sender = ${id} or receiver = ${id}`;
    await tx`delete from public.profile_info where id = ${id}`;
    await tx`delete from public.push_subs where user_id = ${id}`;
    await tx`delete from public.plan_tasks where user_id = ${id}`;
    await tx`delete from public.profiles where id = ${id}`;
    await tx`delete from kuking_private.ai_usage where user_id = ${id}`;
  });
  // сам аккаунт: штатно — через admin API GoTrue (service-ключ из env), запасной путь — SQL (каскадом уйдут сессии и identities)
  let how = '';
  const svc = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (svc) {
    const r = await fetch(Deno.env.get('SUPABASE_URL') + '/auth/v1/admin/users/' + id, {
      method: 'DELETE', headers: { Authorization: 'Bearer ' + svc, apikey: svc },
    }).catch(() => null);
    if (r && (r.ok || r.status === 404)) how = 'admin';
  }
  if (!how) {
    await sql`delete from auth.users where id = ${id}`;
    how = 'sql';
  }
  const left = await sql`select count(*)::int as n from auth.users where id = ${id}`;
  if (left[0].n) throw fail('Аккаунт не удалился, попробуйте ещё раз', 500);
  console.log(`ai: аккаунт удалён (${how})`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    // доступ только для вошедших в «Жарко»: токен проверяет сам сервер входа
    const auth = req.headers.get('authorization') || '';
    const u = await fetch(Deno.env.get('SUPABASE_URL') + '/auth/v1/user', { headers: { authorization: auth, apikey: req.headers.get('apikey') || Deno.env.get('SUPABASE_ANON_KEY') || '' } });
    if (!u.ok) return json({ error: { message: 'Войдите в аккаунт' } }, 401);
    const me = await u.json();

    const body = await req.json().catch(() => ({}));
    if (body.action === 'delete_me') {
      await deleteMe(me.id);
      return json({ ok: true });
    }
    if (body.action === 'image') {
      if (!body.prompt) return json({ error: { message: 'Пустое описание' } }, 400);
      await checkLimit(me.id, 'image');
      return json(await image(body.prompt, me.id));
    }
    if (!Array.isArray(body.messages) || !body.messages.length) return json({ error: { message: 'Пустой запрос' } }, 400);
    await checkLimit(me.id, 'text');
    if (body.action === 'fn') {
      if (!body.fn || !body.fn.name || !body.fn.parameters) return json({ error: { message: 'Нет схемы' } }, 400);
      return json(await callFn(body, me.id));
    }
    const res = await chat(body, me.id);
    return new Response(res.body, { headers: { ...cors, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
  } catch (e) {
    const err = e as Err;
    const msg = err?.name === 'TimeoutError' ? 'Нейросеть думала слишком долго — попробуйте ещё раз' : String(err?.message || e);
    return json({ error: { message: msg } }, err?.status || (err?.name === 'TimeoutError' ? 504 : 500));
  }
});
