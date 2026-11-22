-- Жарко 4.7 — соцсеть: фото к рецептам, лайки отзывов, вопросы к рецепту, личные сообщения.
-- Запускать один раз: Supabase → SQL Editor → New query → вставить всё → Run. Повторный запуск безопасен.
-- Фото хранятся прямо в базе сжатыми (≈ 100 КБ), отдельное хранилище не нужно.

-- ================= фото к рецептам =================
create table if not exists public.photos (
  id bigint generated always as identity primary key,
  recipe_id text not null,
  recipe_title text check (char_length(recipe_title) <= 120),
  author uuid not null default auth.uid() references auth.users (id) on delete cascade,
  thumb text not null check (char_length(thumb) < 60000),
  full_img text not null check (char_length(full_img) < 450000),
  caption text check (char_length(caption) <= 300),
  created_at timestamptz not null default now()
);
create index if not exists photos_recipe_idx on public.photos (recipe_id);
create index if not exists photos_author_idx on public.photos (author, created_at desc);
alter table public.photos enable row level security;
grant select, insert, delete on public.photos to authenticated;
drop policy if exists "photos read" on public.photos;
create policy "photos read" on public.photos for select to authenticated using (public.can_see(author));
drop policy if exists "photos add" on public.photos;
create policy "photos add" on public.photos for insert to authenticated with check (author = auth.uid());
drop policy if exists "photos del" on public.photos;
create policy "photos del" on public.photos for delete to authenticated using (author = auth.uid() or public.is_admin_user(auth.uid()));

-- ================= лайки отзывов =================
create table if not exists public.review_likes (
  recipe_id text not null,
  review_owner uuid not null references auth.users (id) on delete cascade,
  liker uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (recipe_id, review_owner, liker)
);
alter table public.review_likes enable row level security;
grant select, insert, delete on public.review_likes to authenticated;
drop policy if exists "likes read" on public.review_likes;
create policy "likes read" on public.review_likes for select to authenticated using (liker = auth.uid() or public.can_see(review_owner));
drop policy if exists "likes add" on public.review_likes;
create policy "likes add" on public.review_likes for insert to authenticated with check (liker = auth.uid() and public.can_see(review_owner));
drop policy if exists "likes del" on public.review_likes;
create policy "likes del" on public.review_likes for delete to authenticated using (liker = auth.uid());

-- ================= вопросы к рецепту и ответы =================
create table if not exists public.qa (
  id bigint generated always as identity primary key,
  recipe_id text not null,
  recipe_title text check (char_length(recipe_title) <= 120),
  parent bigint references public.qa (id) on delete cascade,
  author uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1500),
  by_ai boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists qa_recipe_idx on public.qa (recipe_id);
alter table public.qa enable row level security;
grant select, insert, delete on public.qa to authenticated;
drop policy if exists "qa read" on public.qa;
create policy "qa read" on public.qa for select to authenticated using (public.can_see(author));
drop policy if exists "qa add" on public.qa;
create policy "qa add" on public.qa for insert to authenticated with check (author = auth.uid());
drop policy if exists "qa del" on public.qa;
create policy "qa del" on public.qa for delete to authenticated using (author = auth.uid() or public.is_admin_user(auth.uid()));

-- ================= личные сообщения =================
create table if not exists public.messages (
  id bigint generated always as identity primary key,
  sender uuid not null default auth.uid() references auth.users (id) on delete cascade,
  receiver uuid not null references auth.users (id) on delete cascade,
  body text not null default '' check (char_length(body) <= 2000),
  recipe jsonb check (recipe is null or pg_column_size(recipe) < 200000),
  recipe_title text check (char_length(recipe_title) <= 120),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists messages_pair_idx on public.messages (least(sender, receiver), greatest(sender, receiver), created_at desc);
create index if not exists messages_unread_idx on public.messages (receiver) where read_at is null;
alter table public.messages enable row level security;
revoke update on public.messages from anon, authenticated;
grant select, insert, delete on public.messages to authenticated;
grant update (read_at) on public.messages to authenticated;
drop policy if exists "msg read" on public.messages;
create policy "msg read" on public.messages for select to authenticated using (auth.uid() in (sender, receiver));
drop policy if exists "msg send" on public.messages;
create policy "msg send" on public.messages for insert to authenticated
  with check (sender = auth.uid() and receiver <> auth.uid() and (public.is_friend(receiver) or public.is_admin_user(receiver) or public.is_admin_user(auth.uid())));
drop policy if exists "msg read mark" on public.messages;
create policy "msg read mark" on public.messages for update to authenticated using (receiver = auth.uid()) with check (receiver = auth.uid());
drop policy if exists "msg del" on public.messages;
create policy "msg del" on public.messages for delete to authenticated using (sender = auth.uid());

-- на случай, если таблица уже была создана без заголовка рецепта
alter table public.messages add column if not exists recipe_title text check (char_length(recipe_title) <= 120);

-- 4.10: комментарии к рецепту без оценки (kind = 'c'), вопросы — 'q'
alter table public.qa add column if not exists kind text not null default 'q' check (kind in ('q', 'c'));

-- 4.12: общие фото для встроенных рецептов — кто первым нарисовал, тот поделился со всеми (читать могут все вошедшие)
drop policy if exists "imgpub add" on public.docs;
create policy "imgpub add" on public.docs for insert to authenticated
  with check (collection = 'imgpub' and user_id is null and pg_column_size(data) < 400000);
