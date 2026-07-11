import 'package:flutter/material.dart';

import '../api.dart';
import '../app_state.dart';
import '../models.dart';
import '../notifications.dart';
import '../theme.dart';
import '../util/link_extract.dart';
import '../widgets/result_card.dart';

/// 공유(Share) 수신 검사 화면.
///
/// 다른 앱(메시지·브라우저·카톡)에서 "공유 → ScamGraph" 로 넘어온 텍스트를
/// **온‑디바이스 오프라인 엔진**으로 즉시 판정한다(네트워크 불필요·최소 권한·최고 가치 경로).
/// 원하면 게이트웨이로 정밀 검사(조직 귀속·피드 대조)를 이어서 실행한다.
class RiskScreen extends StatefulWidget {
  const RiskScreen({
    super.key,
    required this.appState,
    required this.sharedValue,
  });

  final AppState appState;

  /// 공유로 넘어온 원문 텍스트 (URL·전화번호·문장 포함 가능).
  final String sharedValue;

  @override
  State<RiskScreen> createState() => _RiskScreenState();
}

class _RiskScreenState extends State<RiskScreen> {
  late final String _value;
  bool _loading = true;
  bool _deepLoading = false;
  CheckResult? _result;

  @override
  void initState() {
    super.initState();
    // 공유 텍스트에서 검사 대상(URL/전화)만 뽑아내고 무해화(refang)한다.
    _value = extractShared(widget.sharedValue);
    _runLocal();
  }

  Future<void> _runLocal() async {
    setState(() => _loading = true);
    final result = await widget.appState.assessLocally(_value);
    if (!mounted) return;
    setState(() {
      _result = result;
      _loading = false;
    });

    // 히스토리에 기록 + 위험이면 알림으로 환기.
    await widget.appState.record(result);
    if (result.grade.isRisky && mounted) {
      await LocalNotifications.instance.showAlert(
        result.grade == Grade.danger ? '🚨 위험 감지' : '⚠️ 주의',
        '${result.value}\n${result.recommendation}',
      );
    }
  }

  Future<void> _runDeep() async {
    setState(() => _deepLoading = true);
    try {
      final result = await widget.appState.api.check(widget.appState.baseUrl, _value);
      if (!mounted) return;
      setState(() => _result = result);
      await widget.appState.record(result);
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
          ..hideCurrentSnackBar()
          ..showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _deepLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final result = _result;
    return Scaffold(
      appBar: AppBar(title: const Text('공유 검사')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _SharedValueHeader(value: _value),
            const SizedBox(height: 16),
            if (_loading)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 48),
                child: Center(
                  child: CircularProgressIndicator(color: ScamColors.accent),
                ),
              )
            else if (result != null) ...[
              if (result.offline) const _OfflineNote(),
              if (result.offline) const SizedBox(height: 12),
              ResultCard(result: result),
              const SizedBox(height: 16),
              _DeepCheckButton(loading: _deepLoading, onPressed: _runDeep),
            ],
          ],
        ),
      ),
    );
  }
}

class _SharedValueHeader extends StatelessWidget {
  const _SharedValueHeader({required this.value});

  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      decoration: panelDecoration(),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            '공유된 값',
            style: TextStyle(
              color: ScamColors.textMuted,
              fontSize: 12,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.4,
            ),
          ),
          const SizedBox(height: 6),
          SelectableText(
            value,
            style: const TextStyle(
              color: ScamColors.textPrimary,
              fontSize: 15,
              fontWeight: FontWeight.w600,
              height: 1.4,
            ),
          ),
        ],
      ),
    );
  }
}

class _OfflineNote extends StatelessWidget {
  const _OfflineNote();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: ScamColors.surfaceRaised,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: ScamColors.border),
      ),
      child: const Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.offline_bolt_outlined, size: 16, color: ScamColors.accent),
          SizedBox(width: 6),
          Text(
            '오프라인 규칙엔진 판정 (네트워크 불필요)',
            style: TextStyle(
              color: ScamColors.textMuted,
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _DeepCheckButton extends StatelessWidget {
  const _DeepCheckButton({required this.loading, required this.onPressed});

  final bool loading;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      child: FilledButton.icon(
        onPressed: loading ? null : onPressed,
        icon: loading
            ? const SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: ScamColors.background,
                ),
              )
            : const Icon(Icons.travel_explore),
        label: Text(loading ? '정밀 검사 중…' : '게이트웨이로 정밀 검사 (조직 귀속·피드 대조)'),
      ),
    );
  }
}
