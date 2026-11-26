#!/usr/bin/env bash
# Жарко: создать .env со случайными паролями и ключами (запускать один раз).
#   bash scripts/gen-secrets.sh
# Пароли генерируются здесь, на сервере, и никуда не отправляются. Файл .env никому не показывай.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f .env ] && ! grep -q 'CHANGE_ME' .env; then
  echo ".env уже заполнен — ничего не меняю. Чтобы начать заново: mv .env .env.old и запусти снова."; exit 0
fi
[ -f .env ] || cp .env.example .env
chmod 600 .env

b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
jwt() { # jwt <role> <secret> — ключ на 10 лет, как в официальном self-host Supabase
  local now exp h p s
  now=$(date +%s); exp=$((now + 10 * 365 * 24 * 3600))
  h=$(printf '%s' '{"alg":"HS256","typ":"JWT"}' | b64url)
  p=$(printf '{"role":"%s","iss":"supabase","iat":%s,"exp":%s}' "$1" "$now" "$exp" | b64url)
  s=$(printf '%s' "$h.$p" | openssl dgst -sha256 -hmac "$2" -binary | b64url)
  printf '%s.%s.%s' "$h" "$p" "$s"
}
set_env() { # set_env KEY VALUE (значения без спецсимволов: hex и base64url)
  if grep -q "^$1=" .env; then sed -i "s|^$1=.*|$1=$2|" .env; else echo "$1=$2" >> .env; fi
}

is_new() { ! grep -q "^$1=." .env || grep -q "^$1=CHANGE_ME" .env; }
# уже сгенерированные секреты не трогаем: база запомнила пароль при первом запуске
if is_new POSTGRES_PASSWORD; then set_env POSTGRES_PASSWORD "$(openssl rand -hex 24)"; fi
if is_new JWT_SECRET; then
  JWT=$(openssl rand -hex 32)
  set_env JWT_SECRET "$JWT"
  set_env ANON_KEY "$(jwt anon "$JWT")"
  set_env SERVICE_ROLE_KEY "$(jwt service_role "$JWT")"
fi

# домен: бесплатный адрес вида 1-2-3-4.sslip.io (указывает на IP сервера) или свой домен
IP=$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}' | head -1 || true)
DEF=""; [ -n "$IP" ] && DEF="${IP//./-}.sslip.io"
if ! is_new DOMAIN; then DEF=$(grep '^DOMAIN=' .env | cut -d= -f2); fi
read -rp "Домен сервера [${DEF:-введи домен}]: " D
D=${D:-$DEF}
[ -n "$D" ] || { echo "Домен обязателен"; exit 1; }
set_env DOMAIN "$D"
set_env SITE_URL "https://$D/"
# CORS: только адрес самого приложения (старое значение * из прежних версий .env тоже заменяем)
if is_new CORS_ORIGIN || grep -q '^CORS_ORIGIN=\*$' .env; then set_env CORS_ORIGIN "https://$D"; fi

echo
echo "Готово: .env заполнен. Домен: https://$D"
echo "Осталось вписать ключи нейросети: nano .env → YANDEX_API_KEY и YANDEX_FOLDER_ID (см. README, шаг 4)."
