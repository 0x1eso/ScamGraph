/// 규칙 엔진 보조 신호 — 파이썬 `app/signals/{confusables,url_signals}.py` 미러.
///
/// 모두 순수 함수(네트워크 무접촉). `quick_assess` 가 즉시 호출한다.
///
/// ⚠️ 이식 한계: [decodeIdna] 는 퓨니코드(xn--) 유니코드 디코드를 하지 않는다(Dart 표준
/// 라이브러리에 punycode 디코더 없음). 원시 유니코드 혼동문자(키릴/그리스/전각)는 완전 지원되며,
/// `xn--` 도메인은 `homograph` 규칙(+35)으로만 잡힌다. eTLD+1 은 전체 PSL 대신 국내외 주요
/// 멀티파트 접미사 집합으로 근사한다(파이썬은 tldextract 사용).
library;

// ===== 혼동 문자(confusables) =====

/// 비ASCII 룩얼라이크 → ASCII 코드포인트. 강한 시각적 동일성만(오탐 최소화).
/// 파이썬 `_CONFUSABLE_MAP` 미러 + 전각(U+FF01..U+FF5E) 범위.
final Map<int, int> _confusableMap = _buildConfusableMap();

Map<int, int> _buildConfusableMap() {
  const pairs = <String, String>{
    // 키릴 소문자
    'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c',
    'у': 'y', 'х': 'x', 'ѕ': 's', 'і': 'i', 'ј': 'j',
    'ԁ': 'd', 'һ': 'h', 'қ': 'k', 'к': 'k', 'м': 'm',
    'н': 'h', 'т': 't', 'в': 'b', 'ґ': 'r', 'є': 'e',
    'ԛ': 'q', 'ա': 'w',
    // 키릴 대문자
    'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M',
    'Н': 'H', 'О': 'O', 'Р': 'P', 'С': 'C', 'Т': 'T',
    'Х': 'X', 'У': 'Y', 'І': 'I', 'Ј': 'J', 'Ѕ': 'S',
    // 그리스 소문자
    'ο': 'o', 'α': 'a', 'ν': 'v', 'ρ': 'p', 'ι': 'i',
    'κ': 'k', 'τ': 't', 'υ': 'u', 'χ': 'x', 'ε': 'e',
    'ϲ': 'c', 'γ': 'y', 'ω': 'w', 'μ': 'u',
    // 그리스 대문자
    'Α': 'A', 'Β': 'B', 'Ε': 'E', 'Ζ': 'Z', 'Η': 'H',
    'Ι': 'I', 'Κ': 'K', 'Μ': 'M', 'Ν': 'N', 'Ο': 'O',
    'Ρ': 'P', 'Τ': 'T', 'Υ': 'Y', 'Χ': 'X',
    // 기타 라틴 확장 룩얼라이크
    'ı': 'i', 'ɡ': 'g', 'ӏ': 'l', 'ⅼ': 'l', 'ⅰ': 'i',
  };
  final map = <int, int>{};
  pairs.forEach((from, to) => map[from.runes.first] = to.runes.first);
  // 전각(fullwidth) 아스키: U+FF01..U+FF5E → U+0021..U+007E.
  for (var c = 0xFF01; c < 0xFF5F; c++) {
    map[c] = c - 0xFEE0;
  }
  return map;
}

/// 비ASCII 룩얼라이크를 ASCII 대응 문자로 접은 소문자 스켈레톤.
String confusableSkeleton(String s) {
  final sb = StringBuffer();
  for (final r in s.runes) {
    sb.writeCharCode(_confusableMap[r] ?? r);
  }
  return sb.toString().toLowerCase();
}

/// 라틴 + (키릴|그리스)가 한 문자열에 섞였는지 — 전형적 IDN 호모그래프 공격.
bool isMixedScript(String s) {
  var hasLatin = false;
  var hasConfusableScript = false;
  for (final o in s.runes) {
    if ((o >= 0x41 && o <= 0x5A) || (o >= 0x61 && o <= 0x7A)) {
      hasLatin = true;
    } else if ((o >= 0x0400 && o <= 0x04FF) || (o >= 0x0370 && o <= 0x03FF)) {
      hasConfusableScript = true; // 키릴 또는 그리스
    }
  }
  return hasLatin && hasConfusableScript;
}

/// 퓨니코드(xn--) 라벨 디코드 — Dart 표준 라이브러리에 punycode 디코더가 없어 원본을 반환한다.
/// (이식 한계: 원시 유니코드 위장은 완전 지원, xn-- 는 homograph 규칙으로만 처리.)
String decodeIdna(String host) => host;

/// 호스트에 혼동 문자(룩얼라이크)나 혼합 스크립트가 있는지 — homoglyph 신호.
bool isConfusableHost(String host) {
  final decoded = decodeIdna(host);
  return isMixedScript(decoded) ||
      (confusableSkeleton(decoded) != decoded.toLowerCase());
}

// ===== URL 구조 신호(url_signals) =====

/// 알려진 URL 단축 서비스(등록 도메인 기준). 파이썬 `SHORTENERS` 미러.
const Set<String> kShorteners = {
  // 글로벌
  'bit.ly', 'tinyurl.com', 'is.gd', 't.co', 'goo.gl', 'ow.ly', 'buff.ly',
  'rebrand.ly', 'cutt.ly', 'rb.gy', 't.ly', 'v.gd', 'shorturl.at', 'bit.do',
  'adf.ly', 'tiny.cc', 'lnkd.in', 's.id', 'u.to', 'x.co', 'soo.gd',
  'clck.ru', 'shrtco.de', 'qr.ae', '1link.in', 'trib.al',
  // 국내
  'han.gl', 'buly.kr', 'me2.do', 'url.kr', 'vo.la', 'kko.to', 'c11.kr',
  'durl.kr', 'muz.so', 'abr.ge', 'aha.io', 'kko.kr',
};

/// 국내외 주요 멀티파트 eTLD 접미사(전체 PSL 근사). tldextract 대체.
const Set<String> _multiSuffixes = {
  'co.kr', 'go.kr', 'or.kr', 'ne.kr', 're.kr', 'pe.kr', 'ac.kr', 'hs.kr',
  'ms.kr', 'es.kr', 'kg.kr', 'mil.kr', 'com.au', 'net.au', 'org.au', 'co.uk',
  'org.uk', 'gov.uk', 'ac.uk', 'co.jp', 'or.jp', 'ne.jp', 'go.jp', 'ac.jp',
  'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'com.br', 'com.tw', 'co.in', 'co.nz',
  'co.za', 'com.sg', 'com.hk', 'com.mx', 'com.ru',
};

/// (subdomain, domain, suffix, registeredDomain) — 파이썬 `_registrable` 미러(근사 eTLD+1).
class Registrable {
  const Registrable(this.subdomain, this.domain, this.suffix, this.registeredDomain);
  final String subdomain;
  final String domain;
  final String suffix;
  final String registeredDomain;
}

Registrable registrable(String host) {
  final labels = host.isEmpty ? const <String>[] : host.split('.');
  if (labels.length >= 3) {
    final last2 = labels.sublist(labels.length - 2).join('.');
    if (_multiSuffixes.contains(last2)) {
      final domain = labels[labels.length - 3];
      final sub = labels.sublist(0, labels.length - 3).join('.');
      return Registrable(sub, domain, last2, '$domain.$last2');
    }
  }
  if (labels.length >= 2) {
    final suffix = labels.last;
    final domain = labels[labels.length - 2];
    final sub = labels.sublist(0, labels.length - 2).join('.');
    return Registrable(sub, domain, suffix, '$domain.$suffix');
  }
  return Registrable('', host, '', host);
}

bool isShortener(String registeredDomain, String host) =>
    kShorteners.contains(registeredDomain) || kShorteners.contains(host);

final RegExp _doublePct = RegExp(r'%25[0-9a-fA-F]{2}', caseSensitive: false);

/// 이중/중첩 퍼센트 인코딩(%25XX) — 필터 우회·목적지 은폐.
bool hasDoubleEncoding(String target) => _doublePct.hasMatch(target);

/// 80/443 이 아닌 명시적 포트를 쓰면 그 포트 번호를 반환, 아니면 null.
int? nonstandardPort(String target) {
  var s = target;
  final scheme = s.indexOf('://');
  if (scheme >= 0) s = s.substring(scheme + 3);
  final end = s.indexOf(RegExp(r'[/?#]'));
  final authority = end >= 0 ? s.substring(0, end) : s;
  final at = authority.lastIndexOf('@');
  final hostPort = at >= 0 ? authority.substring(at + 1) : authority;
  // IPv6 대괄호는 다루지 않는다(코퍼스 밖).
  final colon = hostPort.lastIndexOf(':');
  if (colon < 0) return null;
  final port = int.tryParse(hostPort.substring(colon + 1));
  if (port == null || port == 80 || port == 443) return null;
  return port;
}

final RegExp _dottedDecimal = RegExp(r'^[0-9]+(\.[0-9]+){3}$');
final RegExp _hexHost = RegExp(r'^0x[0-9a-fA-F]+$');
final RegExp _dottedHex = RegExp(r'^(0x[0-9a-fA-F]+\.){1,3}0x[0-9a-fA-F]+$');
final RegExp _bigDecimal = RegExp(r'^[0-9]{5,10}$');

/// 호스트가 IP 표기인지와 형태("dotted"|"decimal"|"hex")를 반환, 아니면 null.
String? ipRepresentation(String host) {
  if (host.isEmpty) return null;
  if (_dottedDecimal.hasMatch(host)) return 'dotted';
  if (_hexHost.hasMatch(host) || _dottedHex.hasMatch(host)) return 'hex';
  if (_bigDecimal.hasMatch(host)) {
    final value = int.tryParse(host);
    if (value != null && value >= 0 && value <= 0xFFFFFFFF) return 'decimal';
  }
  return null;
}
