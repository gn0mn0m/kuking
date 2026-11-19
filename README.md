# Кукинг

Книга рецептов-слайдшоу для iPhone: продукты с галочками, посуда, шаги на шефа и су-шефа, таймеры, подача и салют. Ставится на экран «Домой», работает без интернета.

## Установка на iPhone
1. Открыть сайт в Safari.
2. «Поделиться» → «На экран „Домой“» → «Добавить».

## Что внутри
- `index.html` — оболочка и стили; `js/recipes/*.js` — рецепты (данные).
- `js/store.js` — вход и общие оценки через Supabase (без библиотек).
- `js/ai.js` — нейросеть по своему ключу: OpenAI-совместимые, Gemini, Anthropic. Ключ хранится только в телефоне.
- `sw.js` — офлайн и обновления. После любых правок: `python3 tools/build_sw.py`.
- `supabase/setup.sql` — таблица и права для базы, запускается один раз.

## Облако (Supabase), один раз
1. supabase.com → New project `kuking`.
2. SQL Editor → вставить `supabase/setup.sql` → Run.
3. Authentication → Sign In / Providers → Email: выключить «Confirm email» (иначе друзьям придёт письмо).
4. Project Settings → API: Project URL и anon public key → в `js/config.js`.
   `service_role` и пароль базы никуда не вставлять и никому не слать.
