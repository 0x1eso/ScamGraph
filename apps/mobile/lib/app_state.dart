import 'package:flutter/foundation.dart';

import 'api.dart';
import 'config_store.dart';
import 'models.dart';

/// 앱 전역 상태: 게이트웨이 base URL + 수동 검사 히스토리.
///
/// `ChangeNotifier` 만 사용해 외부 상태관리 의존성을 두지 않는다.
/// [ListenableBuilder] 로 구독한다.
class AppState extends ChangeNotifier {
  AppState({ConfigStore? config, ApiClient? api})
      : _config = config ?? const ConfigStore(),
        api = api ?? ApiClient();

  final ConfigStore _config;
  final ApiClient api;

  static const int _maxHistory = 100;

  String _baseUrl = ConfigStore.defaultBaseUrl;
  List<CheckResult> _history = const [];
  bool _loaded = false;

  String get baseUrl => _baseUrl;
  List<CheckResult> get history => List.unmodifiable(_history);
  bool get loaded => _loaded;

  ConfigStore get config => _config;

  Future<void> load() async {
    _baseUrl = await _config.getBaseUrl();
    _history = await _config.loadHistory();
    _loaded = true;
    notifyListeners();
  }

  Future<void> setBaseUrl(String url) async {
    final trimmed = url.trim();
    _baseUrl = trimmed.isEmpty ? ConfigStore.defaultBaseUrl : trimmed;
    await _config.setBaseUrl(_baseUrl);
    notifyListeners();
  }

  /// 게이트웨이로 검사하고 결과를 히스토리에 기록한다.
  Future<CheckResult> check(String value) async {
    final result = await api.check(_baseUrl, value);
    _history = [result, ..._history];
    if (_history.length > _maxHistory) {
      _history = _history.sublist(0, _maxHistory);
    }
    await _config.saveHistory(_history);
    notifyListeners();
    return result;
  }

  Future<void> clearHistory() async {
    _history = const [];
    await _config.saveHistory(_history);
    notifyListeners();
  }

  @override
  void dispose() {
    api.close();
    super.dispose();
  }
}
