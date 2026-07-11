import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

import 'app_state.dart';
import 'screens/risk_screen.dart';

/// Android `ACTION_SEND`(text/plain) 공유 수신을 처리한다.
///
/// 콜드 스타트(앱이 공유로 처음 켜짐)와 웜 공유(이미 실행 중)를 모두 지원한다:
///  - 콜드: [start] 에서 `getInitialSharedText` 로 대기 중인 공유 텍스트를 당겨온다.
///  - 웜: 네이티브가 `onSharedText` 를 push 하면 즉시 검사 화면으로 이동한다.
class ShareHandler {
  ShareHandler({required this.navigatorKey, required this.appState});

  final GlobalKey<NavigatorState> navigatorKey;
  final AppState appState;

  static const MethodChannel _channel =
      MethodChannel('io.scamgraph.mobile/share');

  void start() {
    _channel.setMethodCallHandler(_onCall);
    // 네비게이터가 준비된 첫 프레임 이후에 콜드 스타트 공유를 확인한다.
    WidgetsBinding.instance.addPostFrameCallback((_) => _checkInitial());
  }

  Future<dynamic> _onCall(MethodCall call) async {
    if (call.method == 'onSharedText') {
      _openRisk(call.arguments as String?);
    }
    return null;
  }

  Future<void> _checkInitial() async {
    try {
      final text = await _channel.invokeMethod<String>('getInitialSharedText');
      _openRisk(text);
    } on PlatformException {
      // 네이티브 미구현/실패는 무시 — 공유 없이 정상 기동.
    }
  }

  void _openRisk(String? text) {
    final value = text?.trim();
    if (value == null || value.isEmpty) return;
    final nav = navigatorKey.currentState;
    if (nav == null) return;
    nav.push(
      MaterialPageRoute<void>(
        builder: (_) => RiskScreen(appState: appState, sharedValue: value),
      ),
    );
  }
}
