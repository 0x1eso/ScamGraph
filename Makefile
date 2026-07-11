.PHONY: up down logs seed clean ps

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
