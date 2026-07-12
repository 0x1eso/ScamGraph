package io.scamgraph.gateway;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 위협 블록리스트 배포 — 브라우저 확장(declarativeNetRequest)·모바일 오프라인 동기화의 공유 소스.
 * manifest(version·hash) → snapshot(전량) → delta(증분)로 구성. PG blocklist 를 그대로 노출한다.
 * 클라이언트는 이 서명 가능한 스냅샷을 로컬에 캐시해 <b>방문 기록을 서버에 보내지 않고</b> 차단한다.
 * PG 미가동 시 시드 폴백(데모 세이프).
 */
@RestController
@RequestMapping("/api/blocklist")
@CrossOrigin(origins = "*")
@Tag(name = "Blocklist", description = "위협 블록리스트 배포(확장·모바일 공유)")
public class BlocklistController {

    private static final String FORMAT = "scamgraph-blocklist-1";
    private final JdbcTemplate jdbc;

    public BlocklistController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private List<Map<String, Object>> load(String sinceIso) {
        String sql = "SELECT value, kind, source, source_kind, last_seen FROM blocklist";
        Object[] args = new Object[0];
        if (sinceIso != null && !sinceIso.isBlank()) {
            sql += " WHERE last_seen > ?::timestamptz";
            args = new Object[]{sinceIso};
        }
        sql += " ORDER BY value";
        return jdbc.query(sql, (rs, i) -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("value", rs.getString("value"));
            m.put("kind", rs.getString("kind"));
            m.put("source", rs.getString("source"));
            m.put("severity", "gov".equals(rs.getString("source_kind")) ? "warning" : "danger");
            return m;
        }, args);
    }

    private static List<Map<String, Object>> seed() {
        List<Map<String, Object>> out = new ArrayList<>();
        String[][] rows = {
                {"secure-tosspay.info", "domain", "urlhaus", "danger"},
                {"naver-security-check.xyz", "domain", "openphish", "danger"},
                {"kbstar-otp.live", "domain", "threatfox", "danger"},
                {"cj-delivery-check.top", "domain", "openphish", "danger"},
                {"070-8890-1234", "phone", "police_kr", "warning"},
        };
        for (String[] r : rows) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("value", r[0]);
            m.put("kind", r[1]);
            m.put("source", r[2]);
            m.put("severity", r[3]);
            out.add(m);
        }
        return out;
    }

    /** 정렬된 value 를 이어붙여 SHA-256 → 앞 16자리. 내용이 같으면 version 도 같다(결정적). */
    static String hashOf(List<Map<String, Object>> entries) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            for (Map<String, Object> e : entries) {
                md.update(String.valueOf(e.get("value")).getBytes(StandardCharsets.UTF_8));
                md.update((byte) '\n');
            }
            StringBuilder sb = new StringBuilder();
            for (byte b : md.digest()) {
                sb.append(String.format("%02x", b));
            }
            return sb.substring(0, 16);
        } catch (Exception e) {
            return "0000000000000000";
        }
    }

    @GetMapping("/manifest")
    @Operation(summary = "블록리스트 매니페스트", description = "version·건수·hash. 클라이언트가 갱신 필요 여부를 판단합니다.")
    public Map<String, Object> manifest() {
        List<Map<String, Object>> entries;
        try {
            entries = load(null);
            if (entries.isEmpty()) entries = seed();
        } catch (Exception e) {
            entries = seed();
        }
        String hash = hashOf(entries);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("format", FORMAT);
        out.put("version", entries.size() + "-" + hash);
        out.put("count", entries.size());
        out.put("hash", hash);
        out.put("generated_at", Instant.now().toString());
        out.put("signature", null);  // TODO(P2): Ed25519 서명. 현재는 hash 무결성만.
        return out;
    }

    @GetMapping("/snapshot")
    @Operation(summary = "블록리스트 전량", description = "확장/모바일이 로컬 캐시해 오프라인·개인정보 보존형 차단에 사용합니다.")
    public Map<String, Object> snapshot() {
        List<Map<String, Object>> entries;
        try {
            entries = load(null);
            if (entries.isEmpty()) entries = seed();
        } catch (Exception e) {
            entries = seed();
        }
        String hash = hashOf(entries);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("format", FORMAT);
        out.put("version", entries.size() + "-" + hash);
        out.put("hash", hash);
        out.put("count", entries.size());
        out.put("entries", entries);
        return out;
    }

    @GetMapping("/delta")
    @Operation(summary = "블록리스트 증분", description = "since 이후 추가분. 대역폭 절감용.")
    public Map<String, Object> delta(@RequestParam(required = false) String since) {
        List<Map<String, Object>> added;
        try {
            added = load(since);
        } catch (Exception e) {
            added = List.of();
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("format", FORMAT);
        out.put("since", since);
        out.put("added", added);
        out.put("removed", List.of());  // 현재는 tombstone 미추적(P2).
        out.put("count", added.size());
        return out;
    }
}
