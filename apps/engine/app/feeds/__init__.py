"""위협 인텔리전스 수집(TIP) 패키지.

공개 위협 피드(OpenPhish·URLhaus·ThreatFox·경찰청)를 주기적으로 당겨
정규화 → Postgres 블록리스트 + Neo4j 관계망에 적재한다.

원칙: 네트워크·API 키가 없어도 각 소스는 시드 표본으로 폴백한다(데모 세이프).
"""
