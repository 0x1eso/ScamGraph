package io.scamgraph.mobile

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

/**
 * 네이티브 고우선순위 위험 알림. SMS/통화 감지 시 사용한다.
 *
 * Flutter 측 로컬 알림과 별개의 채널("scamgraph_alerts")을 쓴다 —
 * 이쪽은 앱 UI 없이 백그라운드에서 게시된다.
 */
object Alerts {

    const val CHANNEL_ID = "scamgraph_alerts"
    private const val CHANNEL_NAME = "ScamGraph 위험 알림"
    private const val CHANNEL_DESC = "SMS 링크·통화 위험 감지 시 즉시 알립니다."

    fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_HIGH,
            ).apply { description = CHANNEL_DESC }
            val manager = context.getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(channel)
        }
    }

    /** 위험 알림 게시. 알림 권한이 없으면 조용히 무시한다. */
    fun post(context: Context, id: Int, title: String, text: String) {
        ensureChannel(context)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(
                context, Manifest.permission.POST_NOTIFICATIONS,
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            return
        }

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_warning)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setAutoCancel(true)
            .build()

        NotificationManagerCompat.from(context).notify(id, notification)
    }
}
