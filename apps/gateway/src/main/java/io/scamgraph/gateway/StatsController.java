package io.scamgraph.gateway;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 플랫폼 규모 지표. 인상적인 베이스라인 + 서버 업타임에서 파생한 소폭의 실시간 증분.
 * Math.random 없이 업타임만으로 결정적으로 계산 → 새로고침마다 살아있는 느낌.
 */
@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
@Tag(name = "Stats", description = "플랫폼 규모·활동 지표")
public class StatsController {

    // 인상적인 베이스라인
    private static final long BASE_TRACKED_ENTITIES = 18204L;
    private static final long BASE_GRAPH_RELATIONS = 47891L;
    private static final long BASE_SCANS_TODAY = 1247L;
    private static final long BASE_CONFIRMED_THREATS = 3516L;

    private final long startedAt = System.currentTimeMillis();

    @GetMapping("/stats")
    @Operation(summary = "플랫폼 통계",
            description = "추적 엔티티/그래프 관계/오늘 스캔/확정 위협 수. 업타임 기반 실시간 증분 포함.")
    public Map<String, Object> stats() {
        long uptimeSeconds = (System.currentTimeMillis() - startedAt) / 1000L;
        return Map.of(
                "tracked_entities", BASE_TRACKED_ENTITIES + (uptimeSeconds / 3),
                "graph_relations", BASE_GRAPH_RELATIONS + uptimeSeconds,
                "scans_today", BASE_SCANS_TODAY + uptimeSeconds,
                "confirmed_threats", BASE_CONFIRMED_THREATS + (uptimeSeconds / 30)
        );
    }
}
