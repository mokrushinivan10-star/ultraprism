#!/usr/bin/env bash
# Поднимает интерфейс UltraPrism на порту 43123 и ждёт, пока он ответит.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
LOG="${HOME}/ultraprism-dev.log"
export PATH="${HOME}/.local/bin:/usr/local/bin:/usr/bin:${PATH:-}"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js не найден. Установите Node.js 22 и повторите запуск." >&2
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "Первая установка зависимостей..."
  npm install
fi

if curl -sf -o /dev/null --max-time 2 http://127.0.0.1:43123; then
  exit 0
fi

if [[ -f .next/BUILD_ID ]]; then
  nohup npm run start >>"${LOG}" 2>&1 &
else
  nohup npm run dev >>"${LOG}" 2>&1 &
fi

for _ in $(seq 1 60); do
  if curl -sf -o /dev/null --max-time 2 http://127.0.0.1:43123; then
    exit 0
  fi
  sleep 1
done

echo "Сервер не ответил за минуту. Лог: ${LOG}" >&2
exit 1
