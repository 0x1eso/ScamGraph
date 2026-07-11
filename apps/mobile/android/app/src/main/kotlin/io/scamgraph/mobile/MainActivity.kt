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
 * Flutter 호스트 액티비티 + 설정/권한 브릿지 MethodChannel.
 *
 * Dart 는 이 채널을 통해:
 *  - 게이트웨이 base URL·히스토리를 네이티브 SharedPreferences 에 저장/조회
 *  - SMS·전화·알림 런타임 권한 요청
 *  - CALL_SCREENING 역할 요청/보유 여부 확인
 */
class MainActivity : FlutterActivity() {

    private companion object {
        const val CHANNEL = "io.scamgraph.mobile/config"
        const val REQUEST_PERMISSIONS = 4201
        const val REQUEST_ROLE = 4202
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "getBaseUrl" -> result.success(
                        prefs().getString(
                            GatewayClient.KEY_BASE_URL,
                            GatewayClient.DEFAULT_BASE_URL,
                        ),
                    )

                    "setBaseUrl" -> {
                        val url = call.argument<String>("baseUrl")
                            ?: GatewayClient.DEFAULT_BASE_URL
                        prefs().edit().putString(GatewayClient.KEY_BASE_URL, url).apply()
                        result.success(null)
                    }

                    "getHistory" -> result.success(
                        prefs().getString(GatewayClient.KEY_HISTORY, ""),
                    )

                    "setHistory" -> {
                        val history = call.argument<String>("history") ?: ""
                        prefs().edit().putString(GatewayClient.KEY_HISTORY, history).apply()
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
    }

    private fun prefs() =
        getSharedPreferences(GatewayClient.PREFS_NAME, Context.MODE_PRIVATE)

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
