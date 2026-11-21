-- Жарко: база для оценок, друзей и ответов.
-- Supabase → SQL Editor → New query → вставить всё → Run. Можно запускать повторно — ничего не сломает.
-- ВАЖНО: первым зарегистрируйся в приложении сам — первый, кто создаст ник, станет админом (шефом).

-- ================= профили =================
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nick text not null unique check (nick ~ '^[A-Za-z0-9_А-Яа-яЁё]{3,20}$'),
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists profiles_nick_ci on public.profiles (lower(nick));
alter table public.profiles enable row level security;
drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select to authenticated using (true);
drop policy if exists "profiles insert own" on public.profiles;
create policy "profiles insert own" on public.profiles for insert to authenticated with check (auth.uid() = id and is_admin = false);
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
revoke insert, update on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant insert (id, nick) on public.profiles to authenticated;
grant update (nick) on public.profiles to authenticated;

-- ================= друзья =================
-- a — кто позвал, b — кого. pending → accepted.
create table if not exists public.friends (
  a uuid not null references auth.users (id) on delete cascade,
  b uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (a, b),
  check (a <> b)
);
alter table public.friends enable row level security;
drop policy if exists "friends read" on public.friends;
create policy "friends read" on public.friends for select to authenticated using (auth.uid() in (a, b));
drop policy if exists "friends request" on public.friends;
create policy "friends request" on public.friends for insert to authenticated with check (a = auth.uid() and status = 'pending');
drop policy if exists "friends accept" on public.friends;
create policy "friends accept" on public.friends for update to authenticated using (b = auth.uid()) with check (b = auth.uid() and status = 'accepted');
drop policy if exists "friends remove" on public.friends;
create policy "friends remove" on public.friends for delete to authenticated using (auth.uid() in (a, b));
revoke update on public.friends from anon, authenticated;
grant select, insert, delete on public.friends to authenticated;
grant update (status) on public.friends to authenticated;

-- ================= помощники =================
create or replace function public.is_admin_user(u uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce((select is_admin from public.profiles where id = u), false) $$;

create or replace function public.is_friend(u uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.friends
     where status = 'accepted' and ((a = auth.uid() and b = u) or (b = auth.uid() and a = u))) $$;

-- кого я вижу: себя, шефа и друзей
create or replace function public.can_see(u uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select u = auth.uid() or public.is_admin_user(u) or public.is_friend(u) $$;

-- первый, кто позовёт, становится шефом (если шефа ещё нет)
create or replace function public.claim_admin() returns boolean
language plpgsql security definer set search_path = public as
$$ begin
  if auth.uid() is null then return false; end if;
  perform pg_advisory_xact_lock(4242);
  if exists (select 1 from public.profiles where is_admin) then
    return public.is_admin_user(auth.uid());
  end if;
  update public.profiles set is_admin = true where id = auth.uid();
  return found;
end $$;

-- ссылка-приглашение: сразу в друзья, без заявки
create or replace function public.accept_invite(inviter uuid) returns boolean
language plpgsql security definer set search_path = public as
$$ begin
  if auth.uid() is null or inviter is null or inviter = auth.uid() then return false; end if;
  if not exists (select 1 from public.profiles where id = inviter) then return false; end if;
  delete from public.friends where a = auth.uid() and b = inviter;
  insert into public.friends (a, b, status) values (inviter, auth.uid(), 'accepted')
    on conflict (a, b) do update set status = 'accepted';
  return true;
end $$;

-- шеф стирает чужой коммент к оценке (оценка остаётся)
create or replace function public.admin_clear_comment(owner uuid, rid text) returns boolean
language plpgsql security definer set search_path = public as
$$ begin
  if not public.is_admin_user(auth.uid()) then return false; end if;
  update public.docs set data = jsonb_set(data, '{comment}', '""'::jsonb), updated_at = now()
    where collection = 'reviews' and id = rid and user_id = owner;
  return found;
end $$;

revoke execute on function public.is_admin_user(uuid), public.is_friend(uuid), public.can_see(uuid),
  public.claim_admin(), public.accept_invite(uuid), public.admin_clear_comment(uuid, text) from public, anon;
grant execute on function public.is_admin_user(uuid), public.is_friend(uuid), public.can_see(uuid),
  public.claim_admin(), public.accept_invite(uuid), public.admin_clear_comment(uuid, text) to authenticated;

-- ================= оценки, свежак, служебное =================
create table if not exists public.docs (
  pk bigint generated always as identity primary key,
  collection text not null,
  id text not null,
  user_id uuid references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (collection, id, user_id)
);
create index if not exists docs_collection_idx on public.docs (collection);
alter table public.docs enable row level security;
grant select, insert, update, delete on public.docs to authenticated;

-- оценки видны: свои, шефа и друзей; рецепты и прочее — только свои
drop policy if exists "docs read" on public.docs;
create policy "docs read" on public.docs for select to authenticated
  using (user_id is null or user_id = auth.uid() or (collection = 'reviews' and public.can_see(user_id)));
drop policy if exists "docs insert own" on public.docs;
create policy "docs insert own" on public.docs for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "docs update own" on public.docs;
create policy "docs update own" on public.docs for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- удалять — свои; плюс старые оценки без хозяина (их забирает себе первый вошедший)
drop policy if exists "docs delete own" on public.docs;
create policy "docs delete own" on public.docs for delete to authenticated using (auth.uid() = user_id or user_id is null);

-- ================= ответы под оценками =================
create table if not exists public.replies (
  id bigint generated always as identity primary key,
  recipe_id text not null,
  review_owner uuid not null references auth.users (id) on delete cascade,
  author uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists replies_thread_idx on public.replies (review_owner, recipe_id);
alter table public.replies enable row level security;
grant select, insert, delete on public.replies to authenticated;
drop policy if exists "replies read" on public.replies;
create policy "replies read" on public.replies for select to authenticated
  using (author = auth.uid() or public.can_see(review_owner));
drop policy if exists "replies write" on public.replies;
create policy "replies write" on public.replies for insert to authenticated
  with check (author = auth.uid() and public.can_see(review_owner));
drop policy if exists "replies delete" on public.replies;
create policy "replies delete" on public.replies for delete to authenticated
  using (author = auth.uid() or public.is_admin_user(auth.uid()));

-- ================= анкета: имя, ДР, вкусы =================
create table if not exists public.profile_info (
  id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  name text check (char_length(name) <= 40),
  bday date,
  likes text check (char_length(likes) <= 300),
  avoid text check (char_length(avoid) <= 300),
  updated_at timestamptz not null default now()
);
alter table public.profile_info add column if not exists skill smallint check (skill between 1 and 10);
alter table public.profile_info add column if not exists avatar text;
alter table public.profile_info add column if not exists allergy text;
alter table public.profile_info drop constraint if exists profile_info_avatar_check;
alter table public.profile_info add constraint profile_info_avatar_check check (char_length(avatar) <= 90000);
alter table public.profile_info enable row level security;
grant select, insert, update on public.profile_info to authenticated;
drop policy if exists "info read" on public.profile_info;
create policy "info read" on public.profile_info for select to authenticated using (public.can_see(id));
drop policy if exists "info insert own" on public.profile_info;
create policy "info insert own" on public.profile_info for insert to authenticated with check (auth.uid() = id);
drop policy if exists "info update own" on public.profile_info;
create policy "info update own" on public.profile_info for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- ================= пуши =================
create table if not exists public.push_subs (
  endpoint text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  sub jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.push_subs enable row level security;
grant select, delete on public.push_subs to authenticated;
drop policy if exists "push own" on public.push_subs;
create policy "push own" on public.push_subs for select to authenticated using (user_id = auth.uid());
drop policy if exists "push del own" on public.push_subs;
create policy "push del own" on public.push_subs for delete to authenticated using (user_id = auth.uid());

-- телефон мог принадлежать другому аккаунту — подписка переезжает на того, кто вошёл
create or replace function public.save_push(sub jsonb) returns boolean
language plpgsql security definer set search_path = public as
$$ begin
  if auth.uid() is null or sub->>'endpoint' is null then return false; end if;
  insert into public.push_subs (endpoint, user_id, sub) values (sub->>'endpoint', auth.uid(), sub)
    on conflict (endpoint) do update set user_id = auth.uid(), sub = excluded.sub, created_at = now();
  return true;
end $$;
revoke execute on function public.save_push(jsonb) from public, anon;
grant execute on function public.save_push(jsonb) to authenticated;

-- ================= напоминания плана (закупка, морозилка, маринад, готовка) =================
create table if not exists public.plan_tasks (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key text not null,
  at timestamptz not null,
  title text not null check (char_length(title) <= 200),
  body text check (char_length(body) <= 400),
  sent boolean not null default false,
  primary key (user_id, key)
);
create index if not exists plan_tasks_due_idx on public.plan_tasks (at) where not sent;
alter table public.plan_tasks enable row level security;
grant select, insert, update, delete on public.plan_tasks to authenticated;
drop policy if exists "tasks own" on public.plan_tasks;
create policy "tasks own" on public.plan_tasks for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- служебное: секрет для ежедневного запуска и ключи пушей (наружу не видно)
create schema if not exists kuking_private;
revoke all on schema kuking_private from public, anon, authenticated;
create table if not exists kuking_private.settings (k text primary key, v text not null);
insert into kuking_private.settings (k, v) values ('cron_secret', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
  on conflict (k) do nothing;

-- каждый день в 9:00 по Москве (6:00 UTC) — поздравления с днём рождения
do $cron$
begin
  create extension if not exists pg_cron with schema pg_catalog;
  create extension if not exists pg_net with schema extensions;
  perform cron.schedule('kuking-birthdays', '0 6 * * *', $job$
    select net.http_post(
      url := u,
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-cron', (select v from kuking_private.settings where k = 'cron_secret')),
      body := '{"action":"run"}'::jsonb)
    from unnest(array['https://akwijavguhthhxpdjgfq.supabase.co/functions/v1/birthday-push',
                      'https://akwijavguhthhxpdjgfq.supabase.co/functions/v1/birthday-pushing']) as u -- функция могла получить любое из двух имён
  $job$);
  perform cron.schedule('kuking-tasks', '*/10 * * * *', $job$
    select net.http_post(
      url := u,
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-cron', (select v from kuking_private.settings where k = 'cron_secret')),
      body := '{"action":"tasks"}'::jsonb)
    from unnest(array['https://akwijavguhthhxpdjgfq.supabase.co/functions/v1/birthday-push',
                      'https://akwijavguhthhxpdjgfq.supabase.co/functions/v1/birthday-pushing']) as u -- функция могла получить любое из двух имён
  $job$);
exception when others then
  raise notice 'Расписание не включилось: %', sqlerrm;
end $cron$;

-- ================= твои старые оценки из книги в Claude =================
-- лягут без хозяина; при первом входе приложение перепишет их на тебя. Только если оценок ещё нет.
insert into public.docs (collection, id, user_id, data)
select * from (values
  ('reviews', 'chashushuli-pasta', null::uuid, '{"at": "2026-11-17", "comment": "понравилось использование блендера в этом рецепте, уникальный соус из кинзы и томатов, делал честно говоря не прям по рецепту, но был рад такому необычному сочетанию для себя", "score": 9, "title": "Чашушули-паста"}'::jsonb),
  ('reviews', 'smash-night', null::uuid, '{"at": "2026-11-08", "comment": "бургервы очень вкусные, крылья правда хороши, но крылья получились слишком пережаренными и большие затраты по маслу на фритюр и в целом долго жарить картошку было из за слабой плиты, но картошка тоже безумно вкусная была. Из за всех нюансов ставлю не максимальный балл", "score": 9, "title": "Смэш-сходка"}'::jsonb),
  ('reviews', 'tikka-masala', null::uuid, '{"at": "2026-11-18", "comment": "это по своей сути идеальное блюдо, оно сбалансировано на максимальный вкус. затратил время как раз такое как ты и говорил. Есть одно но, когда варил рис, делал одновременно соус и не удобно было листать туда сюда, поправь этот момент + можешь более понятно объяснять, что из того, что есть закидывать в последнем этапе я запутался и закинул курицу к соусу и рис.", "score": 10, "title": "Тикка масала"}'::jsonb)
) as v(collection, id, user_id, data)
where not exists (select 1 from public.docs where collection = 'reviews');
