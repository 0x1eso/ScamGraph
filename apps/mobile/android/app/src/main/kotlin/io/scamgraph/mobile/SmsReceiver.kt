package io.scamgraph.mobile

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.util.Patterns
import java.util.concurrent.Executors

/**
 * 수신 SMS 를 가로채 본문에서 URL·전화번호를 추출하고, **네트워크 없이 로컬**로 검사한다.
 * 스미싱(warning/danger)이면 고우선순위 알림을 게시한다.
 *
 * - 무해화(defang) 복원: `hxxp`→`http`, `[.]`/`[dot]`→`.` 등 탐지 회피 표기를 원형으로 되돌린다.
 * - 판정: [LocalDetector] (로컬 blocklist + 경량 휴리스틱). 게이트웨이 의존 없음 → 즉답·오프라인.
 *
 * 네트워크가 아닌 로컬 검사이므로 빠르지만, onReceive 블로킹을 피해 goAsync + 백그라운드 스레드로 처리한다.
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
        val refanged = refang(body)

        // 삽입 순서 유지 + 중복 제거.
        val candidates = LinkedHashSet<String>()
        candidates.addAll(extractUrls(refanged))
        candidates.addAll(extractPhones(refanged))
        // 발신 번호 자체도 검사 대상.
        extractPhones(sender).firstOrNull()?.let { candidates.add(it) }

        for (value in candidates) {
            val verdict = LocalDetector.assess(context, value)
            if (!verdict.isRisky) continue

            val title = if (verdict.isDanger) "🚨 스미싱 위험 감지" else "⚠️ 의심 링크 주의"
            val text = buildString {
                append(value)
                if (verdict.reasons.isNotEmpty()) {
                    append('\n')
                    append(verdict.reasons.joinToString(" · "))
                }
                append("\n링크를 누르지 말고 개인정보·인증번호를 입력하지 마세요.")
            }
            Alerts.post(context, value.hashCode(), title, text)
        }
    }

    /** 무해화(defang)된 링크를 원형으로 복원한다. */
    private fun refang(input: String): String {
        var s = input
        s = s.replace(Regex("h[xX*]{2}ps", RegexOption.IGNORE_CASE), "https")
        s = s.replace(Regex("h[xX*]{2}p", RegexOption.IGNORE_CASE), "http")
        s = s.replace(Regex("[\\[({]\\s*\\.\\s*[\\])}]"), ".")
        s = s.replace(Regex("[\\[({]\\s*dot\\s*[\\])}]", RegexOption.IGNORE_CASE), ".")
        s = s.replace(Regex("\\s+dot\\s+", RegexOption.IGNORE_CASE), ".")
        s = s.replace("[/]", "/")
        return s
    }

    /** 본문에서 http(s) URL 및 스킴 없는 도메인을 추출한다 (안드로이드 표준 WEB_URL 패턴). */
    private fun extractUrls(text: String): List<String> {
        val matcher = Patterns.WEB_URL.matcher(text)
        val urls = mutableListOf<String>()
        while (matcher.find()) {
            val match = matcher.group()
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
