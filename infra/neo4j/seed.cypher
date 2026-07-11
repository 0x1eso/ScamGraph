// ScamGraph 시드 데이터 — 데모용 사기 인프라 관계망
// 실행: make seed  (또는 Neo4j 브라우저에서 붙여넣기)

// 초기화 (데모 재실행 대비)
MATCH (n) DETACH DELETE n;

// --- 사기 캠페인: 택배 사칭 스미싱 조직 A ---
CREATE (c1:Campaign {name: "택배사칭-A", type: "smishing"})
CREATE (d1:Target {value: "cj-delivery-check.top", kind: "url", grade: "danger", risk_score: 92})
CREATE (d2:Target {value: "cj-delivery-track.xyz", kind: "url", grade: "danger", risk_score: 88})
CREATE (h1:Host {name: "cj-delivery-check.top"})
CREATE (h2:Host {name: "cj-delivery-track.xyz"})
CREATE (ip1:IP {addr: "203.0.113.44"})
CREATE (p1:Phone {number: "070-4123-9981", carrier: "voip"})
CREATE (a1:Account {number: "352-9981-2210-11", bank: "농협"})
CREATE (c1)-[:USES]->(d1)
CREATE (c1)-[:USES]->(d2)
CREATE (d1)-[:RESOLVES_TO]->(h1)
CREATE (d2)-[:RESOLVES_TO]->(h2)
CREATE (h1)-[:HOSTED_ON]->(ip1)
CREATE (h2)-[:HOSTED_ON]->(ip1)          // 같은 서버 = 동일 조직 단서
CREATE (c1)-[:CONTACT]->(p1)
CREATE (c1)-[:PAYOUT]->(a1)

// --- 사기 캠페인: 은행 피싱 조직 B (조직 A와 IP 공유로 연결) ---
CREATE (c2:Campaign {name: "은행피싱-B", type: "phishing"})
CREATE (d3:Target {value: "kbstat-secure.click", kind: "url", grade: "danger", risk_score: 95})
CREATE (d4:Target {value: "shinhan-otp.xyz", kind: "url", grade: "danger", risk_score: 90})
CREATE (h3:Host {name: "kbstat-secure.click"})
CREATE (h4:Host {name: "shinhan-otp.xyz"})
CREATE (p2:Phone {number: "070-8842-1120", carrier: "voip"})
CREATE (a2:Account {number: "110-441-882201", bank: "신한"})
CREATE (c2)-[:USES]->(d3)
CREATE (c2)-[:USES]->(d4)
CREATE (d3)-[:RESOLVES_TO]->(h3)
CREATE (d4)-[:RESOLVES_TO]->(h4)
CREATE (h3)-[:HOSTED_ON]->(ip1)          // 조직 A와 동일 IP → 연결 발견!
CREATE (h4)-[:HOSTED_ON]->(ip1)
CREATE (c2)-[:CONTACT]->(p2)
CREATE (c2)-[:PAYOUT]->(a2)

// --- 시민 신고 (커뮤니티 검증) ---
CREATE (r1:Report {source: "citizen", note: "택배 문자 클릭 유도", ts: timestamp()})
CREATE (r2:Report {source: "citizen", note: "OTP 입력 요구", ts: timestamp()})
CREATE (r1)-[:REPORTS]->(d1)
CREATE (r2)-[:REPORTS]->(d3)

RETURN "seed complete" AS status;
