import 'dart:convert';

import 'package:flutter/services.dart';

import 'models.dart';

/// 설정·히스토리 영속화와 네이티브(권한·통화 스크리닝 역할) 브릿지.
///
/// 게이트웨이 base URL 은 **네이티브 SharedPreferences 하나**에만 저장한다.
/// 그래야 Dart UI 와 Kotlin 쪽(SmsReceiver / CallScreeningService)이
/// 같은 값을 읽는다 — 단일 진실 공급원(single source of truth).
class ConfigStore {
  const ConfigStore();

  static const String defaultBaseUrl = 'http://10.0.2.2:8080';

  static const MethodChannel _channel =
      MethodChannel('io.scamgraph.mobile/config');

  Future<String> getBaseUrl() async {
    try {
      final url = await _channel.invokeMethod<String>('getBaseUrl');
      final resolved = (url == null || url.isEmpty) ? defaultBaseUrl : url;
      return resolved;
    } on PlatformException {
      return defaultBaseUrl;
    }
  }

  Future<void> setBaseUrl(String baseUrl) async {
    try {
      await _channel.invokeMethod<void>('setBaseUrl', {'baseUrl': baseUrl});
    } on PlatformException {
      // 저장 실패는 치명적이지 않다 — 다음 실행에서 기본값으로 복귀.
    }
  }

  Future<List<CheckResult>> loadHistory() async {
    try {
      final raw = await _channel.invokeMethod<String>('getHistory');
      if (raw == null || raw.isEmpty) return const [];
      final decoded = jsonDecode(raw);
      if (decoded is! List) return const [];
      return decoded
          .whereType<Map>()
          .map((m) => CheckResult.fromJson(Map<String, dynamic>.from(m)))
          .toList();
    } catch (_) {
      return const [];
    }
  }

  Future<void> saveHistory(List<CheckResult> history) async {
    try {
      final raw = jsonEncode(history.map((r) => r.toJson()).toList());
      await _channel.invokeMethod<void>('setHistory', {'history': raw});
    } on PlatformException {
      // 무시: 히스토리는 부가 기능.
    }
  }

  /// SMS·전화·알림 런타임 권한을 요청한다 (네이티브 다이얼로그).
  Future<void> requestPermissions() async {
    try {
      await _channel.invokeMethod<void>('requestPermissions');
    } on PlatformException {
      // 무시
    }
  }

  /// CALL_SCREENING 역할을 요청한다 (Android 10+ RoleManager).
  Future<void> requestCallScreeningRole() async {
    try {
      await _channel.invokeMethod<void>('requestCallScreeningRole');
    } on PlatformException {
      // 무시
    }
  }

  /// 이 앱이 현재 통화 스크리닝 역할을 보유 중인지.
  Future<bool> isCallScreeningRoleHeld() async {
    try {
      final held = await _channel.invokeMethod<bool>('isCallScreeningRoleHeld');
      return held ?? false;
    } on PlatformException {
      return false;
    }
  }
}
