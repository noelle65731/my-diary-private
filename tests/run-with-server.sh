#!/bin/sh
# 로컬 미리보기 서버를 띄우고 같은 셸 안에서 테스트를 돌립니다.
#   NEXT_DIST_DIR=.next-a37 tests/run-with-server.sh tests/a37-sheet-hold-touch.py
# 이미 빌드된 .next(또는 NEXT_DIST_DIR)가 있어야 합니다.
set -e
cd "$(dirname "$0")/.."
if [ -d /workspace/.tools/node20/bin ]; then
  PATH="/workspace/.tools/node20/bin:$PATH"
  export PATH
fi
PORT="${PORT:-3219}"
LOG="${TMPDIR:-/tmp}/diary-next-$PORT.log"
node node_modules/next/dist/bin/next start -p "$PORT" > "$LOG" 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null || true' EXIT
i=0
code=""
while [ $i -lt 60 ]; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$PORT/" || true)
  [ "$code" = "200" ] && break
  i=$((i + 1))
  sleep 1
done
echo "server: $code (port $PORT)"
BASE="http://127.0.0.1:$PORT" python3 "$@"
