import 'package:flutter/material.dart';

import 'app_state.dart';
import 'notifications.dart';
import 'screens/family_screen.dart';
import 'screens/history_screen.dart';
import 'screens/manual_check_screen.dart';
import 'screens/settings_screen.dart';
import 'share_handler.dart';
import 'theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await LocalNotifications.instance.init();

  final appState = AppState();
  await appState.load();

  runApp(ScamGraphApp(appState: appState));
}

class ScamGraphApp extends StatefulWidget {
  const ScamGraphApp({super.key, required this.appState});

  final AppState appState;

  @override
  State<ScamGraphApp> createState() => _ScamGraphAppState();
}

class _ScamGraphAppState extends State<ScamGraphApp> {
  final GlobalKey<NavigatorState> _navigatorKey = GlobalKey<NavigatorState>();
  late final ShareHandler _shareHandler;

  @override
  void initState() {
    super.initState();
    // 다른 앱에서 공유(ACTION_SEND)로 넘어온 URL/텍스트를 검사 화면으로 라우팅.
    _shareHandler =
        ShareHandler(navigatorKey: _navigatorKey, appState: widget.appState);
    _shareHandler.start();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'ScamGraph',
      debugShowCheckedModeBanner: false,
      navigatorKey: _navigatorKey,
      theme: buildScamTheme(),
      home: HomeShell(appState: widget.appState),
    );
  }
}

/// 하단 내비게이션 셸: 검사 / 기록 / 가족 / 설정.
class HomeShell extends StatefulWidget {
  const HomeShell({super.key, required this.appState});

  final AppState appState;

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final appState = widget.appState;
    final pages = [
      ManualCheckScreen(appState: appState),
      HistoryScreen(appState: appState),
      FamilyScreen(appState: appState),
      SettingsScreen(appState: appState),
    ];

    return Scaffold(
      body: SafeArea(
        child: IndexedStack(index: _index, children: pages),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.shield_outlined),
            selectedIcon: Icon(Icons.shield),
            label: '검사',
          ),
          NavigationDestination(
            icon: Icon(Icons.history_outlined),
            selectedIcon: Icon(Icons.history),
            label: '기록',
          ),
          NavigationDestination(
            icon: Icon(Icons.groups_outlined),
            selectedIcon: Icon(Icons.groups),
            label: '가족',
          ),
          NavigationDestination(
            icon: Icon(Icons.settings_outlined),
            selectedIcon: Icon(Icons.settings),
            label: '설정',
          ),
        ],
      ),
    );
  }
}
