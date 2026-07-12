.PHONY: up down logs seed clean ps loadtest demo bundle load tunnel qr serve tunnel-domain proxy

up:            ## 전체 플랫폼 빌드 & 실행
	docker compose up --build

demo:          ## 발표용 원커맨드 — 빌드/번들로드 → 기동 → 헬스대기 → 시드 → URL 안내
	@bash deploy/demo.sh

bundle:        ## 포터블 이미지 번들 생성(deploy/scamgraph-images.tar.gz) — 오프라인 배포용
	@bash deploy/bundle-images.sh

load:          ## 번들 이미지 로드(오프라인 머신에서 재빌드 없이 기동 준비)
	@gunzip -c deploy/scamgraph-images.tar.gz | docker load

tunnel:        ## 관람객용 임시 공개 URL(cloudflared quick tunnel → localhost:3001)
	@bash deploy/tunnel.sh

serve:         ## 도메인 배포 기동(= up. 웹이 오리진을 런타임 감지해 same-origin 상대경로 사용)
	docker compose up -d --build

tunnel-domain: ## scamgraph.eserlic.cloud 명명 터널 실행(cloudflared, 최초 1회 세팅 필요)
	@bash deploy/tunnel-domain.sh

proxy:         ## 로컬 same-origin 리버스 프록시 검증(Caddy → :8088, /api·/ws=게이트웨이)
	docker run --rm --network host -v "$(PWD)/deploy/Caddyfile:/etc/caddy/Caddyfile" caddy:2

qr:            ## URL → QR 코드 (사용: make qr URL=https://...)
	@bash deploy/qr.sh "$(URL)"

down:          ## 중지
	docker compose down

logs:          ## 로그 팔로우
	docker compose logs -f

ps:            ## 상태 확인
	docker compose ps

seed:          ## Neo4j 시드 데이터 주입
	docker compose exec -T neo4j cypher-shell -u neo4j -p scamgraph123 -f /seed/seed.cypher

clean:         ## 볼륨까지 삭제
	docker compose down -v

loadtest:      ## 게이트웨이 부하 테스트 (k6/Docker · 스택 기동 필요)
	docker run --rm -i --network host -e BASE_URL=http://localhost:8080 grafana/k6 run - < loadtest/scan-load.js
