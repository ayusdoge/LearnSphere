#!/bin/zsh
set -u

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
OLLAMA_TAGS_URL="http://127.0.0.1:11434/api/tags"
AUTH_STATUS_URL="http://127.0.0.1:8000/auth/status"

if ! curl --silent --fail --max-time 3 "$OLLAMA_TAGS_URL" >/dev/null 2>&1; then
  echo "Ollama is not running. Open Ollama, wait for it to start, then run this file again."
  read -r "?Press Return to close this window. "
  exit 1
fi

if curl --silent --output /dev/null --max-time 2 "http://127.0.0.1:8000/" 2>/dev/null; then
  AUTH_STATUS="$(curl --silent --max-time 2 "$AUTH_STATUS_URL" 2>/dev/null || true)"
  if print -r -- "$AUTH_STATUS" | tr -d ' ' | grep -q '"required":true'; then
    echo "A password-protected LearnSphere server is already running on port 8000."
  else
    echo "LearnSphere is already running without a password. Stop that server before starting public mode."
  fi
  read -r "?Press Return to close this window. "
  exit 1
fi

read -r -s "ACCESS_PASSWORD?Create a public access password (at least 12 characters): "
echo
if (( ${#ACCESS_PASSWORD} < 12 || ${#ACCESS_PASSWORD} > 256 )); then
  echo "The password must be between 12 and 256 characters. Run this file again to retry."
  read -r "?Press Return to close this window. "
  exit 1
fi

export LearnSphere_ACCESS_PASSWORD="$ACCESS_PASSWORD"
export LearnSphere_COOKIE_SECURE=true
unset ACCESS_PASSWORD

cd "$PROJECT_DIR/backend" || exit 1
echo "Starting password-protected LearnSphere on this Mac only."
echo "Keep this window open. Put an HTTPS access tunnel in front of 127.0.0.1:8000 before sharing it."
exec "$PROJECT_DIR/.venv/bin/uvicorn" main:app --host 127.0.0.1 --port 8000
