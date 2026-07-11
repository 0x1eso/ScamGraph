package io.scamgraph.gateway;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

/**
 * 실시간 피드 WebSocket 설정. /ws/feed 엔드포인트에 FeedHandler를 등록하고
 * 하트비트 스케줄링(@Scheduled)을 활성화한다.
 */
@Configuration
@EnableWebSocket
@EnableScheduling
public class FeedConfig implements WebSocketConfigurer {

    private final FeedHandler feedHandler;

    public FeedConfig(FeedHandler feedHandler) {
        this.feedHandler = feedHandler;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(feedHandler, "/ws/feed")
                .setAllowedOriginPatterns("*");
    }
}
