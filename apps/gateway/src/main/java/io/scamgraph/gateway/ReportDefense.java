package io.scamgraph.gateway;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Set;

/**
 * 신고 플라이휠 poisoning(대량 허위신고) 방어 헬퍼.
 *
 * <p>위협: 한 행위자가 무고한 도메인/번호/계좌를 대량 신고로 danger 승격시켜 업무방해·괴롭힘.
 * 오염 표면은 {@code CheckController} 가 {@code SELECT COUNT(*) FROM reports} 로 커뮤니티
 * 신고 수를 읽어 등급을 올리는 지점이다. 따라서 {@code reports} 테이블에는 <b>dedup 을 통과한
 * 독립 신고자의 첫 기여</b>만 쌓이도록 접수 단계에서 게이팅한다 → 원시 행수가 곧 독립 신고자 수가
 * 되어 "한 명이 아무리 반복해도 1" 이 성립한다.
 *
 * <p>방어 계층 (docs/abuse-defense.md §1~§3, roadmap §7.3):
 * <ol>
 *   <li><b>신고자 익명 해시</b> — 요청 헤더(X-Forwarded-First-IP / X-Client-Id / X-Forwarded-For /
 *       remoteAddr)에서 식별자를 뽑아 pepper 를 섞어 SHA-256. <b>원시 IP 는 저장하지 않는다.</b></li>
 *   <li><b>Dedup</b> — 동일 신고자·동일 대상은 전 기간 1회만 집계(시간 무관, 요구된 1h 창보다 강함).</li>
 *   <li><b>Rate limit(burst)</b> — 한 신고자가 {@value #DEDUP_WINDOW_SECONDS}초 창 안에서 만들 수 있는
 *       독립 신고 상한 {@value #BURST_MAX_PER_WINDOW}. 초과 시 throttle.</li>
 *   <li><b>독립 신고자 카운트</b> — 등급 승격을 좌우하는 수는 {@code COUNT(DISTINCT reporter_hash)}.</li>
 *   <li><b>Allowlist 가드</b> — 알려진 정상 도메인(엔진 화이트리스트와 동일 집합) 신고는 접수·기록은
 *       하되 status='review' 로 검토 큐에만 두고 <b>자동 승격하지 않는다</b>(정상 사업자 보호, §3.2).</li>
 * </ol>
 *
 * <p><b>승격 정책</b>(§3.1): ① 신고 1건 = 저장만 / ② 독립 다수(≥{@value #MULTI_REPORT_THRESHOLD})
 * = "다수 신고" 신호 / ③~⑤ 위험후보·확인·전체 blocklist 는 <b>강한 기술신호</b>(feed/homoglyph 등) 결합과
 * <b>운영자 dual-approval</b> 이 있어야 하며 신고 접수 경로에서 자동 승격하지 않는다
 * ({@link #blockEscalationEligible} 훅 참조).
 *
 * <p>데모 세이프: 모든 DB 접근은 try/catch 로 감싸고, DB 미가동 시 happy-path 를 막지 않는 폴백을 낸다.
 */
@Component
public class ReportDefense {

    // === 정책 상수 (docs/abuse-defense.md §1~§3, roadmap §7.3) ===
    /** dedup/burst 판정 시간창(초). 요구사항의 1h. */
    static final int DEDUP_WINDOW_SECONDS = 3600;
    /** 한 신고자가 시간창 안에서 만들 수 있는 독립 신고 상한(초과 시 throttle). */
    static final int BURST_MAX_PER_WINDOW = 20;
    /** 이 수 이상의 독립 신고자 → "다수 신고" 신호(② 승격). */
    static final int MULTI_REPORT_THRESHOLD = 3;
    /** ⑤ 전체 blocklist 승격 후보의 최소 독립 신고 수(실반영은 dual-approval 별도). */
    static final int BLOCK_MIN_INDEPENDENT = 3;

    /** 신고자 해시 pepper — 원시 IP 를 저장/역산 불가하게. 운영 시 env 로 교체. */
    private static final String HASH_PEPPER = envOr("REPORT_HASH_SALT", "scamgraph-report-pepper-v1");

    /**
     * 정상 도메인 allowlist — 엔진(app/crawler.py ALLOWLIST)과 동일 집합을 게이트웨이에도 둔다.
     * 데모 세이프: 접수 경로에서 네트워크(엔진) 호출 없이 즉시 판별. 하위 도메인 포함.
     */
    private static final Set<String> ALLOWLIST = Set.of(
            "naver.com", "naver.me", "navercorp.com", "kakao.com", "kakaocorp.com",
            "daum.net", "google.com", "youtube.com", "gmail.com", "apple.com",
            "microsoft.com", "samsung.com", "coupang.com", "toss.im", "tossbank.com",
            "kbstar.com", "kbfg.com", "shinhan.com", "shinhancard.com", "wooribank.com",
            "nonghyup.com", "nhbank.com", "ibk.co.kr", "hanabank.com", "kebhana.com",
            "kakaobank.com", "gov.kr", "korea.kr", "go.kr", "police.go.kr", "fss.or.kr",
            "kisa.or.kr", "11st.co.kr", "gmarket.co.kr", "baemin.com");

    private final JdbcTemplate jdbc;
    private volatile boolean schemaReady = false;

    public ReportDefense(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * 접수 판정 결과.
     *
     * @param reporterHash      신고자 익명 해시(로깅/디버그용, 원시 IP 아님)
     * @param escalateToGraph   reports 테이블 + Neo4j 에 반영할지(=새 독립 신고자 & 비-allowlist)
     * @param allowlisted       정상 도메인 신고인지(검토 큐로만)
     * @param status            reported | review | duplicate | throttled
     * @param independentCount  독립 신고자 수 = COUNT(DISTINCT reporter_hash)
     * @param escalation        stored | multi_report | review_queue
     * @param signal            "다수 신고" 또는 null
     */
    public record Verdict(String reporterHash, boolean escalateToGraph, boolean allowlisted,
                          String status, long independentCount, String escalation, String signal) {}

    /**
     * 요청에서 신고자 익명 해시를 도출한다. <b>원시 IP/식별자는 저장하지 않는다</b> — pepper 를 섞어
     * SHA-256 한 값만 반환하며 원본 문자열은 이 메서드를 벗어나지 않는다.
     */
    public String reporterHash(HttpServletRequest req) {
        String source = "anon";
        if (req != null) {
            source = firstNonBlank(
                    req.getHeader("X-Forwarded-First-IP"),
                    req.getHeader("X-Client-Id"),
                    firstForwardedFor(req.getHeader("X-Forwarded-For")),
                    req.getRemoteAddr(),
                    "anon");
        }
        return sha256(HASH_PEPPER + "|" + source);
    }

    /**
     * 신고를 평가한다: dedup → burst → allowlist 순으로 판정하고, 새 독립 기여만 report_events 에 기록한다.
     * 판정에 영향을 주는 reports/Neo4j 반영 여부({@code escalateToGraph})는 호출자가 이 결과로 결정한다.
     * DB 미가동 시 happy-path 를 막지 않는 폴백을 낸다(데모 세이프).
     */
    public Verdict evaluate(String target, String reporterHash) {
        boolean allowlisted = isAllowlisted(target);
        try {
            ensureSchema();
            boolean firstEver = !existsEver(target, reporterHash);   // 이 대상에 처음 기여하는 신고자?
            boolean throttled = burstCount(reporterHash) >= BURST_MAX_PER_WINDOW;

            // 새 독립 기여만 기록 → report_events 1행 = (대상, 독립 신고자) 1쌍.
            boolean record = firstEver && !throttled;
            if (record) {
                jdbc.update("INSERT INTO report_events (target, reporter_hash) VALUES (?, ?)",
                        target, reporterHash);
            }

            // allowlist 는 자동 승격 금지 → reports/Neo4j 반영 대상에서 제외(검토 큐로만).
            boolean escalate = record && !allowlisted;
            long independent = independentCount(target);

            String status = throttled ? "throttled"
                    : !firstEver ? "duplicate"
                    : allowlisted ? "review"
                    : "reported";
            String signal = (!allowlisted && independent >= MULTI_REPORT_THRESHOLD) ? "다수 신고" : null;

            return new Verdict(reporterHash, escalate, allowlisted, status, independent,
                    escalationStage(independent, allowlisted), signal);
        } catch (Exception e) {
            // DB 미가동 → 방어 계층 비활성, 그러나 happy-path/데모 킬샷은 유지.
            // 정상 도메인만은 이 경우에도 자동 승격하지 않는다.
            return new Verdict(reporterHash, !allowlisted, allowlisted,
                    allowlisted ? "review" : "reported", 1,
                    escalationStage(1, allowlisted), null);
        }
    }

    /** 독립 신고자 수 = COUNT(DISTINCT reporter_hash). 등급 승격을 좌우하는 수(원시 행수 아님). */
    public long independentCount(String target) {
        try {
            Long n = jdbc.queryForObject(
                    "SELECT COUNT(DISTINCT reporter_hash) FROM report_events WHERE target = ?",
                    Long.class, target);
            return n == null ? 0 : n;
        } catch (Exception e) {
            return 0;
        }
    }

    /** 정상 도메인(또는 그 하위 도메인) 신고인지 — 오탐/경쟁사 공격 방어. */
    public boolean isAllowlisted(String target) {
        String host = HostUtil.hostOf(target);
        if (host.isEmpty()) {
            return false;
        }
        for (String d : ALLOWLIST) {
            if (host.equals(d) || host.endsWith("." + d)) {
                return true;
            }
        }
        return false;
    }

    /** 현재 독립 신고 수에 따른 승격 단계 라벨(§3.1). */
    public String escalationStage(long independentCount, boolean allowlisted) {
        if (allowlisted) {
            return "review_queue";                       // §3.2: allowlist → 검토 큐, 자동 승격 금지
        }
        if (independentCount >= MULTI_REPORT_THRESHOLD) {
            return "multi_report";                       // ② 다수 신고 표시
        }
        return "stored";                                 // ① 저장만
        // ③ 위험후보 / ④ 확인된 위협 / ⑤ 전체 blocklist 는 강한 기술신호·검증출처·운영자
        //   dual-approval 이 있어야 한다(§3.1) → 신고 접수 경로에서 자동 승격하지 않는다.
    }

    /**
     * ⑤ 전체 blocklist 승격 자격 판정 — <b>훅</b>. 정책(§3.1 ⑤): 독립 신고 다수 AND 강한 기술신호
     * (feed 근접·homoglyph·form 신호 등) 결합 시에만 후보가 된다. 실제 blocklist 반영은 운영자
     * dual-approval(§3.2)이 필수이므로, 신고 접수 경로에서는 이 자격이 충족돼도 자동 승격하지 않는다.
     *
     * @param independentCount      독립 신고자 수
     * @param strongTechnicalSignal 엔진/그래프에서 온 강한 기술신호 존재 여부(모더레이션 흐름이 공급)
     */
    public boolean blockEscalationEligible(long independentCount, boolean strongTechnicalSignal) {
        return independentCount >= BLOCK_MIN_INDEPENDENT && strongTechnicalSignal;
    }

    // === 내부 헬퍼 ===

    /** report_events 스키마를 방어적으로 보장(init.sql 과 동일). 최초 1회만 실행. */
    private void ensureSchema() {
        if (schemaReady) {
            return;
        }
        jdbc.execute("CREATE TABLE IF NOT EXISTS report_events ("
                + "id BIGSERIAL PRIMARY KEY, "
                + "target TEXT NOT NULL, "
                + "reporter_hash TEXT, "
                + "created_at TIMESTAMPTZ NOT NULL DEFAULT now())");
        jdbc.execute("CREATE INDEX IF NOT EXISTS idx_report_events_target "
                + "ON report_events (target)");
        jdbc.execute("CREATE INDEX IF NOT EXISTS idx_report_events_reporter "
                + "ON report_events (reporter_hash, created_at DESC)");
        schemaReady = true;
    }

    private boolean existsEver(String target, String reporterHash) {
        Long n = jdbc.queryForObject(
                "SELECT COUNT(*) FROM report_events WHERE target = ? AND reporter_hash = ?",
                Long.class, target, reporterHash);
        return n != null && n > 0;
    }

    /** 시간창 안에서 이 신고자가 만든 독립 신고 수(burst 탐지). */
    private long burstCount(String reporterHash) {
        Long n = jdbc.queryForObject(
                "SELECT COUNT(*) FROM report_events "
                        + "WHERE reporter_hash = ? AND created_at > now() - make_interval(secs => ?)",
                Long.class, reporterHash, DEDUP_WINDOW_SECONDS);
        return n == null ? 0 : n;
    }

    private static String firstForwardedFor(String xff) {
        if (xff == null || xff.isBlank()) {
            return null;
        }
        return xff.split(",")[0].trim();
    }

    private static String firstNonBlank(String... values) {
        for (String v : values) {
            if (v != null && !v.isBlank()) {
                return v.trim();
            }
        }
        return "anon";
    }

    private static String sha256(String s) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(s.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(64);
            for (byte b : digest) {
                sb.append(Character.forDigit((b >> 4) & 0xF, 16));
                sb.append(Character.forDigit(b & 0xF, 16));
            }
            return sb.toString();
        } catch (Exception e) {
            // SHA-256 은 표준 JDK 에 항상 존재하지만, 방어를 절대 멈추지 않도록 최후 폴백.
            return Integer.toHexString(s.hashCode());
        }
    }

    private static String envOr(String key, String dflt) {
        String v = System.getenv(key);
        return (v == null || v.isBlank()) ? dflt : v;
    }
}
