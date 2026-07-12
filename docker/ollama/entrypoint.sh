#!/bin/sh
set -eu

ollama serve &
pid=$!
trap 'kill "$pid" 2>/dev/null; exit 0' TERM INT

i=0
while ! ollama list >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -gt 180 ]; then
    echo "docp-ollama: ollama did not become ready in time" >&2
    exit 1
  fi
  sleep 1
done

if [ "${OLLAMA_SKIP_PULL:-0}" != "1" ] && [ -n "${OLLAMA_MODELS:-}" ]; then
  echo "$OLLAMA_MODELS" | tr ',' '\n' | while IFS= read -r m; do
    m=$(echo "$m" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
    [ -z "$m" ] && continue
    echo "docp-ollama: pulling $m"
    ollama pull "$m" || echo "docp-ollama: warning — pull failed for $m" >&2
  done
fi

wait "$pid"
