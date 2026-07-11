package io.scamgraph.gateway;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 클라이언트 IP 단위 토큰 버킷 레이트 리밋. /api/** 에만 적용, /api/health 는 제외.
 * 데모 세이프: LIMIT 넉넉(60초당 600) → 정상 데모/확장 트래픽은 절대 막지 않는다.
 */
@Component
public class RateLimitFilter extends OncePerRequestFilter {

    private static final int LIMIT = 600;
    private static final long WINDOW_MS = 60_000L;

    // IP -> 슬라이딩 없는 고정 윈도우 버킷
    private final ConcurrentHashMap<String, Bucket> buckets = new ConcurrentHashMap<>();

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String uri = request.getRequestURI();
        return uri == null || !uri.startsWith("/api") || uri.startsWith("/api/health");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        String clientIp = clientIp(request);
        int used = buckets.computeIfAbsent(clientIp, k -> new Bucket()).hit();
        int remaining = Math.max(0, LIMIT - used);

        response.setHeader("X-RateLimit-Limit", String.valueOf(LIMIT));
        response.setHeader("X-RateLimit-Remaining", String.valueOf(remaining));

        if (used > LIMIT) {
            response.setStatus(429);
            response.setContentType("application/json");
            response.getWriter().write("{\"error\":\"rate_limit_exceeded\",\"limit\":" + LIMIT
                    + ",\"window_seconds\":" + (WINDOW_MS / 1000) + "}");
            return;
        }

        chain.doFilter(request, response);
    }

    private String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        String remote = request.getRemoteAddr();
        return remote == null ? "unknown" : remote;
    }

    /** 고정 윈도우 카운터. 윈도우가 지나면 리셋. */
    private static final class Bucket {
        private long windowStart = System.currentTimeMillis();
        private int count = 0;

        synchronized int hit() {
            long now = System.currentTimeMillis();
            if (now - windowStart >= WINDOW_MS) {
                windowStart = now;
                count = 0;
            }
            return ++count;
        }
    }
}
