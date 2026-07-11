import 'package:flutter/material.dart';

import '../api.dart';
import '../app_state.dart';
import '../models.dart';
import '../notifications.dart';
import '../theme.dart';
import '../widgets/result_card.dart';

/// 수동 검사 화면: URL·전화번호·계좌를 입력해 게이트웨이로 판정한다.
class ManualCheckScreen extends StatefulWidget {
  const ManualCheckScreen({super.key, required this.appState});

  final AppState appState;

  @override
  State<ManualCheckScreen> createState() => _ManualCheckScreenState();
}

class _ManualCheckScreenState extends State<ManualCheckScreen> {
  final TextEditingController _controller = TextEditingController();

  bool _loading = false;
  String? _error;
  CheckResult? _result;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _runCheck() async {
    final value = _controller.text.trim();
    if (value.isEmpty) {
      setState(() => _error = '검사할 URL·전화번호·계좌를 입력하세요.');
      return;
    }

    FocusScope.of(context).unfocus();
    setState(() {
      _loading = true;
      _error = null;
      _result = null;
    });

    try {
      final result = await widget.appState.check(value);
      if (!mounted) return;
      setState(() => _result = result);

      // 수동 검사에서도 위험이면 로컬 알림으로 한 번 더 환기.
      if (result.grade.isRisky) {
        await LocalNotifications.instance.showAlert(
          result.grade == Grade.danger ? '🚨 위험 감지' : '⚠️ 주의',
          '${result.value}\n${result.recommendation}',
        );
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = '알 수 없는 오류가 발생했습니다.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return CustomScrollView(
      slivers: [
        const SliverAppBar(
          pinned: true,
          title: Text('ScamGraph'),
          bottom: PreferredSize(
            preferredSize: Size.fromHeight(28),
            child: Padding(
              padding: EdgeInsets.fromLTRB(16, 0, 16, 12),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  '주변 사기 보호 · 통합 안전 판정',
                  style: TextStyle(color: ScamColors.textMuted, fontSize: 13),
                ),
              ),
            ),
          ),
        ),
        SliverPadding(
          padding: const EdgeInsets.all(16),
          sliver: SliverList(
            delegate: SliverChildListDelegate([
              _InputPanel(
                controller: _controller,
                loading: _loading,
                onSubmit: _runCheck,
              ),
              if (_error != null) ...[
                const SizedBox(height: 16),
                _ErrorBanner(message: _error!),
              ],
              if (_result != null) ...[
                const SizedBox(height: 20),
                ResultCard(result: _result!),
              ],
              if (_result == null && _error == null && !_loading) ...[
                const SizedBox(height: 40),
                const _EmptyHint(),
              ],
            ]),
          ),
        ),
      ],
    );
  }
}

class _InputPanel extends StatelessWidget {
  const _InputPanel({
    required this.controller,
    required this.loading,
    required this.onSubmit,
  });

  final TextEditingController controller;
  final bool loading;
  final VoidCallback onSubmit;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: panelDecoration(),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            '검사할 값',
            style: TextStyle(
              color: ScamColors.textMuted,
              fontSize: 12,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.4,
            ),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: controller,
            enabled: !loading,
            textInputAction: TextInputAction.search,
            onSubmitted: (_) => onSubmit(),
            style: const TextStyle(color: ScamColors.textPrimary),
            decoration: const InputDecoration(
              hintText: 'https://example.com · 010-1234-5678 · 110-234-...',
            ),
          ),
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: loading ? null : onSubmit,
              icon: loading
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: ScamColors.background,
                      ),
                    )
                  : const Icon(Icons.shield_outlined),
              label: Text(loading ? '검사 중…' : '안전 검사'),
            ),
          ),
        ],
      ),
    );
  }
}

class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: ScamColors.danger.withOpacity(0.12),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: ScamColors.danger.withOpacity(0.4)),
      ),
      child: Row(
        children: [
          const Icon(Icons.error_outline, color: ScamColors.danger, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(color: ScamColors.danger, fontSize: 14),
            ),
          ),
        ],
      ),
    );
  }
}

class _EmptyHint extends StatelessWidget {
  const _EmptyHint();

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Icon(Icons.verified_user_outlined,
            size: 56, color: ScamColors.textMuted.withOpacity(0.5)),
        const SizedBox(height: 12),
        const Text(
          '의심스러운 링크·전화번호·계좌를 붙여넣고\n검사해 보세요.',
          textAlign: TextAlign.center,
          style: TextStyle(color: ScamColors.textMuted, height: 1.5),
        ),
      ],
    );
  }
}
