#!/usr/bin/env bash
# Жарко: проверка, что сервер живой.
#   bash scripts/check.sh            — без затрат (HTTPS, вход, REST, пуши, расписание)
#   bash scripts/check.sh ai         — ещё и нейросеть: строгий вызов (≈1 копейка) и одно фото (≈2 ₽);
#                                      спросит почту и пароль любого аккаунта «Жарко»
set -uo pipefail
cd "$(dirname "$0")/.."
D=$(grep '^DOMAIN=' .env | cut -d= -f2); K=$(grep '^ANON_KEY=' .env | cut -d= -f2)
U="https://$D"; ok=0; bad=0
pass() { echo "  ok   $1"; ok=$((ok+1)); }
fail() { echo "  FAIL $1"; bad=$((bad+1)); }
code() { curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$@"; }

echo "== Контейнеры"; docker compose ps --format '  {{.Service}}: {{.Status}}'
echo "== API по адресу $U"
[ "$(code "$U/auth/v1/health")" != 000 ] && pass "HTTPS-сертификат и Caddy" || fail "HTTPS: сайт не открывается (DNS, порты 80/443, лог: docker compose logs caddy)"
[ "$(code "$U/")" = 200 ] && pass "фронтенд (index.html)" || fail "фронтенд не отдаётся: sudo bash scripts/deploy-web.sh"
[ "$(code "$U/legal/privacy.html")" = 200 ] && pass "политика конфиденциальности (legal/privacy.html)" || fail "нет legal/privacy.html: python3 tools/legal_html.py и deploy-web.sh"
[ "$(code "$U/fonts/golos-text-cyrillic.woff2")" = 200 ] && pass "шрифты со своего сервера" || fail "шрифтов нет: sudo python3 scripts/fetch_fonts.py"
curl -s --max-time 20 "$U/" | grep -qE 'googleapis|gstatic' && fail "в index.html остались Google Fonts" || pass "в index.html нет внешних шрифтов"
[ "$(code "$U/auth/v1/health")" = 200 ] && pass "вход (/auth/v1)" || fail "вход: docker compose logs auth"
c=$(code -H "apikey: $K" "$U/rest/v1/profiles?select=id&limit=1"); [ "$c" = 200 ] || [ "$c" = 401 ] && pass "REST (/rest/v1) — ответ $c" || fail "REST ответил $c: docker compose logs rest"
c=$(code -X OPTIONS -H "Origin: $U" -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: apikey,content-type' "$U/auth/v1/token"); [ "$c" = 204 ] && pass "CORS: preflight" || fail "CORS ответил $c"
ao=$(curl -s -o /dev/null -D - --max-time 20 -X OPTIONS -H "Origin: $U" -H 'Access-Control-Request-Method: POST' "$U/rest/v1/docs" | tr -d '\r' | awk -F': ' 'tolower($1)=="access-control-allow-origin"{print $2}')
[ "$ao" = "$U" ] && pass "CORS разрешён только приложению ($ao)" || fail "CORS: Access-Control-Allow-Origin = '${ao:-нет}', ожидалось $U (CORS_ORIGIN в .env)"
curl -s --max-time 30 -X POST "$U/functions/v1/birthday-push" -d '{"action":"init"}' | grep -q publicKey && pass "функция birthday-push (ключ пушей)" || fail "birthday-push: docker compose logs functions"
n=$(docker compose exec -T -u root db psql -h localhost -U supabase_admin -d postgres -Atc "select count(*) from cron.job where jobname = 'kuking-tasks'" 2>/dev/null)
[ "$n" = 1 ] && pass "расписание pg_cron (напоминания плана)" || fail "расписание: задач $n из 1 — bash scripts/init-db.sh"
last=$(docker compose exec -T -u root db psql -h localhost -U supabase_admin -d postgres -Atc "select status_code from net._http_response order by created desc limit 1" 2>/dev/null)
[ -z "$last" ] && echo "  …    напоминания ещё не запускались (подожди 10 минут)" || { [ "$last" = 200 ] && pass "последний запуск напоминаний: 200" || fail "последний запуск напоминаний: $last"; }
ls backups/zharko-*.dump >/dev/null 2>&1 && pass "бэкапы есть: $(ls -1 backups/zharko-*.dump | wc -l) шт." || echo "  …    бэкапов ещё нет (первый — сегодня в 03:15, или вручную: bash scripts/backup.sh)"

if [ "${1:-}" = ai ]; then
  echo "== Нейросеть"
  read -rp "  почта аккаунта: " E; read -rsp "  пароль: " P; echo
  T=$(curl -s --max-time 20 -X POST "$U/auth/v1/token?grant_type=password" -H "apikey: $K" -H 'Content-Type: application/json' \
    --data-binary @- < <(E="$E" P="$P" python3 -c 'import os,json; print(json.dumps({"email":os.environ["E"],"password":os.environ["P"]}))') | python3 -c 'import sys,json; print(json.load(sys.stdin).get("access_token",""))' 2>/dev/null)
  unset P
  [ -n "$T" ] && pass "вход по паролю" || { fail "вход не удался"; exit 1; }
  R=$(curl -s --max-time 200 -X POST "$U/functions/v1/ai" -H "Authorization: Bearer $T" -H 'Content-Type: application/json' \
    -d '{"action":"fn","messages":[{"role":"system","content":"Ты повар."},{"role":"user","content":"Придумай название блюда из курицы и риса и время готовки."}],"fn":{"name":"bludo","description":"Блюдо","parameters":{"type":"object","properties":{"nazvanie":{"type":"string"},"minut":{"type":"integer"}},"required":["nazvanie","minut"]}}}')
  echo "$R" | grep -q '"args"' && pass "строгий вызов: $R" || fail "строгий вызов: $R"
  R=$(curl -s --max-time 200 -X POST "$U/functions/v1/ai" -H "Authorization: Bearer $T" -H 'Content-Type: application/json' -d '{"action":"image","prompt":"Плов в казане"}')
  echo "$R" | grep -q '"image":"data:image' && pass "фото: $(echo "$R" | wc -c) байт" || fail "фото: ${R:0:300}"
  curl -sN --max-time 120 -X POST "$U/functions/v1/ai" -H "Authorization: Bearer $T" -H 'Content-Type: application/json' \
    -d '{"messages":[{"role":"user","content":"Ответь одним словом: готов"}],"max_tokens":50}' | grep -q '"content"' && pass "чат (поток)" || fail "чат (поток)"
fi
echo "== Итого: ok $ok, ошибок $bad"
