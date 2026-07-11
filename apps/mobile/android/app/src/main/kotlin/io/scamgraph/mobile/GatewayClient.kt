package io.scamgraph.mobile

import android.content.Context
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/**
 * 네이티브(BroadcastReceiver·CallScreeningService)에서 사용하는 얇은 게이트웨이 클라이언트.
 *
 * Flutter 엔진 없이도 동작해야 하므로 순수 [HttpURLConnection] 으로 `/api/check` 를 호출한다.
 * base URL 은 Flutter 설정 화면이 저장하는 SharedPreferences 를 그대로 읽는다
 * (단일 진실 공급원).
 */
object GatewayClient {

    const val PREFS_NAME = "scamgraph_prefs"
    const val KEY_BASE_URL = "base_url"
    const val KEY_HISTORY = "history"
    const val DEFAULT_BASE_URL = "http://10.0.2.2:8080"

    private const val TIMEOUT_MS = 5000

    /** SharedPreferences 에 저장된 게이트웨이 base URL (없으면 기본값). */
    fun baseUrl(context: Context): String {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val stored = prefs.getString(KEY_BASE_URL, DEFAULT_BASE_URL) ?: DEFAULT_BASE_URL
        return stored.trimEnd('/')
    }

    /**
     * [value] (URL·전화번호·계좌)를 게이트웨이로 검사한다.
     * 실패(네트워크·비200·파싱)하면 조용히 null 을 반환한다 — 백그라운드에서 예외를 던지지 않는다.
     */
    fun check(context: Context, value: String): CheckLite? {
        val base = baseUrl(context)
        val encoded = URLEncoder.encode(value, "UTF-8")
        val url = URL("$base/api/check?value=$encoded")

        var conn: HttpURLConnection? = null
        return try {
            conn = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = TIMEOUT_MS
                readTimeout = TIMEOUT_MS
                setRequestProperty("Accept", "application/json")
            }
            if (conn.responseCode != HttpURLConnection.HTTP_OK) return null
            val body = conn.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
            parse(body)
        } catch (_: Exception) {
            null
        } finally {
            conn?.disconnect()
        }
    }

    private fun parse(body: String): CheckLite {
        val json = JSONObject(body)
        val riskScore = if (json.isNull("risk_score")) null else json.optInt("risk_score")
        val organization =
            if (json.isNull("organization")) null else json.optString("organization")
        return CheckLite(
            value = json.optString("value"),
            kind = json.optString("kind", "url"),
            grade = json.optString("grade", "unknown"),
            riskScore = riskScore,
            organization = organization,
            recommendation = json.optString("recommendation", ""),
        )
    }
}

/** 네이티브에서 필요한 최소 판정 결과. */
data class CheckLite(
    val value: String,
    val kind: String,
    val grade: String,
    val riskScore: Int?,
    val organization: String?,
    val recommendation: String,
) {
    val isRisky: Boolean get() = grade == "danger" || grade == "warning"
}
