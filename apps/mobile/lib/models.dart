/// ScamGraph 게이트웨이 `/api/check` 응답 모델.
///
/// 게이트웨이 응답(JSON):
/// ```json
/// {
///   "value": "...",
///   "kind": "url" | "phone" | "account",
///   "grade": "safe" | "caution" | "warning" | "danger" | "unknown",
///   "risk_score": 92,            // nullable (엔진 미가동 시 null)
///   "reasons": [ { "rule": "...", "weight": 35, "detail": "..." } ],
///   "organization": "..." | null,
///   "recommendation": "..."
/// }
/// ```
library;

/// 안전 등급. enum 이름이 그대로 게이트웨이의 wire 값과 일치한다.
enum Grade { safe, caution, warning, danger, unknown }

Grade gradeFromString(String? raw) {
  switch (raw) {
    case 'safe':
      return Grade.safe;
    case 'caution':
      return Grade.caution;
    case 'warning':
      return Grade.warning;
    case 'danger':
      return Grade.danger;
    default:
      return Grade.unknown;
  }
}

extension GradeLabel on Grade {
  /// 사용자에게 보여줄 한국어 등급명.
  String get korean {
    switch (this) {
      case Grade.safe:
        return '안전';
      case Grade.caution:
        return '주의';
      case Grade.warning:
        return '경고';
      case Grade.danger:
        return '위험';
      case Grade.unknown:
        return '미상';
    }
  }

  /// 알림/배너를 띄워야 할 만큼 위험한 등급인지.
  bool get isRisky => this == Grade.warning || this == Grade.danger;
}

/// 판정 근거 한 건 (엔진 규칙).
class Reason {
  const Reason({required this.rule, this.weight, this.detail});

  final String rule;
  final int? weight;
  final String? detail;

  factory Reason.fromJson(dynamic json) {
    // 방어적 파싱: 서버가 객체 대신 문자열을 줄 수도 있다.
    if (json is String) {
      return Reason(rule: json);
    }
    if (json is Map) {
      final weight = json['weight'];
      return Reason(
        rule: (json['rule'] ?? '규칙').toString(),
        weight: weight is num ? weight.toInt() : null,
        detail: json['detail']?.toString(),
      );
    }
    return const Reason(rule: '규칙');
  }

  Map<String, dynamic> toJson() => {
        'rule': rule,
        if (weight != null) 'weight': weight,
        if (detail != null) 'detail': detail,
      };
}

/// `/api/check` 한 건의 판정 결과.
class CheckResult {
  const CheckResult({
    required this.value,
    required this.kind,
    required this.grade,
    required this.reasons,
    required this.recommendation,
    required this.checkedAt,
    this.riskScore,
    this.organization,
  });

  final String value;

  /// "url" | "phone" | "account"
  final String kind;
  final Grade grade;

  /// 0..100, 엔진 미가동 시 null.
  final int? riskScore;
  final List<Reason> reasons;

  /// 귀속된 사기 조직 이름 (없으면 null).
  final String? organization;
  final String recommendation;

  /// 클라이언트에서 검사한 시각 (히스토리 정렬/표시용).
  final DateTime checkedAt;

  String get kindKorean {
    switch (kind) {
      case 'phone':
        return '전화번호';
      case 'account':
        return '계좌';
      case 'url':
      default:
        return '링크/URL';
    }
  }

  factory CheckResult.fromJson(Map<String, dynamic> json, {DateTime? checkedAt}) {
    final rawReasons = json['reasons'];
    final reasons = <Reason>[];
    if (rawReasons is List) {
      for (final r in rawReasons) {
        reasons.add(Reason.fromJson(r));
      }
    }
    final risk = json['risk_score'];
    final parsedCheckedAt = checkedAt ??
        DateTime.tryParse(json['checked_at']?.toString() ?? '') ??
        DateTime.now();

    return CheckResult(
      value: (json['value'] ?? '').toString(),
      kind: (json['kind'] ?? 'url').toString(),
      grade: gradeFromString(json['grade']?.toString()),
      riskScore: risk is num ? risk.toInt() : null,
      reasons: reasons,
      organization: json['organization']?.toString(),
      recommendation: (json['recommendation'] ?? '').toString(),
      checkedAt: parsedCheckedAt,
    );
  }

  /// 히스토리 영속화용 직렬화 (검사 시각 포함).
  Map<String, dynamic> toJson() => {
        'value': value,
        'kind': kind,
        'grade': grade.name,
        'risk_score': riskScore,
        'reasons': reasons.map((r) => r.toJson()).toList(),
        'organization': organization,
        'recommendation': recommendation,
        'checked_at': checkedAt.toIso8601String(),
      };
}
