#!/usr/bin/env bash
# ScamGraph 발표용 원커맨드 기동.
# 번들 이미지가 있으면 로드(오프라인·재빌드 불필요), 없으면 빌드. 헬스 대기 후 시드 + URL 안내.
set -euo pipefail
cd "$(dirname "$0")/.."

BUNDLE="deploy/scamgraph-images.tar.gz"

echo "▶ ScamGraph 데모 기동..."
if [ -f "$BUNDLE" ]; then
  echo "▶ 번들 이미지 로드(오프라인·재빌드 없음): $BUNDLE"
  gunzip -c "$BUNDLE" | docker load
  docker compose up -d
else
  echo "▶ 번들 없음 → 소스에서 빌드(최초 1회, 인터넷 필요)"
  docker compose up -d --build
fi

echo "▶ 게이트웨이·웹 준비 대기(최대 ~3분)..."
for i in $(seq 1 60); do
  g=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:8080/api/accuracy 2>/dev/null || echo 000)
  w=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/ 2>/dev/null || echo 000)
  if [ "$g" = "200" ] && [ "$w" = "200" ]; then echo "  준비됨 (${i}회 x3s)"; break; fi
  sleep 3
done

echo "▶ Neo4j 관계망 시드..."
docker compose exec -T neo4j cypher-shell -u neo4j -p scamgraph123 -f /seed/seed.cypher >/dev/null 2>&1 \
  && echo "  시드 완료" || echo "  (시드 스킵 — Neo4j 준비 전이거나 이미 시드됨. 피드 자동 수집으로도 그래프가 채워짐)"

cat <<'EOF'

┌───────────────────────────────────────────────┐
│  ✅ ScamGraph 준비 완료                          │
├───────────────────────────────────────────────┤
│  대시보드     http://localhost:3001             │
│  API 문서     http://localhost:8080/docs        │
│  Grafana      http://localhost:3003 (익명 접속) │
│  Prometheus   http://localhost:9090             │
│  Neo4j 브라우저 http://localhost:7474           │
└───────────────────────────────────────────────┘

  킬샷 시연:  대시보드에서 secure-tosspay.info / nаver.com / 070-8890-1234 스캔
  관람객 공개 URL(폰 체험):  make tunnel
  중지:  make down
EOF
