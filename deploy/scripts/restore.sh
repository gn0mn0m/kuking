#!/usr/bin/env bash
# Жарко: восстановить данные из бэкапа (scripts/backup.sh) — например, на новом сервере после init-db.sh.
#   bash scripts/restore.sh backups/zharko-2026-12-01_0315.dump
# ВНИМАНИЕ: текущие данные на сервере заменяются данными из файла.
set -euo pipefail
cd "$(dirname "$0")/.."
F=${1:-}
[ -n "$F" ] && [ -f "$F" ] || { echo "Укажи файл: bash scripts/restore.sh backups/zharko-....dump"; ls -1 backups/*.dump 2>/dev/null | tail -5; exit 1; }
case "$(realpath "$F")" in "$(pwd)/backups/"*) ;; *) echo "Положи файл в папку backups/ и укажи путь оттуда"; exit 1;; esac
read -rp "Заменить ВСЕ данные на сервере данными из $F? Напиши yes: " OK
[ "$OK" = yes ] || { echo "Отменено"; exit 1; }

IN="/backups/$(basename "$F")"
admin() { docker compose exec -T -u root db psql -h localhost -U supabase_admin -d postgres -v ON_ERROR_STOP=1 "$@"; }
restore() { docker compose exec -T -u root db pg_restore -h localhost -U supabase_admin -d postgres --data-only --no-owner --disable-triggers --single-transaction --exit-on-error "$@" "$IN"; }

echo "== Подстраховка: бэкап текущего состояния"
bash scripts/backup.sh

echo "== Очищаю данные"
admin -q <<'SQL'
begin;
do $$ declare r record; begin
  for r in select schemaname, tablename from pg_tables where schemaname in ('public', 'kuking_private') loop
    execute format('truncate %I.%I cascade', r.schemaname, r.tablename);
  end loop;
end $$;
delete from auth.identities;
delete from auth.users;
commit;
SQL

echo "== Аккаунты"
restore -n auth -t users -t identities
echo "== Данные приложения"
restore -n public -n kuking_private

admin -q -c "notify pgrst, 'reload schema'" >/dev/null
admin -Atc "select 'аккаунтов: ' || (select count(*) from auth.users) || ', записей docs: ' || (select count(*) from public.docs)"
echo "Готово."
