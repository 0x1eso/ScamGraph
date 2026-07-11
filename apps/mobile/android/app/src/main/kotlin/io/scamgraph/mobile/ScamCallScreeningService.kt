package io.scamgraph.mobile

import android.os.Build
import android.telecom.Call
import android.telecom.CallScreeningService
import java.util.concurrent.Executors

/**
 * 수신 전화 스크리닝. 발신 번호를 **로컬** [LocalDetector](blocklist + 경량 휴리스틱)로 즉시 판정한다.
 * 통화 스크리닝은 응답 제한 시간이 짧아 **서버 API 에 의존하지 않고** 로컬로만 판정한다.
 *
 *  - danger(확인된 위험 번호): 통화 **거절/차단** + 위험 알림.
 *  - warning/caution(의심): 통화 **허용** + 주의 알림(라벨).
 *  - safe: 조용히 허용.
 *
 * 이 서비스는 CALL_SCREENING 역할이 부여돼야 Telecom 이 바인딩한다.
 * 역할 요청은 [MainActivity] 의 MethodChannel 에서 RoleManager 로 수행한다.
 *
 * ⚠️ 발신번호는 조작될 수 있으므로(콜러 ID 스푸핑), 판정은 참고 신호로 안내한다.
 */
class ScamCallScreeningService : CallScreeningService() {

    private val executor = Executors.newSingleThreadExecutor()

    override fun onScreenCall(callDetails: Call.Details) {
        // API 29+ 에서는 발신 통화도 전달되므로 수신 통화만 처리한다.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
            callDetails.callDirection != Call.Details.DIRECTION_INCOMING
        ) {
            respondAllow(callDetails)
            return
        }

        val number = callDetails.handle?.schemeSpecificPart
        if (number.isNullOrBlank()) {
            respondAllow(callDetails)
            return
        }

        val context = applicationContext
        executor.execute {
            val verdict = LocalDetector.assess(context, number)
            when {
                verdict.isDanger -> {
                    val text = buildString {
                        append(number)
                        if (verdict.reasons.isNotEmpty()) {
                            append('\n')
                            append(verdict.reasons.joinToString(" · "))
                        }
                        append("\n확인된 위험 번호 — 통화를 차단했습니다.")
                    }
                    Alerts.post(context, number.hashCode(), "🚨 위험 번호 차단", text)
                    respondDisallow(callDetails) // 확인된 위험 = 차단/거절.
                }

                verdict.isNotable -> {
                    val text = buildString {
                        append(number)
                        if (verdict.reasons.isNotEmpty()) {
                            append('\n')
                            append(verdict.reasons.joinToString(" · "))
                        }
                        append("\n의심 번호 — 응답·송금에 주의하세요. (발신번호는 조작될 수 있습니다.)")
                    }
                    Alerts.post(context, number.hashCode(), "⚠️ 의심 번호 수신", text)
                    respondAllow(callDetails) // 의심 = 허용 + 알림.
                }

                else -> respondAllow(callDetails)
            }
        }
    }

    private fun respondAllow(details: Call.Details) {
        respondToCall(details, CallResponse.Builder().build())
    }

    private fun respondDisallow(details: Call.Details) {
        val response = CallResponse.Builder()
            .setDisallowCall(true)
            .setRejectCall(true)
            .setSkipCallLog(false)
            .setSkipNotification(false)
            .build()
        respondToCall(details, response)
    }
}
