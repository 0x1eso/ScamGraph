package io.scamgraph.gateway;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 기동 후 위협 카탈로그를 Meilisearch 인덱스("threats")에 색인한다.
 * best-effort — Meili 가 아직 안 떠 있으면 몇 번 재시도하고, 실패해도 게이트웨이는 정상 동작한다.
 * (Meili 문서 primaryKey 는 영숫자/-/_ 만 허용하므로 별도 key 필드 사용.)
 */
@Component
public class SearchIndexer {

    private final RestClient meili;

    public SearchIndexer(RestClient.Builder builder,
                         @Value("${meili.url}") String url,
                         @Value("${meili.key}") String key) {
        this.meili = builder.baseUrl(url)
                .defaultHeader("Authorization", "Bearer " + key)
                .build();
    }

    @EventListener(ApplicationReadyEvent.class)
    public void onReady() {
        Thread t = new Thread(this::indexWithRetry, "meili-indexer");
        t.setDaemon(true);
        t.start();
    }

    private void indexWithRetry() {
        for (int attempt = 0; attempt < 5; attempt++) {
            try {
                index();
                return;
            } catch (Exception e) {
                try {
                    Thread.sleep(3000);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    return;
                }
            }
        }
    }

    private void index() {
        List<Map<String, Object>> base = ThreatCatalog.docs();
        List<Map<String, Object>> docs = new ArrayList<>(base.size());
        for (int i = 0; i < base.size(); i++) {
            Map<String, Object> d = new LinkedHashMap<>(base.get(i));
            d.put("key", "t" + (i + 1)); // Meili primaryKey (영숫자)
            docs.add(d);
        }
        meili.post()
                .uri("/indexes/threats/documents?primaryKey=key")
                .contentType(MediaType.APPLICATION_JSON)
                .body(docs)
                .retrieve()
                .toBodilessEntity();
    }
}
