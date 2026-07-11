import 'package:flutter/material.dart';

import '../app_state.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets/grade_badge.dart';
import '../widgets/result_card.dart';

/// 지난 수동 검사 기록 목록.
class HistoryScreen extends StatelessWidget {
  const HistoryScreen({super.key, required this.appState});

  final AppState appState;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: appState,
      builder: (context, _) {
        final history = appState.history;
        return CustomScrollView(
          slivers: [
            SliverAppBar(
              pinned: true,
              title: const Text('검사 기록'),
              actions: [
                if (history.isNotEmpty)
                  IconButton(
                    tooltip: '기록 지우기',
                    icon: const Icon(Icons.delete_outline),
                    onPressed: () => _confirmClear(context),
                  ),
              ],
            ),
            if (history.isEmpty)
              const SliverFillRemaining(
                hasScrollBody: false,
                child: _EmptyHistory(),
              )
            else
              SliverPadding(
                padding: const EdgeInsets.all(16),
                sliver: SliverList(
                  delegate: SliverChildBuilderDelegate(
                    (context, i) => Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: _HistoryTile(result: history[i]),
                    ),
                    childCount: history.length,
                  ),
                ),
              ),
          ],
        );
      },
    );
  }

  Future<void> _confirmClear(BuildContext context) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: ScamColors.surface,
        title: const Text('기록을 지울까요?'),
        content: const Text('저장된 검사 기록이 모두 삭제됩니다.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('취소'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('삭제',
                style: TextStyle(color: ScamColors.danger)),
          ),
        ],
      ),
    );
    if (confirmed == true) {
      await appState.clearHistory();
    }
  }
}

class _HistoryTile extends StatelessWidget {
  const _HistoryTile({required this.result});

  final CheckResult result;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => _showDetail(context),
        child: Container(
          decoration: panelDecoration(),
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              GradeBadge(
                grade: result.grade,
                riskScore: result.riskScore,
                compact: true,
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            result.value,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: ScamColors.textPrimary,
                              fontWeight: FontWeight.w700,
                              fontSize: 15,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        GradePill(grade: result.grade),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${result.kindKorean} · ${_formatTime(result.checkedAt)}',
                      style: const TextStyle(
                        color: ScamColors.textMuted,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showDetail(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: ScamColors.background,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.6,
        maxChildSize: 0.9,
        builder: (context, controller) => ListView(
          controller: controller,
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
          children: [ResultCard(result: result)],
        ),
      ),
    );
  }

  static String _formatTime(DateTime dt) {
    final local = dt.toLocal();
    String two(int n) => n.toString().padLeft(2, '0');
    return '${local.year}-${two(local.month)}-${two(local.day)} '
        '${two(local.hour)}:${two(local.minute)}';
  }
}

class _EmptyHistory extends StatelessWidget {
  const _EmptyHistory();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.history,
              size: 56, color: ScamColors.textMuted.withOpacity(0.5)),
          const SizedBox(height: 12),
          const Text(
            '아직 검사 기록이 없습니다.',
            style: TextStyle(color: ScamColors.textMuted),
          ),
        ],
      ),
    );
  }
}
