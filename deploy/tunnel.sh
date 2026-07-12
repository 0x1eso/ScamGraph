#!/usr/bin/env bash
# 관람객용 공개 URL — cloudflared quick tunnel(계정 불필요)로 localhost:3001 을 공개 https 로 노출.
# URL 이 뜨면 관람객이 폰으로 접속. 다른 터미널에서 `make qr URL=<그 URL>` 로 QR 생성.
set -uo pipefail
cd "$(dirname "$0")/.."

TARGET="http://localhost:3001"
echo "▶ 공개 터널 생성 → ${TARGET}"
echo "  * 'https://<...>.trycloudflare.com' URL 이 출력되면 관람객이 폰으로 접속 가능."
echo "  * QR:  다른 터미널에서  make qr URL=<출력된 URL>"
echo "  * 종료: Ctrl+C"
echo

if command -v cloudflared >/dev/null 2>&1; then
  exec cloudflared tunnel --url "$TARGET"
else
  echo "  (로컬 cloudflared 없음 → docker 이미지 사용)"
  exec docker run --rm --network host cloudflare/cloudflared:latest tunnel --url "$TARGET"
fi
