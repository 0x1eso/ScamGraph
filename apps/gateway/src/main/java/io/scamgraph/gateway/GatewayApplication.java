package io.scamgraph.gateway;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * ScamGraph API 게이트웨이.
 * 프론트(web) ↔ 분석 엔진(engine) 사이의 관문. 인증/RBAC, 공개 API, WebSocket 허브 담당.
 */
@SpringBootApplication
public class GatewayApplication {
    public static void main(String[] args) {
        SpringApplication.run(GatewayApplication.class, args);
    }
}
