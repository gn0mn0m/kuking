# Жарко: переезд с облачного Supabase на свой сервер в России

Что получится: один российский сервер раздаёт и само приложение (PWA), и API с теми же адресами `/auth/v1`,
`/rest/v1`, `/functions/v1`, что у Supabase. Шрифты и юридические страницы тоже лежат на нём. Браузер пользователя
не обращается ни к GitHub Pages, ни к Google Fonts, ни к серверам Supabase за рубежом. В `js/lib/config.js`
`supabaseUrl` пустой, поэтому приложение само ходит на свой же адрес (`location.origin`). Нейросеть — DeepSeek V4.1 Flash
и Alice AI ART через Yandex AI Studio (серверы в РФ). Аккаунты, пароли, оценки, план, фото и ключи пушей переносятся.

Бюджет на 10 человек: **≈ 1 800–2 100 ₽/мес** (сервер 400 ₽ + нейросеть ≈ 1 400–1 650 ₽), см. «Стоимость» внизу.

## Почему так, а не полный Supabase

Полному Supabase в Docker нужно минимум 4 ГБ RAM (рекомендуется 8 ГБ) и 40 ГБ диска
([документация Supabase](https://supabase.com/docs/guides/self-hosting/docker)). Сервер на 4 ГБ у Timeweb Cloud стоит
3 840 ₽/мес ([servercalc, цены на 01.11.2026](https://servercalc.ru/provajdery/timeweb/oblachnye-servery/)), то есть больше всего бюджета.

Поэтому здесь «лёгкий Supabase»: работают **те же** серверы Supabase (GoTrue для входа, PostgREST для таблиц,
edge-runtime для функций, PostgreSQL из образа Supabase), но без Studio, Realtime, Storage, аналитики и пулера:
приложение ими не пользуется. Kong заменён на Caddy, он же сам получает HTTPS-сертификат. Всё помещается в 2 ГБ.

```
браузер ─HTTPS─▶ caddy ─┬─ /, /js, /css, /fonts, /legal → статика /srv/zharko-web (deploy-web.sh)
                        ├─ /auth/v1/*      → auth (GoTrue)
                        ├─ /rest/v1/*      → rest (PostgREST) ─┐
                        └─ /functions/v1/* → functions (ai, birthday-push) ─▶ Yandex AI Studio
                                                     db (PostgreSQL + pg_cron) ◀┘  каждые 10 мин → birthday-push (напоминания плана)
```

## Что сделать руками (кратко)

1. Арендовать VPS (Ubuntu 24.04, 2 ГБ RAM) и оплатить картой РФ.
2. Зарегистрироваться в Yandex Cloud как физлицо, привязать карту, создать API-ключ в AI Studio.
3. Запустить по порядку скрипты из шагов ниже. Пароль облачной базы при переносе ввести в терминал на сервере
   (**не в чат и не в файлы**).
4. Раздать тестировщикам новый адрес `https://ДОМЕН/`. Каждому один раз войти и заново установить приложение на экран «Домой».

---

## Шаг 1. Сервер

**Основной вариант: Selectel VDS 2-2-40** (2 vCPU, 2 ГБ, 40 ГБ) за 400 ₽/мес. Если его нет в наличии, подойдёт 1-2-25 за 250 ₽.
Цены на [странице VDS Selectel](https://selectel.ru/services/cloud/vps-vds/). На момент проверки там было написано
«Все конфигурации распроданы», так что наличие смотри в панели. Оплата почасовая с баланса,
пополнение картой или QR (СБП) от 200 ₽ ([как пополнить](https://docs.selectel.ru/en/balance-and-payments/manage/top-up-balance/)).

**Если у Selectel нет мест: Timeweb Cloud MSK 30** (1 vCPU, 2 ГБ, 30 ГБ) за 2 140 ₽/мес вместе с IPv4.
Тогда вместе с нейросетью выйдет ≈ 3 500 ₽/мес, на 15–20 % больше бюджета. Платить можно картой РФ, ЮMoney или SberPay.

При создании сервера:
- образ: **Ubuntu 24.04**;
- нужен **публичный IPv4**;
- доступ: пароль root (придёт на почту или будет в панели) либо свой SSH-ключ.

Подключись к серверу с компьютера. В Windows открой PowerShell, в macOS или Linux — Терминал:

```bash
ssh root@IP_СЕРВЕРА
```

## Шаг 2. Загрузить файлы на сервер

Загружается **вся папка приложения** `zharko`: в ней фронтенд, а внутри `deploy/` — серверный комплект.
Перед загрузкой на своём компьютере обнови юридические страницы и воркер, если что-то менял:

```bash
cd zharko && python3 tools/legal_html.py && python3 tools/build_sw.py && cd ..
```

Команды для **своего компьютера**, из папки, где лежит `zharko`:

```bash
scp -r zharko root@IP_СЕРВЕРА:/opt/
```

Дальше все команды выполняются **на сервере**:

```bash
cd /opt/zharko/deploy
sudo bash scripts/server-setup.sh
```

Скрипт поставит Docker, включит файрвол (открыты только 22, 80 и 443) и сделает файл подкачки.

## Шаг 3. Пароли, ключи и адрес

```bash
bash scripts/gen-secrets.sh
```

Скрипт сам придумает пароль базы и ключи входа и спросит домен. Нажми Enter, и подставится бесплатный адрес
`IP-с-дефисами.sslip.io`, например `203-0-113-7.sslip.io`. Он указывает на твой сервер, покупать домен не нужно,
и Let's Encrypt выдаёт на него сертификат. Если у тебя есть свой домен, создай A-запись на IP сервера и введи его.

> sslip.io — сторонний DNS-сервис. Если адрес не открывается у кого-то из тестировщиков, купи домен `.ru`
> (несколько сотен рублей в год) и поменяй `DOMAIN` (см. «Свой домен» ниже).

## Шаг 4. Ключ нейросети (Yandex AI Studio)

1. Зайди на [yandex.cloud](https://yandex.cloud) со своим Яндекс ID и создай **платёжный аккаунт физлица**.
   Принимаются карты Мир, Visa и MasterCard российских банков; для проверки карты временно блокируется 11 ₽
   ([инструкция](https://yandex.cloud/ru/docs/getting-started/individuals/registration)).
2. Открой [AI Studio](https://aistudio.yandex.ru) и нажми **«Создать API-ключ»**. Сервисный аккаунт с нужными ролями
   создастся сам, у ключа будут области `yc.ai.languageModels.execute` и `yc.ai.imageGeneration.execute`
   ([инструкция](https://aistudio.yandex.ru/docs/en/ai-studio/operations/get-api-key.html)).
   **Скопируй ключ сразу**, потом его не покажут.
3. **ID каталога** — строка вида `b1g…` рядом с названием каталога в консоли Yandex Cloud.
4. Впиши оба значения в `.env`:

```bash
nano .env      # YANDEX_API_KEY=...   YANDEX_FOLDER_ID=b1g...
               # сохранить: Ctrl+O, Enter; выйти: Ctrl+X
```

## Шаг 5. Запуск

```bash
sudo bash scripts/init-db.sh
```

Скрипт скачает образы, создаст базу, применит схему (`sql/01-schema.sql`, `02-social.sql`, `03-selfhost.sql`),
выложит фронтенд в `/srv/zharko-web` (`scripts/deploy-web.sh`, он же один раз скачивает шрифты), запустит всё,
включит расписание (напоминания плана каждые 10 минут, ночная чистка журналов) и ночной бэкап.

> Если скачивание образов падает с ошибкой 403 или timeout (Docker Hub из РФ иногда недоступен), включи зеркало
> и повтори: `DOCKER_MIRROR=https://dockerhub.timeweb.cloud sudo -E bash scripts/server-setup.sh`, затем снова `init-db.sh`.

Проверка:

```bash
bash scripts/check.sh        # бесплатно: HTTPS, фронтенд, legal, шрифты, вход, таблицы, CORS, пуши, расписание
```

Сертификат выпускается за 10–60 секунд после первого запуска. Если первая проверка HTTPS не прошла, подожди минуту и повтори.

## Шаг 6. Перенос данных из облачного Supabase

```bash
bash scripts/migrate-from-cloud.sh
```

1. Скрипт попросит **строку подключения**. В [панели Supabase](https://supabase.com/dashboard) открой проект и нажми
   **Connect** → Connection String → **Session pooler**. Скопируй строку как есть, вместе с `[YOUR-PASSWORD]`.
2. Потом спросит **пароль базы**. Введи его сам, на экране он не отображается. Если пароль забыт, сбрось его в панели
   Supabase: Project Settings → Database → Reset database password.
3. В конце скрипт покажет таблицу «облако → свой сервер». Цифры в каждой строке должны совпасть.

Что переезжает: аккаунты (все входят со **старыми паролями**), профили, друзья, оценки, рецепты, план, кладовка,
вкусы, фото, лайки, подписки на пуши, напоминания, ключи пушей (поэтому уведомления продолжат приходить),
а также старые `replies`, `qa` и `messages` (см. «Старая переписка»). Из анкет после переноса стираются имя,
дата рождения, аватар, навык и аллергия: приложение их больше не собирает. Копия выгрузки сохраняется
в `backups/cloud-ДАТА.dump`. В ней эти поля остались, поэтому её тоже удали, когда убедишься, что перенос удался.

## Шаг 7. Переключить пользователей на новый адрес

Менять в коде ничего не нужно. В `js/lib/config.js` `supabaseUrl: ''`, поэтому приложение ходит на свой же сервер.
Копия на GitHub Pages (`*.github.io`) по-прежнему ходит в старое облако (`legacyCloudUrl`). Это только на время переезда.
Когда все перейдут, удали `legacyCloudUrl` из `config.js` и сайт на GitHub Pages.

Разошли тестировщикам `https://ДОМЕН/`. У каждого это **новый сайт**, поэтому:
- войти заново (пароль прежний);
- установить приложение на экран «Домой» заново, а старую иконку с github.io удалить;
- заново включить уведомления в настройках: подписка на пуши привязана к адресу сайта;
- фото блюд, сохранённые в телефоне, подтянутся из базы, а локальные черновики и настройки останутся в старой версии.

**Обновить приложение потом:** на компьютере `python3 tools/legal_html.py && python3 tools/build_sw.py`, загрузить
папку заново (`scp -r zharko root@IP:/opt/`), на сервере `sudo bash scripts/deploy-web.sh`. Телефоны подхватят новую
версию сами: `sw.js` и `index.html` отдаются без кэша.

Проверь нейросеть (≈ 2–3 ₽: строгий вызов, одно фото и короткий чат):

```bash
bash scripts/check.sh ai
```

Облачный проект Supabase не удаляй 1–2 недели, пока не убедишься, что всё работает. Потом его можно поставить на паузу или удалить.

---

## Повседневное

| Что | Команда (из `/opt/zharko/deploy`) |
|---|---|
| Состояние | `docker compose ps` и `bash scripts/check.sh` |
| Логи нейросети и пушей | `docker compose logs -f --tail 100 functions` |
| Логи входа / HTTPS | `docker compose logs --tail 100 auth` / `caddy` |
| Перезапуск | `docker compose restart` |
| Бэкап вручную | `bash scripts/backup.sh` |
| Скачать бэкапы к себе (с компьютера) | `scp root@IP:/opt/zharko/deploy/backups/zharko-*.dump .` |
| Восстановить из бэкапа | `bash scripts/restore.sh backups/zharko-ДАТА.dump` |
| Консоль базы | `docker compose exec db psql -h localhost -U postgres` |
| Закрыть регистрацию | в `.env` `DISABLE_SIGNUP=true`, потом `docker compose up -d` |
| Поменять лимиты нейросети | в `.env` `AI_DAILY_*`, потом `docker compose up -d` |

**Бэкап** делается каждую ночь в 03:15 по времени сервера (UTC, то есть 06:15 МСК) в `backups/` и хранится 14 дней.
Раз в неделю скачивай свежий файл к себе: если сервер пропадёт, бэкап на нём пропадёт вместе с ним.
Переезд на новый сервер: шаги 1–5, потом `restore.sh` со скачанным файлом.

**Расход нейросети за текущий месяц** (оценка по ценам из раздела «Стоимость»; токены чата в потоке не считаются):

```bash
docker compose exec db psql -h localhost -U postgres -c "select kind, count(*) as calls, sum(tokens_in) as tin, sum(tokens_out) as tout,
  round(sum(tokens_in)*0.0003 + sum(tokens_out)*0.0005 + count(*) filter (where kind='image')*2.23) as rub
  from kuking_private.ai_usage where created_at >= date_trunc('month', now()) group by kind"
```

Точная сумма — в консоли Yandex Cloud, раздел Billing. Там же стоит настроить **бюджет с уведомлением**,
например на 2 000 ₽/мес.

### Свой домен вместо sslip.io

Создай A-запись домена на IP сервера, впиши в `.env` `DOMAIN=твой.домен` и `SITE_URL=https://твой.домен/`, выполни
`docker compose up -d` (Caddy сам получит сертификат). В приложении ничего менять не нужно. Пользователям снова
придётся войти и установить приложение по новому адресу, поэтому домен лучше выбрать до раздачи ссылки.

### Фронтенд, шрифты, юридические страницы

- `scripts/deploy-web.sh [папка_приложения]` копирует `index.html`, `manifest.webmanifest`, `sw.js`, `css/`, `js/`,
  `icons/`, `legal/*.html` в `/srv/zharko-web` (`WEB_ROOT` в `.env`). Папку `fonts/` не трогает. Повторный запуск = обновление.
- `scripts/fetch_fonts.py` один раз скачивает на сервер 6 файлов woff2: Fira Sans Extra Condensed 600 и 800,
  Golos Text 400–700, кириллица и латиница. Источники — Google Fonts, запасной — Fontsource на jsDelivr. Браузеры
  пользователей получают шрифты только с нашего домена, их подключает `css/fonts.css`. Если шрифтов нет, приложение
  работает с системными, а воркер кэширует шрифты при первом запросе в отдельный кэш `zharko-fonts`.
- `tools/legal_html.py` (на компьютере) собирает `legal/privacy.html`, `terms.html`, `consent.html` из `.md`
  со стилями приложения. Внутренний `checklist.md` не публикуется.
- Caddy ставит строгую CSP: скрипты, стили, шрифты и запросы — только со своего домена. Если что-то попытается
  грузиться извне, браузер это заблокирует, и в консоли будет видно, что именно.

### Права доступа (RLS): кто что видит

| Таблица | Читать | Писать | Удалять |
|---|---|---|---|
| `profiles` | ник и `is_admin` всех (нужно для поиска друзей) | свой ник | свою строку |
| `profile_info` | только свою строку и только `id, likes, avoid, updated_at` | то же | свою строку |
| `docs` | свои строки; без хозяина: `imgpub` всем, остальное только шефу | свои; `imgpub` без хозяина | свои; без хозяина только шеф |
| `photos`, `review_likes` | свои и друзей (шеф видит всех) | свои | свои (фото: ещё шеф) |
| `messages`, `qa`, `replies` | только свои | **закрыто** | свои |

Чужие оценки напрямую из `docs` не читаются: их отдаёт `POST /rest/v1/rpc/friend_reviews` (тело `{}`) без текста
комментария. Формат ответа такой же, как у прежнего `GET docs?select=id,user_id,data&collection=eq.reviews`:
`[{"id":"tikka-masala","user_id":"…","data":{"score":10,"title":"Тикка масала","at":"2026-11-18","updatedAt":…}}]`.
В ответе свои оценки и оценки друзей, у шефа — все. Шеф (`is_admin`) виден только своим друзьям, как все.

### Старая переписка: `messages`, `qa`, `replies`

Переписки в приложении больше нет. Таблицы остались только ради переноса из облака: новые строки писать
нельзя (`insert`/`update` отозваны у `anon` и `authenticated`). Человек может прочитать и удалить строки, где он
автор, отправитель или получатель (для `replies` — ещё владелец оценки). При удалении аккаунта они стираются.

**После переезда таблицы можно удалить.** Когда все тестировщики перешли и облако выключено:

```bash
bash scripts/backup.sh
docker compose exec db psql -h localhost -U postgres -c "drop table if exists public.messages, public.qa, public.replies"
```

Потом убери их из `sql/01-schema.sql` (блок «ответы под оценками»), `sql/02-social.sql` (блоки `qa` и `messages`),
из `TABLES` в `scripts/migrate-from-cloud.sh` и из `deleteMe` в `functions/ai/index.ts`, иначе повторный
`init-db.sh` создаст их заново. Срок удаления впиши в `legal/privacy.md` вместо `[срок хранения старой переписки]`.

### CORS

Браузер разрешает сайту обращаться к API на другом адресе, только если API ответит заголовком
`Access-Control-Allow-Origin` с адресом этого сайта. Приложение раздаётся с того же сервера, что и API, поэтому
по умолчанию разрешён только он: `CORS_ORIGIN` в `.env` пустой, и `docker-compose.yml` подставляет `https://DOMAIN`
(Caddy для `/auth/v1` и `/rest/v1`, функции `ai` и `birthday-push`). `gen-secrets.sh` пишет этот адрес и в `.env`
и заменяет старое значение `*`. Значение `*` не ставь: тогда к API сможет обращаться скрипт с любого сайта.
Другой адрес (например, `http://localhost:8080`) нужен только на время разработки: впиши его в `CORS_ORIGIN`
и выполни `docker compose up -d`. Если сменишь домен, обнови `DOMAIN` и `CORS_ORIGIN` вместе. Копия на GitHub Pages
ходит в старое облако, а не сюда, поэтому этот запрет её не касается. `check.sh` проверяет, что сервер отвечает
адресом приложения.

### Удаление аккаунта

Кнопка «Удалить аккаунт» в настройках сначала удаляет строки человека через REST, потом вызывает `action: 'delete_me'`
функции `ai`. Сервер в одной транзакции удаляет всё, связанное с человеком:
- `docs`, `photos`, `profile_info`, `profiles`, `push_subs`, `plan_tasks`;
- `review_likes` и `friends` с обеих сторон;
- `replies`, `qa`;
- `messages`, где он отправитель или получатель;
- `kuking_private.ai_usage`.

Потом удаляет сам аккаунт через admin API GoTrue (service-ключ из `.env`), а если тот не ответил — через SQL.
Ответ: `{"ok":true}`.

### Почта (необязательно)

Сейчас регистрация проходит без письма (`ENABLE_EMAIL_AUTOCONFIRM=true`), почтовый сервер не нужен.
Если нужны письма с подтверждением, например через Яндекс Почту: включи в ней пароль приложения, заполни `SMTP_*` в `.env`
(`SMTP_HOST=smtp.yandex.ru`, `SMTP_PORT=465`, `SMTP_USER` и `SMTP_ADMIN_EMAIL` — твой адрес, `SMTP_PASS` — пароль приложения),
раскомментируй 6 строк `GOTRUE_SMTP_*` в `docker-compose.yml`, поставь `ENABLE_EMAIL_AUTOCONFIRM=false` и выполни `docker compose up -d`.

### Обновление

```bash
cd /opt/zharko/deploy && bash scripts/backup.sh && docker compose pull && docker compose up -d
```

Версии образов закреплены в `docker-compose.yml`. Обновлять их стоит по одной, сверяясь с
[официальным compose Supabase](https://github.com/supabase/supabase/blob/master/docker/docker-compose.yml).

---

## Нейросеть: что поменялось в функции `ai`

`functions/ai/index.ts` теперь ходит в OpenAI-совместимый API Yandex AI Studio
(`https://ai.api.cloud.yandex.net/v1`, заголовки `Authorization: Api-Key …` и `OpenAI-Project: <ID каталога>`,
[документация](https://aistudio.yandex.ru/docs/en/ai-studio/operations/generation/completions-basic)).
Для приложения контракт **не изменился**:

| Запрос приложения | Ответ | Как сделано |
|---|---|---|
| обычный чат (`messages`, `stream`) | поток SSE в формате OpenAI | `POST /chat/completions`, `stream: true`, модель `gpt://<каталог>/deepseek-v4.1-flash` |
| `action: 'fn'` (`fn.parameters` — JSON-схема) | `{ args }` | см. ниже |
| `action: 'delete_me'` | `{ ok: true }` | удаляет все данные человека и аккаунт (см. «Удаление аккаунта») |
| `action: 'image'` | `{ image: 'data:image/…;base64,…' }` | `POST /images/generations`, модель `art://<каталог>/aliceai-image-art-3.0`, поле `b64_json` ([документация](https://aistudio.yandex.ru/docs/ru/ai-studio/api/Images/createImage)) |

**Строгий вызов (`fn`).** В AI Studio для Chat Completions описаны `tools` и `tool_choice` со значениями `auto` и `none`
([совместимость с OpenAI](https://yandex.cloud/en/docs/ai-studio/concepts/openai-compatibility)). Но в документации
**не сказано**, умеет ли DeepSeek V4.1 Flash вызывать функции и можно ли заставить модель вызвать конкретную функцию.
Поэтому функция пробует режимы по очереди и запоминает тот, что сработал:

1. принудительный вызов функции;
2. `tool_choice: auto`;
3. `response_format: json_schema`;
4. `json_object`;
5. обычный текст со схемой в промпте.

Любой ответ функция разбирает (вынимает JSON из лишнего текста, чинит висячие запятые) и **проверяет кодом по схеме**:
обязательные поля, типы, `enum`. Безобидное исправляет сама, например `"5"` → `5` или одиночное значение → массив.
Если ошибки остались, делает один повтор со списком ошибок. На один вызов уходит не больше 3 платных ответов
(`AI_FN_MAX_ATTEMPTS`). Какой режим сработал, видно в `docker compose logs functions` (строка `ai: строгий режим …`).
Поле `few_shot_examples` было особенностью GigaChat, теперь примеры идут в системный промпт.

**Защита бюджета:** не больше 60 текстовых запросов и 20 фото на человека за сутки (`AI_DAILY_*` в `.env`).
Каждый вызов записывается в `kuking_private.ai_usage`, эта таблица не видна через API.

`functions/birthday-push/index.ts`: пуши (ключ, проба, напоминания плана). Поздравления с днём рождения (`run`) и
пуши о сообщениях (`msg`) отключены: дату рождения не собираем, переписки нет. Оба действия отвечают `{ sent: 0 }`.
Расписание (`sql/03-selfhost.sql`, pg_cron + pg_net) вызывает функцию внутри docker-сети:
`http://functions:9000/birthday-push`. Задание `kuking-birthdays` снимается при запуске `init-db.sh`.

## Стоимость

### Нейросеть (10 человек, ≈ 100 рецептов и 100 фото в месяц)

Цены DeepSeek в рублях с НДС, за 1 000 токенов: вход 0,30 ₽, выход 0,50 ₽, кэш 0,075 ₽
([блог Yandex Cloud о DeepSeek V4 Flash](https://yandex.cloud/ru/blog/yandex-ai-studio-deepseek-v4-flash)).
В [прайсе AI Studio](https://aistudio.yandex.ru/docs/en/ai-studio/pricing) у V4.1 Flash те же ставки
($0,002459016 и $0,00409836 без НДС = 0,30 ₽ и 0,50 ₽ с НДС). Генерация фото стоит $0,0182786856 за запрос без НДС.
По тому же пересчёту это **≈ 2,23 ₽** с НДС. Рублёвую цену фото в документации я не нашёл, это расчёт, его стоит сверить в Billing.

| Статья | Расчёт | ₽/мес |
|---|---|---|
| Рецепты, вход | 100 × 3 вызова × 6 000 = 1,8 млн токенов × 0,30 ₽/1K | 540 |
| Рецепты, выход | 100 × 3 × 4 000 = 1,2 млн токенов × 0,50 ₽/1K | 600 |
| Фото | 100 × ≈ 2,23 ₽ | ≈ 223 |
| **Итого по заданию** | | **≈ 1 365** |
| С запасом +20 % на повторы строгого режима и чат | | **≈ 1 650** |

Если DeepSeek в AI Studio рассуждает перед ответом, токены рассуждений, скорее всего, тоже оплачиваются как выход.
Поэтому запас нужен. Через неделю сверь реальный расход по запросу выше.

### Всё вместе

| Вариант сервера | Сервер | Нейросеть | Итого ₽/мес |
|---|---|---|---|
| **Selectel VDS 2-2-40** (рекомендую) | 400 | 1 365–1 650 | **≈ 1 800–2 050** |
| Selectel VDS 1-2-25 | 250 | 1 365–1 650 | ≈ 1 600–1 900 |
| Timeweb Cloud MSK 30 (1 vCPU / 2 ГБ, с IPv4) | 2 140 | 1 365–1 650 | ≈ 3 500–3 800 (выше бюджета) |
| Полный Supabase, Timeweb MSK 50 (4 ГБ) | 3 840 | 1 365–1 650 | ≈ 5 200+ (не влезает) |

Для справки: бесплатная ВМ Cloud.ru Evolution Free Tier доступна только аккаунтам, созданным до 30.06.2026
([обзор, 13.11.2026](https://www.ssdnodes.com/learn/lang/ru/is-there-a-free-vps-in-russia)). ВМ Cloud.ru на 2 vCPU и 4 ГБ
с диском и IP стоит ≈ 2 745 ₽ ([tproger, 30.10.2026](https://tproger.ru/articles/oblachnye-servery-v-rossii-sravnivaem-provajderov-na-odinakovoj)).

## Файлы

```
deploy/
  docker-compose.yml      сервисы db, auth, rest, functions, caddy
  Caddyfile               HTTPS, раздача фронтенда (/srv/zharko-web), раскладка путей API, CSP
  .env.example            образец настроек (настоящий .env создаёт gen-secrets.sh)
  db/roles.sql, jwt.sql   из официального supabase/docker: пароли служебных ролей, срок токена
  sql/01-schema.sql       бывший облачный setup.sql без расписания; RLS ужесточены, rpc friend_reviews
  sql/02-social.sql       бывший облачный setup-4.sql; qa и messages закрыты на запись
  sql/03-selfhost.sql     расписание pg_cron внутри docker-сети + таблица учёта нейросети (хранится 90 дней)
  functions/main/         роутер функций из официального supabase/docker (без изменений)
  functions/ai/           нейросеть: Yandex AI Studio (DeepSeek + Alice AI ART)
  functions/birthday-push/ пуши: ключ, проба, напоминания плана (дни рождения и сообщения отключены)
  scripts/                server-setup, gen-secrets, init-db, deploy-web, fetch_fonts.py,
                          migrate-from-cloud, backup, restore, check
```

Безопасность: база, сервер входа и функции наружу не открыты, из интернета доступен только Caddy на 80 и 443.
`.env` (права 600) и `backups/` никому не передавай, в них пароли и хэши паролей пользователей.
