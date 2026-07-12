#!/usr/bin/env bash
# 명명 터널로 scamgraph.eserlic.cloud 공개(도메인 배포).
# 전제: 최초 1회 Cloudflare 세팅(login → create → route dns) + deploy/cloudflared/config.yml 작성.
set -uo pipefail
cd "$(dirname "$0")/.."

CFG="deploy/cloudflared/config.yml"
if [ ! -f "$CFG" ]; then
  echo "❌ $CFG 없음."
  echo "   1) cloudflared tunnel login"
  echo "   2) cloudflared tunnel create scamgraph"
  echo "   3) cloudflared tunnel route dns scamgraph scamgraph.eserlic.cloud"
  echo "   4) deploy/cloudflared/config.example.yml → config.yml 로 복사 후 TUNNEL_ID/credentials 채우기"
  echo "   5) make serve   (웹 same-origin 모드 기동)"
  exit 1
fi

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "❌ cloudflared 없음. https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/ 참고"
  exit 1
fi

echo "▶ 명명 터널 실행 → https://scamgraph.eserlic.cloud (Ctrl+C 종료)"
exec cloudflared tunnel --config "$CFG" run
