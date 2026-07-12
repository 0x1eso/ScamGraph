package io.scamgraph.gateway;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.http.client.ClientHttpRequestFactoryBuilder;
import org.springframework.boot.http.client.ClientHttpRequestFactorySettings;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * AI 2차 소견 (참고용) — GLM(Zhipu) 기반 독립 소견.
 *
 * <p>규칙 엔진 판정과 <b>완전히 별개</b>인 부가 계층이다. 규칙 판정/근거가 신뢰의 뼈대이고,
 * 이 소견은 명시적으로 라벨링된 보너스일 뿐이다(설명가능·AI 아님 포지셔닝 유지).</p>
 *
 * <p>데모 세이프: 키 미설정·타임아웃·비2xx·파싱 실패 등 <b>어떤 실패에도</b> 예외를 던지지 않고
 * {@code {available:false, reason:...}} 로 응답한다. 500 을 내거나 스캔 흐름을 막지 않는다.</p>
 */
@RestController
@RequestMapping("/api/ai")
@CrossOrigin(origins = "*")
@Tag(name = "AI", description = "AI 2차 소견 (참고용 · 규칙 판정과 별개)")
public class AiOpinionController {

    // GLM 이 반환할 수 있는 등급 화이트리스트. 벗어나면 아래 동의어 매핑 → 최종적으로 unknown.
    private static final Set<String> ALLOWED_GRADES =
            Set.of("danger", "warning", "caution", "safe", "unknown");
    // 모델이 화이트리스트를 벗어난 표현(high/medium/위험 등)을 써도 우리 등급으로 흡수한다.
    private static final Map<String, String> GRADE_SYNONYMS = Map.ofEntries(
            Map.entry("critical", "danger"), Map.entry("high", "danger"),
            Map.entry("severe", "danger"), Map.entry("위험", "danger"),
            Map.entry("medium", "warning"), Map.entry("moderate", "warning"),
            Map.entry("경고", "warning"),
            Map.entry("low", "caution"), Map.entry("주의", "caution"),
            Map.entry("minimal", "safe"), Map.entry("none", "safe"),
            Map.entry("clean", "safe"), Map.entry("안전", "safe"));
    private static final int MAX_REASONS = 5;

    private final RestClient glm;
    private final ObjectMapper mapper;
    private final String apiKey;
    private final String model;
    private final boolean enabled;

    public AiOpinionController(
            ObjectMapper mapper,
            @Value("${GLM_API_KEY:}") String apiKey,
            @Value("${GLM_BASE_URL:https://open.bigmodel.cn/api/paas/v4}") String baseUrl,
            @Value("${GLM_MODEL:glm-5.2}") String model) {
        this.mapper = mapper;
        this.apiKey = apiKey == null ? "" : apiKey.trim();
        this.model = model == null || model.isBlank() ? "glm-5.2" : model.trim();
        this.enabled = !this.apiKey.isEmpty();

        // httpclient5 기반 팩토리를 유지(JDK 기본 팩토리의 POST 바디 누락 회피 — build.gradle 참고)하되
        // 연결/읽기 타임아웃을 걸어 GLM 이 느려도 게이트웨이 스레드가 무한 대기하지 않게 한다.
        // glm-5.2 는 추론(reasoning) 모델이라 실제 소견 생성에 시간이 걸린다.
        // thinking disabled + max_tokens 캡으로 보통 6~14s지만, 변동 대비 read 타임아웃을 넉넉히 잡는다.
        var settings = ClientHttpRequestFactorySettings.defaults()
                .withConnectTimeout(Duration.ofSeconds(5))
                .withReadTimeout(Duration.ofSeconds(45));
        var factory = ClientHttpRequestFactoryBuilder.detect().build(settings);
        this.glm = RestClient.builder()
                .baseUrl(baseUrl == null || baseUrl.isBlank()
                        ? "https://open.bigmodel.cn/api/paas/v4"
                        : baseUrl.trim())
                .requestFactory(factory)
                .build();
    }

    @PostMapping("/opinion")
    @Operation(summary = "AI 2차 소견 (참고용)",
            description = "규칙 판정과 별개로 GLM 기반 독립 소견을 반환합니다. 키 미설정/실패 시 available:false 로 안전하게 응답합니다.")
    public Map<String, Object> opinion(@RequestBody OpinionRequest req) {
        if (!enabled) {
            // 키 미설정 → 호출 없이 즉시 스킵(데모 세이프).
            return unavailable("AI 키 미설정");
        }
        try {
            String content = callGlm(req);
            Map<String, Object> parsed = parseOpinion(content);
            if (parsed == null) {
                return unavailable("AI 응답 파싱 실패");
            }
            Map<String, Object> out = new HashMap<>(parsed);
            out.put("available", true);
            out.put("model", model);
            return out;
        } catch (Exception e) {
            // 키/응답에 어떤 문제가 있어도 절대 던지지 않는다. (예외 메시지에 키를 싣지 않도록 클래스명만 남김)
            System.err.println("[ai-opinion] GLM 호출 실패: " + e.getClass().getSimpleName());
            return unavailable("AI 일시 불가");
        }
    }

    private static Map<String, Object> unavailable(String reason) {
        return Map.of("available", false, "reason", reason);
    }

    // ── GLM 호출 ────────────────────────────────────────────────
    private String callGlm(OpinionRequest req) {
        String system = "너는 보이스피싱·스미싱·피싱 위협 분석 보조다. 규칙 엔진의 판정과 별개로 독립적인 2차 소견을 낸다. "
                + "특정 도메인의 확인 불가한 사실은 지어내지 말고, 주어진 지표(도메인 형태·TLD·브랜드 사칭 정황·규칙 근거)에서 추론하라. "
                + "불확실하면 불확실하다고 하라.";
        String user = buildUserPrompt(req);

        Map<String, Object> body = Map.of(
                "model", model,
                "temperature", 0.2,
                // 추론 트레이스 비활성 — 최종 JSON만 필요하므로 응답이 빨라지고 비용도 준다.
                "thinking", Map.of("type", "disabled"),
                // 출력 상한(관측상 완성 응답 ~600토큰) — 잘림 없이 지연/비용을 캡.
                "max_tokens", 1200,
                "messages", List.of(
                        Map.of("role", "system", "content", system),
                        Map.of("role", "user", "content", user)));

        Map<?, ?> resp = glm.post()
                .uri("/chat/completions")
                .header("Authorization", "Bearer " + apiKey)
                .contentType(MediaType.APPLICATION_JSON)
                .body(body)
                .retrieve()
                .body(Map.class);

        return extractContent(resp);
    }

    // OpenAI 호환 응답에서 choices[0].message.content 를 방어적으로 추출.
    private String extractContent(Map<?, ?> resp) {
        if (resp == null) {
            return null;
        }
        Object choicesObj = resp.get("choices");
        if (!(choicesObj instanceof List<?> choices) || choices.isEmpty()) {
            return null;
        }
        if (!(choices.get(0) instanceof Map<?, ?> first)) {
            return null;
        }
        if (!(first.get("message") instanceof Map<?, ?> message)) {
            return null;
        }
        Object content = message.get("content");
        return content == null ? null : content.toString();
    }

    private String buildUserPrompt(OpinionRequest req) {
        String target = req.target() == null ? "" : req.target();
        String kind = req.kind() == null ? "url" : req.kind();
        String grade = req.rule_grade() == null ? "unknown" : req.rule_grade();
        int score = req.rule_score() == null ? 0 : req.rule_score();

        StringBuilder sb = new StringBuilder();
        sb.append("아래 대상에 대해 규칙 엔진과 별개의 독립적인 위협 2차 소견을 내라.\n\n");
        sb.append("대상: ").append(target).append('\n');
        sb.append("유형: ").append(kind).append('\n');
        sb.append("규칙 엔진 판정: 등급=").append(grade).append(", 점수=").append(score).append("/100\n");

        List<Map<String, Object>> reasons = req.rule_reasons();
        if (reasons != null && !reasons.isEmpty()) {
            sb.append("규칙 근거:\n");
            for (Map<String, Object> r : reasons) {
                Object rule = r.get("rule");
                Object detail = r.get("detail");
                sb.append("  - ").append(rule == null ? "" : rule)
                        .append(": ").append(detail == null ? "" : detail).append('\n');
            }
        }

        sb.append("\n요구사항:\n");
        sb.append("1) 독립적인 위험 평가(규칙 판정에 끌려가지 말 것)\n");
        sb.append("2) 1~2문장 요약\n");
        sb.append("3) 구체적 근거 2~4개\n");
        sb.append("4) 규칙 판정에 동의하는지 여부\n\n");
        sb.append("반드시 아래 스키마의 STRICT JSON 만 출력하라(코드펜스·설명 금지):\n");
        sb.append("{\"grade\":\"danger|warning|caution|safe|unknown\",\"score\":0-100,"
                + "\"summary\":\"...\",\"reasons\":[{\"point\":\"...\",\"detail\":\"...\"}],"
                + "\"agrees_with_rule\":true,\"disclaimer\":\"...\"}");
        return sb.toString();
    }

    // ── 응답 파싱/정규화 ────────────────────────────────────────
    // 모델이 코드펜스나 잡텍스트를 섞어 보내도 첫 { ... } 블록만 뽑아 파싱한다.
    private Map<String, Object> parseOpinion(String content) throws Exception {
        if (content == null || content.isBlank()) {
            return null;
        }
        String cleaned = content.trim();
        if (cleaned.startsWith("```")) {
            int firstNl = cleaned.indexOf('\n');
            if (firstNl >= 0) {
                cleaned = cleaned.substring(firstNl + 1);
            }
            if (cleaned.endsWith("```")) {
                cleaned = cleaned.substring(0, cleaned.length() - 3);
            }
            cleaned = cleaned.trim();
        }
        int start = cleaned.indexOf('{');
        int end = cleaned.lastIndexOf('}');
        if (start < 0 || end <= start) {
            return null;
        }
        cleaned = cleaned.substring(start, end + 1);

        Map<?, ?> raw = mapper.readValue(cleaned, Map.class);

        Map<String, Object> out = new HashMap<>();
        out.put("grade", normalizeGrade(raw.get("grade")));
        out.put("score", normalizeScore(raw.get("score")));
        out.put("summary", raw.get("summary") == null ? "" : raw.get("summary").toString());
        out.put("reasons", normalizeReasons(raw.get("reasons")));
        out.put("agrees_with_rule", coerceBool(raw.get("agrees_with_rule")));
        out.put("disclaimer", raw.get("disclaimer") == null
                ? "AI 2차 소견은 참고용이며 규칙 판정과 별개입니다."
                : raw.get("disclaimer").toString());
        return out;
    }

    private static String normalizeGrade(Object raw) {
        if (raw == null) {
            return "unknown";
        }
        String g = raw.toString().trim().toLowerCase();
        if (ALLOWED_GRADES.contains(g)) {
            return g;
        }
        return GRADE_SYNONYMS.getOrDefault(g, "unknown");
    }

    private static int normalizeScore(Object raw) {
        int score = 0;
        if (raw instanceof Number n) {
            score = n.intValue();
        } else if (raw != null) {
            try {
                score = (int) Math.round(Double.parseDouble(raw.toString().trim()));
            } catch (NumberFormatException ignored) {
                score = 0;
            }
        }
        return Math.max(0, Math.min(100, score));
    }

    private static boolean coerceBool(Object raw) {
        if (raw instanceof Boolean b) {
            return b;
        }
        if (raw == null) {
            return false;
        }
        String s = raw.toString().trim().toLowerCase();
        return s.equals("true") || s.equals("yes") || s.equals("y") || s.equals("1");
    }

    private static List<Map<String, String>> normalizeReasons(Object raw) {
        List<Map<String, String>> out = new ArrayList<>();
        if (!(raw instanceof List<?> list)) {
            return out;
        }
        for (Object item : list) {
            if (out.size() >= MAX_REASONS) {
                break;
            }
            if (item instanceof Map<?, ?> m) {
                Object point = m.get("point");
                Object detail = m.get("detail");
                String p = point == null ? "" : point.toString().trim();
                String d = detail == null ? "" : detail.toString().trim();
                if (p.isEmpty() && d.isEmpty()) {
                    continue;
                }
                out.add(Map.of("point", p, "detail", d));
            } else if (item != null) {
                String d = item.toString().trim();
                if (!d.isEmpty()) {
                    out.add(Map.of("point", "", "detail", d));
                }
            }
        }
        return out;
    }

    /**
     * 웹이 이미 보유한 규칙 결과를 컨텍스트로 함께 보낸다.
     * rule_reasons 항목은 {@code {rule, detail}} 형태(가중치 등 나머지 필드는 무시).
     */
    public record OpinionRequest(
            String target,
            String kind,
            String rule_grade,
            Integer rule_score,
            List<Map<String, Object>> rule_reasons) {
    }
}
