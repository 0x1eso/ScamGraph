import 'package:flutter/material.dart';

import '../models.dart';
import '../theme.dart';
import 'grade_badge.dart';

/// 단일 검사 결과 상세 카드: 등급 + 위험 점수 + 권고 + 조직 귀속 + 근거.
class ResultCard extends StatelessWidget {
  const ResultCard({super.key, required this.result});

  final CheckResult result;

  @override
  Widget build(BuildContext context) {
    final color = gradeColor(result.grade);

    return Container(
      decoration: panelDecoration(borderColor: color.withOpacity(0.45)),
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              GradeBadge(grade: result.grade, riskScore: result.riskScore),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      result.kindKorean,
                      style: const TextStyle(
                        color: ScamColors.textMuted,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 0.4,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      result.value,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: ScamColors.textPrimary,
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          _RecommendationBanner(color: color, text: result.recommendation),
          if (result.organization != null) ...[
            const SizedBox(height: 12),
            _OrganizationRow(organization: result.organization!),
          ],
          if (result.reasons.isNotEmpty) ...[
            const SizedBox(height: 16),
            const Text(
              '판정 근거',
              style: TextStyle(
                color: ScamColors.textMuted,
                fontSize: 12,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.4,
              ),
            ),
            const SizedBox(height: 8),
            ...result.reasons.map((r) => _ReasonRow(reason: r)),
          ],
        ],
      ),
    );
  }
}

class _RecommendationBanner extends StatelessWidget {
  const _RecommendationBanner({required this.color, required this.text});

  final Color color;
  final String text;

  @override
  Widget build(BuildContext context) {
    if (text.isEmpty) return const SizedBox.shrink();
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withOpacity(0.4)),
      ),
      child: Text(
        text,
        style: TextStyle(
          color: color == ScamColors.accent ? ScamColors.textPrimary : color,
          fontSize: 15,
          fontWeight: FontWeight.w600,
          height: 1.4,
        ),
      ),
    );
  }
}

class _OrganizationRow extends StatelessWidget {
  const _OrganizationRow({required this.organization});

  final String organization;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        const Icon(Icons.hub_outlined, size: 18, color: ScamColors.danger),
        const SizedBox(width: 8),
        Expanded(
          child: RichText(
            text: TextSpan(
              style: const TextStyle(fontSize: 13, color: ScamColors.textMuted),
              children: [
                const TextSpan(text: '귀속 조직  '),
                TextSpan(
                  text: organization,
                  style: const TextStyle(
                    color: ScamColors.danger,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _ReasonRow extends StatelessWidget {
  const _ReasonRow({required this.reason});

  final Reason reason;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: ScamColors.surfaceRaised,
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(
              reason.rule,
              style: const TextStyle(
                color: ScamColors.accent,
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              reason.detail ?? '',
              style: const TextStyle(
                color: ScamColors.textPrimary,
                fontSize: 13,
                height: 1.35,
              ),
            ),
          ),
          if (reason.weight != null)
            Padding(
              padding: const EdgeInsets.only(left: 8),
              child: Text(
                '+${reason.weight}',
                style: const TextStyle(
                  color: ScamColors.warning,
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
        ],
      ),
    );
  }
}
