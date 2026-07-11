package io.scamgraph.gateway;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * IoC(위협 인디케이터) 피드 익스포트 — SIEM/SOAR 연동용.
 * "앱이 아니라 플랫폼"의 증거: 다른 시스템이 ScamGraph 데이터를 소비할 수 있다.
 */
@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
@Tag(name = "Feed", description = "위협 인디케이터(IoC) 피드")
public class FeedController {

    private static final Set<String> CHANNEL_TYPES = Set.of("Phone", "Account");

    private final GraphSource graphSource;

    public FeedController(GraphSource graphSource) {
        this.graphSource = graphSource;
    }

    @GetMapping("/feed")
    @Operation(summary = "IoC 위협 피드",
            description = "고위험 위협 인디케이터(도메인·전화·계좌)를 CSV 또는 JSON 으로 내보냅니다.")
    public ResponseEntity<?> feed(@RequestParam(defaultValue = "csv") String format) {
        List<Map<String, Object>> iocs = collect();

        if ("json".equalsIgnoreCase(format)) {
            return ResponseEntity.ok(iocs);
        }

        StringBuilder sb = new StringBuilder("value,type,grade,risk_score,source\n");
        for (Map<String, Object> i : iocs) {
            sb.append(csv(i.get("value"))).append(',')
                    .append(csv(i.get("type"))).append(',')
                    .append(csv(i.get("grade"))).append(',')
                    .append(csv(i.get("risk_score"))).append(',')
                    .append("scamgraph").append('\n');
        }
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("text/csv; charset=UTF-8"))
                .body(sb.toString());
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> collect() {
        Map<String, Object> graph = graphSource.current();
        List<Map<String, Object>> nodes = (List<Map<String, Object>>) graph.get("nodes");
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> n : nodes) {
            String type = (String) n.get("type");
            String grade = (String) n.get("grade");
            boolean risky = "danger".equals(grade) || "warning".equals(grade);
            boolean channel = CHANNEL_TYPES.contains(type);
            if (risky || channel) {
                Map<String, Object> ioc = new LinkedHashMap<>();
                ioc.put("value", n.get("label"));
                ioc.put("type", type);
                ioc.put("grade", grade);
                ioc.put("risk_score", n.get("risk_score"));
                out.add(ioc);
            }
        }
        return out;
    }

    private static String csv(Object v) {
        if (v == null) return "";
        String s = String.valueOf(v);
        if (s.contains(",") || s.contains("\"") || s.contains("\n")) {
            return '"' + s.replace("\"", "\"\"") + '"';
        }
        return s;
    }
}
