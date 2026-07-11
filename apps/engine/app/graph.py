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


def upsert_feed_indicators(indicators: list) -> dict:
    """위협 피드 지표를 Target(+공유 IP) 로 적재 — 같은 IP 를 공유하면 그래프에서 클러스터.

    기존 노드 타입(Target/IP/HOSTED_ON)만 사용하므로 그래프 리더 변경이 필요 없다.
    전화/계좌 등 인프라가 아닌 지표는 그래프에 올리지 않는다(블록리스트에만 저장).
    """
    count = 0
    with driver().session() as session:
        for ind in indicators:
            value = getattr(ind, "value", None)
            kind = getattr(ind, "kind", "domain")
            source = getattr(ind, "source", "feed")
            ip = getattr(ind, "ip", None)
            if not value:
                continue

            if kind == "ip":
                session.run(
                    "MERGE (a:IP {addr: $ip}) SET a.source = $source",
                    ip=value, source=source,
                )
            elif kind in ("url", "domain"):
                session.run(
                    """
                    MERGE (t:Target {value: $value})
                      SET t.kind = 'url', t.risk_score = 85, t.grade = 'danger',
                          t.source = $source, t.last_seen = timestamp()
                    """,
                    value=value, source=source,
                )
                if ip:
                    session.run(
                        """
                        MATCH (t:Target {value: $value})
                        MERGE (a:IP {addr: $ip})
                        MERGE (t)-[:HOSTED_ON]->(a)
                        """,
                        value=value, ip=ip,
                    )
            else:
                continue  # phone/account 등은 그래프 대상 아님
            count += 1
    return {"nodes": count}
