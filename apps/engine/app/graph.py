"""Neo4j 그래프 적재 — 스캔 결과를 관계망으로 저장.

인프라 pivot(호스트·IP·등록자·인증서)을 노드로 적재해, 서로 다른 도메인이
같은 IP/등록자/인증서를 공유하면 그래프상에서 하나의 조직으로 연결된다(귀속).
"""
from __future__ import annotations

import os

_driver = None


def driver():
    global _driver
    if _driver is None:
        from neo4j import GraphDatabase
        _driver = GraphDatabase.driver(
            os.getenv("NEO4J_URI", "bolt://localhost:7687"),
            auth=(
                os.getenv("NEO4J_USER", "neo4j"),
                os.getenv("NEO4J_PASSWORD", "scamgraph123"),
            ),
        )
    return _driver


def upsert_scan(result: dict) -> None:
    """대상 노드 + 연결된 인프라(호스트/IP/등록자/인증서)를 MERGE."""
    target = result.get("target", "")
    kind = result.get("kind", "url")
    score = result.get("risk_score", 0)
    grade = result.get("grade", "safe")
    enrich = result.get("enrichment", {})

    with driver().session() as session:
        session.run(
            """
            MERGE (t:Target {value: $target})
              SET t.kind = $kind, t.risk_score = $score, t.grade = $grade,
                  t.last_seen = timestamp()
            """,
            target=target, kind=kind, score=score, grade=grade,
        )

        host = enrich.get("host")
        if host:
            session.run(
                """
                MATCH (t:Target {value: $target})
                MERGE (h:Host {name: $host})
                MERGE (t)-[:RESOLVES_TO]->(h)
                """,
                target=target, host=host,
            )

        for ip in enrich.get("ips", []) or []:
            session.run(
                """
                MATCH (t:Target {value: $target})
                MERGE (a:IP {addr: $ip})
                MERGE (t)-[:HOSTED_ON]->(a)
                """,
                target=target, ip=ip,
            )

        # 등록자(WHOIS) — 같은 등록자를 공유하면 동일 조직 단서
        registrant = enrich.get("registrant")
        if registrant:
            session.run(
                """
                MATCH (t:Target {value: $target})
                MERGE (r:Registrant {name: $registrant})
                MERGE (t)-[:REGISTERED_BY]->(r)
                """,
                target=target, registrant=registrant,
            )

        # TLS 인증서 지문 — 같은 인증서를 공유하면 동일 인프라 단서
        fingerprint = (enrich.get("tls") or {}).get("fingerprint")
        if fingerprint:
            session.run(
                """
                MATCH (t:Target {value: $target})
                MERGE (c:Cert {fingerprint: $fp})
                MERGE (t)-[:USES_CERT]->(c)
                """,
                target=target, fp=fingerprint,
            )
