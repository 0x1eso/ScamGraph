import 'package:flutter/material.dart';

import '../models.dart';
import '../theme.dart';

/// 등급 배지 + 위험 점수 링. 결과 카드와 히스토리 타일에서 재사용한다.
class GradeBadge extends StatelessWidget {
  const GradeBadge({
    super.key,
    required this.grade,
    this.riskScore,
    this.compact = false,
  });

  final Grade grade;
  final int? riskScore;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final color = gradeColor(grade);
    final size = compact ? 44.0 : 72.0;
    final score = riskScore;

    return SizedBox(
      width: size,
      height: size,
      child: Stack(
        alignment: Alignment.center,
        children: [
          SizedBox(
            width: size,
            height: size,
            child: CircularProgressIndicator(
              value: score == null ? null : (score.clamp(0, 100) / 100),
              strokeWidth: compact ? 4 : 6,
              backgroundColor: ScamColors.border,
              valueColor: AlwaysStoppedAnimation<Color>(color),
            ),
          ),
          Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                score?.toString() ?? '—',
                style: TextStyle(
                  color: color,
                  fontWeight: FontWeight.w800,
                  fontSize: compact ? 14 : 22,
                  height: 1,
                ),
              ),
              if (!compact)
                Text(
                  grade.korean,
                  style: TextStyle(
                    color: color,
                    fontWeight: FontWeight.w600,
                    fontSize: 11,
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

/// 등급명 필(pill) — 색 배경 위 짧은 라벨.
class GradePill extends StatelessWidget {
  const GradePill({super.key, required this.grade});

  final Grade grade;

  @override
  Widget build(BuildContext context) {
    final color = gradeColor(grade);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.16),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withOpacity(0.5)),
      ),
      child: Text(
        grade.korean,
        style: TextStyle(
          color: color,
          fontWeight: FontWeight.w700,
          fontSize: 12,
        ),
      ),
    );
  }
}
