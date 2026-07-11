/// 스미싱/공유 텍스트에서 검사 대상(URL·전화번호)을 뽑아내는 헬퍼.
///
/// 사기 문자는 탐지를 피하려 링크를 무해화(defang)한다:
/// `hxxp://`, `hxxps://`, `[.]`, `(.)`, `[dot]` 등. 검사 전에 원형으로 복원(refang)한다.
library;

/// 무해화된 링크를 원형으로 복원한다. (`hxxp`→`http`, `[.]`→`.`, `[dot]`→`.` …)
String refang(String input) {
  var s = input;
  // 스킴 위장: hxxp / hxxps / h**p (대소문자 무시).
  s = s.replaceAll(RegExp(r'h[xX*]{2}ps', caseSensitive: false), 'https');
  s = s.replaceAll(RegExp(r'h[xX*]{2}p', caseSensitive: false), 'http');
  // 점 위장: [.] (.) {.} [dot] (dot) " dot ".
  s = s.replaceAll(RegExp(r'[\[\(\{]\s*\.\s*[\]\)\}]'), '.');
  s = s.replaceAll(RegExp(r'[\[\(\{]\s*dot\s*[\]\)\}]', caseSensitive: false), '.');
  s = s.replaceAll(RegExp(r'\s+dot\s+', caseSensitive: false), '.');
  // 콜론/슬래시 위장.
  s = s.replaceAll(RegExp(r'[\[\(]\s*:\s*[\]\)]'), ':');
  s = s.replaceAll('[/]', '/');
  return s;
}

/// URL 후보를 추출하는 정규식 (스킴 유무 무관).
final RegExp _urlPattern = RegExp(
  r'((https?://)?[a-zA-Z0-9가-힣]([a-zA-Z0-9가-힣\-]*\.)+[a-zA-Z]{2,}(:[0-9]+)?(/[^\s]*)?)',
  caseSensitive: false,
);

/// 전화번호 후보 (한국/국제형).
final RegExp _phonePattern = RegExp(r'(\+?\d[\d\-\s]{7,}\d)');

/// 공유/문자 텍스트에서 가장 검사 가치가 높은 단일 값을 뽑는다.
///
/// 우선순위: URL → 전화번호 → 원문(trim). refang 을 먼저 적용한다.
String extractShared(String raw) {
  final refanged = refang(raw).trim();
  if (refanged.isEmpty) return refanged;

  final url = _urlPattern.firstMatch(refanged);
  if (url != null) return url.group(0)!.trim();

  final phone = _phonePattern.firstMatch(refanged);
  if (phone != null) return phone.group(0)!.replaceAll(RegExp(r'\s'), '').trim();

  return refanged;
}

/// 텍스트에서 URL·전화번호 후보를 모두 추출한다(중복 제거). SMS 다중 링크 대응.
List<String> extractAllCandidates(String raw) {
  final refanged = refang(raw);
  final seen = <String>{};
  final out = <String>[];

  for (final m in _urlPattern.allMatches(refanged)) {
    final v = m.group(0)!.trim();
    if (v.contains('.') && seen.add(v)) out.add(v);
  }
  for (final m in _phonePattern.allMatches(refanged)) {
    final v = m.group(0)!.replaceAll(RegExp(r'[\s\-]'), '').trim();
    if (v.length >= 9 && v.length <= 15 && seen.add(v)) out.add(v);
  }
  return out;
}
