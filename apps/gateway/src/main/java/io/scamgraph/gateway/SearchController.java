package io.scamgraph.gateway;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestClient;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 자체 검색엔진(Meilisearch) 프록시. 위협 엔티티 전문검색.
 * Meili 가 다운이거나 비었으면 카탈로그 부분매칭으로 폴백한다(데모 세이프).
 */
@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
@Tag(name = "Search", description = "위협 엔티티 검색 API (Meilisearch)")
public class SearchController {

    private final RestClient meili;

    public SearchController(RestClient.Builder builder,
                            @Value("${meili.url}") String url,
                            @Value("${meili.key}") String key) {
        this.meili = builder.baseUrl(url)
                .defaultHeader("Authorization", "Bearer " + key)
                .build();
    }

    @GetMapping("/search")
    @Operation(summary = "위협 엔티티 검색",
            description = "도메인·전화·계좌·캠페인을 전문검색합니다. Meili 미가동 시 부분매칭 폴백.")
    public Map<String, Object> search(@RequestParam(defaultValue = "") String q) {
        List<Map<String, Object>> hits = new ArrayList<>();

        try {
            Map<?, ?> res = meili.post()
                    .uri("/indexes/threats/search")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("q", q, "limit", 12))
                    .retrieve()
                    .body(Map.class);
            Object raw = res != null ? res.get("hits") : null;
            if (raw instanceof List<?> list) {
                for (Object o : list) {
                    if (o instanceof Map<?, ?> m) {
                        hits.add(toHit(m));
                    }
                }
            }
        } catch (Exception e) {
            hits = fallbackSearch(q);
        }

        // Meili 가 응답했지만 색인 전이라 비어있으면 폴백도 시도
        if (hits.isEmpty() && !q.isBlank()) {
            List<Map<String, Object>> fb = fallbackSearch(q);
            if (!fb.isEmpty()) {
                hits = fb;
            }
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("query", q);
        out.put("hits", hits);
        return out;
    }

    private static Map<String, Object> toHit(Map<?, ?> m) {
        Map<String, Object> h = new LinkedHashMap<>();
        h.put("id", m.get("id"));
        h.put("type", m.get("type"));
        h.put("label", m.get("label"));
        h.put("grade", m.get("grade"));
        h.put("risk", m.get("risk"));
        return h;
    }

    private static List<Map<String, Object>> fallbackSearch(String q) {
        String needle = q == null ? "" : q.toLowerCase();
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> d : ThreatCatalog.docs()) {
            String label = String.valueOf(d.get("label")).toLowerCase();
            String id = String.valueOf(d.get("id")).toLowerCase();
            if (needle.isBlank() || label.contains(needle) || id.contains(needle)) {
                out.add(d);
            }
        }
        return out;
    }
}
