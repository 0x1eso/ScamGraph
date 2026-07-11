package io.scamgraph.mobile

import android.Manifest
import android.app.role.RoleManager
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.annotation.RequiresApi
import androidx.core.app.ActivityCompat
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

/**
 * Flutter 호스트 액티비티 + 브릿지 MethodChannel.
 *
 * Dart 는 채널을 통해:
 *  - 게이트웨이 base URL·히스토리·임의 설정(blocklist 캐시 등)을 네이티브 prefs 에 저장/조회
 *  - SMS·전화·알림 런타임 권한 요청
 *  - CALL_SCREENING 역할 요청/보유 여부 확인
 *
 * 그리고 네이티브는 다른 앱에서 공유(ACTION_SEND)된 텍스트를 별도 채널로 Dart 에 전달한다.
 */
class MainActivity : FlutterActivity() {

    private companion object {
        const val CONFIG_CHANNEL = "io.scamgraph.mobile/config"
        const val SHARE_CHANNEL = "io.scamgraph.mobile/share"
        const val REQUEST_PERMISSIONS = 4201
        const val REQUEST_ROLE = 4202
    }

    private var shareChannel: MethodChannel? = null
    private var pendingSharedText: String? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CONFIG_CHANNEL)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "getBaseUrl" -> result.success(
                        prefs().getString(Prefs.KEY_BASE_URL, Prefs.DEFAULT_BASE_URL),
                    )

                    "setBaseUrl" -> {
                        val url = call.argument<String>("baseUrl") ?: Prefs.DEFAULT_BASE_URL
                        prefs().edit().putString(Prefs.KEY_BASE_URL, url).apply()
                        result.success(null)
                    }

                    "getHistory" -> result.success(
                        prefs().getString(Prefs.KEY_HISTORY, ""),
                    )

                    "setHistory" -> {
                        val history = call.argument<String>("history") ?: ""
                        prefs().edit().putString(Prefs.KEY_HISTORY, history).apply()
                        result.success(null)
                    }

                    "getPref" -> {
                        val key = call.argument<String>("key")
                        result.success(if (key == null) null else prefs().getString(key, null))
                    }

                    "setPref" -> {
                        val key = call.argument<String>("key")
                        val value = call.argument<String>("value") ?: ""
                        if (key != null) prefs().edit().putString(key, value).apply()
                        result.success(null)
                    }

                    "requestPermissions" -> {
                        requestRuntimePermissions()
                        result.success(true)
                    }

                    "isCallScreeningRoleHeld" ->
                        result.success(isCallScreeningRoleHeld())

                    "requestCallScreeningRole" -> {
                        requestCallScreeningRole()
                        result.success(true)
                    }

                    else -> result.notImplemented()
                }
            }

        val share = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, SHARE_CHANNEL)
        share.setMethodCallHandler { call, result ->
            when (call.method) {
                "getInitialSharedText" -> {
                    // 콜드 스타트 공유 텍스트를 한 번만 전달하고 소비한다.
                    val text = pendingSharedText
                    pendingSharedText = null
                    result.success(text)
                }

                else -> result.notImplemented()
            }
        }
        shareChannel = share

        // 앱이 공유로 처음 켜졌다면(콜드 스타트) 런치 인텐트에서 텍스트를 캡처한다.
        pendingSharedText = extractSharedText(intent)
    }

    /** 앱이 실행 중일 때 도착한 공유(웜 공유)를 Dart 로 push 한다. */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        val text = extractSharedText(intent) ?: return
        val channel = shareChannel
        if (channel != null) {
            channel.invokeMethod("onSharedText", text)
        } else {
            pendingSharedText = text
        }
    }

    private fun extractSharedText(intent: Intent?): String? {
        if (intent == null) return null
        if (intent.action == Intent.ACTION_SEND && intent.type == "text/plain") {
            return intent.getStringExtra(Intent.EXTRA_TEXT)
        }
        return null
    }

    private fun prefs() =
        getSharedPreferences(Prefs.PREFS_NAME, Context.MODE_PRIVATE)

    private fun requestRuntimePermissions() {
        val permissions = mutableListOf(
            Manifest.permission.RECEIVE_SMS,
            Manifest.permission.READ_SMS,
            Manifest.permission.READ_PHONE_STATE,
            Manifest.permission.READ_CALL_LOG,
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permissions.add(Manifest.permission.POST_NOTIFICATIONS)
        }
        ActivityCompat.requestPermissions(
            this, permissions.toTypedArray(), REQUEST_PERMISSIONS,
        )
    }

    private fun isCallScreeningRoleHeld(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return false
        val roleManager = getSystemService(RoleManager::class.java) ?: return false
        return roleManager.isRoleAvailable(RoleManager.ROLE_CALL_SCREENING) &&
            roleManager.isRoleHeld(RoleManager.ROLE_CALL_SCREENING)
    }

    @RequiresApi(Build.VERSION_CODES.Q)
    private fun requestCallScreeningRoleInternal() {
        val roleManager = getSystemService(RoleManager::class.java) ?: return
        if (!roleManager.isRoleAvailable(RoleManager.ROLE_CALL_SCREENING)) return
        if (roleManager.isRoleHeld(RoleManager.ROLE_CALL_SCREENING)) return
        val intent: Intent =
            roleManager.createRequestRoleIntent(RoleManager.ROLE_CALL_SCREENING)
        startActivityForResult(intent, REQUEST_ROLE)
    }

    private fun requestCallScreeningRole() {
        // CALL_SCREENING 역할은 Android 10(API 29)+ 에서만 제공된다.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            requestCallScreeningRoleInternal()
        }
    }
}
