#!/usr/bin/env bash
# Жарко: подготовка чистого сервера Ubuntu 24.04 (запускать один раз, от root).
#   sudo bash scripts/server-setup.sh
# Ставит Docker и Compose из репозитория Ubuntu, включает файрвол (22, 80, 443), делает файл подкачки 2 ГБ,
# чтобы на сервере с 2 ГБ памяти ничего не падало при пиках.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Запусти через sudo"; exit 1; }

echo "== Пакеты"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y docker.io docker-compose-v2 ufw cron openssl curl ca-certificates
systemctl enable --now docker cron

# Docker Hub из РФ иногда не отдаёт образы. Если `docker compose pull` падает с 403/timeout —
# запусти так: DOCKER_MIRROR=https://dockerhub.timeweb.cloud sudo -E bash scripts/server-setup.sh
if [ -n "${DOCKER_MIRROR:-}" ]; then
  echo "== Зеркало Docker Hub: $DOCKER_MIRROR"
  mkdir -p /etc/docker
  printf '{\n  "registry-mirrors": ["%s"]\n}\n' "$DOCKER_MIRROR" > /etc/docker/daemon.json
  systemctl restart docker
fi

echo "== Подкачка 2 ГБ"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl -w vm.swappiness=10 >/dev/null && echo 'vm.swappiness=10' > /etc/sysctl.d/99-zharko.conf
fi

echo "== Файрвол: открыты только SSH, 80 и 443"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

docker --version
docker compose version
echo "Готово. Дальше: bash scripts/gen-secrets.sh"
