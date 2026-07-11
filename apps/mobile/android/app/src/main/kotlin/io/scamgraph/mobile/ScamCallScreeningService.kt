package io.scamgraph.mobile

import android.os.Build
import android.telecom.Call
import android.telecom.CallScreeningService
import java.util.concurrent.Executors

/**
 * 수신 전화 스크리닝. 알 수 없는 발신 번호를 게이트웨이로 검사하고,
 * warning/danger 이면 알림을 게시한다. 기본은 통화를 허용(allow)하며,
 * 원할 경우 danger 통화를 자동 차단하도록 아래 주석을 해제한다.
 *
 * 이 서비스는 CALL_SCREENING 역할이 부여돼야 Telecom 이 바인딩한다.
 * 역할 요청은 [MainActivity] 의 MethodChannel 에서 RoleManager 로 수행한다.
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
            val result = GatewayClient.check(context, number)
            if (result != null && result.isRisky) {
                val title =
                    if (result.grade == "danger") "🚨 위험 번호 수신" else "⚠️ 주의 번호 수신"
                val text = buildString {
                    append(number)
                    if (result.recommendation.isNotBlank()) {
                        append('\n')
                        append(result.recommendation)
                    }
                }
                Alerts.post(context, number.hashCode(), title, text)

                // 위험 통화를 자동 차단하려면 아래 주석을 해제:
                // if (result.grade == "danger") {
                //     respondDisallow(callDetails)
                //     return@execute
                // }
            }
            respondAllow(callDetails)
        }
    }

    private fun respondAllow(details: Call.Details) {
        respondToCall(details, CallResponse.Builder().build())
    }

    @Suppress("unused")
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
