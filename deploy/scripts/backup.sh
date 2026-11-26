#!/usr/bin/env bash
# Жарко: бэкап базы (пользователи, рецепты, оценки, план, служебные ключи пушей).
#   bash scripts/backup.sh           — вручную; по расписанию его зовёт /etc/cron.d/zharko-backup
# Файлы: backups/zharko-ГГГГ-ММ-ДД_ЧЧММ.dump, старше 14 дней удаляются.
# Скачать к себе на компьютер (команда для ТВОЕГО компьютера):
#   scp root@IP_СЕРВЕРА:/opt/zharko/deploy/backups/zharko-*.dump .
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p backups
NAME="zharko-$(date +%F_%H%M).dump"
# схемы: auth (аккаунты и пароли-хэши), public (данные приложения), kuking_private (ключи пушей, секрет расписания, учёт нейросети)
docker compose exec -T -u root db pg_dump -h localhost -U supabase_admin -d postgres -Fc \
  -n auth -n public -n kuking_private -f "/backups/$NAME"
# проверка, что файл читается
docker compose exec -T -u root db pg_restore -l "/backups/$NAME" > /dev/null
find backups -name 'zharko-*.dump' -mtime +14 -delete
echo "$(date '+%F %T') ok backups/$NAME $(du -h "backups/$NAME" | cut -f1)"
