#!/usr/bin/env bash
# Жарко: первый запуск — поднять базу и вход, применить схему, запустить всё остальное, включить ночной бэкап.
#   bash scripts/init-db.sh
# Можно запускать повторно: схема написана так, что повтор ничего не ломает (например, после обновления sql/).
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] || { echo "Нет .env — сначала bash scripts/gen-secrets.sh"; exit 1; }
grep -q '^DOMAIN=CHANGE_ME' .env && { echo "В .env не задан DOMAIN — запусти bash scripts/gen-secrets.sh"; exit 1; }
mkdir -p backups migrate && chmod 700 backups migrate

echo "== Скачиваю образы (первый раз — несколько минут)"
docker compose pull

echo "== Запускаю базу и сервер входа (он создаёт таблицы auth)"
docker compose up -d --wait db auth

psql_pg() { docker compose exec -T -u root db psql -h localhost -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"; }
for f in sql/01-schema.sql sql/02-social.sql sql/03-selfhost.sql; do
  echo "== Применяю $f"
  psql_pg -q -f "/$f"
done

echo "== Фронтенд"
if [ -f ../index.html ]; then bash scripts/deploy-web.sh; else echo "   папки приложения рядом нет — потом: sudo bash scripts/deploy-web.sh /путь/к/zharko"; fi

echo "== Запускаю всё остальное (REST, функции, HTTPS)"
docker compose up -d --wait
psql_pg -q -c "notify pgrst, 'reload schema'" >/dev/null

echo "== Ночной бэкап: каждый день в 03:15 по времени сервера, хранится 14 дней"
DIR=$(pwd)
if [ -w /etc/cron.d ]; then
  printf 'SHELL=/bin/bash\n15 3 * * * root cd %s && bash scripts/backup.sh >> %s/backups/backup.log 2>&1\n' "$DIR" "$DIR" > /etc/cron.d/zharko-backup
  chmod 644 /etc/cron.d/zharko-backup
  echo "   включён: /etc/cron.d/zharko-backup"
else
  echo "   нет прав на /etc/cron.d — запусти этот скрипт через sudo, чтобы включить бэкап"
fi

echo
echo "Готово. Проверка: bash scripts/check.sh"
