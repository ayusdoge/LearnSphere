#!/bin/zsh
set -u

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_URL="http://127.0.0.1:8000/ui/"
HEALTH_URL="http://127.0.0.1:8000/health"
OLLAMA_TAGS_URL="http://127.0.0.1:11434/api/tags"

if ! curl --silent --fail --max-time 3 "$OLLAMA_TAGS_URL" >/dev/null 2>&1; then
  echo "Ollama is not running. Open Ollama, wait for it to start, then double-click this file again."
  read -r "?Press Return to close this window. "
  exit 1
fi

if AUTH_STATUS="$(curl --silent --fail --max-time 3 "http://127.0.0.1:8000/auth/status" 2>/dev/null)"; then
  if print -r -- "$AUTH_STATUS" | tr -d ' ' | grep -q '"required":true'; then
    echo "A password-protected LearnSphere server is already running. Use its HTTPS demo address instead of opening the local page."
    read -r "?Press Return to close this window. "
    exit 0
  fi
fi

if curl --silent --fail --max-time 3 "$HEALTH_URL" >/dev/null 2>&1; then
  echo "LearnSphere is already running. Opening the study page."
  open "$APP_URL"
  exit 0
fi

cd "$PROJECT_DIR/backend" || exit 1
echo "Starting LearnSphere. Keep this Terminal window open while you use the app."
"$PROJECT_DIR/.venv/bin/uvicorn" main:app --host 127.0.0.1 --port 8000 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT INT TERM

for attempt in {1..30}; do
  if curl --silent --fail --max-time 2 "$HEALTH_URL" >/dev/null 2>&1; then
    echo "LearnSphere is ready. Opening the study page."
    open "$APP_URL"
    wait "$SERVER_PID"
    exit $?
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    wait "$SERVER_PID"
    exit $?
  fi
  sleep 1
done

echo "LearnSphere did not become ready. Check the messages above."
wait "$SERVER_PID"
