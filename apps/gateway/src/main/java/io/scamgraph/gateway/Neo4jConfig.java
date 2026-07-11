package io.scamgraph.gateway;

import org.neo4j.driver.AuthTokens;
import org.neo4j.driver.Driver;
import org.neo4j.driver.GraphDatabase;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Neo4j 드라이버 빈. 생성 시 실제 연결하지 않고 지연 연결하므로
 * Neo4j 가 떠 있지 않아도 게이트웨이 기동에는 영향이 없다.
 */
@Configuration
public class Neo4jConfig {

    @Bean(destroyMethod = "close")
    public Driver neo4jDriver(
            @Value("${neo4j.uri}") String uri,
            @Value("${neo4j.user}") String user,
            @Value("${neo4j.password}") String password) {
        return GraphDatabase.driver(uri, AuthTokens.basic(user, password));
    }
}
