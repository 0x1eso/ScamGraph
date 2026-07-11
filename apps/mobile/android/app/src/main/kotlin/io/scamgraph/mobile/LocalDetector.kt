package io.scamgraph.mobile

import android.content.Context
import org.json.JSONArray

/** 백그라운드 로컬 판정 결과. */
data class LocalVerdict(
    val grade: String,          // "danger" | "warning" | "caution" | "safe"
    val reasons: List<String>,
    val source: String?,        // blocklist 등재 출처 (있으면)
) {
    val isDanger: Boolean get() = grade == "danger"
    val isRisky: Boolean get() = grade == "danger" || grade == "warning"
    val isNotable: Boolean get() = isRisky || grade == "caution"
}

/** 캐시된 blocklist 한 건 (Dart 가 동기화한 JSON 미러). */
private data class BlockEntry(
    val value: String,
    val kind: String,
    val source: String,
    val severity: String,
)

/**
 * 네트워크 없이 동작하는 경량 로컬 위협 판정.
 *
 * 1순위: Dart 가 캐시한 **로컬 blocklist** 대조(도메인·전화) — 확인된 위협.
 * 2순위: 소수의 강신호 휴리스틱(위험 TLD·피싱 키워드·IP 호스트·VoIP/국제 발신).
 *
 * 전체 규칙엔진은 Dart(`quick_assess.dart`)가 담당하며, 여기서는 응답 지연이 중요한
 * 통화 스크리닝·SMS 수신에서 즉답하기 위한 최소 검사만 수행한다.
 */
object LocalDetector {

    // 등급 임계값 (contract grade_thresholds 미러).
    private const val T_DANGER = 70
    private const val T_WARNING = 35
    private const val T_CAUTION = 15

    fun assess(context: Context, rawValue: String): LocalVerdict {
        val value = rawValue.trim()
        if (value.isEmpty()) return LocalVerdict("safe", emptyList(), null)

        val entries = loadBlocklist(context)
        return if (looksLikePhone(value)) {
            assessPhone(value, entries)
        } else {
            assessUrl(context, value, entries)
        }
    }

    // --- 전화 ---

    private fun assessPhone(
        value: String,
        entries: List<BlockEntry>,
    ): LocalVerdict {
        val digits = value.filter { it.isDigit() }

        // blocklist 대조 (확인된 위협).
        for (e in entries) {
            if (e.kind != "phone") continue
            if (e.value.filter { it.isDigit() } == digits) {
                val grade = if (e.severity == "warning") "warning" else "danger"
                return LocalVerdict(grade, listOf("위협 피드 등재(${e.source})"), e.source)
            }
        }

        // 휴리스틱.
        val reasons = ArrayList<String>()
        var score = 0
        if (digits.startsWith("070") || digits.startsWith("050")) {
            score += 20
            reasons.add("인터넷전화(070/050) — 발신 위장에 자주 사용")
        }
        if (digits.startsWith("00") || value.startsWith("+")) {
            score += 15
            reasons.add("국제전화 발신")
        }
        return LocalVerdict(gradeOf(score), reasons, null)
    }

    // --- URL / 도메인 ---

    private fun assessUrl(
        context: Context,
        value: String,
        entries: List<BlockEntry>,
    ): LocalVerdict {
        val host = hostOf(value)

        // blocklist 대조 (확인된 위협).
        for (e in entries) {
            if (e.kind == "phone") continue
            val ev = e.value.lowercase()
            if (ev == value.lowercase() || ev == host ||
                (host.isNotEmpty() && host.endsWith(".$ev"))
            ) {
                val grade = if (e.severity == "warning") "warning" else "danger"
                return LocalVerdict(grade, listOf("위협 피드 등재(${e.source})"), e.source)
            }
        }

        // 휴리스틱 (경량).
        val reasons = ArrayList<String>()
        var score = 0

        val labels = if (host.isEmpty()) emptyList() else host.split(".")
        val namePart = if (labels.size >= 2) labels.dropLast(1).joinToString(".") else host
        val tld = labels.lastOrNull() ?: ""

        if (LocalRules.suspiciousTlds(context).contains(tld)) {
            score += 22
            reasons.add("위험 TLD '.$tld'")
        }

        val keywords = LocalRules.phishKeywords(context)
        val tokens = namePart.split(Regex("[.\\-_]")).filter { it.length >= 3 }
        val hits = tokens.filter { keywords.contains(it) }
        if (hits.isNotEmpty()) {
            score += minOf(16 + (hits.size - 1) * 8, 30)
            reasons.add("피싱 유도 키워드: ${hits.joinToString(", ")}")
        }

        if (host.isNotEmpty() && Regex("^[0-9.]+$").matches(host)) {
            score += 30
            reasons.add("도메인 대신 IP 주소 사용")
        }

        if (value.contains("@")) {
            score += 25
            reasons.add("URL 내 '@' — 실제 목적지 은폐")
        }

        return LocalVerdict(gradeOf(score), reasons, null)
    }

    // --- 헬퍼 ---

    private fun gradeOf(score: Int): String = when {
        score >= T_DANGER -> "danger"
        score >= T_WARNING -> "warning"
        score >= T_CAUTION -> "caution"
        else -> "safe"
    }

    private fun looksLikePhone(value: String): Boolean {
        if (value.any { it.isLetter() } || value.contains("/")) return false
        val digits = value.filter { it.isDigit() }
        return digits.length in 9..11
    }

    /** URL 이면 호스트만 추출(소문자). userinfo(@)·경로·쿼리·포트 제거 — Dart hostOf 미러. */
    private fun hostOf(target: String): String {
        var v = target.trim()
        val scheme = v.indexOf("://")
        if (scheme >= 0) v = v.substring(scheme + 3)
        val at = v.indexOf('@')
        if (at >= 0) v = v.substring(at + 1)
        val slash = v.indexOf('/')
        if (slash >= 0) v = v.substring(0, slash)
        val query = v.indexOf('?')
        if (query >= 0) v = v.substring(0, query)
        val colon = v.indexOf(':')
        if (colon >= 0) v = v.substring(0, colon)
        return v.lowercase()
    }

    private fun loadBlocklist(context: Context): List<BlockEntry> {
        val raw = Prefs.blocklistJson(context) ?: return SEED
        return try {
            val arr = JSONArray(raw)
            val out = ArrayList<BlockEntry>(arr.length())
            for (i in 0 until arr.length()) {
                val o = arr.optJSONObject(i) ?: continue
                val value = o.optString("value")
                if (value.isNullOrEmpty()) continue
                out.add(
                    BlockEntry(
                        value = value,
                        kind = o.optString("kind", "domain"),
                        source = o.optString("source", "unknown"),
                        severity = o.optString("severity", "danger"),
                    ),
                )
            }
            if (out.isEmpty()) SEED else out
        } catch (_: Exception) {
            SEED
        }
    }

    /** Dart 가 아직 동기화 못 했을 때의 내장 시드 (게이트웨이 seed 미러). */
    private val SEED = listOf(
        BlockEntry("secure-tosspay.info", "domain", "urlhaus", "danger"),
        BlockEntry("naver-security-check.xyz", "domain", "openphish", "danger"),
        BlockEntry("kbstar-otp.live", "domain", "threatfox", "danger"),
        BlockEntry("cj-delivery-check.top", "domain", "openphish", "danger"),
        BlockEntry("070-8890-1234", "phone", "police_kr", "warning"),
    )
}
