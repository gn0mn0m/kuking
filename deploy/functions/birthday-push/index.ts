// Жарко: уведомления (self-host). Имя функции birthday-push оставлено ради совместимости с приложением.
// На своём сервере всё нужное приходит из .env через docker-compose (сервис functions):
//   SUPABASE_DB_URL  — прямое подключение к базе (контейнер db),
//   SUPABASE_URL     — внутренний адрес API (http://caddy:8000), по нему проверяется вход (/auth/v1/user),
//   SUPABASE_ANON_KEY, CORS_ORIGIN.
// Расписание (tasks — каждые 10 минут) ставит sql/03-selfhost.sql через pg_cron + pg_net,
// запросы идут внутри docker-сети на http://functions:9000/birthday-push с заголовком x-cron.
// action "init"  — отдать публичный ключ пушей (создаёт ключи при первом вызове);
// action "tasks" — каждые 10 минут: напоминания плана, которым пора;
// action "test"  — пробное уведомление себе (нужен вход);
// action "run", "msg" — ОТКЛЮЧЕНЫ (дни рождения и личные сообщения): дату рождения не собираем, переписки нет.
//   Отвечают { sent: 0 }, чтобы старые клиенты и старое расписание не падали.
import webpush from 'npm:web-push@3.6.7';
import postgres from 'npm:postgres@3.4.4';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 2 });
// CORS: адрес приложения (тот же сервер). Задаётся в .env (CORS_ORIGIN), по умолчанию https://DOMAIN.
const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('CORS_ORIGIN') || '*',
  'Vary': 'Origin',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

async function setting(k: string) {
  const r = await sql`select v from kuking_private.settings where k = ${k}`;
  return r[0]?.v as string | undefined;
}
async function keys() {
  let pub = await setting('vapid_public'), priv = await setting('vapid_private');
  if (!pub || !priv) {
    const k = webpush.generateVAPIDKeys();
    await sql`insert into kuking_private.settings (k, v) values ('vapid_public', ${k.publicKey}), ('vapid_private', ${k.privateKey}) on conflict (k) do nothing`;
    pub = await setting('vapid_public'); priv = await setting('vapid_private');
  }
  webpush.setVapidDetails('mailto:zharko@example.com', pub!, priv!);
  return pub!;
}
async function send(userIds: string[], msg: { title: string; body: string; url?: string; tag?: string }) {
  if (!userIds.length) return 0;
  const subs = await sql`select endpoint, sub from public.push_subs where user_id = any(${sql.array(userIds)}::uuid[])`;
  let ok = 0;
  for (const s of subs) {
    try { await webpush.sendNotification(s.sub, JSON.stringify(msg), { TTL: 60 * 60 * 20 }); ok++; }
    catch (e) { const c = (e as { statusCode?: number }).statusCode; if (c === 404 || c === 410) await sql`delete from public.push_subs where endpoint = ${s.endpoint}`; }
  }
  return ok;
}
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'init';
    if (action === 'init') return json({ publicKey: await keys() });

    if (action === 'test') {
      const auth = req.headers.get('authorization') || '';
      const u = await fetch(Deno.env.get('SUPABASE_URL') + '/auth/v1/user', { headers: { authorization: auth, apikey: req.headers.get('apikey') || Deno.env.get('SUPABASE_ANON_KEY') || '' } });
      if (!u.ok) return json({ error: 'Войдите в аккаунт' }, 401);
      const me = await u.json();
      await keys();
      const n = await send([me.id], { title: '🔥 Жарко на связи', body: 'Уведомления подключены и работают.' });
      return json({ sent: n });
    }

    if (action === 'msg') return json({ sent: 0 }); // переписки нет — пуш о сообщении не шлём

    if (action === 'tasks') { // каждые 10 минут: напоминания из «Плана», которым пора
      if (req.headers.get('x-cron') !== (await setting('cron_secret'))) return json({ error: 'Доступ запрещён' }, 403);
      await keys();
      const due = await sql`update public.plan_tasks set sent = true
        where not sent and at <= now() and at > now() - interval '3 hours'
        returning user_id, key, title, body`;
      let n = 0;
      for (const t of due) n += await send([t.user_id], { title: t.title, body: t.body || '', tag: 'plan-' + t.key, url: './' });
      return json({ due: due.length, sent: n });
    }

    if (action === 'run') return json({ birthdays: 0, sent: 0 }); // дату рождения не собираем

    return json({ error: 'Неизвестное действие' }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
