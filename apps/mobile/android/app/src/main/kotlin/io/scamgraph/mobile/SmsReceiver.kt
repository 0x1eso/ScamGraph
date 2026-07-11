package io.scamgraph.mobile

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.util.Patterns
import java.util.concurrent.Executors

/**
 * 수신 SMS 를 가로채 본문에서 URL·전화번호를 추출하고, 각 값을 게이트웨이로 검사한다.
 * 등급이 warning/danger 이면 고우선순위 알림을 게시한다.
 *
 * 네트워크 호출은 [goAsync] + 백그라운드 스레드에서 수행한다
 * (BroadcastReceiver.onReceive 는 메인 스레드이므로 블로킹 금지).
 */
class SmsReceiver : BroadcastReceiver() {

    private val executor = Executors.newSingleThreadExecutor()

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
        if (messages.isEmpty()) return

        val sender = messages.firstOrNull()?.displayOriginatingAddress ?: ""
        val body = messages.joinToString("") { it.messageBody ?: "" }
        if (body.isBlank()) return

        val appContext = context.applicationContext
        val pending = goAsync()
        executor.execute {
            try {
                scanMessage(appContext, sender, body)
            } finally {
                pending.finish()
            }
        }
    }

    private fun scanMessage(context: Context, sender: String, body: String) {
        // 중복 제거를 위해 삽입 순서를 유지하는 Set.
        val candidates = LinkedHashSet<String>()
        candidates.addAll(extractUrls(body))
        candidates.addAll(extractPhones(body))
        // 발신 번호 자체도 검사 대상.
        extractPhones(sender).firstOrNull()?.let { candidates.add(it) }

        for (value in candidates) {
            val result = GatewayClient.check(context, value) ?: continue
            if (!result.isRisky) continue

            val title = if (result.grade == "danger") "🚨 위험 링크/번호 감지" else "⚠️ 주의"
            val text = buildString {
                append(value)
                if (result.recommendation.isNotBlank()) {
                    append('\n')
                    append(result.recommendation)
                }
            }
            Alerts.post(context, value.hashCode(), title, text)
        }
    }

    /** 본문에서 http(s) URL 을 추출한다 (안드로이드 표준 WEB_URL 패턴). */
    private fun extractUrls(text: String): List<String> {
        val matcher = Patterns.WEB_URL.matcher(text)
        val urls = mutableListOf<String>()
        while (matcher.find()) {
            val match = matcher.group()
            // 순수 도메인(전화번호로 오인될 수 있는)보다 스킴/도트가 있는 링크만.
            if (match.contains("://") || match.contains(".")) {
                urls.add(match)
            }
        }
        return urls
    }

    /** 본문에서 전화번호 후보를 추출한다 (한국 번호 + 일반 국제형). */
    private fun extractPhones(text: String): List<String> {
        val regex = Regex("""(\+?\d[\d\-\s]{7,}\d)""")
        return regex.findAll(text)
            .map { it.value.replace(Regex("""[\s\-]"""), "") }
            .filter { it.length in 9..15 }
            .toList()
    }
}
