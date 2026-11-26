#!/usr/bin/env bash
# Жарко: перенос данных из облачного Supabase на свой сервер.
#   bash scripts/migrate-from-cloud.sh
# Запускать ПОСЛЕ scripts/init-db.sh, на свежем сервере (данные на своём сервере будут ЗАМЕНЕНЫ данными из облака).
# Пароль облачной базы вводится с клавиатуры, на экране не виден, хранится только на время работы скрипта
# во временном файле migrate/.pgpass (права 600) и удаляется в конце. Никуда его не пересылай.
#
# Что переносится: аккаунты (почта + хэш пароля — все входят со старыми паролями), профили, друзья, оценки, рецепты,
# план, кладовка (таблица docs), анкеты, фото, лайки, подписки на пуши, напоминания, ключи пушей (VAPID),
# а также старые replies, qa и messages (закрыты на запись; человек может прочитать и удалить свои, см. README).
# Из анкеты после переноса стираются имя, дата рождения, аватар, навык и аллергия — приложение их больше не собирает.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p migrate && chmod 700 migrate

TABLES="public.profiles public.friends public.docs public.replies public.profile_info public.push_subs public.plan_tasks public.photos public.review_likes public.qa public.messages kuking_private.settings"
USERS_COLS="instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user, is_anonymous"
IDENT_COLS="id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at"

cat <<'TXT'
Где взять строку подключения: supabase.com → проект → кнопка «Connect» (вверху) → вкладка
«Connection String» → тип «Session pooler» (работает по IPv4). Строка выглядит так:
  postgresql://postgres.akwijavguhthhxpdjgfq:[YOUR-PASSWORD]@aws-0-....pooler.supabase.com:5432/postgres
Вставь её как есть — [YOUR-PASSWORD] скрипт уберёт сам, пароль спросит отдельно.
TXT
read -rp "Строка подключения: " SRC
SRC=$(printf '%s' "$SRC" | sed -E 's#:\[YOUR-PASSWORD\]@#@#; s#^postgres://#postgresql://#' | tr -d '[:space:]')
case "$SRC" in postgresql://*@*) ;; *) echo "Не похоже на строку подключения"; exit 1;; esac
read -rsp "Пароль базы облачного Supabase (не отображается): " PW; echo
PW=${PW//\\/\\\\}; PW=${PW//:/\\:}
umask 077
printf '*:*:*:*:%s\n' "$PW" > migrate/.pgpass
unset PW
trap 'rm -f migrate/.pgpass' EXIT

# к облаку ходим из контейнера db (там pg_dump 17); PGPASSWORD контейнера (пароль своей базы) отключаем
cloud() { docker compose exec -T -u root db env -u PGPASSWORD PGPASSFILE=/migrate/.pgpass "$@"; }
local_admin() { docker compose exec -T -u root db psql -h localhost -U supabase_admin -d postgres -v ON_ERROR_STOP=1 "$@"; }

echo "== Проверяю связь с облаком"
cloud psql "$SRC" -Atc "select 'ok: ' || count(*) || ' аккаунтов' from auth.users"

echo "== Выгружаю аккаунты"
cloud psql "$SRC" -v ON_ERROR_STOP=1 -c "\copy (select $USERS_COLS from auth.users order by created_at) to '/migrate/users.csv' with (format csv, header)"
cloud psql "$SRC" -v ON_ERROR_STOP=1 -c "\copy (select $IDENT_COLS from auth.identities) to '/migrate/identities.csv' with (format csv, header)"

echo "== Выгружаю данные приложения"
TFLAGS=""; for t in $TABLES; do TFLAGS="$TFLAGS -t $t"; done
# shellcheck disable=SC2086
cloud pg_dump "$SRC" --data-only --no-owner --no-privileges -Fc $TFLAGS -f /migrate/data.dump

echo "== Сохраняю копию выгрузки: backups/cloud-$(date +%F).dump"
mkdir -p backups && cp migrate/data.dump "backups/cloud-$(date +%F).dump"

echo "== Загружаю на свой сервер (старые данные своего сервера заменяются)"
local_admin <<SQL
begin;
truncate $(echo "$TABLES" | sed 's/ /, /g') cascade;
delete from auth.identities;
delete from auth.users;
\copy auth.users ($USERS_COLS) from '/migrate/users.csv' with (format csv, header)
\copy auth.identities ($IDENT_COLS) from '/migrate/identities.csv' with (format csv, header)
commit;
SQL
docker compose exec -T -u root db pg_restore -h localhost -U supabase_admin -d postgres \
  --data-only --no-owner --disable-triggers --single-transaction --exit-on-error /migrate/data.dump

echo "== Сверяю количество строк (облако → свой сервер)"
for t in auth.users $TABLES; do
  a=$(cloud psql "$SRC" -Atc "select count(*) from $t" 2>/dev/null || echo "—")
  b=$(local_admin -Atc "select count(*) from $t")
  printf '  %-28s %6s → %6s %s\n' "$t" "$a" "$b" "$([ "$a" = "$b" ] && echo ok || echo 'ПРОВЕРЬ')"
done

echo "== Стираю поля анкеты, которые приложение больше не собирает (имя, дата рождения, аватар, навык, аллергия)"
local_admin -q -c "update public.profile_info set name = null, bday = null, skill = null, avatar = null, allergy = null
  where name is not null or bday is not null or skill is not null or avatar is not null or allergy is not null"

# расписание читает секрет из kuking_private.settings — он переехал вместе с ключами пушей, перезапускать ничего не нужно
local_admin -q -c "notify pgrst, 'reload schema'" >/dev/null
rm -f migrate/users.csv migrate/identities.csv migrate/data.dump
echo
echo "Готово. Дальше: поменять адрес в приложении (README, шаг 7) и всем один раз выйти и войти."
