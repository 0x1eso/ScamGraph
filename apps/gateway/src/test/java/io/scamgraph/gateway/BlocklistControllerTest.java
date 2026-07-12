package io.scamgraph.gateway;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * BlocklistController 단위 테스트.
 * (1) hashOf 결정성 — 확장/모바일이 version 으로 갱신 필요를 판단하므로 내용이 같으면 hash 도 같아야 한다.
 * (2) jdbc=null(=PG 미가동) 상황에서 manifest/snapshot/delta 가 시드 폴백으로 항상 유효 응답을 낸다.
 */
class BlocklistControllerTest {

    /** PG 미가동을 흉내 — 모든 jdbc 접근이 NPE→catch→시드 폴백 경로를 타게 한다. */
    private final BlocklistController controller = new BlocklistController(null);

    private static List<Map<String, Object>> entries(String... values) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (String v : values) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("value", v);
            m.put("kind", "domain");
            out.add(m);
        }
        return out;
    }

    @Test
    @DisplayName("hashOf: 같은 항목 → 같은 hash (결정적)")
    void hashDeterministic() {
        List<Map<String, Object>> a = entries("a.com", "b.com", "c.com");
        List<Map<String, Object>> b = entries("a.com", "b.com", "c.com");
        assertEquals(BlocklistController.hashOf(a), BlocklistController.hashOf(b));
    }

    @Test
    @DisplayName("hashOf: 값이 다르거나 순서가 다르면 hash 도 다르다")
    void hashSensitiveToContentAndOrder() {
        String base = BlocklistController.hashOf(entries("a.com", "b.com"));
        assertNotEquals(base, BlocklistController.hashOf(entries("a.com", "b.com", "c.com")));
        assertNotEquals(base, BlocklistController.hashOf(entries("b.com", "a.com")));
        assertNotEquals(base, BlocklistController.hashOf(entries("a.com", "x.com")));
    }

    @Test
    @DisplayName("hashOf: 항상 16자리 소문자 hex")
    void hashIs16Hex() {
        assertTrue(BlocklistController.hashOf(entries("a.com")).matches("[0-9a-f]{16}"));
        assertTrue(BlocklistController.hashOf(entries()).matches("[0-9a-f]{16}"));
    }

    @Test
    @DisplayName("manifest: PG 미가동 → 시드 5건 폴백, version = count-hash")
    void manifestSeedFallback() {
        Map<String, Object> m = controller.manifest();
        assertEquals("scamgraph-blocklist-1", m.get("format"));
        assertEquals(5, m.get("count"));
        String hash = String.valueOf(m.get("hash"));
        assertTrue(hash.matches("[0-9a-f]{16}"));
        assertEquals("5-" + hash, m.get("version"));
    }

    @Test
    @DisplayName("manifest/snapshot 의 hash 는 서로 일치하고 반복 호출에도 안정적")
    void manifestSnapshotHashesAgree() {
        Map<String, Object> m1 = controller.manifest();
        Map<String, Object> m2 = controller.manifest();
        Map<String, Object> snap = controller.snapshot();
        assertEquals(m1.get("hash"), m2.get("hash"), "manifest hash must be stable across calls");
        assertEquals(m1.get("hash"), snap.get("hash"), "snapshot hash must match manifest");
        assertEquals(m1.get("version"), snap.get("version"));
    }

    @Test
    @DisplayName("snapshot: 시드 폴백은 entries 를 count 만큼 담아 반환")
    void snapshotSeedFallback() {
        Map<String, Object> snap = controller.snapshot();
        Object entries = snap.get("entries");
        assertTrue(entries instanceof List<?>);
        assertEquals(5, ((List<?>) entries).size());
        assertEquals(5, snap.get("count"));
    }

    @Test
    @DisplayName("delta: PG 미가동 → 빈 added/removed 로 안전 응답(500 없음)")
    void deltaSafeWhenDown() {
        Map<String, Object> d = controller.delta("2026-01-01T00:00:00Z");
        assertEquals("scamgraph-blocklist-1", d.get("format"));
        assertEquals(0, d.get("count"));
        assertTrue(d.get("added") instanceof List<?> added && added.isEmpty());
        assertTrue(d.get("removed") instanceof List<?> removed && removed.isEmpty());
    }
}
