package io.scamgraph.mobile

import android.content.Context
import android.content.SharedPreferences

/**
 * Flutter 와 공유하는 단일 SharedPreferences 저장소.
 *
 * Dart(설정 화면·blocklist 동기화)가 쓰고, 네이티브(SmsReceiver·CallScreeningService)가 읽는다
 * — 단일 진실 공급원. base URL·히스토리·캐시된 blocklist 를 담는다.
 */
object Prefs {

    const val PREFS_NAME = "scamgraph_prefs"
    const val KEY_BASE_URL = "base_url"
    const val KEY_HISTORY = "history"
    const val KEY_BLOCKLIST = "blocklist"
    const val DEFAULT_BASE_URL = "http://10.0.2.2:8080"

    fun get(context: Context): SharedPreferences =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun baseUrl(context: Context): String =
        (get(context).getString(KEY_BASE_URL, DEFAULT_BASE_URL) ?: DEFAULT_BASE_URL).trimEnd('/')

    /** Dart 가 캐시한 blocklist entries JSON (없으면 null). */
    fun blocklistJson(context: Context): String? =
        get(context).getString(KEY_BLOCKLIST, null)
}
