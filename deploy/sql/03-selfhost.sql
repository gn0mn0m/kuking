-- Жарко (self-host): расписание и учёт нейросети. Применяет scripts/init-db.sh, повторный запуск безопасен.
-- pg_cron и pg_net уже есть в образе supabase/postgres; функции зовём напрямую внутри docker-сети,
-- наружу (через интернет) запросы расписания не ходят.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- старые задания из облачного setup.sql (если вдруг переехали вместе с данными) — убираем
select cron.unschedule(jobid) from cron.job
 where jobname in ('kuking-birthdays', 'kuking-tasks', 'kuking-cron-cleanup');

-- поздравлений с днём рождения больше нет: дату рождения приложение не собирает (задание kuking-birthdays
-- снимается строкой выше и больше не ставится).

-- каждые 10 минут — напоминания плана (таблица plan_tasks)
select cron.schedule('kuking-tasks', '*/10 * * * *', $job$
  select net.http_post(
    url := 'http://functions:9000/birthday-push',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron', (select v from kuking_private.settings where k = 'cron_secret')),
    body := '{"action":"tasks"}'::jsonb,
    timeout_milliseconds := 60000)
$job$);

-- раз в сутки чистим журнал запусков, чтобы база не пухла (144 записи в день от kuking-tasks)
select cron.schedule('kuking-cron-cleanup', '30 3 * * *', $job$
  delete from cron.job_run_details where end_time < now() - interval '7 days'
$job$);

-- ================= учёт нейросети (лимиты и расходы) =================
-- функция ai пишет сюда каждый вызов: кто, что, сколько токенов. Наружу (PostgREST) не видно.
create table if not exists kuking_private.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  kind text not null check (kind in ('chat', 'fn', 'image')),
  model text,
  tokens_in integer not null default 0,
  tokens_out integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_user_day_idx on kuking_private.ai_usage (user_id, created_at);

-- журнал нейросети храним не дольше 90 дней (срок из legal/privacy.md, раздел 5); чистка раз в сутки
select cron.schedule('kuking-ai-usage-cleanup', '40 3 * * *', $job$
  delete from kuking_private.ai_usage where created_at < now() - interval '90 days'
$job$);
