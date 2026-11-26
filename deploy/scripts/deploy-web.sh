#!/usr/bin/env bash
# Жарко: выложить фронтенд на сервер (Caddy раздаёт его с того же домена, что и API).
#   sudo bash scripts/deploy-web.sh [папка_приложения] [веб-папка]
# По умолчанию приложение берётся из папки на уровень выше deploy/ (например, /opt/zharko, если загружена вся папка zharko),
# веб-папка — /srv/zharko-web (её же подключает docker-compose.yml, переменная WEB_ROOT в .env).
# Копируются: index.html, manifest.webmanifest, sw.js, css/, js/, icons/, legal/*.html. Шрифты (fonts/) сохраняются,
# при первом запуске скачиваются scripts/fetch_fonts.py. Повторный запуск = обновление приложения.
set -euo pipefail
cd "$(dirname "$0")/.."
DEPLOY=$(pwd)
SRC=$(realpath "${1:-$DEPLOY/..}")
WEB=${2:-$(grep -s '^WEB_ROOT=' .env | cut -d= -f2)}
WEB=${WEB:-/srv/zharko-web}

for f in index.html manifest.webmanifest sw.js css js icons; do
  [ -e "$SRC/$f" ] || { echo "В $SRC нет $f — укажи папку приложения: sudo bash scripts/deploy-web.sh /путь/к/zharko"; exit 1; }
done
grep -q "supabaseUrl: ''" "$SRC/js/lib/config.js" || echo "ВНИМАНИЕ: в js/lib/config.js supabaseUrl не пустой — приложение будет ходить на указанный там адрес"
[ -f "$SRC/css/fonts.css" ] || echo "ВНИМАНИЕ: нет css/fonts.css — шрифты не подключатся"
ls "$SRC"/legal/*.html >/dev/null 2>&1 || echo "ВНИМАНИЕ: нет legal/*.html — запусти на компьютере: python3 tools/legal_html.py"

# собираем во временной папке рядом, потом подменяем содержимое (саму папку не пересоздаём: она смонтирована в Caddy)
STAGE=$(mktemp -d "${WEB%/}.stage.XXXX")
trap 'rm -rf "$STAGE"' EXIT
cp -a "$SRC/index.html" "$SRC/manifest.webmanifest" "$SRC/sw.js" "$SRC/css" "$SRC/js" "$SRC/icons" "$STAGE/"
mkdir -p "$STAGE/legal"; cp -a "$SRC"/legal/*.html "$STAGE/legal/" 2>/dev/null || true
find "$STAGE" -name '*.md' -delete

mkdir -p "$WEB"
find "$WEB" -mindepth 1 -maxdepth 1 ! -name fonts -exec rm -rf {} +
cp -a "$STAGE"/. "$WEB"/
chmod -R a+rX "$WEB"

python3 "$DEPLOY/scripts/fetch_fonts.py" "$WEB/fonts" || true
chmod -R a+rX "$WEB"

echo "Выложено в $WEB: $(find "$WEB" -type f | wc -l) файлов, версия воркера $(grep -o "kuking-[0-9a-f]*" "$WEB/sw.js" | head -1)"
echo "Caddy отдаёт файлы сразу, перезапуск не нужен (если веб-папку подключали впервые: docker compose up -d caddy)."
