import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import 'models.dart';

/// 게이트웨이 호출 실패를 사용자 친화적 메시지로 감싼 예외.
class ApiException implements Exception {
  const ApiException(this.message);
  final String message;

  @override
  String toString() => message;
}

/// ScamGraph 게이트웨이의 통합 판정 엔드포인트 `/api/check` 클라이언트.
///
/// "공용 두뇌, 얇은 클라이언트" 원칙에 따라, 이 앱은 이 엔드포인트 하나만 안다.
class ApiClient {
  ApiClient({http.Client? client, this.timeout = const Duration(seconds: 8)})
      : _client = client ?? http.Client();

  final http.Client _client;
  final Duration timeout;

  /// [value] (URL·전화번호·계좌)를 [baseUrl] 게이트웨이로 검사한다.
  ///
  /// 실패 시 [ApiException] 을 던진다.
  Future<CheckResult> check(String baseUrl, String value) async {
    final trimmedValue = value.trim();
    if (trimmedValue.isEmpty) {
      throw const ApiException('검사할 값을 입력하세요.');
    }

    final normalizedBase = _normalizeBaseUrl(baseUrl);
    final uri = Uri.parse('$normalizedBase/api/check')
        .replace(queryParameters: {'value': trimmedValue});

    final http.Response response;
    try {
      response = await _client.get(uri).timeout(timeout);
    } on TimeoutException {
      throw ApiException('게이트웨이 응답 시간 초과 — $normalizedBase 를 확인하세요.');
    } catch (_) {
      throw ApiException('게이트웨이에 연결할 수 없습니다 — $normalizedBase');
    }

    if (response.statusCode != 200) {
      throw ApiException('게이트웨이 오류 (HTTP ${response.statusCode})');
    }

    final Map<String, dynamic> body;
    try {
      final decoded = jsonDecode(utf8.decode(response.bodyBytes));
      if (decoded is! Map<String, dynamic>) {
        throw const FormatException('예상치 못한 응답 형식');
      }
      body = decoded;
    } catch (_) {
      throw const ApiException('게이트웨이 응답을 해석할 수 없습니다.');
    }

    return CheckResult.fromJson(body, checkedAt: DateTime.now());
  }

  static String _normalizeBaseUrl(String baseUrl) {
    var url = baseUrl.trim();
    while (url.endsWith('/')) {
      url = url.substring(0, url.length - 1);
    }
    return url;
  }

  void close() => _client.close();
}
