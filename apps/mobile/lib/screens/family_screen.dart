import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../app_state.dart';
import '../data/family_config.dart';
import '../theme.dart';

/// 가족 보호 모드 (스켈레톤).
///
/// 노약자·가족 구성원이 위험 이벤트를 만나면 보호자에게 알리는 개념을 담는다.
/// 스토킹 악용을 막기 위해 **보호 대상자 본인 동의**를 먼저 받아야 활성화된다.
/// 현재는 UI·로컬 상태만 구현(서버 연동/이벤트 전송은 미구현).
class FamilyScreen extends StatefulWidget {
  const FamilyScreen({super.key, required this.appState});

  final AppState appState;

  @override
  State<FamilyScreen> createState() => _FamilyScreenState();
}

class _FamilyScreenState extends State<FamilyScreen> {
  late final FamilyConfigStore _store;
  final TextEditingController _guardianController = TextEditingController();

  FamilyConfig _config = FamilyConfig.empty;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _store = FamilyConfigStore(widget.appState.config);
    _load();
  }

  @override
  void dispose() {
    _guardianController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final loaded = await _store.load();
    if (!mounted) return;
    setState(() {
      _config = loaded.pairingCode.isEmpty
          ? loaded.copyWith(pairingCode: FamilyConfig.generatePairingCode())
          : loaded;
      _guardianController.text = _config.guardianCode;
      _loading = false;
    });
    // 최초 진입 시 코드가 없었으면 생성한 코드를 저장.
    if (loaded.pairingCode.isEmpty) {
      await _store.save(_config);
    }
  }

  Future<void> _update(FamilyConfig next) async {
    setState(() => _config = next);
    await _store.save(next);
  }

  void _snack(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _regenerateCode() async {
    await _update(_config.copyWith(
      pairingCode: FamilyConfig.generatePairingCode(),
      // 코드가 바뀌면 기존 연결은 무효 — 재연결 필요.
      guardianCode: '',
      enabled: false,
    ));
    _guardianController.clear();
    _snack('새 페어링 코드를 생성했습니다. 기존 연결은 해제되었습니다.');
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator(color: ScamColors.accent)),
      );
    }

    return Scaffold(
      appBar: AppBar(title: const Text('가족 보호')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const _IntroCard(),
            const SizedBox(height: 16),
            _ConsentCard(
              consent: _config.consent,
              onChanged: (v) => _update(_config.copyWith(
                consent: v,
                // 동의 철회 시 보호 모드도 함께 비활성화.
                enabled: v ? _config.enabled : false,
              )),
            ),
            const SizedBox(height: 16),
            _ProtectionCard(
              config: _config,
              onToggleEnabled: (v) {
                if (v && !_config.consent) {
                  _snack('먼저 보호 대상자 본인 동의가 필요합니다.');
                  return;
                }
                _update(_config.copyWith(enabled: v));
              },
              onToggleDangerOnly: (v) =>
                  _update(_config.copyWith(dangerOnly: v)),
            ),
            const SizedBox(height: 16),
            _PairingCard(
              code: _config.pairingCode,
              onCopy: () {
                Clipboard.setData(ClipboardData(text: _config.pairingCode));
                _snack('페어링 코드를 복사했습니다.');
              },
              onRegenerate: _regenerateCode,
            ),
            const SizedBox(height: 16),
            _GuardianLinkCard(
              controller: _guardianController,
              isPaired: _config.isPaired,
              onLink: () {
                final code = _guardianController.text.trim();
                if (code.length != 6 || int.tryParse(code) == null) {
                  _snack('보호자 코드는 6자리 숫자입니다.');
                  return;
                }
                _update(_config.copyWith(guardianCode: code));
                _snack('보호자와 연결했습니다. (데모: 로컬 저장만)');
              },
              onUnlink: () {
                _guardianController.clear();
                _update(_config.copyWith(guardianCode: '', enabled: false));
                _snack('보호자 연결을 해제했습니다.');
              },
            ),
            const SizedBox(height: 16),
            const _AntiStalkingNote(),
          ],
        ),
      ),
    );
  }
}

class _IntroCard extends StatelessWidget {
  const _IntroCard();

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: panelDecoration(borderColor: ScamColors.accent.withOpacity(0.4)),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: const [
              Icon(Icons.groups, color: ScamColors.accent),
              SizedBox(width: 10),
              Text(
                '가족 보호 모드',
                style: TextStyle(
                  color: ScamColors.textPrimary,
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          const Text(
            '노약자·가족이 위험한 링크나 전화를 만나면, 동의한 범위 안에서 보호자에게 '
            '"위험 이벤트"만 알리는 개념입니다. 통화 내용·문자 원문·위치는 전송하지 않습니다.',
            style: TextStyle(
              color: ScamColors.textMuted,
              fontSize: 13,
              height: 1.55,
            ),
          ),
        ],
      ),
    );
  }
}

class _ConsentCard extends StatelessWidget {
  const _ConsentCard({required this.consent, required this.onChanged});

  final bool consent;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: panelDecoration(
        borderColor:
            consent ? ScamColors.accent.withOpacity(0.5) : ScamColors.warning.withOpacity(0.5),
      ),
      padding: const EdgeInsets.all(14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Checkbox(
            value: consent,
            activeColor: ScamColors.accent,
            onChanged: (v) => onChanged(v ?? false),
          ),
          const Expanded(
            child: Padding(
              padding: EdgeInsets.only(top: 12),
              child: Text(
                '보호 대상자 본인이 이 기기의 보호 모드 사용에 동의합니다. '
                '(동의 없는 몰래 감시를 금지합니다.)',
                style: TextStyle(
                  color: ScamColors.textPrimary,
                  fontSize: 13,
                  height: 1.5,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ProtectionCard extends StatelessWidget {
  const _ProtectionCard({
    required this.config,
    required this.onToggleEnabled,
    required this.onToggleDangerOnly,
  });

  final FamilyConfig config;
  final ValueChanged<bool> onToggleEnabled;
  final ValueChanged<bool> onToggleDangerOnly;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: panelDecoration(),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      child: Column(
        children: [
          SwitchListTile(
            value: config.enabled,
            activeColor: ScamColors.accent,
            title: const Text(
              '보호 모드 사용',
              style: TextStyle(
                color: ScamColors.textPrimary,
                fontWeight: FontWeight.w700,
              ),
            ),
            subtitle: Text(
              config.isPaired ? '보호자와 연결됨' : '보호자 미연결',
              style: const TextStyle(color: ScamColors.textMuted, fontSize: 12),
            ),
            onChanged: onToggleEnabled,
          ),
          const Divider(color: ScamColors.border, height: 1),
          SwitchListTile(
            value: config.dangerOnly,
            activeColor: ScamColors.accent,
            title: const Text(
              '위험 이벤트만 알림',
              style: TextStyle(
                color: ScamColors.textPrimary,
                fontWeight: FontWeight.w700,
              ),
            ),
            subtitle: const Text(
              '끄면 주의(warning)까지 보호자에게 알립니다.',
              style: TextStyle(color: ScamColors.textMuted, fontSize: 12),
            ),
            onChanged: config.enabled ? onToggleDangerOnly : null,
          ),
        ],
      ),
    );
  }
}

class _PairingCard extends StatelessWidget {
  const _PairingCard({
    required this.code,
    required this.onCopy,
    required this.onRegenerate,
  });

  final String code;
  final VoidCallback onCopy;
  final VoidCallback onRegenerate;

  @override
  Widget build(BuildContext context) {
    final spaced = code.split('').join(' ');
    return Container(
      decoration: panelDecoration(),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            '이 기기의 페어링 코드',
            style: TextStyle(
              color: ScamColors.textMuted,
              fontSize: 12,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.4,
            ),
          ),
          const SizedBox(height: 10),
          Text(
            spaced,
            style: const TextStyle(
              color: ScamColors.accent,
              fontSize: 30,
              fontWeight: FontWeight.w800,
              letterSpacing: 4,
            ),
          ),
          const SizedBox(height: 6),
          const Text(
            '보호자 기기에서 이 코드를 입력하면 연결됩니다.',
            style: TextStyle(color: ScamColors.textMuted, fontSize: 12),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              OutlinedButton.icon(
                onPressed: onCopy,
                icon: const Icon(Icons.copy, size: 18),
                label: const Text('복사'),
              ),
              const SizedBox(width: 10),
              TextButton.icon(
                onPressed: onRegenerate,
                icon: const Icon(Icons.refresh, size: 18),
                label: const Text('새 코드'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _GuardianLinkCard extends StatelessWidget {
  const _GuardianLinkCard({
    required this.controller,
    required this.isPaired,
    required this.onLink,
    required this.onUnlink,
  });

  final TextEditingController controller;
  final bool isPaired;
  final VoidCallback onLink;
  final VoidCallback onUnlink;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: panelDecoration(),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            '보호자 연결',
            style: TextStyle(
              color: ScamColors.textPrimary,
              fontSize: 15,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 4),
          const Text(
            '내가 보호자라면, 보호 대상자의 6자리 코드를 입력하세요.',
            style: TextStyle(color: ScamColors.textMuted, fontSize: 12),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: controller,
            enabled: !isPaired,
            keyboardType: TextInputType.number,
            maxLength: 6,
            style: const TextStyle(
              color: ScamColors.textPrimary,
              fontSize: 18,
              letterSpacing: 3,
            ),
            decoration: const InputDecoration(
              hintText: '000000',
              counterText: '',
            ),
          ),
          const SizedBox(height: 12),
          if (isPaired)
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: onUnlink,
                icon: const Icon(Icons.link_off, size: 18),
                label: const Text('연결 해제'),
              ),
            )
          else
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: onLink,
                icon: const Icon(Icons.link, size: 18),
                label: const Text('연결'),
              ),
            ),
        ],
      ),
    );
  }
}

class _AntiStalkingNote extends StatelessWidget {
  const _AntiStalkingNote();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: ScamColors.warning.withOpacity(0.10),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: ScamColors.warning.withOpacity(0.4)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: const [
          Icon(Icons.privacy_tip_outlined, color: ScamColors.warning, size: 20),
          SizedBox(width: 10),
          Expanded(
            child: Text(
              '스토킹·감시 악용 방지: 보호 모드는 반드시 보호 대상자 본인 동의로만 켜집니다. '
              '전송되는 것은 "위험 이벤트 발생" 신호뿐이며, 통화·문자 원문, 연락처, 위치, 방문 기록은 '
              '수집·전송하지 않습니다.',
              style: TextStyle(
                color: ScamColors.textMuted,
                fontSize: 12,
                height: 1.6,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
