package io.scamgraph.gateway;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Swagger UI(/docs) 문서 메타/보안 스킴 정의.
 * ApiKey 스킴은 문서 표기용 — 실제 엔드포인트에 강제하지 않는다(데모 세이프).
 */
@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI customOpenAPI() {
        return new OpenAPI()
                .info(new Info()
                        .title("ScamGraph API")
                        .version("0.1.0")
                        .description("실시간 사기·피싱 위협 인텔리전스 공개 API — SDG 16"))
                .components(new Components()
                        .addSecuritySchemes("ApiKey", new SecurityScheme()
                                .type(SecurityScheme.Type.APIKEY)
                                .in(SecurityScheme.In.HEADER)
                                .name("X-API-Key")))
                .addSecurityItem(new SecurityRequirement().addList("ApiKey"));
    }
}
