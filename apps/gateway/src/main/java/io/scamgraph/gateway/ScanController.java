package io.scamgraph.gateway;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.MediaType;
import org.springframework.web.client.RestClient;

import java.time.Instant;
import java.util.Map;

/**
 * 공개 스캔 API. 프론트/외부 개발자가 호출 → 엔진으로 위임.
 */
@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
@Tag(name = "Scan", description = "사기·피싱 위협 스캔 API")
public class ScanController {

    private final RestClient engine;
    private final FeedHandler feed;

    public ScanController(RestClient.Builder builder, FeedHandler feed,
                          @Value("${engine.url}") String engineUrl) {
        this.engine = builder.baseUrl(engineUrl).build();
        this.feed = feed;
    }

    @GetMapping("/health")
    @Operation(summary = "게이트웨이 상태 확인")
    public Map<String, Object> health() {
        return Map.of(
                "service", "gateway",
                "status", "up",
                "time", Instant.now().toString()
        );
    }

    @PostMapping("/scan")
    @Operation(summary = "대상(URL/전화/계좌) 위협 스캔",
            description = "규칙 엔진으로 즉시 예비 평가 후, 비동기 크롤링·그래프 적재를 트리거합니다.")
    public Object scan(@RequestBody ScanRequest req) {
        String target = req.target() == null ? "" : req.target();
        try {
            Object result = engine.post()
                    .uri("/scan")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("target", target))
                    .retrieve()
                    .body(Object.class);
            broadcastScan(target, result);
            return result;
        } catch (Exception e) {
            // 데모 세이프: 엔진이 죽어도 게이트웨이는 응답
            return Map.of(
                    "target", target,
                    "status", "engine_unreachable",
                    "error", e.getMessage() == null ? "unknown" : e.getMessage()
            );
        }
    }

    // 스캔 결과를 실시간 피드로 브로드캐스트 (best-effort — 실패해도 스캔 응답에 영향 없음)
    private void broadcastScan(String target, Object result) {
        try {
            if (result instanceof Map<?, ?> m) {
                Map<String, Object> event = new java.util.HashMap<>();
                event.put("type", "scan");
                event.put("target", target);
                Object kind = m.get("kind");
                event.put("kind", kind != null ? kind : "url");
                event.put("grade", m.get("grade"));
                event.put("risk_score", m.get("risk_score"));
                event.put("note", null);
                event.put("ts", System.currentTimeMillis());
                feed.broadcast(event);
            }
        } catch (Exception ignored) {
            // 피드 브로드캐스트 실패는 무시
        }
    }

    public record ScanRequest(String target) {}
}
