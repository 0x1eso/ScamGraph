import 'dart:convert';

import 'package:flutter/services.dart' show rootBundle;

import 'quick_assess.dart';

/// 번들 자산(`assets/rules.json`)을 로드해 [QuickAssessEngine] 을 초기화·캐시한다.
///
/// 규칙 정의는 앱 수명 동안 바뀌지 않으므로 한 번만 로드하고 재사용한다.
class RuleEngine {
  RuleEngine._();

  static const String _assetPath = 'assets/rules.json';

  static QuickAssessEngine? _cached;

  /// 초기화된 엔진을 반환한다. 최초 호출 시 자산을 로드한다.
  static Future<QuickAssessEngine> instance() async {
    final cached = _cached;
    if (cached != null) return cached;
    final raw = await rootBundle.loadString(_assetPath);
    final json = jsonDecode(raw) as Map<String, dynamic>;
    final engine = QuickAssessEngine.fromJson(json);
    _cached = engine;
    return engine;
  }

  /// 앱 시작 시 미리 로드해 첫 검사 지연을 없앤다 (best-effort).
  static Future<void> warmUp() async {
    try {
      await instance();
    } catch (_) {
      // 자산 로드 실패는 치명적이지 않다 — 첫 호출에서 재시도.
    }
  }
}
