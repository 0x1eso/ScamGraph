import 'package:flutter/material.dart';

import 'models.dart';

/// ScamGraph 다크 팔레트 — 브라우저 확장/웹과 시각 언어를 공유한다.
class ScamColors {
  ScamColors._();

  static const Color background = Color(0xFF06080D);
  static const Color surface = Color(0xFF0D1119);
  static const Color surfaceRaised = Color(0xFF141A24);
  static const Color border = Color(0xFF1E2733);

  static const Color accent = Color(0xFF00E5C0); // teal — 안전/브랜드
  static const Color danger = Color(0xFFFF4D6D); // 위험
  static const Color warning = Color(0xFFFFB020); // 경고/주의

  static const Color textPrimary = Color(0xFFECF1F8);
  static const Color textMuted = Color(0xFF8A97A8);
}

/// 등급 → 강조 색.
Color gradeColor(Grade grade) {
  switch (grade) {
    case Grade.danger:
      return ScamColors.danger;
    case Grade.warning:
    case Grade.caution:
      return ScamColors.warning;
    case Grade.safe:
      return ScamColors.accent;
    case Grade.unknown:
      return ScamColors.textMuted;
  }
}

/// 카드/패널 공통 데코레이션 (테마 대신 위젯 레벨에서 적용해 버전 호환성 확보).
BoxDecoration panelDecoration({Color? borderColor}) => BoxDecoration(
      color: ScamColors.surface,
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: borderColor ?? ScamColors.border),
    );

ThemeData buildScamTheme() {
  final base = ThemeData.dark(useMaterial3: true);
  return base.copyWith(
    scaffoldBackgroundColor: ScamColors.background,
    colorScheme: const ColorScheme.dark(
      surface: ScamColors.background,
      primary: ScamColors.accent,
      secondary: ScamColors.accent,
      error: ScamColors.danger,
      onPrimary: ScamColors.background,
      onSurface: ScamColors.textPrimary,
    ),
    textTheme: base.textTheme.apply(
      bodyColor: ScamColors.textPrimary,
      displayColor: ScamColors.textPrimary,
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: ScamColors.background,
      elevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(
        color: ScamColors.textPrimary,
        fontSize: 20,
        fontWeight: FontWeight.w700,
        letterSpacing: 0.2,
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: ScamColors.surfaceRaised,
      hintStyle: const TextStyle(color: ScamColors.textMuted),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: ScamColors.border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: ScamColors.border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: ScamColors.accent, width: 1.5),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: ScamColors.accent,
        foregroundColor: ScamColors.background,
        textStyle: const TextStyle(fontWeight: FontWeight.w700),
        padding: const EdgeInsets.symmetric(vertical: 16),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: ScamColors.surface,
      indicatorColor: ScamColors.accent.withOpacity(0.18),
      labelTextStyle: MaterialStateProperty.all(
        const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
      ),
    ),
  );
}
