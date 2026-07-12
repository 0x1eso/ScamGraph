#!/usr/bin/env bash
# 포터블 이미지 번들 — compose의 모든 이미지(빌드+풀)를 한 파일로 save.
# 오프라인 발표 머신에 repo + 이 번들만 복사하면 재빌드·인터넷 없이 기동 가능.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "▶ 이미지 빌드(엔진·게이트웨이·웹)..."
docker compose build

echo "▶ compose 이미지 목록 수집..."
IMGS=$(docker compose config --images | sort -u)
echo "$IMGS" | sed 's/^/  /'

OUT="deploy/scamgraph-images.tar"
echo "▶ docker save → ${OUT}(.gz) ... (수 GB, 수 분 소요)"
# shellcheck disable=SC2086
docker save $IMGS -o "$OUT"
gzip -f "$OUT"

SZ=$(ls -lh "${OUT}.gz" | awk '{print $5}')
echo "▶ 완료: ${OUT}.gz (${SZ})"
cat <<EOF

  오프라인 머신에서:
    1) repo 전체 + deploy/scamgraph-images.tar.gz 복사
    2) make demo   (번들을 자동 로드 후 기동 — 재빌드·인터넷 불필요)
EOF
