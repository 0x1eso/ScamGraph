import '../models.dart';
import 'signals.dart';

/// 오프라인 규칙 엔진 — 파이썬 엔진(`apps/engine/app/crawler.py`)의 `quick_assess` 를
/// 그대로 포팅한 것. 네트워크 없이 즉시 위험도를 산출한다 (demo-safe).
///
/// 규칙 ID·가중치·등급 임계값·상수 목록은 번들 자산(`assets/rules.json`)에서 읽는다.
/// 이 자산은 `contracts/rules.json` 의 미러이며, golden 테스트로 파이썬 구현과의
/// 판정 일치를 검증한다.
///
/// 이 파일은 순수 Dart(플러터 의존 없음)로, `dart test` 에서 자산 JSON 을 직접 로드해
/// 단위 테스트할 수 있다. 앱 런타임 로딩은 `rule_engine.dart` 가 담당한다.
library;

/// 등급 임계값 (contract `grade_thresholds`).
class GradeThresholds {
  const GradeThresholds({
    required this.danger,
    required this.warning,
    required this.caution,
  });

  final int danger;
  final int warning;
  final int caution;

  factory GradeThresholds.fromJson(Map<String, dynamic> json) {
    int at(String k, int fallback) {
      final v = json[k];
      return v is num ? v.toInt() : fallback;
    }

    return GradeThresholds(
      danger: at('danger', 70),
      warning: at('warning', 35),
      caution: at('caution', 15),
    );
  }

  Grade grade(int score) {
    if (score >= danger) return Grade.danger;
    if (score >= warning) return Grade.warning;
    if (score >= caution) return Grade.caution;
    return Grade.safe;
  }
}

/// 번들 규칙 정의를 파싱한 불변 설정.
class RuleConfig {
  RuleConfig({
    required this.thresholds,
    required this.weights,
    required this.details,
    required this.knownBrands,
    required this.suspiciousTlds,
    required this.confusableRanges,
    required this.phishKeywords,
    required this.allowlist,
    required this.phishBase,
    required this.phishStep,
    required this.phishCap,
  });

  final GradeThresholds thresholds;

  /// 규칙 ID → 가중치 (phishing_keywords 처럼 가변 가중치는 제외).
  final Map<String, int> weights;

  /// 규칙 ID → 기본 설명(detail).
  final Map<String, String> details;

  final List<String> knownBrands;
  final Set<String> suspiciousTlds;

  /// (lo, hi) 유니코드 코드포인트 구간 — 혼동 문자(키릴/그리스) 탐지.
  final List<List<int>> confusableRanges;
  final Set<String> phishKeywords;
  final List<String> allowlist;

  final int phishBase;
  final int phishStep;
  final int phishCap;

  int weightOf(String ruleId) => weights[ruleId] ?? 0;

  factory RuleConfig.fromJson(Map<String, dynamic> json) {
    final weights = <String, int>{};
    final details = <String, String>{};

    void indexRules(dynamic rules) {
      if (rules is! List) return;
      for (final r in rules) {
        if (r is! Map) continue;
        final id = r['id']?.toString();
        if (id == null) continue;
        final w = r['weight'];
        if (w is num) weights[id] = w.toInt();
        final d = r['detail']?.toString();
        if (d != null) details[id] = d;
      }
    }

    indexRules(json['url_rules']);
    indexRules(json['phone_rules']);
    indexRules(json['account_rules']);

    final constants =
        (json['constants'] as Map?)?.cast<String, dynamic>() ?? const {};

    List<String> strList(dynamic v) =>
        (v is List) ? v.map((e) => e.toString()).toList() : const [];

    final ranges = <List<int>>[];
    final rawRanges = constants['confusable_ranges'];
    if (rawRanges is List) {
      for (final entry in rawRanges) {
        if (entry is List && entry.length >= 2) {
          final lo = _parseHex(entry[0]);
          final hi = _parseHex(entry[1]);
          if (lo != null && hi != null) ranges.add([lo, hi]);
        }
      }
    }

    final scoring =
        (constants['phishing_keyword_scoring'] as Map?)?.cast<String, dynamic>();
    int scoreConst(String k, int fallback) {
      final v = scoring?[k];
      return v is num ? v.toInt() : fallback;
    }

    return RuleConfig(
      thresholds: GradeThresholds.fromJson(
        (json['grade_thresholds'] as Map?)?.cast<String, dynamic>() ?? const {},
      ),
      weights: weights,
      details: details,
      knownBrands: strList(constants['known_brands']),
      suspiciousTlds: strList(constants['suspicious_tlds']).toSet(),
      confusableRanges: ranges,
      phishKeywords: strList(constants['phish_keywords']).toSet(),
      allowlist: strList(constants['allowlist']),
      phishBase: scoreConst('base', 16),
      phishStep: scoreConst('step', 8),
      phishCap: scoreConst('cap', 30),
    );
  }

  static int? _parseHex(dynamic v) {
    if (v is num) return v.toInt();
    final s = v?.toString();
    if (s == null) return null;
    final cleaned = s.toLowerCase().startsWith('0x') ? s.substring(2) : s;
    return int.tryParse(cleaned, radix: 16);
  }
}

/// 오프라인 판정 결과 — `{kind, riskScore, grade, reasons[]}`.
class QuickAssessment {
  const QuickAssessment({
    required this.kind,
    required this.riskScore,
    required this.grade,
    required this.reasons,
  });

  /// "url" | "phone" | "account"
  final String kind;
  final int riskScore;
  final Grade grade;
  final List<Reason> reasons;

  Map<String, dynamic> toJson() => {
        'kind': kind,
        'risk_score': riskScore,
        'grade': grade.name,
        'reasons': reasons.map((r) => r.toJson()).toList(),
      };

  /// UI/히스토리에서 쓰는 [CheckResult] 로 변환한다.
  ///
  /// [organization] 은 오프라인 단독 판정에서는 알 수 없으므로 기본 null.
  /// [recommendation] 은 게이트웨이의 `recommend()` 문구를 미러링해 생성한다.
  CheckResult toCheckResult(
    String value, {
    DateTime? checkedAt,
    bool offline = true,
    String? recommendation,
  }) {
    return CheckResult(
      value: value,
      kind: kind,
      grade: grade,
      riskScore: riskScore,
      reasons: reasons,
      organization: null,
      recommendation: recommendation ?? recommendFor(kind, grade),
      checkedAt: checkedAt ?? DateTime.now(),
      offline: offline,
    );
  }
}

/// 규칙 엔진. [RuleConfig] 를 주입받아 순수 함수로 동작한다.
class QuickAssessEngine {
  const QuickAssessEngine(this.config);

  final RuleConfig config;

  factory QuickAssessEngine.fromJson(Map<String, dynamic> json) =>
      QuickAssessEngine(RuleConfig.fromJson(json));

  /// 입력을 url / phone / account 로 분류 (파이썬 `classify_target` 미러).
  String classify(String target) {
    final t = target.trim();
    final digits = t.replaceAll(RegExp(r'\D'), '');
    if (RegExp(r'[a-zA-Z]').hasMatch(t) || t.contains('.') || t.contains('/')) {
      return 'url';
    }
    if (digits.length >= 9 && digits.length <= 11) return 'phone';
    if (digits.length >= 10 && digits.length <= 16) return 'account';
    return 'url';
  }

  QuickAssessment assess(String target) {
    final trimmed = target.trim();
    final kind = classify(trimmed);
    final reasons = <Reason>[];
    var score = 0;

    Reason ruleReason(String id, {String? detail, int? weight}) => Reason(
          rule: id,
          weight: weight ?? config.weightOf(id),
          detail: detail ?? config.details[id],
        );

    if (kind == 'url') {
      final host = _hostOf(trimmed);

      // 화이트리스트 → 즉시 안전 (오탐 방지). 반드시 *원본 호스트*로 검사한다:
      // 혼동문자 위장('nаver.com')은 스켈레톤이 정상 도메인이어도 통과하면 안 된다.
      if (_isAllowlisted(host)) {
        return QuickAssessment(
          kind: kind,
          riskScore: 0,
          grade: Grade.safe,
          reasons: [ruleReason('verified_domain', weight: 0)],
        );
      }

      // 혼동/혼합 문자를 ASCII 스켈레톤으로 접어 토큰·브랜드 분석을 견고하게 한다.
      final decoded = decodeIdna(host);
      final skeleton = confusableSkeleton(decoded);
      final analysisHost = skeleton.isNotEmpty ? skeleton : host;

      final reg = registrable(analysisHost);
      final labels = analysisHost.isEmpty ? <String>[] : analysisHost.split('.');
      final namePart = reg.domain.isNotEmpty
          ? '${reg.subdomain}.${reg.domain}'.replaceAll(RegExp(r'^\.+|\.+$'), '')
          : analysisHost;
      final tokens = _tokensOf(namePart);

      // 퓨니코드(xn--) 사용 자체가 유명 브랜드 위장 신호.
      if (host.startsWith('xn--') || host.contains('.xn--')) {
        score += config.weightOf('homograph');
        reasons.add(ruleReason('homograph'));
      }

      // 혼동 문자·혼합 스크립트 위장 — 동적 가중치(스켈레톤이 화이트리스트와 일치=표적 위장 → 50).
      if (isConfusableHost(host)) {
        final mimics = _isAllowlisted(skeleton);
        final w = mimics ? 50 : config.weightOf('homoglyph');
        score += w;
        reasons.add(ruleReason('homoglyph',
            weight: w,
            detail: mimics
                ? "혼동/혼합 문자로 정상 도메인('$skeleton') 위장 — 표적 피싱"
                : '혼동 문자·혼합 스크립트로 도메인 위장'));
      }

      // 브랜드 사칭 — 등록 도메인 이름을 우선 검사(정확일치·임베드·타이포스쿼팅).
      final hit = _brandHit(_tokensOf(reg.domain), reg.domain);
      if (hit != null) {
        if (hit.type == 'impersonation') {
          score += config.weightOf('brand_impersonation');
          reasons.add(ruleReason('brand_impersonation',
              detail: "'${hit.brand}' 브랜드명이 도메인에 포함되나 공식 도메인이 아님"));
        } else {
          score += config.weightOf('typosquatting');
          reasons.add(ruleReason('typosquatting',
              detail:
                  "'${hit.token}' ≈ '${hit.brand}' (편집거리 ${hit.distance}) — 유사 도메인 위장"));
        }
      } else {
        // 등록 도메인엔 없고 서브도메인에만 브랜드 → 실제 목적지는 다른 등록 도메인.
        final subHit = _brandInSubdomain(_tokensOf(reg.subdomain));
        if (subHit != null) {
          score += config.weightOf('brand_subdomain');
          reasons.add(ruleReason('brand_subdomain',
              detail:
                  "'${subHit.brand}' 브랜드가 서브도메인에만 있고 실제 등록 도메인은 '${reg.registeredDomain}' — 목적지 위장"));
        }
      }

      final tld = labels.isNotEmpty ? labels.last : '';
      if (config.suspiciousTlds.contains(tld)) {
        score += config.weightOf('suspicious_tld');
        reasons.add(ruleReason('suspicious_tld', detail: "위험 TLD '.$tld'"));
      }

      // 피싱 유도 키워드 (개수 비례 가산, 상한).
      final kwHits =
          tokens.where((tok) => config.phishKeywords.contains(tok)).toList();
      if (kwHits.isNotEmpty) {
        final w = _min(
          config.phishBase + (kwHits.length - 1) * config.phishStep,
          config.phishCap,
        );
        score += w;
        reasons.add(ruleReason('phishing_keywords',
            weight: w, detail: '피싱 유도 키워드: ${kwHits.join(', ')}'));
      }

      // 숫자 과다.
      final digitCount = _countDigits(namePart);
      if (digitCount >= 4) {
        score += config.weightOf('digit_heavy');
        reasons.add(ruleReason('digit_heavy',
            detail: '도메인에 숫자 과다($digitCount) — 자동 생성 흔적'));
      }

      // 하이픈 과다.
      final hyphenCount = '-'.allMatches(namePart).length;
      if (hyphenCount >= 3) {
        score += config.weightOf('hyphen_heavy');
        reasons.add(ruleReason('hyphen_heavy',
            detail: '하이픈 과다($hyphenCount) — 키워드 조합 위장'));
      }

      // IP 표기 — 점10진(ip_host) 또는 정수/16진 인코딩(obfuscated_ip).
      final ipForm = ipRepresentation(host);
      if (ipForm == 'dotted') {
        score += config.weightOf('ip_host');
        reasons.add(ruleReason('ip_host'));
      } else if (ipForm == 'decimal' || ipForm == 'hex') {
        score += config.weightOf('obfuscated_ip');
        reasons.add(ruleReason('obfuscated_ip',
            detail: 'IP 주소를 $ipForm 로 인코딩 — 목적지 은폐'));
      }

      // 알려진 URL 단축 서비스 — 실제 목적지 은폐.
      if (isShortener(reg.registeredDomain, host)) {
        score += config.weightOf('url_shortener');
        reasons.add(ruleReason('url_shortener',
            detail: 'URL 단축 서비스(${reg.registeredDomain}) — 실제 목적지 은폐'));
      }

      if (trimmed.contains('@')) {
        score += config.weightOf('at_symbol');
        reasons.add(ruleReason('at_symbol'));
      }

      // 이중/중첩 퍼센트 인코딩 — 필터 우회·목적지 은폐.
      if (hasDoubleEncoding(trimmed)) {
        score += config.weightOf('double_encoding');
        reasons.add(ruleReason('double_encoding'));
      }

      // 비표준 포트.
      final port = nonstandardPort(trimmed);
      if (port != null) {
        score += config.weightOf('nonstandard_port');
        reasons.add(ruleReason('nonstandard_port', detail: '비표준 포트(:$port) 사용'));
      }

      if (labels.length >= 5) {
        score += config.weightOf('deep_subdomain');
        reasons.add(ruleReason('deep_subdomain',
            detail: '과도한 서브도메인 깊이(${labels.length})'));
      }

      if (trimmed.length >= 75) {
        score += config.weightOf('long_url');
        reasons.add(ruleReason('long_url'));
      }

      if (trimmed.contains('://') &&
          !trimmed.toLowerCase().startsWith('https')) {
        score += config.weightOf('no_tls');
        reasons.add(ruleReason('no_tls'));
      }
    } else if (kind == 'phone') {
      final digits = trimmed.replaceAll(RegExp(r'\D'), '');
      if (digits.startsWith('070') || digits.startsWith('050')) {
        score += config.weightOf('voip_prefix');
        reasons.add(ruleReason('voip_prefix'));
      }
      // 국제전화: 원본의 선행 '+' 또는 국제 접속번호 '00' (digits 에선 '+'가 제거됨).
      if (trimmed.startsWith('+') || digits.startsWith('00')) {
        score += config.weightOf('intl_prefix');
        reasons.add(ruleReason('intl_prefix'));
      }
    } else if (kind == 'account') {
      reasons.add(ruleReason('account_lookup'));
    }

    if (score > 100) score = 100;
    return QuickAssessment(
      kind: kind,
      riskScore: score,
      grade: config.thresholds.grade(score),
      reasons: reasons,
    );
  }

  // --- 내부 헬퍼 (파이썬 구현 미러) ---

  String _hostOf(String target) => hostOf(target);

  bool _isAllowlisted(String host) {
    if (host.isEmpty) return false;
    return config.allowlist.any((d) => host == d || host.endsWith('.$d'));
  }

  /// 도메인 이름 부분을 하이픈/언더스코어/점 단위 영숫자 토큰으로 분해(길이 3+).
  /// 파이썬 `_tokens` 미러.
  List<String> _tokensOf(String text) => text
      .split(RegExp(r'[.\-_]'))
      .where((tok) => tok.length >= 3 && _isAlnum(tok))
      .toList();

  /// 등록 도메인 토큰에서 브랜드 사칭/타이포스쿼팅을 탐지 (파이썬 `_brand_hit` 미러).
  _BrandHit? _brandHit(List<String> tokens, String registeredName) {
    for (final tok in tokens) {
      for (final brand in config.knownBrands) {
        final d = _levenshtein(tok, brand);
        if (d == 0 && registeredName != brand) {
          return _BrandHit('impersonation', brand, tok, 0);
        }
        // 타이포스쿼팅: 4자 이상 토큰/브랜드만. 거리 2는 6자 이상 긴 브랜드에만 허용(오탐 차단).
        if (d > 0 &&
            d <= 2 &&
            tok.length >= 4 &&
            brand.length >= 4 &&
            (tok.length - brand.length).abs() <= 2 &&
            (d == 1 || brand.length >= 6)) {
          return _BrandHit('typosquatting', brand, tok, d);
        }
        // 브랜드명이 토큰에 임베드(예: 'tosspay' ⊃ 'toss').
        if (brand.length >= 4 &&
            tok.contains(brand) &&
            tok != brand &&
            registeredName != brand &&
            tok.length <= brand.length + 10) {
          return _BrandHit('impersonation', brand, tok, 0);
        }
      }
    }
    return null;
  }

  /// 서브도메인 토큰에만 브랜드가 있는지 (파이썬 `_brand_in_subdomain` 미러).
  _SubHit? _brandInSubdomain(List<String> subTokens) {
    for (final tok in subTokens) {
      for (final brand in config.knownBrands) {
        if (tok == brand || (brand.length >= 4 && tok.contains(brand))) {
          return _SubHit(brand, tok);
        }
      }
    }
    return null;
  }

  /// 파이썬 `str.isalnum()` 미러 — 유니코드 문자/숫자(키릴 등 포함)까지 alnum 으로 본다.
  bool _isAlnum(String s) => RegExp(r'^[\p{L}\p{N}]+$', unicode: true).hasMatch(s);

  int _countDigits(String s) {
    var n = 0;
    for (final code in s.runes) {
      if (code >= 0x30 && code <= 0x39) n++;
    }
    return n;
  }

  int _min(int a, int b) => a < b ? a : b;

  /// 편집 거리 — 코드포인트(runes) 기준으로 파이썬과 동일하게 계산.
  int _levenshtein(String a, String b) {
    if (a == b) return 0;
    final ar = a.runes.toList();
    final br = b.runes.toList();
    if (ar.isEmpty) return br.length;
    if (br.isEmpty) return ar.length;
    var prev = List<int>.generate(br.length + 1, (i) => i);
    for (var i = 1; i <= ar.length; i++) {
      final cur = <int>[i];
      for (var j = 1; j <= br.length; j++) {
        final cost = ar[i - 1] == br[j - 1] ? 0 : 1;
        final del = prev[j] + 1;
        final ins = cur[j - 1] + 1;
        final sub = prev[j - 1] + cost;
        cur.add(_min(_min(del, ins), sub));
      }
      prev = cur;
    }
    return prev[br.length];
  }
}

class _BrandHit {
  const _BrandHit(this.type, this.brand, this.token, this.distance);
  final String type; // 'impersonation' | 'typosquatting'
  final String brand;
  final String token;
  final int distance;
}

class _SubHit {
  const _SubHit(this.brand, this.token);
  final String brand;
  final String token;
}

/// URL 이면 스킴을 보정한 뒤 호스트만 추출(소문자). userinfo(@)·경로·쿼리·포트 제거.
/// 파이썬 `urlparse(...).hostname` / 게이트웨이 `hostOf` 와 동일한 결과를 결정적으로 재현한다.
String hostOf(String target) {
  var v = target.trim();
  final scheme = v.indexOf('://');
  if (scheme >= 0) v = v.substring(scheme + 3);
  final at = v.indexOf('@');
  if (at >= 0) v = v.substring(at + 1);
  final slash = v.indexOf('/');
  if (slash >= 0) v = v.substring(0, slash);
  final query = v.indexOf('?');
  if (query >= 0) v = v.substring(0, query);
  final colon = v.indexOf(':');
  if (colon >= 0) v = v.substring(0, colon);
  return v.toLowerCase();
}

/// 게이트웨이 `recommend()` 미러 — 오프라인 판정용 실행 권고(조직 정보 없음).
String recommendFor(String kind, Grade grade) {
  final action = switch (kind) {
    'phone' => '전화를 받지 말고 응답·송금하지 마세요',
    'account' => '이 계좌로 절대 송금하지 마세요',
    _ => '링크를 누르지 말고 개인정보·인증번호를 입력하지 마세요',
  };
  return switch (grade) {
    Grade.danger => '🚨 위험 — $action.',
    Grade.warning => '⚠️ 주의 — 확인 전 $action.',
    Grade.caution => '의심 신호가 있습니다 — 조심하세요.',
    Grade.safe => '특이 위험 신호는 없습니다. 다만 항상 주의하세요.',
    Grade.unknown => '판정 정보가 부족합니다 — 조심하세요.',
  };
}
