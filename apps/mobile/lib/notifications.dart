import 'package:flutter_local_notifications/flutter_local_notifications.dart';

/// Dart 측 로컬 알림 (수동 검사에서 위험 감지 시 사용).
///
/// SMS·통화 자동 알림은 앱 UI 없이 실행되므로 네이티브(Kotlin)에서 별도로 띄운다.
/// 이 클래스는 Flutter 엔진이 살아 있는 동안의 알림만 담당한다.
class LocalNotifications {
  LocalNotifications._();
  static final LocalNotifications instance = LocalNotifications._();

  static const String _channelId = 'scamgraph_manual';
  static const String _channelName = 'ScamGraph 검사 알림';
  static const String _channelDesc = '수동 검사에서 위험이 감지되면 알립니다.';

  final FlutterLocalNotificationsPlugin _plugin =
      FlutterLocalNotificationsPlugin();
  bool _initialized = false;

  Future<void> init() async {
    if (_initialized) return;

    const androidInit =
        AndroidInitializationSettings('@drawable/ic_launcher');
    const settings = InitializationSettings(android: androidInit);
    await _plugin.initialize(settings);

    const channel = AndroidNotificationChannel(
      _channelId,
      _channelName,
      description: _channelDesc,
      importance: Importance.high,
    );
    await _plugin
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(channel);

    _initialized = true;
  }

  /// Android 13+ 알림 권한 요청 (거부돼도 앱은 정상 동작).
  Future<void> requestPermission() async {
    await init();
    await _plugin
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>()
        ?.requestNotificationsPermission();
  }

  Future<void> showAlert(String title, String body) async {
    await init();
    const details = NotificationDetails(
      android: AndroidNotificationDetails(
        _channelId,
        _channelName,
        channelDescription: _channelDesc,
        importance: Importance.high,
        priority: Priority.high,
        styleInformation: BigTextStyleInformation(''),
      ),
    );
    final id = DateTime.now().millisecondsSinceEpoch.remainder(100000);
    await _plugin.show(id, title, body, details);
  }
}
