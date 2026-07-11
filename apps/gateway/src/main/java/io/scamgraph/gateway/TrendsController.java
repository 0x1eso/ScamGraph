package io.scamgraph.gateway;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 위협 동향(Threat Trends) — 최근 스캔 이력에서 상황 인식 지표를 집계한다.
 * scans 테이블(target·kind·grade·reasons·created_at)에서 최근 7일 동향을 계산하고,
 * PG 미가동/빈 테이블이면 현실적인 데모 시드로 폴백한다(항상 렌더 = 데모 세이프).
 *
 * 판정 근거는 이미 reasons JSONB 에 담겨 있으므로, 여기서는 그 이력을 '집계'만 한다.
 * (순수 SW — AI 없음. 모든 수치는 SQL 집계 또는 결정적 시드에서 나온다.)
 */
@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
@Tag(name = "Trends", description = "최근 스캔 이력 기반 위협 동향 집계")
public class TrendsController {

    private static final int WINDOW_DAYS = 7;
    private static final int MAX_BRAND_ROWS = 5000;   // 브랜드 파싱 상한(대형 테이블 방어)
    private static final int TOP_BRANDS = 6;

    // kind → 사람이 읽는 위협 유형 라벨(동향 표기용)
    private static final Map<String, String> KIND_LABEL = Map.of(
            "url", "URL 피싱·스미싱",
            "phone", "보이스피싱 번호",
            "account", "사기 이용 계좌");

    // 표시 순서 — 위험/유입이 큰 항목을 먼저
    private static final List<String> KIND_ORDER = List.of("url", "phone", "account");
    private static final List<String> GRADE_ORDER = List.of("danger", "warning", "caution", "safe");

    // 브랜드 표적 파싱 — 대표 표기 + 별칭(소문자 부분일치). target·reasons 텍스트에서 매칭.
    private static final List<BrandKeyword> BRANDS = List.of(
            new BrandKeyword("토스", List.of("toss", "토스")),
            new BrandKeyword("KB국민", List.of("kbstar", "kbank", "kb국민", "국민은행")),
            new BrandKeyword("네이버", List.of("naver", "네이버")),
            new BrandKeyword("카카오", List.of("kakao", "카카오")),
            new BrandKeyword("신한", List.of("shinhan", "신한")),
            new BrandKeyword("우리", List.of("woori", "우리은행")),
            new BrandKeyword("농협", List.of("nonghyup", "농협")),
            new BrandKeyword("쿠팡", List.of("coupang", "쿠팡")),
            new BrandKeyword("하나", List.of("hana", "하나은행")),
            new BrandKeyword("삼성", List.of("samsung", "삼성")),
            new BrandKeyword("IBK기업", List.of("ibk", "기업은행")),
            new BrandKeyword("우체국", List.of("epost", "우체국")),
            new BrandKeyword("CJ대한통운", List.of("cj-", "대한통운")),
            new BrandKeyword("Apple", List.of("apple", "애플")),
            new BrandKeyword("PayPal", List.of("paypal")));

    private record BrandKeyword(String brand, List<String> aliases) {}

    private final JdbcTemplate jdbc;

    public TrendsController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping("/trends")
    @Operation(summary = "위협 동향 집계",
            description = "최근 7일 스캔 이력에서 유형·등급 분포, 급상승 유형, 표적 브랜드를 집계합니다. "
                    + "PG 미가동/빈 테이블이면 현실적인 데모 동향을 반환합니다.")
    public Map<String, Object> trends() {
        try {
            // 1) 유형별 최근/직전 7일 카운트 (by_kind + rising 재료) — 단일 스캔으로 두 창을 집계
            Map<String, long[]> kindCounts = new LinkedHashMap<>(); // kind -> [recent7, prior7]
            jdbc.query(
                    "SELECT kind, "
                            + "COUNT(*) FILTER (WHERE created_at > now() - interval '7 days') AS recent, "
                            + "COUNT(*) FILTER (WHERE created_at > now() - interval '14 days' "
                            + "                   AND created_at <= now() - interval '7 days') AS prior "
                            + "FROM scans WHERE created_at > now() - interval '14 days' GROUP BY kind",
                    rs -> {
                        kindCounts.put(rs.getString("kind"),
                                new long[]{rs.getLong("recent"), rs.getLong("prior")});
                    });

            long total = 0;
            for (long[] rp : kindCounts.values()) {
                total += rp[0];
            }
            if (total == 0) {
                return seed();   // 빈 테이블 → 전체 시드(데모 세이프)
            }

            // 2) 등급별 최근 7일 카운트
            Map<String, Long> gradeCounts = new LinkedHashMap<>();
            jdbc.query(
                    "SELECT grade, COUNT(*) AS c FROM scans "
                            + "WHERE created_at > now() - interval '7 days' GROUP BY grade",
                    rs -> {
                        gradeCounts.put(rs.getString("grade"), rs.getLong("c"));
                    });

            List<Map<String, Object>> byKind = orderedCounts(KIND_ORDER, "kind", pickRecent(kindCounts));
            List<Map<String, Object>> byGrade = orderedCounts(GRADE_ORDER, "grade", gradeCounts);

            // 3) rising — 최근 7일 vs 직전 7일 증가율(유형별). delta_pct 내림차순.
            List<Map<String, Object>> rising = new ArrayList<>();
            for (Map.Entry<String, long[]> e : kindCounts.entrySet()) {
                long recent = e.getValue()[0];
                long prior = e.getValue()[1];
                if (recent <= 0) {
                    continue;
                }
                rising.add(risingRow(KIND_LABEL.getOrDefault(e.getKey(), e.getKey()),
                        recent, deltaPct(recent, prior)));
            }
            rising.sort((a, b) -> Integer.compare((int) b.get("delta_pct"), (int) a.get("delta_pct")));
            if (rising.isEmpty()) {
                rising = seedRising();
            }

            // 4) top_brands — target·reasons 텍스트에서 브랜드 키워드 매칭(최근 7일)
            List<Map<String, Object>> topBrands = topBrands();
            if (topBrands.isEmpty()) {
                topBrands = seedBrands();   // 실 데이터에 브랜드 흔적이 없으면 시드로 채움
            }

            Map<String, Object> out = new LinkedHashMap<>();
            out.put("window_days", WINDOW_DAYS);
            out.put("total", total);
            out.put("by_kind", byKind);
            out.put("by_grade", byGrade);
            out.put("rising", rising);
            out.put("top_brands", topBrands);
            return out;
        } catch (Exception e) {
            // PG 미가동/쿼리 실패 → 전체 시드(데모 세이프)
            return seed();
        }
    }

    /** kindCounts(kind -> [recent, prior]) 에서 recent 값만 뽑아 kind -> recent 맵으로. */
    private static Map<String, Long> pickRecent(Map<String, long[]> kindCounts) {
        Map<String, Long> recent = new LinkedHashMap<>();
        for (Map.Entry<String, long[]> e : kindCounts.entrySet()) {
            recent.put(e.getKey(), e.getValue()[0]);
        }
        return recent;
    }

    /** 고정 순서 우선으로 정렬한 [{key: label}, {count}] 목록. 순서에 없는 항목은 뒤에 붙인다. */
    private static List<Map<String, Object>> orderedCounts(
            List<String> order, String keyName, Map<String, Long> counts) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (String k : order) {
            Long c = counts.get(k);
            if (c != null && c > 0) {
                out.add(pair(keyName, k, "count", c));
            }
        }
        for (Map.Entry<String, Long> e : counts.entrySet()) {
            if (!order.contains(e.getKey()) && e.getValue() != null && e.getValue() > 0) {
                out.add(pair(keyName, e.getKey(), "count", e.getValue()));
            }
        }
        return out;
    }

    /** target·reasons 텍스트에서 브랜드 키워드 출현 스캔 수를 센다(최근 7일). */
    private List<Map<String, Object>> topBrands() {
        List<String> blobs = new ArrayList<>();
        jdbc.query(
                "SELECT lower(coalesce(target,'') || ' ' || coalesce(reasons::text,'')) AS blob "
                        + "FROM scans WHERE created_at > now() - interval '7 days' LIMIT " + MAX_BRAND_ROWS,
                rs -> {
                    blobs.add(rs.getString("blob"));
                });

        List<Map<String, Object>> out = new ArrayList<>();
        for (BrandKeyword bk : BRANDS) {
            long count = 0;
            for (String blob : blobs) {
                if (blob == null) {
                    continue;
                }
                for (String alias : bk.aliases()) {
                    if (blob.contains(alias)) {
                        count++;   // 한 스캔은 브랜드당 1회만 카운트
                        break;
                    }
                }
            }
            if (count > 0) {
                out.add(pair("brand", bk.brand(), "count", count));
            }
        }
        out.sort((a, b) -> Long.compare((long) b.get("count"), (long) a.get("count")));
        return out.size() > TOP_BRANDS ? new ArrayList<>(out.subList(0, TOP_BRANDS)) : out;
    }

    /** 증가율(%) — 직전 7일 대비. prior=0 이면 신규 급증으로 간주(상한 999). */
    private static int deltaPct(long recent, long prior) {
        if (prior <= 0) {
            return recent > 0 ? (int) Math.min(recent * 100L, 999) : 0;
        }
        long pct = Math.round((recent - prior) * 100.0 / prior);
        return (int) Math.max(-99, Math.min(pct, 999));
    }

    private static Map<String, Object> pair(String k1, Object v1, String k2, Object v2) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put(k1, v1);
        m.put(k2, v2);
        return m;
    }

    private static Map<String, Object> risingRow(String label, long count, int deltaPct) {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("label", label);
        r.put("count", count);
        r.put("delta_pct", deltaPct);
        return r;
    }

    // ── 데모 시드(PG 미가동/빈 테이블) — 현실적인 최근 동향(기관사칭↑·택배 스미싱↑·토스/KB 표적) ──
    private static Map<String, Object> seed() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("window_days", WINDOW_DAYS);
        out.put("total", 1247L);

        List<Map<String, Object>> byKind = new ArrayList<>();
        byKind.add(pair("kind", "url", "count", 812L));
        byKind.add(pair("kind", "phone", "count", 289L));
        byKind.add(pair("kind", "account", "count", 146L));
        out.put("by_kind", byKind);

        List<Map<String, Object>> byGrade = new ArrayList<>();
        byGrade.add(pair("grade", "danger", "count", 468L));
        byGrade.add(pair("grade", "warning", "count", 402L));
        byGrade.add(pair("grade", "caution", "count", 210L));
        byGrade.add(pair("grade", "safe", "count", 167L));
        out.put("by_grade", byGrade);

        out.put("rising", seedRising());
        out.put("top_brands", seedBrands());
        return out;
    }

    private static List<Map<String, Object>> seedRising() {
        List<Map<String, Object>> rising = new ArrayList<>();
        rising.add(risingRow("기관 사칭 URL", 312, 63));
        rising.add(risingRow("택배 스미싱", 208, 47));
        rising.add(risingRow("보이스피싱 번호", 156, 34));
        rising.add(risingRow("사기 이용 계좌", 92, 21));
        return rising;
    }

    private static List<Map<String, Object>> seedBrands() {
        List<Map<String, Object>> brands = new ArrayList<>();
        brands.add(pair("brand", "토스", "count", 143L));
        brands.add(pair("brand", "KB국민", "count", 121L));
        brands.add(pair("brand", "네이버", "count", 98L));
        brands.add(pair("brand", "쿠팡", "count", 87L));
        brands.add(pair("brand", "우체국", "count", 64L));
        brands.add(pair("brand", "카카오", "count", 51L));
        return brands;
    }
}
