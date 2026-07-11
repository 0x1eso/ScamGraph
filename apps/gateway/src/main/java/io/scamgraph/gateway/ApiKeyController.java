package io.scamgraph.gateway;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 개발자용 API 키 발급/조회 (인메모리). 문서·데모 표기용 — 실제 엔드포인트에 강제하지 않는다.
 */
@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
@Tag(name = "ApiKey", description = "개발자 API 키 발급·조회")
public class ApiKeyController {

    private static final int DEFAULT_RATE_LIMIT = 1000;

    // key -> { key, owner, rate_limit, created_at }
    private final ConcurrentHashMap<String, Map<String, Object>> store = new ConcurrentHashMap<>();

    public ApiKeyController() {
        // 목록이 비지 않도록 데모 키 사전 시드
        seed("sg_demopublic0000000000000000000001", "demo-frontend");
        seed("sg_demopartner000000000000000000002", "partner-sandbox");
    }

    @PostMapping("/keys")
    @Operation(summary = "API 키 발급", description = "소유자 이름으로 새 키를 발급합니다.")
    public Map<String, Object> issue(@RequestBody ApiKeyRequest req) {
        String owner = req.owner() == null || req.owner().isBlank() ? "anonymous" : req.owner();
        String key = "sg_" + UUID.randomUUID().toString().replace("-", "");
        return store(key, owner);
    }

    @GetMapping("/keys")
    @Operation(summary = "발급된 키 목록", description = "키 값은 앞 8자리만 노출하고 나머지는 마스킹합니다.")
    public List<Map<String, Object>> list() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> entry : store.values()) {
            Map<String, Object> masked = new LinkedHashMap<>(entry);
            masked.put("key", mask((String) entry.get("key")));
            out.add(masked);
        }
        return out;
    }

    private void seed(String key, String owner) {
        store(key, owner);
    }

    private Map<String, Object> store(String key, String owner) {
        Map<String, Object> record = new LinkedHashMap<>();
        record.put("key", key);
        record.put("owner", owner);
        record.put("rate_limit", DEFAULT_RATE_LIMIT);
        record.put("created_at", Instant.now().toString());
        store.put(key, record);
        return record;
    }

    private String mask(String key) {
        if (key == null || key.length() <= 8) {
            return key;
        }
        return key.substring(0, 8) + "…";
    }

    public record ApiKeyRequest(String owner) {}
}
