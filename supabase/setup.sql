-- Кукинг: база для общих оценок, комментов и полки свежака.
-- Supabase → SQL Editor → New query → вставить всё → Run. Один раз.

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

-- читать могут все, кто вошёл (оценки друзей видны всем своим)
drop policy if exists "docs read" on public.docs;
create policy "docs read" on public.docs for select to authenticated using (true);

-- писать и менять — только свои строки
drop policy if exists "docs insert own" on public.docs;
create policy "docs insert own" on public.docs for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "docs update own" on public.docs;
create policy "docs update own" on public.docs for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- удалять — свои; плюс старые оценки без хозяина (их забирает себе первый вошедший)
drop policy if exists "docs delete own" on public.docs;
create policy "docs delete own" on public.docs for delete to authenticated using (auth.uid() = user_id or user_id is null);

-- твои оценки из книги в Claude: при первом входе приложение перепишет их на тебя
insert into public.docs (collection, id, user_id, data) values
  ('reviews', 'chashushuli-pasta', null, '{"at": "2026-11-17", "comment": "понравилось использование блендера в этом рецепте, уникальный соус из кинзы и томатов, делал честно говоря не прям по рецепту, но был рад такому необычному сочетанию для себя", "score": 9, "title": "Чашушули-паста"}'::jsonb),
  ('reviews', 'smash-night', null, '{"at": "2026-11-08", "comment": "бургервы очень вкусные, крылья правда хороши, но крылья получились слишком пережаренными и большие затраты по маслу на фритюр и в целом долго жарить картошку было из за слабой плиты, но картошка тоже безумно вкусная была. Из за всех нюансов ставлю не максимальный балл", "score": 9, "title": "Смэш-сходка"}'::jsonb),
  ('reviews', 'tikka-masala', null, '{"at": "2026-11-18", "comment": "это по своей сути идеальное блюдо, оно сбалансировано на максимальный вкус. затратил время как раз такое как ты и говорил. Есть одно но, когда варил рис, делал одновременно соус и не удобно было листать туда сюда, поправь этот момент + можешь более понятно объяснять, что из того, что есть закидывать в последнем этапе я запутался и закинул курицу к соусу и рис.", "score": 10, "title": "Тикка масала"}'::jsonb);
