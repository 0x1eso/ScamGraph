package io.scamgraph.gateway;

/**
 * URL → 호스트 정규화 공용 유틸. CheckController·CampaignController·ReportDefense 가 공유한다.
 * (이전에는 세 곳에 동일 구현이 복제돼 있었다 → 단일 소스로 통합.)
 */
final class HostUtil {

    private HostUtil() {}

    /** URL 이면 호스트만 추출(그래프 노드 id 와 매칭). 그 외엔 원본 소문자 트림. */
    static String hostOf(String value) {
        String v = value == null ? "" : value.trim();
        int scheme = v.indexOf("://");
        if (scheme >= 0) v = v.substring(scheme + 3);
        int at = v.indexOf('@');
        if (at >= 0) v = v.substring(at + 1);
        int slash = v.indexOf('/');
        if (slash >= 0) v = v.substring(0, slash);
        int colon = v.indexOf(':');
        if (colon >= 0) v = v.substring(0, colon);
        return v.toLowerCase();
    }
}
