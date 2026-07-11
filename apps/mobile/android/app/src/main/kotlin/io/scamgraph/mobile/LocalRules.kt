package io.scamgraph.mobile

import android.content.Context
import org.json.JSONObject

/**
 * 백그라운드(SMS·통화)용 경량 규칙 상수.
 *
 * Dart 오프라인 엔진과 동일한 번들 자산(`flutter_assets/assets/rules.json`)에서
 * 위험 TLD·피싱 키워드 목록을 읽어 **목록 단위 parity** 를 유지한다.
 * (전체 규칙엔진 포팅은 Dart 쪽 `quick_assess.dart` 가 담당하고, 여기서는
 *  blocklist 대조 + 소수의 강신호만 쓰는 경량 검사를 한다.)
 *
 * 자산 로드에 실패하면 하드코딩 폴백 상수를 쓴다(데모 세이프).
 */
object LocalRules {

    private const val ASSET_PATH = "flutter_assets/assets/rules.json"

    @Volatile
    private var loaded = false
    private var suspiciousTlds: Set<String> = FALLBACK_TLDS
    private var phishKeywords: Set<String> = FALLBACK_KEYWORDS

    fun suspiciousTlds(context: Context): Set<String> {
        ensureLoaded(context)
        return suspiciousTlds
    }

    fun phishKeywords(context: Context): Set<String> {
        ensureLoaded(context)
        return phishKeywords
    }

    @Synchronized
    private fun ensureLoaded(context: Context) {
        if (loaded) return
        try {
            val raw = context.assets.open(ASSET_PATH).bufferedReader(Charsets.UTF_8)
                .use { it.readText() }
            val constants = JSONObject(raw).optJSONObject("constants")
            if (constants != null) {
                readStringArray(constants, "suspicious_tlds")?.let { suspiciousTlds = it }
                readStringArray(constants, "phish_keywords")?.let { phishKeywords = it }
            }
        } catch (_: Exception) {
            // 폴백 상수 유지.
        } finally {
            loaded = true
        }
    }

    private fun readStringArray(obj: JSONObject, key: String): Set<String>? {
        val arr = obj.optJSONArray(key) ?: return null
        val out = HashSet<String>(arr.length())
        for (i in 0 until arr.length()) {
            out.add(arr.optString(i))
        }
        return out
    }

    private val FALLBACK_TLDS = setOf(
        "zip", "mov", "top", "xyz", "click", "country", "gq", "tk", "ml",
        "cf", "ga", "work", "rest", "fit", "loan", "men", "cyou", "sbs", "quest",
    )

    private val FALLBACK_KEYWORDS = setOf(
        "secure", "login", "verify", "otp", "update", "account", "confirm",
        "delivery", "track", "parcel", "pay", "refund", "bank", "police",
        "court", "customs", "tax", "subsidy", "reward", "prize", "urgent",
    )
}
