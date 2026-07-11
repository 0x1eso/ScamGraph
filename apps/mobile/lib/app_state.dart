import 'dart:async';

import 'package:flutter/foundation.dart';

import 'api.dart';
import 'config_store.dart';
import 'data/blocklist.dart';
import 'engine/quick_assess.dart';
import 'engine/rule_engine.dart';
import 'models.dart';

/// 앱 전역 상태: 게이트웨이 base URL + 검사 히스토리 + 오프라인 규칙엔진/blocklist.
///
/// `ChangeNotifier` 만 사용해 외부 상태관리 의존성을 두지 않는다.
/// [ListenableBuilder] 로 구독한다.
///
/// 검사는 **게이트웨이 우선, 실패 시 온‑디바이스 오프라인 폴백**이다:
/// 네트워크·서버가 죽어도 규칙엔진과 로컬 blocklist 로 즉시 판정한다(demo-safe).
class AppState extends ChangeNotifier {
  AppState({ConfigStore? config, ApiClient? api, BlocklistStore? blocklist})
      : _config = config ?? const ConfigStore(),
        api = api ?? ApiClient(),
        blocklist = blocklist ?? BlocklistStore();

  final ConfigStore _config;
  final ApiClient api;
  final BlocklistStore blocklist;

  static const int _maxHistory = 100;

  String _baseUrl = ConfigStore.defaultBaseUrl;
  List<CheckResult> _history = const [];
  bool _loaded = false;
  QuickAssessEngine? _engine;

  String get baseUrl => _baseUrl;
  List<CheckResult> get history => List.unmodifiable(_history);
  bool get loaded => _loaded;

  ConfigStore get config => _config;

  Future<void> load() async {
    _baseUrl = await _config.getBaseUrl();
    _history = await _config.loadHistory();
    await blocklist.load();
    _loaded = true;
    notifyListeners();

    // 규칙엔진 예열 + blocklist 최신화는 백그라운드(best-effort) — 로딩을 막지 않는다.
    unawaited(RuleEngine.warmUp());
    unawaited(syncBlocklist());
  }

  Future<void> setBaseUrl(String url) async {
    final trimmed = url.trim();
    _baseUrl = trimmed.isEmpty ? ConfigStore.defaultBaseUrl : trimmed;
    await _config.setBaseUrl(_baseUrl);
    notifyListeners();
    // 게이트웨이가 바뀌면 blocklist 를 다시 받아 캐시를 갱신한다.
    unawaited(syncBlocklist());
  }

  /// 게이트웨이로 검사하고, 실패 시 오프라인 폴백한다. 결과를 히스토리에 기록한다.
  Future<CheckResult> check(String value) async {
    final trimmed = value.trim();
    if (trimmed.isEmpty) {
      throw const ApiException('검사할 값을 입력하세요.');
    }

    CheckResult result;
    try {
      result = await api.check(_baseUrl, trimmed);
    } on ApiException {
      // 게이트웨이 불가 → 온‑디바이스 오프라인 판정 (demo-safe).
      result = await assessLocally(trimmed);
    }
    await _record(result);
    return result;
  }

  /// 네트워크 없이 온‑디바이스 규칙엔진 + 로컬 blocklist 로 판정한다.
  ///
  /// 공유(Share) 검사·게이트웨이 폴백에서 사용한다. 히스토리에 기록하지 않는다
  /// (호출자가 필요 시 [record] 로 저장).
  Future<CheckResult> assessLocally(String value) async {
    final engine = _engine ?? await RuleEngine.instance();
    _engine = engine;

    final assessment = engine.assess(value);
    var result = assessment.toCheckResult(value);

    // 로컬 blocklist 등재 → danger 승격 + 근거 추가 (게이트웨이 feed-hit 미러).
    final hit = blocklist.match(value);
    if (hit != null) {
      result = _applyBlocklistHit(result, hit);
    }
    return result;
  }

  /// 로컬 판정 결과를 히스토리에 기록한다 (공유 검사 화면 등에서 호출).
  Future<void> record(CheckResult result) => _record(result);

  /// 게이트웨이에서 blocklist 스냅샷을 받아 로컬 캐시를 갱신한다.
  Future<bool> syncBlocklist() async {
    final ok = await blocklist.sync(_baseUrl);
    if (ok) notifyListeners();
    return ok;
  }

  Future<void> clearHistory() async {
    _history = const [];
    await _config.saveHistory(_history);
    notifyListeners();
  }

  CheckResult _applyBlocklistHit(CheckResult base, BlocklistEntry hit) {
    final feedReason = Reason(
      rule: 'external_feed_hit',
      weight: 40,
      detail: '위협 피드 등재(${hit.source}) — 확인된 위험 지표',
    );
    final recommendation =
        '📡 위협 피드 등재(${hit.source}). ${recommendFor(base.kind, Grade.danger)}';
    return CheckResult(
      value: base.value,
      kind: base.kind,
      grade: Grade.danger, // 피드 등재 = 규칙보다 강한 신호(게이트웨이와 동일 규칙).
      // 게이트웨이처럼 규칙 점수는 유지하되 등급만 danger 로 승격한다.
      riskScore: base.riskScore,
      reasons: [feedReason, ...base.reasons],
      organization: base.organization,
      recommendation: recommendation,
      checkedAt: base.checkedAt,
      offline: base.offline,
    );
  }

  Future<void> _record(CheckResult result) async {
    _history = [result, ..._history];
    if (_history.length > _maxHistory) {
      _history = _history.sublist(0, _maxHistory);
    }
    await _config.saveHistory(_history);
    notifyListeners();
  }

  @override
  void dispose() {
    api.close();
    blocklist.close();
    super.dispose();
  }
}
