import 'package:flutter/material.dart';

import '../app_state.dart';
import '../config_store.dart';
import '../notifications.dart';
import '../theme.dart';

/// 설정: 게이트웨이 URL, 권한/역할 요청, 알림 테스트.
class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key, required this.appState});

  final AppState appState;

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  late final TextEditingController _urlController;
  bool _roleHeld = false;

  ConfigStore get _config => widget.appState.config;

  @override
  void initState() {
    super.initState();
    _urlController = TextEditingController(text: widget.appState.baseUrl);
    _refreshRole();
  }

  @override
  void dispose() {
    _urlController.dispose();
    super.dispose();
  }

  Future<void> _refreshRole() async {
    final held = await _config.isCallScreeningRoleHeld();
    if (mounted) setState(() => _roleHeld = held);
  }

  Future<void> _saveUrl() async {
    await widget.appState.setBaseUrl(_urlController.text);
    if (!mounted) return;
    _snack('게이트웨이 주소를 저장했습니다: ${widget.appState.baseUrl}');
  }

  void _snack(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    return CustomScrollView(
      slivers: [
        const SliverAppBar(pinned: true, title: Text('설정')),
        SliverPadding(
          padding: const EdgeInsets.all(16),
          sliver: SliverList(
            delegate: SliverChildListDelegate([
              _SectionCard(
                title: '게이트웨이',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    TextField(
                      controller: _urlController,
                      keyboardType: TextInputType.url,
                      autocorrect: false,
                      style: const TextStyle(color: ScamColors.textPrimary),
                      decoration: const InputDecoration(
                        hintText: ConfigStore.defaultBaseUrl,
                        prefixIcon: Icon(Icons.dns_outlined,
                            color: ScamColors.textMuted),
                      ),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      '· 에뮬레이터: http://10.0.2.2:8080 (호스트의 localhost)\n'
                      '· 실기기: 게이트웨이 PC의 LAN IP, 예) http://192.168.0.10:8080',
                      style: TextStyle(
                        color: ScamColors.textMuted,
                        fontSize: 12,
                        height: 1.5,
                      ),
                    ),
                    const SizedBox(height: 12),
                    Align(
                      alignment: Alignment.centerRight,
                      child: FilledButton(
                        onPressed: _saveUrl,
                        child: const Text('저장'),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              _SectionCard(
                title: '권한 · 자동 보호',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text(
                      'SMS 자동 스캔과 통화 스크리닝을 켜려면 아래 권한과 역할이 필요합니다.',
                      style: TextStyle(
                        color: ScamColors.textMuted,
                        fontSize: 13,
                        height: 1.5,
                      ),
                    ),
                    const SizedBox(height: 14),
                    _ActionRow(
                      icon: Icons.verified_user_outlined,
                      label: 'SMS · 전화 · 알림 권한 허용',
                      onTap: () async {
                        await _config.requestPermissions();
                        await LocalNotifications.instance.requestPermission();
                        if (mounted) _snack('권한 다이얼로그를 확인하세요.');
                      },
                    ),
                    const Divider(color: ScamColors.border, height: 24),
                    _ActionRow(
                      icon: Icons.phone_in_talk_outlined,
                      label: '통화 스크리닝 역할 요청',
                      trailing: _RoleStatus(held: _roleHeld),
                      onTap: () async {
                        await _config.requestCallScreeningRole();
                        // 사용자가 시스템 다이얼로그를 처리한 뒤 상태를 갱신.
                        await Future<void>.delayed(
                            const Duration(milliseconds: 600));
                        await _refreshRole();
                        if (mounted) _snack('역할 요청 화면을 확인하세요.');
                      },
                    ),
                    const Divider(color: ScamColors.border, height: 24),
                    _ActionRow(
                      icon: Icons.notifications_active_outlined,
                      label: '알림 테스트',
                      onTap: () async {
                        await LocalNotifications.instance.showAlert(
                          '⚠️ ScamGraph 테스트 알림',
                          '알림이 정상적으로 표시됩니다.',
                        );
                        if (mounted) _snack('테스트 알림을 보냈습니다.');
                      },
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              const _InfoNote(),
            ]),
          ),
        ),
      ],
    );
  }
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: panelDecoration(),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              color: ScamColors.textPrimary,
              fontSize: 15,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 12),
          child,
        ],
      ),
    );
  }
}

class _ActionRow extends StatelessWidget {
  const _ActionRow({
    required this.icon,
    required this.label,
    required this.onTap,
    this.trailing,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(8),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(
          children: [
            Icon(icon, color: ScamColors.accent, size: 22),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                label,
                style: const TextStyle(
                  color: ScamColors.textPrimary,
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            if (trailing != null) trailing!,
            const SizedBox(width: 4),
            const Icon(Icons.chevron_right, color: ScamColors.textMuted),
          ],
        ),
      ),
    );
  }
}

class _RoleStatus extends StatelessWidget {
  const _RoleStatus({required this.held});

  final bool held;

  @override
  Widget build(BuildContext context) {
    final color = held ? ScamColors.accent : ScamColors.textMuted;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withOpacity(0.14),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        held ? '활성' : '비활성',
        style: TextStyle(
          color: color,
          fontSize: 11,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _InfoNote extends StatelessWidget {
  const _InfoNote();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: ScamColors.surfaceRaised,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: ScamColors.border),
      ),
      child: const Text(
        'SMS 자동 스캔과 통화 스크리닝은 실기기(또는 통신 기능이 있는 에뮬레이터)에서만 '
        '동작하며, 사용자가 권한과 역할을 직접 허용해야 합니다. 이 화면에서 요청할 수 있습니다.',
        style: TextStyle(
          color: ScamColors.textMuted,
          fontSize: 12,
          height: 1.6,
        ),
      ),
    );
  }
}
