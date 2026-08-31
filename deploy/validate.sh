#!/usr/bin/env bash
# Lightweight smoke check after deploy
set -euo pipefail

BASE=""
INSECURE=0

usage() {
  echo "Usage: $0 --base http://host[:port]|https://host[:port] [--insecure]"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base) BASE="${2:-}"; shift 2 ;;
    --insecure) INSECURE=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown: $1" >&2; usage; exit 1 ;;
  esac
done

[[ -n "${BASE}" ]] || { usage; exit 1; }

opts=(-fsS -o /dev/null -w "%{http_code}")
if [[ "${INSECURE}" -eq 1 ]]; then
  opts+=(-k)
fi

code="$(curl "${opts[@]}" "${BASE%/}/" || echo "000")"
echo "GET ${BASE%/}/ → HTTP ${code}"
[[ "${code}" == "200" || "${code}" == "301" || "${code}" == "302" ]]
