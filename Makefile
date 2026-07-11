.PHONY: up down logs seed clean ps loadtest

up:            ## 전체 플랫폼 빌드 & 실행
	docker compose up --build

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
