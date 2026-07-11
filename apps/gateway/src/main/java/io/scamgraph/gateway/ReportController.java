package io.scamgraph.gateway;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.MediaType;
import org.springframework.web.client.RestClient;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * 시민 신고 API. 프론트/외부 개발자가 호출 → 엔진으로 위임.
 * 엔진이 죽어도 데모가 돌도록, 예외 시 init.sql 기반 시드 신고로 폴백한다.
 */
@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
@Tag(name = "Report", description = "커뮤니티 사기 신고 API")
public class ReportController {

    private final RestClient engine;

    public ReportController(RestClient.Builder builder, @Value("${engine.url}") String engineUrl) {
        this.engine = builder.baseUrl(engineUrl).build();
    }

    @GetMapping("/reports")
    @Operation(summary = "신고 목록 조회",
            description = "커뮤니티에 접수된 사기 신고 목록을 반환합니다. 엔진 미가동 시 시드 신고로 폴백합니다.")
    public Object reports(@RequestParam(defaultValue = "50") int limit) {
        try {
            return engine.get()
                    .uri("/reports?limit={limit}", limit)
                    .retrieve()
                    .body(Object.class);
        } catch (Exception e) {
            // 데모 세이프: 엔진이 죽어도 시드 신고 반환 (infra/postgres/init.sql 미러)
            String ts = Instant.now().toString();
            return List.of(
                    Map.of("target", "cj-delivery-check.top", "kind", "url",
                            "note", "택배 미수령 사칭 문자", "status", "confirmed", "votes", 42, "ts", ts),
                    Map.of("target", "kbstat-secure.click", "kind", "url",
                            "note", "KB 보안 인증 사칭", "status", "confirmed", "votes", 37, "ts", ts),
                    Map.of("target", "070-4123-9981", "kind", "phone",
                            "note", "자동응답 보이스피싱", "status", "confirmed", "votes", 18, "ts", ts)
            );
        }
    }

    @PostMapping("/report")
    @Operation(summary = "사기 신고 접수",
            description = "대상·유형·메모로 신고를 접수합니다. 엔진 미가동 시 큐잉 응답으로 폴백합니다.")
    public Object report(@RequestBody ReportRequest req) {
        try {
            return engine.post()
                    .uri("/report")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of(
                            "target", req.target() == null ? "" : req.target(),
                            "kind", req.kind() == null ? "" : req.kind(),
                            "note", req.note() == null ? "" : req.note()
                    ))
                    .retrieve()
                    .body(Object.class);
        } catch (Exception e) {
            // 데모 세이프: 엔진이 죽어도 접수 응답
            return Map.of(
                    "status", "queued",
                    "target", req.target() == null ? "" : req.target()
            );
        }
    }

    public record ReportRequest(String target, String kind, String note) {}
}
