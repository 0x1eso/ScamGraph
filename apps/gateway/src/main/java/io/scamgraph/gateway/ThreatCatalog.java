package io.scamgraph.gateway;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 검색 인덱싱 + 검색 폴백에 쓰는 위협 엔티티 카탈로그 (seed 미러). */
final class ThreatCatalog {

    private ThreatCatalog() {}

    static Map<String, Object> doc(String id, String type, String label, String grade, Integer risk) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", id);
        m.put("type", type);
        m.put("label", label);
        m.put("grade", grade);
        m.put("risk", risk);
        return m;
    }

    static List<Map<String, Object>> docs() {
        return List.of(
                doc("cj-delivery-check.top", "Target", "cj-delivery-check.top", "danger", 92),
                doc("cj-delivery-track.xyz", "Target", "cj-delivery-track.xyz", "danger", 88),
                doc("kbstat-secure.click", "Target", "kbstat-secure.click", "danger", 95),
                doc("shinhan-otp.xyz", "Target", "shinhan-otp.xyz", "danger", 90),
                doc("kb-security-login.xyz", "Target", "kb-security-login.xyz", "warning", 38),
                doc("safe-shop.co.kr", "Target", "safe-shop.co.kr", "safe", 8),
                doc("070-4123-9981", "Phone", "070-4123-9981", "warning", 20),
                doc("070-8842-1120", "Phone", "070-8842-1120", "warning", 20),
                doc("010-3921-7744", "Phone", "010-3921-7744", "danger", 70),
                doc("352-9981-2210-11", "Account", "352-9981-2210-11 (농협)", null, null),
                doc("110-441-882201", "Account", "110-441-882201 (신한)", null, null),
                doc("3333-09-882211", "Account", "3333-09-882211", null, null),
                doc("택배사칭-A", "Campaign", "택배사칭-A 캠페인", null, null),
                doc("은행피싱-B", "Campaign", "은행피싱-B 캠페인", null, null)
        );
    }
}
